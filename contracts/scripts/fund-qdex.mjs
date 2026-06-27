#!/usr/bin/env node
/**
 * Fund QDEX for testing on Orchard Cyprus-1
 *
 * Flow:
 *   1. Wrap 10 QUAI → WQUAI
 *   2. Convert 50 QUAI → QI
 *   3. Wrap 40 QI → WQI (convertToQuai + claimDeposit)
 *   4. Approve + Deposit WQUAI + WQI to TradingVault
 *
 * Uses quais SDK for tx sending (handles checksums correctly)
 * Uses ethers.js only for polling receipts (more reliable)
 */

import { Wallet, JsonRpcProvider, Contract, parseQuai, formatQuai, parseQi, formatQi, Mnemonic, QiHDWallet } from 'quais';
import { config } from 'dotenv';
import { ethers } from 'ethers';

config();

// ── Config ──
const RPC_URL = 'https://orchard.rpc.quai.network/cyprus1';
const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
const DEPLOYER_ADDR = '0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267';

const WQUAI_ADDR = '0x005c46f661Baef20671943f2b4c087Df3E7CEb13';
const WQI_ADDR   = '0x002b2596EcF05C93a31ff916E8b456DF6C77c750';
const VAULT_ADDR = '0x002325d071d57bafd3169f270a71b67a05360abf';

const AMOUNT_WRAP_QUAI = '10';
const AMOUNT_CONVERT_QI = '50';
const AMOUNT_WRAP_QI = '40';

// ── Providers ──
const provider = new JsonRpcProvider(RPC_URL, undefined, { usePathing: false });
const wallet = new Wallet(DEPLOYER_PK, provider);

// ethers provider for receipt polling only
const ethersProvider = new ethers.providers.JsonRpcProvider(RPC_URL);

// Mnemonic for QI operations
const mnemonicRaw = process.env.DEPLOYER_MNEMONIC || '';
const mnemonicPhrase = mnemonicRaw.replace(/['"]/g, '').trim();
const qiWallet = QiHDWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonicPhrase));

// ── ABIs ──
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function deposit() payable",
  "function claimDeposit() external returns (uint256)",
];

const VAULT_ABI = [
  "function deposit(address,uint256)",
  "function availableBalanceOf(address,address) view returns (uint256)",
];

// ── Helpers ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function pollReceipt(txHash, label) {
  console.log(`  📤 ${label}: ${txHash}`);
  for (let i = 0; i < 30; i++) {
    await sleep(5000);
    try {
      const receipt = await ethersProvider.getTransactionReceipt(txHash);
      if (receipt) {
        if (receipt.status === 1) {
          console.log(`  ✅ ${label} confirmed (block: ${receipt.blockNumber})`);
          return receipt;
        } else {
          console.log(`  ❌ ${label} REVERTED`);
          return receipt;
        }
      }
    } catch {}
  }
  console.log(`  ⚠️  ${label}: timeout (may still confirm)`);
  return null;
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

async function getBalances() {
  const b = {};
  try { b.quai = await provider.getBalance(DEPLOYER_ADDR); } catch {}
  try {
    const c = new Contract(WQUAI_ADDR, ERC20_ABI, wallet);
    b.wquai = await c.balanceOf(DEPLOYER_ADDR);
  } catch {}
  try {
    const c = new Contract(WQI_ADDR, ERC20_ABI, wallet);
    b.wqi = await c.balanceOf(DEPLOYER_ADDR);
  } catch {}
  return b;
}

