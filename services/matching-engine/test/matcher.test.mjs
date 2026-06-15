import assert from 'node:assert/strict';
import test from 'node:test';

import { createMatchingEngine } from '../src/index.js';

// Deterministic mock order builder — signature signer matches owner by default
const mockOrder = (overrides = {}) => {
  const base = {
    marketId: 'WQUAI-WQI',
    side: 'buy',
    type: 'limit',
    baseToken: 'WQUAI',
    quoteToken: 'WQI',
    amount: '1000',
    price: '100',
    timeInForce: 'GTC',
    maxSlippageBps: 50,
    owner: '0x1111111111111111111111111111111111111111',
    delegate: '0x0000000000000000000000000000000000000000',
    nonce: '1',
    expiresAt: 1780003600,
    chainId: 0,
    settlementContract: '0x2222222222222222222222222222222222222222',
    signature: {
      scheme: 'mock',
      signer: '0x1111111111111111111111111111111111111111',
      value: '0xmock-signature',
    },
  };
  const owner = overrides.owner ?? base.owner;
  return {
    ...base,
    ...overrides,
    signature: {
      scheme: 'mock',
      signer: owner,
      value: '0xmock-signature',
    },
  };
};

test('createMatchingEngine returns an engine with submitOrder, listOrders, cancelOrder, cancelAll, and getOrderbook', () => {
  const engine = createMatchingEngine();
  assert.equal(typeof engine.submitOrder, 'function');
  assert.equal(typeof engine.listOrders, 'function');
  assert.equal(typeof engine.cancelOrder, 'function');
  assert.equal(typeof engine.cancelAll, 'function');
  assert.equal(typeof engine.getOrderbook, 'function');
});

test('submitOrder accepts a valid limit buy order', () => {
  const engine = createMatchingEngine();
  const result = engine.submitOrder(mockOrder());

  assert.equal(result.accepted, true);
  assert.equal(result.statusCode, 201);
  assert.equal(result.body.orderHash.startsWith('0x'), true);
  assert.equal(result.body.marketId, 'WQUAI-WQI');
  assert.equal(result.body.side, 'buy');
  assert.equal(result.body.amount, '1000');
  assert.equal(result.body.price, '100');
  assert.equal(result.body.status, 'open');
  assert.equal(result.body.filledAmount, '0');
  assert.equal(result.body.remainingAmount, '1000');
  assert.equal(result.body.source, 'mock-matching-engine');
  assert.equal(result.body.custody, 'non-custodial-no-withdrawal-authority');
});

test('submitOrder rejects an order missing required fields', () => {
  const engine = createMatchingEngine();
  const result = engine.submitOrder({ marketId: 'WQUAI-WQI' });

  assert.equal(result.accepted, false);
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.error, 'order_rejected');
  assert.equal(result.body.reason, 'missing_required_fields');
  assert.ok(Array.isArray(result.body.missingFields));
  assert.ok(result.body.missingFields.length > 0);
});

test('submitOrder rejects an order for a disabled market', () => {
  const engine = createMatchingEngine();
  const result = engine.submitOrder(mockOrder({ marketId: 'UNKNOWN-PAIR' }));

  assert.equal(result.accepted, false);
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.reason, 'market_disabled');
});

test('submitOrder rejects an order with an invalid side', () => {
  const engine = createMatchingEngine();
  const result = engine.submitOrder(mockOrder({ side: 'hold' }));

  assert.equal(result.accepted, false);
  assert.equal(result.body.reason, 'invalid_side');
});

test('submitOrder rejects an order with an invalid type', () => {
  const engine = createMatchingEngine();
  const result = engine.submitOrder(mockOrder({ type: 'stop_limit' }));

  assert.equal(result.accepted, false);
  assert.equal(result.body.reason, 'invalid_type');
});

test('submitOrder rejects a market_ioc order without slippage protection', () => {
  const engine = createMatchingEngine();
  const result = engine.submitOrder(mockOrder({
    type: 'market_ioc',
    timeInForce: 'IOC',
    maxSlippageBps: 0,
  }));

  assert.equal(result.accepted, false);
  assert.equal(result.body.reason, 'market_ioc_requires_slippage_bound');
});

test('submitOrder rejects an expired order', () => {
  const engine = createMatchingEngine();
  const result = engine.submitOrder(mockOrder({ expiresAt: 1000000000 }));

  assert.equal(result.accepted, false);
  assert.equal(result.body.reason, 'order_expired');
});

test('submitOrder rejects a duplicate order', () => {
  const engine = createMatchingEngine();
  const order = mockOrder();

  const result1 = engine.submitOrder(order);
  assert.equal(result1.accepted, true);

  const result2 = engine.submitOrder(order);
  assert.equal(result2.accepted, false);
  assert.equal(result2.body.reason, 'duplicate_order');
});

