import assert from 'node:assert/strict';
import test from 'node:test';

import { createMockDexState } from '../services/api/src/mock-dex.js';
import { createStreamSnapshot } from '../services/api/src/streams.js';

test('WebSocket stream emits real-time trade snapshots on market.WQUAI-WQI.trades', () => {
  const state = createMockDexState();

  // Initial snapshot — empty
  const initial = createStreamSnapshot({
    channel: 'market.WQUAI-WQI.trades',
    state,
  });

  assert.equal(initial.channel, 'market.WQUAI-WQI.trades');
  assert.equal(initial.visibility, 'public');
  assert.equal(initial.source, 'in-memory-indexer-projection');
  assert.ok(Array.isArray(initial.data.trades));
  assert.equal(initial.data.trades.length, 0, 'initial trades empty');

  // Subscribe to stream updates
  let streamEventReceived = null;
  const unsubscribe = state.subscribeStreamUpdates((event) => {
    streamEventReceived = event;
  });
  assert.ok(typeof unsubscribe === 'function', 'subscription returns unsubscribe function');

  // Submit orders that cross
  const ZERO_DELEGATE = '0x0000000000000000000000000000000000000000';
  const SETTLEMENT_CONTRACT = '0x2222222222222222222222222222222222222222';

  const mockOrder = (side, nonce, owner) => ({
    marketId: 'WQUAI-WQI',
    side,
    type: 'limit',
    baseToken: 'mock:WQUAI',
    quoteToken: 'mock:WQI',
    amount: '100',
    price: side === 'sell' ? '5' : '6',
    timeInForce: 'GTC',
    maxSlippageBps: 0,
    owner,
    delegate: ZERO_DELEGATE,
    nonce,
    expiresAt: 1780003600,
    chainId: 0,
    settlementContract: SETTLEMENT_CONTRACT,
    signature: {
      scheme: 'mock',
      signer: owner,
      value: `0xmock-${nonce}`,
      signedAt: 1780000000,
    },
  });

  const sell = state.submitOrder(mockOrder('sell', '1', '0x1111111111111111111111111111111111111111'));
  assert.equal(sell.statusCode, 201);
  assert.equal(sell.body.status, 'open');

  // No stream event yet — just order placement
  const bookAfterSell = createStreamSnapshot({
    channel: 'market.WQUAI-WQI.depth',
    state,
  });
  assert.equal(bookAfterSell.data.asks.length, 1);

  const buy = state.submitOrder(mockOrder('buy', '2', '0x3333333333333333333333333333333333333333'));
  assert.equal(buy.statusCode, 201);
  assert.equal(buy.body.status, 'filled');
  assert.equal(buy.body.fills.length, 1);

  // Stream event should have been emitted
  assert.ok(streamEventReceived, 'stream event was emitted on fill');
  assert.ok(streamEventReceived.channels.includes('market.WQUAI-WQI.trades'));
  assert.ok(streamEventReceived.channels.includes('fills'));
  assert.ok(streamEventReceived.channels.includes('market.WQUAI-WQI.depth'));
  assert.ok(streamEventReceived.channels.includes('orders'));

  // Snapshot now shows the trade
  const tradesAfter = createStreamSnapshot({
    channel: 'market.WQUAI-WQI.trades',
    state,
  });
  assert.equal(tradesAfter.data.trades.length, 1);
  assert.equal(tradesAfter.data.trades[0].settlementStatus, 'confirmed');
  assert.ok(tradesAfter.data.trades[0].tradeId);
  assert.ok(tradesAfter.data.trades[0].fillId);

  // Fills channel also updated
  const fillsSnapshot = createStreamSnapshot({
    channel: 'fills',
    state,
  });
  assert.equal(fillsSnapshot.data.fills.length, 1);
  assert.equal(fillsSnapshot.data.fills[0].settlementStatus, 'confirmed');

  // Orderbook is empty after cross
  const bookAfter = createStreamSnapshot({
    channel: 'market.WQUAI-WQI.depth',
    state,
  });
  assert.equal(bookAfter.data.asks.length, 0);
  assert.equal(bookAfter.data.bids.length, 0);

  // Unsubscribe works
  unsubscribe();

  // Test: deposits stream updates on vault operations
  const deposit = state.deposit({
    owner: '0x1111111111111111111111111111111111111111',
    token: 'WQUAI',
    amount: '1000',
  });
  assert.equal(deposit.statusCode, 200);
  assert.equal(deposit.body.deposited, true);

  // Balances stream shows updated balance
  const balancesSnapshot = createStreamSnapshot({
    channel: 'balances',
    state,
  });
  assert.ok(Array.isArray(balancesSnapshot.data.balances));
  assert.ok(balancesSnapshot.data.balances.length > 0);

  // Withdrawal stream updates
  const withdrawal = state.withdraw({
    owner: '0x1111111111111111111111111111111111111111',
    token: 'WQUAI',
    amount: '200',
  });
  assert.equal(withdrawal.statusCode, 200);
  assert.equal(withdrawal.body.withdrawn, true);

  // Insufficient funds check
  const tooMuch = state.withdraw({
    owner: '0x1111111111111111111111111111111111111111',
    token: 'WQUAI',
    amount: '999999',
  });
  assert.ok(tooMuch.statusCode >= 400, `insufficient funds rejected with ${tooMuch.statusCode}`);
  assert.equal(tooMuch.body.error, 'vault_withdrawal_rejected');
});
