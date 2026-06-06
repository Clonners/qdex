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

test('local harness documentation keeps first contract tests scoped to the matrix', async () => {
  const readme = await readRepoFile('contracts/README.md');

  for (const requiredText of [
    '# QDEX Contracts Local Harness',
    'Local in-memory Hardhat network only.',
    'No RPC URLs, external accounts, deploy scripts, or Orchard/testnet activity belong in autonomous runs.',
    '`pnpm --filter @qdex/contracts check` validates the local-only harness guard without compiling or sending anything.',
    '`pnpm --filter @qdex/contracts test:local` is reserved for future local implementation tests after the contract package dependencies are installed.',
    'Start with `TV-01` from `docs/contract-implementation-test-matrix.md`.',
    'Native Qi remains out of real vault tests until a wrapper/adapter/conversion design is proven.',
  ]) {
    assert.ok(readme.includes(requiredText), `contracts README should include: ${requiredText}`);
  }
});
