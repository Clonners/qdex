import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindLiveDelegateKeyHistoryStreamsWithRestHistory } from '../src/delegate-key-history-stream-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const HISTORY_SOURCE = 'delegatekeyregistry-event-projection';
const HISTORY_CUSTODY = 'non-custodial-no-withdrawal-authority';
const STREAM_CUSTODY = 'non-custodial-no-withdrawal-authority';
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

test('local API + terminal UI delegate-key history stream smoke renders only REST-confirmed private history snapshots', async () => {
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

    const binding = await bindLiveDelegateKeyHistoryStreamsWithRestHistory({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      WebSocketImpl: WebSocket,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onRestHistory: (delegateKeyHistory) => {
        eventOrder.push('rest');
        restSnapshots.push(delegateKeyHistory);
      },
      onStreamUpdate: (fixture) => {
        eventOrder.push(`stream:${fixture.delegateKeyHistoryStream.channels.join(',')}`);
        streamFixtures.push(fixture);
      },
      onRestError: (error) => restErrors.push(error),
      onStreamError: (error) => streamErrors.push(error),
    });

    try {
      await waitFor(
        () => streamFixtures.some((fixture) => fixture.delegateKeyHistoryStream?.channels?.join(',') === 'delegate-key-registrations,delegate-key-revocations'),
        'REST-confirmed private delegate-key registration and revocation stream render',
      );

      assert.equal(eventOrder[0], 'rest');
      assert.deepEqual(restErrors, []);
      assert.deepEqual(streamErrors, []);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['GET', '/v1/delegate-keys/registrations'],
          ['GET', '/v1/delegate-keys/revocations'],
        ],
      );

      assert.equal(restSnapshots.length, 1);
      assert.equal(mount.dataset.qdxDelegateKeyHistoryRestSnapshot, HISTORY_SOURCE);
      assert.equal(mount.dataset.qdxDelegateKeyHistoryStreamRestAgreement, HISTORY_SOURCE);
      assert.equal(mount.dataset.qdxDelegateKeyHistoryStreams, 'delegate-key-registrations,delegate-key-revocations');
      assert.equal(mount.dataset.qdxDelegateKeyHistoryStreamRows, '0');

      const restHistory = restSnapshots[0];
      assertHistoryEnvelope({
        envelope: restHistory.registrations,
        collection: 'registrations',
        projectionType: 'DelegateKeyRegisteredProjection',
        eventName: 'DelegateKeyRegistered',
      });
      assertHistoryEnvelope({
        envelope: restHistory.revocations,
        collection: 'revocations',
        projectionType: 'DelegateKeyRevokedProjection',
        eventName: 'DelegateKeyRevoked',
      });

      const fixture = streamFixtures.at(-1);
      assert.deepEqual(fixture.delegateKeyHistory.registrations, restHistory.registrations);
      assert.deepEqual(fixture.delegateKeyHistory.revocations, restHistory.revocations);
      assert.equal(fixture.sources.delegateKeyHistory, HISTORY_SOURCE);
      assert.equal(fixture.delegateKeyHistoryStream.source, HISTORY_SOURCE);
      assert.equal(fixture.delegateKeyHistoryStream.custody, STREAM_CUSTODY);
      assert.deepEqual(fixture.delegateKeyHistoryStream.permissions, HISTORY_PERMISSIONS);
      assert.equal(fixture.delegateKeyHistoryStream.settlementMode, 'mock');
      assert.equal(fixture.delegateKeyHistoryStream.delegateCanWithdraw, false);
      assert.equal(fixture.delegateKeyHistoryStream.delegateCanAdmin, false);
      assert.equal(fixture.delegateKeyHistoryStream.realQuaiTransactions, false);
      assert.equal(fixture.delegateKeyHistoryStream.walletRequired, false);
      assert.equal(fixture.delegateKeyHistoryStream.fundsMoved, false);
      assert.equal(fixture.delegateKeyHistoryStream.tradingVaultMutation, false);
      assert.equal(fixture.delegateKeyHistoryStream.delegateKeyRegistryMutation, false);

      assert.match(mount.innerHTML, /live delegate\/API key history streams/i);
      assert.match(mount.innerHTML, /delegatekeyregistry-event-projection/);
      assert.match(mount.innerHTML, /DelegateKeyRegisteredProjection/);
      assert.match(mount.innerHTML, /DelegateKeyRevokedProjection/);
      assert.match(mount.innerHTML, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
      assert.match(mount.innerHTML, /settlementMode[\s\S]*mock/i);
      assert.match(mount.innerHTML, /delegate can withdraw[\s\S]*false/i);
      assert.match(mount.innerHTML, /delegate can admin[\s\S]*false/i);
      assert.match(mount.innerHTML, /real Quai tx[\s\S]*false/i);
      assert.match(mount.innerHTML, /wallet required[\s\S]*false/i);
      assert.match(mount.innerHTML, /funds moved[\s\S]*false/i);
      assert.match(mount.innerHTML, /TradingVault mutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /DelegateKeyRegistry mutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /no wallet loaded/i);
      assert.match(mount.innerHTML, /no live DelegateKeyRegistry mutation, no funds moved/i);
      assert.match(mount.innerHTML, /no delegate withdrawal\/admin authority/i);
      assert.doesNotMatch(mount.innerHTML, /wallet connected for delegate-key history|broadcast transaction|signing request|funds moved by UI/i);

      assert.deepEqual(binding.delegateKeyHistory, restHistory);
    } finally {
      binding.close();
    }
  });
});

