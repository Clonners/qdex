import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindLiveFeePolicyStreamWithRestSnapshot } from '../src/fee-policy-stream-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const FEE_SOURCE = 'feemanager-policy-projection';
const STREAM_CUSTODY = 'public-read-only-no-custody';
const FEE_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];

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

const assertFeePolicyEnvelope = (envelope) => {
  assert.equal(envelope.source, FEE_SOURCE);
  assert.equal(envelope.status, 'local-only-not-deployed');
  assert.equal(envelope.custody, 'non-custodial-fee-policy');
  assert.deepEqual(envelope.permissions, FEE_PERMISSIONS);
  assert.equal(envelope.hardMaxFeeBps, 1000);
  assert.equal(envelope.feeRecipient, null);
  assert.equal(envelope.feeManagerMutation, false);
  assert.equal(envelope.tradingVaultMutation, false);
  assert.equal(envelope.realQuaiTransactions, false);
  assert.equal(envelope.walletRequired, false);
  assert.equal(envelope.fundsMoved, false);
  assert.equal(envelope.safety.noFeeAuthorityRuntimeKeys, true);
  assert.match(envelope.safety.notice, /Read-only FeeManager schedule metadata/i);
  assert.match(envelope.safety.notice, /no wallet loaded/i);
  assert.match(envelope.safety.notice, /no fee-authority key/i);
  assert.match(envelope.safety.notice, /no TradingVault mutation/i);

  assert.equal(envelope.feeSchedules.length, 1);
  const schedule = envelope.feeSchedules[0];
  assert.equal(schedule.projectionType, 'FeeScheduleProjection');
  assert.equal(schedule.eventName, 'FeesUpdated');
  assert.equal(schedule.maxFeeBps, 1000);
  assert.equal(schedule.feeRecipient, null);
  assert.equal(schedule.settlementMode, 'mock');
  assert.equal(schedule.settlementTx, null);
  assert.equal(schedule.blockNumber, null);
  assert.equal(schedule.blockHash, null);
  assert.equal(schedule.eventIndex, null);
  assert.equal(schedule.explorerUrl, null);
};

test('local API + terminal UI FeeManager stream smoke renders only REST-confirmed public fee snapshots', async () => {
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

    const binding = await bindLiveFeePolicyStreamWithRestSnapshot({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      WebSocketImpl: WebSocket,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onRestSnapshot: (feePolicy) => {
        eventOrder.push('rest');
        restSnapshots.push(feePolicy);
      },
      onStreamUpdate: (fixture) => {
        eventOrder.push(`stream:${fixture.feePolicyStream.channel}`);
        streamFixtures.push(fixture);
      },
      onRestError: (error) => restErrors.push(error),
      onStreamError: (error) => streamErrors.push(error),
    });

    try {
      await waitFor(
        () => streamFixtures.some((fixture) => fixture.feePolicyStream?.channel === 'fees'),
        'REST-confirmed public FeeManager fee schedule stream render',
      );

      assert.equal(eventOrder[0], 'rest');
      assert.deepEqual(restErrors, []);
      assert.deepEqual(streamErrors, []);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [['GET', '/v1/fees']],
      );

      assert.equal(restSnapshots.length, 1);
      assert.equal(mount.dataset.qdxFeePolicyRestSnapshot, FEE_SOURCE);
      assert.equal(mount.dataset.qdxFeePolicyStreamRestAgreement, FEE_SOURCE);
      assert.equal(mount.dataset.qdxFeePolicyStream, 'fees');
      assert.equal(mount.dataset.qdxFeePolicyStreamRows, '1');

      const restSnapshot = restSnapshots[0];
      assertFeePolicyEnvelope(restSnapshot);

      const fixture = streamFixtures.at(-1);
      assert.deepEqual(fixture.feePolicy, restSnapshot);
      assert.equal(fixture.sources.feePolicy, FEE_SOURCE);
      assert.equal(fixture.feePolicyStream.source, FEE_SOURCE);
      assert.equal(fixture.feePolicyStream.custody, STREAM_CUSTODY);
      assert.deepEqual(fixture.feePolicyStream.permissions, FEE_PERMISSIONS);
      assert.equal(fixture.feePolicyStream.projectionType, 'FeeScheduleProjection');
      assert.equal(fixture.feePolicyStream.eventName, 'FeesUpdated');
      assert.equal(fixture.feePolicyStream.hardMaxFeeBps, 1000);
      assert.equal(fixture.feePolicyStream.feeRecipient, null);
      assert.equal(fixture.feePolicyStream.settlementMode, 'mock');
      assert.equal(fixture.feePolicyStream.feeManagerMutation, false);
      assert.equal(fixture.feePolicyStream.tradingVaultMutation, false);
      assert.equal(fixture.feePolicyStream.realQuaiTransactions, false);
      assert.equal(fixture.feePolicyStream.walletRequired, false);
      assert.equal(fixture.feePolicyStream.fundsMoved, false);
      assert.equal(fixture.feePolicyStream.noFeeAuthorityRuntimeKeys, true);

      assert.match(mount.innerHTML, /live FeeManager fee schedule stream/i);
      assert.match(mount.innerHTML, /feemanager-policy-projection/);
      assert.match(mount.innerHTML, /FeeScheduleProjection/);
      assert.match(mount.innerHTML, /FeesUpdated/);
      assert.match(mount.innerHTML, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
      assert.match(mount.innerHTML, /feeManagerMutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /TradingVault mutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /real Quai tx[\s\S]*false/i);
      assert.match(mount.innerHTML, /wallet required[\s\S]*false/i);
      assert.match(mount.innerHTML, /funds moved[\s\S]*false/i);
      assert.match(mount.innerHTML, /fee-authority runtime keys[\s\S]*absent/i);
      assert.match(mount.innerHTML, /no wallet loaded/i);
      assert.match(mount.innerHTML, /no fee-authority key/i);
      assert.match(mount.innerHTML, /no TradingVault mutation/i);
      assert.doesNotMatch(mount.innerHTML, /wallet connected for fees|broadcast transaction|signing request|funds moved by UI|FeeManager mutation submitted/i);

      assert.deepEqual(binding.feePolicy, restSnapshot);
    } finally {
      binding.close();
    }
  });
});

