import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readRepoFile = (path) => readFile(new URL(path, repoRoot), 'utf8');
const readRepoJson = async (path) => JSON.parse(await readRepoFile(path));

test('contracts workspace exposes a local-only Hardhat harness guard', async () => {
  const workspace = await readRepoFile('pnpm-workspace.yaml');
  const pkg = await readRepoJson('contracts/package.json');

  assert.ok(workspace.includes('- "contracts"'), 'pnpm workspace should include the contracts package');
  assert.equal(pkg.name, '@qdex/contracts');
  assert.equal(pkg.private, true);
  assert.equal(pkg.scripts.check, 'node scripts/guard-local-only-hardhat-config.mjs');
  assert.equal(pkg.scripts.test, 'pnpm run check');
  assert.equal(pkg.scripts['test:local'], 'hardhat test --network hardhat');
  assert.equal(pkg.devDependencies.hardhat, '^2.19.5');
});

test('Hardhat harness config cannot point at external Quai networks autonomously', async () => {
  const config = await readRepoFile('contracts/hardhat.config.cjs');

  for (const requiredText of [
    "defaultNetwork: 'hardhat'",
    "version: '0.8.20'",
    'optimizer: { enabled: true, runs: 1000 }',
    "metadata: { bytecodeHash: 'ipfs', useLiteralContent: true }",
    "evmVersion: 'london'",
    "sources: './src'",
    "tests: './test'",
  ]) {
    assert.ok(config.includes(requiredText), `hardhat config should include ${requiredText}`);
  }

  const networksBlock = config.match(/networks:\s*\{([\s\S]*?)\n  \},/);
  assert.ok(networksBlock, 'hardhat config should contain a networks block');

  const configuredNetworkNames = [...networksBlock[1].matchAll(/^\s{4}([A-Za-z0-9_]+):\s*\{/gm)].map((match) => match[1]);
  assert.deepEqual(configuredNetworkNames, ['hardhat'], 'autonomous harness may only define the local hardhat network');

  for (const forbiddenPattern of [
    /process\.env/u,
    /\baccounts\s*:/iu,
    /\burl\s*:/iu,
    /\bRPC_URL\b/u,
    /\bcyprus\d?\b/iu,
    /\borchard\b/iu,
    /\bmainnet\b/iu,
    /\btestnet\b/iu,
    /\bwallet\b/iu,
    /\bdeploy\b/iu,
  ]) {
    assert.doesNotMatch(config, forbiddenPattern, `local harness config must not include ${forbiddenPattern}`);
  }
});

test('local harness documentation tracks current local contract coverage', async () => {
  const readme = await readRepoFile('contracts/README.md');

  for (const requiredText of [
    '# QDEX Contracts Local Harness',
    'Local in-memory Hardhat network only.',
    'No RPC URLs, external accounts, deploy scripts, or Orchard/testnet activity belong in autonomous runs.',
    '`pnpm --filter @qdex/contracts check` validates the local-only harness guard without compiling or sending anything.',
    '`pnpm --filter @qdex/contracts test:local` runs the local-only Hardhat implementation tests against the in-memory `hardhat` network.',
    'Implemented local-only Hardhat ratchets from `docs/contract-implementation-test-matrix.md`:',
    '`TV-01`: caller deposits increase caller-owned available balance.',
    '`TV-02`: callers can withdraw only their own available balance.',
    '`TV-03`: deployer/operator-like accounts cannot withdraw or drain a user\'s deposited balance, and admin/operator withdrawal selectors remain absent.',
    '`TV-04`: settlement-authority locks move funds from available to locked, and normal user withdrawals cannot move the locked portion.',
    '`TV-05`: settlement-only lock/unlock/move hooks reject non-authority callers; authorized hook calls validate trace IDs and balance limits before emitting `BalanceLocked`, `BalanceUnlocked`, or `SettlementBalanceMoved`.',
    '`TV-06`: future trading pause or emergency controls cannot become a broad freeze on caller-owned available withdrawals without a separately approved narrow emergency design.',
    '`ST-01`: local Settlement validates signed fill replay fields, moves vault balances exactly once, marks nonces, and emits `TradeSettled` proof truth.',
    '`ST-02`: local Settlement rejects reused or cancelled maker/taker nonces before vault movement, including single nonce and bounded range cancellation.',
    '`ST-03`: local Settlement rejects expired fills and replay-domain mismatches before nonce consumption or vault movement.',
    '`ST-04`: local Settlement rejects disabled local markets, invalid price/amount arithmetic, and fill-accounting mismatches before nonce consumption or vault movement.',
    '`ST-05`: local Settlement tracks cumulative partial-fill amounts by order hash and rejects fills that would exceed signed maker/taker order amounts.',
    '`ST-06`: local Settlement enforces signed/hard fee caps, configured fee recipient, and fee-split accounting before proof-event emission.',
    '`ST-07`: contract proof adapter pins `TradeSettled` as the only public proof trigger, suppresses matcher/non-TradeSettled events, and requires real Quai event evidence before public projection.',
    '`NM-01`: local NonceManager keeps cancellation user-owned, bounds range cancellation, and restricts `markNonceUsed` to the configured settlement authority.',
    '`MR-01`: local MarketRegistry keeps market metadata stable, enabled/disabled status explicit, and market-authority changes dependency-scoped before Settlement wiring.',
    '`FM-01`: local FeeManager keeps maker/taker fee updates fee-authority gated, hard-capped by `maxFeeBps()`, and evented for indexer replay.',
    '`DK-01`: local DelegateKeyRegistry keeps delegate keys owner-registered, expiry/market/notional scoped, and explicitly `NO_WITHDRAW`/`NO_ADMIN` before bot signing integration.',
    '`DK-02`: local Settlement accepts owner-scoped delegate signatures only when the delegate is active for the fill market/notional and has `PLACE_ORDER`, `NO_WITHDRAW`, and `NO_ADMIN`; invalid delegates reject before nonce/accounting/vault movement.',
    '`NM-02`: local Settlement delegates nonce truth to a settlement-scoped `NonceManager`; user cancellations live on `NonceManager`, full fills emit `NonceUsed`, and DK-02 delegate safety remains intact.',
    '`MR-02`: local Settlement delegates market truth to a market-authority-scoped `MarketRegistry`; fills require enabled base/quote metadata and disabled or token-mismatched markets reject before nonce/accounting/vault/proof mutation.',
    '`FM-02`: local Settlement delegates fee truth to a fee-authority-scoped `FeeManager`; nonzero fees require manager recipient truth plus signed and manager schedule caps before vault/proof mutation.',
    'Recommended next slice: wire external dependency cleanup or FeeManager/MarketRegistry docs/API contract alignment while preserving DK-02 delegate signing, NM-02 nonce truth, MR-02 market truth, FM-02 fee truth, and custody boundaries.',
    'Native Qi remains out of real vault tests until a wrapper/adapter/conversion design is proven.',
  ]) {
    assert.ok(readme.includes(requiredText), `contracts README should include: ${requiredText}`);
  }
});
