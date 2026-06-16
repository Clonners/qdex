import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindNonceCancellationHistoryLocalApiSmoke } from '../src/nonce-cancellation-history-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const HISTORY_SOURCE = 'nonce-manager-event-projection';
const HISTORY_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];

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

const assertHistoryEnvelope = ({ envelope, collection, projectionType, eventName }) => {
  assert.deepEqual(envelope[collection], []);
  assert.equal(envelope.source, HISTORY_SOURCE);
  assert.equal(envelope.projectionType, projectionType);
  assert.equal(envelope.eventName, eventName);
  assert.deepEqual(envelope.permissions, HISTORY_PERMISSIONS);
  assert.equal(envelope.settlementMode, 'mock');
  assert.equal(envelope.settlementTx, null);
  assert.equal(envelope.blockNumber, null);
  assert.equal(envelope.blockHash, null);
  assert.equal(envelope.eventIndex, null);
  assert.equal(envelope.explorerUrl, null);
  assert.equal(envelope.realQuaiTransactions, false);
  assert.equal(envelope.walletRequired, false);
  assert.equal(envelope.fundsMoved, false);
  assert.equal(envelope.nonceManagerMutation, false);
  assert.equal(envelope.tradingVaultMutation, false);
  assert.match(envelope.safetyNotice, /Read-only NonceManager/);
  assert.match(envelope.safetyNotice, /nonce-manager-event-projection/);
  assert.match(envelope.safetyNotice, /settlementMode: mock/);
};

test('local API + terminal UI nonce cancellation history smoke renders REST read-only NonceManager history projections', async () => {
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

    const binding = await bindNonceCancellationHistoryLocalApiSmoke({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      baseFixture: mockVerticalSliceFixture,
      render: (fixture) => {
        renderedFixtures.push(fixture);
        return renderTradeProofPanel(fixture);
      },
      onHistory: (nonceHistory) => historySnapshots.push(nonceHistory),
      onError: (error) => historyErrors.push(error),
    });

    try {
      assert.deepEqual(historyErrors, []);
      assert.equal(fetchCalls.length, 1);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['GET', '/v1/nonces/cancellations'],
        ],
      );

      assert.equal(historySnapshots.length, 1);
      assert.equal(renderedFixtures.length, 1);
      assert.equal(mount.dataset.qdxNonceCancellationSmoke, HISTORY_SOURCE);
      assert.equal(mount.dataset.qdxNonceCancellationProjection, 'NonceCancelledProjection');
      assert.equal(mount.dataset.qdxNonceCancellationRangeProjection, 'NonceRangeCancelledProjection');
      assert.equal(mount.dataset.qdxNonceCancellationRows, '0');

      const nonceHistory = historySnapshots[0];
      assertHistoryEnvelope({
        envelope: nonceHistory.cancellations,
        collection: 'cancellations',
        projectionType: 'NonceCancelledProjection',
        eventName: 'NonceCancelled',
      });
      assertHistoryEnvelope({
        envelope: nonceHistory.rangeCancellations,
        collection: 'rangeCancellations',
        projectionType: 'NonceRangeCancelledProjection',
        eventName: 'NonceRangeCancelled',
      });

      const fixture = renderedFixtures[0];
      assert.deepEqual(fixture.nonceCancellationHistory, nonceHistory);
      assert.equal(fixture.nonceCancellationHistory.cancellations.source, HISTORY_SOURCE);
      assert.equal(fixture.nonceCancellationHistory.rangeCancellations.source, HISTORY_SOURCE);

      assert.match(mount.innerHTML, /read-only nonce cancellation history/i);
      assert.match(mount.innerHTML, /nonce-manager-event-projection/);
      assert.match(mount.innerHTML, /NonceCancelledProjection/);
      assert.match(mount.innerHTML, /NonceRangeCancelledProjection/);
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
      assert.match(mount.innerHTML, /NonceManager mutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /no nonce cancellation history rows yet/i);
      assert.match(mount.innerHTML, /no nonce range cancellation history rows yet/i);
      assert.match(mount.innerHTML, /no wallet loaded, no funds moved/i);
      assert.match(mount.innerHTML, /no delegate withdrawal\/admin authority/i);

      assert.doesNotMatch(mount.innerHTML, /owner-wallet-nonce-cancel-placeholder/);
      assert.doesNotMatch(mount.innerHTML, /wallet connected for nonce cancellation/i);
      assert.doesNotMatch(mount.innerHTML, /broadcast transaction|signing request|funds moved by UI/i);
      assert.doesNotMatch(mount.innerHTML, /WITHDRAW, ADMIN/);

      assert.equal(binding.nonceHistory.cancellations.source, HISTORY_SOURCE);
    } finally {
      binding.close();
    }
  });
});
