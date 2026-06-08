import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindVaultHistoryLocalApiSmoke } from '../src/vault-history-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const HISTORY_SOURCE = 'tradingvault-event-projection';
const HISTORY_CUSTODY = 'non-custodial-contract-vault';
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

test('local API + terminal UI vault history smoke renders REST read-only TradingVault history projections', async () => {
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

    const binding = await bindVaultHistoryLocalApiSmoke({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      baseFixture: mockVerticalSliceFixture,
      render: (fixture) => {
        renderedFixtures.push(fixture);
        return renderTradeProofPanel(fixture);
      },
      onHistory: (vaultHistory) => historySnapshots.push(vaultHistory),
      onError: (error) => historyErrors.push(error),
    });

    try {
      assert.deepEqual(historyErrors, []);
      assert.equal(fetchCalls.length, 2);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['GET', '/v1/vault/deposits'],
          ['GET', '/v1/vault/withdrawals'],
        ],
      );

      assert.equal(historySnapshots.length, 1);
      assert.equal(renderedFixtures.length, 1);
      assert.equal(mount.dataset.qdxVaultHistorySmoke, HISTORY_SOURCE);
      assert.equal(mount.dataset.qdxVaultHistoryDepositProjection, 'TradingVaultDepositProjection');
      assert.equal(mount.dataset.qdxVaultHistoryWithdrawalProjection, 'TradingVaultWithdrawalProjection');
      assert.equal(mount.dataset.qdxVaultHistoryRows, '0');

      const vaultHistory = historySnapshots[0];
      assertHistoryEnvelope({
        envelope: vaultHistory.deposits,
        collection: 'deposits',
        projectionType: 'TradingVaultDepositProjection',
        eventName: 'Deposit',
      });
      assertHistoryEnvelope({
        envelope: vaultHistory.withdrawals,
        collection: 'withdrawals',
        projectionType: 'TradingVaultWithdrawalProjection',
        eventName: 'Withdraw',
      });

      const fixture = renderedFixtures[0];
      assert.deepEqual(fixture.vaultHistory, vaultHistory);
      assert.equal(fixture.vaultHistory.deposits.source, HISTORY_SOURCE);
      assert.equal(fixture.vaultHistory.withdrawals.source, HISTORY_SOURCE);

      assert.match(mount.innerHTML, /read-only vault history/i);
      assert.match(mount.innerHTML, /tradingvault-event-projection/);
      assert.match(mount.innerHTML, /TradingVaultDepositProjection/);
      assert.match(mount.innerHTML, /TradingVaultWithdrawalProjection/);
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
      assert.match(mount.innerHTML, /no vault deposit history rows yet/i);
      assert.match(mount.innerHTML, /no vault withdrawal history rows yet/i);
      assert.match(mount.innerHTML, /no wallet loaded, no funds moved/i);
      assert.match(mount.innerHTML, /no delegate withdrawal\/admin authority/i);

      assert.doesNotMatch(mount.innerHTML, /owner-wallet-vault-operation-placeholder/);
      assert.doesNotMatch(mount.innerHTML, /wallet connected for vault history/i);
      assert.doesNotMatch(mount.innerHTML, /broadcast transaction|signing request|funds moved by UI/i);
      assert.equal(binding.vaultHistory.deposits.source, HISTORY_SOURCE);
    } finally {
      binding.close();
    }
  });
});
