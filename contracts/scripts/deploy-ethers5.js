/**
 * Deploy using ethers.js v5 for signing (may be compatible with Quai)
 * Send via curl directly to RPC
 *
 * ⚠️ APPROVAL REQUIRED — This script deploys contracts to Quai Orchard testnet.
 * Requires explicit approval from Clonners before running.
 */

const ethers = require('ethers');
const { execSync } = require('child_process');
const fs = require('fs');
require('dotenv').config({ path: '.env' });

const RPC = 'https://orchard.rpc.quai.network/cyprus1';

function rpcCurl(method, params = []) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const result = execSync(
    `curl -s --max-time 10 -X POST ${RPC} -H 'Content-Type: application/json' -d '${body}'`,
    { encoding: 'utf8' }
  );
  const data = JSON.parse(result);
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

async function main() {
  console.log('=== QDEX Deploy (ethers v5) ===\n');
  
  const PK = process.env.DEPLOYER_PRIVATE_KEY;
  if (!PK) throw new Error('DEPLOYER_PRIVATE_KEY not set');
  
  // Use ethers v5 Wallet (offline signing, no provider)
  const wallet = new ethers.Wallet(PK);
  
  console.log('Deployer:', wallet.address);
  console.log('ethers version:', ethers.version);
  
  // Get nonce via curl (fast)
  const nonceHex = rpcCurl('eth_getTransactionCount', [wallet.address, 'latest']);
  const nonce = parseInt(nonceHex, 16);
  console.log('Nonce:', nonce);
  
  // Get gas price via curl
  const gasPriceHex = rpcCurl('eth_gasPrice', []);
  const gasPrice = ethers.BigNumber.from(gasPriceHex);
  console.log('Gas price:', gasPrice.toString(), 'wei');
  
  // Read artifact
  const artifact = JSON.parse(
    fs.readFileSync('artifacts/src/Settlement.sol/Settlement.json', 'utf8')
  );
  
  const gasLimit = 8_000_000;
  const costQuai = ethers.utils.formatEther(gasPrice.mul(gasLimit));
  console.log('Gas limit:', gasLimit);
  console.log('Cost:', costQuai, 'QUAI\n');
  
  // Build and sign deployment transaction
  console.log('Building tx...');
  const tx = {
    data: artifact.bytecode,
    nonce,
    gasLimit,
    gasPrice,
    chainId: 15000,
  };
  
  console.log('Signing...');
  const signed = await wallet.signTransaction(tx);
  console.log('Signed:', signed.slice(0, 50) + '...\n');
  
  // Send via curl
  console.log('Sending via curl...');
  const txBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_sendRawTransaction',
    params: [signed],
  });
  
  const txResult = execSync(
    `curl -s --max-time 30 -X POST ${RPC} -H 'Content-Type: application/json' -d '${txBody}'`,
    { encoding: 'utf8' }
  );
  
  const txData = JSON.parse(txResult);
  if (txData.error) throw new Error(txData.error.message);
  
  const txHash = txData.result;
  console.log('\n✅ Tx sent:', txHash);
  console.log('Explorer: https://orchard.quaiscan.io/tx/' + txHash);
  
  // Compute deployed address
  const deployedAddr = ethers.utils.getCreateAddress({
    from: wallet.address,
    nonce: nonce,
  });
  console.log('Settlement (computed):', deployedAddr);
  
  console.log('\n⏳ Waiting for confirmation (check explorer or poll later)...');
  console.log('To poll: curl -s -X POST ' + RPC + ' -H "Content-Type: application/json" -d \'{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["' + txHash + '"]}\'');
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
