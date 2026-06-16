import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindLiveNonceCancellationStreamsWithRestHistory } from '../src/nonce-cancellation-history-stream-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const HISTORY_SOURCE = 'nonce-manager-event-projection';
const HISTORY_CUSTODY = 'non-custodial-no-withdrawal-authority';
const STREAM_CUSTODY = 'non-custodial-no-withdrawal-authority';
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

const waitFor = async (predicate, label) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`timed out waiting for ${label}`);
};

const assertNonceHistoryEnvelope = ({ envelope, collection, projectionType, eventName }) => {
  assert.deepEqual(envelope[collection], []);
  assert.equal(envelope.source, HISTORY_SOURCE);
  assert.equal(envelope.projectionType, projectionType);
  assert.equal(envelope.eventName, eventName);
  assert.equal(envelope.custody, HISTORY_CUSTODY);
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
  assert.equal(envelope.tradingVaultMutation, false);
  assert.equal(envelope.nonceManagerMutation, false);
  assert.match(envelope.safetyNotice, /Read-only NonceManager/);
  assert.match(envelope.safetyNotice, /nonce-manager-event-projection/);
  assert.match(envelope.safetyNotice, /settlementMode[:\s]+mock/);
};

test('local API + terminal UI nonce cancellation history stream smoke renders only REST-confirmed private history snapshots', async () => {
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

    const binding = await bindLiveNonceCancellationStreamsWithRestHistory({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      WebSocketImpl: WebSocket,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onRestHistory: (nonceHistory) => {
        eventOrder.push('rest');
        restSnapshots.push(nonceHistory);
      },
      onStreamUpdate: (fixture) => {
        eventOrder.push(`stream:${fixture.nonceCancellationHistoryStream.channels.join(',')}`);
        streamFixtures.push(fixture);
      },
      onRestError: (error) => restErrors.push(error),
      onStreamError: (error) => streamErrors.push(error),
    });

    try {
      await waitFor(
        () => streamFixtures.some((fixture) => fixture.nonceCancellationHistoryStream?.channels?.join(',') === 'nonce-cancellations'),
        'REST-confirmed private nonce-cancellations stream render',
      );

      assert.equal(eventOrder[0], 'rest');
      assert.deepEqual(restErrors, []);
      assert.deepEqual(streamErrors, []);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['GET', '/v1/nonces/cancellations'],
        ],
      );

      assert.equal(restSnapshots.length, 1);
      assert.equal(mount.dataset.qdxNonceCancellationRestSnapshot, HISTORY_SOURCE);
      assert.equal(mount.dataset.qdxNonceCancellationStreamRestAgreement, HISTORY_SOURCE);
      assert.equal(mount.dataset.qdxNonceCancellationStreams, 'nonce-cancellations');
      assert.equal(mount.dataset.qdxNonceCancellationStreamRows, '0');

      const restHistory = restSnapshots[0];
      assertNonceHistoryEnvelope({
        envelope: restHistory.cancellations,
        collection: 'cancellations',
        projectionType: 'NonceCancelledProjection',
        eventName: 'NonceCancelled',
      });

      const fixture = streamFixtures.at(-1);
      assert.deepEqual(fixture.nonceCancellationHistory.cancellations, restHistory.cancellations);
      assert.equal(fixture.sources.nonceCancellationHistory, HISTORY_SOURCE);
      assert.equal(fixture.nonceCancellationHistoryStream.source, HISTORY_SOURCE);
      assert.equal(fixture.nonceCancellationHistoryStream.custody, STREAM_CUSTODY);
      assert.deepEqual(fixture.nonceCancellationHistoryStream.permissions, HISTORY_PERMISSIONS);
      assert.equal(fixture.nonceCancellationHistoryStream.settlementMode, 'mock');
      assert.equal(fixture.nonceCancellationHistoryStream.realQuaiTransactions, false);
      assert.equal(fixture.nonceCancellationHistoryStream.walletRequired, false);
      assert.equal(fixture.nonceCancellationHistoryStream.fundsMoved, false);
      assert.equal(fixture.nonceCancellationHistoryStream.tradingVaultMutation, false);
      assert.equal(fixture.nonceCancellationHistoryStream.nonceManagerMutation, false);

      assert.match(mount.innerHTML, /nonce cancellation/i);
      assert.match(mount.innerHTML, /nonce-manager-event-projection/);
      assert.match(mount.innerHTML, /NonceCancelledProjection/);
      assert.match(mount.innerHTML, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
      assert.match(mount.innerHTML, /settlementMode[\s\S]*mock/i);
      assert.match(mount.innerHTML, /real Quai tx[\s\S]*false/i);
      assert.match(mount.innerHTML, /wallet required[\s\S]*false/i);
      assert.match(mount.innerHTML, /funds moved[\s\S]*false/i);
      assert.match(mount.innerHTML, /no wallet loaded, no funds moved/i);
      assert.doesNotMatch(mount.innerHTML, /wallet connected for nonce cancellation|broadcast nonce cancellation|signing nonce cancellation|funds moved by nonce cancellation UI/i);

      assert.deepEqual(binding.nonceHistory, restHistory);
    } finally {
      binding.close();
    }
  });
});
