/**
 * QDEX Hardhat Deployment — uses @quai/hardhat-deploy-metadata for IPFS push
 * 
 * 🔴 APPROVAL REQUIRED — Requires explicit approval from Clonners before execution.
 * This script submits real transactions to Quai Orchard testnet.
 * Do NOT run autonomously. Run only with explicit operator approval.
 * 
 * Usage: npx hardhat run scripts/deploy-hardhat.js --network orchard
 */

const { Wallet, ContractFactory, Interface } = require('quais');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RPC = 'https://orchard.rpc.quai.network/cyprus1';

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

module.exports = async function (hre) {
  console.log('=== QDEX Deploy (Hardhat + IPFS metadata) ===\n');

  // Push metadata to IPFS for Quaiscan verification
  console.log('Pushing metadata to IPFS via @quai/hardhat-deploy-metadata...');
  const ipfsHash = await hre.deployMetadata.pushMetadataToIPFS('Settlement');
  console.log('IPFS hash:', ipfsHash);

  const PK = process.env.DEPLOYER_PRIVATE_KEY;
  if (!PK) {
    throw new Error('DEPLOYER_PRIVATE_KEY not set');
  }

  const provider = new Wallet(PK);
  console.log('Deployer:', provider.address);

  // Use curl for RPC reads (quais JsonRpcProvider has low timeout)
  const balanceHex = rpcCall('eth_getBalance', [provider.address, 'latest']);
  console.log('Balance:', BigInt(balanceHex).toString(), 'wei');

  const chainIdHex = rpcCall('eth_chainId');
  const chainId = parseInt(chainIdHex, 16);
  console.log('Chain ID:', chainId);

  if (chainId !== 15000) {
    throw new Error(`Expected chainId 15000 (Orchard), got ${chainId}`);
  }

  const nonceHex = rpcCall('eth_getTransactionCount', [provider.address, 'latest']);
  const nonce = parseInt(nonceHex, 16);
  console.log('Nonce:', nonce);

  const gasPriceHex = rpcCall('eth_gasPrice');
  const gasPrice = BigInt(gasPriceHex);
  console.log('Gas price:', gasPrice.toString(), 'wei');

  // Read Settlement artifact via Hardhat
  const artifact = await hre.artifacts.readArtifact('Settlement');
  console.log('\nDeploying Settlement...');

  const factory = new ContractFactory(artifact.abi, artifact.deployedBytecode || artifact.bytecode, provider, ipfsHash);

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

  const iface = new Interface(artifact.abi);

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
    ipfsHash,
    deployer: provider.address,
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
  console.log('IPFS verification hash:', ipfsHash);
};
