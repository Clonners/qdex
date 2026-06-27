#!/usr/bin/env node
/**
 * Register WQUAI-WQI market on Orchard MarketRegistry.
 */
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { createSettlementAdapter } from '../services/relayer/src/settlement-adapter.js';

config();

const deploy = JSON.parse(readFileSync('./contracts/deployment-addresses.json', 'utf8'));
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

const WQUAI = deploy.tokens?.WQUAI || '0x005c46f661Baef20671943f2b4c087Df3E7CEb13';
const WQI = deploy.tokens?.WQI || '0x002b2596EcF05C93a31ff916E8b456DF6C77c750';

console.log('=== Register WQUAI-WQI Market ===\n');
console.log('WQUAI:', WQUAI);
console.log('WQI:  ', WQI);
console.log('MarketRegistry:', deploy.contracts.Settlement.subContracts.marketRegistry);

const adapter = createSettlementAdapter({
  privateKey,
  settlementAddress: deploy.contracts.Settlement.address,
  marketRegistryAddress: deploy.contracts.Settlement.subContracts.marketRegistry,
  receiptWait: { maxWaitMs: 60_000, pollingIntervalMs: 2_000 },
});

try {
  await adapter.init();

  // Check existing markets
  const count = await adapter.getMarketCount();
  console.log(`\nCurrent market count: ${count}`);

  // Register market: base=WQUAI, quote=WQI
  console.log('\nRegistering WQUAI-WQI market...');
  const result = await adapter.registerMarket(
    WQUAI,
    WQI,
    8,      // pricePrecision - 8 decimal places for price
    6,      // amountPrecision - 6 decimal places for amount
    '1000000' // minAmount - 0.001 WQUAI minimum
  );

  console.log('\n✅ Market registered!');
  console.log('  TX:', result.txHash);
  console.log('  Block:', result.receipt?.blockNumber);
  console.log('  Gas:', result.receipt?.gasUsed?.toString());
  console.log('  Explorer:', `https://orchard.quaiscan.io/tx/${result.txHash}`);

  // Verify
  const newCount = await adapter.getMarketCount();
  console.log(`\nNew market count: ${newCount}`);

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
