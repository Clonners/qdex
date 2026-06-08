import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  bindLiveVaultHistoryStreams,
  buildVaultHistoryStreamUrl,
  normalizeVaultHistoryStreamMessage,
} from '../src/live-vault-history.js';

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
const HISTORY_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];

const historyEnvelope = ({ collection, projectionType, eventName }) => Object.freeze({
  [collection]: Object.freeze([]),
  source: 'tradingvault-event-projection',
  projectionType,
  eventName,
  custody: 'non-custodial-contract-vault',
  permissions: Object.freeze(HISTORY_PERMISSIONS),
  settlementMode: 'mock',
  settlementTx: null,
  blockNumber: null,
  blockHash: null,
  eventIndex: null,
  explorerUrl: null,
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  safetyNotice: `Read-only TradingVault ${eventName} history projection: mock rows have no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.`,
});

const depositStreamMessage = Object.freeze({
  type: 'snapshot',
  transport: 'websocket',
  snapshot: Object.freeze({
    channel: 'deposits',
    visibility: 'private',
    payload: 'deposit_projection',
    source: 'tradingvault-event-projection',
    custody: 'non-custodial-no-withdrawal-authority',
    permissions: Object.freeze(HISTORY_PERMISSIONS),
    safetyNotice: STREAM_SAFETY_NOTICE,
    data: historyEnvelope({
      collection: 'deposits',
      projectionType: 'TradingVaultDepositProjection',
      eventName: 'Deposit',
    }),
  }),
  streamEvent: Object.freeze({
    reason: 'initial_snapshot',
    channels: Object.freeze(['deposits']),
    source: 'tradingvault-event-projection',
  }),
});

const withdrawalStreamMessage = Object.freeze({
  type: 'snapshot',
  transport: 'websocket',
  snapshot: Object.freeze({
    channel: 'withdrawals',
    visibility: 'private',
    payload: 'withdrawal_projection',
    source: 'tradingvault-event-projection',
    custody: 'non-custodial-no-withdrawal-authority',
    permissions: Object.freeze(HISTORY_PERMISSIONS),
    safetyNotice: STREAM_SAFETY_NOTICE,
    data: historyEnvelope({
      collection: 'withdrawals',
      projectionType: 'TradingVaultWithdrawalProjection',
      eventName: 'Withdraw',
    }),
  }),
  streamEvent: Object.freeze({
    reason: 'initial_snapshot',
    channels: Object.freeze(['withdrawals']),
    source: 'tradingvault-event-projection',
  }),
});

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition was not satisfied');
};

test('buildVaultHistoryStreamUrl targets private TradingVault deposit and withdrawal WebSocket channels', () => {
  assert.equal(
    buildVaultHistoryStreamUrl({ baseUrl: 'http://127.0.0.1:8787', channel: 'deposits' }),
    'ws://127.0.0.1:8787/v1/ws?channel=deposits',
  );

  assert.equal(
    buildVaultHistoryStreamUrl({ baseUrl: 'https://dex.local:9443/app', channel: 'withdrawals' }),
    'wss://dex.local:9443/v1/ws?channel=withdrawals',
  );
});

test('normalizeVaultHistoryStreamMessage accepts only read-only TradingVault event-projection streams', () => {
  const deposit = normalizeVaultHistoryStreamMessage(depositStreamMessage);
  assert.equal(deposit.channel, 'deposits');
  assert.equal(deposit.payload, 'deposit_projection');
  assert.equal(deposit.source, 'tradingvault-event-projection');
  assert.equal(deposit.vaultHistoryEnvelope.projectionType, 'TradingVaultDepositProjection');
  assert.equal(deposit.vaultHistoryEnvelope.eventName, 'Deposit');
  assert.deepEqual(deposit.vaultHistoryEnvelope.deposits, []);
  assert.equal(deposit.vaultHistoryEnvelope.settlementMode, 'mock');
  assert.equal(deposit.vaultHistoryEnvelope.settlementTx, null);
  assert.equal(deposit.vaultHistoryEnvelope.blockNumber, null);
  assert.equal(deposit.vaultHistoryEnvelope.blockHash, null);
  assert.equal(deposit.vaultHistoryEnvelope.eventIndex, null);
  assert.equal(deposit.vaultHistoryEnvelope.explorerUrl, null);
  assert.equal(deposit.vaultHistoryEnvelope.realQuaiTransactions, false);
  assert.equal(deposit.vaultHistoryEnvelope.walletRequired, false);
  assert.equal(deposit.vaultHistoryEnvelope.fundsMoved, false);
  assert.equal(deposit.vaultHistoryEnvelope.tradingVaultMutation, false);
  assert.match(deposit.vaultHistoryEnvelope.safetyNotice, /no wallet loaded, no funds moved/i);
  assert.match(deposit.vaultHistoryEnvelope.safetyNotice, /no delegate withdrawal\/admin authority/i);

  const withdrawal = normalizeVaultHistoryStreamMessage(withdrawalStreamMessage);
  assert.equal(withdrawal.channel, 'withdrawals');
  assert.equal(withdrawal.payload, 'withdrawal_projection');
  assert.equal(withdrawal.vaultHistoryEnvelope.projectionType, 'TradingVaultWithdrawalProjection');
  assert.equal(withdrawal.vaultHistoryEnvelope.eventName, 'Withdraw');
  assert.deepEqual(withdrawal.vaultHistoryEnvelope.withdrawals, []);

  assert.throws(
    () => normalizeVaultHistoryStreamMessage({
      ...depositStreamMessage,
      snapshot: {
        ...depositStreamMessage.snapshot,
        permissions: ['READ_ONLY', 'WITHDRAW'],
      },
    }),
    /unsafe private vault history stream permissions/i,
  );

  assert.throws(
    () => normalizeVaultHistoryStreamMessage({
      ...depositStreamMessage,
      snapshot: {
        ...depositStreamMessage.snapshot,
        data: {
          ...depositStreamMessage.snapshot.data,
          realQuaiTransactions: true,
        },
      },
    }),
    /realQuaiTransactions must be false/i,
  );
});

