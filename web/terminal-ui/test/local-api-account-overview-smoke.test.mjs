import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindAccountOverviewLocalApiSmoke } from '../src/account-overview-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const repoRoot = new URL('../../../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const ACCOUNT_SOURCE = 'mock-account-overview';
const ACCOUNT_PROJECTION = 'LocalAccountOverviewProjection';
const ACCOUNT_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];

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

const assertSafeBooleans = (envelope) => {
  assert.equal(envelope.settlementMode, 'mock');
  assert.equal(envelope.realQuaiTransactions, false);
  assert.equal(envelope.walletRequired, false);
  assert.equal(envelope.fundsMoved, false);
  assert.equal(envelope.tradingVaultMutation, false);
  assert.equal(envelope.safety.noWalletLoading, true);
  assert.equal(envelope.safety.noRpcUrlAccess, true);
  assert.equal(envelope.safety.noSigning, true);
  assert.equal(envelope.safety.noBroadcast, true);
  assert.equal(envelope.safety.noDeploys, true);
  assert.equal(envelope.safety.noTransactionSubmission, true);
  assert.equal(envelope.safety.noFundsMovement, true);
  assert.equal(envelope.safety.delegateCanWithdraw, false);
  assert.equal(envelope.safety.delegateCanAdmin, false);
};

const assertAccountOverviewEnvelope = (envelope) => {
  assert.equal(envelope.account, null);
  assert.equal(envelope.source, ACCOUNT_SOURCE);
  assert.equal(envelope.projectionType, ACCOUNT_PROJECTION);
  assert.equal(envelope.custody, 'non-custodial-contract-vault');
  assert.equal(envelope.session.mode, 'mock-local-no-wallet-session');
  assert.equal(envelope.session.authenticated, false);
  assert.equal(envelope.session.walletRequired, false);
  assert.deepEqual(envelope.permissions, ACCOUNT_PERMISSIONS);
  assert.equal(envelope.balances.source, 'mock-vault-projection');
  assert.deepEqual(envelope.balances.permissions, ACCOUNT_PERMISSIONS);
  assert.deepEqual(envelope.balances.balances, []);
  assert.equal(envelope.orders.source, 'mock-order-projection');
  assert.equal(envelope.orders.matcherLocalOnly, true);
  assert.deepEqual(envelope.orders.open, []);
  assert.equal(envelope.fills.source, 'in-memory-indexer-projection');
  assert.equal(envelope.fills.projectionType, 'IndexedFillProjection');
  assert.equal(envelope.fills.confirmedOnly, true);
  assert.deepEqual(envelope.fills.items, []);
  assertSafeBooleans(envelope);
  assert.match(envelope.safety.notice, /Mock account overview only/i);
  assert.match(envelope.safety.notice, /no real Quai transaction/i);
  assert.match(envelope.safety.notice, /no wallet loaded/i);
  assert.match(envelope.safety.notice, /no funds moved/i);
  assert.match(envelope.safety.notice, /no delegate withdrawal\/admin authority/i);
};