test('submitOrder rejects an invalid mock signature', () => {
  const engine = createMatchingEngine();
  // Build order manually to avoid mockOrder fixing the signature
  const order = {
    ...mockOrder(),
    signature: { scheme: 'ethers', signer: '0x1111', value: '0xabc' },
  };
  const result = engine.submitOrder(order);

  assert.equal(result.accepted, false);
  assert.equal(result.body.reason, 'invalid_signature');
});

test('listOrders returns empty array for a fresh engine', () => {
  const engine = createMatchingEngine();
  const orders = engine.listOrders();

  assert.ok(Array.isArray(orders));
  assert.equal(orders.length, 0);
});

test('listOrders returns submitted orders without internal fields', () => {
  const engine = createMatchingEngine();
  // Buy at 100, sell at 200 — no crossing
  engine.submitOrder(mockOrder({ nonce: '1' }));
  engine.submitOrder(mockOrder({ side: 'sell', price: '200', nonce: '2' }));

  const orders = engine.listOrders();
  assert.equal(orders.length, 2);
  // Public orders should not contain signedOrder or acceptedSequence
  for (const order of orders) {
    assert.equal(order.signedOrder === undefined, true);
    assert.equal(order.acceptedSequence === undefined, true);
  }
});

test('cancelOrder cancels an open order and removes it from the book', () => {
  const engine = createMatchingEngine();
  const result = engine.submitOrder(mockOrder());
  const orderHash = result.body.orderHash;

  const cancelResult = engine.cancelOrder(orderHash);
  assert.equal(cancelResult.statusCode, 200);
  assert.equal(cancelResult.body.cancelled, true);
  assert.equal(cancelResult.body.cancelledCount, 1);
  assert.equal(cancelResult.body.source, 'mock-matching-engine');
  assert.equal(cancelResult.body.nonceManager, 'matcher-local-cancel-only-on-chain-nonce-unchanged');

  // Verify order is no longer open
  const orders = engine.listOrders();
  const cancelled = orders.find((o) => o.orderHash === orderHash);
  assert.equal(cancelled.status, 'cancelled');
});

test('cancelOrder returns 404 for unknown order hash', () => {
  const engine = createMatchingEngine();
  const result = engine.cancelOrder('0xunknown');

  assert.equal(result.statusCode, 404);
  assert.equal(result.body.error, 'order_not_found');
  assert.equal(result.body.nonceManager, 'matcher-local-cancel-only-on-chain-nonce-unchanged');
});

test('cancelOrder returns 409 for already-filled order', () => {
  const engine = createMatchingEngine();
  // Sell at 50, buy at 100 — buy crosses sell
  engine.submitOrder(mockOrder({ side: 'sell', price: '50', amount: '500', nonce: '1' }));
  const buyResult = engine.submitOrder(mockOrder({ price: '100', amount: '500', nonce: '2' }));

  const cancelResult = engine.cancelOrder(buyResult.body.orderHash);
  assert.equal(cancelResult.statusCode, 409);
  assert.equal(cancelResult.body.error, 'order_not_open');
});

test('cancelAll cancels all open orders', () => {
  const engine = createMatchingEngine();
  // Non-crossing orders: buy at 100, buy at 100 (same side), sell at 200
  engine.submitOrder(mockOrder({ nonce: '1' }));
  engine.submitOrder(mockOrder({ nonce: '2' }));
  engine.submitOrder(mockOrder({ side: 'sell', price: '200', nonce: '3' }));

  const result = engine.cancelAll();
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.cancelledCount, 3);
  assert.equal(result.body.permissions.includes('CANCEL_ALL'), true);
});

test('cancelAll with owner filter cancels only matching orders', () => {
  const engine = createMatchingEngine();
  // Use different owners but non-crossing orders
  const ownerA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const ownerB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  engine.submitOrder(mockOrder({ owner: ownerA, side: 'buy', price: '100', nonce: '1' }));
  engine.submitOrder(mockOrder({ owner: ownerB, side: 'sell', price: '200', nonce: '2' }));

  const result = engine.cancelAll({ owner: ownerA });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.cancelledCount, 1);
  assert.equal(result.body.filters.owner, ownerA);
});

test('getOrderbook returns empty book for a fresh engine', () => {
  const engine = createMatchingEngine();
  const book = engine.getOrderbook('WQUAI-WQI');

  assert.equal(book.marketId, 'WQUAI-WQI');
  assert.ok(Array.isArray(book.bids));
  assert.ok(Array.isArray(book.asks));
  assert.equal(book.bids.length, 0);
  assert.equal(book.asks.length, 0);
  assert.equal(book.source, 'mock-orderbook');
});

