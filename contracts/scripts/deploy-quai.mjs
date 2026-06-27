#!/usr/bin/env node
/**
 * Deploy QDEX contracts to Quai Network
 *
 * Usage:
 *   node scripts/deploy-quai.mjs          # Deploy to Orchard Cyprus-1 (default)
 *   node scripts/deploy-quai.mjs mainnet  # Deploy to Mainnet Cyprus-1
 *
 * Requires DEPLOYER_PRIVATE_KEY in .env
 */
import { Wallet, JsonRpcProvider, ContractFactory } from 'quais';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';

config();

const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
if (!DEPLOYER_PK) {
  console.error('ERROR: DEPLOYER_PRIVATE_KEY not set in .env');
  process.exit(1);
}

const NETWORKS = {
  orchard: {
    name: 'Orchard Cyprus-1',
    url: 'https://orchard.rpc.quai.network',
    chainId: 15000,
    explorer: 'https://orchard.quaiscan.io',
  },
  mainnet: {
    name: 'Mainnet Cyprus-1',
    url: 'https://rpc.quai.network',
    chainId: 9,
    explorer: 'https://quaiscan.io',
  },
};

const networkKey = process.argv[2] || 'orchard';
const network = NETWORKS[networkKey];
if (!network) {
  console.error(`Unknown network: ${networkKey}. Use: orchard, mainnet`);
  process.exit(1);
}

function loadArtifact(name) {
  const path = `artifacts/src/${name}.sol/${name}.json`;
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const abi = Array.isArray(data.abi) ? data.abi : Object.values(data.abi);
  return { abi, bytecode: data.bytecode };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForReceipt(provider, txHash, maxWait = 90) {
  for (let i = 0; i < maxWait; i++) {
    await sleep(2000);
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) return receipt;
    } catch (e) {}
  }
  return null;
}

async function main() {
  console.log(`=== QDEX Deploy → ${network.name} ===`);
  console.log(`Network: ${network.url}`);
  console.log(`Chain ID: ${network.chainId}`);
  console.log('');

  // Setup provider with pathing for zone detection
  const provider = new JsonRpcProvider(network.url, undefined, { usePathing: true });
  const wallet = new Wallet(DEPLOYER_PK, provider);

  console.log(`Deployer: ${wallet.address}`);
  console.log(`Zone: ${await provider.zoneFromAddress(wallet.address)}`);

  const nonce = await provider.getTransactionCount(wallet.address, 'latest');
  const balance = await provider.getBalance(wallet.address);
  console.log(`Nonce: ${nonce}`);
  console.log(`Balance: ${(Number(balance) / 1e18).toFixed(2)} QUAI`);
  console.log('');

  // IPFS hash placeholder (46 chars, no 0x prefix)
  const ipfsHash = '0'.repeat(46);

  // Deploy Settlement (which creates sub-contracts internally)
  const settlementArtifact = loadArtifact('Settlement');
  const factory = new ContractFactory(
    settlementArtifact.abi,
    settlementArtifact.bytecode,
    wallet
  );
  factory.setIPFSHash(ipfsHash);

  console.log('🚀 Deploying Settlement...');
  const settlement = await factory.deploy();
  console.log(`Target: ${settlement.target}`);

  // Wait for deployment
  await settlement.waitForDeployment();
  const deployTx = settlement.deploymentTransaction();
  console.log(`Deployment tx: ${deployTx?.hash || 'pending'}`);

  const receipt = await settlement.deploymentTransaction()?.wait(1);
  console.log(`Status: ${receipt.status === 1 ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Gas used: ${(Number(receipt.gasUsed) / 1e6).toFixed(2)}M`);
  console.log(`Block: ${parseInt(receipt.blockNumber, 16)}`);

  if (receipt.status !== 1) {
    console.error('Deploy failed!');
    process.exit(1);
  }

  // Wait for code to be available
  await sleep(5000);

  // Read sub-contract addresses
  const vault = await settlement.vault();
  const nonceManager = await settlement.nonceManager();
  const marketRegistry = await settlement.marketRegistry();
  const feeManager = await settlement.feeManager();
  const delegateKeyRegistry = await settlement.delegateKeyRegistry();

  console.log('');
  console.log('📦 Sub-contracts deployed:');
  console.log(`  vault:              ${vault}`);
  console.log(`  nonceManager:       ${nonceManager}`);
  console.log(`  marketRegistry:     ${marketRegistry}`);
  console.log(`  feeManager:         ${feeManager}`);
  console.log(`  delegateKeyRegistry: ${delegateKeyRegistry}`);

  // Verify all contracts have code
  console.log('');
  console.log('🔍 Verifying...');
  const contracts = {
    Settlement: settlement.target,
    vault,
    nonceManager,
    marketRegistry,
    feeManager,
    delegateKeyRegistry,
  };

  let allValid = true;
  for (const [name, addr] of Object.entries(contracts)) {
    const code = await provider.getCode(addr);
    const hasCode = code && code !== '0x' && code.length > 2;
    const zone = await provider.zoneFromAddress(addr);
    console.log(`  ${hasCode ? '✅' : '❌'} ${name}: ${addr} (zone: ${zone})`);
    if (!hasCode) allValid = false;
  }

  if (!allValid) {
    console.error('Some contracts failed to deploy!');
    process.exit(1);
  }

  // Save deployment addresses
  const addresses = {
    network: `${networkKey}-cyprus1`,
    chainId: network.chainId,
    deployer: wallet.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      Settlement: {
        address: settlement.target,
        subContracts: {
          vault,
          nonceManager,
          marketRegistry,
          feeManager,
          delegateKeyRegistry,
        },
      },
    },
    explorer: `${network.explorer}/address/${settlement.target}`,
  };

  writeFileSync('deployment-addresses.json', JSON.stringify(addresses, null, 2));
  console.log('');
  console.log('💾 Addresses saved to deployment-addresses.json');
  console.log('');
  console.log(`✅ QDEX deployed successfully on ${network.name}!`);
  console.log(`Explorer: ${addresses.explorer}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
