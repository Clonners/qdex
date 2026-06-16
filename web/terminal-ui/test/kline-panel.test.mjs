import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  createMockKlineFixture,
  normalizeKlinePanelFixture,
} from '../src/kline-panel.js';
import { renderTradeProofPanel } from '../src/render.js';

const repoRoot = new URL('../../../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const REQUIRED_PERMISSIONS = Object.freeze(['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);

const requiredSafetyFields = Object.freeze({
  source: 'mock-candle-projection',
  payload: 'kline_snapshot',
  custody: 'public-read-only-no-custody',
  marketId: 'WQUAI-WQI',
  interval: '1m',
  permissions: REQUIRED_PERMISSIONS,
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
});

test('mock terminal UI fixture carries read-only public kline/candle metadata', () => {
  assert.ok(mockVerticalSliceFixture.klines, 'static fixture should carry public kline/candle metadata');

  const normalized = normalizeKlinePanelFixture(mockVerticalSliceFixture.klines);

  for (const [key, expected] of Object.entries(requiredSafetyFields)) {
    assert.deepEqual(normalized[key], expected, `${key} should preserve the public kline/candle safety envelope`);
  }

  assert.deepEqual(normalized.candles, []);
  assert.equal(normalized.safety.noWalletLoading, true);
  assert.equal(normalized.safety.noRpcUrlAccess, true);
  assert.equal(normalized.safety.noSigning, true);
  assert.equal(normalized.safety.noBroadcast, true);
  assert.equal(normalized.safety.noDeploys, true);
  assert.equal(normalized.safety.noTransactionSubmission, true);
  assert.equal(normalized.safety.noFundsMovement, true);
  assert.equal(normalized.safety.noCustodyAuthority, true);
  assert.match(normalized.safety.notice, /read-only public kline\/candle/i);
  assert.match(normalized.safety.notice, /no wallet loaded/i);
});

test('renderTradeProofPanel renders public kline/candle panel without implying wallet, tx, or funds behavior', () => {
  const fixture = {
    ...mockVerticalSliceFixture,
    klines: createMockKlineFixture(),
  };
  const html = renderTradeProofPanel(fixture);

  for (const requiredText of [
    /read-only public kline\/candle panel/i,
    /mock-candle-projection/,
    /kline_snapshot/,
    /public-read-only-no-custody/,
    /WQUAI-WQI/,
    /interval[\s\S]*1m/i,
    /candles[\s\S]*0/i,
    /READ_ONLY, NO_WITHDRAW, NO_ADMIN/,
    /real Quai tx[\s\S]*false/i,
    /wallet required[\s\S]*false/i,
    /funds moved[\s\S]*false/i,
    /TradingVault mutation[\s\S]*false/i,
    /no wallet loaded/i,
    /no custody authority/i,
  ]) {
    assert.match(html, requiredText);
  }

  assert.doesNotMatch(html, /wallet connected for candles/i);
  assert.doesNotMatch(html, /kline transaction submitted/i);
  assert.doesNotMatch(html, /funds moved by candle/i);
  assert.doesNotMatch(html, /WITHDRAW, ADMIN/);
});

test('terminal UI docs, package check, and campaign status mark public kline/candle panel binding complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/kline-panel.js',
    'src/live-klines.js',
    'bindLiveKlineStream',
    '/v1/klines/<MARKET>?interval=1m',
    '/v1/ws?channel=market.<MARKET>.klines.1m',
    'read-only public kline/candle panel',
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
    assert.ok(readme.includes(requiredText), `terminal UI README should include ${requiredText}`);
  }

  assert.ok(
    packageJson.includes('node --check src/kline-panel.js'),
    'terminal UI package check should syntax-check the public kline/candle panel module',
  );
  assert.ok(
    packageJson.includes('node --check src/live-klines.js'),
    'terminal UI package check should syntax-check the live public kline stream module',
  );
  assert.ok(
    status.includes('Completed previous run: Python SDK public kline/candle consumers'),
    'campaign status should move Python SDK public kline consumers to previous work',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI public kline/candle panel binding'),
    'campaign status should retain this terminal UI public kline/candle binding slice as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI public kline/candle stream integration smoke'),
    'campaign status should checkpoint the REST-confirmed public kline/candle stream smoke slice',
  );
  assert.ok(
    status.includes('Next autonomous slice: testnet cutover readiness Task 6'),
    'campaign status should move next work to the testnet cutover readiness plan',
  );

  assert.doesNotMatch(
    `${readme}\n${status}`,
    /wallet key|rpcUrl\s*:|signing key|broadcast transaction|kline tx submitted|funds moved by UI/i,
    'terminal UI kline/candle docs/status must not claim wallet/RPC/signing/broadcast/tx/funds behavior',
  );
});
