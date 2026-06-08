import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindLiveVaultHistoryStreamsWithRestHistory } from '../src/vault-history-stream-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const HISTORY_SOURCE = 'tradingvault-event-projection';
const HISTORY_CUSTODY = 'non-custodial-contract-vault';
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

const assertHistoryEnvelope = ({ envelope, collection, projectionType, eventName }) => {
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
  assert.match(envelope.safetyNotice, new RegExp(`Read-only TradingVault ${eventName} history projection`));
  assert.match(envelope.safetyNotice, /no real Quai transaction, no wallet loaded, no funds moved/i);
  assert.match(envelope.safetyNotice, /no delegate withdrawal\/admin authority/i);
};

test('local API + terminal UI vault history stream smoke renders only REST-confirmed private history snapshots', async () => {
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

    const binding = await bindLiveVaultHistoryStreamsWithRestHistory({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      WebSocketImpl: WebSocket,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onRestHistory: (vaultHistory) => {
        eventOrder.push('rest');
        restSnapshots.push(vaultHistory);
      },
      onStreamUpdate: (fixture) => {
        eventOrder.push(`stream:${fixture.vaultHistoryStream.channels.join(',')}`);
        streamFixtures.push(fixture);
      },
      onRestError: (error) => restErrors.push(error),
      onStreamError: (error) => streamErrors.push(error),
    });

    try {
      await waitFor(
        () => streamFixtures.some((fixture) => fixture.vaultHistoryStream?.channels?.join(',') === 'deposits,withdrawals'),
        'REST-confirmed private deposit and withdrawal stream render',
      );

      assert.equal(eventOrder[0], 'rest');
      assert.deepEqual(restErrors, []);
      assert.deepEqual(streamErrors, []);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['GET', '/v1/vault/deposits'],
          ['GET', '/v1/vault/withdrawals'],
        ],
      );

      assert.equal(restSnapshots.length, 1);
      assert.equal(mount.dataset.qdxVaultHistoryRestSnapshot, HISTORY_SOURCE);
      assert.equal(mount.dataset.qdxVaultHistoryStreamRestAgreement, HISTORY_SOURCE);
      assert.equal(mount.dataset.qdxVaultHistoryStreams, 'deposits,withdrawals');
      assert.equal(mount.dataset.qdxVaultHistoryStreamRows, '0');

      const restHistory = restSnapshots[0];
      assertHistoryEnvelope({
        envelope: restHistory.deposits,
        collection: 'deposits',
        projectionType: 'TradingVaultDepositProjection',
        eventName: 'Deposit',
      });
      assertHistoryEnvelope({
        envelope: restHistory.withdrawals,
        collection: 'withdrawals',
        projectionType: 'TradingVaultWithdrawalProjection',
        eventName: 'Withdraw',
      });

      const fixture = streamFixtures.at(-1);
      assert.deepEqual(fixture.vaultHistory.deposits, restHistory.deposits);
      assert.deepEqual(fixture.vaultHistory.withdrawals, restHistory.withdrawals);
      assert.equal(fixture.sources.vaultHistory, HISTORY_SOURCE);
      assert.equal(fixture.vaultHistoryStream.source, HISTORY_SOURCE);
      assert.equal(fixture.vaultHistoryStream.custody, STREAM_CUSTODY);
      assert.deepEqual(fixture.vaultHistoryStream.permissions, HISTORY_PERMISSIONS);
      assert.equal(fixture.vaultHistoryStream.settlementMode, 'mock');
      assert.equal(fixture.vaultHistoryStream.realQuaiTransactions, false);
      assert.equal(fixture.vaultHistoryStream.walletRequired, false);
      assert.equal(fixture.vaultHistoryStream.fundsMoved, false);
      assert.equal(fixture.vaultHistoryStream.tradingVaultMutation, false);

      assert.match(mount.innerHTML, /live vault history streams/i);
      assert.match(mount.innerHTML, /tradingvault-event-projection/);
      assert.match(mount.innerHTML, /TradingVaultDepositProjection/);
      assert.match(mount.innerHTML, /TradingVaultWithdrawalProjection/);
      assert.match(mount.innerHTML, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
      assert.match(mount.innerHTML, /settlementMode[\s\S]*mock/i);
      assert.match(mount.innerHTML, /real Quai tx[\s\S]*false/i);
      assert.match(mount.innerHTML, /wallet required[\s\S]*false/i);
      assert.match(mount.innerHTML, /funds moved[\s\S]*false/i);
      assert.match(mount.innerHTML, /TradingVault mutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /no wallet loaded, no funds moved/i);
      assert.match(mount.innerHTML, /no delegate withdrawal\/admin authority/i);
      assert.doesNotMatch(mount.innerHTML, /wallet connected for vault history|broadcast transaction|signing request|funds moved by UI/i);

      assert.deepEqual(binding.vaultHistory, restHistory);
    } finally {
      binding.close();
    }
  });
});
