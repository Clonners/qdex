import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindLiveFillHistoryStreamsWithRestHistory } from '../src/fill-history-stream-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const FILL_SOURCE = 'in-memory-indexer-projection';
const FILL_HISTORY_CUSTODY = 'non-custodial';
const STREAM_CUSTODY = 'non-custodial-no-withdrawal-authority';
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

const waitFor = async (predicate, label) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`timed out waiting for ${label}`);
};

const assertFillHistoryEnvelope = ({ envelope }) => {
  assert.deepEqual(envelope.fills, []);
  assert.equal(envelope.source, FILL_SOURCE);
  assert.equal(envelope.projectionType, 'IndexedFillProjection');
  assert.equal(envelope.eventName, 'Fill');
  assert.equal(envelope.custody, FILL_HISTORY_CUSTODY);
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
};

test('local API + terminal UI fill history stream smoke renders only REST-confirmed private fill snapshots', async () => {
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

    const binding = await bindLiveFillHistoryStreamsWithRestHistory({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      WebSocketImpl: WebSocket,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onRestHistory: (fillHistory) => {
        eventOrder.push('rest');
        restSnapshots.push(fillHistory);
      },
      onStreamUpdate: (fixture) => {
        eventOrder.push(`stream:${fixture.liveStream?.channel}`);
        streamFixtures.push(fixture);
      },
      onRestError: (error) => restErrors.push(error),
      onStreamError: (error) => streamErrors.push(error),
    });

    try {
      await waitFor(
        () => streamFixtures.some((fixture) => fixture.liveStream?.channel === 'fills'),
        'REST-confirmed private fills stream render',
      );

      assert.equal(eventOrder[0], 'rest');
      assert.deepEqual(restErrors, []);
      assert.deepEqual(streamErrors, []);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['GET', '/v1/fills'],
        ],
      );

      assert.equal(restSnapshots.length, 1);
      assert.equal(mount.dataset.qdxFillHistoryRestSnapshot, FILL_SOURCE);
      assert.equal(mount.dataset.qdxFillHistoryStreams, 'fills');
      assert.equal(mount.dataset.qdxFillHistoryStreamRows, '0');

      const restHistory = restSnapshots[0];
      assertFillHistoryEnvelope({ envelope: restHistory });

      const fixture = streamFixtures.at(-1);
      assert.deepEqual(fixture.fillHistory.fills, restHistory.fills);
      assert.equal(fixture.sources.fills, FILL_SOURCE);
      assert.equal(fixture.liveStream.channel, 'fills');
      assert.equal(fixture.liveStream.source, FILL_SOURCE);
      assert.equal(fixture.liveStream.custody, STREAM_CUSTODY);
      assert.deepEqual(fixture.liveStream.permissions, FILL_PERMISSIONS);
      assert.equal(fixture.liveStream.safetyNotice, 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');

      assert.match(mount.innerHTML, /fill history/i);
      assert.match(mount.innerHTML, /in-memory-indexer-projection/);
      assert.match(mount.innerHTML, /IndexedFillProjection/);
      assert.match(mount.innerHTML, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
      assert.match(mount.innerHTML, /settlementMode[\s\S]*mock/i);
      assert.match(mount.innerHTML, /real Quai tx[\s\S]*false/i);
      assert.match(mount.innerHTML, /wallet required[\s\S]*false/i);
      assert.match(mount.innerHTML, /funds moved[\s\S]*false/i);
      assert.match(mount.innerHTML, /no wallet loaded, no funds moved/i);
      assert.doesNotMatch(mount.innerHTML, /wallet connected for fill history|broadcast transaction|signing request|funds moved by UI/i);

      assert.deepEqual(binding.fillHistory, restHistory);
    } finally {
      binding.close();
    }
  });
});
