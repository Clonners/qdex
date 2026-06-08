import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  createMockAccountOverviewFixture,
  normalizeAccountOverviewPanelFixture,
} from '../src/account-overview-panel.js';
import { renderTradeProofPanel } from '../src/render.js';

const repoRoot = new URL('../../../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const requiredSafetyFields = Object.freeze({
  account: null,
  source: 'mock-account-overview',
  custody: 'non-custodial-contract-vault',
  permissions: Object.freeze(['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']),
  settlementMode: 'mock',
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
});

test('mock terminal UI fixture carries the read-only local account overview envelope', () => {
  assert.ok(mockVerticalSliceFixture.accountOverview, 'static fixture should carry GET /v1/account overview metadata');

  const normalized = normalizeAccountOverviewPanelFixture(mockVerticalSliceFixture.accountOverview);

  for (const [key, expected] of Object.entries(requiredSafetyFields)) {
    assert.deepEqual(normalized[key], expected, `${key} should preserve the account overview safety envelope`);
  }

  assert.equal(normalized.projectionType, 'LocalAccountOverviewProjection');
  assert.equal(normalized.session.mode, 'mock-local-no-wallet-session');
  assert.equal(normalized.session.authenticated, false);
  assert.equal(normalized.session.walletRequired, false);
  assert.equal(normalized.balances.source, 'mock-vault-projection');
  assert.deepEqual(normalized.balances.balances, []);
  assert.equal(normalized.orders.source, 'mock-order-projection');
  assert.equal(normalized.orders.matcherLocalOnly, true);
  assert.deepEqual(normalized.orders.open, []);
  assert.equal(normalized.fills.source, 'in-memory-indexer-projection');
  assert.equal(normalized.fills.projectionType, 'IndexedFillProjection');
  assert.equal(normalized.fills.confirmedOnly, true);
  assert.deepEqual(normalized.fills.items, []);
  assert.equal(normalized.safety.noWalletLoading, true);
  assert.equal(normalized.safety.noRpcUrlAccess, true);
  assert.equal(normalized.safety.noSigning, true);
  assert.equal(normalized.safety.noBroadcast, true);
  assert.equal(normalized.safety.noDeploys, true);
  assert.equal(normalized.safety.noTransactionSubmission, true);
  assert.equal(normalized.safety.noFundsMovement, true);
  assert.equal(normalized.safety.delegateCanWithdraw, false);
  assert.equal(normalized.safety.delegateCanAdmin, false);
  assert.match(normalized.safety.notice, /Mock account overview only/i);
  assert.match(normalized.safety.notice, /no delegate withdrawal\/admin authority/i);
});

test('renderTradeProofPanel renders the read-only account overview panel without wallet, tx, custody, or funds claims', () => {
  const fixture = {
    ...mockVerticalSliceFixture,
    accountOverview: createMockAccountOverviewFixture(),
  };
  const html = renderTradeProofPanel(fixture);

  for (const requiredText of [
    /read-only account overview/i,
    /mock-account-overview/,
    /LocalAccountOverviewProjection/,
    /mock-local-no-wallet-session/,
    /mock-vault-projection/,
    /mock-order-projection/,
    /IndexedFillProjection/,
    /READ_ONLY, NO_WITHDRAW, NO_ADMIN/,
    /settlementMode[\s\S]*mock/i,
    /real Quai tx[\s\S]*false/i,
    /wallet required[\s\S]*false/i,
    /funds moved[\s\S]*false/i,
    /TradingVault mutation[\s\S]*false/i,
    /delegate can withdraw[\s\S]*false/i,
    /delegate can admin[\s\S]*false/i,
    /no wallet loaded/i,
    /no funds moved/i,
    /no delegate withdrawal\/admin authority/i,
    /balance rows[\s\S]*0/i,
    /open orders[\s\S]*0/i,
    /confirmed fills[\s\S]*0/i,
  ]) {
    assert.match(html, requiredText);
  }

  assert.doesNotMatch(html, /wallet connected for account/i);
  assert.doesNotMatch(html, /owner wallet session loaded/i);
  assert.doesNotMatch(html, /TradingVault mutation submitted/i);
  assert.doesNotMatch(html, /funds moved by account overview/i);
  assert.doesNotMatch(html, /WITHDRAW, ADMIN/);
});

test('terminal UI docs, account docs, package check, and campaign status mark account overview panel complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const accountDoc = await readText('docs/account.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/account-overview-panel.js',
    'read-only account overview panel',
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
  }

  assert.ok(
    packageJson.includes('node --check src/account-overview-panel.js'),
    'terminal UI package check should syntax-check the account overview panel module',
  );
  assert.ok(
    accountDoc.includes('Terminal UI exposure complete: `web/terminal-ui/src/account-overview-panel.js`'),
    'account docs should mark the terminal UI account overview panel complete',
  );
  assert.ok(
    status.includes('Completed previous run: TypeScript/Python/qdex read-only account overview clients'),
    'campaign status should retain account overview client exposure as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI read-only account overview panel'),
    'campaign status should retain this terminal UI account overview panel slice as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI account overview integration smoke'),
    'campaign status should retain the local API account overview smoke slice as previous work',
  );
  assert.ok(
    status.includes('Next autonomous slice: another bounded local/source-only MVP surface'),
    'campaign status should stop pointing next work at already-completed Python public market-data stream parity',
  );

  assert.doesNotMatch(
    `${readme}\n${accountDoc}\n${status}`,
    /wallet connected for account|owner wallet session loaded|rpcUrl\s*:|signing key|broadcast transaction|TradingVault mutation submitted|funds moved by account overview/i,
    'terminal UI account overview docs/status must not claim wallet/RPC/signing/broadcast/mutation/funds behavior',
  );
});
