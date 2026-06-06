import assert from 'node:assert/strict';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  bindLiveFillStream,
  buildFillStreamUrl,
  normalizeFillStreamMessage,
} from '../src/live-fills.js';

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

const fillStreamMessage = Object.freeze({
  type: 'snapshot',
  transport: 'websocket',
  snapshot: Object.freeze({
    channel: 'fills',
    visibility: 'private',
    payload: 'fill_projection',
    source: 'in-memory-indexer-projection',
    custody: 'non-custodial-no-withdrawal-authority',
    permissions: Object.freeze(['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']),
    safetyNotice: 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.',
    data: Object.freeze({
      source: 'in-memory-indexer-projection',
      fills: Object.freeze([
        Object.freeze({
          projectionType: 'IndexedFillProjection',
          fillId: 'fill-live-000001',
          tradeId: 'trade-live-000001',
          marketId: 'QI-QUAI',
          makerOrderHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          takerOrderHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          maker: '0x1111111111111111111111111111111111111111',
          taker: '0x3333333333333333333333333333333333333333',
          price: '7',
          amount: '25',
          makerFee: '0',
          takerFee: '0',
          settlementMode: 'mock',
          settlementStatus: 'confirmed',
          sourceEventId: 'event-live-000001',
        }),
      ]),
    }),
  }),
  streamEvent: Object.freeze({
    reason: 'mock_settlement_confirmed',
    marketId: 'QI-QUAI',
    channels: Object.freeze(['market.QI-QUAI.depth', 'orders', 'market.QI-QUAI.trades', 'fills', 'settlements', 'global.tickers']),
  }),
});

const proofEnvelope = Object.freeze({
  tradeId: 'trade-live-000001',
  source: 'proof-service-indexer-projection',
  custody: 'non-custodial-no-withdrawal-authority',
  proof: Object.freeze({
    tradeId: 'trade-live-000001',
    fillId: 'fill-live-000001',
    orderHashes: Object.freeze([
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ]),
    settlementMode: 'mock',
    mockSettlementReference: 'mock-settlement-fill-live-000001',
    settlementTx: null,
    blockNumber: null,
    blockHash: null,
    eventIndex: 0,
    maker: '0x1111111111111111111111111111111111111111',
    taker: '0x3333333333333333333333333333333333333333',
    market: 'QI-QUAI',
    price: '7',
    amount: '25',
    fees: Object.freeze({ maker: '0', taker: '0' }),
    explorerUrl: null,
    safetyNotice: 'Mock proof only: no real Quai transaction, no explorer URL, no funds moved.',
    rawEvent: Object.freeze({
      eventId: 'event-live-000001',
      type: 'SETTLEMENT_CONFIRMED',
      source: 'mock-settlement',
      fillId: 'fill-live-000001',
      settlementMode: 'mock',
      mockSettlementReference: 'mock-settlement-fill-live-000001',
      settlementTx: null,
      blockNumber: null,
      blockHash: null,
      eventIndex: 0,
    }),
    createdFromEventId: 'event-live-000001',
  }),
});

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition was not satisfied');
};

test('buildFillStreamUrl targets the local fills WebSocket channel', () => {
  assert.equal(
    buildFillStreamUrl({ baseUrl: 'http://127.0.0.1:8787', channel: 'fills' }),
    'ws://127.0.0.1:8787/v1/ws?channel=fills',
  );

  assert.equal(
    buildFillStreamUrl({ baseUrl: 'https://dex.local:9443/app', channel: 'market.QI-QUAI.depth' }),
    'wss://dex.local:9443/v1/ws?channel=market.QI-QUAI.depth',
  );
});

