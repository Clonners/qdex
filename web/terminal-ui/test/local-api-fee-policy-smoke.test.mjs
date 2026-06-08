import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindFeePolicyLocalApiSmoke } from '../src/fee-policy-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const repoRoot = new URL('../../../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const FEE_SOURCE = 'feemanager-policy-projection';
const FEE_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];

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

const assertFeePolicyEnvelope = (envelope) => {
  assert.equal(envelope.source, FEE_SOURCE);
  assert.equal(envelope.status, 'local-only-not-deployed');
  assert.equal(envelope.custody, 'non-custodial-fee-policy');
  assert.deepEqual(envelope.permissions, FEE_PERMISSIONS);
  assert.equal(envelope.hardMaxFeeBps, 1000);
  assert.equal(envelope.feeRecipient, null);
  assert.equal(envelope.feeManagerMutation, false);
  assert.equal(envelope.realQuaiTransactions, false);
  assert.equal(envelope.walletRequired, false);
  assert.equal(envelope.fundsMoved, false);
  assert.equal(envelope.tradingVaultMutation, false);

  assert.equal(envelope.feeSchedules.length, 1);
  assert.deepEqual(
    envelope.feeSchedules[0],
    {
      marketId: 'QI-QUAI',
      projectionType: 'FeeScheduleProjection',
      eventName: 'FeesUpdated',
      makerFeeBps: 0,
      takerFeeBps: 0,
      maxFeeBps: 1000,
      feeRecipient: null,
      settlementMode: 'mock',
      settlementTx: null,
      blockNumber: null,
      blockHash: null,
      eventIndex: null,
      explorerUrl: null,
    },
  );
  assert.equal(envelope.safety.noWalletLoading, true);
  assert.equal(envelope.safety.noRpcUrlAccess, true);
  assert.equal(envelope.safety.noSigning, true);
  assert.equal(envelope.safety.noBroadcast, true);
  assert.equal(envelope.safety.noDeploys, true);
  assert.equal(envelope.safety.noTransactionSubmission, true);
  assert.equal(envelope.safety.noFundsMovement, true);
  assert.equal(envelope.safety.noFeeAuthorityRuntimeKeys, true);
  assert.match(envelope.safety.notice, /Read-only FeeManager schedule metadata/i);
  assert.match(envelope.safety.notice, /no fee-authority key/i);
};

test('local API + terminal UI FeeManager fee schedule smoke renders REST read-only policy projection', async () => {
  await withApiServer(async (baseUrl) => {
    const mount = { dataset: {}, innerHTML: '' };
    const fetchCalls = [];
    const feeSnapshots = [];
    const renderedFixtures = [];
    const feeErrors = [];

    const countedFetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), method: options.method ?? 'GET' });
      return fetch(url, options);
    };

    const binding = await bindFeePolicyLocalApiSmoke({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      baseFixture: mockVerticalSliceFixture,
      render: (fixture) => {
        renderedFixtures.push(fixture);
        return renderTradeProofPanel(fixture);
      },
      onFeePolicy: (feePolicy) => feeSnapshots.push(feePolicy),
      onError: (error) => feeErrors.push(error),
    });

    try {
      assert.deepEqual(feeErrors, []);
      assert.equal(fetchCalls.length, 1);
      assert.deepEqual(fetchCalls.map((call) => [call.method, new URL(call.url).pathname]), [
        ['GET', '/v1/fees'],
      ]);

      assert.equal(feeSnapshots.length, 1);
      assert.equal(renderedFixtures.length, 1);
      assert.equal(mount.dataset.qdxFeePolicySmoke, FEE_SOURCE);
      assert.equal(mount.dataset.qdxFeePolicyProjection, 'FeeScheduleProjection');
      assert.equal(mount.dataset.qdxFeePolicyRows, '1');

      const feePolicy = feeSnapshots[0];
      assertFeePolicyEnvelope(feePolicy);

      const fixture = renderedFixtures[0];
      assert.deepEqual(fixture.feePolicy, feePolicy);
      assert.equal(fixture.feePolicy.source, FEE_SOURCE);

      assert.match(mount.innerHTML, /read-only FeeManager fee schedule/i);
      assert.match(mount.innerHTML, /feemanager-policy-projection/);
      assert.match(mount.innerHTML, /FeeScheduleProjection/);
      assert.match(mount.innerHTML, /FeesUpdated/);
      assert.match(mount.innerHTML, /QI-QUAI/);
      assert.match(mount.innerHTML, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
      assert.match(mount.innerHTML, /hard max fee bps[\s\S]*1000/i);
      assert.match(mount.innerHTML, /fee recipient[\s\S]*null \(local\/mock\)/i);
      assert.match(mount.innerHTML, /settlementMode[\s\S]*mock/i);
      assert.match(mount.innerHTML, /settlement tx[\s\S]*null \(local\/mock\)/i);
      assert.match(mount.innerHTML, /block[\s\S]*null \(local\/mock\)/i);
      assert.match(mount.innerHTML, /event index[\s\S]*null \(local\/mock\)/i);
      assert.match(mount.innerHTML, /explorer[\s\S]*null \(local\/mock\)/i);
      assert.match(mount.innerHTML, /feeManagerMutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /TradingVault mutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /real Quai tx[\s\S]*false/i);
      assert.match(mount.innerHTML, /wallet required[\s\S]*false/i);
      assert.match(mount.innerHTML, /funds moved[\s\S]*false/i);
      assert.match(mount.innerHTML, /no wallet loaded/i);
      assert.match(mount.innerHTML, /no fee-authority key/i);
      assert.match(mount.innerHTML, /no TradingVault mutation/i);

      assert.doesNotMatch(mount.innerHTML, /FeeManager\.updateFees submitted/i);
      assert.doesNotMatch(mount.innerHTML, /fee authority key loaded/i);
      assert.doesNotMatch(mount.innerHTML, /wallet connected for fees/i);
      assert.doesNotMatch(mount.innerHTML, /broadcast transaction|signing request|funds moved by UI/i);
      assert.equal(binding.feePolicy.source, FEE_SOURCE);
    } finally {
      binding.close();
    }
  });
});

