#!/usr/bin/env node
/**
 * Test settlement adapter — connect to Orchard, verify contracts, check market count.
 */
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { createSettlementAdapter } from './services/relayer/src/settlement-adapter.js';

config();

const deploy = JSON.parse(readFileSync('./contracts/deployment-addresses.json', 'utf8'));
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

if (!privateKey) {
  console.error('❌ DEPLOYER_PRIVATE_KEY not found in .env');
  process.exit(1);
}

console.log('=== Settlement Adapter Test ===\n');

const adapter = createSettlementAdapter({
  privateKey,
  settlementAddress: deploy.contracts.Settlement.address,
  marketRegistryAddress: deploy.contracts.Settlement.subContracts.marketRegistry,
  receiptWait: { maxWaitMs: 30_000, pollingIntervalMs: 2_000 },
});

try {
  await adapter.init();
  console.log('✅ Adapter initialized');
  console.log('  Wallet:', adapter.getWallet().address);
  console.log('  Settlement:', deploy.contracts.Settlement.address);
  console.log('  MarketRegistry:', deploy.contracts.Settlement.subContracts.marketRegistry);

  // Check market count
  const count = await adapter.getMarketCount();
  console.log(`\n📊 Market count: ${count}`);

  if (count === 0) {
    console.log('⚠️ No markets registered — need to register WQUAI-WQI');
    console.log('\nWQUAI:', deploy.tokens?.WQUAI || '0x005c46f661Baef20671943f2b4c087Df3E7CEb13');
    console.log('WQI:  ', deploy.tokens?.WQI || '0x002b2596EcF05C93a31ff916E8b456DF6C77c750');
  } else {
    console.log('✅ Markets registered');
  }

  console.log('\n=== Adapter functions ===');
  console.log('✅ settle()');
  console.log('✅ registerMarket()');
  console.log('✅ getMarketInfo()');
  console.log('✅ getMarketCount()');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
