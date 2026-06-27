#!/usr/bin/env node
/**
 * Multi-shard deployment script for QDEX
 * 
 * Usage:
 *   node scripts/deploy-multi-shard.mjs orchard   # Deploy to all active Orchard zones
 *   node scripts/deploy-multi-shard.mjs mainnet    # Deploy to all active Mainnet zones
 * 
 * This script:
 * 1. Discovers all active zones/shards on the network
 * 2. Derives deployment wallets for each zone using QuaiHDWallet
 * 3. Deploys Settlement + sub-contracts on each zone
 * 4. Links all deployments via setSisterContracts()
 * 5. Saves deployment manifest
 */

import { Wallet, JsonRpcProvider, ContractFactory, QuaiHDWallet } from 'quais';
import { readFileSync, writeFileSync } from 'fs';
import { config } from 'dotenv';

config();

const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
if (!DEPLOYER_PK) {
  console.error('ERROR: DEPLOYER_PRIVATE_KEY not set in .env');
  process.exit(1);
}

const NETWORKS = {
  orchard: {
    name: 'Orchard',
    baseUrl: 'https://orchard.rpc.quai.network',
    chainId: 15000,
    explorer: 'https://orchard.quaiscan.io',
  },
  mainnet: {
    name: 'Mainnet',
    baseUrl: 'https://rpc.quai.network',
    chainId: 9,
    explorer: 'https://quaiscan.io',
  },
};

// Known zone patterns to check
const ZONE_PATTERNS = [
  { region: 0, zone: 0, name: 'cyprus1' },
  { region: 0, zone: 1, name: 'cyprus2' },
  { region: 0, zone: 2, name: 'cyprus3' },
  { region: 1, zone: 0, name: 'paxos1' },
  { region: 1, zone: 1, name: 'paxos2' },
  { region: 1, zone: 2, name: 'paxos3' },
  { region: 2, zone: 0, name: 'hydra1' },
  { region: 2, zone: 1, name: 'hydra2' },
  { region: 2, zone: 2, name: 'hydra3' },
];

