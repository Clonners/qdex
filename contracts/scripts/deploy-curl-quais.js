/**
 * QDEX Live Deployment — curl for RPC reads, quais for deploy
 *
 * 🔴 APPROVAL REQUIRED — Requires explicit approval from Clonners before execution.
 * This script submits real transactions to Quai Orchard testnet.
 * Do NOT run autonomously. Run only with explicit operator approval.
 *
 * Workaround: Node fetch has issues with Quai RPC. Use curl instead.
 */

const { execSync } = require('child_process');
const { Wallet, ContractFactory, JsonRpcProvider, Interface } = require('quais');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const RPC = 'https://orchard.rpc.quai.network/cyprus1';
const PK = process.env.DEPLOYER_PRIVATE_KEY;

if (!PK) {
  console.error('ERROR: DEPLOYER_PRIVATE_KEY not set in environment or .env file');
  process.exit(1);
}

function rpcCall(method, params = []) {
  const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
  const cmd = `curl -s -m 15 -X POST ${RPC} -H "Content-Type: application/json" -d '${body}'`;
  const res = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
  if (res.error) throw new Error(res.error.message);
  return res.result;
}

async function main() {
  console.log('=== QDEX Deploy (curl + quais) ===\n');
  
  const provider = new JsonRpcProvider(RPC, undefined, { usePathing: true });
  const wallet = new Wallet(PK, provider);
  
  console.log('Deployer:', wallet.address);
  
  const balance = rpcCall('eth_getBalance', [wallet.address, 'latest']);
  console.log('Balance:', BigInt(balance).toString(), 'wei');
  
  const chainIdHex = rpcCall('eth_chainId');
  console.log('Chain ID:', parseInt(chainIdHex, 16));
  
  const nonceHex = rpcCall('eth_getTransactionCount', [wallet.address, 'latest']);
  const nonce = parseInt(nonceHex, 16);
  console.log('Nonce:', nonce);
  
  const gasPriceHex = rpcCall('eth_gasPrice');
  const gasPrice = BigInt(gasPriceHex);
  console.log('Gas price:', gasPrice.toString(), 'wei');
  
  // Read artifact
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/src/Settlement.sol/Settlement.json'), 'utf8')
  );
  
  const bytecode = typeof artifact.bytecode === 'string' ? artifact.bytecode : artifact.bytecode.object;
  
  console.log('\nDeploying Settlement...');
  
  const factory = new ContractFactory(wallet, artifact.abi, bytecode, null);
  
  const deployParams = {
    nonce,
    maxPriorityFeePerGas: 1000000000n,
    maxFeePerGas: gasPrice,
  };
  
  console.log('\nSending deployment tx...');
  const tx = await factory.deploy(deployParams);
  console.log('Tx hash:', tx.hash);
  
  console.log('\nWaiting for deployment (60-120s)...');
  const settlement = await tx.waitForDeployment();
  const receipt = await tx.deploymentTransaction()?.wait();
  
  console.log('\n✅ Deployed!');
  console.log('Block:', receipt?.blockNumber);
  console.log('Gas used:', receipt?.gasUsed?.toString());
  
  const settlementAddr = await settlement.getAddress();
  console.log('Settlement:', settlementAddr);
  
  // Read internal contracts
  console.log('\nReading internal contracts...');
  await new Promise(r => setTimeout(r, 5000));
  
  const iface = new Interface(artifact.abi);
  
  const readAddr = async (fnName) => {
    const data = iface.encodeFunctionData(fnName, []);
    const result = rpcCall('eth_call', [{ to: settlementAddr, data }, 'latest']);
    return '0x' + result.slice(26);
  };
  
  console.log('TradingVault:', await readAddr('vault'));
  console.log('NonceManager:', await readAddr('nonceManager'));
  console.log('MarketRegistry:', await readAddr('marketRegistry'));
  console.log('FeeManager:', await readAddr('feeManager'));
  console.log('DelegateKeyRegistry:', await readAddr('delegateKeyRegistry'));
  
  // Save deployment
  const deployment = {
    network: 'quai-orchard-cyprus1',
    chainId: 15000,
    deployer: wallet.address,
    timestamp: new Date().toISOString(),
    txHash: receipt?.hash || tx.hash,
    blockNumber: receipt?.blockNumber || 0,
    contracts: {
      Settlement: settlementAddr,
      TradingVault: await readAddr('vault'),
      NonceManager: await readAddr('nonceManager'),
      MarketRegistry: await readAddr('marketRegistry'),
      FeeManager: await readAddr('feeManager'),
      DelegateKeyRegistry: await readAddr('delegateKeyRegistry'),
    },
    tokens: {
      WQUAI: '0x005c46f661Baef20671943f2b4c087Df3E7CEb13',
      WQI: '0x002b2596EcF05C93a31ff916E8b456DF6C77c750',
    },
  };
  
  const file = path.join(__dirname, '../services/api/src/deployment-addresses.json');
  fs.writeFileSync(file, JSON.stringify(deployment, null, 2));
  console.log('\n✅ Saved deployment addresses');
  console.log('\n=== Deployment Complete ===');
  console.log('Explorer: https://orchard.quaiscan.io/tx/' + (receipt?.hash || tx.hash));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌', error.message);
    if (error.stack) console.error(error.stack.split('\n').slice(1, 6).join('\n'));
    process.exit(1);
  });
