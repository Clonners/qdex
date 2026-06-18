/**
 * Simple QDEX deployment with hardcoded gas
 *
 * ⚠️ APPROVAL REQUIRED — This script deploys contracts to Quai Orchard testnet.
 * Requires explicit approval from Clonners before running.
 */

const { JsonRpcProvider, Wallet, ContractFactory } = require('quais');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function main() {
  console.log('=== QDEX Deploy (simple) ===\n');
  
  const provider = new JsonRpcProvider('https://orchard.rpc.quai.network/cyprus1');
  const deployer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  console.log('Deployer:', deployer.address);
  
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/src/Settlement.sol/Settlement.json'), 'utf8')
  );
  
  // Reconstruct bytecode from Hardhat's character array format
  const bytecode = '0x' + Object.values(artifact.bytecode).join('').slice(2);
  const abi = artifact.abi;
  
  console.log('Deploying Settlement with 5000000 gas...');
  
  const factory = new ContractFactory(
    abi,
    bytecode,
    deployer,
    'Qmaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' // 46-char placeholder IPFS hash
  );
  
  const tx = await factory.deploy({ gasLimit: 5000000n });
  console.log('Tx sent:', tx.hash);
  console.log('Waiting for confirmation...');
  
  const receipt = await tx.deploymentTransaction()?.wait(1);
  if (!receipt) throw new Error('No receipt');
  
  console.log('Block:', receipt.blockNumber);
  console.log('Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
  
  if (receipt.status !== 1) throw new Error('Deployment failed');
  
  const settlementAddress = await tx.getAddress();
  console.log('Settlement:', settlementAddress);
  
  const settlement = new ContractFactory(
    deployer,
    artifact.abi,
    artifact.bytecode.object
  ).attach(settlementAddress);
  
  console.log('\nReading deployed contracts...');
  const vault = await settlement.vault();
  const nonce = await settlement.nonceManager();
  const market = await settlement.marketRegistry();
  const fee = await settlement.feeManager();
  const delegate = await settlement.delegateKeyRegistry();
  
  console.log('TradingVault:', vault);
  console.log('NonceManager:', nonce);
  console.log('MarketRegistry:', market);
  console.log('FeeManager:', fee);
  console.log('DelegateKeyRegistry:', delegate);
  
  // Save
  const deployment = {
    network: 'quai-orchard-cyprus1',
    chainId: 15000,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    contracts: {
      Settlement: settlementAddress,
      TradingVault: vault,
      NonceManager: nonce,
      MarketRegistry: market,
      FeeManager: fee,
      DelegateKeyRegistry: delegate,
    },
    tokens: {
      WQUAI: '0x005c46f661Baef20671943f2b4c087Df3E7CEb13',
      WQI: '0x002b2596EcF05C93a31ff916E8b456DF6C77c750',
    },
  };
  
  fs.writeFileSync(
    path.join(__dirname, '../services/api/src/deployment-addresses.json'),
    JSON.stringify(deployment, null, 2)
  );
  
  console.log('\n✅ Saved deployment addresses');
  console.log('Explorer: https://orchard.quaiscan.io/tx/' + receipt.hash);
}

main().catch(e => { console.error(e); process.exit(1); });