function loadArtifact(name) {
  const path = `artifacts/src/${name}.sol/${name}.json`;
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const abi = Array.isArray(data.abi) ? data.abi : Object.values(data.abi);
  return { abi, bytecode: data.bytecode };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function discoverActiveZones(network) {
  console.log(`\n🔍 Discovering active zones on ${network.name}...`);
  const activeZones = [];
  
  for (const zone of ZONE_PATTERNS) {
    const provider = new JsonRpcProvider(
      `${network.baseUrl}/${zone.name}`,
      undefined,
      { usePathing: true }
    );
    
    try {
      const chainId = await provider.send('eth_chainId', []);
      if (chainId) {
        activeZones.push(zone);
        console.log(`  ✅ ${zone.name} (region ${zone.region}, zone ${zone.zone}) - Active`);
      }
    } catch (e) {
      // Zone not available
    }
  }
  
  console.log(`\nFound ${activeZones.length} active zone(s):`, 
    activeZones.map(z => z.name).join(', '));
  return activeZones;
}

async function deploySettlement(wallet, ipfsHash) {
  const settlementArtifact = loadArtifact('Settlement');
  const factory = new ContractFactory(
    settlementArtifact.abi,
    settlementArtifact.bytecode,
    wallet
  );
  factory.setIPFSHash(ipfsHash);
  
  const settlement = await factory.deploy();
  await settlement.waitForDeployment();
  return settlement;
}

async function main() {
  const networkKey = process.argv[2] || 'orchard';
  const network = NETWORKS[networkKey];
  
  if (!network) {
    console.error(`Unknown network: ${networkKey}. Use: orchard, mainnet`);
    process.exit(1);
  }
  
  console.log(`=== QDEX Multi-Shard Deploy → ${network.name} ===`);
  console.log(`Network: ${network.baseUrl}`);
  console.log(`Chain ID: ${network.chainId}`);
  
  // Discover active zones
  const activeZones = await discoverActiveZones(network);
  
  if (activeZones.length === 0) {
    console.error('No active zones found!');
    process.exit(1);
  }
  
  if (activeZones.length === 1) {
    console.log('\n⚠️  Only 1 zone available. Deploying single-zone setup.');
    console.log('    Cross-shard linking will be available when more zones launch.');
  }
  
  // IPFS hash placeholder (46 chars, no 0x prefix)
  const ipfsHash = '0'.repeat(46);
  
  // Deploy to each zone
  console.log('\n🚀 Deploying to each zone...');
  const deployments = {};
  
  for (const zone of activeZones) {
    console.log(`\n--- Deploying to ${zone.name} ---`);
    
    const provider = new JsonRpcProvider(
      `${network.baseUrl}/${zone.name}`,
      undefined,
      { usePathing: true }
    );
    
    // Derive wallet for this zone
    let wallet;
    try {
      // Try QuaiHDWallet first (for zone-specific derivation)
      const mnemonic = process.env.DEPLOYER_MNEMONIC || DEPLOYER_PK;
      const hdWallet = new QuaiHDWallet(mnemonic, provider);
      wallet = hdWallet.getNextAddressSync(0, zone.zone); // account 0, zone-specific
    } catch (e) {
      // Fallback to regular wallet
      wallet = new Wallet(DEPLOYER_PK, provider);
    }
    
    console.log(`Wallet: ${wallet.address}`);
    console.log(`Zone: ${zone.region}/${zone.zone}`);
    
    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${(Number(balance) / 1e18).toFixed(2)} QUAI`);
    
    // Deploy Settlement
    const settlement = await deploySettlement(wallet, ipfsHash);
    const target = settlement.target;
    
    console.log(`Settlement: ${target}`);
    
    // Wait for deployment to settle
    await sleep(5000);
    
    // Read sub-contract addresses
    const vault = await settlement.vault();
    const nonceManager = await settlement.nonceManager();
    const marketRegistry = await settlement.marketRegistry();
    const feeManager = await settlement.feeManager();
    const delegateKeyRegistry = await settlement.delegateKeyRegistry();
    
    console.log(`  vault: ${vault}`);
    console.log(`  nonceManager: ${nonceManager}`);
    console.log(`  marketRegistry: ${marketRegistry}`);
    console.log(`  feeManager: ${feeManager}`);
    console.log(`  delegateKeyRegistry: ${delegateKeyRegistry}`);
    
    deployments[zone.name] = {
      zone: zone,
      wallet: wallet.address,
      settlement: target,
      subContracts: {
        vault,
        nonceManager,
        marketRegistry,
        feeManager,
        delegateKeyRegistry,
      },
    };
  }
  
  // Link sister contracts if multiple zones
  if (activeZones.length > 1) {
    console.log('\n🔗 Linking sister contracts...');
    
    const zoneNames = Object.keys(deployments);
    const sisterAddresses = zoneNames
      .filter(z => z !== zoneNames[0])
      .map(z => deployments[z].settlement);
    const sisterZones = zoneNames
      .filter(z => z !== zoneNames[0])
      .map(z => deployments[z].zone.zone);
    
    for (const [zoneName, deployment] of Object.entries(deployments)) {
      console.log(`\nLinking ${zoneName}...`);
      
      const provider = new JsonRpcProvider(
        `${network.baseUrl}/${zoneName}`,
        undefined,
        { usePathing: true }
      );
      
      const settlementContract = new ContractFactory(
        loadArtifact('Settlement').abi,
        '',
        new Wallet(DEPLOYER_PK, provider)
      ).attach(deployment.settlement);
      
      try {
        // Get all other zones and their settlement addresses
        const otherZones = zoneNames.filter(z => z !== zoneName);
        const otherAddresses = otherZones.map(z => deployments[z].settlement);
        const otherZoneIndices = otherZones.map(z => deployments[z].zone.zone);
        
        console.log(`  Linking to zones: ${otherZoneIndices.join(', ')}`);
        console.log(`  Settlements: ${otherAddresses.join(', ')}`);
        
        const tx = await settlementContract.setSisterContracts(
          otherZoneIndices,
          otherAddresses,
          { gasLimit: 500000 }
        );
        
        const receipt = await tx.wait(1);
        console.log(`  ✅ Linked (tx: ${tx.hash.slice(0, 20)}...)`);
      } catch (e) {
        console.error(`  ❌ Failed to link: ${e.message}`);
      }
    }
  }
  
  // Save deployment manifest
  const manifest = {
    network: `${networkKey}`,
    chainId: network.chainId,
    deployedAt: new Date().toISOString(),
    zones: activeZones.map(z => z.name),
    deployments,
    crossShardLinked: activeZones.length > 1,
    explorerBaseUrl: network.explorer,
  };
  
  writeFileSync('multi-shard-deployment.json', JSON.stringify(manifest, null, 2));
  console.log('\n💾 Saved to multi-shard-deployment.json');
  
  // Summary
  console.log('\n✅ Deployment complete!');
  console.log(`   Zones: ${Object.keys(deployments).join(', ')}`);
  console.log(`   Cross-shard linked: ${activeZones.length > 1 ? 'Yes' : 'No (single zone)'}`);
  
  if (activeZones.length === 1) {
    console.log('\n📋 When more zones become available:');
    console.log('   1. Re-run this script to discover new zones');
    console.log('   2. Deploy to new zones');
    console.log('   3. Link existing + new zones via setSisterContracts()');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
