#!/usr/bin/env node
/**
 * QDEX First Real Loop - Mock Mode
 * 
 * Tests the matching engine and API flow using mock signatures.
 * This validates the order matching, filling, and settlement pipeline.
 */

const DEFAULT_OWNER = '0x1111111111111111111111111111111111111111';
const ZERO_DELEGATE = '0x0000000000000000000000000000000000000000';
const DEFAULT_SETTLEMENT = '0x2222222222222222222222222222222222222222';
const DEFAULT_EXPIRES_AT = 1780003600;

function createSignedOrder(overrides = {}) {
  const type = overrides.type ?? 'limit';
  const owner = overrides.owner ?? DEFAULT_OWNER;
  const delegate = overrides.delegate ?? ZERO_DELEGATE;
  const nonce = overrides.nonce ?? '1';
  const timeInForce = overrides.timeInForce ?? (type === 'market_ioc' ? 'IOC' : 'GTC');
  const maxSlippageBps = overrides.maxSlippageBps ?? (type === 'market_ioc' ? 50 : 0);

  return {
    marketId: 'WQUAI-WQI',
    side: 'sell',
    type,
    baseToken: 'mock:WQUAI',
    quoteToken: 'mock:WQI',
    amount: '100',
    price: '5',
    timeInForce,
    maxSlippageBps,
    owner,
    delegate,
    nonce,
    expiresAt: DEFAULT_EXPIRES_AT,
    chainId: 0,
    settlementContract: DEFAULT_SETTLEMENT,
    clientOrderId: `test-order-${nonce}`,
    signature: {
      scheme: 'mock',
      signer: owner,
      value: `0xmock-${nonce}`,
      signedAt: 1780000000
    },
    ...overrides
  };
}

console.log('=== QDEX First Real Loop (Mock Mode) ===\n');

async function submitOrder(order) {
  const response = await fetch('http://localhost:8787/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order })
  });
  return await response.json();
}

async function getOrders() {
  const response = await fetch('http://localhost:8787/v1/orders');
  return await response.json();
}

async function getFills() {
  const response = await fetch('http://localhost:8787/v1/fills');
  return await response.json();
}

async function getOrderbook() {
  const response = await fetch('http://localhost:8787/v1/orderbook/WQUAI-WQI');
  return await response.json();
}

// Step 1: Check initial state
console.log('--- Step 1: Initial State ---');
const initialOrders = await getOrders();
const initialFills = await getFills();
console.log('Initial orders:', JSON.stringify(initialOrders).substring(0, 100));
console.log('Initial fills:', JSON.stringify(initialFills).substring(0, 100));
const initialBook = await getOrderbook();
console.log('Initial book:', JSON.stringify(initialBook).substring(0, 100));

// Step 2: Submit resting sell order
console.log('\n--- Step 2: Submit Resting Sell Order ---');
const sellOrder = createSignedOrder({
  side: 'sell',
  amount: '100',
  price: '5',
  nonce: '1001',
  owner: DEFAULT_OWNER
});
const sellResult = await submitOrder(sellOrder);
console.log('Sell result:', JSON.stringify(sellResult).substring(0, 300));

// Check orderbook after sell
const bookAfterSell = await getOrderbook();
console.log('Book after sell:', JSON.stringify(bookAfterSell).substring(0, 300));

// Step 3: Submit crossing buy order
console.log('\n--- Step 3: Submit Crossing Buy Order ---');
const buyOrder = createSignedOrder({
  side: 'buy',
  amount: '100',
  price: '6',  // Higher than sell price to cross
  nonce: '1002',
  owner: '0x3333333333333333333333333333333333333333'
});
const buyResult = await submitOrder(buyOrder);
console.log('Buy result:', JSON.stringify(buyResult).substring(0, 300));

// Step 4: Check fills
console.log('\n--- Step 4: Check Fills ---');
const fills = await getFills();
console.log('Fills:', JSON.stringify(fills));

// Step 5: Check orderbook
console.log('\n--- Step 5: Final Orderbook ---');
const finalBook = await getOrderbook();
console.log('Final book:', JSON.stringify(finalBook));

// Step 6: Check orders
console.log('\n--- Step 6: Final Orders ---');
const finalOrders = await getOrders();
console.log('Final orders:', JSON.stringify(finalOrders));

// Step 7: Check events
console.log('\n--- Step 7: On-Chain Events ---');
const trades = await (await fetch('http://localhost:8787/v1/real/events/trades')).json();
const deposits = await (await fetch('http://localhost:8787/v1/real/events/deposits')).json();
console.log('Trades:', JSON.stringify(trades));
console.log('Deposits:', JSON.stringify(deposits));

console.log('\n=== Loop Complete ===');
console.log('Summary:');
console.log('- Resting sell order: submitted');
console.log('- Crossing buy order: submitted');
console.log('- Fills:', fills.fills?.length ?? 0);
console.log('- On-chain trades:', trades.trades?.length ?? 0);
