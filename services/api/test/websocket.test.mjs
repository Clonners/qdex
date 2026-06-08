import assert from 'node:assert/strict';
import test from 'node:test';

import { createMockDexState } from '../src/mock-dex.js';
import { createApiServer } from '../src/server.js';

const ZERO_DELEGATE = '0x0000000000000000000000000000000000000000';
const SETTLEMENT_CONTRACT = '0x2222222222222222222222222222222222222222';

const mockOrder = (overrides = {}) => {
  const owner = overrides.owner ?? '0x1111111111111111111111111111111111111111';
  const nonce = overrides.nonce ?? '1';

  return {
    marketId: 'QI-QUAI',
    side: 'sell',
    type: 'limit',
    baseToken: 'mock:QI',
    quoteToken: 'mock:QUAI',
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
    clientOrderId: `ws-transport-order-${nonce}`,
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

const withServer = async (callback, { state = createMockDexState() } = {}) => {
  const server = createApiServer({ state });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();

  try {
    return await callback(`ws://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const readWebSocketSnapshot = async (baseUrl, channel) => {
  const ws = new WebSocket(`${baseUrl}/v1/ws?channel=${encodeURIComponent(channel)}`);

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`timed out waiting for ${channel} snapshot`));
    }, 2_000);

    ws.addEventListener('message', (event) => {
      clearTimeout(timeout);
      ws.close();
      assert.equal(typeof event.data, 'string');
      resolve(JSON.parse(event.data));
    }, { once: true });

    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error(`websocket transport failed for ${channel}`));
    }, { once: true });
  });
};

const nextWebSocketMessage = async (ws, label) => await new Promise((resolve, reject) => {
  const onMessage = (event) => {
    cleanup();
    assert.equal(typeof event.data, 'string');
    resolve(JSON.parse(event.data));
  };

  const onError = () => {
    cleanup();
    reject(new Error(`websocket transport failed while waiting for ${label}`));
  };

  const timeout = setTimeout(() => {
    cleanup();
    ws.close();
    reject(new Error(`timed out waiting for ${label}`));
  }, 2_000);

  const cleanup = () => {
    clearTimeout(timeout);
    ws.removeEventListener('message', onMessage);
    ws.removeEventListener('error', onError);
  };

  ws.addEventListener('message', onMessage);
  ws.addEventListener('error', onError, { once: true });
});

const requestJson = async (baseUrl, path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  return {
    status: response.status,
    body: await response.json(),
  };
};

test('WebSocket transport sends public stream snapshots from /v1/ws channel query', async () => {
  await withServer(async (baseUrl) => {
    const message = await readWebSocketSnapshot(baseUrl, 'market.QI-QUAI.depth');

    assert.equal(message.type, 'snapshot');
    assert.equal(message.transport, 'websocket');
    assert.deepEqual(message.snapshot, {
      channel: 'market.QI-QUAI.depth',
      visibility: 'public',
      payload: 'orderbook_depth',
      source: 'mock-orderbook',
      custody: 'public-read-only-no-custody',
      data: {
        marketId: 'QI-QUAI',
        sequence: 0,
        bids: [],
        asks: [],
        source: 'mock-orderbook',
      },
    });
  });
});

test('WebSocket transport sends private fill snapshots without withdrawal authority', async () => {
  const state = createMockDexState();

  const sell = state.submitOrder(mockOrder({
    side: 'sell',
    amount: '100',
    price: '5',
    nonce: '401',
    owner: '0x1111111111111111111111111111111111111111',
  }));
  assert.equal(sell.statusCode, 201);

  const buy = state.submitOrder(mockOrder({
    side: 'buy',
    amount: '100',
    price: '6',
    nonce: '402',
    owner: '0x3333333333333333333333333333333333333333',
  }));
  assert.equal(buy.statusCode, 201);
  assert.equal(buy.body.fills.length, 1);

  await withServer(async (baseUrl) => {
    const message = await readWebSocketSnapshot(baseUrl, 'fills');

    assert.equal(message.type, 'snapshot');
    assert.equal(message.transport, 'websocket');
    assert.equal(message.snapshot.channel, 'fills');
    assert.equal(message.snapshot.visibility, 'private');
    assert.equal(message.snapshot.source, 'in-memory-indexer-projection');
    assert.equal(message.snapshot.custody, 'non-custodial-no-withdrawal-authority');
    assert.deepEqual(message.snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(message.snapshot.safetyNotice, 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');
    assert.deepEqual(message.snapshot.data.fills, [buy.body.fills[0]]);
    assert.equal(message.snapshot.data.fills[0].projectionType, 'IndexedFillProjection');
    assert.equal(message.snapshot.data.fills[0].sourceEventId, 'event-000001');
    assert.equal(Object.hasOwn(message.snapshot.data.fills[0], 'createdAt'), false);
  }, { state });
});

test('WebSocket transport sends private TradingVault deposit and withdrawal history snapshots', async () => {
  await withServer(async (baseUrl) => {
    for (const expectation of [
      {
        channel: 'deposits',
        payload: 'deposit_projection',
        collection: 'deposits',
        projectionType: 'TradingVaultDepositProjection',
        eventName: 'Deposit',
      },
      {
        channel: 'withdrawals',
        payload: 'withdrawal_projection',
        collection: 'withdrawals',
        projectionType: 'TradingVaultWithdrawalProjection',
        eventName: 'Withdraw',
      },
    ]) {
      const message = await readWebSocketSnapshot(baseUrl, expectation.channel);

      assert.equal(message.type, 'snapshot');
      assert.equal(message.transport, 'websocket');
      assert.equal(message.snapshot.channel, expectation.channel);
      assert.equal(message.snapshot.visibility, 'private');
      assert.equal(message.snapshot.payload, expectation.payload);
      assert.equal(message.snapshot.source, 'tradingvault-event-projection');
      assert.equal(message.snapshot.custody, 'non-custodial-no-withdrawal-authority');
      assert.deepEqual(message.snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.equal(message.snapshot.safetyNotice, 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');

      assert.deepEqual(message.snapshot.data[expectation.collection], []);
      assert.equal(message.snapshot.data.source, 'tradingvault-event-projection');
      assert.equal(message.snapshot.data.projectionType, expectation.projectionType);
      assert.equal(message.snapshot.data.eventName, expectation.eventName);
      assert.equal(message.snapshot.data.custody, 'non-custodial-contract-vault');
      assert.deepEqual(message.snapshot.data.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.equal(message.snapshot.data.settlementMode, 'mock');
      assert.equal(message.snapshot.data.settlementTx, null);
      assert.equal(message.snapshot.data.blockNumber, null);
      assert.equal(message.snapshot.data.blockHash, null);
      assert.equal(message.snapshot.data.eventIndex, null);
      assert.equal(message.snapshot.data.explorerUrl, null);
      assert.equal(message.snapshot.data.realQuaiTransactions, false);
      assert.equal(message.snapshot.data.walletRequired, false);
      assert.equal(message.snapshot.data.fundsMoved, false);
      assert.equal(message.snapshot.data.tradingVaultMutation, false);
    }
  });
});

test('WebSocket transport fanouts live snapshots after mock orderbook and fill mutations', async () => {
  await withServer(async (baseUrl) => {
    const httpBaseUrl = baseUrl.replace('ws://', 'http://');
    const depthWs = new WebSocket(`${baseUrl}/v1/ws?channel=${encodeURIComponent('market.QI-QUAI.depth')}`);
    const fillsWs = new WebSocket(`${baseUrl}/v1/ws?channel=fills`);

    try {
      const initialDepth = await nextWebSocketMessage(depthWs, 'initial depth snapshot');
      assert.equal(initialDepth.type, 'snapshot');
      assert.deepEqual(initialDepth.snapshot.data.asks, []);
      assert.deepEqual(initialDepth.snapshot.data.bids, []);

      const initialFills = await nextWebSocketMessage(fillsWs, 'initial fills snapshot');
      assert.equal(initialFills.type, 'snapshot');
      assert.deepEqual(initialFills.snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.deepEqual(initialFills.snapshot.data.fills, []);

      const depthAfterRestingOrder = nextWebSocketMessage(depthWs, 'depth update after resting sell');
      const sell = await requestJson(httpBaseUrl, '/v1/orders', {
        method: 'POST',
        body: JSON.stringify({
          order: mockOrder({
            side: 'sell',
            amount: '100',
            price: '5',
            nonce: '501',
            owner: '0x1111111111111111111111111111111111111111',
          }),
        }),
      });
      assert.equal(sell.status, 201);

      const restingDepth = await depthAfterRestingOrder;
      assert.equal(restingDepth.type, 'snapshot');
      assert.equal(restingDepth.streamEvent.reason, 'orderbook_changed');
      assert.deepEqual(restingDepth.snapshot.data.asks, [
        {
          orderHash: sell.body.orderHash,
          price: '5',
          amount: '100',
          remainingAmount: '100',
          owner: '0x1111111111111111111111111111111111111111',
        },
      ]);

      const depthAfterMatch = nextWebSocketMessage(depthWs, 'depth update after matched buy');
      const fillsAfterMatch = nextWebSocketMessage(fillsWs, 'fills update after matched buy');
      const buy = await requestJson(httpBaseUrl, '/v1/orders', {
        method: 'POST',
        body: JSON.stringify({
          order: mockOrder({
            side: 'buy',
            amount: '100',
            price: '6',
            nonce: '502',
            owner: '0x3333333333333333333333333333333333333333',
          }),
        }),
      });
      assert.equal(buy.status, 201);
      assert.equal(buy.body.fills.length, 1);

      const [matchedDepth, matchedFills] = await Promise.all([depthAfterMatch, fillsAfterMatch]);
      assert.equal(matchedDepth.streamEvent.reason, 'mock_settlement_confirmed');
      assert.deepEqual(matchedDepth.snapshot.data.asks, []);
      assert.deepEqual(matchedDepth.snapshot.data.bids, []);

      assert.equal(matchedFills.streamEvent.reason, 'mock_settlement_confirmed');
      assert.deepEqual(matchedFills.streamEvent.channels, [
        'market.QI-QUAI.depth',
        'orders',
        'market.QI-QUAI.trades',
        'fills',
        'settlements',
        'global.tickers',
      ]);
      assert.equal(matchedFills.snapshot.source, 'in-memory-indexer-projection');
      assert.deepEqual(matchedFills.snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.deepEqual(matchedFills.snapshot.data.fills, [buy.body.fills[0]]);
      assert.equal(matchedFills.snapshot.data.fills[0].projectionType, 'IndexedFillProjection');
      assert.equal(matchedFills.snapshot.data.fills[0].sourceEventId, 'event-000001');
      assert.equal(Object.hasOwn(matchedFills.snapshot.data.fills[0], 'createdAt'), false);
    } finally {
      depthWs.close();
      fillsWs.close();
    }
  });
});

test('WebSocket transport fanouts matcher-local cancellation snapshots to depth and orders streams', async () => {
  await withServer(async (baseUrl) => {
    const httpBaseUrl = baseUrl.replace('ws://', 'http://');
    const depthWs = new WebSocket(`${baseUrl}/v1/ws?channel=${encodeURIComponent('market.QI-QUAI.depth')}`);
    const ordersWs = new WebSocket(`${baseUrl}/v1/ws?channel=orders`);

    try {
      const initialDepth = await nextWebSocketMessage(depthWs, 'initial depth snapshot before cancellation');
      assert.equal(initialDepth.type, 'snapshot');
      assert.deepEqual(initialDepth.snapshot.data.asks, []);

      const initialOrders = await nextWebSocketMessage(ordersWs, 'initial orders snapshot before cancellation');
      assert.equal(initialOrders.type, 'snapshot');
      assert.equal(initialOrders.snapshot.visibility, 'private');
      assert.deepEqual(initialOrders.snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.deepEqual(initialOrders.snapshot.data.orders, []);

      const depthAfterRestingOrder = nextWebSocketMessage(depthWs, 'depth update after resting order before cancellation');
      const ordersAfterRestingOrder = nextWebSocketMessage(ordersWs, 'orders update after resting order before cancellation');
      const sell = await requestJson(httpBaseUrl, '/v1/orders', {
        method: 'POST',
        body: JSON.stringify({
          order: mockOrder({
            side: 'sell',
            amount: '100',
            price: '5',
            nonce: '601',
            owner: '0x1111111111111111111111111111111111111111',
          }),
        }),
      });
      assert.equal(sell.status, 201);

      const [restingDepth, restingOrders] = await Promise.all([
        depthAfterRestingOrder,
        ordersAfterRestingOrder,
      ]);
      assert.equal(restingDepth.streamEvent.reason, 'orderbook_changed');
      assert.deepEqual(restingDepth.snapshot.data.asks.map((order) => order.orderHash), [sell.body.orderHash]);
      assert.equal(restingOrders.streamEvent.reason, 'orderbook_changed');
      assert.deepEqual(restingOrders.snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.deepEqual(restingOrders.snapshot.data.orders.map((order) => order.orderHash), [sell.body.orderHash]);

      const depthAfterCancel = nextWebSocketMessage(depthWs, 'depth update after matcher-local cancellation');
      const ordersAfterCancel = nextWebSocketMessage(ordersWs, 'orders update after matcher-local cancellation');
      const cancel = await requestJson(httpBaseUrl, `/v1/orders/${encodeURIComponent(sell.body.orderHash)}`, {
        method: 'DELETE',
      });
      assert.equal(cancel.status, 200);
      assert.equal(cancel.body.nonceManager, 'matcher-local-cancel-only-on-chain-nonce-unchanged');
      assert.deepEqual(cancel.body.permissions, ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);

      const [cancelledDepth, cancelledOrders] = await Promise.all([
        depthAfterCancel,
        ordersAfterCancel,
      ]);

      for (const message of [cancelledDepth, cancelledOrders]) {
        assert.equal(message.streamEvent.reason, 'matcher_local_order_cancelled');
        assert.deepEqual(message.streamEvent.channels, ['market.QI-QUAI.depth', 'orders']);
        assert.equal(message.streamEvent.source, 'mock-matching-engine');
        assert.equal(message.streamEvent.custody, 'non-custodial-no-withdrawal-authority');
        assert.equal(message.streamEvent.nonceManager, 'matcher-local-cancel-only-on-chain-nonce-unchanged');
        assert.deepEqual(message.streamEvent.permissions, ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
        assert.deepEqual(message.streamEvent.cancelledOrderHashes, [sell.body.orderHash]);
        assert.match(message.streamEvent.message, /does not cancel the on-chain nonce/i);
      }

      assert.deepEqual(cancelledDepth.snapshot.data.asks, []);
      assert.deepEqual(cancelledDepth.snapshot.data.bids, []);
      assert.deepEqual(cancelledOrders.snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.equal(cancelledOrders.snapshot.data.orders[0].orderHash, sell.body.orderHash);
      assert.equal(cancelledOrders.snapshot.data.orders[0].status, 'cancelled');
      assert.equal(cancelledOrders.snapshot.data.orders[0].remainingAmount, '0');
      assert.equal(cancelledOrders.snapshot.data.orders[0].nonceCancellation, 'not-implied-matcher-local-only');
      assert.equal(Object.hasOwn(cancelledOrders.snapshot.data.orders[0], 'createdAt'), false);
    } finally {
      depthWs.close();
      ordersWs.close();
    }
  });
});
