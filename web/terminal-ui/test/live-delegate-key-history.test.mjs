import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  bindLiveDelegateKeyHistoryStreams,
  buildDelegateKeyHistoryStreamUrl,
  normalizeDelegateKeyHistoryStreamMessage,
} from '../src/live-delegate-key-history.js';

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
  source: 'delegatekeyregistry-event-projection',
  projectionType,
  eventName,
  custody: 'non-custodial-no-withdrawal-authority',
  permissions: Object.freeze(HISTORY_PERMISSIONS),
  settlementMode: 'mock',
  settlementTx: null,
  blockNumber: null,
  blockHash: null,
  eventIndex: null,
  explorerUrl: null,
  delegateCanWithdraw: false,
  delegateCanAdmin: false,
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  delegateKeyRegistryMutation: false,
  safetyNotice: `Read-only DelegateKeyRegistry ${eventName} history projection: mock rows have no real Quai transaction, no wallet loaded, no live DelegateKeyRegistry mutation, no funds moved, and no delegate withdrawal/admin authority.`,
});

const registrationStreamMessage = Object.freeze({
  type: 'snapshot',
  transport: 'websocket',
  snapshot: Object.freeze({
    channel: 'delegate-key-registrations',
    visibility: 'private',
    payload: 'delegate_key_registration_projection',
    source: 'delegatekeyregistry-event-projection',
    custody: 'non-custodial-no-withdrawal-authority',
    permissions: Object.freeze(HISTORY_PERMISSIONS),
    safetyNotice: STREAM_SAFETY_NOTICE,
    data: historyEnvelope({
      collection: 'registrations',
      projectionType: 'DelegateKeyRegisteredProjection',
      eventName: 'DelegateKeyRegistered',
    }),
  }),
  streamEvent: Object.freeze({
    reason: 'initial_snapshot',
    channels: Object.freeze(['delegate-key-registrations']),
    source: 'delegatekeyregistry-event-projection',
  }),
});

const revocationStreamMessage = Object.freeze({
  type: 'snapshot',
  transport: 'websocket',
  snapshot: Object.freeze({
    channel: 'delegate-key-revocations',
    visibility: 'private',
    payload: 'delegate_key_revocation_projection',
    source: 'delegatekeyregistry-event-projection',
    custody: 'non-custodial-no-withdrawal-authority',
    permissions: Object.freeze(HISTORY_PERMISSIONS),
    safetyNotice: STREAM_SAFETY_NOTICE,
    data: historyEnvelope({
      collection: 'revocations',
      projectionType: 'DelegateKeyRevokedProjection',
      eventName: 'DelegateKeyRevoked',
    }),
  }),
  streamEvent: Object.freeze({
    reason: 'initial_snapshot',
    channels: Object.freeze(['delegate-key-revocations']),
    source: 'delegatekeyregistry-event-projection',
  }),
});

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition was not satisfied');
};

test('buildDelegateKeyHistoryStreamUrl targets private DelegateKeyRegistry registration and revocation WebSocket channels', () => {
  assert.equal(
    buildDelegateKeyHistoryStreamUrl({ baseUrl: 'http://127.0.0.1:8787', channel: 'delegate-key-registrations' }),
    'ws://127.0.0.1:8787/v1/ws?channel=delegate-key-registrations',
  );

  assert.equal(
    buildDelegateKeyHistoryStreamUrl({ baseUrl: 'https://dex.local:9443/app', channel: 'delegate-key-revocations' }),
    'wss://dex.local:9443/v1/ws?channel=delegate-key-revocations',
  );
});

