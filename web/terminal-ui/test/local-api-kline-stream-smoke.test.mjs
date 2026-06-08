import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindLiveKlineStreamWithRestSnapshot } from '../src/kline-stream-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const KLINE_SOURCE = 'mock-candle-projection';
const STREAM_CUSTODY = 'public-read-only-no-custody';
const KLINE_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];

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

const assertKlineEnvelope = (envelope) => {
  assert.equal(envelope.marketId, 'QI-QUAI');
  assert.equal(envelope.interval, '1m');
  assert.deepEqual(envelope.candles, []);
  assert.equal(envelope.source, KLINE_SOURCE);
  assert.equal(envelope.payload, 'kline_snapshot');
  assert.equal(envelope.custody, STREAM_CUSTODY);
  assert.deepEqual(envelope.permissions, KLINE_PERMISSIONS);
  assert.equal(envelope.realQuaiTransactions, false);
  assert.equal(envelope.walletRequired, false);
  assert.equal(envelope.fundsMoved, false);
  assert.equal(envelope.tradingVaultMutation, false);
  assert.equal(envelope.safety.noWalletLoading, true);
  assert.equal(envelope.safety.noRpcUrlAccess, true);
  assert.equal(envelope.safety.noSigning, true);
  assert.equal(envelope.safety.noBroadcast, true);
  assert.equal(envelope.safety.noDeploys, true);
  assert.equal(envelope.safety.noTransactionSubmission, true);
  assert.equal(envelope.safety.noFundsMovement, true);
  assert.equal(envelope.safety.noCustodyAuthority, true);
  assert.match(envelope.safety.notice, /Read-only public kline\/candle metadata/i);
  assert.match(envelope.safety.notice, /no wallet loaded/i);
  assert.match(envelope.safety.notice, /no funds moved/i);
};

test('local API + terminal UI public kline stream smoke renders only REST-confirmed candle snapshots', async () => {
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

    const binding = await bindLiveKlineStreamWithRestSnapshot({
      mount,
      baseUrl,
      marketId: 'QI-QUAI',
      interval: '1m',
      fetchImpl: countedFetch,
      WebSocketImpl: WebSocket,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onRestSnapshot: (klines) => {
        eventOrder.push('rest');
        restSnapshots.push(klines);
      },
      onStreamUpdate: (fixture) => {
        eventOrder.push(`stream:${fixture.klineStream.channel}`);
        streamFixtures.push(fixture);
      },
      onRestError: (error) => restErrors.push(error),
      onStreamError: (error) => streamErrors.push(error),
    });

    try {
      await waitFor(
        () => streamFixtures.some((fixture) => fixture.klineStream?.channel === 'market.QI-QUAI.klines.1m'),
        'REST-confirmed public kline/candle stream render',
      );

      assert.equal(eventOrder[0], 'rest');
      assert.deepEqual(restErrors, []);
      assert.deepEqual(streamErrors, []);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname, new URL(call.url).searchParams.get('interval')]),
        [['GET', '/v1/klines/QI-QUAI', '1m']],
      );

      assert.equal(restSnapshots.length, 1);
      assert.equal(mount.dataset.qdxKlineRestSnapshot, KLINE_SOURCE);
      assert.equal(mount.dataset.qdxKlineStreamRestAgreement, KLINE_SOURCE);
      assert.equal(mount.dataset.qdxKlineStream, 'market.QI-QUAI.klines.1m');
      assert.equal(mount.dataset.qdxKlineStreamCandles, '0');

      const restSnapshot = restSnapshots[0];
      assertKlineEnvelope(restSnapshot);

      const fixture = streamFixtures.at(-1);
      assert.deepEqual(fixture.klines, restSnapshot);
      assert.equal(fixture.sources.klines, KLINE_SOURCE);
      assert.equal(fixture.klineStream.source, KLINE_SOURCE);
      assert.equal(fixture.klineStream.payload, 'kline_snapshot');
      assert.equal(fixture.klineStream.custody, STREAM_CUSTODY);
      assert.deepEqual(fixture.klineStream.permissions, KLINE_PERMISSIONS);
      assert.equal(fixture.klineStream.marketId, 'QI-QUAI');
      assert.equal(fixture.klineStream.interval, '1m');
      assert.equal(fixture.klineStream.candleCount, 0);
      assert.equal(fixture.klineStream.realQuaiTransactions, false);
      assert.equal(fixture.klineStream.walletRequired, false);
      assert.equal(fixture.klineStream.fundsMoved, false);
      assert.equal(fixture.klineStream.tradingVaultMutation, false);

      assert.match(mount.innerHTML, /live public kline\/candle stream/i);
      assert.match(mount.innerHTML, /mock-candle-projection/);
      assert.match(mount.innerHTML, /kline_snapshot/);
      assert.match(mount.innerHTML, /public-read-only-no-custody/);
      assert.match(mount.innerHTML, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
      assert.match(mount.innerHTML, /real Quai tx[\s\S]*false/i);
      assert.match(mount.innerHTML, /wallet required[\s\S]*false/i);
      assert.match(mount.innerHTML, /funds moved[\s\S]*false/i);
      assert.match(mount.innerHTML, /TradingVault mutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /no wallet loaded/i);
      assert.match(mount.innerHTML, /no funds moved/i);
      assert.doesNotMatch(mount.innerHTML, /wallet connected for candles|kline transaction submitted|broadcast transaction|funds moved by UI/i);

      assert.deepEqual(binding.klines, restSnapshot);
    } finally {
      binding.close();
    }
  });
});

test('terminal UI docs, package check, and campaign status mark public kline stream smoke complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const appSource = await readText('web/terminal-ui/src/app.js');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/kline-stream-binding.js',
    'local API + terminal UI public kline/candle stream integration smoke',
    'GET /v1/klines/<MARKET>?interval=1m',
    '/v1/ws?channel=market.<MARKET>.klines.1m',
    'REST + WebSocket agreement',
    'source: mock-candle-projection',
    'payload: kline_snapshot',
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
    assert.ok(readme.includes(requiredText), `terminal UI kline stream smoke docs should include ${requiredText}`);
  }

  assert.ok(
    packageJson.includes('node --check src/kline-stream-binding.js'),
    'terminal UI package check should syntax-check the kline stream smoke binding',
  );
  assert.ok(
    appSource.includes('bindLiveKlineStreamWithRestSnapshot'),
    'browser app should bind the REST-confirmed public kline stream smoke wrapper',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI public kline/candle panel binding'),
    'campaign status should move terminal UI public kline binding to previous work',
  );
  assert.ok(
    status.includes('Completed this run: local API + terminal UI public kline/candle stream integration smoke'),
    'campaign status should mark the local API + terminal UI kline stream smoke as this run',
  );
  assert.ok(
    status.includes('Next autonomous slice: another bounded local/source-only MVP surface'),
    'campaign status should move the next work to another safe local/source-only MVP surface',
  );
  assert.ok(
    status.includes('Still not approved: wallets, RPC URLs, signing, broadcasts, deploys, real token addresses, transaction helpers, live `DelegateKeyRegistry` mutation, live `FeeManager` mutation, real network `MarketRegistry` mutation, public servers, remote pushes, or funds movement.'),
    'campaign status should preserve external side-effect approval gate wording',
  );

  assert.doesNotMatch(
    `${readme}\n${status}`,
    /wallet key|rpcUrl\s*:|signing key|broadcast transaction|kline tx submitted|funds moved by UI/i,
    'public kline/candle stream smoke docs/status must not claim wallet/RPC/signing/broadcast/tx/funds behavior',
  );
});
