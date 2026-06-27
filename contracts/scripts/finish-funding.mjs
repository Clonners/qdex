#!/usr/bin/env node
/**
 * Resume QDEX funding - wrap QI→WQI + deposit to vault
 * Run this after QI becomes spendable (after lock period)
 */

import { Wallet, JsonRpcProvider, Contract, parseQuai, formatQuai, parseQi, Mnemonic, QiHDWallet, Zone, formatMixedCaseChecksumAddress } from 'quais';
import { config } from 'dotenv';

config();

const RPC = 'https://orchard.rpc.quai.network/cyprus1';
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const ADDR = formatMixedCaseChecksumAddress('0x005caddf8fe81f1ea33abf16db610cad0aad3267');
const MNEMONIC = (process.env.DEPLOYER_MNEMONIC || '').replace(/['"]/g, '').trim();

const WQUAI = formatMixedCaseChecksumAddress('0x005c46f661baef20671943f2b4c087df3e7ceb13');
const WQI = formatMixedCaseChecksumAddress('0x002b2596ecf05c93a31ff916e8b456df6c77c750');
const VAULT = formatMixedCaseChecksumAddress('0x002325d071d57bafd3169f270a71b67a05360abf');

const provider = new JsonRpcProvider(RPC, undefined, { usePathing: false });
const wallet = new Wallet(PK, provider);

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function claimDeposit() external returns (uint256)",
];
const VAULT_ABI = [
  "function deposit(address,uint256)",
  "function availableBalanceOf(address,address) view returns (uint256)",
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function section(s) { console.log(`\n── ${s} ──`); }

async function main() {
  console.log('═══ QDEX Finish Funding ═══');
  console.log(`  ADDR: ${ADDR}`);
  
  const qiWallet = QiHDWallet.fromMnemonic(Mnemonic.fromPhrase(MNEMONIC));
  qiWallet.connect(provider);
  
  // Check QI balance
  section('Check QI status');
  await qiWallet.sync(Zone.Cyprus1);
  
  const spendableRaw = await qiWallet.getSpendableBalance(Zone.Cyprus1);
  const lockedRaw = await qiWallet.getLockedBalance(Zone.Cyprus1);
  const spendable = typeof spendableRaw === 'bigint' ? spendableRaw : BigInt(spendableRaw.toString());
  const locked = typeof lockedRaw === 'bigint' ? lockedRaw : BigInt(lockedRaw.toString());
  console.log(`  QI spendable: ${formatQuai(spendable)}`);
  console.log(`  QI locked: ${formatQuai(locked)}`);
  
  if (spendable === 0n || spendable < parseQi('10')) {
    console.log('  ⚠️  Not enough spendable QI. Wait for unlock period.');
    console.log('  Run this script again later.');
    return;
  }
  
  // Wrap QI → WQI
  section('Wrap QI → WQI');
  const wrapAmount = Math.min(parseFloat(formatQuai(spendable)) - 1, 40);
  console.log(`  Wrapping ${wrapAmount} QI → WQI...`);
  
  const contractBytes = Buffer.from(WQI.replace(/^0x/, ''), 'hex');
  const wrapTx = await qiWallet.convertToQuai(ADDR, parseQi(wrapAmount.toString()), { data: contractBytes });
  console.log(`  ✅ Wrap tx: ${wrapTx.hash.substring(0, 20)}...`);
  
  await sleep(30000);
  
  // Claim WQI
  console.log('  Claiming WQI...');
  const wqi = new Contract(WQI, ERC20, wallet);
  const claimTx = await wqi.claimDeposit({ gasLimit: 300000 });
  console.log(`  ✅ Claim tx: ${claimTx.hash.substring(0, 20)}...`);
  
  await sleep(15000);
  
  const wqiBal = await wqi.balanceOf(ADDR);
  console.log(`  WQI balance: ${formatQuai(wqiBal)}`);
  
  // Deposit to Vault
  section('Deposit to Vault');
  const vault = new Contract(VAULT, VAULT_ABI, wallet);
  
  if (wqiBal >= parseQuai('20')) {
    await sendTx(wqi.approve(VAULT, parseQuai('100')), 'Approve WQI');
    await sleep(15000);
    await sendTx(vault.deposit(WQI, parseQuai('20')), 'Deposit WQI');
    await sleep(10000);
  }
  
  // Final state
  console.log('\n═══ Final State ═══');
  const vq = await vault.availableBalanceOf(ADDR, WQUAI);
  const vw = await vault.availableBalanceOf(ADDR, WQI);
  console.log(`  Vault WQUAI: ${formatQuai(vq)}`);
  console.log(`  Vault WQI: ${formatQuai(vw)}`);
  console.log('\n  ✅ QDEX fully funded!');
}

async function sendTx(txPromise, label) {
  try {
    const tx = await txPromise;
    console.log(`  ✅ ${label}: ${tx.hash.substring(0, 20)}...`);
  } catch (e) {
    console.log(`  ❌ ${label}: ${e.message.substring(0, 100)}`);
  }
}

main().catch(e => {
  console.error('\n❌', e.message);
  process.exit(1);
});