test('normalizeDelegateKeyHistoryStreamMessage accepts only read-only DelegateKeyRegistry event-projection streams', () => {
  const registration = normalizeDelegateKeyHistoryStreamMessage(registrationStreamMessage);
  assert.equal(registration.channel, 'delegate-key-registrations');
  assert.equal(registration.payload, 'delegate_key_registration_projection');
  assert.equal(registration.source, 'delegatekeyregistry-event-projection');
  assert.equal(registration.delegateKeyHistoryEnvelope.projectionType, 'DelegateKeyRegisteredProjection');
  assert.equal(registration.delegateKeyHistoryEnvelope.eventName, 'DelegateKeyRegistered');
  assert.deepEqual(registration.delegateKeyHistoryEnvelope.registrations, []);
  assert.equal(registration.delegateKeyHistoryEnvelope.settlementMode, 'mock');
  assert.equal(registration.delegateKeyHistoryEnvelope.settlementTx, null);
  assert.equal(registration.delegateKeyHistoryEnvelope.blockNumber, null);
  assert.equal(registration.delegateKeyHistoryEnvelope.blockHash, null);
  assert.equal(registration.delegateKeyHistoryEnvelope.eventIndex, null);
  assert.equal(registration.delegateKeyHistoryEnvelope.explorerUrl, null);
  assert.equal(registration.delegateKeyHistoryEnvelope.delegateCanWithdraw, false);
  assert.equal(registration.delegateKeyHistoryEnvelope.delegateCanAdmin, false);
  assert.equal(registration.delegateKeyHistoryEnvelope.realQuaiTransactions, false);
  assert.equal(registration.delegateKeyHistoryEnvelope.walletRequired, false);
  assert.equal(registration.delegateKeyHistoryEnvelope.fundsMoved, false);
  assert.equal(registration.delegateKeyHistoryEnvelope.tradingVaultMutation, false);
  assert.equal(registration.delegateKeyHistoryEnvelope.delegateKeyRegistryMutation, false);
  assert.match(registration.delegateKeyHistoryEnvelope.safetyNotice, /no wallet loaded/i);
  assert.match(registration.delegateKeyHistoryEnvelope.safetyNotice, /no live DelegateKeyRegistry mutation, no funds moved/i);
  assert.match(registration.delegateKeyHistoryEnvelope.safetyNotice, /no delegate withdrawal\/admin authority/i);

  const revocation = normalizeDelegateKeyHistoryStreamMessage(revocationStreamMessage);
  assert.equal(revocation.channel, 'delegate-key-revocations');
  assert.equal(revocation.payload, 'delegate_key_revocation_projection');
  assert.equal(revocation.delegateKeyHistoryEnvelope.projectionType, 'DelegateKeyRevokedProjection');
  assert.equal(revocation.delegateKeyHistoryEnvelope.eventName, 'DelegateKeyRevoked');
  assert.deepEqual(revocation.delegateKeyHistoryEnvelope.revocations, []);

  assert.throws(
    () => normalizeDelegateKeyHistoryStreamMessage({
      ...registrationStreamMessage,
      snapshot: {
        ...registrationStreamMessage.snapshot,
        permissions: ['READ_ONLY', 'WITHDRAW'],
      },
    }),
    /unsafe private DelegateKeyRegistry history stream permissions/i,
  );

  assert.throws(
    () => normalizeDelegateKeyHistoryStreamMessage({
      ...registrationStreamMessage,
      snapshot: {
        ...registrationStreamMessage.snapshot,
        data: {
          ...registrationStreamMessage.snapshot.data,
          delegateCanWithdraw: true,
        },
      },
    }),
    /delegateCanWithdraw must be false/i,
  );
});

test('bindLiveDelegateKeyHistoryStreams renders private registration and revocation streams into the terminal delegate-key history panel', async () => {
  FakeWebSocket.instances = [];
  const mount = { dataset: {}, innerHTML: '' };
  const renderedFixtures = [];
  const updates = [];
  const errors = [];

  const binding = bindLiveDelegateKeyHistoryStreams({
    mount,
    baseUrl: 'http://127.0.0.1:8787',
    baseFixture: mockVerticalSliceFixture,
    WebSocketImpl: FakeWebSocket,
    render: (fixture) => {
      renderedFixtures.push(fixture);
      return `${fixture.delegateKeyHistoryStream.channels.join(',')} ${fixture.delegateKeyHistory.registrations.source} ${fixture.delegateKeyHistory.revocations.projectionType} ${fixture.delegateKeyHistory.revocations.safetyNotice}`;
    },
    onError: (error) => errors.push(error),
    onUpdate: (fixture) => updates.push(fixture.delegateKeyHistoryStream.channels),
  });

  assert.equal(FakeWebSocket.instances.length, 2);
  assert.deepEqual(
    FakeWebSocket.instances.map((ws) => ws.url),
    [
      'ws://127.0.0.1:8787/v1/ws?channel=delegate-key-registrations',
      'ws://127.0.0.1:8787/v1/ws?channel=delegate-key-revocations',
    ],
  );

  FakeWebSocket.instances[0].emit('message', { data: JSON.stringify(registrationStreamMessage) });
  FakeWebSocket.instances[1].emit('message', { data: JSON.stringify(revocationStreamMessage) });

  await waitFor(() => renderedFixtures.length === 2);

  assert.deepEqual(errors, []);
  assert.deepEqual(updates, [['delegate-key-registrations'], ['delegate-key-registrations', 'delegate-key-revocations']]);
  assert.equal(mount.dataset.qdxDelegateKeyHistoryStreams, 'delegate-key-registrations,delegate-key-revocations');
  assert.equal(mount.dataset.qdxDelegateKeyHistoryStreamSource, 'delegatekeyregistry-event-projection');
  assert.equal(mount.dataset.qdxDelegateKeyHistoryStreamRows, '0');
  assert.match(mount.innerHTML, /delegate-key-registrations,delegate-key-revocations delegatekeyregistry-event-projection DelegateKeyRevokedProjection/);
  assert.match(mount.innerHTML, /no live DelegateKeyRegistry mutation, no funds moved/i);

  const fixture = renderedFixtures.at(-1);
  assert.equal(fixture.sources.delegateKeyHistory, 'delegatekeyregistry-event-projection');
  assert.equal(fixture.delegateKeyHistory.registrations.projectionType, 'DelegateKeyRegisteredProjection');
  assert.equal(fixture.delegateKeyHistory.revocations.projectionType, 'DelegateKeyRevokedProjection');
  assert.deepEqual(fixture.delegateKeyHistoryStream.permissions, HISTORY_PERMISSIONS);
  assert.equal(fixture.delegateKeyHistoryStream.settlementMode, 'mock');
  assert.equal(fixture.delegateKeyHistoryStream.delegateCanWithdraw, false);
  assert.equal(fixture.delegateKeyHistoryStream.delegateCanAdmin, false);
  assert.equal(fixture.delegateKeyHistoryStream.realQuaiTransactions, false);
  assert.equal(fixture.delegateKeyHistoryStream.walletRequired, false);
  assert.equal(fixture.delegateKeyHistoryStream.fundsMoved, false);
  assert.equal(fixture.delegateKeyHistoryStream.tradingVaultMutation, false);
  assert.equal(fixture.delegateKeyHistoryStream.delegateKeyRegistryMutation, false);

  binding.close();
  assert.equal(FakeWebSocket.instances[0].closed, true);
  assert.equal(FakeWebSocket.instances[1].closed, true);
});

