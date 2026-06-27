#!/usr/bin/env node
import { ethers } from 'ethers';
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
const VAULT_ADDRESS = env.DEPLOYED_VAULT;
const NONCE_MANAGER = env.DEPLOYED_NONCE_MANAGER;
const MARKET_REGISTRY = env.DEPLOYED_MARKET_REGISTRY;
const WQUAI = '0x005c46f661baef20671943f2b4c087df3e7ceb13';
const WQI = '0x002b2596ecf05c93a31ff916e8b456df6c77c750';
const OWNER = env.DEPLOYER_ADDRESS || '0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267';

const provider = new ethers.JsonRpcProvider(RPC_URL);

const vaultABI = [
  'function balanceOf(address user, address token) view returns (uint256)',
  'function availableBalanceOf(address user, address token) view returns (uint256)',
  'function lockedBalanceOf(address user, address token) view returns (uint256)',
  'function settlementAuthority() view returns (address)'
];

const marketABI = [
  'function isMarketEnabled(string name) view returns (bool)',
  'function marketCount() view returns (uint256)'
];

const nonceABI = [
  'function nonces(address user) view returns (uint256)'
];

const vault = new ethers.Contract(VAULT_ADDRESS, vaultABI, provider);
const market = new ethers.Contract(MARKET_REGISTRY, marketABI, provider);
const nonce = new ethers.Contract(NONCE_MANAGER, nonceABI, provider);

console.log('=== QDEX State Check ===\n');
console.log('Vault:', VAULT_ADDRESS);
console.log('Market:', MARKET_REGISTRY);
console.log('NonceManager:', NONCE_MANAGER);
console.log('Owner:', OWNER, '\n');

console.log('--- Vault Balances ---');
console.log('WQUAI balance:', ethers.formatUnits(await vault.balanceOf(OWNER, WQUAI), 18));
console.log('WQUAI available:', ethers.formatUnits(await vault.availableBalanceOf(OWNER, WQUAI), 18));
console.log('WQUAI locked:', ethers.formatUnits(await vault.lockedBalanceOf(OWNER, WQUAI), 18));
console.log('WQI balance:', ethers.formatUnits(await vault.balanceOf(OWNER, WQI), 18));
console.log('WQI available:', ethers.formatUnits(await vault.availableBalanceOf(OWNER, WQI), 18));
console.log('WQI locked:', ethers.formatUnits(await vault.lockedBalanceOf(OWNER, WQI), 18));
console.log('Settlement authority:', await vault.settlementAuthority());

console.log('\n--- Market Registry ---');
console.log('WQUAI-WQI enabled:', await market.isMarketEnabled('WQUAI-WQI'));
console.log('Market count:', (await market.marketCount()).toString());

console.log('\n--- NonceManager ---');
console.log('Current nonce:', (await nonce.nonces(OWNER)).toString());

// Check events from contracts
console.log('\n--- Contract Events ---');
const block = await provider.getBlockNumber();
console.log('Current block:', block);

// Get logs for vault
const vaultLogs = await provider.getLogs({
  address: VAULT_ADDRESS,
  fromBlock: Math.max(0, block - 1000),
  toBlock: block
});
console.log('Vault logs (last 1000 blocks):', vaultLogs.length);
for (const log of vaultLogs.slice(0, 5)) {
  console.log('  Topic:', log.topics[0]?.substring(0, 10), 'Block:', log.blockNumber);
}
