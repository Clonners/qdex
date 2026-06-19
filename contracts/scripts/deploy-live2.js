/**
 * QDEX Live Deployment — fetch for reads, quais for deploy
 *
 * 🔴 APPROVAL REQUIRED — Requires explicit approval from Clonners before execution.
 * This script submits real transactions to Quai Orchard testnet.
 * Do NOT run autonomously. Run only with explicit operator approval.
 *
 * Workaround: quais JsonRpcProvider has low internal timeout.
 * Use fetch() for balance/nonce/gas, then ContractFactory for deploy.
 */

const { Wallet, ContractFactory, JsonRpcProvider } = require('quais');
const { execSync } = require('child_process');
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
  console.log('=== QDEX Deploy (live v2) ===\n');
  
  const provider = new JsonRpcProvider(RPC, undefined, { usePathing: true });
  const wallet = new Wallet(PK, provider);
  
  console.log('Deployer:', wallet.address);
  
  // Use curl for reads
  const balanceHex = rpcCall('eth_getBalance', [wallet.address, 'latest']);
  console.log('Balance:', BigInt(balanceHex).toString(), 'wei');
  
  const chainIdHex = rpcCall('eth_chainId');
  const chainId = parseInt(chainIdHex, 16);
  console.log('Chain ID:', chainId);
  
  if (chainId !== 15000) {
    throw new Error(`Expected chainId 15000 (Orchard), got ${chainId}`);
  }
  
  const nonceHex = rpcCall('eth_getTransactionCount', [wallet.address, 'latest']);
  const nonce = parseInt(nonceHex, 16);
  console.log('Nonce:', nonce);
  
  const gasPriceHex = rpcCall('eth_gasPrice');
  const gasPrice = BigInt(gasPriceHex);
  console.log('Gas price:', gasPrice.toString(), 'wei');
  
  // Read Settlement artifact
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/src/Settlement.sol/Settlement.json'), 'utf8')
  );
  
  console.log('\nDeploying Settlement...');
  
  const bytecode = typeof artifact.bytecode === 'string' ? artifact.bytecode : artifact.bytecode.object;
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
  
  // Read internal contracts via eth_call
  console.log('\nReading internal contracts...');
  await new Promise(r => setTimeout(r, 5000));
  
  const abi = artifact.abi;
  const iface = new (require('quais').Interface)(abi);
  
  const readAddr = (fnName) => {
    const data = iface.encodeFunctionData(fnName, []);
    const result = rpcCall('eth_call', [{ to: settlementAddr, data }, 'latest']);
    return '0x' + result.slice(26);
  };
  
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
    txHash: receipt?.hash || tx.hash,
    blockNumber: receipt?.blockNumber || 0,
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
