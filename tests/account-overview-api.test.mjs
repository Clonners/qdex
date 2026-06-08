import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const sectionBetween = (text, startMarker, endMarker) => {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker ${endMarker}`);
  return text.slice(start, end);
};

test('OpenAPI exposes read-only local account overview metadata', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const accountRoute = sectionBetween(spec, '  /v1/account:', '  /v1/account/balances:');
  const accountOverview = sectionBetween(spec, '    AccountOverview:', '    AccountBalances:');

  for (const requiredText of [
    'summary: Read-only local account overview',
    'Mock account overview only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.',
    '$ref: "#/components/schemas/AccountOverview"',
    '"200":',
  ]) {
    assert.ok(accountRoute.includes(requiredText), `/v1/account route should include ${requiredText}`);
  }

  for (const requiredText of [
    'description: Read-only mock/local account overview',
    'required: [account, source, custody, session, permissions, balances, orders, fills, settlementMode, realQuaiTransactions, walletRequired, fundsMoved, tradingVaultMutation, safety]',
    'enum: [mock-account-overview]',
    'enum: [non-custodial-contract-vault]',
    'enum: [mock-local-no-wallet-session]',
    '$ref: "#/components/schemas/AccountBalances"',
    'enum: [mock-order-projection]',
    'enum: [IndexedFillProjection]',
    'enum: [in-memory-indexer-projection]',
    'enum: [READ_ONLY, NO_WITHDRAW, NO_ADMIN]',
    'noWalletLoading:',
    'delegateCanWithdraw:',
    'delegateCanAdmin:',
    'no delegate withdrawal/admin authority',
  ]) {
    assert.ok(accountOverview.includes(requiredText), `AccountOverview schema should include ${requiredText}`);
  }
});

test('account docs and campaign status pin the read-only overview as the current completed slice', async () => {
  const accountDoc = await readText('docs/account.md');
  const architecture = await readText('docs/architecture.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    '# Account Overview',
    'GET /v1/account',
    'source: mock-account-overview',
    'mock-local-no-wallet-session',
    'mock-vault-projection',
    'mock-order-projection',
    'IndexedFillProjection',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, TradingVault mutation, or funds movement',
  ]) {
    assert.ok(accountDoc.includes(requiredText), `docs/account.md should include ${requiredText}`);
  }

  assert.ok(
    architecture.includes('Read-only account overview now exposes `GET /v1/account`'),
    'architecture docs should point to the completed account overview API visibility',
  );
  assert.ok(
    status.includes('Completed previous run: Python SDK FeeManager fee schedule stream consumers'),
    'campaign status should move the Python FeeManager stream consumer slice to previous work',
  );
  assert.ok(
    status.includes('Completed this run: read-only account overview API envelope'),
    'campaign status should mark the account overview API envelope as this run',
  );
  assert.ok(
    status.includes('Next autonomous slice: TypeScript/Python/qdex read-only account overview clients'),
    'campaign status should point next work at read-only account overview clients',
  );
});
