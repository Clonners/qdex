#!/usr/bin/env node
import { parseQuai } from 'quais';
import { Wallet } from 'ethers';
import { config } from 'dotenv';

config();

const PK = process.env.DEPLOYER_PRIVATE_KEY;
const ADDR = '0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267';

// QI address for the deployer (derived from mnemonic, account 0, cyprus1)
// Pattern: QI addresses start with 0x0088... for the same mnemonic
// From the trading bot config, the QI addresses follow the pattern 0x0088...
// Let's use the first QI address from the mnemonic
// For mnemonic "foil another wet focus half casino bullet subway level busy saddle seat":
// QI address (account 0, cyprus1): need to derive it
// The deployer EVM addr is 0x005CAD... so the QI addr should be derivable

// Use a known QI address pattern or derive from EVM
// For now, try using the EVM address as the target (Quai should auto-convert)
// Actually, we need to send to a QI-specific address

// From memory: the deployer mnemonic's QI address (account 0, cyprus1)
// Let me try to get it from the provider
async function rpc(method, params) {
  const r = await fetch('https://orchard.rpc.quai.network/cyprus1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
  });
  const d = await r.json();
  if (d.error) throw new Error(`${method}: ${d.error.message}`);
  return d.result;
}

async function run() {
  // Try to get the QI address derivation info from the provider
  // Or use the payment code format
  
  // For now, let's try the simplest approach: 
  // Send QUAI to the EVM address with a specific gas limit
  // that triggers the QI conversion
  
  // Actually, looking at the dex.js code from quai-cli-wallet:
  // The QI address is derived from the mnemonic using qiWallet.getNextAddress()
  // But we can't use QiHDWallet because it blocks
  
  // Alternative: use the QuaiSwap router to get WQI directly
  // But we already determined there's no WQUAI/WQI pool
  
  // Last resort: deploy our own WQI liquidity by sending to the WQI contract
  // via the EVM side
  
  console.log('Deployer:', ADDR);
  
  // Get nonce
  const nonce = await rpc('eth_getTransactionCount', [ADDR, 'latest']);
  console.log('Nonce:', parseInt(nonce, 16));
  
  const gasPrice = await rpc('eth_gasPrice', []);
  console.log('Gas:', gasPrice);
  
  // Sign a tx to wrap QUAI -> WQUAI (this works)
  const signer = new Wallet(PK);
  const WQUAI = '0x005c46f661Baef20671943f2b4c087Df3E7CEb13';
  
  // Encode deposit call
  const iface = new ethers.utils.Interface(['function deposit() payable']);
  const data = iface.encodeFunctionData('deposit');
  
  const signed = await signer.signTransaction({
    to: WQUAI,
    value: parseQuai('10').toString(),
    data,
    gasLimit: 300000,
    gasPrice,
    nonce: parseInt(nonce, 16),
    chainId: 15000,
    type: 0,
  });
  
  const txHash = await rpc('eth_sendRawTransaction', [signed]);
  console.log('✅ TX sent:', txHash);
  console.log('Check: https://orchard.quaiscan.io/tx/' + txHash);
}

run().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
