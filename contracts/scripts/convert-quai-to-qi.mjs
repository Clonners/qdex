#!/usr/bin/env node
/**
 * Convert QUAI → QI on Orchard testnet
 * 
 * Sends QUAI to the QI address which auto-converts it.
 * Wait 1-2 minutes for the lock to expire, then wrap QI → WQI.
 */

import { Wallet, JsonRpcProvider, Contract, parseQuai, formatQuai, parseQi, Mnemonic, QiHDWallet, Zone, formatMixedCaseChecksumAddress } from 'quais';
import { config } from 'dotenv';

config();

const RPC = 'https://orchard.rpc.quai.network/cyprus1';
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const ADDR = formatMixedCaseChecksumAddress('0x005caddf8fe81f1ea33abf16db610cad0aad3267');
const MNEMONIC = (process.env.DEPLOYER_MNEMONIC || '').replace(/['"]/g, '').trim();

const WQI = formatMixedCaseChecksumAddress('0x002b2596ecf05c93a31ff916e8b456df6c77c750');

const provider = new JsonRpcProvider(RPC, undefined, { usePathing: false });
const wallet = new Wallet(PK, provider);

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function claimDeposit() external returns (uint256)",
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('═══ Convert QUAI → QI ═══');
  
  // Get QI address
  const qiWallet = QiHDWallet.fromMnemonic(Mnemonic.fromPhrase(MNEMONIC));
  qiWallet.connect(provider);
  
  const qiAddr = await qiWallet.getNextAddress(0, Zone.Cyprus1);
  console.log(`QI address: ${qiAddr.address}`);
  
  // Check current QI balance (QI uses 4 decimals)
  await qiWallet.sync(Zone.Cyprus1);
  const spendableRaw = await qiWallet.getSpendableBalance(Zone.Cyprus1);
  const spendableBig = typeof spendableRaw === 'bigint' ? spendableRaw : BigInt(spendableRaw.toString());
  const spendableQi = Number(spendableBig) / 10000;  // Convert to QI
  console.log(`Current QI spendable: ${spendableQi.toFixed(4)} QI`);
  
  // Convert 100 QUAI → QI
  console.log('\nConverting 100 QUAI → QI...');
  const tx = await wallet.sendTransaction({
    from: ADDR,
    to: qiAddr.address,
    value: parseQuai('100'),
    gasLimit: 500000,
  });
  console.log(`✅ TX sent: ${tx.hash}`);
  
  // Wait for conversion (2 minutes on testnet)
  console.log('⏳ Waiting for QI conversion (120s)...');
  await sleep(120000);
  
  // Re-check QI balance
  await qiWallet.sync(Zone.Cyprus1);
  const newSpendable = await qiWallet.getSpendableBalance(Zone.Cyprus1);
  const newSpendableBig = typeof newSpendable === 'bigint' ? newSpendable : BigInt(newSpendable.toString());
  const newSpendableQi = Number(newSpendableBig) / 10000;
  console.log(`New QI spendable: ${newSpendableQi.toFixed(4)} QI`);
  
  if (newSpendableQi > 10) {
    console.log('\n✅ QI is ready! Wrapping to WQI...');
    
    const wrapAmount = Math.min(newSpendableQi - 1, 80);
    console.log(`Wrapping ${wrapAmount.toFixed(4)} QI → WQI...`);
    
    const contractBytes = Buffer.from(WQI.replace(/^0x/, ''), 'hex');
    const wrapTx = await qiWallet.convertToQuai(ADDR, parseQi(wrapAmount.toFixed(4)), { data: contractBytes });
    console.log(`✅ Wrap TX: ${wrapTx.hash}`);
    
    await sleep(60000);
    
    // Claim WQI
    console.log('Claiming WQI...');
    const wqi = new Contract(WQI, ERC20, wallet);
    const claimTx = await wqi.claimDeposit({ gasLimit: 300000 });
    console.log(`✅ Claim TX: ${claimTx.hash}`);
    
    await sleep(30000);
    
    const wqiBal = await wqi.balanceOf(ADDR);
    console.log(`\nWQI balance: ${formatQuai(wqiBal)}`);
    console.log('\n✅ QI → WQI conversion complete!');
  } else {
    console.log('\n⚠️  Still not enough QI. Wait a bit more and re-run.');
  }
}

main().catch(e => {
  console.error('\n❌', e.message);
  process.exit(1);
});
