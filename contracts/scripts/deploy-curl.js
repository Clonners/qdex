/**
 * Deploy using ethers.js for signing (offline) and curl for sending
 *
 * ⚠️ APPROVAL REQUIRED — This script deploys contracts to Quai Orchard testnet.
 * Requires explicit approval from Clonners before running.
 *
 * ethers.js signs offline - no RPC needed for signing.
 * curl sends the signed tx directly to RPC.
 */

const ethers = require('ethers');
const { execSync } = require('child_process');
const fs = require('fs');

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
  console.log('=== QDEX Deploy (ethers sign + curl send) ===\n');
  
  const PK = process.env.DEPLOYER_PRIVATE_KEY;
  if (!PK) throw new Error('DEPLOYER_PRIVATE_KEY not set');
  
  const wallet = new ethers.Wallet(PK);
  console.log('Deployer:', wallet.address);
  
  // Get nonce and gas via curl (fast)
  const nonceHex = rpcCurl('eth_getTransactionCount', [wallet.address, 'latest']);
  const nonce = parseInt(nonceHex, 16);
  console.log('Nonce:', nonce);
  
  const gasPriceHex = rpcCurl('eth_gasPrice', []);
  const gasPrice = BigInt(gasPriceHex);
  console.log('Gas price:', Number(gasPrice / 1000000000n), 'gwei');
  
  // Read artifact
  const artifact = JSON.parse(
    fs.readFileSync('artifacts/src/Settlement.sol/Settlement.json', 'utf8')
  );
  const bytecode = artifact.bytecode;
  
  // Sign offline with ethers (no RPC needed)
  const gasLimit = 8_000_000;
  const costQuai = (gasLimit * Number(gasPrice) / 1e18).toFixed(4);
  console.log('Gas limit:', gasLimit);
  console.log('Cost:', costQuai, 'QUAI\n');
  
  console.log('Signing...');
  const signed = await wallet.signTransaction({
    to: null,
    data: bytecode,
    nonce,
    gasLimit,
    gasPrice,
    chainId: 15000,
  });
  
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
  console.log('✅ Tx sent:', txHash);
  console.log('Explorer: https://orchard.quaiscan.io/tx/' + txHash);
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