test('terminal UI docs, package check, and campaign status mark FeeManager stream smoke complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const appSource = await readText('web/terminal-ui/src/app.js');
  const feesDoc = await readText('docs/fees.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/fee-policy-stream-binding.js',
    'local API + terminal UI FeeManager fee schedule stream integration smoke',
    'GET /v1/fees',
    '/v1/ws?channel=fees',
    'source: feemanager-policy-projection',
    'FeeScheduleProjection',
    'eventName: FeesUpdated',
    'hardMaxFeeBps: 1000',
    'feeRecipient: null',
    'REST + WebSocket agreement',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'feeManagerMutation: false',
    'tradingVaultMutation: false',
    'no fee-authority runtime keys',
    'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
  ]) {
    assert.ok(`${readme}\n${feesDoc}`.includes(requiredText), `terminal UI FeeManager stream smoke docs should include ${requiredText}`);
  }

  assert.ok(
    packageJson.includes('node --check src/fee-policy-stream-binding.js'),
    'terminal UI package check should syntax-check the FeeManager stream smoke binding',
  );
  assert.ok(
    appSource.includes('bindLiveFeePolicyStreamWithRestSnapshot'),
    'browser app should bind the REST-confirmed FeeManager stream smoke wrapper',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI binding for the FeeManager fee schedule stream'),
    'campaign status should move terminal UI FeeManager stream binding to previous work',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI FeeManager fee schedule stream integration smoke'),
    'campaign status should mark the FeeManager stream smoke as this run',
  );
  assert.ok(
    status.includes('Completed this run: Python SDK FeeManager fee schedule stream consumers'),
    'campaign status should move the next bounded slice to bot/operator FeeManager stream consumers',
  );
  assert.ok(
    status.includes('Still not approved: wallets, RPC URLs, signing, broadcasts, deploys, real token addresses, transaction helpers, live `DelegateKeyRegistry` mutation, live `FeeManager` mutation, real network `MarketRegistry` mutation, public servers, remote pushes, or funds movement.'),
    'campaign status should preserve external side-effect approval gate wording',
  );

  assert.doesNotMatch(
    `${readme}\n${feesDoc}\n${status}`,
    /feeAuthorityKey|rpcUrl\s*:|signing key|broadcast transaction|FeeManager mutation submitted|funds moved by UI/i,
    'FeeManager fee stream smoke docs/status must not claim wallet/RPC/signing/broadcast/mutation/funds behavior',
  );
});
