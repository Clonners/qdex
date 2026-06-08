import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindDelegateKeyHistoryLocalApiSmoke } from '../src/delegate-key-history-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const HISTORY_SOURCE = 'delegatekeyregistry-event-projection';
const HISTORY_CUSTODY = 'non-custodial-no-withdrawal-authority';
const HISTORY_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];

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
  assert.equal(envelope.delegateCanWithdraw, false);
  assert.equal(envelope.delegateCanAdmin, false);
  assert.equal(envelope.realQuaiTransactions, false);
  assert.equal(envelope.walletRequired, false);
  assert.equal(envelope.fundsMoved, false);
  assert.equal(envelope.tradingVaultMutation, false);
  assert.equal(envelope.delegateKeyRegistryMutation, false);
  assert.match(envelope.safetyNotice, new RegExp(`Read-only DelegateKeyRegistry ${eventName} history projection`));
  assert.match(envelope.safetyNotice, /no real Quai transaction, no wallet loaded/i);
  assert.match(envelope.safetyNotice, /no live DelegateKeyRegistry mutation, no funds moved/i);
  assert.match(envelope.safetyNotice, /no delegate withdrawal\/admin authority/i);
};

test('local API + terminal UI delegate-key history smoke renders REST read-only DelegateKeyRegistry event projections', async () => {
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

    const binding = await bindDelegateKeyHistoryLocalApiSmoke({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      baseFixture: mockVerticalSliceFixture,
      render: (fixture) => {
        renderedFixtures.push(fixture);
        return renderTradeProofPanel(fixture);
      },
      onHistory: (delegateKeyHistory) => historySnapshots.push(delegateKeyHistory),
      onError: (error) => historyErrors.push(error),
    });

    try {
      assert.deepEqual(historyErrors, []);
      assert.equal(fetchCalls.length, 2);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['GET', '/v1/delegate-keys/registrations'],
          ['GET', '/v1/delegate-keys/revocations'],
        ],
      );

      assert.equal(historySnapshots.length, 1);
      assert.equal(renderedFixtures.length, 1);
      assert.equal(mount.dataset.qdxDelegateKeyHistorySmoke, HISTORY_SOURCE);
      assert.equal(mount.dataset.qdxDelegateKeyHistoryRegistrationProjection, 'DelegateKeyRegisteredProjection');
      assert.equal(mount.dataset.qdxDelegateKeyHistoryRevocationProjection, 'DelegateKeyRevokedProjection');
      assert.equal(mount.dataset.qdxDelegateKeyHistoryRows, '0');

      const delegateKeyHistory = historySnapshots[0];
      assertHistoryEnvelope({
        envelope: delegateKeyHistory.registrations,
        collection: 'registrations',
        projectionType: 'DelegateKeyRegisteredProjection',
        eventName: 'DelegateKeyRegistered',
      });
      assertHistoryEnvelope({
        envelope: delegateKeyHistory.revocations,
        collection: 'revocations',
        projectionType: 'DelegateKeyRevokedProjection',
        eventName: 'DelegateKeyRevoked',
      });

      const fixture = renderedFixtures[0];
      assert.deepEqual(fixture.delegateKeyHistory, delegateKeyHistory);
      assert.equal(fixture.delegateKeyHistory.registrations.source, HISTORY_SOURCE);
      assert.equal(fixture.delegateKeyHistory.revocations.source, HISTORY_SOURCE);

      assert.match(mount.innerHTML, /read-only delegate\/API key history/i);
      assert.match(mount.innerHTML, /delegatekeyregistry-event-projection/);
      assert.match(mount.innerHTML, /DelegateKeyRegisteredProjection/);
      assert.match(mount.innerHTML, /DelegateKeyRevokedProjection/);
      assert.match(mount.innerHTML, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
      assert.match(mount.innerHTML, /settlementMode[\s\S]*mock/i);
      assert.match(mount.innerHTML, /settlement tx[\s\S]*null \(mock\)/i);
      assert.match(mount.innerHTML, /block[\s\S]*null \(mock\)/i);
      assert.match(mount.innerHTML, /event index[\s\S]*null \(mock\)/i);
      assert.match(mount.innerHTML, /explorer[\s\S]*null \(mock\)/i);
      assert.match(mount.innerHTML, /delegate can withdraw[\s\S]*false/i);
      assert.match(mount.innerHTML, /delegate can admin[\s\S]*false/i);
      assert.match(mount.innerHTML, /real Quai tx[\s\S]*false/i);
      assert.match(mount.innerHTML, /wallet required[\s\S]*false/i);
      assert.match(mount.innerHTML, /funds moved[\s\S]*false/i);
      assert.match(mount.innerHTML, /TradingVault mutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /DelegateKeyRegistry mutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /no delegate-key registration history rows yet/i);
      assert.match(mount.innerHTML, /no delegate-key revocation history rows yet/i);
      assert.match(mount.innerHTML, /no wallet loaded/i);
      assert.match(mount.innerHTML, /no live DelegateKeyRegistry mutation, no funds moved/i);
      assert.match(mount.innerHTML, /no delegate withdrawal\/admin authority/i);

      assert.doesNotMatch(mount.innerHTML, /delegate-key-owner-signed-prepare-boundary/);
      assert.doesNotMatch(mount.innerHTML, /wallet connected for delegate-key history/i);
      assert.doesNotMatch(mount.innerHTML, /broadcast transaction|signing request|funds moved by UI/i);
      assert.equal(binding.delegateKeyHistory.registrations.source, HISTORY_SOURCE);
    } finally {
      binding.close();
    }
  });
});

