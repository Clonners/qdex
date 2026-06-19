/**
 * Manual deploy: sign with ethers, send via quais provider
 *
 * ⚠️ APPROVAL REQUIRED — This script deploys contracts to Quai Orchard testnet.
 * Requires explicit approval from Clonners before running.
 *
 * ethers.js can sign offline (no RPC needed).
 * quais JsonRpcProvider can send raw signed transactions to Quai.
 */

const ethers = require('ethers');
const { JsonRpcProvider, computeAddress } = require('quais');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const RPC_URL = 'https://orchard.rpc.quai.network/cyprus1';
const GAS_LIMIT = 8_000_000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== QDEX Manual Deploy ===\n');
  
  const PK = process.env.DEPLOYER_PRIVATE_KEY;
  if (!PK) throw new Error('DEPLOYER_PRIVATE_KEY not set');
  
  const ethersWallet = new ethers.Wallet(PK);
  console.log('Deployer:', ethersWallet.address);
  
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/src/Settlement.sol/Settlement.json'), 'utf8')
  );
  
  const bytecode = artifact.bytecode; // Already has 0x prefix
  
  // Get gas price from provider
  const provider = new JsonRpcProvider(RPC_URL);
  const gasPriceHex = await provider.send('eth_gasPrice', []);
  const gasPrice = BigInt(gasPriceHex);
  
  // Get nonce
  const nonceHex = await provider.send('eth_getTransactionCount', [ethersWallet.address, 'latest']);
  const nonce = Number(nonceHex);
  
  console.log('Nonce:', nonce);
  console.log('Gas price:', gasPrice.toString(), 'wei', Number(gasPrice / 1000000000n), 'gwei');
  console.log('Gas limit:', GAS_LIMIT);
  console.log('Cost estimate:', (GAS_LIMIT * Number(gasPrice) / 1e18).toFixed(4), 'QUAI');
  
  // Build and sign transaction with ethers (offline, no RPC)
  const tx = await ethersWallet.signTransaction({
    to: null, // Contract deployment
    data: bytecode,
    nonce: nonce,
    gasLimit: GAS_LIMIT,
    gasPrice: gasPrice,
    chainId: 15000,
  });
  
  console.log('\nSigned tx:', tx.slice(0, 66) + '...');
  
  // Send raw signed transaction via quais provider
  console.log('Sending...');
  const hash = await provider.sendRawTransaction(tx);
  console.log('✅ Tx sent:', hash);
  
  // Poll for receipt
  console.log('Polling for receipt (5s intervals, max 5 min)...');
  let receipt = null;
  const maxAttempts = 60;
  
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(5000);
    try {
      receipt = await provider.send('eth_getTransactionReceipt', [hash]);
      if (receipt) {
        console.log(`✅ Receipt found after ${(i + 1) * 5}s`);
        break;
      }
    } catch (e) {
      // Continue polling
    }
  }
  
  if (!receipt) {
    console.log('⚠️ Receipt not found. Tx pending on chain.');
    console.log('Check: https://orchard.quaiscan.io/tx/' + hash);
    
    const deployFile = path.join(__dirname, '../services/api/src/pending-deploy.json');
    fs.writeFileSync(deployFile, JSON.stringify({
      txHash: hash,
      deployer: ethersWallet.address,
      timestamp: new Date().toISOString(),
      status: 'pending',
    }, null, 2));
    process.exit(0);
  }
  
  if (receipt.status !== '0x1') {
    throw new Error('Deployment reverted! https://orchard.quaiscan.io/tx/' + hash);
  }
  
  // Compute deployed address
  const settlementAddr = computeAddress({ from: ethersWallet.address, nonce: nonce });
  
  console.log('\n✅ Deployment successful!');
  console.log('Block:', receipt.blockNumber);
  console.log('Gas used:', receipt.gasUsed);
  console.log('Settlement:', settlementAddr);
  console.log('Explorer: https://orchard.quaiscan.io/tx/' + hash);
  
  // Read internal contract addresses from Settlement
  console.log('\nReading internal contracts...');
  await sleep(5000);
  
  const iface = new ethers.Interface(artifact.abi);
  
  const readAddr = async (fnName) => {
    const data = iface.encodeFunctionData(fnName, []);
    const result = await provider.send('eth_call', [{ to: settlementAddr, data }, 'latest']);
    return '0x' + result.slice(26);
  };
  
  const vaultAddr = await readAddr('vault');
  const nonceAddr = await readAddr('nonceManager');
  const marketAddr = await readAddr('marketRegistry');
  const feeAddr = await readAddr('feeManager');
  const delegateAddr = await readAddr('delegateKeyRegistry');
  
  console.log('TradingVault:', vaultAddr);
  console.log('NonceManager:', nonceAddr);
  console.log('MarketRegistry:', marketAddr);
  console.log('FeeManager:', feeAddr);
  console.log('DelegateKeyRegistry:', delegateAddr);
  
  // Save deployment addresses
  const deployment = {
    network: 'quai-orchard-cyprus1',
    chainId: 15000,
    deployer: ethersWallet.address,
    timestamp: new Date().toISOString(),
    txHash: hash,
    blockNumber: receipt.blockNumber,
    contracts: {
      Settlement: settlementAddr,
      TradingVault: vaultAddr,
      NonceManager: nonceAddr,
      MarketRegistry: marketAddr,
      FeeManager: feeAddr,
      DelegateKeyRegistry: delegateAddr,
    },
    tokens: {
      WQUAI: '0x005c46f661Baef20671943f2b4c087Df3E7CEb13',
      WQI: '0x002b2596EcF05C93a31ff916E8b456DF6C77c750',
    },
  };
  
  const deployFile = path.join(__dirname, '../services/api/src/deployment-addresses.json');
  fs.writeFileSync(deployFile, JSON.stringify(deployment, null, 2));
  console.log('\n✅ Saved to services/api/src/deployment-addresses.json');
}

main().catch(e => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
