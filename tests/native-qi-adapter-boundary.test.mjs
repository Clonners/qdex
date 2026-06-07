import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readRepoFile = (path) => readFile(new URL(path, repoRoot), 'utf8');

const planPath = 'docs/plans/2026-06-07-native-qi-wrapper-adapter-boundary.md';

const requiredPlanText = [
  '# Wrapped Token Listing Boundary Implementation Plan',
  'supersedes the earlier native-Qi-adapter blocker',
  '**Correction:** QDEX MVP uses `WQUAI`, `WQI`, and listed community-created tokens.',
  '**Goal:** Replace the native-Qi-adapter decision plateau with a wrapped/listed-token market plane',
  '**Architecture:** `TradingVault` accepts listed ERC-20-style vault tokens only.',
  '## Current direction',
  'WQUAI / WQI / listed community tokens',
  'MarketRegistry enabled pairs',
  'Native Qi direct settlement is out of scope for the MVP',
  '## Disallowed shortcuts',
  'Do not reintroduce `wrapped_qi_receipt_token`, `contract_native_qi_adapter`, or `conversion_settlement_flow` as the active next task.',
  'Do not represent raw native Qi as a normal `TradingVault.deposit(token, amount)` asset.',
  '## API and metadata boundary',
  '`listedAssetStatus`',
  'listedAssetStatus.status: wrapped-token-listing',
  'primaryQuoteAssets: WQUAI, WQI',
  'supportedAssetModel: erc20-style-vault-token',
  'userListedTokens: true',
  'listingFlowStatus: design-required',
  'nativeQiTreatment: out-of-scope-direct-settlement-use-WQI',
  'nativeQiDirectSettlement: false',
  '## Completed metadata correction',
  'Completed: the campaign direction has been corrected away from a native Qi adapter selection blocker.',
  '## Next implementation slice',
  'Token listing and MarketRegistry metadata flow',
  'Listed assets are ERC-20-style vault tokens.',
  '`MarketRegistry` is market metadata/enabled-pair truth, not custody truth.',
  '`NO_WITHDRAW`',
  '`NO_ADMIN`',
  'No deploys, RPC URLs, wallet loading, signing, broadcasts, transaction submissions, or real funds are introduced by this plan.',
];

test('wrapped token listing boundary plan supersedes native Qi adapter blocker', async () => {
  const plan = await readRepoFile(planPath);

  for (const requiredText of requiredPlanText) {
    assert.ok(plan.includes(requiredText), `${planPath} should include ${requiredText}`);
  }

  const forbiddenRuntimeDetails = new RegExp(
    ['process\\.env', 'RPC_URL', 'CYPRUS1_PK', 'mnemo' + 'nic', 'seed' + ' phrase', 'private' + ' key'].join('|'),
    'i',
  );
  assert.doesNotMatch(plan, forbiddenRuntimeDetails, 'listing plan must not add env, wallet-material, or secret-bearing implementation details');
});

test('contract and architecture docs point to wrapped token listing rather than native Qi decision', async () => {
  const contractsDoc = await readRepoFile('docs/contracts.md');
  const architectureDoc = await readRepoFile('docs/architecture.md');
  const contractsReadme = await readRepoFile('contracts/README.md');

  assert.ok(
    contractsDoc.includes('[`docs/plans/2026-06-07-native-qi-wrapper-adapter-boundary.md`](./plans/2026-06-07-native-qi-wrapper-adapter-boundary.md)'),
    'docs/contracts.md should link the corrected listing boundary plan',
  );
  assert.ok(contractsDoc.includes('listedAssetStatus'));
  assert.ok(contractsDoc.includes('WQUAI, WQI, and community-created tokens'));

  assert.ok(architectureDoc.includes('Wrapped token listing boundary'));
  assert.ok(architectureDoc.includes('WQUAI, WQI, and listed community-created tokens'));
  assert.ok(architectureDoc.includes('Native Qi direct settlement is out of scope'));

  assert.ok(contractsReadme.includes('Current metadata/listing slices expose read-only `listedAssetStatus`'));
  assert.ok(contractsReadme.includes('Approval required: runtime listing submission or MarketRegistry admin mutation'));
  assert.doesNotMatch(
    contractsReadme,
    /Recommended next slice: token listing and MarketRegistry metadata flow|Recommended next slice: choose exactly one native Qi path|accepted paths remain `wrapped_qi_receipt_token`/,
    'contracts README should not point at completed listing-policy slices or stale native Qi path selection work',
  );
});
