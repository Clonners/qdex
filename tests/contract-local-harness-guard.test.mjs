import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
    '`MR-03`: local MarketRegistry starts with Clonners-managed listing authority and supports a two-step DAO handoff via `proposeMarketAuthority` and `acceptMarketAuthority` without custody power.',
    'Current metadata/listing slices expose read-only `listedAssetStatus` plus `GET /v1/listings/policy`, `POST /v1/listings/requests` prepare-only metadata, and SDK/CLI clients',
    'Next approval boundary: post-listing-policy MarketRegistry admin boundary in [`docs/plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md`](../docs/plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md).',
    'Approval required: runtime listing submission beyond local queue/decision state or MarketRegistry admin mutation.',
    'The listing plane may enable/disable token-pair metadata only after approval, but it must not move user balances or grant withdrawal/admin power.',
    'Native Qi direct settlement remains out of scope for the MVP unless Clonners explicitly reopens it; WQI is the Qi-facing listed token surface.',
  ]) {
    assert.ok(readme.includes(requiredText), `contracts README should include: ${requiredText}`);
  }
});

test('deploy scripts require explicit approval marker and cannot run autonomously', async () => {
  const scriptsDir = join(repoRoot.pathname, 'contracts', 'scripts');
  assert.ok(existsSync(scriptsDir), 'contracts/scripts directory should exist');

  const files = readdirSync(scriptsDir).filter(f => f.startsWith('deploy-') && f.endsWith('.js'));
  assert.ok(files.length > 0, 'deploy scripts should exist in contracts/scripts');

  for (const file of files) {
    const content = await readFile(join(scriptsDir, file), 'utf8');

    // Each deploy script must carry an explicit approval-required marker
    assert.ok(
      content.includes('APPROVAL REQUIRED') || content.includes('approval-required') || content.includes('Requires explicit approval'),
      `${file} must carry explicit approval-required marker`
    );

    // Deploy scripts must not contain hardcoded private keys
    assert.doesNotMatch(
      content,
      /0x[0-9a-fA-F]{64}/u,
      `${file} must not contain hardcoded private keys`
    );

    // Deploy scripts must reference an external network (not local hardhat)
    assert.ok(
      content.includes('quaiOrchard') || content.includes('orchard') || content.includes('testnet') || content.includes('15000'),
      `${file} must target an external network, not local hardhat`
    );
  }

  // Verify hardhat config does NOT define the external network these scripts need
  const config = await readRepoFile('contracts/hardhat.config.cjs');
  const configuredNetworkNames = [...config.matchAll(/^\s{4}([A-Za-z0-9_]+):\s*\{/gm)].map(m => m[1]);
  assert.ok(
    !configuredNetworkNames.includes('quaiOrchard'),
    'hardhat config must NOT define quaiOrchard network autonomously'
  );
  assert.ok(
    !configuredNetworkNames.includes('orchard'),
    'hardhat config must NOT define orchard network autonomously'
  );
});

test('check-balance script is read-only and does not require deploy network', async () => {
  const scriptsDir = join(repoRoot.pathname, 'contracts', 'scripts');
  const checkBalance = join(scriptsDir, 'check-balance.js');

  if (!existsSync(checkBalance)) {
    // Script optional — skip if absent
    return;
  }

  const content = await readFile(checkBalance, 'utf8');

  // check-balance must not contain signing/broadcast/deploy patterns
  // NOTE: getSigners() is read-only in Hardhat (lists configured accounts)
  for (const forbiddenPattern of [
    /signTransaction/iu,
    /sendTransaction/iu,
    /deploy\s*\(/iu,
    /\.deploy\(/iu,
  ]) {
    assert.doesNotMatch(
      content,
      forbiddenPattern,
      `check-balance.js must not include ${forbiddenPattern}`
    );
  }

  // check-balance should only read balances (getBalance)
  assert.ok(
    content.includes('getBalance'),
    'check-balance.js should read balances'
  );
});
