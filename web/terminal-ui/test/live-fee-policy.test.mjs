import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  bindLiveFeePolicyStream,
  buildFeePolicyStreamUrl,
  normalizeFeePolicyStreamMessage,
} from '../src/live-fee-policy.js';

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

const FEE_SOURCE = 'feemanager-policy-projection';
const FEE_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];

const feePolicyEnvelope = Object.freeze({
  feeSchedules: Object.freeze([
    Object.freeze({
      marketId: 'QI-QUAI',
      projectionType: 'FeeScheduleProjection',
      eventName: 'FeesUpdated',
      makerFeeBps: 0,
      takerFeeBps: 0,
      maxFeeBps: 1000,
      feeRecipient: null,
      settlementMode: 'mock',
      settlementTx: null,
      blockNumber: null,
      blockHash: null,
      eventIndex: null,
      explorerUrl: null,
    }),
  ]),
  source: FEE_SOURCE,
  status: 'local-only-not-deployed',
  custody: 'non-custodial-fee-policy',
  permissions: Object.freeze(FEE_PERMISSIONS),
  hardMaxFeeBps: 1000,
  feeRecipient: null,
  feeManagerMutation: false,
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  safety: Object.freeze({
    noWalletLoading: true,
    noRpcUrlAccess: true,
    noSigning: true,
    noBroadcast: true,
    noDeploys: true,
    noTransactionSubmission: true,
    noFundsMovement: true,
    noFeeAuthorityRuntimeKeys: true,
    notice:
      'Read-only FeeManager schedule metadata: local/mock rows have no real Quai transaction, no wallet loaded, no fee-authority key, no TradingVault mutation, and no funds moved.',
  }),
});

const feePolicyStreamMessage = Object.freeze({
  type: 'snapshot',
  transport: 'websocket',
  snapshot: Object.freeze({
    channel: 'fees',
    visibility: 'public',
    payload: 'fee_schedule_projection',
    source: FEE_SOURCE,
    custody: 'public-read-only-no-custody',
    data: feePolicyEnvelope,
  }),
  streamEvent: Object.freeze({
    reason: 'initial_snapshot',
    channels: Object.freeze(['fees']),
    source: FEE_SOURCE,
  }),
});

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition was not satisfied');
};

test('buildFeePolicyStreamUrl targets the public FeeManager fee schedule WebSocket channel', () => {
  assert.equal(
    buildFeePolicyStreamUrl({ baseUrl: 'http://127.0.0.1:8787' }),
    'ws://127.0.0.1:8787/v1/ws?channel=fees',
  );

  assert.equal(
    buildFeePolicyStreamUrl({ baseUrl: 'https://dex.local:9443/app' }),
    'wss://dex.local:9443/v1/ws?channel=fees',
  );
});

test('normalizeFeePolicyStreamMessage accepts only public read-only FeeManager fee schedule snapshots', () => {
  const normalized = normalizeFeePolicyStreamMessage(feePolicyStreamMessage);

  assert.equal(normalized.channel, 'fees');
  assert.equal(normalized.payload, 'fee_schedule_projection');
  assert.equal(normalized.source, FEE_SOURCE);
  assert.equal(normalized.custody, 'public-read-only-no-custody');
  assert.equal(normalized.feePolicyEnvelope.source, FEE_SOURCE);
  assert.deepEqual(normalized.feePolicyEnvelope.permissions, FEE_PERMISSIONS);
  assert.equal(normalized.feePolicyEnvelope.feeSchedules[0].projectionType, 'FeeScheduleProjection');
  assert.equal(normalized.feePolicyEnvelope.feeSchedules[0].eventName, 'FeesUpdated');
  assert.equal(normalized.feePolicyEnvelope.feeSchedules[0].settlementMode, 'mock');
  assert.equal(normalized.feePolicyEnvelope.feeSchedules[0].settlementTx, null);
  assert.equal(normalized.feePolicyEnvelope.feeSchedules[0].blockNumber, null);
  assert.equal(normalized.feePolicyEnvelope.feeSchedules[0].blockHash, null);
  assert.equal(normalized.feePolicyEnvelope.feeSchedules[0].eventIndex, null);
  assert.equal(normalized.feePolicyEnvelope.feeSchedules[0].explorerUrl, null);
  assert.equal(normalized.feePolicyEnvelope.feeManagerMutation, false);
  assert.equal(normalized.feePolicyEnvelope.tradingVaultMutation, false);
  assert.equal(normalized.feePolicyEnvelope.realQuaiTransactions, false);
  assert.equal(normalized.feePolicyEnvelope.walletRequired, false);
  assert.equal(normalized.feePolicyEnvelope.fundsMoved, false);
  assert.equal(normalized.feePolicyEnvelope.safety.noFeeAuthorityRuntimeKeys, true);
  assert.match(normalized.feePolicyEnvelope.safety.notice, /no wallet loaded/i);
  assert.match(normalized.feePolicyEnvelope.safety.notice, /no fee-authority key/i);
  assert.match(normalized.feePolicyEnvelope.safety.notice, /no TradingVault mutation/i);

  assert.throws(
    () => normalizeFeePolicyStreamMessage({
      ...feePolicyStreamMessage,
      snapshot: {
        ...feePolicyStreamMessage.snapshot,
        visibility: 'private',
      },
    }),
    /fees stream visibility must be public/i,
  );

  assert.throws(
    () => normalizeFeePolicyStreamMessage({
      ...feePolicyStreamMessage,
      snapshot: {
        ...feePolicyStreamMessage.snapshot,
        data: {
          ...feePolicyStreamMessage.snapshot.data,
          feeManagerMutation: true,
        },
      },
    }),
    /fee policy feeManagerMutation must be false/i,
  );
});

