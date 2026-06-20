/**
 * Test deploy SimpleStorage to verify quais compatibility
 */

const { Wallet, JsonRpcProvider } = require('quais');
const { execSync } = require('child_process');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const RPC = 'https://orchard.rpc.quai.network/cyprus1';
const PK = process.env.DEPLOYER_PRIVATE_KEY;

function rpcCall(method, params = [], retries = 3) {
  const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
  const cmd = `curl -s -m 15 -X POST ${RPC} -H "Content-Type: application/json" -d '${body}'`;
  
  for (let i = 0; i < retries; i++) {
    try {
      const res = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
      if (res.error) throw new Error(res.error.message);
      return res.result;
    } catch (e) {
      if (i === retries - 1) throw e;
      console.log(`  RPC retry ${i+1}/${retries}...`);
      execSync(`sleep ${5 * (i + 1)}`, { encoding: 'utf8' });
    }
  }
}

async function main() {
  console.log('=== Test Deploy SimpleStorage ===\n');
  
  const provider = new JsonRpcProvider(RPC, undefined, { usePathing: true });
  const wallet = new Wallet(PK, provider);
  
  console.log('Deployer:', wallet.address);
  
  const nonceHex = rpcCall('eth_getTransactionCount', [wallet.address, 'latest']);
  const nonce = parseInt(nonceHex, 16);
  console.log('Nonce:', nonce);
  
  const gasPriceHex = rpcCall('eth_gasPrice');
  const gasPrice = BigInt(gasPriceHex);
  console.log('Gas price:', gasPrice.toString(), 'wei');
  
  // Use SimpleStorage bytecode
  const artifact = JSON.parse(
    fs.readFileSync('/home/clonners/worktrees/quais_sdk_live/examples/contracts/artifacts/SimpleStorage.json', 'utf8')
  );
  
  const bytecode = typeof artifact.bytecode === 'string' ? artifact.bytecode : artifact.bytecode.object;
  
  console.log('\nDeploying SimpleStorage...');
  
  const gasLimit = 1_000_000n;
  const txRequest = {
    to: null,
    data: bytecode,
    value: 0n,
    nonce: nonce,
    gasLimit: gasLimit,
    gasPrice: gasPrice,
    chainId: 15000,
    type: 2, // Quai UTXO
  };
  
  console.log('Signing tx...');
  const signedTx = await wallet.signTransaction(txRequest);
  console.log('Signed:', signedTx.slice(0, 66) + '...');
  
  console.log('\nSending tx...');
  const txHash = rpcCall('eth_sendRawTransaction', [signedTx]);
  console.log('✅ Tx sent:', txHash);
  
  // Poll for receipt
  console.log('\nPolling for receipt...');
  let receipt = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      receipt = rpcCall('eth_getTransactionReceipt', [txHash]);
      if (receipt) {
        console.log(`✅ Receipt after ${(i+1)*5}s`);
        break;
      }
    } catch {}
    if ((i+1) % 6 === 0) console.log(`  ... attempt ${i+1}/30`);
  }
  
  if (!receipt) {
    console.log('⚠️ Pending. Check: https://orchard.quaiscan.io/tx/' + txHash);
    return;
  }
  
  if (receipt.status !== '0x1') {
    console.log('❌ Reverted! Check: https://orchard.quaiscan.io/tx/' + txHash);
    return;
  }
  
  console.log('\n✅ Deployed!');
  console.log('Contract:', receipt.contractAddress);
  console.log('Block:', receipt.blockNumber);
  console.log('Gas used:', BigInt(receipt.gasUsed).toString());
  console.log('Explorer: https://orchard.quaiscan.io/tx/' + txHash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌', error.message);
    if (error.stack) console.error(error.stack.split('\n').slice(1, 6).join('\n'));
    process.exit(1);
  });
