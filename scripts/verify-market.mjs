#!/usr/bin/env node
import { config } from 'dotenv';
import { Wallet, JsonRpcProvider, Contract, formatMixedCaseChecksumAddress, keccak256, toBeHex, zeroPadValue, concat } from 'quais';
import { readFileSync } from 'node:fs';

config();

const deploy = JSON.parse(readFileSync('./contracts/deployment-addresses.json', 'utf8'));
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

const provider = new JsonRpcProvider('https://orchard.rpc.quai.network/cyprus1', undefined, { usePathing: false });
const wallet = new Wallet(privateKey, provider);

const mrAddress = formatMixedCaseChecksumAddress(deploy.contracts.Settlement.subContracts.marketRegistry);

const mrABI = [
  'function marketInfo(bytes32) view returns (tuple(address base,address quote,uint8 pricePrecision,uint8 amountPrecision,uint256 minAmount,bool enabled))',
];
const mr = new Contract(mrAddress, mrABI, wallet);

// Read tx logs
const txHash = '0x00630046f3037a2ea0475eef0ee1d9f35ec7dd09fea6bf83fe8828f47b6473ca';
const receipt = await provider.getTransactionReceipt(txHash);

console.log('=== TX Receipt Analysis ===\n');
console.log('Block:', receipt.blockNumber);
console.log('Status:', receipt.status);
console.log('Logs:', receipt.logs.length);

if (receipt.logs && receipt.logs.length > 0) {
  for (const log of receipt.logs) {
    console.log('\nLog:', log);
    if (log.topics && log.topics.length > 0) {
      console.log('  Topic 0 (event signature):', log.topics[0]);
      console.log('  Topic 1 (marketId):', log.topics[1]);
    }
  }
}
