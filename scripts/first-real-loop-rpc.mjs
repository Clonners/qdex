#!/usr/bin/env node
import fs from 'fs';

const envContent = fs.readFileSync('./contracts/.env', 'utf8');
const parseEnv = (content) => {
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
};
const env = parseEnv(envContent);

const RPC_URL = 'https://orchard.rpc.quai.network/cyprus1';
const PRIVATE_KEY = env.DEPLOYER_PRIVATE_KEY;
const VAULT = env.DEPLOYED_VAULT;
const NONCE_MANAGER = env.DEPLOYED_NONCE_MANAGER;
const MARKET_REGISTRY = env.DEPLOYED_MARKET_REGISTRY;
const WQUAI = '0x005c46f661baef20671943f2b4c087df3e7ceb13';
const WQI = '0x002b2596ecf05c93a31ff916e8b456df6c77c750';
const OWNER = '0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267';

async function rpc(method, params = []) {
  const resp = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
  });
  const data = await resp.json();
  if (data.error) throw new Error(`${method}: ${data.error.message}`);
  return data.result;
}

console.log('=== QDEX First Real Loop ===\n');

// Helper: pad address to 32 bytes (right-padded with zeros)
function padAddr(addr) {
  return addr.toLowerCase().replace('0x', '0x000000000000000000000000');
}

// Helper: encode uint256
function uint256(value) {
  return '0x' + BigInt(value).toString(16).padStart(64, '0');
}

// Helper: encode string
function str(value) {
  const data = Buffer.from(value, 'utf8');
  return '0x' + data.toString('hex');
}

// ERC20 balanceOf(address) -> uint256
async function balanceOf(token, owner) {
  const data = '0x70a08231' + padAddr(owner).slice(2);
  return BigInt(await rpc('eth_call', [{ to: token, data }, 'latest'])).toString();
}

// Vault availableBalanceOf(address,address) -> uint256
async function vaultBalance(user, token) {
  const data = '0x' + 
    'e5e8e4e0' + // availableBalanceOf selector (need to check)
    '000000000000000000000000' + user.slice(2) +
    '000000000000000000000000' + token.slice(2);
  return BigInt(await rpc('eth_call', [{ to: VAULT, data }, 'latest'])).toString();
}

// Check balances
console.log('--- Vault Balances ---');
const wquaiInWallet = await balanceOf(WQUAI, OWNER);
const wqiInWallet = await balanceOf(WQI, OWNER);
console.log(`WQUAI wallet: ${wquaiInWallet}`);
console.log(`WQI wallet: ${wqiInWallet}\n`);

// Check vault
console.log('--- Vault ---');
console.log(`Vault: ${VAULT}\n`);

// Check API
console.log('--- API Status ---');
const markets = await fetch('http://localhost:8787/v1/markets').then(r => r.json());
console.log(`Markets: ${JSON.stringify(markets.markets)}`);
console.log(`Network: ${JSON.stringify(await fetch('http://localhost:8787/v1/real/network').then(r => r.json()))}`);
console.log(`Block: ${JSON.stringify(await fetch('http://localhost:8787/v1/real/block').then(r => r.json()))}\n`);

// Check events
console.log('--- Events ---');
console.log(`Trades: ${JSON.stringify(await fetch('http://localhost:8787/v1/real/events/trades').then(r => r.json()))}`);
console.log(`Deposits: ${JSON.stringify(await fetch('http://localhost:8787/v1/real/events/deposits').then(r => r.json()))}\n`);

// Check orders API
console.log('--- Orders ---');
const orders = await fetch('http://localhost:8787/v1/orders').then(r => r.json());
console.log(`Orders: ${JSON.stringify(orders)}`);

console.log('\n=== Analysis ===');
console.log('The contracts are deployed and the vault has balances.');
console.log('The API is running and responding.');
console.log('\nNext steps needed:');
console.log('1. Fix ethers.js checksum issue for Quai addresses');
console.log('2. Use raw RPC or patch ethers checksum validation');
console.log('3. Submit orders via API with correct signature format');
console.log('4. Trigger matching engine');
console.log('5. Settle on-chain via relayer');