test('bindLiveFeePolicyStream renders public FeeManager snapshots into the terminal fee policy panel', async () => {
  FakeWebSocket.instances = [];
  const mount = { dataset: {}, innerHTML: '' };
  const renderedFixtures = [];
  const updates = [];
  const errors = [];

  const binding = bindLiveFeePolicyStream({
    mount,
    baseUrl: 'http://127.0.0.1:8787',
    baseFixture: mockVerticalSliceFixture,
    WebSocketImpl: FakeWebSocket,
    render: (fixture) => {
      renderedFixtures.push(fixture);
      return `${fixture.feePolicyStream.channel} ${fixture.feePolicyStream.source} ${fixture.feePolicy.feeSchedules[0].projectionType} ${fixture.feePolicy.safety.notice} ${fixture.feePolicyStream.safetyNotice}`;
    },
    onError: (error) => errors.push(error),
    onUpdate: (fixture) => updates.push(fixture.feePolicyStream.channel),
  });

  assert.equal(FakeWebSocket.instances.length, 1);
  assert.equal(FakeWebSocket.instances[0].url, 'ws://127.0.0.1:8787/v1/ws?channel=fees');

  FakeWebSocket.instances[0].emit('message', { data: JSON.stringify(feePolicyStreamMessage) });

  await waitFor(() => renderedFixtures.length === 1);

  assert.deepEqual(errors, []);
  assert.deepEqual(updates, ['fees']);
  assert.equal(mount.dataset.qdxFeePolicyStream, 'fees');
  assert.equal(mount.dataset.qdxFeePolicyStreamSource, FEE_SOURCE);
  assert.equal(mount.dataset.qdxFeePolicyStreamRows, '1');
  assert.match(mount.innerHTML, /fees feemanager-policy-projection FeeScheduleProjection/);
  assert.match(mount.innerHTML, /no wallet loaded/i);
  assert.match(mount.innerHTML, /no fee-authority key/i);
  assert.match(mount.innerHTML, /no TradingVault mutation/i);

  const fixture = renderedFixtures.at(-1);
  assert.equal(fixture.sources.feePolicy, FEE_SOURCE);
  assert.equal(fixture.feePolicy.feeSchedules[0].projectionType, 'FeeScheduleProjection');
  assert.deepEqual(fixture.feePolicyStream.permissions, FEE_PERMISSIONS);
  assert.equal(fixture.feePolicyStream.channel, 'fees');
  assert.equal(fixture.feePolicyStream.custody, 'public-read-only-no-custody');
  assert.equal(fixture.feePolicyStream.feeManagerMutation, false);
  assert.equal(fixture.feePolicyStream.tradingVaultMutation, false);
  assert.equal(fixture.feePolicyStream.realQuaiTransactions, false);
  assert.equal(fixture.feePolicyStream.walletRequired, false);
  assert.equal(fixture.feePolicyStream.fundsMoved, false);
  assert.equal(fixture.feePolicyStream.noFeeAuthorityRuntimeKeys, true);

  binding.close();
  assert.equal(FakeWebSocket.instances[0].closed, true);
});

test('terminal UI package/app/docs/status mention the public FeeManager fee schedule stream binding', async () => {
  const [packageJson, appSource, readme, feesDoc, status] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../../../docs/fees.md', import.meta.url), 'utf8'),
    readFile(new URL('../../../CAMPAIGN_STATUS.md', import.meta.url), 'utf8'),
  ]);

  for (const requiredText of [
    'src/live-fee-policy.js',
    'bindLiveFeePolicyStream',
    '/v1/ws?channel=fees',
    'feemanager-policy-projection',
    'FeeScheduleProjection',
    'eventName: FeesUpdated',
    'hardMaxFeeBps: 1000',
    'feeRecipient: null',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'feeManagerMutation: false',
    'tradingVaultMutation: false',
    'no fee-authority runtime keys',
    'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
  ]) {
    assert.ok(`${packageJson}\n${appSource}\n${readme}\n${feesDoc}`.includes(requiredText), `terminal UI fee stream docs/checks should include ${requiredText}`);
  }

  for (const requiredText of [
    'Completed previous run: read-only FeeManager fee schedule WebSocket snapshot alignment',
    'Completed previous run: terminal UI binding for the FeeManager fee schedule stream',
    'Completed this run: local API + terminal UI FeeManager fee schedule stream integration smoke',
    'Next autonomous slice: read-only TypeScript SDK and `qdex` CLI FeeManager fee schedule stream consumers',
  ]) {
    assert.ok(status.includes(requiredText), `CAMPAIGN_STATUS.md should include ${requiredText}`);
  }

  assert.doesNotMatch(
    `${readme}\n${feesDoc}\n${status}`,
    /feeAuthorityKey|rpcUrl\s*:|signing key|broadcast transaction|FeeManager mutation submitted|funds moved by UI/i,
    'FeeManager fee stream binding docs/status must not claim wallet/RPC/signing/broadcast/mutation/funds behavior',
  );
});
