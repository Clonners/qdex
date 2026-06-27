#!/usr/bin/env node
/**
 * Test QDEX Settlement
 * 
 * Creates a test order, signs it, and executes settlement
 */

import { 
  Wallet, 
  JsonRpcProvider, 
  Contract, 
  parseQuai, 
  formatQuai, 
  parseUnits,
  formatUnits,
  formatMixedCaseChecksumAddress,
  keccak256,
  solidityPacked,
  Mnemonic,
  QuaiHDWallet,
  Zone
} from 'quais';
import { config } from 'dotenv';
import { ethers } from 'ethers';

config();

const RPC = 'https://orchard.rpc.quai.network/cyprus1';
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const ADDR = formatMixedCaseChecksumAddress('0x005caddf8fe81f1ea33abf16db610cad0aad3267');

// Token addresses
const WQUAI = formatMixedCaseChecksumAddress('0x005c46f661baef20671943f2b4c087df3e7ceb13');
const WQI = formatMixedCaseChecksumAddress('0x002b2596ecf05c93a31ff916e8b456df6c77c750');

// Contract addresses
const SETTLEMENT = formatMixedCaseChecksumAddress('0x00497118fAA729aC1d981c680080d7428fE8a4Bd');
const VAULT = formatMixedCaseChecksumAddress('0x002325d071d57bafd3169f270a71b67a05360abf');
const FEE_MANAGER = formatMixedCaseChecksumAddress('0x005a069df8705f4c47f3cd924ad9b8f39517f383');

// Market ID
const MARKET_ID = '0xc9160def9f9681b77acdccf0caeda5701a190f9a034bf694595796b03350ef9b';

