import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindLivePublicMarketDataStreamsWithRestSnapshots } from '../src/market-data-stream-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const TICKER_SOURCE = 'mock-market-data';
const DEPTH_SOURCE = 'mock-orderbook';
const TRADES_SOURCE = 'in-memory-indexer-projection';
const STREAM_CUSTODY = 'public-read-only-no-custody';
const SAFE_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];
const REST_SOURCE_JOIN = `${TICKER_SOURCE},${DEPTH_SOURCE},${TRADES_SOURCE}`;

const repoRoot = new URL('../../../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const withApiServer = async (callback) => {
  const server = createApiServer();

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const waitFor = async (predicate, label) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`timed out waiting for ${label}`);
};

const assertTickerRestEnvelope = (envelope) => {
  assert.equal(envelope.source, TICKER_SOURCE);
  assert.deepEqual(envelope.tickers.map((ticker) => ticker.marketId), ['WQUAI-WQI', 'WQUAI-USDT', 'WQI-USDT']);
  for (const ticker of envelope.tickers) {
    assert.equal(ticker.source, TICKER_SOURCE);
    assert.equal(ticker.volume24h, '0');
  }
};

const assertOrderbookRestEnvelope = (envelope) => {
  assert.equal(envelope.marketId, 'WQUAI-WQI');
  assert.equal(envelope.source, DEPTH_SOURCE);
  assert.equal(envelope.sequence, 0);
  assert.deepEqual(envelope.bids, []);
  assert.deepEqual(envelope.asks, []);
};

const assertTradesRestEnvelope = (envelope) => {
  assert.equal(envelope.marketId, 'WQUAI-WQI');
  assert.equal(envelope.source, TRADES_SOURCE);
  assert.deepEqual(envelope.trades, []);
};

test('local API + terminal UI public market-data stream smoke renders only REST-confirmed ticker/depth/trade snapshots', async () => {
  await withApiServer(async (baseUrl) => {
    const mount = { dataset: {}, innerHTML: '' };
    const fetchCalls = [];
    const restSnapshots = [];
    const streamFixtures = [];
    const restErrors = [];
    const streamErrors = [];
    const eventOrder = [];

    const countedFetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), method: options.method ?? 'GET' });
      return fetch(url, options);
    };

    const binding = await bindLivePublicMarketDataStreamsWithRestSnapshots({
      mount,
      baseUrl,
      marketId: 'WQUAI-WQI',
      fetchImpl: countedFetch,
      WebSocketImpl: WebSocket,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onRestSnapshots: (snapshots) => {
        eventOrder.push('rest');
        restSnapshots.push(snapshots);
      },
      onStreamUpdate: (fixture) => {
        eventOrder.push(`stream:${fixture.publicMarketDataStream.channels.join('|')}`);
        streamFixtures.push(fixture);
      },
      onRestError: (error) => restErrors.push(error),
      onStreamError: (error) => streamErrors.push(error),
    });

    try {
      await waitFor(
        () => streamFixtures.some((fixture) => (
          fixture.publicMarketDataStream?.channels.includes('global.tickers')
            && fixture.publicMarketDataStream?.channels.includes('market.WQUAI-WQI.depth')
            && fixture.publicMarketDataStream?.channels.includes('market.WQUAI-WQI.trades')
        )),
        'REST-confirmed public market-data stream render',
      );

      assert.equal(eventOrder[0], 'rest');
      assert.deepEqual(restErrors, []);
      assert.deepEqual(streamErrors, []);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['GET', '/v1/tickers'],
          ['GET', '/v1/orderbook/WQUAI-WQI'],
          ['GET', '/v1/trades/WQUAI-WQI'],
        ],
      );

      assert.equal(restSnapshots.length, 1);
      assert.equal(mount.dataset.qdxPublicMarketDataRestSnapshots, REST_SOURCE_JOIN);
      assert.equal(mount.dataset.qdxPublicMarketDataStreamRestAgreement, REST_SOURCE_JOIN);
      assert.equal(mount.dataset.qdxPublicMarketDataStreams, 'global.tickers,market.WQUAI-WQI.depth,market.WQUAI-WQI.trades');
      assert.equal(mount.dataset.qdxPublicMarketDataStreamSources, REST_SOURCE_JOIN);
      assert.equal(mount.dataset.qdxPublicMarketDataTickerCount, '3');
      assert.equal(mount.dataset.qdxPublicMarketDataTradeCount, '0');

      const restSnapshot = restSnapshots[0];
      assertTickerRestEnvelope(restSnapshot.tickers);
      assertOrderbookRestEnvelope(restSnapshot.orderbook);
      assertTradesRestEnvelope(restSnapshot.trades);

      const fixture = streamFixtures.at(-1);
      assert.deepEqual(fixture.publicMarketData.tickers, restSnapshot.tickers);
      assert.deepEqual(fixture.publicMarketData.orderbook, restSnapshot.orderbook);
      assert.deepEqual(fixture.publicMarketData.trades, restSnapshot.trades);
      assert.deepEqual(fixture.sources.publicMarketData, [TICKER_SOURCE, DEPTH_SOURCE, TRADES_SOURCE]);
      assert.equal(fixture.publicMarketData.marketId, 'WQUAI-WQI');
      assert.equal(fixture.publicMarketData.custody, STREAM_CUSTODY);
      assert.deepEqual(fixture.publicMarketData.permissions, SAFE_PERMISSIONS);
      assert.equal(fixture.publicMarketData.realQuaiTransactions, false);
      assert.equal(fixture.publicMarketData.walletRequired, false);
      assert.equal(fixture.publicMarketData.fundsMoved, false);
      assert.equal(fixture.publicMarketData.tradingVaultMutation, false);

      assert.deepEqual(fixture.publicMarketDataStream.permissions, SAFE_PERMISSIONS);
      assert.equal(fixture.publicMarketDataStream.custody, STREAM_CUSTODY);
      assert.equal(fixture.publicMarketDataStream.finality, 'confirmed-settlement-only');
      assert.equal(fixture.publicMarketDataStream.tickerCount, 3);
      assert.equal(fixture.publicMarketDataStream.bidCount, 0);
      assert.equal(fixture.publicMarketDataStream.askCount, 0);
      assert.equal(fixture.publicMarketDataStream.tradeCount, 0);
      assert.equal(fixture.publicMarketDataStream.realQuaiTransactions, false);
      assert.equal(fixture.publicMarketDataStream.walletRequired, false);
      assert.equal(fixture.publicMarketDataStream.fundsMoved, false);
      assert.equal(fixture.publicMarketDataStream.tradingVaultMutation, false);

      assert.match(mount.innerHTML, /live public market-data streams/i);
      assert.match(mount.innerHTML, /ticker_snapshot, orderbook_depth, trade_projection/);
      assert.match(mount.innerHTML, /mock-market-data, mock-orderbook, in-memory-indexer-projection/);
      assert.match(mount.innerHTML, /confirmed-settlement-only/);
      assert.match(mount.innerHTML, /public-read-only-no-custody/);
      assert.match(mount.innerHTML, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
      assert.match(mount.innerHTML, /real Quai tx[\s\S]*false/i);
      assert.match(mount.innerHTML, /wallet required[\s\S]*false/i);
      assert.match(mount.innerHTML, /funds moved[\s\S]*false/i);
      assert.match(mount.innerHTML, /TradingVault mutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /no wallet loaded/i);
      assert.match(mount.innerHTML, /no funds moved/i);
      assert.doesNotMatch(mount.innerHTML, /wallet connected for market-data|market-data transaction submitted|broadcast transaction|funds moved by UI/i);

      assert.deepEqual(binding.restSnapshots, restSnapshot);
    } finally {
      binding.close();
    }
  });
});

