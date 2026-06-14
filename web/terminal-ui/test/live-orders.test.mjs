import assert from 'node:assert/strict';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  bindLiveOrderStream,
  buildOrderStreamUrl,
  normalizeOrderStreamMessage,
} from '../src/live-orders.js';

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.listeners = new Map();
    this.closed = false;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  close() {
    this.closed = true;
    this.readyState = 3;
    this.emit('close', {});
  }
}

const ORDER_HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CUSTODY_NOTE = 'non-custodial-no-withdrawal-authority';
const STREAM_SAFETY_NOTICE = 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.';
const NONCE_MANAGER_NOTE = 'matcher-local-cancel-only-on-chain-nonce-unchanged';
const CANCELLATION_MESSAGE = 'Mock cancellation removes only matcher-open quantity and does not cancel the on-chain nonce; user nonce cancellation must be signed through NonceManager later.';

const cancelledOrder = Object.freeze({
  orderHash: ORDER_HASH,
  marketId: 'WQUAI-WQI',
  owner: '0x1111111111111111111111111111111111111111',
  delegate: '0x0000000000000000000000000000000000000000',
  side: 'sell',
  type: 'limit',
  amount: '100',
  price: '5',
  filledAmount: '0',
  remainingAmount: '0',
  status: 'cancelled',
  custody: CUSTODY_NOTE,
  cancelledAmount: '100',
  cancelReason: 'cancel_order',
  nonceCancellation: 'not-implied-matcher-local-only',
});

const orderStreamCancelMessage = Object.freeze({
  type: 'snapshot',
  transport: 'websocket',
  snapshot: Object.freeze({
    channel: 'orders',
    visibility: 'private',
    payload: 'order_projection',
    source: 'mock-order-projection',
    custody: CUSTODY_NOTE,
    permissions: Object.freeze(['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']),
    safetyNotice: STREAM_SAFETY_NOTICE,
    data: Object.freeze({
      source: 'mock-order-projection',
      orders: Object.freeze([cancelledOrder]),
    }),
  }),
  streamEvent: Object.freeze({
    reason: 'matcher_local_order_cancelled',
    marketId: 'WQUAI-WQI',
    channels: Object.freeze(['market.WQUAI-WQI.depth', 'orders']),
    source: 'mock-matching-engine',
    custody: CUSTODY_NOTE,
    nonceManager: NONCE_MANAGER_NOTE,
    permissions: Object.freeze(['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']),
    cancelledOrderHashes: Object.freeze([ORDER_HASH]),
    message: CANCELLATION_MESSAGE,
  }),
});

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition was not satisfied');
};

test('buildOrderStreamUrl targets the local private orders WebSocket channel', () => {
  assert.equal(
    buildOrderStreamUrl({ baseUrl: 'http://127.0.0.1:8787' }),
    'ws://127.0.0.1:8787/v1/ws?channel=orders',
  );

  assert.equal(
    buildOrderStreamUrl({ baseUrl: 'https://dex.local:9443/app', channel: 'orders' }),
    'wss://dex.local:9443/v1/ws?channel=orders',
  );
});