test('fee policy docs, app binding, package check, and campaign status mark the local API smoke complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const app = await readText('web/terminal-ui/src/app.js');
  const feesDoc = await readText('docs/fees.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/fee-policy-binding.js',
    'local API + terminal UI FeeManager fee schedule integration smoke',
    'GET /v1/fees',
    'source: feemanager-policy-projection',
    'FeeScheduleProjection',
    'eventName: FeesUpdated',
    'hardMaxFeeBps: 1000',
    'feeRecipient: null',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'feeManagerMutation: false',
    'tradingVaultMutation: false',
    'realQuaiTransactions: false',
    'walletRequired: false',
    'fundsMoved: false',
    'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
  ]) {
    assert.ok(readme.includes(requiredText), `terminal UI README should include ${requiredText}`);
    assert.ok(feesDoc.includes(requiredText), `fees docs should include ${requiredText}`);
  }

  assert.ok(
    packageJson.includes('node --check src/fee-policy-binding.js'),
    'terminal UI package check should syntax-check the local API FeeManager binding module',
  );
  assert.ok(
    app.includes("from './fee-policy-binding.js'"),
    'browser app should import the local API FeeManager binding',
  );
  assert.ok(
    app.includes('bindFeePolicyLocalApiSmoke'),
    'browser app should attempt the local API FeeManager smoke binding',
  );
  assert.ok(
    feesDoc.includes('Local API + terminal UI FeeManager fee schedule integration smoke complete'),
    'fees docs should mark the local API FeeManager smoke complete',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI read-only FeeManager fee schedule exposure'),
    'campaign status should move the static terminal UI FeeManager panel slice to previous work',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI FeeManager fee schedule integration smoke'),
    'campaign status should retain this local API FeeManager smoke slice as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: read-only FeeManager fee schedule WebSocket snapshot alignment'),
    'campaign status should checkpoint the read-only FeeManager stream alignment slice',
  );
  assert.ok(
    status.includes('Next autonomous slice: local API + terminal UI FeeManager fee schedule stream integration smoke'),
    'campaign status should advance to terminal UI binding for the FeeManager stream',
  );

  assert.doesNotMatch(
    `${readme}\n${feesDoc}\n${status}`,
    /feeAuthorityKey|rpcUrl\s*:|signing key|broadcast transaction|FeeManager mutation submitted|funds moved by UI/i,
    'FeeManager smoke docs/status must not claim wallet/RPC/signing/broadcast/mutation/funds behavior',
  );
});
