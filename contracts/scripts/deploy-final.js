/**
 * Final deploy attempt using quais Wallet to build Quai-native tx
 *
 * ⚠️ APPROVAL REQUIRED — This script deploys contracts to Quai Orchard testnet.
 * Requires explicit approval from Clonners before running.
 *
 * quais Wallet.signTransaction() produces Quai-native wire format.
 * Then we send it via provider.send('eth_sendRawTransaction', [signed]).
 */

const { QuaiHDWallet, Mnemonic, Zone, JsonRpcProvider, Interface, computeAddress } = require('quais');
const fs = require('fs');
const path = require('path');

const RPC = 'https://orchard.rpc.quai.network/cyprus1';
const GAS_LIMIT = 8_000_000;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== QDEX Deploy (quais native) ===\n');
  
  const mnemonic = Mnemonic.fromPhrase('foil another wet focus half casino bullet subway level busy saddle seat');
  const hdWallet = QuaiHDWallet.fromMnemonic(mnemonic);
  
  const addrInfo = hdWallet.getNextAddressSync(0, Zone.Cyprus1);
  const deployerAddr = addrInfo.address;
  console.log('Deployer:', deployerAddr);
  
  const provider = new JsonRpcProvider(RPC);
  
  // Connect wallet to provider
  const wallet = hdWallet.connect(provider);
  
  // Get nonce
  const nonce = await wallet.getNonce('latest');
  console.log('Nonce:', nonce);
  
  // Get gas price
  const gasPrice = await provider.getGasPrice();
  console.log('Gas price:', gasPrice.toString(), 'wei');
  
  // Read artifact
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/src/Settlement.sol/Settlement.json'), 'utf8')
  );
  
  const bytecode = artifact.bytecode;
  const abi = artifact.abi;
  
  // Build deployment tx
  const tx = await wallet.populateTransaction({
    to: null, // Contract deployment
    data: bytecode,
    gasLimit: GAS_LIMIT,
    gasPrice: gasPrice,
    nonce: nonce,
    chainId: 15000,
    value: 0n,
  });
  
  console.log('Built tx, to:', tx.to, 'data length:', tx.data ? tx.data.length : 0);
  
  // Sign
  console.log('Signing...');
  const signed = await wallet.signTransaction(tx);
  console.log('Signed:', signed.slice(0, 66) + '...\n');
  
  // Send
  console.log('Sending...');
  const txHash = await provider.send('eth_sendRawTransaction', [signed]);
  console.log('✅ Tx sent:', txHash);
  
  // Poll for receipt
  console.log('Polling (5s intervals, max 5 min)...');
  let receipt = null;
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    try {
      receipt = await provider.send('eth_getTransactionReceipt', [txHash]);
      if (receipt) {
        console.log(`✅ Receipt after ${(i+1)*5}s`);
        break;
      }
    } catch {}
    if ((i+1) % 12 === 0) console.log(`  ... attempt ${i+1}/60`);
  }
  
  if (!receipt) {
    console.log('⚠️ Pending. Explorer: https://orchard.quaiscan.io/tx/' + txHash);
    return;
  }
  
  if (receipt.status !== '0x1') {
    throw new Error('Reverted! https://orchard.quaiscan.io/tx/' + txHash);
  }
  
  // Compute deployed address
  const settlementAddr = computeAddress({ from: deployerAddr, nonce });
  
  console.log('\n✅ Deployed!');
  console.log('Block:', receipt.blockNumber);
  console.log('Gas used:', receipt.gasUsed.toString());
  console.log('Settlement:', settlementAddr);
  console.log('Explorer: https://orchard.quaiscan.io/tx/' + txHash);
  
  // Read internal contracts
  console.log('\nReading internal contracts...');
  await sleep(5000);
  
  const iface = new Interface(abi);
  
  const readAddr = async (fnName) => {
    const data = iface.encodeFunctionData(fnName, []);
    const result = await provider.send('eth_call', [{ to: settlementAddr, data }, 'latest']);
    return '0x' + result.slice(26);
  };
  
  const vault = await readAddr('vault');
  const nonceMgr = await readAddr('nonceManager');
  const market = await readAddr('marketRegistry');
  const fee = await readAddr('feeManager');
  const delegate = await readAddr('delegateKeyRegistry');
  
  console.log('TradingVault:', vault);
  console.log('NonceManager:', nonceMgr);
  console.log('MarketRegistry:', market);
  console.log('FeeManager:', fee);
  console.log('DelegateKeyRegistry:', delegate);
  
  // Save
  const deployment = {
    network: 'quai-orchard-cyprus1',
    chainId: 15000,
    deployer: deployerAddr,
    timestamp: new Date().toISOString(),
    txHash,
    blockNumber: Number(receipt.blockNumber),
    contracts: {
      Settlement: settlementAddr,
      TradingVault: vault,
      NonceManager: nonceMgr,
      MarketRegistry: market,
      FeeManager: fee,
      DelegateKeyRegistry: delegate,
    },
    tokens: {
      WQUAI: '0x005c46f661Baef20671943f2b4c087Df3E7CEb13',
      WQI: '0x002b2596EcF05C93a31ff916E8b456DF6C77c750',
    },
  };
  
  const file = path.join(__dirname, '../services/api/src/deployment-addresses.json');
  fs.writeFileSync(file, JSON.stringify(deployment, null, 2));
  console.log('\n✅ Saved deployment addresses');
}

main().catch(e => {
  console.error('\n❌', e.message);
  if (e.stack) console.error(e.stack.split('\n').slice(1, 6).join('\n'));
  process.exit(1);
});
