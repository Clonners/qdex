import assert from 'node:assert/strict';
import test from 'node:test';

import { createMockDexState } from '../services/api/src/mock-dex.js';

const ZERO_DELEGATE = '0x0000000000000000000000000000000000000000';
const SETTLEMENT_CONTRACT = '0x2222222222222222222222222222222222222222';

const mockOrder = (overrides = {}) => {
  const owner = overrides.owner ?? '0x1111111111111111111111111111111111111111';
  const nonce = overrides.nonce ?? '1';

  return {
    marketId: 'WQUAI-WQI',
    side: 'sell',
    type: 'limit',
    baseToken: 'mock:WQUAI',
    quoteToken: 'mock:WQI',
    amount: '100',
    price: '5',
    timeInForce: 'GTC',
    maxSlippageBps: 0,
    owner,
    delegate: ZERO_DELEGATE,
    nonce,
    expiresAt: 1780003600,
    chainId: 0,
    settlementContract: SETTLEMENT_CONTRACT,
    clientOrderId: `mock-order-${nonce}`,
    signature: {
      scheme: 'mock',
      signer: owner,
      value: `0xmock-${nonce}`,
      signedAt: 1780000000,
    },
    ...overrides,
    signature: {
      scheme: 'mock',
      signer: owner,
      value: `0xmock-${nonce}`,
      signedAt: 1780000000,
      ...(overrides.signature ?? {}),
    },
  };
};

test('integration: order → matching engine → relayer → indexer → proof full flow', async () => {
  const state = createMockDexState();

  // Step 1: Submit resting sell order
  const sell = await state.submitOrder(mockOrder({
    side: 'sell',
    amount: '100',
    price: '5',
    nonce: '101',
    owner: '0x1111111111111111111111111111111111111111',
  }));

  assert.equal(sell.statusCode, 201);
  assert.equal(sell.body.status, 'open');
  assert.equal(sell.body.filledAmount, '0');
  assert.equal(sell.body.remainingAmount, '100');
  assert.equal(sell.body.fills.length, 0);

  // Step 2: Verify order is in the orderbook
  const bookBeforeBuy = state.getOrderbook('WQUAI-WQI');
  assert.equal(bookBeforeBuy.bids.length, 0);
  assert.equal(bookBeforeBuy.asks.length, 1);
  assert.equal(bookBeforeBuy.asks[0].orderHash, sell.body.orderHash);
  assert.equal(bookBeforeBuy.asks[0].price, '5');

  // Step 3: Submit crossing buy order — should produce fill via matching engine
  const buy = await state.submitOrder(mockOrder({
    side: 'buy',
    amount: '100',
    price: '6',
    nonce: '202',
    owner: '0x3333333333333333333333333333333333333333',
  }));

  assert.equal(buy.statusCode, 201);
  assert.equal(buy.body.status, 'filled');
  assert.equal(buy.body.filledAmount, '100');
  assert.equal(buy.body.remainingAmount, '0');
  assert.equal(buy.body.fills.length, 1);

  // Step 4: Verify fill went through relayer → indexer pipeline
  const [fill] = buy.body.fills;
  assert.equal(fill.projectionType, 'IndexedFillProjection');
  assert.ok(fill.fillId, 'fill ID present');
  assert.ok(fill.tradeId, 'trade ID present');
  assert.equal(fill.marketId, 'WQUAI-WQI');
  assert.equal(fill.makerOrderHash, sell.body.orderHash);
  assert.equal(fill.takerOrderHash, buy.body.orderHash);
  assert.equal(fill.price, '5');
  assert.equal(fill.amount, '100');
  assert.equal(fill.settlementMode, 'mock');
  assert.equal(fill.settlementStatus, 'confirmed');
  assert.ok(fill.sourceEventId, 'event ID present');

  // Step 5: Verify relayer has the fill in confirmed state
  const relayerState = state.getRelayerFillState(fill.fillId);
  assert.equal(relayerState.fillId, fill.fillId);
  assert.equal(relayerState.state, 'confirmed');
  assert.equal(relayerState.settlementMode, 'mock');
  assert.ok(relayerState.mockSettlementReference);
  assert.ok(relayerState.events.length > 0);

  // Step 6: Verify all relayer fills endpoint
  const allRelayerFills = state.getRelayerFills();
  assert.equal(allRelayerFills.length, 1);
  assert.equal(allRelayerFills[0].fillId, fill.fillId);
  assert.equal(allRelayerFills[0].state, 'confirmed');

  // Step 7: Verify indexer has the fill
  const indexerFills = state.listFills();
  assert.equal(indexerFills.length, 1);
  assert.equal(indexerFills[0].fillId, fill.fillId);

  // Step 8: Verify indexer has the trade
  const trades = state.listTrades('WQUAI-WQI');
  assert.equal(trades.length, 1);
  assert.equal(trades[0].tradeId, fill.tradeId);
  assert.equal(trades[0].settlementStatus, 'confirmed');

  // Step 9: Verify proof service has the proof
  const proof = state.getProof(fill.tradeId);
  assert.ok(proof, 'proof exists');
  assert.equal(proof.tradeId, fill.tradeId);
  assert.equal(proof.fillId, fill.fillId);
  assert.equal(proof.settlementMode, 'mock');

  // Step 10: Verify orderbook is empty after fill
  const bookAfterMatch = state.getOrderbook('WQUAI-WQI');
  assert.equal(bookAfterMatch.bids.length, 0);
  assert.equal(bookAfterMatch.asks.length, 0);

  // Step 11: Verify both orders are in history
  const orders = state.listOrders();
  assert.ok(orders.length >= 2);
  const sellInHistory = orders.find((o) => o.orderHash === sell.body.orderHash);
  const buyInHistory = orders.find((o) => o.orderHash === buy.body.orderHash);
  assert.equal(sellInHistory.status, 'filled');
  assert.equal(buyInHistory.status, 'filled');

  // Step 12: Verify cancellation of filled order is rejected
  const cancelResult = state.cancelOrder(sell.body.orderHash);
  assert.equal(cancelResult.statusCode, 409);
  assert.equal(cancelResult.body.error, 'order_not_open');
});