test('terminal UI docs, package check, and campaign status mark delegate-key history stream smoke complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const status = await readText('CAMPAIGN_STATUS.md');
  const delegateDoc = await readText('docs/delegate-keys.md');
  const plan = await readText('docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md');

  for (const requiredText of [
    'src/delegate-key-history-stream-binding.js',
    'local API + terminal UI DelegateKeyRegistry history stream integration smoke',
    'GET /v1/delegate-keys/registrations',
    'GET /v1/delegate-keys/revocations',
    '/v1/ws?channel=delegate-key-registrations',
    '/v1/ws?channel=delegate-key-revocations',
    'source: delegatekeyregistry-event-projection',
    'DelegateKeyRegisteredProjection',
    'DelegateKeyRevokedProjection',
    'REST + WebSocket agreement',
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
    packageJson.includes('node --check src/delegate-key-history-stream-binding.js'),
    'terminal UI package check should syntax-check the delegate-key history stream smoke binding',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI private DelegateKeyRegistry history stream binding'),
    'campaign status should move the terminal UI delegate-key stream binding checkpoint to previous work',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI DelegateKeyRegistry history stream integration smoke'),
    'campaign status should retain the local API + terminal UI delegate-key stream smoke as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: read-only TypeScript SDK and `qdex` CLI DelegateKeyRegistry history stream consumers'),
    'campaign status should retain the TypeScript/qdex DelegateKeyRegistry stream consumers as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: Python SDK DelegateKeyRegistry history stream consumers'),
    'campaign status should retain Python SDK delegate-key history stream consumers',
  );
  assert.ok(
    status.includes('Completed this run: read-only FeeManager fee schedule API envelope'),
    'campaign status should checkpoint the FeeManager fee policy API slice',
  );
  assert.ok(
    delegateDoc.includes('Completed local/source-only stream smoke: `web/terminal-ui/src/delegate-key-history-stream-binding.js`'),
    'delegate-key docs should mark the stream smoke binding complete',
  );
  assert.ok(
    plan.includes('Completed: local API + terminal UI DelegateKeyRegistry history stream integration smoke'),
    'post-delegate readiness plan should mark the stream smoke complete',
  );
  assert.doesNotMatch(
    `${readme}\n${status}\n${delegateDoc}\n${plan}`,
    /walletPrivateKey|rpcUrl\s*:|signing key|broadcast transaction|funds moved by UI/i,
    'delegate-key history stream smoke docs/status must not claim wallet/RPC/signing/broadcast/funds behavior',
  );
});
