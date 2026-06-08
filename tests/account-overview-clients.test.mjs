import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

test('SDK and qdex docs expose the read-only account overview clients', async () => {
  const tsSpec = await readText('sdk/typescript/spec.md');
  const tsReadme = await readText('sdk/typescript/README.md');
  const pySpec = await readText('sdk/python/spec.md');
  const pyReadme = await readText('sdk/python/README.md');
  const cliSpec = await readText('cli/qdex/spec.md');
  const cliReadme = await readText('cli/qdex/README.md');

  for (const [label, text, requiredTexts] of [
    ['sdk/typescript/spec.md', tsSpec, [
      'await dex.account.get(); // GET /v1/account -> mock-account-overview, LocalAccountOverviewProjection, READ_ONLY',
      '`account.get()` is a read-only local account overview from `GET /v1/account`.',
      'mock-account-overview',
    ]],
    ['sdk/typescript/README.md', tsReadme, [
      'const accountOverview = await dex.account.get();',
      '`dex.account.get()` calls `GET /v1/account` and returns the read-only `mock-account-overview` envelope',
    ]],
    ['sdk/python/spec.md', pySpec, [
      'overview = dex.account.get()  # GET /v1/account -> mock-account-overview, LocalAccountOverviewProjection, READ_ONLY',
      '`account.get()` is a read-only local account overview from `GET /v1/account`.',
      'mock-account-overview',
    ]],
    ['sdk/python/README.md', pyReadme, [
      'account_overview = dex.account.get()',
      '`dex.account.get()` calls `GET /v1/account` and returns the read-only `mock-account-overview` envelope',
    ]],
    ['cli/qdex/spec.md', cliSpec, [
      'qdex account',
      '`qdex account` calls `GET /v1/account` and prints the read-only `mock-account-overview` envelope',
    ]],
    ['cli/qdex/README.md', cliReadme, [
      'qdex --base-url http://127.0.0.1:8787 account',
      '`qdex account` prints `GET /v1/account` as read-only `mock-account-overview` metadata',
    ]],
  ]) {
    for (const requiredText of requiredTexts) {
      assert.ok(text.includes(requiredText), `${label} should include ${requiredText}`);
    }
  }

  for (const text of [tsSpec, tsReadme, pySpec, pyReadme, cliSpec, cliReadme]) {
    for (const requiredText of [
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
      assert.ok(text.includes(requiredText), `client docs should preserve account overview safety text ${requiredText}`);
    }
  }
});

test('campaign status records account overview terminal UI panel as the completed bounded slice', async () => {
  const status = await readText('CAMPAIGN_STATUS.md');

  assert.ok(
    status.includes('Completed previous run: read-only account overview API envelope'),
    'campaign status should move the account overview API envelope to previous work',
  );
  assert.ok(
    status.includes('Completed previous run: TypeScript/Python/qdex read-only account overview clients'),
    'campaign status should retain account overview clients as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI read-only account overview panel'),
    'campaign status should retain the terminal UI account overview panel as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI account overview integration smoke'),
    'campaign status should retain the local API account overview smoke as previous work',
  );
  assert.ok(
    status.includes('Next autonomous slice: terminal UI public kline/candle panel binding'),
    'campaign status should point next work at terminal UI public kline/candle panel binding after Python kline consumers',
  );
  assert.ok(
    status.includes('Current phase: Python SDK public kline/candle consumers are complete'),
    'campaign status should describe Python public kline consumers as the current completed phase',
  );
});
