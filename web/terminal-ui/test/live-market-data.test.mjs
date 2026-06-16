import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  bindLivePublicMarketDataStreams,
  buildPublicMarketDataStreamUrls,
  normalizePublicMarketDataStreamMessage,
} from '../src/live-market-data.js';

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

const SAFE_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];
const PUBLIC_CUSTODY = 'public-read-only-no-custody';

const tickerMessage = Object.freeze({
  type: 'snapshot',
  transport: 'websocket',
  snapshot: Object.freeze({
    channel: 'global.tickers',
    visibility: 'public',
    payload: 'ticker_snapshot',
    source: 'mock-market-data',
    custody: PUBLIC_CUSTODY,
    data: Object.freeze({
      tickers: Object.freeze([
        Object.freeze({
          marketId: 'WQUAI-WQI',
          lastPrice: null,
          bestBid: null,
          bestAsk: null,
          volume24h: '0',
          source: 'mock-market-data',
        }),
      ]),
    }),
  }),
  streamEvent: Object.freeze({
    reason: 'initial_snapshot',
    channel: 'global.tickers',
    source: 'mock-market-data',
  }),
});

const depthMessage = Object.freeze({
  type: 'snapshot',
  transport: 'websocket',
  snapshot: Object.freeze({
    channel: 'market.WQUAI-WQI.depth',
    visibility: 'public',
    payload: 'orderbook_depth',
    source: 'mock-orderbook',
    custody: PUBLIC_CUSTODY,
    data: Object.freeze({
      marketId: 'WQUAI-WQI',
      sequence: 2,
      bids: Object.freeze([]),
      asks: Object.freeze([]),
      source: 'mock-orderbook',
    }),
  }),
  streamEvent: Object.freeze({
    reason: 'initial_snapshot',
    channel: 'market.WQUAI-WQI.depth',
    source: 'mock-orderbook',
  }),
});

const tradesMessage = Object.freeze({
  type: 'snapshot',
  transport: 'websocket',
  snapshot: Object.freeze({
    channel: 'market.WQUAI-WQI.trades',
    visibility: 'public',
    payload: 'trade_projection',
    source: 'in-memory-indexer-projection',
    custody: PUBLIC_CUSTODY,
    data: Object.freeze({
      marketId: 'WQUAI-WQI',
      trades: Object.freeze([]),
      source: 'in-memory-indexer-projection',
    }),
  }),
  streamEvent: Object.freeze({
    reason: 'initial_snapshot',
    channel: 'market.WQUAI-WQI.trades',
    source: 'in-memory-indexer-projection',
  }),
});

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition was not satisfied');
};

test('buildPublicMarketDataStreamUrls targets public ticker/depth/trade WebSocket channels', () => {
  assert.deepEqual(
    buildPublicMarketDataStreamUrls({ baseUrl: 'http://127.0.0.1:8787', marketId: 'WQUAI-WQI' }),
    {
      tickers: 'ws://127.0.0.1:8787/v1/ws?channel=global.tickers',
      depth: 'ws://127.0.0.1:8787/v1/ws?channel=market.WQUAI-WQI.depth',
      trades: 'ws://127.0.0.1:8787/v1/ws?channel=market.WQUAI-WQI.trades',
    },
  );

  assert.deepEqual(
    buildPublicMarketDataStreamUrls({ baseUrl: 'https://dex.local:9443/app', marketId: 'WQI-WQUAI' }),
    {
      tickers: 'wss://dex.local:9443/v1/ws?channel=global.tickers',
      depth: 'wss://dex.local:9443/v1/ws?channel=market.WQI-WQUAI.depth',
      trades: 'wss://dex.local:9443/v1/ws?channel=market.WQI-WQUAI.trades',
    },
  );
});

test('normalizePublicMarketDataStreamMessage accepts only public read-only market-data snapshots', () => {
  const ticker = normalizePublicMarketDataStreamMessage(tickerMessage);
  assert.equal(ticker.kind, 'tickers');
  assert.equal(ticker.channel, 'global.tickers');
  assert.equal(ticker.payload, 'ticker_snapshot');
  assert.equal(ticker.source, 'mock-market-data');
  assert.equal(ticker.custody, PUBLIC_CUSTODY);
  assert.equal(ticker.data.tickers.length, 1);
  assert.equal(ticker.data.tickers[0].volume24h, '0');

  const depth = normalizePublicMarketDataStreamMessage(depthMessage);
  assert.equal(depth.kind, 'depth');
  assert.equal(depth.marketId, 'WQUAI-WQI');
  assert.equal(depth.payload, 'orderbook_depth');
  assert.equal(depth.source, 'mock-orderbook');
  assert.deepEqual(depth.data.bids, []);
  assert.deepEqual(depth.data.asks, []);

  const trades = normalizePublicMarketDataStreamMessage(tradesMessage);
  assert.equal(trades.kind, 'trades');
  assert.equal(trades.marketId, 'WQUAI-WQI');
  assert.equal(trades.payload, 'trade_projection');
  assert.equal(trades.source, 'in-memory-indexer-projection');
  assert.equal(trades.finality, 'confirmed-settlement-only');
  assert.deepEqual(trades.data.trades, []);

  assert.throws(
    () => normalizePublicMarketDataStreamMessage({
      ...tickerMessage,
      snapshot: { ...tickerMessage.snapshot, visibility: 'private' },
    }),
    /public market-data stream visibility must be public/i,
  );

  assert.throws(
    () => normalizePublicMarketDataStreamMessage({
      ...depthMessage,
      snapshot: { ...depthMessage.snapshot, source: 'wallet-backed-orderbook' },
    }),
    /depth stream source must be mock-orderbook/i,
  );
});

