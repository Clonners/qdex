#!/bin/bash
# 🔴 APPROVAL REQUIRED — Requires explicit approval from Clonners before execution.
# This script signs and sends real transactions to Quai Orchard testnet.
# Do NOT run autonomously. Run only with explicit operator approval.
# Deploy QDEX contracts to Orchard
# Signs with ethers.js (offline), sends via curl directly to RPC

set -e

cd "$(dirname "$0")/.."
source .env 2>/dev/null || true

# Sign tx and get raw signed tx
echo "Signing deployment tx..."
SIGNED_TX=$(node -e "
const ethers = require('ethers');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY);
  const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'artifacts/src/Settlement.sol/Settlement.json'), 'utf8'));
  
  // Get nonce and gas via direct HTTP
  const fetch = (...args) => globalThis.fetch ? globalThis.fetch(...args) : require('node-fetch')(...args);
  
  const rpc = 'https://orchard.rpc.quai.network/cyprus1';
  
  const nonceRes = await fetch(rpc, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionCount',params:[wallet.address,'latest']}),
  });
  const nonce = Number((await nonceRes.json()).result);
  
  const gasRes = await fetch(rpc, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_gasPrice',params:[]}),
  });
  const gasPrice = BigInt((await gasRes.json()).result);
  
  const signed = await wallet.signTransaction({
    to: null,
    data: artifact.bytecode,
    nonce: nonce,
    gasLimit: 8000000,
    gasPrice: gasPrice,
    chainId: 15000,
  });
  
  console.log(signed);
}

main();
" 2>/dev/null)

echo "Sending tx..."
TX_HASH=$(curl -s -X POST https://orchard.rpc.quai.network/cyprus1 \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_sendRawTransaction\",\"params\":[\"$SIGNED_TX\"]}" | \
  node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).result)}catch(e){console.error(e.message)}})" 2>/dev/null)

echo "Tx hash: $TX_HASH"
echo "Polling for receipt (5s intervals)..."

# Poll for receipt
for i in $(seq 1 60); do
  sleep 5
  RECEIPT=$(curl -s -X POST https://orchard.rpc.quai.network/cyprus1 \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getTransactionReceipt\",\"params\":[\"$TX_HASH\"]}")
  
  STATUS=$(echo "$RECEIPT" | node -e "process.stdin.on('data',d=>{try{const r=JSON.parse(d).result;console.log(r?r.status:'null')}catch(e){console.log('err')}})" 2>/dev/null)
  
  if [ "$STATUS" = "0x1" ]; then
    echo "✅ Deployed! Status: $STATUS"
    echo "Receipt: $RECEIPT"
    
    # Compute deployed address
    NODEPLOY=$(node -e "
const ethers = require('ethers');
require('dotenv').config();
const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY);
const fetch = (...args) => globalThis.fetch ? globalThis.fetch(...args) : require('node-fetch')(...args);

async function main() {
  const rpc = 'https://orchard.rpc.quai.network/cyprus1';
  const nonceRes = await fetch(rpc, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionCount',params:[wallet.address,'pending']}),
  });
  // We need the nonce used, which was the last confirmed nonce before the tx
  const nonce = Number((await nonceRes.json()).result) - 1;
  const addr = ethers.computeAddress({from: wallet.address, nonce: nonce});
  console.log(addr);
}
main();
" 2>/dev/null)
    
    echo "Settlement: $NODEPLOY"
    echo "Explorer: https://orchard.quaiscan.io/tx/$TX_HASH"
    
    # Save result
    echo "$RECEIPT" > ../services/api/src/deploy-receipt.json
    echo "✅ Saved receipt"
    exit 0
  fi
  
  if [ "$STATUS" = "0x0" ]; then
    echo "❌ Deployment reverted!"
    exit 1
  fi
  
  if (( i % 12 == 0 )); then
    echo "  ... still polling (attempt $i/60)"
  fi
done

echo "⚠️ Receipt not found after 5 min. Tx pending."
echo "Check: https://orchard.quaiscan.io/tx/$TX_HASH"