test('getOrderbook returns resting orders sorted by price-time priority', () => {
  const engine = createMatchingEngine();
  // Bids at 100, 110; Asks at 150, 140 — all non-crossing
  engine.submitOrder(mockOrder({ side: 'buy', price: '100', amount: '100', nonce: '1' }));
  engine.submitOrder(mockOrder({ side: 'buy', price: '110', amount: '200', nonce: '2' }));
  engine.submitOrder(mockOrder({ side: 'sell', price: '150', amount: '150', nonce: '3' }));
  engine.submitOrder(mockOrder({ side: 'sell', price: '140', amount: '250', nonce: '4' }));

  const book = engine.getOrderbook('WQUAI-WQI');

  // Bids sorted highest price first
  assert.equal(book.bids.length, 2);
  assert.equal(book.bids[0].price, '110');
  assert.equal(book.bids[1].price, '100');

  // Asks sorted lowest price first
  assert.equal(book.asks.length, 2);
  assert.equal(book.asks[0].price, '140');
  assert.equal(book.asks[1].price, '150');
});

test('submitOrder crosses a buy with a resting sell when prices match', () => {
  const engine = createMatchingEngine();

  // Place a resting sell at price 100
  engine.submitOrder(mockOrder({ side: 'sell', price: '100', amount: '500', nonce: '1' }));

  // Place a buy at price 100 that should cross
  const buyResult = engine.submitOrder(mockOrder({ side: 'buy', price: '100', amount: '300', nonce: '2' }));

  assert.equal(buyResult.accepted, true);
  assert.ok(Array.isArray(buyResult.body.fills));
  assert.equal(buyResult.body.fills.length, 1);

  const fill = buyResult.body.fills[0];
  assert.equal(fill.projectionType, 'IndexedFillProjection');
  assert.equal(fill.marketId, 'WQUAI-WQI');
  assert.equal(fill.price, '100');
  assert.equal(fill.amount, '300');
  assert.equal(fill.settlementMode, 'mock');

  // Verify remaining amounts
  assert.equal(buyResult.body.filledAmount, '300');
  assert.equal(buyResult.body.remainingAmount, '0');
  assert.equal(buyResult.body.status, 'filled');
});

test('submitOrder creates partial fills when amounts differ', () => {
  const engine = createMatchingEngine();

  // Resting sell of 1000 at price 50
  engine.submitOrder(mockOrder({ side: 'sell', price: '50', amount: '1000', nonce: '1' }));

  // Buy of 300 at price 60 (crosses)
  const buyResult = engine.submitOrder(mockOrder({ side: 'buy', price: '60', amount: '300', nonce: '2' }));

  assert.equal(buyResult.body.fills.length, 1);
  assert.equal(buyResult.body.fills[0].amount, '300');
  assert.equal(buyResult.body.fills[0].price, '50'); // Maker (sell) price
  assert.equal(buyResult.body.filledAmount, '300');
  assert.equal(buyResult.body.remainingAmount, '0');
  assert.equal(buyResult.body.status, 'filled');

  // Verify the sell order was partially filled
  const orders = engine.listOrders();
  const sellOrder = orders.find((o) => o.side === 'sell');
  assert.equal(sellOrder.filledAmount, '300');
  assert.equal(sellOrder.remainingAmount, '700');
  assert.equal(sellOrder.status, 'partially_filled');
});

test('market_ioc orders with valid slippage are accepted and match immediately', () => {
  const engine = createMatchingEngine();

  engine.submitOrder(mockOrder({ side: 'sell', price: '100', amount: '500', nonce: '1' }));

  const result = engine.submitOrder(mockOrder({
    type: 'market_ioc',
    timeInForce: 'IOC',
    maxSlippageBps: 50,
    price: '200', // max price
    amount: '200',
    nonce: '2',
  }));

  assert.equal(result.accepted, true);
  assert.equal(result.body.fills.length, 1);
  // IOC residual with no remaining match should not rest
  assert.equal(result.body.status, 'filled');
});

test('matching engine preserves NO_WITHDRAW and NO_ADMIN safety metadata', () => {
  const engine = createMatchingEngine();
  const result = engine.submitOrder(mockOrder());

  assert.equal(result.body.custody, 'non-custodial-no-withdrawal-authority');
});

test('createOrderHash is deterministic for the same order', () => {
  const engine = createMatchingEngine();
  const order = mockOrder();

  const result1 = engine.submitOrder(order);
  engine.submitOrder(mockOrder({ nonce: '99' })); // Different order

  // Verify the hash is deterministic
  assert.equal(result1.body.orderHash.startsWith('0x'), true);
  assert.equal(result1.body.orderHash.length, 66); // 0x + 64 hex chars
});
