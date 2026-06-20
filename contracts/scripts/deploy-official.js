/**
 * Official quais deployment example
 * Based on: /home/clonners/worktrees/quais_sdk_live/examples/transactions/deploy-contract.js
 */

const { Wallet, ContractFactory, JsonRpcProvider } = require('quais');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const RPC = 'https://orchard.rpc.quai.network/cyprus1';
const PK = process.env.DEPLOYER_PRIVATE_KEY;

async function main() {
  console.log('=== Official Deploy Example ===\n');
  
  const provider = new JsonRpcProvider(RPC, undefined, { usePathing: true });
  const wallet = new Wallet(PK, provider);
  
  console.log('Deployer:', wallet.address);
  
  // Get balance
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', balance.toString(), 'wei');
  
  // Get chainId
  const network = await provider.getNetwork();
  console.log('Chain ID:', network.chainId);
  
  // Get nonce
  const nonce = await provider.getTransactionCount(wallet.address, 'latest');
  console.log('Nonce:', nonce);
  
  // Read Settlement artifact
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/src/Settlement.sol/Settlement.json'), 'utf8')
  );
  
  const abi = Array.isArray(artifact.abi) ? artifact.abi : Object.values(artifact.abi);
  const bytecode = typeof artifact.bytecode === 'string' ? artifact.bytecode : artifact.bytecode.object;
  
  console.log('\nDeploying Settlement...');
  
  // Create factory with IPFS hash (required by quais)
  const factory = new ContractFactory(abi, bytecode, wallet, 'a2bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  
  const deployParams = {
    nonce,
    maxPriorityFeePerGas: 1000000000n,
    maxFeePerGas: await provider.getGasPrice(),
  };
  
  console.log('\nSending deployment tx...');
  const tx = await factory.deploy(deployParams);
  console.log('Tx hash:', tx.hash);
  console.log('Contract address:', await tx.getAddress());
  
  console.log('\nWaiting for deployment (this may take 60-120s)...');
  const settlement = await tx.waitForDeployment();
  const receipt = await tx.deploymentTransaction()?.wait();
  
  console.log('\n✅ Deployed!');
  console.log('Block:', receipt?.blockNumber);
  console.log('Gas used:', receipt?.gasUsed?.toString());
  console.log('Settlement:', await settlement.getAddress());
  console.log('Explorer: https://orchard.quaiscan.io/tx/' + (receipt?.hash || tx.hash));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌', error.message);
    if (error.stack) console.error(error.stack.split('\n').slice(1, 6).join('\n'));
    process.exit(1);
  });
