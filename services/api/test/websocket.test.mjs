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
    assert.equal(message.snapshot.data.fills[0].sourceEventId, 'event-000001');
    assert.equal(Object.hasOwn(message.snapshot.data.fills[0], 'createdAt'), false);
  }, { state });
});
