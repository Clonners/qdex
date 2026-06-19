/**
 * 🔴 APPROVAL REQUIRED — Requires explicit approval from Clonners before execution.
 * This script signs and sends real transactions to Quai Orchard testnet.
 * Do NOT run autonomously. Run only with explicit operator approval.
 *
 * Send deployment tx and exit immediately
 * Receipt polling is done separately
 */
const { QuaiHDWallet, Mnemonic, Zone, JsonRpcProvider } = require('quais');
require('dotenv').config();
const fs = require('fs');

async function main() {
  const mnemonicPhrase = process.env.DEPLOYER_MNEMONIC || process.env.WALLET_MNEMONIC;
  if (!mnemonicPhrase) {
    console.error('ERROR: DEPLOYER_MNEMONIC (or WALLET_MNEMONIC) not set in environment');
    process.exit(1);
  }
  const mnemonic = Mnemonic.fromPhrase(mnemonicPhrase);
  const hdWallet = QuaiHDWallet.fromMnemonic(mnemonic);
  const addrInfo = hdWallet.getNextAddressSync(0, Zone.Cyprus1);
  
  const provider = new JsonRpcProvider('https://orchard.rpc.quai.network/cyprus1');
  
  const nonce = parseInt(await provider.send('eth_getTransactionCount', [addrInfo.address, 'latest']), 16);
  const gasPrice = BigInt(await provider.send('eth_gasPrice', []));
  
  const artifact = JSON.parse(fs.readFileSync('artifacts/src/Settlement.sol/Settlement.json', 'utf8'));
  const wallet = hdWallet.connect(provider);
  
  const signed = await wallet.signTransaction({
    to: null,
    data: artifact.bytecode,
    nonce,
    gasLimit: 8_000_000,
    gasPrice,
    chainId: 15000,
  });
  
  const txHash = await provider.send('eth_sendRawTransaction', [signed]);
  console.log(txHash);
}

main().catch(e => { console.error(e.message); process.exit(1); });