test('bindLiveVaultHistoryStreams renders private deposit and withdrawal streams into the terminal vault history panel', async () => {
  FakeWebSocket.instances = [];
  const mount = { dataset: {}, innerHTML: '' };
  const renderedFixtures = [];
  const updates = [];
  const errors = [];

  const binding = bindLiveVaultHistoryStreams({
    mount,
    baseUrl: 'http://127.0.0.1:8787',
    baseFixture: mockVerticalSliceFixture,
    WebSocketImpl: FakeWebSocket,
    render: (fixture) => {
      renderedFixtures.push(fixture);
      return `${fixture.vaultHistoryStream.channels.join(',')} ${fixture.vaultHistory.deposits.source} ${fixture.vaultHistory.withdrawals.projectionType} ${fixture.vaultHistory.withdrawals.safetyNotice}`;
    },
    onError: (error) => errors.push(error),
    onUpdate: (fixture) => updates.push(fixture.vaultHistoryStream.channels),
  });

  assert.equal(FakeWebSocket.instances.length, 2);
  assert.deepEqual(
    FakeWebSocket.instances.map((ws) => ws.url),
    [
      'ws://127.0.0.1:8787/v1/ws?channel=deposits',
      'ws://127.0.0.1:8787/v1/ws?channel=withdrawals',
    ],
  );

  FakeWebSocket.instances[0].emit('message', { data: JSON.stringify(depositStreamMessage) });
  FakeWebSocket.instances[1].emit('message', { data: JSON.stringify(withdrawalStreamMessage) });

  await waitFor(() => renderedFixtures.length === 2);

  assert.deepEqual(errors, []);
  assert.deepEqual(updates, [['deposits'], ['deposits', 'withdrawals']]);
  assert.equal(mount.dataset.qdxVaultHistoryStreams, 'deposits,withdrawals');
  assert.equal(mount.dataset.qdxVaultHistoryStreamSource, 'tradingvault-event-projection');
  assert.equal(mount.dataset.qdxVaultHistoryStreamRows, '0');
  assert.match(mount.innerHTML, /deposits,withdrawals tradingvault-event-projection TradingVaultWithdrawalProjection/);
  assert.match(mount.innerHTML, /no wallet loaded, no funds moved/i);

  const fixture = renderedFixtures.at(-1);
  assert.equal(fixture.sources.vaultHistory, 'tradingvault-event-projection');
  assert.equal(fixture.vaultHistory.deposits.projectionType, 'TradingVaultDepositProjection');
  assert.equal(fixture.vaultHistory.withdrawals.projectionType, 'TradingVaultWithdrawalProjection');
  assert.deepEqual(fixture.vaultHistoryStream.permissions, HISTORY_PERMISSIONS);
  assert.equal(fixture.vaultHistoryStream.settlementMode, 'mock');
  assert.equal(fixture.vaultHistoryStream.realQuaiTransactions, false);
  assert.equal(fixture.vaultHistoryStream.walletRequired, false);
  assert.equal(fixture.vaultHistoryStream.fundsMoved, false);
  assert.equal(fixture.vaultHistoryStream.tradingVaultMutation, false);

  binding.close();
  assert.equal(FakeWebSocket.instances[0].closed, true);
  assert.equal(FakeWebSocket.instances[1].closed, true);
});

test('terminal UI package/app/docs mention the private vault history stream binding', async () => {
  const [packageJson, appSource, readme] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
  ]);

  for (const requiredText of [
    'src/live-vault-history.js',
    'bindLiveVaultHistoryStreams',
    '/v1/ws?channel=deposits',
    '/v1/ws?channel=withdrawals',
    'tradingvault-event-projection',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'no wallet loaded, no funds moved',
  ]) {
    assert.ok(`${packageJson}\n${appSource}\n${readme}`.includes(requiredText), `terminal UI stream docs/checks should include ${requiredText}`);
  }
});
