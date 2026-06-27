/**
 * QDEX Direct Deploy — signs tx locally, sends via eth_sendRawTransaction
 * Bypasses quais JsonRpcProvider timeout issues.
 */

import { Wallet, ContractFactory, Interface } from 'quais';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RPC = 'https://orchard.rpc.quai.network/cyprus1';

// Read deployer key from .env
const envContent = readFileSync(join(__dirname, '..', '.env'), 'utf8');
const match = envContent.match(/DEPLOYER_PRIVATE_KEY=(.*)/);
if (!match) {
  console.error('DEPLOYER_PRIVATE_KEY not found in .env');
  process.exit(1);
}
const PK = match[1].trim();

function rpcCall(method, params = [], retries = 5) {
  const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
  for (let i = 0; i < retries; i++) {
    try {
      const cmd = `curl -s -m 30 -X POST ${RPC} -H "Content-Type: application/json" -d '${body}'`;
      const res = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
      if (res.error) throw new Error(res.error.message);
      return res.result;
    } catch (e) {
      if (i === retries - 1) throw e;
      console.log(`  RPC retry ${i+1}/${retries}...`);
      execSync(`sleep ${3 * (i + 1)}`, { encoding: 'utf8' });
    }
  }
}

async function main() {
  console.log('=== QDEX Direct Deploy (raw tx) ===\n');

  const wallet = new Wallet(PK);
  console.log('Deployer:', wallet.address);

  // RPC reads via curl
  const balanceHex = rpcCall('eth_getBalance', [wallet.address, 'latest']);
  console.log('Balance:', BigInt(balanceHex).toString(), 'wei');

  const chainIdHex = rpcCall('eth_chainId');
  const chainId = parseInt(chainIdHex, 16);
  console.log('Chain ID:', chainId);

  const nonceHex = rpcCall('eth_getTransactionCount', [wallet.address, 'latest']);
  const nonce = parseInt(nonceHex, 16);
  console.log('Nonce:', nonce);

  const gasPriceHex = rpcCall('eth_gasPrice');
  const gasPrice = BigInt(gasPriceHex);
  console.log('Gas price:', gasPrice.toString(), 'wei');

  // Read Settlement artifact
  const artifact = JSON.parse(
    readFileSync(join(__dirname, '..', 'artifacts', 'src', 'Settlement.sol', 'Settlement.json'), 'utf8')
  );
  const bytecode = typeof artifact.bytecode === 'string' ? artifact.bytecode : artifact.bytecode.object;
  const abi = Array.isArray(artifact.abi) ? artifact.abi : Object.values(artifact.abi);

  console.log('\nBuilding deploy tx...');
  console.log('Bytecode size:', bytecode.length, 'chars');

  // Estimate gas
  console.log('Estimating gas...');
  const estimateResult = rpcCall('eth_estimateGas', [{
    from: wallet.address,
    data: bytecode,
    gasPrice: '0x' + gasPrice.toString(16),
  }]);
  const gasLimit = BigInt(estimateResult) * BigInt(120) / BigInt(100); // 20% buffer
  console.log('Gas estimate:', estimateResult, '→ Gas limit:', gasLimit.toString());

  // Build tx
  const tx = {
    from: wallet.address,
    to: null, // contract deployment
    nonce,
    gasLimit: '0x' + gasLimit.toString(16),
    gasPrice: '0x' + gasPrice.toString(16),
    value: '0x0',
    data: bytecode,
    chainId,
  };

  console.log('\nSigning tx...');
  const signedTx = await wallet.signTransaction(tx);
  console.log('Signed tx:', signedTx.slice(0, 66) + '...');

  console.log('\nSending tx...');
  const txHash = rpcCall('eth_sendRawTransaction', [signedTx]);
  console.log('Tx hash:', txHash);

  console.log('\nWaiting for confirmation (polling every 10s)...');
  let receipt = null;
  let attempts = 0;
  const maxAttempts = 60; // 10 min max

  while (!receipt && attempts < maxAttempts) {
    attempts++;
    try {
      const result = rpcCall('eth_getTransactionReceipt', [txHash]);
      if (result) {
        receipt = result;
        break;
      }
    } catch (e) {
      // receipt not ready yet
    }
    if (attempts % 6 === 0) {
      console.log(`  Still waiting... (${attempts * 10}s)`);
    }
    execSync('sleep 10', { encoding: 'utf8' });
  }

  if (!receipt) {
    console.log('\n⚠️  Tx not confirmed after timeout, but it may still be pending.');
    console.log('Check: https://orchard.quaiscan.io/tx/' + txHash);
    // Still try to compute address
    const txResult = rpcCall('eth_getTransactionByHash', [txHash]);
    if (txResult) {
      const fromAddr = txResult.from;
      const txNonce = parseInt(txResult.nonce, 16);
      // Compute contract address
      const { keccak256 } = await import('quais/lib/ethers.js');
      const addr = '0x' + keccak256({
        bytes: [
          ...Buffer.from(fromAddr.slice(2), 'hex'),
          ...Buffer.from(txNonce.toString(16).padStart(8, '0'), 'hex'),
        ],
      }).slice(26);
      console.log('Predicted contract address:', addr);
    }
    console.log('\nTx hash:', txHash);
    console.log('Explorer: https://orchard.quaiscan.io/tx/' + txHash);
    return;
  }

  console.log('\n✅ Deployed!');
  console.log('Block:', receipt.blockNumber);
  console.log('Gas used:', receipt.gasUsed);
  console.log('Contract:', receipt.contractAddress);

  const settlementAddr = receipt.contractAddress;

  // Read internal contracts
  console.log('\nReading internal contracts...');
  await new Promise(r => setTimeout(r, 5000));

  const iface = new Interface(abi);

  const readAddr = (fnName) => {
    const data = iface.encodeFunctionData(fnName, []);
    const result = rpcCall('eth_call', [{ to: settlementAddr, data }, 'latest']);
    return '0x' + result.slice(26);
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

  // Save deployment addresses
  const deployment = {
    network: 'quai-orchard-cyprus1',
    chainId: 15000,
    deployer: wallet.address,
    timestamp: new Date().toISOString(),
    txHash,
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

  const outputPath = join(__dirname, '..', 'services', 'api', 'src', 'deployment-addresses.json');
  const { writeFileSync: writeFile } = await import('fs');
  const { join: pathJoin } = await import('path');
  
  // Ensure output directory exists
  const { execSync: exec } = await import('child_process');
  exec(`mkdir -p ${pathJoin(outputPath, '..')}`);
  writeFile(outputPath, JSON.stringify(deployment, null, 2));
  console.log('\n✅ Saved deployment addresses');

  console.log('\n=== Deployment Complete ===');
  console.log('Explorer: https://orchard.quaiscan.io/tx/' + txHash);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\n❌', e.message);
    console.error(e.stack?.split('\n').slice(1, 5).join('\n'));
    process.exit(1);
  });
