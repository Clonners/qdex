#!/usr/bin/env node
import { Wallet, JsonRpcProvider, Contract, parseQuai, formatMixedCaseChecksumAddress } from 'quais';
import { config } from 'dotenv';
import { ethers } from 'ethers';

config();

const RPC = 'https://orchard.rpc.quai.network/cyprus1';
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const ADDR = formatMixedCaseChecksumAddress('0x005caddf8fe81f1ea33abf16db610cad0aad3267');

const WQUAI = formatMixedCaseChecksumAddress('0x005c46f661baef20671943f2b4c087df3e7ceb13');
const WQI = formatMixedCaseChecksumAddress('0x002b2596ecf05c93a31ff916e8b456df6c77c750');
const MARKET_REGISTRY = formatMixedCaseChecksumAddress('0x00793e6ac77dd2b895cc57eb90a7b3274d69353d');

const provider = new JsonRpcProvider(RPC, undefined, { usePathing: false });
const wallet = new Wallet(PK, provider);

const MARKET_ABI = [
  'function marketAuthority() view returns (address)',
  'function addMarket(address,address,uint8,uint8,uint256) returns (bytes32)',
  'function marketInfo(bytes32) view returns (tuple(address base,address quote,uint8 pricePrecision,uint8 amountPrecision,uint256 minAmount,bool enabled))',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function calcMarketId(base, quote) {
  // keccak256(abi.encode(base, quote))
  // abi.encode pads to 32 bytes each, so it's just concatenation of 20 bytes each with padding
  const data = '0x' + base.slice(2) + quote.slice(2);
  return ethers.utils.keccak256(data);
}

async function main() {
  console.log('=== Register WQUAI/WQI Market ===');
  
  const marketRegistry = new Contract(MARKET_REGISTRY, MARKET_ABI, wallet);
  
  const authority = await marketRegistry.marketAuthority();
  console.log('Market authority:', authority);
  console.log('Is deployer:', authority === ADDR ? '✅' : '❌');
  
  const marketId = calcMarketId(WQUAI, WQI);
  console.log('Market ID:', marketId);
  
  // Check if already exists
  try {
    const existing = await marketRegistry.marketInfo(marketId);
    if (existing.base && existing.base !== '0x0000000000000000000000000000000000000000') {
      console.log('\nMarket already registered!');
      console.log('  Base:', existing.base);
      console.log('  Quote:', existing.quote);
      console.log('  Enabled:', existing.enabled);
      return;
    }
  } catch (e) {
    console.log('Market does not exist yet.');
  }
  
  // Register market
  console.log('\nRegistering WQUAI/WQI market...');
  const tx = await marketRegistry.addMarket(
    WQUAI,      // base
    WQI,        // quote  
    8,          // pricePrecision
    6,          // amountPrecision
    parseQuai('0.01'),  // minAmount (0.01 WQUAI = 10000000000000)
  );
  console.log('TX sent:', tx.hash.substring(0, 20) + '...');
  
  // Wait for confirmation
  await sleep(30000);
  
  // Verify
  const info = await marketRegistry.marketInfo(marketId);
  console.log('\nMarket info:');
  console.log('  Base:', info.base);
  console.log('  Quote:', info.quote);
  console.log('  Price precision:', info.pricePrecision);
  console.log('  Amount precision:', info.amountPrecision);
  console.log('  Min amount:', info.minAmount.toString());
  console.log('  Enabled:', info.enabled);
  
  console.log('\n✅ Market WQUAI/WQI registered!');
  console.log('Market ID:', marketId);
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
