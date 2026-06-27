#!/usr/bin/env node
/**
 * Complete QDEX Settlement Test
 * 
 * Deposits funds for both maker and taker, then executes settlement
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

const WQUAI = formatMixedCaseChecksumAddress('0x005c46f661baef20671943f2b4c087df3e7ceb13');
const WQI = formatMixedCaseChecksumAddress('0x002b2596ecf05c93a31ff916e8b456df6c77c750');
const SETTLEMENT = formatMixedCaseChecksumAddress('0x00497118fAA729aC1d981c680080d7428fE8a4Bd');
const VAULT = formatMixedCaseChecksumAddress('0x002325d071d57bafd3169f270a71b67a05360abf');

const MARKET_ID = '0xc9160def9f9681b77acdccf0caeda5701a190f9a034bf694595796b03350ef9b';

const provider = new JsonRpcProvider(RPC, undefined, { usePathing: false });
const wallet = new Wallet(PK, provider);

const sleep = ms => new Promise(r => setTimeout(r, ms));

const ERC20 = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)',
];

const VAULT_ABI = [
  'function deposit(address,uint256)',
  'function availableBalanceOf(address,address) view returns (uint256)',
];

const SETTLEMENT_ABI = [
  'function settle(tuple(bytes32 fillId,bytes32 marketId,bytes32 makerOrderHash,bytes32 takerOrderHash,address maker,address taker,address baseToken,address quoteToken,uint256 price,uint256 baseAmount,uint256 quoteAmount,uint256 makerFee,uint256 takerFee,uint256 makerNonce,uint256 takerNonce,uint256 expiresAt,uint256 chainId,address settlementContract,address feeRecipient,uint256 maxFeeBps,uint256 makerOrderAmount,uint256 takerOrderAmount,uint256 makerFilledAmount,uint256 takerFilledAmount) fill,bytes makerSignature,bytes takerSignature)',
];

async function main() {
  console.log('=== QDEX Settlement Test ===');
  
  // Create maker and taker wallets
  const MNEMONIC = (process.env.DEPLOYER_MNEMONIC || '').replace(/['"]/g, '').trim();
  const mnemonic = Mnemonic.fromPhrase(MNEMONIC);
  const hdWallet = QuaiHDWallet.fromMnemonic(mnemonic);
  hdWallet.connect(provider);
  
  const makerAddr = await hdWallet.getNextAddress(0, Zone.Cyprus1);
  const takerAddr = await hdWallet.getNextAddress(1, Zone.Cyprus1);
  
  const maker = makerAddr.address;
  const taker = takerAddr.address;
  
  const takerPk = await hdWallet.getPrivateKey(taker);
  const takerWallet = new Wallet(takerPk, provider);
  
  console.log('Maker:', maker);
  console.log('Taker:', taker);
  
  // Check if taker has funds in wallet
  const wquai = new Contract(WQUAI, ERC20, provider);
  const wqi = new Contract(WQI, ERC20, provider);
  
  const makerWquaiWallet = await wquai.balanceOf(maker);
  const makerWqiWallet = await wqi.balanceOf(maker);
  const takerWquaiWallet = await wquai.balanceOf(taker);
  const takerWqiWallet = await wqi.balanceOf(taker);
  
  console.log('\nMaker wallet balances:');
  console.log('  WQUAI:', formatQuai(makerWquaiWallet));
  console.log('  WQI:', formatQuai(makerWqiWallet));
  
  console.log('\nTaker wallet balances:');
  console.log('  WQUAI:', formatQuai(takerWquaiWallet));
  console.log('  WQI:', formatQuai(takerWqiWallet));
  
  // If taker has no funds, transfer some from maker
  if (takerWqiWallet < parseQuai('1')) {
    console.log('\nTransferring 2 WQI to taker...');
    const wqiContract = new Contract(WQI, ERC20, wallet);
    const tx = await wqiContract.transfer(taker, parseQuai('2'));
    console.log('Transfer TX:', tx.hash.substring(0, 20) + '...');
    await sleep(20000);
  }
  
  // Transfer QUAI for gas
  const takerBalance = await provider.getBalance(taker);
  console.log('Taker balance:', formatQuai(takerBalance));
  if (takerBalance < parseQuai('1')) {
    console.log('\n⚠️  Taker needs QUAI for gas. Please transfer 1 QUAI to:');
    console.log('   ', taker);
    console.log('   Skipping transfer for now...');
    await sleep(5000);
  }
  
  // Check vault balances
  const vault = new Contract(VAULT, VAULT_ABI, provider);
  
  const makerWquaiVault = await vault.availableBalanceOf(maker, WQUAI);
  const makerWqiVault = await vault.availableBalanceOf(maker, WQI);
  const takerWquaiVault = await vault.availableBalanceOf(taker, WQUAI);
  const takerWqiVault = await vault.availableBalanceOf(taker, WQI);
  
  console.log('\nMaker vault balances:');
  console.log('  WQUAI:', formatQuai(makerWquaiVault));
  console.log('  WQI:', formatQuai(makerWqiVault));
  
  console.log('\nTaker vault balances:');
  console.log('  WQUAI:', formatQuai(takerWquaiVault));
  console.log('  WQI:', formatQuai(takerWqiVault));
  
  // Deposit WQUAI for maker (sells WQUAI)
  if (makerWquaiVault < parseQuai('1')) {
    console.log('\nDepositing 2 WQUAI for maker...');
    const wquaiContract = new Contract(WQUAI, ERC20, wallet);
    await wquaiContract.approve(VAULT, parseQuai('100'));
    const vaultContract = new Contract(VAULT, VAULT_ABI, wallet);
    const tx = await vaultContract.deposit(WQUAI, parseQuai('2'));
    console.log('Deposit TX:', tx.hash.substring(0, 20) + '...');
    await sleep(20000);
  }
  
  // Deposit WQI for taker (buys WQUAI with WQI)
  if (takerWqiVault < parseQuai('1')) {
    console.log('\nDepositing 2 WQI for taker...');
    const wqiContract = new Contract(WQI, ERC20, takerWallet);
    await wqiContract.approve(VAULT, parseQuai('100'));
    const vaultContract = new Contract(VAULT, VAULT_ABI, takerWallet);
    const tx = await vaultContract.deposit(WQI, parseQuai('2'));
    console.log('Deposit TX:', tx.hash.substring(0, 20) + '...');
    await sleep(20000);
  }
  
  // Create fill packet
  const testAmount = parseQuai('0.1');
  const testPrice = parseUnits('1', 18);
  const testQuoteAmount = testAmount;
  
  const makerOrderHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('test-maker-order-1'));
  const takerOrderHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('test-taker-order-1'));
  const fillId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('test-fill-1'));
  
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
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    chainId: 15000n,
    settlementContract: SETTLEMENT,
    feeRecipient: maker,
    maxFeeBps: 100,
    makerOrderAmount: testAmount,
    takerOrderAmount: testQuoteAmount,
    makerFilledAmount: testAmount,
    takerFilledAmount: testQuoteAmount
  };
  
  // Calculate fill hash
  const identityHash = keccak256(
    solidityPacked(
      ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'address', 'address', 'address', 'address'],
      [
        fillPacket.fillId,
        fillPacket.marketId,
        fillPacket.makerOrderHash,
        fillPacket.takerOrderHash,
        fillPacket.maker,
        fillPacket.taker,
        fillPacket.baseToken,
        fillPacket.quoteToken
      ]
    )
  );
  
  const replayHash = keccak256(
    solidityPacked(
      ['uint256', 'uint256', 'uint256', 'uint256', 'address'],
      [
        fillPacket.makerNonce,
        fillPacket.takerNonce,
        fillPacket.expiresAt,
        fillPacket.chainId,
        fillPacket.settlementContract
      ]
    )
  );
  
  const economicsHash = keccak256(
    solidityPacked(
      ['uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
      [
        fillPacket.price,
        fillPacket.baseAmount,
        fillPacket.quoteAmount,
        fillPacket.makerFee,
        fillPacket.takerFee,
        fillPacket.feeRecipient,
        fillPacket.maxFeeBps,
        fillPacket.makerOrderAmount,
        fillPacket.takerOrderAmount,
        fillPacket.makerFilledAmount,
        fillPacket.takerFilledAmount
      ]
    )
  );
  
  const fillHash = keccak256(
    solidityPacked(
      ['bytes32', 'bytes32', 'bytes32'],
      [identityHash, replayHash, economicsHash]
    )
  );
  
  console.log('\nFill Hash:', fillHash);
  
  // Sign with both wallets
  const makerSignature = await wallet.signMessage(fillHash);
  const takerSignature = await takerWallet.signMessage(fillHash);
  
  console.log('Maker Signature:', makerSignature.substring(0, 20) + '...');
  console.log('Taker Signature:', takerSignature.substring(0, 20) + '...');
  
  // Execute settlement
  console.log('\nExecuting settlement...');
  const settlement = new Contract(SETTLEMENT, SETTLEMENT_ABI, wallet);
  
  try {
    const tx = await settlement.settle(
      fillPacket,
      makerSignature,
      takerSignature,
      { gasLimit: 500000 }
    );
    console.log('✅ Settlement TX:', tx.hash);
    
    await sleep(30000);
    
    // Check final vault balances
    console.log('\nFinal Vault Balances:');
    const finalMakerWquai = await vault.availableBalanceOf(maker, WQUAI);
    const finalMakerWqi = await vault.availableBalanceOf(maker, WQI);
    const finalTakerWquai = await vault.availableBalanceOf(taker, WQUAI);
    const finalTakerWqi = await vault.availableBalanceOf(taker, WQI);
    
    console.log('Maker:');
    console.log('  WQUAI:', formatQuai(finalMakerWquai));
    console.log('  WQI:', formatQuai(finalMakerWqi));
    
    console.log('Taker:');
    console.log('  WQUAI:', formatQuai(finalTakerWquai));
    console.log('  WQI:', formatQuai(finalTakerWqi));
    
    console.log('\n✅ Settlement test completed!');
  } catch (e) {
    console.log('❌ Settlement failed:', e.message);
  }
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