test('terminal UI docs, package check, app wiring, and campaign status mark public market-data stream smoke complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const appSource = await readText('web/terminal-ui/src/app.js');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/market-data-stream-binding.js',
    'local API + terminal UI public market-data stream integration smoke',
    'GET /v1/tickers',
    'GET /v1/orderbook/<MARKET>',
    'GET /v1/trades/<MARKET>',
    '/v1/ws?channel=global.tickers',
    '/v1/ws?channel=market.<MARKET>.depth',
    '/v1/ws?channel=market.<MARKET>.trades',
    'REST + WebSocket agreement',
    'ticker_snapshot',
    'orderbook_depth',
    'trade_projection',
    'source: mock-market-data',
    'source: mock-orderbook',
    'source: in-memory-indexer-projection',
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
    assert.ok(readme.includes(requiredText), `terminal UI public market-data stream smoke docs should include ${requiredText}`);
  }

  assert.ok(
    packageJson.includes('node --check src/market-data-stream-binding.js'),
    'terminal UI package check should syntax-check the public market-data stream smoke binding',
  );
  assert.ok(
    appSource.includes('bindLivePublicMarketDataStreamsWithRestSnapshots'),
    'browser app should bind the REST-confirmed public market-data stream smoke wrapper',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI public market-data stream binding'),
    'campaign status should move terminal UI public market-data stream binding to previous work',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI public market-data stream integration smoke'),
    'campaign status should mark the public market-data stream smoke as this run',
  );
  assert.ok(
    status.includes('Still not approved: wallets, signing, broadcasts, deploys, real token addresses'),
    'campaign status should preserve external side-effect approval gate wording (RPC URLs removed after approval)',
  );

  assert.doesNotMatch(
    `${readme}\n${status}`,
    /wallet key|rpcUrl\s*:|signing key|broadcast transaction|market-data tx submitted|funds moved by UI/i,
    'public market-data stream smoke docs/status must not claim wallet/RPC/signing/broadcast/tx/funds behavior',
  );
});
