import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  bindLiveKlineStream,
  buildKlineStreamUrl,
  normalizeKlineStreamMessage,
} from '../src/live-klines.js';

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

const KLINE_SOURCE = 'mock-candle-projection';
const KLINE_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];

const klineEnvelope = Object.freeze({
  marketId: 'QI-QUAI',
  interval: '1m',
  candles: Object.freeze([]),
  source: KLINE_SOURCE,
});

const klineStreamMessage = Object.freeze({
  type: 'snapshot',
  transport: 'websocket',
  snapshot: Object.freeze({
    channel: 'market.QI-QUAI.klines.1m',
    visibility: 'public',
    payload: 'kline_snapshot',
    source: KLINE_SOURCE,
    custody: 'public-read-only-no-custody',
    data: klineEnvelope,
  }),
  streamEvent: Object.freeze({
    reason: 'initial_snapshot',
    channel: 'market.QI-QUAI.klines.1m',
    source: KLINE_SOURCE,
  }),
});

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition was not satisfied');
};

test('buildKlineStreamUrl targets the public market kline WebSocket channel', () => {
  assert.equal(
    buildKlineStreamUrl({ baseUrl: 'http://127.0.0.1:8787', marketId: 'QI-QUAI', interval: '1m' }),
    'ws://127.0.0.1:8787/v1/ws?channel=market.QI-QUAI.klines.1m',
  );

  assert.equal(
    buildKlineStreamUrl({ baseUrl: 'https://dex.local:9443/app', marketId: 'QI-QUAI', interval: '15m' }),
    'wss://dex.local:9443/v1/ws?channel=market.QI-QUAI.klines.15m',
  );
});

test('normalizeKlineStreamMessage accepts only public read-only kline snapshots', () => {
  const normalized = normalizeKlineStreamMessage(klineStreamMessage);

  assert.equal(normalized.channel, 'market.QI-QUAI.klines.1m');
  assert.equal(normalized.payload, 'kline_snapshot');
  assert.equal(normalized.source, KLINE_SOURCE);
  assert.equal(normalized.custody, 'public-read-only-no-custody');
  assert.equal(normalized.klines.marketId, 'QI-QUAI');
  assert.equal(normalized.klines.interval, '1m');
  assert.deepEqual(normalized.klines.candles, []);
  assert.equal(normalized.klines.source, KLINE_SOURCE);
  assert.deepEqual(normalized.klines.permissions, KLINE_PERMISSIONS);
  assert.equal(normalized.klines.realQuaiTransactions, false);
  assert.equal(normalized.klines.walletRequired, false);
  assert.equal(normalized.klines.fundsMoved, false);
  assert.equal(normalized.klines.tradingVaultMutation, false);
  assert.equal(normalized.klines.safety.noFundsMovement, true);

  assert.throws(
    () => normalizeKlineStreamMessage({
      ...klineStreamMessage,
      snapshot: {
        ...klineStreamMessage.snapshot,
        visibility: 'private',
      },
    }),
    /kline stream visibility must be public/i,
  );

  assert.throws(
    () => normalizeKlineStreamMessage({
      ...klineStreamMessage,
      snapshot: {
        ...klineStreamMessage.snapshot,
        data: {
          ...klineStreamMessage.snapshot.data,
          source: 'wallet-backed-candles',
        },
      },
    }),
    /kline source must be mock-candle-projection/i,
  );
});

