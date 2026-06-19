/**
 * Deploy QDEX contracts to Orchard using native fetch
 *
 * ⚠️ APPROVAL REQUIRED — This script deploys contracts to Quai Orchard testnet.
 * Requires explicit approval from Clonners before running.
 */

const ethers = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const RPC = 'https://orchard.rpc.quai.network/cyprus1';

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== QDEX Deploy (fetch) ===\n');
  
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY);
  console.log('Deployer:', wallet.address);
  
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/src/Settlement.sol/Settlement.json'), 'utf8')
  );
  
  const nonce = parseInt(await rpc('eth_getTransactionCount', [wallet.address, 'latest']), 16);
  const gasPrice = BigInt(await rpc('eth_gasPrice', []));
  const gasLimit = 8_000_000;
  
  console.log('Nonce:', nonce);
  console.log('Gas:', (gasLimit * Number(gasPrice) / 1e18).toFixed(4), 'QUAI\n');
  
  // Sign
  const signed = await wallet.signTransaction({
    to: null, data: artifact.bytecode, nonce, gasLimit, gasPrice, chainId: 15000,
  });
  
  // Send
  const txHash = await rpc('eth_sendRawTransaction', [signed]);
  console.log('✅ Tx sent:', txHash);
  
  // Poll
  let receipt = null;
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    try {
      receipt = await rpc('eth_getTransactionReceipt', [txHash]);
      if (receipt) break;
    } catch {}
    if ((i+1) % 12 === 0) console.log(`  ... attempt ${i+1}/60`);
  }
  
  if (!receipt) {
    console.log('⚠️ Pending. Check: https://orchard.quaiscan.io/tx/' + txHash);
    return;
  }
  
  if (receipt.status !== '0x1') throw new Error('Reverted');
  
  const addr = ethers.computeAddress({ from: wallet.address, nonce });
  console.log('\n✅ Deployed! Block:', parseInt(receipt.blockNumber, 16));
  console.log('Settlement:', addr);
  
  // Read internal contracts
  await sleep(3000);
  const iface = new ethers.Interface(artifact.abi);
  
  const read = async (fn) => {
    const data = iface.encodeFunctionData(fn, []);
    const r = await rpc('eth_call', [{ to: addr, data }, 'latest']);
    return '0x' + r.slice(26);
  };
  
  const vault = await read('vault');
  const nonceMgr = await read('nonceManager');
  const market = await read('marketRegistry');
  const fee = await read('feeManager');
  const delegate = await read('delegateKeyRegistry');
  
  console.log('TradingVault:', vault);
  console.log('NonceManager:', nonceMgr);
  console.log('MarketRegistry:', market);
  console.log('FeeManager:', fee);
  console.log('DelegateKeyRegistry:', delegate);
  
  // Save
  const deployment = {
    network: 'quai-orchard-cyprus1', chainId: 15000,
    deployer: wallet.address,
    timestamp: new Date().toISOString(),
    txHash, blockNumber: parseInt(receipt.blockNumber, 16),
    contracts: { Settlement: addr, TradingVault: vault, NonceManager: nonceMgr, MarketRegistry: market, FeeManager: fee, DelegateKeyRegistry: delegate },
    tokens: { WQUAI: '0x005c46f661Baef20671943f2b4c087Df3E7CEb13', WQI: '0x002b2596EcF05C93a31ff916E8b456DF6C77c750' },
  };
  
  fs.writeFileSync(
    path.join(__dirname, '../services/api/src/deployment-addresses.json'),
    JSON.stringify(deployment, null, 2)
  );
  console.log('\n✅ Saved. Explorer: https://orchard.quaiscan.io/tx/' + txHash);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
