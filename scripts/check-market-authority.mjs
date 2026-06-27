#!/usr/bin/env node
/**
 * Check MarketRegistry authority and contract state.
 */
import { config } from 'dotenv';
import { Wallet, JsonRpcProvider, Contract, formatMixedCaseChecksumAddress } from 'quais';
import { readFileSync } from 'node:fs';

config();

const deploy = JSON.parse(readFileSync('./contracts/deployment-addresses.json', 'utf8'));
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

const provider = new JsonRpcProvider('https://orchard.rpc.quai.network/cyprus1', undefined, { usePathing: false });
const wallet = new Wallet(privateKey, provider);

const mrAddress = formatMixedCaseChecksumAddress(deploy.contracts.Settlement.subContracts.marketRegistry);

// Check MarketRegistry
const mrABI = [
  'function marketAuthority() view returns (address)',
  'function pendingMarketAuthority() view returns (address)',
  'function addMarket(address,address,uint8,uint8,uint256) returns (bytes32)',
];
const mr = new Contract(mrAddress, mrABI, wallet);

console.log('=== MarketRegistry Check ===\n');
console.log('Wallet:', wallet.address);
console.log('MarketRegistry:', mrAddress);

const authority = await mr.marketAuthority();
console.log('MarketAuthority:', authority);

if (authority.toLowerCase() === wallet.address.toLowerCase()) {
  console.log('✅ You ARE the market authority!');
} else {
  console.log('❌ You are NOT the market authority');
  console.log('  Need to transfer authority first or deploy new MarketRegistry');
}
