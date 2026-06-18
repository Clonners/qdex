/**
 * QDEX Testnet Deployment Script
 *
 * ⚠️ APPROVAL REQUIRED — This script deploys contracts to Quai Orchard testnet.
 * Requires explicit approval from Clonners before running.
 *
 * Deploys all 6 DEX contracts to Quai Orchard testnet (Cyprus1 zone).
 * Settlement deploys the others internally.
 *
 * Usage:
 *   npx hardhat --network quaiOrchard run scripts/deploy-qdex.js
 */

const { ethers } = require('hardhat');

async function main() {
  console.log('=== QDEX Testnet Deployment ===\n');
  
  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Balance:', ethers.formatEther(balance), 'QUAI\n');
  
  // Get chain ID
  const chainId = Number(await ethers.provider.getNetwork().then(n => n.chainId));
  console.log('Chain ID:', chainId);
  
  if (chainId !== 15000) {
    throw new Error(`Expected chainId 15000 (Orchard), got ${chainId}`);
  }
  
  // Deploy Settlement (which internally deploys all other contracts)
  console.log('\nDeploying Settlement...');
  const Settlement = await ethers.getContractFactory('Settlement');
  const settlement = await Settlement.deploy();
  await settlement.waitForDeployment();
  const settlementAddress = await settlement.getAddress();
  console.log('✅ Settlement deployed:', settlementAddress);
  
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
  
  // Estimate gas used
  const receipt = await settlement.deploymentTransaction()?.wait();
  if (receipt) {
    const gasUsed = receipt.gasUsed;
    console.log('\nGas used:', gasUsed.toString());
  }
  
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
  
  const fs = require('fs');
  const path = require('path');
  const deployFile = path.join(__dirname, '../services/api/src/deployment-addresses.json');
  fs.writeFileSync(deployFile, JSON.stringify(deployment, null, 2));
  console.log('\n✅ Deployment addresses saved to services/api/src/deployment-addresses.json');
  
  console.log('\n=== Deployment Complete ===');
  console.log('Settlement tx:', receipt?.hash);
  console.log('Block:', receipt?.blockNumber);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