test('normalizeFillStreamMessage accepts only adapter-shaped custody-safe fill snapshots', () => {
  const normalized = normalizeFillStreamMessage(fillStreamMessage);

  assert.equal(normalized.channel, 'fills');
  assert.equal(normalized.source, 'in-memory-indexer-projection');
  assert.deepEqual(normalized.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(normalized.latestFill.projectionType, 'IndexedFillProjection');
  assert.equal(normalized.latestFill.fillId, 'fill-live-000001');
  assert.equal(normalized.latestFill.sourceEventId, 'event-live-000001');
  assert.equal(Object.hasOwn(normalized.latestFill, 'createdAt'), false);
  assert.match(normalized.safetyNotice, /no real Quai transaction/);

  assert.throws(
    () => normalizeFillStreamMessage({
      ...fillStreamMessage,
      snapshot: {
        ...fillStreamMessage.snapshot,
        data: {
          ...fillStreamMessage.snapshot.data,
          fills: fillStreamMessage.snapshot.data.fills.map(({ projectionType: _projectionType, ...fill }) => fill),
        },
      },
    }),
    /projectionType.*IndexedFillProjection/i,
  );

  assert.throws(
    () => normalizeFillStreamMessage({
      ...fillStreamMessage,
      snapshot: {
        ...fillStreamMessage.snapshot,
        permissions: ['READ_ONLY', 'WITHDRAW'],
      },
    }),
    /unsafe private fill stream permissions/i,
  );
});

test('bindLiveFillStream renders live fill plus proof-service projection without withdrawal authority', async () => {
  FakeWebSocket.instances = [];
  const mount = { innerHTML: '' };
  const renderedFixtures = [];
  const requestedProofs = [];
  const errors = [];

  const binding = bindLiveFillStream({
    mount,
    baseUrl: 'http://127.0.0.1:8787',
    baseFixture: mockVerticalSliceFixture,
    WebSocketImpl: FakeWebSocket,
    fetchImpl: async (url) => {
      requestedProofs.push(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return proofEnvelope;
        },
      };
    },
    render: (fixture) => {
      renderedFixtures.push(fixture);
      return `${fixture.fill.fillId} ${fixture.proof.mockSettlementReference} ${fixture.liveStream.safetyNotice}`;
    },
    onError: (error) => errors.push(error),
  });

  assert.equal(FakeWebSocket.instances.length, 1);
  assert.equal(FakeWebSocket.instances[0].url, 'ws://127.0.0.1:8787/v1/ws?channel=fills');

  FakeWebSocket.instances[0].emit('message', { data: JSON.stringify(fillStreamMessage) });

  await waitFor(() => renderedFixtures.length === 1);

  assert.deepEqual(errors, []);
  assert.deepEqual(requestedProofs, ['http://127.0.0.1:8787/v1/proofs/trades/trade-live-000001']);
  assert.equal(mount.innerHTML, 'fill-live-000001 mock-settlement-fill-live-000001 Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');

  const fixture = renderedFixtures[0];
  assert.equal(fixture.fill.sourceEventId, 'event-live-000001');
  assert.equal(Object.hasOwn(fixture.fill, 'createdAt'), false);
  assert.equal(fixture.trade.proofUrl, '/v1/proofs/trades/trade-live-000001');
  assert.equal(fixture.sources.fills, 'in-memory-indexer-projection');
  assert.equal(fixture.sources.proof, 'proof-service-indexer-projection');
  assert.equal(fixture.liveStream.channel, 'fills');
  assert.deepEqual(fixture.liveStream.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(fixture.proof.settlementMode, 'mock');
  assert.equal(fixture.proof.settlementTx, null);
  assert.equal(fixture.proof.blockNumber, null);
  assert.equal(fixture.proof.explorerUrl, null);
  assert.match(fixture.proof.safetyNotice, /no funds moved/);
  assert.equal(fixture.custody.note, 'non-custodial-no-withdrawal-authority');
  assert.equal(fixture.custody.withdrawalAuthority, 'owner-wallet-only');

  binding.close();
  assert.equal(FakeWebSocket.instances[0].closed, true);
});