test('bindLivePublicMarketDataStreams renders ticker/depth/trade snapshots into a read-only terminal panel', async () => {
  FakeWebSocket.instances = [];
  const mount = { dataset: {}, innerHTML: '' };
  const renderedFixtures = [];
  const updates = [];
  const errors = [];

  const binding = bindLivePublicMarketDataStreams({
    mount,
    baseUrl: 'http://127.0.0.1:8787',
    marketId: 'WQUAI-WQI',
    baseFixture: mockVerticalSliceFixture,
    WebSocketImpl: FakeWebSocket,
    render: (fixture) => {
      renderedFixtures.push(fixture);
      return `${fixture.publicMarketDataStream.channels.join('|')} ${fixture.publicMarketDataStream.payloads.join('|')} ${fixture.publicMarketDataStream.sources.join('|')} ${fixture.publicMarketDataStream.safetyNotice}`;
    },
    onError: (error) => errors.push(error),
    onUpdate: (fixture) => updates.push(fixture.publicMarketDataStream.channels.join(',')),
  });

  assert.equal(FakeWebSocket.instances.length, 3);
  assert.deepEqual(
    FakeWebSocket.instances.map((ws) => ws.url),
    [
      'ws://127.0.0.1:8787/v1/ws?channel=global.tickers',
      'ws://127.0.0.1:8787/v1/ws?channel=market.WQUAI-WQI.depth',
      'ws://127.0.0.1:8787/v1/ws?channel=market.WQUAI-WQI.trades',
    ],
  );

  FakeWebSocket.instances[0].emit('message', { data: JSON.stringify(tickerMessage) });
  FakeWebSocket.instances[1].emit('message', { data: JSON.stringify(depthMessage) });
  FakeWebSocket.instances[2].emit('message', { data: JSON.stringify(tradesMessage) });

  await waitFor(() => renderedFixtures.length === 3);

  assert.deepEqual(errors, []);
  assert.equal(updates.length, 3);
  assert.equal(mount.dataset.qdxPublicMarketDataStreams, 'global.tickers,market.WQUAI-WQI.depth,market.WQUAI-WQI.trades');
  assert.equal(mount.dataset.qdxPublicMarketDataStreamSources, 'mock-market-data,mock-orderbook,in-memory-indexer-projection');
  assert.equal(mount.dataset.qdxPublicMarketDataTickerCount, '1');
  assert.equal(mount.dataset.qdxPublicMarketDataTradeCount, '0');
  assert.match(mount.innerHTML, /ticker_snapshot\|orderbook_depth\|trade_projection/);
  assert.match(mount.innerHTML, /mock-market-data\|mock-orderbook\|in-memory-indexer-projection/);
  assert.match(mount.innerHTML, /no wallet loaded/i);
  assert.match(mount.innerHTML, /no funds moved/i);

  const fixture = renderedFixtures.at(-1);
  assert.deepEqual(fixture.sources.publicMarketData, ['mock-market-data', 'mock-orderbook', 'in-memory-indexer-projection']);
  assert.equal(fixture.publicMarketData.marketId, 'WQUAI-WQI');
  assert.equal(fixture.publicMarketData.tickers.tickers.length, 1);
  assert.equal(fixture.publicMarketData.orderbook.source, 'mock-orderbook');
  assert.equal(fixture.publicMarketData.trades.source, 'in-memory-indexer-projection');
  assert.deepEqual(fixture.publicMarketDataStream.permissions, SAFE_PERMISSIONS);
  assert.equal(fixture.publicMarketDataStream.custody, PUBLIC_CUSTODY);
  assert.equal(fixture.publicMarketDataStream.finality, 'confirmed-settlement-only');
  assert.equal(fixture.publicMarketDataStream.realQuaiTransactions, false);
  assert.equal(fixture.publicMarketDataStream.walletRequired, false);
  assert.equal(fixture.publicMarketDataStream.fundsMoved, false);
  assert.equal(fixture.publicMarketDataStream.tradingVaultMutation, false);

  binding.close();
  assert.deepEqual(FakeWebSocket.instances.map((ws) => ws.closed), [true, true, true]);
});

test('terminal UI package/app/docs/status mention the public market-data stream binding', async () => {
  const [packageJson, appSource, readme, status] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../../../CAMPAIGN_STATUS.md', import.meta.url), 'utf8'),
  ]);

  for (const requiredText of [
    'src/live-market-data.js',
    'bindLivePublicMarketDataStreams',
    '/v1/ws?channel=global.tickers',
    '/v1/ws?channel=market.<MARKET>.depth',
    '/v1/ws?channel=market.<MARKET>.trades',
    'ticker_snapshot',
    'orderbook_depth',
    'trade_projection',
    'mock-market-data',
    'mock-orderbook',
    'in-memory-indexer-projection',
    'confirmed-settlement-only',
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
    assert.ok(`${packageJson}\n${appSource}\n${readme}`.includes(requiredText), `terminal UI public market-data stream docs/checks should include ${requiredText}`);
  }

  for (const requiredText of [
    'Completed previous run: local API + terminal UI public kline/candle stream integration smoke',
    'Completed previous run: terminal UI public market-data stream binding',
    'Completed previous run: local API + terminal UI public market-data stream integration smoke',
    'Next autonomous slice: post-nonce-cancel owner-signed readiness docs',
  ]) {
    assert.ok(status.includes(requiredText), `CAMPAIGN_STATUS.md should include ${requiredText}`);
  }

  assert.doesNotMatch(
    `${readme}\n${status}`,
    /wallet key|rpcUrl\s*:|signing key|broadcast transaction|market-data tx submitted|funds moved by UI/i,
    'public market-data stream binding docs/status must not claim wallet/RPC/signing/broadcast/tx/funds behavior',
  );
});
