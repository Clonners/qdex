import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindFillHistoryLocalApiSmoke } from '../src/fill-history-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const FILL_SOURCE = 'in-memory-indexer-projection';
const FILL_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];

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

const assertFillEnvelope = (envelope) => {
  assert.deepEqual(envelope.fills, []);
  assert.equal(envelope.source, FILL_SOURCE);
  assert.equal(envelope.projectionType, 'IndexedFillProjection');
  assert.equal(envelope.eventName, 'Fill');
  assert.deepEqual(envelope.permissions, FILL_PERMISSIONS);
  assert.equal(envelope.settlementMode, 'mock');
  assert.equal(envelope.settlementTx, null);
  assert.equal(envelope.blockNumber, null);
  assert.equal(envelope.blockHash, null);
  assert.equal(envelope.eventIndex, null);
  assert.equal(envelope.explorerUrl, null);
  assert.equal(envelope.realQuaiTransactions, false);
  assert.equal(envelope.walletRequired, false);
  assert.equal(envelope.fundsMoved, false);
  assert.equal(envelope.tradingVaultMutation, false);
  assert.match(envelope.safetyNotice, /Read-only IndexedFillProjection fill history/);
  assert.match(envelope.safetyNotice, /no real Quai transaction, no wallet loaded, no funds moved/i);
};

test('local API + terminal UI fill history smoke renders REST read-only IndexedFillProjection', async () => {
  await withApiServer(async (baseUrl) => {
    const mount = { dataset: {}, innerHTML: '' };
    const fetchCalls = [];
    const historySnapshots = [];
    const renderedFixtures = [];
    const historyErrors = [];

    const countedFetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), method: options.method ?? 'GET' });
      return fetch(url, options);
    };

    const binding = await bindFillHistoryLocalApiSmoke({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      baseFixture: mockVerticalSliceFixture,
      render: (fixture) => {
        renderedFixtures.push(fixture);
        return renderTradeProofPanel(fixture);
      },
      onHistory: (fillHistory) => historySnapshots.push(fillHistory),
      onError: (error) => historyErrors.push(error),
    });

    try {
      assert.deepEqual(historyErrors, []);
      assert.equal(fetchCalls.length, 1);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['GET', '/v1/fills'],
        ],
      );

      assert.equal(historySnapshots.length, 1);
      assert.equal(renderedFixtures.length, 1);
      assert.equal(mount.dataset.qdxFillHistorySmoke, FILL_SOURCE);
      assert.equal(mount.dataset.qdxFillHistoryProjection, 'IndexedFillProjection');
      assert.equal(mount.dataset.qdxFillHistoryRows, '0');

      const fillHistory = historySnapshots[0];
      assertFillEnvelope(fillHistory);

      const fixture = renderedFixtures[0];
      assert.deepEqual(fixture.fillHistory, fillHistory);
      assert.equal(fixture.fillHistory.source, FILL_SOURCE);

      assert.match(mount.innerHTML, /read-only fill history/i);
      assert.match(mount.innerHTML, /in-memory-indexer-projection/);
      assert.match(mount.innerHTML, /IndexedFillProjection/);
      assert.match(mount.innerHTML, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
      assert.match(mount.innerHTML, /settlementMode[\s\S]*mock/i);
      assert.match(mount.innerHTML, /settlement tx[\s\S]*null \(mock\)/i);
      assert.match(mount.innerHTML, /block[\s\S]*null \(mock\)/i);
      assert.match(mount.innerHTML, /event index[\s\S]*null \(mock\)/i);
      assert.match(mount.innerHTML, /explorer[\s\S]*null \(mock\)/i);
      assert.match(mount.innerHTML, /real Quai tx[\s\S]*false/i);
      assert.match(mount.innerHTML, /wallet required[\s\S]*false/i);
      assert.match(mount.innerHTML, /funds moved[\s\S]*false/i);
      assert.match(mount.innerHTML, /TradingVault mutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /no fill history rows yet/i);
      assert.match(mount.innerHTML, /no wallet loaded, no funds moved/i);

      assert.doesNotMatch(mount.innerHTML, /wallet connected for fill history/i);
      assert.doesNotMatch(mount.innerHTML, /broadcast transaction|signing request|funds moved by UI/i);
      assert.doesNotMatch(mount.innerHTML, /WITHDRAW, ADMIN/);

      assert.equal(binding.fillHistory.source, FILL_SOURCE);
    } finally {
      binding.close();
    }
  });
});