test('terminal UI docs, package check, and campaign status mark delegate-key history REST smoke complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const status = await readText('CAMPAIGN_STATUS.md');
  const delegateDoc = await readText('docs/delegate-keys.md');
  const plan = await readText('docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md');

  for (const requiredText of [
    'src/delegate-key-history-binding.js',
    'local API + terminal UI delegate-key history smoke',
    'GET /v1/delegate-keys/registrations',
    'GET /v1/delegate-keys/revocations',
    'source: delegatekeyregistry-event-projection',
    'DelegateKeyRegisteredProjection',
    'DelegateKeyRevokedProjection',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'settlementMode: mock',
    'delegateCanWithdraw: false',
    'delegateCanAdmin: false',
    'delegateKeyRegistryMutation: false',
    'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
  ]) {
    assert.ok(readme.includes(requiredText), `terminal UI README should include ${requiredText}`);
  }

  assert.ok(
    packageJson.includes('node --check src/delegate-key-history-binding.js'),
    'terminal UI package check should syntax-check the delegate-key history REST smoke binding',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI read-only delegate-key history panel'),
    'campaign status should move the static panel checkpoint to previous work',
  );
  assert.ok(
    status.includes('Completed this run: local API + terminal UI delegate-key history integration smoke'),
    'campaign status should record the delegate-key history REST smoke as this run',
  );
  assert.ok(
    status.includes('Next autonomous slice: private DelegateKeyRegistry registration/revocation WebSocket snapshot alignment'),
    'campaign status should point to the next local/source-only delegate-key history stream boundary',
  );
  assert.ok(
    delegateDoc.includes('Completed local/source-only smoke: `web/terminal-ui/src/delegate-key-history-binding.js`'),
    'delegate-key docs should mark the REST smoke binding complete',
  );
  assert.ok(
    plan.includes('Completed: local API + terminal UI delegate-key history integration smoke'),
    'post-delegate readiness plan should mark the REST smoke binding complete',
  );
  assert.doesNotMatch(
    `${readme}\n${status}\n${delegateDoc}\n${plan}`,
    /walletPrivateKey|rpcUrl\s*:|signing key|broadcast transaction|funds moved by UI/i,
    'delegate-key history smoke docs/status must not claim wallet/RPC/signing/broadcast/funds behavior',
  );
});
