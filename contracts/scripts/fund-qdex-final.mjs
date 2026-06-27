#!/usr/bin/env node
/**
 * Final QDEX funding script - quais only, no ethers
 * 
 * Flow:
 *   1. Wrap QUAI → WQUAI
 *   2. Send QUAI to QI address (auto-convert)  
 *   3. Wrap QI → WQI via WrappedQi contract
 *   4. Deposit both to TradingVault
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

console.log('Addresses:');
console.log('  ADDR:', ADDR);
console.log('  WQUAI:', WQUAI);
console.log('  WQI:', WQI);
console.log('  VAULT:', VAULT);

const provider = new JsonRpcProvider(RPC, undefined, { usePathing: false });
const wallet = new Wallet(PK, provider);

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function deposit() payable",
  "function claimDeposit() external returns (uint256)",
];
const VAULT_ABI = [
  "function deposit(address,uint256)",
  "function availableBalanceOf(address,address) view returns (uint256)",
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function section(s) { console.log(`\n── ${s} ──`); }

async function checkBalance() {
  const b = {};
  try {
    const quai = await provider.getBalance(ADDR);
    b.quai = typeof quai === 'bigint' ? quai : BigInt(quai.toString());
  } catch (e) { b.quai = 0n; }
  try {
    const w = await new Contract(WQUAI, ERC20, wallet).balanceOf(ADDR);
    b.wquai = typeof w === 'bigint' ? w : BigInt(w.toString());
  } catch (e) { b.wquai = 0n; }
  try {
    const w = await new Contract(WQI, ERC20, wallet).balanceOf(ADDR);
    b.wqi = typeof w === 'bigint' ? w : BigInt(w.toString());
  } catch (e) { b.wqi = 0n; }
  console.log(`  QUAI=${formatQuai(b.quai)} WQUAI=${formatQuai(b.wquai)} WQI=${formatQuai(b.wqi)}`);
  return b;
}

async function sendTx(txPromise, label) {
  try {
    const tx = await txPromise;
    console.log(`  ✅ ${label}: ${tx.hash.substring(0, 20)}...`);
    return tx;
  } catch (e) {
    console.log(`  ❌ ${label} failed: ${e.message.substring(0, 100)}`);
    return null;
  }
}

async function main() {
  console.log('═══ QDEX Fund (quais only) ═══');
  
  const b0 = await checkBalance();
  
  // Step 1: Wrap QUAI → WQUAI
  section('Wrap QUAI → WQUAI');
  const wquai = new Contract(WQUAI, ERC20, wallet);
  if (b0.wquai < parseQuai('15')) {
    await sendTx(wquai.deposit({ value: parseQuai('15'), gasLimit: 300000 }), 'Wrap 15 QUAI');
  } else {
    console.log('  ✓ Already have enough WQUAI');
  }
  
  await sleep(15000);
  await checkBalance();
  
  // Step 2: Convert QUAI → QI
  section('Convert QUAI → QI');
  
  const qiWallet = QiHDWallet.fromMnemonic(Mnemonic.fromPhrase(MNEMONIC));
  qiWallet.connect(provider);
  
  let qiAddr;
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 10000));
    qiAddr = await Promise.race([
      qiWallet.getNextAddress(0, Zone.Cyprus1),
      timeout
    ]);
  } catch (e) {
    console.log(`  ⚠️  getNextAddress failed: ${e.message}`);
    console.log('  Using sync fallback...');
    qiAddr = qiWallet.getNextAddressSync(0, Zone.Cyprus1);
  }
  
  console.log(`  QI address: ${JSON.stringify(qiAddr)}`);
  const targetAddr = qiAddr.address || qiAddr;
  
  await sendTx(
    wallet.sendTransaction({
      from: ADDR,
      to: targetAddr,
      value: parseQuai('50'),
      gasLimit: 500000,
    }),
    'Convert 50 QUAI→QI'
  );
  
  console.log('  ⏳ Waiting for conversion...');
  await sleep(30000);
  
  // Step 3: Wrap QI → WQI
  section('Wrap QI → WQI');
  
  try {
     await qiWallet.sync(Zone.Cyprus1);  // Use Zone.Cyprus1 enum
     console.log('  QI synced');
   } catch (e) {
     console.log(`  ⚠️  Sync: ${e.message}`);
   }
  
  try {
    const contractBytes = Buffer.from(WQI.replace(/^0x/, ''), 'hex');
    console.log('  Wrapping 20 QI → WQI...');
    const wrapTx = await qiWallet.convertToQuai(ADDR, parseQi('20'), { data: contractBytes });
    console.log(`  ✅ Wrap tx: ${wrapTx.hash.substring(0, 20)}...`);
  } catch (e) {
    console.log(`  ❌ Wrap: ${e.message}`);
  }
  
  await sleep(30000);
  
  console.log('  Claiming WQI...');
  await sendTx(
    new Contract(WQI, ERC20, wallet).claimDeposit({ gasLimit: 300000 }),
    'Claim WQI'
  );
  
  await sleep(15000);
  await checkBalance();
  
  // Step 4: Deposit to Vault
  section('Deposit to Vault');
  const b4 = await checkBalance();
  
  const vault = new Contract(VAULT, VAULT_ABI, wallet);
  const depWquai = parseQuai('5');
  const depWqi = parseQuai('20');
  
  if (b4.wquai >= depWquai) {
    await sendTx(wquai.approve(VAULT, parseQuai('100')), 'Approve WQUAI');
    await sleep(15000);
    await sendTx(vault.deposit(WQUAI, depWquai), 'Deposit WQUAI');
    await sleep(10000);
  }
  
  const b5 = await checkBalance();
  if (b5.wqi >= depWqi) {
    const wqi = new Contract(WQI, ERC20, wallet);
    await sendTx(wqi.approve(VAULT, parseQuai('100')), 'Approve WQI');
    await sleep(15000);
    await sendTx(vault.deposit(WQI, depWqi), 'Deposit WQI');
  }
  
  console.log('\n═══ Final State ═══');
  const bf = await checkBalance();
  
  try {
    const v = new Contract(VAULT, VAULT_ABI, wallet);
    const vq = await v.availableBalanceOf(ADDR, WQUAI);
    const vw = await v.availableBalanceOf(ADDR, WQI);
    console.log(`  Vault: WQUAI=${formatQuai(vq)} WQI=${formatQuai(vw)}`);
  } catch (e) {
    console.log(`  ⚠️  Vault: ${e.message}`);
  }
  
  console.log('\n  ✅ Done!');
}

main().catch(e => {
  console.error('\n❌', e.message);
  process.exit(1);
});