test('normalizeOrderStreamMessage accepts only custody-safe matcher-local cancellation snapshots', () => {
  const normalized = normalizeOrderStreamMessage(orderStreamCancelMessage);

  assert.equal(normalized.channel, 'orders');
  assert.equal(normalized.source, 'mock-order-projection');
  assert.equal(normalized.custody, CUSTODY_NOTE);
  assert.deepEqual(normalized.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.match(normalized.safetyNotice, /no real Quai transaction/);
  assert.equal(normalized.orders[0].orderHash, ORDER_HASH);
  assert.equal(normalized.orders[0].status, 'cancelled');
  assert.equal(normalized.orders[0].remainingAmount, '0');
  assert.equal(normalized.orders[0].nonceCancellation, 'not-implied-matcher-local-only');
  assert.equal(Object.hasOwn(normalized.orders[0], 'createdAt'), false);
  assert.equal(normalized.streamEvent.reason, 'matcher_local_order_cancelled');
  assert.equal(normalized.streamEvent.nonceManager, NONCE_MANAGER_NOTE);
  assert.deepEqual(normalized.streamEvent.permissions, ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.deepEqual(normalized.streamEvent.cancelledOrderHashes, [ORDER_HASH]);
  assert.match(normalized.streamEvent.message, /does not cancel the on-chain nonce/i);

  assert.throws(
    () => normalizeOrderStreamMessage({
      ...orderStreamCancelMessage,
      snapshot: {
        ...orderStreamCancelMessage.snapshot,
        permissions: ['READ_ONLY', 'WITHDRAW'],
      },
    }),
    /unsafe private order stream permissions/i,
  );

  assert.throws(
    () => normalizeOrderStreamMessage({
      ...orderStreamCancelMessage,
      snapshot: {
        ...orderStreamCancelMessage.snapshot,
        data: {
          ...orderStreamCancelMessage.snapshot.data,
          orders: [{ ...cancelledOrder, createdAt: 'matcher-local-time' }],
        },
      },
    }),
    /must not expose matcher-local createdAt/i,
  );

  assert.throws(
    () => normalizeOrderStreamMessage({
      ...orderStreamCancelMessage,
      streamEvent: {
        ...orderStreamCancelMessage.streamEvent,
        nonceManager: 'on-chain-nonce-cancelled',
      },
    }),
    /matcher-local-cancel-only-on-chain-nonce-unchanged/i,
  );
});

test('bindLiveOrderStream renders matcher-local cancellation state without withdrawal authority', async () => {
  FakeWebSocket.instances = [];
  const mount = { innerHTML: '' };
  const renderedFixtures = [];
  const errors = [];

  const binding = bindLiveOrderStream({
    mount,
    baseUrl: 'http://127.0.0.1:8787',
    baseFixture: mockVerticalSliceFixture,
    WebSocketImpl: FakeWebSocket,
    render: (fixture) => {
      renderedFixtures.push(fixture);
      return `${fixture.orderStream.streamEvent.reason} ${fixture.orderStream.cancelledOrderHashes[0]} ${fixture.orderStream.nonceManager} ${fixture.orderStream.safetyNotice}`;
    },
    onError: (error) => errors.push(error),
  });

  assert.equal(FakeWebSocket.instances.length, 1);
  assert.equal(FakeWebSocket.instances[0].url, 'ws://127.0.0.1:8787/v1/ws?channel=orders');

  FakeWebSocket.instances[0].emit('message', { data: JSON.stringify(orderStreamCancelMessage) });

  await waitFor(() => renderedFixtures.length === 1);

  assert.deepEqual(errors, []);
  assert.equal(mount.innerHTML, `matcher_local_order_cancelled ${ORDER_HASH} ${NONCE_MANAGER_NOTE} ${STREAM_SAFETY_NOTICE}`);

  const fixture = renderedFixtures[0];
  assert.equal(fixture.sources.orders, 'mock-order-projection');
  assert.deepEqual(fixture.orders, [cancelledOrder]);
  assert.equal(fixture.orderStream.channel, 'orders');
  assert.equal(fixture.orderStream.custody, CUSTODY_NOTE);
  assert.deepEqual(fixture.orderStream.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.deepEqual(fixture.orderStream.cancellationPermissions, ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(fixture.orderStream.nonceManager, NONCE_MANAGER_NOTE);
  assert.match(fixture.orderStream.message, /does not cancel the on-chain nonce/i);
  assert.deepEqual(fixture.orderStream.cancelledOrderHashes, [ORDER_HASH]);
  assert.equal(Object.hasOwn(fixture.orders[0], 'createdAt'), false);
  assert.equal(fixture.custody.note, CUSTODY_NOTE);
  assert.equal(fixture.custody.withdrawalAuthority, 'owner-wallet-only');

  binding.close();
  assert.equal(FakeWebSocket.instances[0].closed, true);
});
