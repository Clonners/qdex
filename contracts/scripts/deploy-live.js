/**
 * QDEX Live Deployment — quais Wallet + ContractFactory
 *
 * 🔴 APPROVAL REQUIRED — Requires explicit approval from Clonners before execution.
 * This script submits real transactions to Quai Orchard testnet.
 * Do NOT run autonomously. Run only with explicit operator approval.
 *
 * Uses quais Wallet with private key directly.
 * ContractFactory.deploy() handles Quai wire format correctly.
 */

const { Wallet, ContractFactory, JsonRpcProvider } = require('quais');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const RPC = 'https://orchard.rpc.quai.network/cyprus1';
const PK = process.env.DEPLOYER_PRIVATE_KEY;

if (!PK) {
  console.error('ERROR: DEPLOYER_PRIVATE_KEY not set in environment or .env file');
  process.exit(1);
}

async function main() {
  console.log('=== QDEX Deploy (live) ===\n');
  
  const provider = new JsonRpcProvider(RPC, undefined, { usePathing: true });
  const wallet = new Wallet(PK, provider);
  
  console.log('Deployer:', wallet.address);
  console.log('RPC:', RPC);
  
  // Get balance
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', balance.toString(), 'wei');
  
  // Get chainId
  const network = await provider.getNetwork();
  console.log('Chain ID:', network.chainId);
  
  if (network.chainId !== 15000) {
    throw new Error(`Expected chainId 15000 (Orchard), got ${network.chainId}`);
  }
  
  // Read Settlement artifact
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/src/Settlement.sol/Settlement.json'), 'utf8')
  );
  
  console.log('\nDeploying Settlement...');
  
  const factory = new ContractFactory(wallet, artifact.abi, artifact.bytecode.object, null);
  
  // Get nonce
  const nonce = await provider.getTransactionCount(wallet.address, 'latest');
  console.log('Nonce:', nonce);
  
  // Gas params
  const gasPrice = await provider.getGasPrice();
  console.log('Gas price:', gasPrice.toString(), 'wei');
  
  const deployParams = {
    nonce,
    maxPriorityFeePerGas: 1000000000n,
    maxFeePerGas: gasPrice,
  };
  
  console.log('\nSending deployment tx...');
  const tx = await factory.deploy(deployParams);
  console.log('Tx hash:', tx.hash);
  console.log('Contract address (pending):', await tx.getAddress());
  
  console.log('\nWaiting for deployment (this may take 60-120s)...');
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
  
  const vaultAddr = await settlement.vault();
  const nonceAddr = await settlement.nonceManager();
  const marketAddr = await settlement.marketRegistry();
  const feeAddr = await settlement.feeManager();
  const delegateAddr = await settlement.delegateKeyRegistry();
  
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