test('bindLiveKlineStream renders public kline snapshots into the terminal candle panel', async () => {
  FakeWebSocket.instances = [];
  const mount = { dataset: {}, innerHTML: '' };
  const renderedFixtures = [];
  const updates = [];
  const errors = [];

  const binding = bindLiveKlineStream({
    mount,
    baseUrl: 'http://127.0.0.1:8787',
    marketId: 'QI-QUAI',
    interval: '1m',
    baseFixture: mockVerticalSliceFixture,
    WebSocketImpl: FakeWebSocket,
    render: (fixture) => {
      renderedFixtures.push(fixture);
      return `${fixture.klineStream.channel} ${fixture.klineStream.source} ${fixture.klines.payload} ${fixture.klines.safety.notice} ${fixture.klineStream.safetyNotice}`;
    },
    onError: (error) => errors.push(error),
    onUpdate: (fixture) => updates.push(fixture.klineStream.channel),
  });

  assert.equal(FakeWebSocket.instances.length, 1);
  assert.equal(FakeWebSocket.instances[0].url, 'ws://127.0.0.1:8787/v1/ws?channel=market.QI-QUAI.klines.1m');

  FakeWebSocket.instances[0].emit('message', { data: JSON.stringify(klineStreamMessage) });

  await waitFor(() => renderedFixtures.length === 1);

  assert.deepEqual(errors, []);
  assert.deepEqual(updates, ['market.QI-QUAI.klines.1m']);
  assert.equal(mount.dataset.qdxKlineStream, 'market.QI-QUAI.klines.1m');
  assert.equal(mount.dataset.qdxKlineStreamSource, KLINE_SOURCE);
  assert.equal(mount.dataset.qdxKlineStreamCandles, '0');
  assert.match(mount.innerHTML, /market\.QI-QUAI\.klines\.1m mock-candle-projection kline_snapshot/);
  assert.match(mount.innerHTML, /no wallet loaded/i);
  assert.match(mount.innerHTML, /no funds moved/i);

  const fixture = renderedFixtures.at(-1);
  assert.equal(fixture.sources.klines, KLINE_SOURCE);
  assert.equal(fixture.klines.marketId, 'QI-QUAI');
  assert.equal(fixture.klines.interval, '1m');
  assert.deepEqual(fixture.klines.permissions, KLINE_PERMISSIONS);
  assert.equal(fixture.klineStream.channel, 'market.QI-QUAI.klines.1m');
  assert.equal(fixture.klineStream.custody, 'public-read-only-no-custody');
  assert.equal(fixture.klineStream.realQuaiTransactions, false);
  assert.equal(fixture.klineStream.walletRequired, false);
  assert.equal(fixture.klineStream.fundsMoved, false);
  assert.equal(fixture.klineStream.tradingVaultMutation, false);

  binding.close();
  assert.equal(FakeWebSocket.instances[0].closed, true);
});

test('terminal UI package/app/docs/status mention the public kline/candle stream binding', async () => {
  const [packageJson, appSource, readme, status] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../../../CAMPAIGN_STATUS.md', import.meta.url), 'utf8'),
  ]);

  for (const requiredText of [
    'src/live-klines.js',
    'bindLiveKlineStream',
    '/v1/ws?channel=market.<MARKET>.klines.1m',
    'kline_snapshot',
    'mock-candle-projection',
    'public-read-only-no-custody',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'realQuaiTransactions: false',
    'walletRequired: false',
    'fundsMoved: false',
    'tradingVaultMutation: false',
    'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
  ]) {
    assert.ok(`${packageJson}\n${appSource}\n${readme}`.includes(requiredText), `terminal UI kline stream docs/checks should include ${requiredText}`);
  }

  for (const requiredText of [
    'Completed previous run: Python SDK public kline/candle consumers',
    'Completed previous run: terminal UI public kline/candle panel binding',
    'Completed previous run: local API + terminal UI public kline/candle stream integration smoke',
    'Next autonomous slice: terminal UI keyboard-shortcut help panel for read-only/local mock actions',
  ]) {
    assert.ok(status.includes(requiredText), `CAMPAIGN_STATUS.md should include ${requiredText}`);
  }

  assert.doesNotMatch(
    `${readme}\n${status}`,
    /wallet key|rpcUrl\s*:|signing key|broadcast transaction|kline tx submitted|funds moved by UI/i,
    'public kline/candle stream binding docs/status must not claim wallet/RPC/signing/broadcast/tx/funds behavior',
  );
});