// ── Main ──
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('     QDEX Fund — Orchard Cyprus-1');
  console.log('═══════════════════════════════════════');
  console.log(`Deployer: ${DEPLOYER_ADDR}\n`);

  // Initial
  console.log('── Initial Balances ──');
  const b0 = await getBalances();
  console.log(`  QUAI:  ${formatQuai(b0.quai)}`);
  console.log(`  WQUAI: ${formatQuai(b0.wquai)}`);
  console.log(`  WQI:   ${formatQuai(b0.wqi)}`);

  // ── Step 1: Wrap QUAI → WQUAI ──
  section(`Step 1: Wrap ${AMOUNT_WRAP_QUAI} QUAI → WQUAI`);
  const wquai = new Contract(WQUAI_ADDR, ERC20_ABI, wallet);
  const tx1 = await wquai.deposit({ value: parseQuai(AMOUNT_WRAP_QUAI), gasLimit: 300000 });
  const r1 = await pollReceipt(tx1.hash, 'Wrap QUAI');
  if (!r1 || r1.status !== 1) { console.log('  ❌ Step 1 failed'); return; }
  await sleep(10000);

  const b1 = await getBalances();
  console.log(`  → WQUAI: ${formatQuai(b1.wquai)}\n`);

  // ── Step 2: Convert QUAI → QI ──
  section(`Step 2: Convert ${AMOUNT_CONVERT_QI} QUAI → QI`);
  const qiAddr = qiWallet.getNextAddressSync(0, 'cyprus1');
  console.log(`  QI address: ${qiAddr.address}`);

  // Send QUAI to QI address
  const tx2 = await wallet.sendTransaction({
    from: DEPLOYER_ADDR,
    to: qiAddr.address,
    value: parseQuai(AMOUNT_CONVERT_QI),
    gasLimit: 500000,
  });
  const r2 = await pollReceipt(tx2.hash, 'Convert QUAI→QI');
  if (!r2 || r2.status !== 1) { console.log('  ❌ Step 2 failed'); return; }

  console.log('  ⏳ Waiting for QI conversion...');
  await sleep(20000);

  // Check QI balance
  let qiSpendable = 0n;
  try {
    const ops = await provider.getOutpointsByAddress(qiAddr.address);
    for (const op of (ops || [])) {
      const lock = op.lock ? parseInt(op.lock, 16) : 0;
      if (!lock) qiSpendable += BigInt(op.value || 0);
    }
    console.log(`  QI spendable: ${formatQuai(qiSpendable)} ✅\n`);
  } catch (e) {
    console.log(`  ⚠️  QI balance check failed: ${e.message}\n`);
  }

  // ── Step 3: Wrap QI → WQI ──
  section('Step 3: Wrap QI → WQI');

  let wrapAmount = parseFloat(formatQuai(qiSpendable));
  const target = parseFloat(AMOUNT_WRAP_QI);
  if (wrapAmount > target) wrapAmount = target;
  if (wrapAmount <= 0) {
    console.log('  ❌ No QI to wrap');
  } else {
    console.log(`  Syncing QI outpoints...`);
    try { await qiWallet.syncOutpoints('cyprus1'); } catch {}
    await sleep(5000);

    // Claim any pending deposit first
    try {
      const result = await provider.send('quai_getWrappedQiDeposit', [WQI_ADDR, DEPLOYER_ADDR, 'latest']);
      const pending = BigInt(result || '0');
      if (pending > 0n) {
        console.log(`  ⚠️  Pending WQI: ${formatQuai(pending)}. Claiming...`);
        const wqiC = new Contract(WQI_ADDR, ERC20_ABI, wallet);
        const claimTx = await wqiC.claimDeposit({ gasLimit: 300000 });
        const cr = await pollReceipt(claimTx.hash, 'Claim pending');
        await sleep(10000);
      }
    } catch {}

    // Wrap QI
    console.log(`  Wrapping ${wrapAmount} QI → WQI...`);
    const contractBytes = Buffer.from(WQI_ADDR.replace(/^0x/, ''), 'hex');
    try {
      const tx3 = await qiWallet.convertToQuai(
        DEPLOYER_ADDR,
        parseQi(wrapAmount.toString()),
        { data: contractBytes }
      );
      console.log(`  📤 QI wrap tx: ${tx3.hash}`);
      console.log(`  ✅ QI deposit to WQI successful!\n`);
    } catch (e) {
      console.log(`  ❌ Wrap failed: ${e.message}\n`);
    }

    await sleep(20000);

    // Claim WQI
    console.log('  Claiming WQI...');
    try {
      const wqiC = new Contract(WQI_ADDR, ERC20_ABI, wallet);
      const tx4 = await wqiC.claimDeposit({ gasLimit: 300000 });
      const r4 = await pollReceipt(tx4.hash, 'Claim WQI');
      if (r4 && r4.status === 1) {
        await sleep(10000);
        const b3 = await getBalances();
        console.log(`  → WQI: ${formatQuai(b3.wqi)} ✅\n`);
      }
    } catch (e) {
      console.log(`  ❌ Claim failed: ${e.message}\n`);
    }
  }

  // ── Step 4: Deposit to TradingVault ──
  section('Step 4: Deposit to TradingVault');
  console.log(`  Vault: ${VAULT_ADDR}`);

  const b4 = await getBalances();
  const depositWquai = parseQuai('5');
  const depositWqi = parseQuai('20');
  const vault = new Contract(VAULT_ADDR, VAULT_ABI, wallet);

  // Deposit WQUAI
  if (b4.wquai >= depositWquai) {
    console.log(`\n  Approving ${formatQuai(depositWquai)} WQUAI...`);
    const apprTx = await wquai.approve(VAULT_ADDR, parseQuai('100'));
    await pollReceipt(apprTx.hash, 'Approve WQUAI');
    await sleep(10000);

    console.log(`  Depositing ${formatQuai(depositWquai)} WQUAI...`);
    const depTx = await vault.deposit(WQUAI_ADDR, depositWquai);
    await pollReceipt(depTx.hash, 'Deposit WQUAI');
    await sleep(10000);
  } else {
    console.log(`  ⚠️  Not enough WQUAI (${formatQuai(b4.wquai)})`);
  }

  // Deposit WQI
  const b5 = await getBalances();
  if (b5.wqi >= depositWqi) {
    const wqiC = new Contract(WQI_ADDR, ERC20_ABI, wallet);
    console.log(`\n  Approving ${formatQuai(depositWqi)} WQI...`);
    const apprTx = await wqiC.approve(VAULT_ADDR, parseQuai('100'));
    await pollReceipt(apprTx.hash, 'Approve WQI');
    await sleep(10000);

    console.log(`  Depositing ${formatQuai(depositWqi)} WQI...`);
    const depTx = await vault.deposit(WQI_ADDR, depositWqi);
    await pollReceipt(depTx.hash, 'Deposit WQI');
    await sleep(10000);
  } else {
    console.log(`  ⚠️  Not enough WQI (${formatQuai(b5.wqi)})`);
  }

  // ── Final ──
  console.log('\n═══════════════════════════════════════');
  console.log('           Final State');
  console.log('═══════════════════════════════════════');

  const bf = await getBalances();
  console.log(`  Wallet QUAI:  ${formatQuai(bf.quai)}`);
  console.log(`  Wallet WQUAI: ${formatQuai(bf.wquai)}`);
  console.log(`  Wallet WQI:   ${formatQuai(bf.wqi)}`);

  try {
    const vC = new Contract(VAULT_ADDR, VAULT_ABI, wallet);
    const vWquai = await vC.availableBalanceOf(DEPLOYER_ADDR, WQUAI_ADDR);
    const vWqi = await vC.availableBalanceOf(DEPLOYER_ADDR, WQI_ADDR);
    console.log(`  Vault WQUAI:  ${formatQuai(vWquai)}`);
    console.log(`  Vault WQI:    ${formatQuai(vWqi)}`);
  } catch (e) {
    console.log(`  ⚠️  Vault check failed: ${e.message}`);
  }

  console.log('\n  ✅ QDEX funded! Ready for testing.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\n❌ ERROR:', e.message);
    if (e.stack) console.error(e.stack.split('\n').slice(1, 5).join('\n'));
    process.exit(1);
  });
