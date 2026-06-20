/**
 * QDEX Raw Deployment — Manual sign + send via eth_sendRawTransaction
 * 
 * Uses Wallet(PK, provider) to sign the deployment tx offline,
 * then sends via curl to avoid quais timeout issues.
 */

const { Wallet, JsonRpcProvider, Interface, computeAddress } = require('quais');
const { execSync } = require('child_process');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const RPC = 'https://orchard.rpc.quai.network/cyprus1';
const PK = process.env.DEPLOYER_PRIVATE_KEY;

if (!PK) {
  console.error('ERROR: DEPLOYER_PRIVATE_KEY not set');
  process.exit(1);
}

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
  console.log('=== QDEX Raw Deploy ===\n');
  
  const provider = new JsonRpcProvider(RPC, undefined, { usePathing: true });
  const wallet = new Wallet(PK, provider);
  
  console.log('Deployer:', wallet.address);
  
  const balanceHex = rpcCall('eth_getBalance', [wallet.address, 'latest']);
  console.log('Balance:', BigInt(balanceHex).toString(), 'wei');
  
  const nonceHex = rpcCall('eth_getTransactionCount', [wallet.address, 'latest']);
  const nonce = parseInt(nonceHex, 16);
  console.log('Nonce:', nonce);
  
  const gasPriceHex = rpcCall('eth_gasPrice');
  const gasPrice = BigInt(gasPriceHex);
  console.log('Gas price:', gasPrice.toString(), 'wei');
  
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/src/Settlement.sol/Settlement.json'), 'utf8')
  );
  
  const bytecode = typeof artifact.bytecode === 'string' ? artifact.bytecode : artifact.bytecode.object;
  
  console.log('\nBuilding deployment tx...');
  
  const gasLimit = 15_000_000n; // Higher limit for Settlement + 5 internal contracts
  const txRequest = {
      to: null,
      data: bytecode,
      value: 0n,
      nonce: nonce,
      gasLimit: gasLimit,
      gasPrice: gasPrice,
      chainId: 15000,
      type: 2, // Quai UTXO type
    };
  
  console.log('Signing tx...');
  const signedTx = await wallet.signTransaction(txRequest);
  console.log('Signed:', signedTx.slice(0, 66) + '...');
  
  console.log('\nSending tx...');
  const txHash = rpcCall('eth_sendRawTransaction', [signedTx]);
  console.log('✅ Tx sent:', txHash);
  
  // Compute deployed address
  const settlementAddr = computeAddress({ from: wallet.address, nonce: nonce });
  console.log('Expected address:', settlementAddr);
  
  // Poll for receipt
  console.log('\nPolling for receipt (5s intervals, max 5min)...');
  let receipt = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      receipt = rpcCall('eth_getTransactionReceipt', [txHash]);
      if (receipt) {
        console.log(`✅ Receipt after ${(i+1)*5}s`);
        break;
      }
    } catch {}
    if ((i+1) % 12 === 0) console.log(`  ... attempt ${i+1}/60`);
  }
  
  if (!receipt) {
    console.log('⚠️ Pending. Check: https://orchard.quaiscan.io/tx/' + txHash);
    console.log('Expected Settlement address:', settlementAddr);
    return;
  }
  
  if (receipt.status !== '0x1') {
    console.log('❌ Reverted! Check: https://orchard.quaiscan.io/tx/' + txHash);
    return;
  }
  
  console.log('\n✅ Deployed!');
  console.log('Block:', receipt.blockNumber);
  console.log('Gas used:', BigInt(receipt.gasUsed).toString());
  console.log('Settlement:', settlementAddr);
  console.log('Explorer: https://orchard.quaiscan.io/tx/' + txHash);
  
  // Read internal contracts
  console.log('\nReading internal contracts...');
  await new Promise(r => setTimeout(r, 10000));
  
  const abi = Array.isArray(artifact.abi) ? artifact.abi : Object.values(artifact.abi);
  const iface = new Interface(abi);
  
  const readAddr = (fnName) => {
    const data = iface.encodeFunctionData(fnName, []);
    const result = rpcCall('eth_call', [{ to: settlementAddr, data }, 'latest']);
    return '0x' + result.slice(26).toLowerCase();
  };
  
  const vaultAddr = readAddr('vault');
  const nonceAddr = readAddr('nonceManager');
  const marketAddr = readAddr('marketRegistry');
  const feeAddr = readAddr('feeManager');
  const delegateAddr = readAddr('delegateKeyRegistry');
  
  console.log('TradingVault:', vaultAddr);
  console.log('NonceManager:', nonceAddr);
  console.log('MarketRegistry:', marketAddr);
  console.log('FeeManager:', feeAddr);
  console.log('DelegateKeyRegistry:', delegateAddr);
  
  // Save deployment
  const deployment = {
    network: 'quai-orchard-cyprus1',
    chainId: 15000,
    deployer: wallet.address,
    timestamp: new Date().toISOString(),
    txHash,
    blockNumber: Number(receipt.blockNumber),
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
  
  const file = path.join(__dirname, '../services/api/src/deployment-addresses.json');
  fs.writeFileSync(file, JSON.stringify(deployment, null, 2));
  console.log('\n✅ Saved deployment addresses');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌', error.message);
    if (error.stack) console.error(error.stack.split('\n').slice(1, 6).join('\n'));
    process.exit(1);
  });