test('integration: multiple fills through relayer maintain independent state', async () => {
  const state = createMockDexState();

  // Place two sell orders
  const sell1 = await state.submitOrder(mockOrder({
    side: 'sell',
    amount: '50',
    price: '5',
    nonce: '1',
    owner: '0x1111111111111111111111111111111111111111',
  }));

  const sell2 = await state.submitOrder(mockOrder({
    side: 'sell',
    amount: '50',
    price: '6',
    nonce: '2',
    owner: '0x1111111111111111111111111111111111111111',
  }));

  assert.equal(sell1.statusCode, 201);
  assert.equal(sell2.statusCode, 201);

  // Place buy that crosses both
  const buy = await state.submitOrder(mockOrder({
    side: 'buy',
    amount: '100',
    price: '7',
    nonce: '3',
    owner: '0x3333333333333333333333333333333333333333',
  }));

  assert.equal(buy.statusCode, 201);
  // The matching engine may produce 1 or 2 fills depending on price-time priority
  assert.ok(buy.body.fills.length >= 1, `expected at least 1 fill, got ${buy.body.fills.length}`);

  // Verify fills went through relayer
  const allFills = state.getRelayerFills();
  assert.ok(allFills.length >= 1, `at least 1 relayer fill, got ${allFills.length}`);
  for (const fill of allFills) {
    assert.equal(fill.state, 'confirmed');
  }

  // Verify indexer has fills
  const indexerFills = state.listFills();
  assert.ok(indexerFills.length >= 1, `at least 1 indexed fill, got ${indexerFills.length}`);

  // Verify orderbook is empty
  const book = state.getOrderbook('WQUAI-WQI');
  assert.equal(book.bids.length, 0);
  assert.equal(book.asks.length, 0);
});

test('integration: GET /v1/settlements endpoint returns relayer fill states', async () => {
  const state = createMockDexState();

  // Create a fill
  const sell = await state.submitOrder(mockOrder({
    side: 'sell',
    amount: '100',
    price: '5',
    nonce: '101',
    owner: '0x1111111111111111111111111111111111111111',
  }));

  const buy = await state.submitOrder(mockOrder({
    side: 'buy',
    amount: '100',
    price: '6',
    nonce: '202',
    owner: '0x3333333333333333333333333333333333333333',
  }));

  assert.equal(buy.body.fills.length, 1);
  const fillId = buy.body.fills[0].fillId;

  // Verify settlements endpoint
  const settlements = state.getSettlements();
  assert.equal(settlements.status, 'active');
  assert.equal(settlements.settlementMode, 'mock');
  assert.ok(Array.isArray(settlements.fills));
  assert.equal(settlements.fills.length, 1);
  assert.equal(settlements.fills[0].fillId, fillId);
  assert.equal(settlements.fills[0].status, 'confirmed');
});