test('local API + terminal UI account overview smoke renders REST read-only account projection', async () => {
  await withApiServer(async (baseUrl) => {
    const mount = { dataset: {}, innerHTML: '' };
    const fetchCalls = [];
    const accountSnapshots = [];
    const renderedFixtures = [];
    const accountErrors = [];

    const countedFetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), method: options.method ?? 'GET' });
      return fetch(url, options);
    };

    const binding = await bindAccountOverviewLocalApiSmoke({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      baseFixture: mockVerticalSliceFixture,
      render: (fixture) => {
        renderedFixtures.push(fixture);
        return renderTradeProofPanel(fixture);
      },
      onAccountOverview: (accountOverview) => accountSnapshots.push(accountOverview),
      onError: (error) => accountErrors.push(error),
    });

    try {
      assert.deepEqual(accountErrors, []);
      assert.deepEqual(fetchCalls.map((call) => [call.method, new URL(call.url).pathname]), [
        ['GET', '/v1/account'],
      ]);
      assert.equal(accountSnapshots.length, 1);
      assert.equal(renderedFixtures.length, 1);
      assert.equal(mount.dataset.qdxAccountOverviewSmoke, ACCOUNT_SOURCE);
      assert.equal(mount.dataset.qdxAccountOverviewProjection, ACCOUNT_PROJECTION);
      assert.equal(mount.dataset.qdxAccountOverviewBalances, '0');
      assert.equal(mount.dataset.qdxAccountOverviewOrders, '0');
      assert.equal(mount.dataset.qdxAccountOverviewFills, '0');

      const accountOverview = accountSnapshots[0];
      assertAccountOverviewEnvelope(accountOverview);

      const fixture = renderedFixtures[0];
      assert.deepEqual(fixture.accountOverview, accountOverview);
      assert.equal(fixture.accountOverview.source, ACCOUNT_SOURCE);

      assert.match(mount.innerHTML, /read-only account overview/i);
      assert.match(mount.innerHTML, /mock-account-overview/);
      assert.match(mount.innerHTML, /LocalAccountOverviewProjection/);
      assert.match(mount.innerHTML, /mock-local-no-wallet-session/);
      assert.match(mount.innerHTML, /mock-vault-projection/);
      assert.match(mount.innerHTML, /mock-order-projection/);
      assert.match(mount.innerHTML, /IndexedFillProjection/);
      assert.match(mount.innerHTML, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
      assert.match(mount.innerHTML, /settlementMode[\s\S]*mock/i);
      assert.match(mount.innerHTML, /real Quai tx[\s\S]*false/i);
      assert.match(mount.innerHTML, /wallet required[\s\S]*false/i);
      assert.match(mount.innerHTML, /funds moved[\s\S]*false/i);
      assert.match(mount.innerHTML, /TradingVault mutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /delegate can withdraw[\s\S]*false/i);
      assert.match(mount.innerHTML, /delegate can admin[\s\S]*false/i);
      assert.match(mount.innerHTML, /balance rows[\s\S]*0/i);
      assert.match(mount.innerHTML, /open orders[\s\S]*0/i);
      assert.match(mount.innerHTML, /confirmed fills[\s\S]*0/i);
      assert.match(mount.innerHTML, /no wallet loaded/i);
      assert.match(mount.innerHTML, /no funds moved/i);
      assert.match(mount.innerHTML, /no delegate withdrawal\/admin authority/i);

      assert.doesNotMatch(mount.innerHTML, /wallet connected for account/i);
      assert.doesNotMatch(mount.innerHTML, /owner wallet session loaded/i);
      assert.doesNotMatch(mount.innerHTML, /TradingVault mutation submitted/i);
      assert.doesNotMatch(mount.innerHTML, /funds moved by account overview/i);
      assert.doesNotMatch(mount.innerHTML, /broadcast transaction|signing request|rpcUrl\s*:/i);
      assert.equal(binding.accountOverview.source, ACCOUNT_SOURCE);
    } finally {
      binding.close();
    }
  });
});

test('account docs, browser app, package check, and campaign status mark the local API smoke complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const app = await readText('web/terminal-ui/src/app.js');
  const accountDoc = await readText('docs/account.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/account-overview-binding.js',
    'local API + terminal UI account overview integration smoke',
    'GET /v1/account',
    'source: mock-account-overview',
    'LocalAccountOverviewProjection',
    'mock-local-no-wallet-session',
    'mock-vault-projection',
    'mock-order-projection',
    'IndexedFillProjection',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'settlementMode: mock',
    'realQuaiTransactions: false',
    'walletRequired: false',
    'fundsMoved: false',
    'tradingVaultMutation: false',
    'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
  ]) {
    assert.ok(readme.includes(requiredText), `terminal UI README should include ${requiredText}`);
    assert.ok(accountDoc.includes(requiredText), `account docs should include ${requiredText}`);
  }

  assert.ok(
    packageJson.includes('node --check src/account-overview-binding.js'),
    'terminal UI package check should syntax-check the local API account overview binding module',
  );
  assert.ok(
    app.includes("from './account-overview-binding.js'"),
    'browser app should import the local API account overview binding',
  );
  assert.ok(
    app.includes('bindAccountOverviewLocalApiSmoke'),
    'browser app should attempt the local API account overview smoke binding',
  );
  assert.ok(
    accountDoc.includes('Local API + terminal UI account overview integration smoke complete'),
    'account docs should mark the local API account overview smoke complete',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI read-only account overview panel'),
    'campaign status should move the static terminal UI account overview panel slice to previous work',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI account overview integration smoke'),
    'campaign status should retain this local API account overview smoke slice as previous work',
  );
  assert.ok(
    status.includes('Next autonomous slice: terminal UI public kline/candle panel binding'),
    'campaign status should point next work at terminal UI public kline/candle panel binding after Python kline consumers',
  );

  assert.doesNotMatch(
    `${readme}\n${accountDoc}\n${status}`,
    /wallet connected for account|owner wallet session loaded|rpcUrl\s*:|signing key|broadcast transaction|TradingVault mutation submitted|funds moved by account overview/i,
    'account overview smoke docs/status must not claim wallet/RPC/signing/broadcast/mutation/funds behavior',
  );
});
