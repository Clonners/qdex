#!/usr/bin/env node
/**
 * Simple QDEX funding via QuaiSwap (no QI conversion)
 *
 * Flow:
 *   1. Wrap 10 QUAI → WQUAI (if needed)
 *   2. Swap WQUAI → WQI via QuaiSwap router
 *   3. Approve + Deposit to TradingVault
 *
 * Usage: source .env && node scripts/fund-qdex-simple.mjs
 */

import { Wallet, JsonRpcProvider, Contract, parseQuai, formatQuai } from 'quais';
import { config } from 'dotenv';
import { ethers } from 'ethers';

config();

const RPC_URL = 'https://orchard.rpc.quai.network/cyprus1';
const PK = process.env.DEPLOYER_PRIVATE_KEY;
const ADDR = '0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267';

const WQUAI = '0x005c46f661Baef20671943f2b4c087Df3E7CEb13';
const WQI   = '0x002b2596EcF05C93a31ff916E8b456DF6C77c750';
const ROUTER = '0x0044E4779b3e1C88f931DE4940bC87C1a85628c3';
const VAULT  = '0x002325d071d57bafd3169f270a71b67a05360abf';

const provider = new JsonRpcProvider(RPC_URL, undefined, { usePathing: false });
const wallet = new Wallet(PK, provider);
const ethersProv = new ethers.providers.JsonRpcProvider(RPC_URL);

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function deposit() payable",
];

const ROUTER_ABI = [
  "function getAmountsOut(uint256,address[]) view returns (uint256[])",
  "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
];

const VAULT_ABI = [
  "function deposit(address,uint256)",
  "function availableBalanceOf(address,address) view returns (uint256)",
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function checkReceipt(hash, label) {
  console.log(`  📤 ${label}: ${hash}`);
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    try {
      const r = await ethersProv.getTransactionReceipt(hash);
      if (r) {
        console.log(r.status === 1
          ? `  ✅ ${label} OK (block ${r.blockNumber})`
          : `  ❌ ${label} REVERTED`);
        return r;
      }
    } catch {}
  }
  console.log(`  ⚠️  ${label}: timeout`);
  return null;
}

async function balances() {
  const b = {};
  try { b.quai = await provider.getBalance(ADDR); } catch {}
  try { b.wquai = await new Contract(WQUAI, ERC20, wallet).balanceOf(ADDR); } catch {}
  try { b.wqi = await new Contract(WQI, ERC20, wallet).balanceOf(ADDR); } catch {}
  return b;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('     QDEX Fund (QuaiSwap)');
  console.log('═══════════════════════════════════════');

  const b0 = await balances();
  console.log(`\nBalances:`);
  console.log(`  QUAI:  ${formatQuai(b0.quai)}`);
  console.log(`  WQUAI: ${formatQuai(b0.wquai)}`);
  console.log(`  WQI:   ${formatQuai(b0.wqi)}`);

  // Step 1: Wrap QUAI → WQUAI if needed
  const wquai = new Contract(WQUAI, ERC20, wallet);
  const needWrap = parseQuai('10');

  if (b0.wquai < needWrap) {
    console.log(`\n── Wrapping QUAI → WQUAI ──`);
    const tx = await wquai.deposit({ value: needWrap, gasLimit: 300000 });
    await checkReceipt(tx.hash, 'Wrap');
    await sleep(15000);
  }

  const b1 = await balances();
  console.log(`\nAfter wrap: WQUAI = ${formatQuai(b1.wquai)}`);

  // Step 2: Swap WQUAI → WQI
  console.log(`\n── Swapping WQUAI → WQI ──`);
  const swapAmount = parseQuai('15');
  const router = new Contract(ROUTER, ROUTER_ABI, wallet);

  // Check expected output
  try {
    const amounts = await router.getAmountsOut(swapAmount, [WQUAI, WQI]);
    console.log(`  Expected: ${formatQuai(swapAmount)} WQUAI → ${formatQuai(amounts[1])} WQI`);
  } catch (e) {
    console.log(`  ⚠️  Quote failed: ${e.message}`);
  }

  // Approve router
  console.log('  Approving router...');
  const apprTx = await wquai.approve(ROUTER, parseQuai('100'));
  await checkReceipt(apprTx.hash, 'Approve');
  await sleep(15000);

  // Swap
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  console.log('  Swapping...');
  const swapTx = await router.swapExactTokensForTokens(
    swapAmount,
    parseQuai('0.1'), // min out (very conservative for testnet)
    [WQUAI, WQI],
    ADDR,
    deadline,
    { gasLimit: 500000 }
  );
  await checkReceipt(swapTx.hash, 'Swap');
  await sleep(15000);

  const b2 = await balances();
  console.log(`\nAfter swap:`);
  console.log(`  WQUAI: ${formatQuai(b2.wquai)}`);
  console.log(`  WQI:   ${formatQuai(b2.wqi)}`);

  // Step 3: Deposit to TradingVault
  console.log(`\n── Depositing to Vault ──`);
  const vault = new Contract(VAULT, VAULT_ABI, wallet);
  const depWquai = parseQuai('5');
  const depWqi = parseQuai('20');

  // Deposit WQUAI
  if (b2.wquai >= depWquai) {
    const atx1 = await wquai.approve(VAULT, parseQuai('100'));
    await checkReceipt(atx1.hash, 'Approve WQUAI');
    await sleep(15000);

    const dtx1 = await vault.deposit(WQUAI, depWquai);
    await checkReceipt(dtx1.hash, 'Deposit WQUAI');
    await sleep(10000);
  }

  // Deposit WQI
  const b3 = await balances();
  if (b3.wqi >= depWqi) {
    const wqiC = new Contract(WQI, ERC20, wallet);
    const atx2 = await wqiC.approve(VAULT, parseQuai('100'));
    await checkReceipt(atx2.hash, 'Approve WQI');
    await sleep(15000);

    const dtx2 = await vault.deposit(WQI, depWqi);
    await checkReceipt(dtx2.hash, 'Deposit WQI');
    await sleep(10000);
  }

  // Final
  console.log('\n═══════════════════════════════════════');
  const bf = await balances();
  console.log(`  Wallet: QUAI=${formatQuai(bf.quai)} WQUAI=${formatQuai(bf.wquai)} WQI=${formatQuai(bf.wqi)}`);

  try {
    const v = new Contract(VAULT, VAULT_ABI, wallet);
    const vq = await v.availableBalanceOf(ADDR, WQUAI);
    const vwi = await v.availableBalanceOf(ADDR, WQI);
    console.log(`  Vault:  WQUAI=${formatQuai(vq)} WQI=${formatQuai(vwi)}`);
  } catch (e) { console.log(`  ⚠️  Vault check: ${e.message}`); }

  console.log('\n  ✅ Done! QDEX funded.');
}

main().then(() => process.exit(0)).catch(e => {
  console.error('\n❌', e.message);
  process.exit(1);
});
