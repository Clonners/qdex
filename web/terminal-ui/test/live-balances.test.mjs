import assert from 'node:assert/strict';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  bindLiveBalanceStream,
  buildBalanceStreamUrl,
  normalizeBalanceStreamMessage,
} from '../src/live-balances.js';

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

const STREAM_SAFETY_NOTICE = 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.';
const BALANCE_SAFETY_NOTICE = 'Mock vault projection only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.';

const balanceProjection = Object.freeze({
  balances: Object.freeze([]),
  source: 'mock-vault-projection',
  custody: 'non-custodial-contract-vault',
  permissions: Object.freeze(['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']),
  withdrawalAuthority: 'owner-wallet-only',
  settlementMode: 'mock',
  realQuaiTransactions: false,
  walletRequired: false,
  safetyNotice: BALANCE_SAFETY_NOTICE,
});

const balanceStreamMessage = Object.freeze({
  type: 'snapshot',
  transport: 'websocket',
  snapshot: Object.freeze({
    channel: 'balances',
    visibility: 'private',
    payload: 'vault_balance_projection',
    source: 'mock-vault-projection',
    custody: 'non-custodial-no-withdrawal-authority',
    permissions: Object.freeze(['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']),
    safetyNotice: STREAM_SAFETY_NOTICE,
    data: balanceProjection,
  }),
  streamEvent: Object.freeze({
    reason: 'initial_snapshot',
    channels: Object.freeze(['balances']),
    source: 'mock-vault-projection',
  }),
});

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition was not satisfied');
};

test('buildBalanceStreamUrl targets the local private balances WebSocket channel', () => {
  assert.equal(
    buildBalanceStreamUrl({ baseUrl: 'http://127.0.0.1:8787' }),
    'ws://127.0.0.1:8787/v1/ws?channel=balances',
  );

  assert.equal(
    buildBalanceStreamUrl({ baseUrl: 'https://dex.local:9443/app', channel: 'balances' }),
    'wss://dex.local:9443/v1/ws?channel=balances',
  );
});

test('normalizeBalanceStreamMessage accepts only read-only mock vault projections', () => {
  const normalized = normalizeBalanceStreamMessage(balanceStreamMessage);

  assert.equal(normalized.channel, 'balances');
  assert.equal(normalized.source, 'mock-vault-projection');
  assert.equal(normalized.custody, 'non-custodial-no-withdrawal-authority');
  assert.deepEqual(normalized.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.deepEqual(normalized.balances, []);
  assert.equal(normalized.balanceProjection.source, 'mock-vault-projection');
  assert.equal(normalized.balanceProjection.custody, 'non-custodial-contract-vault');
  assert.equal(normalized.balanceProjection.withdrawalAuthority, 'owner-wallet-only');
  assert.equal(normalized.balanceProjection.settlementMode, 'mock');
  assert.equal(normalized.balanceProjection.realQuaiTransactions, false);
  assert.equal(normalized.balanceProjection.walletRequired, false);
  assert.match(normalized.balanceProjection.safetyNotice, /no wallet loaded, no funds moved/i);

  assert.throws(
    () => normalizeBalanceStreamMessage({
      ...balanceStreamMessage,
      snapshot: {
        ...balanceStreamMessage.snapshot,
        permissions: ['READ_ONLY', 'WITHDRAW'],
      },
    }),
    /unsafe private balance stream permissions/i,
  );

  assert.throws(
    () => normalizeBalanceStreamMessage({
      ...balanceStreamMessage,
      snapshot: {
        ...balanceStreamMessage.snapshot,
        data: {
          ...balanceProjection,
          realQuaiTransactions: true,
        },
      },
    }),
    /realQuaiTransactions must be false/i,
  );

  assert.throws(
    () => normalizeBalanceStreamMessage({
      ...balanceStreamMessage,
      snapshot: {
        ...balanceStreamMessage.snapshot,
        data: {
          ...balanceProjection,
          walletRequired: true,
        },
      },
    }),
    /walletRequired must be false/i,
  );
});

test('bindLiveBalanceStream renders read-only mock vault balances without wallet or withdrawal authority', async () => {
  FakeWebSocket.instances = [];
  const mount = { innerHTML: '' };
  const renderedFixtures = [];
  const errors = [];

  const binding = bindLiveBalanceStream({
    mount,
    baseUrl: 'http://127.0.0.1:8787',
    baseFixture: mockVerticalSliceFixture,
    WebSocketImpl: FakeWebSocket,
    render: (fixture) => {
      renderedFixtures.push(fixture);
      return `${fixture.balanceStream.channel} ${fixture.balanceProjection.source} ${fixture.balanceProjection.settlementMode} ${fixture.balanceProjection.safetyNotice}`;
    },
    onError: (error) => errors.push(error),
  });

  assert.equal(FakeWebSocket.instances.length, 1);
  assert.equal(FakeWebSocket.instances[0].url, 'ws://127.0.0.1:8787/v1/ws?channel=balances');

  FakeWebSocket.instances[0].emit('message', { data: JSON.stringify(balanceStreamMessage) });

  await waitFor(() => renderedFixtures.length === 1);

  assert.deepEqual(errors, []);
  assert.equal(mount.innerHTML, `balances mock-vault-projection mock ${BALANCE_SAFETY_NOTICE}`);

  const fixture = renderedFixtures[0];
  assert.equal(fixture.sources.balances, 'mock-vault-projection');
  assert.deepEqual(fixture.balances, []);
  assert.equal(fixture.balanceProjection.source, 'mock-vault-projection');
  assert.deepEqual(fixture.balanceProjection.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(fixture.balanceProjection.withdrawalAuthority, 'owner-wallet-only');
  assert.equal(fixture.balanceProjection.realQuaiTransactions, false);
  assert.equal(fixture.balanceProjection.walletRequired, false);
  assert.equal(fixture.balanceStream.channel, 'balances');
  assert.deepEqual(fixture.balanceStream.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(fixture.custody.note, 'non-custodial-no-withdrawal-authority');
  assert.equal(fixture.custody.withdrawalAuthority, 'owner-wallet-only');

  binding.close();
  assert.equal(FakeWebSocket.instances[0].closed, true);
});