test('terminal UI package/app/docs mention the private DelegateKeyRegistry history stream binding', async () => {
  const [packageJson, appSource, readme, status, plan] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../../../CAMPAIGN_STATUS.md', import.meta.url), 'utf8'),
    readFile(new URL('../../../docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md', import.meta.url), 'utf8'),
  ]);

  for (const requiredText of [
    'src/live-delegate-key-history.js',
    'bindLiveDelegateKeyHistoryStreams',
    '/v1/ws?channel=delegate-key-registrations',
    '/v1/ws?channel=delegate-key-revocations',
    'delegatekeyregistry-event-projection',
    'DelegateKeyRegisteredProjection',
    'DelegateKeyRevokedProjection',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'delegateCanWithdraw: false',
    'delegateCanAdmin: false',
    'delegateKeyRegistryMutation: false',
    'no live DelegateKeyRegistry mutation, no funds moved',
  ]) {
    assert.ok(`${packageJson}\n${appSource}\n${readme}`.includes(requiredText), `terminal UI delegate-key stream docs/checks should include ${requiredText}`);
  }

  for (const requiredText of [
    'Completed previous run: private DelegateKeyRegistry registration/revocation WebSocket snapshot alignment',
    'Completed previous run: terminal UI private DelegateKeyRegistry history stream binding',
    'Completed previous run: local API + terminal UI DelegateKeyRegistry history stream integration smoke',
    'Completed previous run: read-only TypeScript SDK and `qdex` CLI DelegateKeyRegistry history stream consumers',
    'Completed previous run: Python SDK DelegateKeyRegistry history stream consumers',
    'Completed this run: read-only FeeManager fee schedule API envelope',
  ]) {
    assert.ok(status.includes(requiredText), `CAMPAIGN_STATUS.md should include ${requiredText}`);
  }

  assert.ok(
    plan.includes('Completed: terminal UI binding for private DelegateKeyRegistry history streams'),
    'post-delegate readiness plan should mark the terminal UI stream binding complete',
  );
  assert.ok(
    plan.includes('Completed: local API + terminal UI DelegateKeyRegistry history stream integration smoke'),
    'post-delegate readiness plan should mark the REST-confirmed stream smoke complete',
  );
  assert.ok(
    plan.includes('Completed: read-only TypeScript SDK and `qdex` CLI DelegateKeyRegistry history stream consumers'),
    'post-delegate readiness plan should mark TypeScript/qdex stream consumers complete',
  );
  assert.ok(
    plan.includes('Completed: Python SDK DelegateKeyRegistry history stream consumers'),
    'post-delegate readiness plan should mark Python stream consumers complete',
  );
  assert.ok(
    plan.includes('Next bounded local/source-only slice: another bounded MVP surface; live `DelegateKeyRegistry` mutation remains approval-gated'),
    'post-delegate readiness plan should move past Python SDK stream consumers after parity is complete',
  );
});
