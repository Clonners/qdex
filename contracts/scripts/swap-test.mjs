#!/usr/bin/env node
/**
 * Swap test script - wrap QUAI to WQUAI, then swap WQUAI to WQI
 */

import { Wallet, JsonRpcProvider, Contract, parseQuai, formatQuai } from 'quais';
import { config } from 'dotenv';

config();

const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
const WALLET_ADDR = '0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267';
const WQUAI_ADDR = '0x005c46f661Baef20671943f2b4c087Df3E7CEb13';
const WQI_ADDR = '0x002b2596EcF05C93a31ff916E8b456DF6C77c750';
const ROUTER_ADDR = '0x0044E4779b3e1C88f931DE4940bC87C1a85628c3';
const RPC_URL = 'https://orchard.rpc.quai.network/cyprus1';

const provider = new JsonRpcProvider(RPC_URL, undefined, { usePathing: true });
const wallet = new Wallet(DEPLOYER_PK, provider);

// Minimal ABI for ERC20
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function deposit() payable",
  "function withdraw(uint256) returns (bool)",
];

// Router ABI
const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] amounts)",
];

const wquai = new Contract(WQUAI_ADDR, ERC20_ABI, wallet);
const wqi = new Contract(WQI_ADDR, ERC20_ABI, wallet);
const router = new Contract(ROUTER_ADDR, ROUTER_ABI, wallet);

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== QDEX Swap Test ===');
  console.log(`Wallet: ${wallet.address}`);
  console.log(`WQUAI: ${WQUAI_ADDR}`);
  console.log(`WQI: ${WQI_ADDR}`);
  console.log(`Router: ${ROUTER_ADDR}`);

  // Check balances
  const quaiBalance = await provider.getBalance(wallet.address);
  const wquaiBalance = await wquai.balanceOf(wallet.address);
  const wqiBalance = await wqi.balanceOf(wallet.address);

  console.log(`\nCurrent balances:`);
  console.log(`  QUAI: ${formatQuai(quaiBalance)}`);
  console.log(`  WQUAI: ${formatQuai(wquaiBalance)}`);
  console.log(`  WQI: ${formatQuai(wqiBalance)}`);

  // Step 1: Wrap 10 QUAI to WQUAI
  console.log('\n--- Step 1: Wrap 10 QUAI to WQUAI ---');
  const wrapAmount = parseQuai('10');
  
  const wrapTx = await wquai.deposit({ value: wrapAmount, gasLimit: 100000 });
  console.log(`Wrap tx: ${wrapTx.hash}`);
  const wrapReceipt = await wrapTx.wait(1);
  console.log(`✅ Wrapped! Gas used: ${wrapReceipt.gasUsed.toString()}`);

  // Step 2: Approve router to spend WQUAI
  console.log('\n--- Step 2: Approve router ---');
  const approveTx = await wquai.approve(ROUTER_ADDR, parseQuai('1000'));
  console.log(`Approve tx: ${approveTx.hash}`);
  const approveReceipt = await approveTx.wait(1);
  console.log(`✅ Approved! Gas used: ${approveReceipt.gasUsed.toString()}`);

  await sleep(5000);

  // Step 3: Check swap amounts
  console.log('\n--- Step 3: Check swap amounts ---');
  const path = [WQUAI_ADDR, WQI_ADDR];
  const swapAmount = parseQuai('5');
  
  try {
    const amounts = await router.getAmountsOut(swapAmount, path);
    console.log(`Swap: ${formatQuai(swapAmount)} WQUAI → ${formatQuai(amounts[1])} WQI`);
  } catch (e) {
    console.log('getAmountsOut failed:', e.message);
  }

  // Step 4: Swap WQUAI for WQI
  console.log('\n--- Step 4: Swap WQUAI → WQI ---');
  const deadline = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour from now
  
  try {
    const swapTx = await router.swapExactTokensForTokens(
      swapAmount,
      parseQuai('0.1'), // min out (conservative)
      path,
      wallet.address,
      deadline,
      { gasLimit: 500000 }
    );
    console.log(`Swap tx: ${swapTx.hash}`);
    const swapReceipt = await swapTx.wait(1);
    console.log(`✅ Swapped! Gas used: ${swapReceipt.gasUsed.toString()}`);
  } catch (e) {
    console.log('Swap failed:', e.message);
    // Try with more gas
    try {
      const swapTx2 = await router.swapExactTokensForTokens(
        swapAmount,
        parseQuai('0.1'),
        path,
        wallet.address,
        deadline,
        { gasLimit: 1000000 }
      );
      console.log(`Swap tx: ${swapTx2.hash}`);
      const swapReceipt2 = await swapTx2.wait(1);
      console.log(`✅ Swapped! Gas used: ${swapReceipt2.gasUsed.toString()}`);
    } catch (e2) {
      console.log('Swap still failed:', e2.message);
    }
  }

  await sleep(5000);

  // Final balances
  const finalWquai = await wquai.balanceOf(wallet.address);
  const finalWqi = await wqi.balanceOf(wallet.address);

  console.log('\n=== Final balances ===');
  console.log(`  WQUAI: ${formatQuai(finalWquai)}`);
  console.log(`  WQI: ${formatQuai(finalWqi)}`);

  if (parseFloat(formatQuai(finalWqi)) > 0) {
    console.log('\n✅ Swap successful! We now have WQUAI and WQI for testing.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
