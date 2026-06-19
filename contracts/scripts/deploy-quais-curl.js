/**
 * Deploy using quais for signing (Quai-native format) and curl for sending
 *
 * Requires explicit approval before running — deploys contracts to Quai Orchard testnet.
 *
 * quais produces Quai-native wire format that Orchard accepts.
 * curl bypasses the 60s timeout of JsonRpcProvider.
 */

const { QuaiHDWallet, Mnemonic, Zone, ContractFactory } = require('quais');
require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
  console.log('=== QDEX Deploy (quais sign + curl send) ===\n');

  const mnemonicPhrase = process.env.DEPLOYER_MNEMONIC || process.env.WALLET_MNEMONIC;
  if (!mnemonicPhrase) {
    console.error('ERROR: DEPLOYER_MNEMONIC (or WALLET_MNEMONIC) not set in environment');
    process.exit(1);
  }
  const mnemonic = Mnemonic.fromPhrase(mnemonicPhrase);
  const hdWallet = QuaiHDWallet.fromMnemonic(mnemonic);
  const addrInfo = hdWallet.getNextAddressSync(0, Zone.Cyprus1);
  
  console.log('Deployer:', addrInfo.address);
  
  // Get nonce and gas via curl
  const nonceHex = rpcCurl('eth_getTransactionCount', [addrInfo.address, 'latest']);
  const nonce = parseInt(nonceHex, 16);
  console.log('Nonce:', nonce);
  
  const gasPriceHex = rpcCurl('eth_gasPrice', []);
  const gasPrice = BigInt(gasPriceHex);
  console.log('Gas price:', Number(gasPrice / 1000000000n), 'gwei');
  
  // Read artifact
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/src/Settlement.sol/Settlement.json'), 'utf8')
  );
  
  const bytecode = artifact.bytecode;
  const abi = artifact.abi;
  const gasLimit = 8_000_000;
  
  // Build deployment tx using ContractFactory
  console.log('Building deployment tx...');
  const ipfsHash = 'Qmaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  
  const factory = new ContractFactory(abi, bytecode, hdWallet, ipfsHash);
  
  // Get the deployment transaction (unsigned)
  console.log('Getting deployment tx...');
  const tx = await factory.getDeployTransaction({
    gasLimit,
    gasPrice,
    nonce,
    chainId: 15000,
  });
  
  console.log('Tx to:', tx.to);
  console.log('Tx data length:', tx.data ? tx.data.length : 0);
  
  // Sign with QuaiHDWallet
  console.log('Signing with quais...');
  const signed = await hdWallet.signTransaction(tx);
  console.log('Signed type:', typeof signed);
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
  const deployedAddr = await factory.computeAddress(txHash);
  console.log('Settlement (computed):', deployedAddr);
  
  console.log('\n⏳ Waiting for confirmation...');
  console.log('Check explorer: https://orchard.quaiscan.io/tx/' + txHash);
}

main().catch(e => {
  console.error('\n❌ Error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
