/**
 * QDEX Testnet Deployment using quais library
 *
 * ⚠️ APPROVAL REQUIRED — This script deploys contracts to Quai Orchard testnet.
 * Requires explicit approval from Clonners before running.
 *
 * Uses quais instead of hardhat-ethers for better Quai compatibility.
 *
 * Usage:
 *   node scripts/deploy-quais.js
 */

const { ethers } = require('hardhat');
const { JsonRpcProvider, Wallet, ContractFactory } = require('quais');
require('dotenv').config();

const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
const RPC_URL = 'https://orchard.rpc.quai.network/cyprus1';

async function main() {
  console.log('=== QDEX Testnet Deployment (quais) ===\n');
  
  if (!DEPLOYER_PK) {
    throw new Error('DEPLOYER_PRIVATE_KEY not set in .env');
  }
  
  const provider = new JsonRpcProvider(RPC_URL);
  const deployer = new Wallet(DEPLOYER_PK, provider);
  
  console.log('Deployer:', deployer.address);
  console.log('RPC:', RPC_URL);
  
  const balance = await provider.getBalance(deployer.address);
  console.log('Balance:', balance.toString(), 'wei\n');
  
  const chainId = await provider.getNetwork().then(n => n.chainId);
  console.log('Chain ID:', chainId);
  
  if (chainId !== 15000) {
    throw new Error(`Expected chainId 15000 (Orchard), got ${chainId}`);
  }
  
  // Load Settlement artifact
  const fs = require('fs');
  const path = require('path');
  const settlementArtifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/src/Settlement.sol/Settlement.json'), 'utf8')
  );
  
  console.log('\nDeploying Settlement...');
  
  const factory = new ContractFactory(
    deployer,
    settlementArtifact.abi,
    settlementArtifact.bytecode.object
  );
  
  // Deploy with explicit gas limit (estimate × 2 for safety)
  const gasEstimate = await factory.estimateGas.deploy();
  const gasLimit = gasEstimate * 2n;
  console.log('Estimated gas:', gasEstimate.toString());
  console.log('Using gas limit:', gasLimit.toString());
  
  const tx = await factory.deploy({ gasLimit });
  console.log('Deployment tx sent:', tx.hash);
  
  const settlement = await tx.waitForDeployment();
  const settlementAddress = await settlement.getAddress();
  console.log('✅ Settlement deployed:', settlementAddress);
  
  // Get receipt
  const receipt = await tx.deploymentTransaction()?.wait();
  console.log('Block:', receipt?.blockNumber);
  console.log('Gas used:', receipt?.gasUsed?.toString());
  
  // Read internal contract addresses from Settlement
  const vaultAddress = await settlement.vault();
  const nonceAddress = await settlement.nonceManager();
  const marketAddress = await settlement.marketRegistry();
  const feeAddress = await settlement.feeManager();
  const delegateAddress = await settlement.delegateKeyRegistry();
  
  console.log('\nInternal contracts deployed by Settlement:');
  console.log('  TradingVault:', vaultAddress);
  console.log('  NonceManager:', nonceAddress);
  console.log('  MarketRegistry:', marketAddress);
  console.log('  FeeManager:', feeAddress);
  console.log('  DelegateKeyRegistry:', delegateAddress);
  
  // Save deployment addresses
  const deployment = {
    network: 'quai-orchard-cyprus1',
    chainId: Number(chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    txHash: receipt?.hash || 'unknown',
    blockNumber: receipt?.blockNumber || 0,
    contracts: {
      Settlement: settlementAddress,
      TradingVault: vaultAddress,
      NonceManager: nonceAddress,
      MarketRegistry: marketAddress,
      FeeManager: feeAddress,
      DelegateKeyRegistry: delegateAddress,
    },
    tokens: {
      WQUAI: '0x005c46f661Baef20671943f2b4c087Df3E7CEb13',
      WQI: '0x002b2596EcF05C93a31ff916E8b456DF6C77c750',
    },
  };
  
  const deployFile = path.join(__dirname, '../services/api/src/deployment-addresses.json');
  fs.writeFileSync(deployFile, JSON.stringify(deployment, null, 2));
  console.log('\n✅ Deployment addresses saved');
  console.log('\n=== Deployment Complete ===');
  console.log('Explorer:', `https://orchard.quaiscan.io/tx/${receipt?.hash}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
