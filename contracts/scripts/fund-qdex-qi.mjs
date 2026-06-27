#!/usr/bin/env node
/**
 * Fund QDEX via QI conversion path:
 *   QUAI → QI → WQI
 * + Wrap QUAI → WQUAI
 * + Deposit both to TradingVault
 *
 * Uses long timeouts since Orchard RPC is slow.
 */

import { Wallet, JsonRpcProvider, Contract, parseQuai, formatQuai, parseQi, formatQi, Mnemonic, QiHDWallet } from 'quais';
import { config } from 'dotenv';
import { ethers } from 'ethers';

config();

const RPC = 'https://orchard.rpc.quai.network/cyprus1';
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const ADDR = '0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267';
const WQUAI = '0x005c46f661Baef20671943f2b4c087Df3E7CEb13';
const WQI = '0x002b2596EcF05C93a31ff916E8b456DF6C77c750';
const VAULT = '0x002325d071d57bafd3169f270a71b67a05360abf';

const prov = new JsonRpcProvider(RPC, undefined, { usePathing: false });
const wlt = new Wallet(PK, prov);
const ethProv = new ethers.providers.JsonRpcProvider(RPC);

const MNEMONIC = (process.env.DEPLOYER_MNEMONIC || '').replace(/['"]/g, '').trim();
const qiWlt = QiHDWallet.fromMnemonic(Mnemonic.fromPhrase(MNEMONIC));

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

// Poll receipt with long timeout
async function wait(hash, label, maxWait = 300) {
  console.log(`  📤 ${label}: ${hash.substring(0, 20)}...`);
  const start = Date.now();
  while (Date.now() - start < maxWait * 1000) {
    await sleep(5000);
    try {
      const r = await ethProv.getTransactionReceipt(hash);
      if (r) {
        console.log(`  ${r.status === 1 ? '✅' : '❌'} ${label} (block ${r.blockNumber})`);
        return r;
      }
    } catch {}
  }
  console.log(`  ⏳ ${label}: still pending after ${maxWait}s (will check later)`);
  return null;
}

function section(s) { console.log(`\n── ${s} ──`); }

async function bals() {
  const b = {};
  try { b.quai = await prov.getBalance(ADDR); } catch {}
  try { b.wquai = await new Contract(WQUAI, ERC20, wlt).balanceOf(ADDR); } catch {}
  try { b.wqi = await new Contract(WQI, ERC20, wlt).balanceOf(ADDR); } catch {}
  return b;
}

async function main() {
  console.log('═══ QDEX Fund (QUAI→QI→WQI path) ═══');

  const b0 = await bals();
  console.log(`\nStart: QUAI=${formatQuai(b0.quai)} WQUAI=${formatQuai(b0.wquai)} WQI=${formatQuai(b0.wqi)}`);

  // ── 1. Wrap QUAI → WQUAI ──
  section('Wrap 10 QUAI → WQUAI');
  const wquaiC = new Contract(WQUAI, ERC20, wlt);
  const r1 = await wait(
    (await wquaiC.deposit({ value: parseQuai('10'), gasLimit: 300000 })).hash,
    'Wrap', 120
  );
  await sleep(10000);

  // ── 2. Convert QUAI → QI ──
  section('Convert 50 QUAI → QI');
  const qiAddr = qiWlt.getNextAddressSync(0, 'cyprus1');
  console.log(`  QI addr: ${qiAddr.address}`);

  const r2 = await wait(
    (await wlt.sendTransaction({
      from: ADDR, to: qiAddr.address,
      value: parseQuai('50'), gasLimit: 500000,
    })).hash,
    'Convert', 180
  );

  console.log('  ⏳ Waiting for QI conversion to propagate (30s)...');
  await sleep(30000);

  // Check QI balance
  let qiBal = 0n;
  try {
    const ops = await prov.getOutpointsByAddress(qiAddr.address);
    for (const op of (ops || [])) {
      const lock = op.lock ? parseInt(op.lock, 16) : 0;
      if (!lock) qiBal += BigInt(op.value || 0);
    }
    console.log(`  QI spendable: ${formatQuai(qiBal)}`);
  } catch (e) {
    console.log(`  ⚠️  QI check: ${e.message}`);
  }

  // ── 3. Wrap QI → WQI ──
  section('Wrap QI → WQI');
  const wrapAmt = Math.min(parseFloat(formatQuai(qiBal)), 40);

  if (wrapAmt <= 0) {
    console.log('  ❌ No QI to wrap');
  } else {
    console.log(`  Wrapping ${wrapAmt} QI...`);
    try {
      await qiWlt.syncOutpoints('cyprus1');
      await sleep(5000);

      // Claim any pending deposit
      try {
        const res = await prov.send('quai_getWrappedQiDeposit', [WQI, ADDR, 'latest']);
        const pend = BigInt(res || '0');
        if (pend > 0n) {
          console.log(`  ⚠️  Pending: ${formatQuai(pend)}. Claiming...`);
          await wait(
            (await new Contract(WQI, ERC20, wlt).claimDeposit({ gasLimit: 300000 })).hash,
            'Claim pending', 120
          );
          await sleep(10000);
        }
      } catch {}

      // Convert QI → WQI
      const data = Buffer.from(WQI.replace(/^0x/, ''), 'hex');
      const tx = await qiWlt.convertToQuai(ADDR, parseQi(wrapAmt.toString()), { data });
      console.log(`  📤 QI wrap: ${tx.hash.substring(0, 20)}...`);
      console.log('  ✅ QI deposit to WQI contract done!');
    } catch (e) {
      console.log(`  ❌ Wrap: ${e.message}`);
    }

    await sleep(30000);

    // Claim WQI
    console.log('  Claiming WQI...');
    try {
      await wait(
        (await new Contract(WQI, ERC20, wlt).claimDeposit({ gasLimit: 300000 })).hash,
        'Claim WQI', 120
      );
      await sleep(10000);
    } catch (e) {
      console.log(`  ⚠️  Claim: ${e.message}`);
    }
  }

  // ── 4. Deposit to Vault ──
  section('Deposit to TradingVault');
  const b4 = await bals();
  console.log(`  WQUAI: ${formatQuai(b4.wquai)}`);
  console.log(`  WQI:   ${formatQuai(b4.wqi)}`);

  const vaultC = new Contract(VAULT, VAULT_ABI, wlt);
  const depW = parseQuai('5');
  const depQ = parseQuai('20');

  // WQUAI
  if (b4.wquai >= depW) {
    await wait((await wquaiC.approve(VAULT, parseQuai('100'))).hash, 'Approve WQUAI', 120);
    await sleep(10000);
    await wait((await vaultC.deposit(WQUAI, depW)).hash, 'Deposit WQUAI', 120);
    await sleep(10000);
  }

  // WQI
  const b5 = await bals();
  if (b5.wqi >= depQ) {
    const wqiC = new Contract(WQI, ERC20, wlt);
    await wait((await wqiC.approve(VAULT, parseQuai('100'))).hash, 'Approve WQI', 120);
    await sleep(10000);
    await wait((await vaultC.deposit(WQI, depQ)).hash, 'Deposit WQI', 120);
    await sleep(10000);
  }

  // Final
  console.log('\n═══ Final State ═══');
  const bf = await bals();
  console.log(`  Wallet: QUAI=${formatQuai(bf.quai)} WQUAI=${formatQuai(bf.wquai)} WQI=${formatQuai(bf.wqi)}`);

  try {
    const vq = await vaultC.availableBalanceOf(ADDR, WQUAI);
    const vw = await vaultC.availableBalanceOf(ADDR, WQI);
    console.log(`  Vault:  WQUAI=${formatQuai(vq)} WQI=${formatQuai(vw)}`);
  } catch (e) { console.log(`  ⚠️ Vault: ${e.message}`); }

  console.log('\n  ✅ QDEX funded! Ready for testing.');
}

main().then(() => process.exit(0)).catch(e => {
  console.error('\n❌', e.message);
  process.exit(1);
});
