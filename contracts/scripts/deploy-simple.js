/**
 * Simple QDEX deployment using quais directly (bypasses Hardhat RPC layer)
 *
 * ⚠️ APPROVAL REQUIRED — This script deploys contracts to Quai Orchard testnet.
 * Requires explicit approval from Clonners before running.
 *
 * Hardhat/ethers v6 uses standard EVM RPC methods that Quai's RPC
 * doesn't support (eth_estimateGas, eth_sendTransaction behave differently).
 * quais handles Quai's custom RPC methods correctly.
 */

const { JsonRpcProvider, Wallet, ContractFactory } = require('quais');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function main() {
  console.log('=== QDEX Deploy via quais ===\n');
  
  const provider = new JsonRpcProvider('https://orchard.rpc.quai.network/cyprus1');
  const deployer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  console.log('Deployer:', deployer.address);
  
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/src/Settlement.sol/Settlement.json'), 'utf8')
  );
  
  // Hardhat bytecode already has 0x prefix
  const bytecode = artifact.bytecode;
  const abi = artifact.abi;
  
  // Need a 46-char IPFS hash for metadata
  const ipfsHash = 'Qmaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  
  console.log('Bytecode length:', bytecode.length, 'chars');
  console.log('ABI items:', abi.length);
  
  const factory = new ContractFactory(abi, bytecode, deployer, ipfsHash);
  
  // Use generous gas limit — Settlement deploys 5 more contracts
  const gasLimit = 8_000_000n;
  console.log('Deploying with gas limit:', gasLimit.toString());
  
  const tx = await factory.deploy({ gasLimit });
  console.log('Tx sent:', tx.hash);
  console.log('Waiting for deployment...');
  
  // Wait with polling — don't rely on WebSocket
  const receipt = await tx.deploymentTransaction()?.wait(1);
  if (!receipt) throw new Error('No receipt returned');
  
  if (receipt.status !== 1) {
    throw new Error('Deployment reverted. Check tx on explorer.');
  }
  
  console.log('✅ Deployed!');
  console.log('Block:', receipt.blockNumber);
  console.log('Gas used:', receipt.gasUsed.toString());
  
  const settlementAddress = await tx.getAddress();
  console.log('Settlement:', settlementAddress);
  
  // Read internal addresses from Settlement contract
  const settlementAbi = abi;
  const settlementWallet = new Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  // Read addresses using provider calls
  const vaultAddr = await tx.vault();
  const nonceAddr = await tx.nonceManager();
  const marketAddr = await tx.marketRegistry();
  const feeAddr = await tx.feeManager();
  const delegateAddr = await tx.delegateKeyRegistry();
  
  console.log('\nDeployed contracts:');
  console.log('  Settlement:', settlementAddress);
  console.log('  TradingVault:', vaultAddr);
  console.log('  NonceManager:', nonceAddr);
  console.log('  MarketRegistry:', marketAddr);
  console.log('  FeeManager:', feeAddr);
  console.log('  DelegateKeyRegistry:', delegateAddr);
  
  // Save deployment addresses
  const deployment = {
    network: 'quai-orchard-cyprus1',
    chainId: 15000,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    contracts: {
      Settlement: settlementAddress,
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
  
  const deployFile = path.join(__dirname, '../services/api/src/deployment-addresses.json');
  fs.writeFileSync(deployFile, JSON.stringify(deployment, null, 2));
  console.log('\n✅ Saved to services/api/src/deployment-addresses.json');
  console.log('Explorer: https://orchard.quaiscan.io/tx/' + receipt.hash);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\n❌ Deploy failed:', e.message);
    console.error(e);
    process.exit(1);
  });