const provider = new JsonRpcProvider(RPC, undefined, { usePathing: false });
const wallet = new Wallet(PK, provider);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('=== QDEX Settlement Test ===');
  
  // Check current balances
  console.log('\n1. Current Balances:');
  const wquai = new Contract(WQUAI, [
    'function balanceOf(address) view returns (uint256)'
  ], provider);
  const wqi = new Contract(WQI, [
    'function balanceOf(address) view returns (uint256)'
  ], provider);
  const vault = new Contract(VAULT, [
    'function availableBalanceOf(address,address) view returns (uint256)'
  ], provider);
  
  const wquaiWallet = await wquai.balanceOf(ADDR);
  const wqiWallet = await wqi.balanceOf(ADDR);
  const wquaiVault = await vault.availableBalanceOf(ADDR, WQUAI);
  const wqiVault = await vault.availableBalanceOf(ADDR, WQI);
  
  console.log(`  Wallet: ${formatQuai(wquaiWallet)} WQUAI, ${formatQuai(wqiWallet)} WQI`);
  console.log(`  Vault: ${formatQuai(wquaiVault)} WQUAI, ${formatQuai(wqiVault)} WQI`);
  
  // Check if we have enough in vault
  if (wquaiVault < parseQuai('1') || wqiVault < parseQuai('1')) {
    console.log('\n❌ Not enough funds in vault for settlement test');
    console.log('   Please run funding script first');
    return;
  }
  
  // Create a test order (self-trade for testing)
  console.log('\n2. Creating test order...');
  
  // Create a second wallet for taker (different address)
  // Derive from same mnemonic with different path
  const MNEMONIC = (process.env.DEPLOYER_MNEMONIC || '').replace(/['"]/g, '').trim();
  const mnemonic = Mnemonic.fromPhrase(MNEMONIC);
  const hdWallet = QuaiHDWallet.fromMnemonic(mnemonic);
  hdWallet.connect(provider);
  
  // Get different addresses from the HD wallet
  const makerAddr = await hdWallet.getNextAddress(0, Zone.Cyprus1);
  const takerAddr = await hdWallet.getNextAddress(1, Zone.Cyprus1);
  
  const maker = makerAddr.address;
  const taker = takerAddr.address;
  
  // Get private key for taker to sign
  const takerPk = await hdWallet.getPrivateKey(taker);
  const takerWallet = new Wallet(takerPk, provider);
  
  // Test amounts
  const testAmount = parseQuai('0.1'); // 0.1 WQUAI
  const testPrice = parseUnits('1', 18); // 1:1 price (1 WQUAI = 1 WQI)
  const testQuoteAmount = testAmount; // For 1:1 price, quote amount equals base amount
  
  // Order parameters
  const makerOrderHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-maker-order-1"));
  const takerOrderHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-taker-order-1"));
  
  const fillId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-fill-1"));
  
  // Fill packet structure (matching ISettlement.FillPacket)
  const fillPacket = {
    fillId: fillId,
    marketId: MARKET_ID,
    makerOrderHash: makerOrderHash,
    takerOrderHash: takerOrderHash,
    maker: maker,
    taker: taker,
    baseToken: WQUAI,
    quoteToken: WQI,
    price: testPrice,
    baseAmount: testAmount,
    quoteAmount: testQuoteAmount,
    makerFee: 0,
    takerFee: 0,
    makerNonce: 1,
    takerNonce: 2,
    expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    chainId: 15000n,
    settlementContract: SETTLEMENT,
    feeRecipient: ADDR, // We'll set this to our address for testing
    maxFeeBps: 100, // 1% max fee
    makerOrderAmount: testAmount,
    takerOrderAmount: testQuoteAmount,
    makerFilledAmount: testAmount,
    takerFilledAmount: testQuoteAmount
  };
  
  console.log('  Fill Packet:');
  console.log(`    Base: ${formatQuai(testAmount)} WQUAI`);
  console.log(`    Quote: ${formatQuai(testQuoteAmount)} WQI`);
  console.log(`    Price: ${formatUnits(testPrice, 18)}`);
  console.log(`    Maker: ${maker}`);
  console.log(`    Taker: ${taker}`);
  
  // Calculate fill hash
  const fillHash = await calculateFillHash(fillPacket);
  console.log(`    Fill Hash: ${fillHash}`);
  
  // Sign the fill hash (both maker and taker sign the same hash)
  const makerSignature = await wallet.signMessage(fillHash);
  const takerSignature = await wallet.signMessage(fillHash);
  
  console.log(`    Maker Signature: ${makerSignature.substring(0, 20)}...`);
  console.log(`    Taker Signature: ${takerSignature.substring(0, 20)}...`);
  
  // Execute settlement
  console.log('\n3. Executing settlement...');
  
  const settlement = new Contract(SETTLEMENT, [
    'function settle(tuple(bytes32 fillId,bytes32 marketId,bytes32 makerOrderHash,bytes32 takerOrderHash,address maker,address taker,address baseToken,address quoteToken,uint256 price,uint256 baseAmount,uint256 quoteAmount,uint256 makerFee,uint256 takerFee,uint256 makerNonce,uint256 takerNonce,uint256 expiresAt,uint256 chainId,address settlementContract,address feeRecipient,uint256 maxFeeBps,uint256 makerOrderAmount,uint256 takerOrderAmount,uint256 makerFilledAmount,uint256 takerFilledAmount) fill,bytes makerSignature,bytes takerSignature)',
    'function hashFill(tuple(bytes32 fillId,bytes32 marketId,bytes32 makerOrderHash,bytes32 takerOrderHash,address maker,address taker,address baseToken,address quoteToken,uint256 price,uint256 baseAmount,uint256 quoteAmount,uint256 makerFee,uint256 takerFee,uint256 makerNonce,uint256 takerNonce,uint256 expiresAt,uint256 chainId,address settlementContract,address feeRecipient,uint256 maxFeeBps,uint256 makerOrderAmount,uint256 takerOrderAmount,uint256 makerFilledAmount,uint256 takerFilledAmount)) view returns (bytes32)'
  ], wallet);
  
  try {
    const tx = await settlement.settle(
      fillPacket,
      makerSignature,
      takerSignature,
      { gasLimit: 500000 }
    );
    console.log(`  ✅ Settlement TX: ${tx.hash.substring(0, 20)}...`);
    
    // Wait for confirmation
    await sleep(30000);
    
    // Check final balances
    console.log('\n4. Final Balances:');
    const finalWquaiVault = await vault.availableBalanceOf(ADDR, WQUAI);
    const finalWqiVault = await vault.availableBalanceOf(ADDR, WQI);
    
    console.log(`  Vault WQUAI: ${formatQuai(finalWquaiVault)}`);
    console.log(`  Vault WQI: ${formatQuai(finalWqiVault)}`);
    
    console.log('\n✅ Settlement test completed!');
    
  } catch (e) {
    console.log(`  ❌ Settlement failed: ${e.message}`);
    
    // Try to decode error
    if (e.message.includes('revert')) {
      console.log('\n  Common issues:');
      console.log('  - Self-trade protection enabled?');
      console.log('  - Market not registered?');
      console.log('  - Insufficient vault balance?');
    }
  }
}

async function calculateFillHash(fill) {
  // Hash fill identity
  const identityHash = keccak256(
    solidityPacked(
      ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'address', 'address', 'address', 'address'],
      [
        fill.fillId,
        fill.marketId,
        fill.makerOrderHash,
        fill.takerOrderHash,
        fill.maker,
        fill.taker,
        fill.baseToken,
        fill.quoteToken
      ]
    )
  );
  
  // Hash fill replay protection
  const replayHash = keccak256(
    solidityPacked(
      ['uint256', 'uint256', 'uint256', 'uint256', 'address'],
      [
        fill.makerNonce,
        fill.takerNonce,
        fill.expiresAt,
        fill.chainId,
        fill.settlementContract
      ]
    )
  );
  
  // Hash fill economics (correct field order from ISettlement)
  const economicsHash = keccak256(
    solidityPacked(
      ['uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
      [
        fill.price,
        fill.baseAmount,
        fill.quoteAmount,
        fill.makerFee,
        fill.takerFee,
        fill.feeRecipient,
        fill.maxFeeBps,
        fill.makerOrderAmount,
        fill.takerOrderAmount,
        fill.makerFilledAmount,
        fill.takerFilledAmount
      ]
    )
  );
  
  // Final fill hash
  return keccak256(
    solidityPacked(
      ['bytes32', 'bytes32', 'bytes32'],
      [identityHash, replayHash, economicsHash]
    )
  );
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
