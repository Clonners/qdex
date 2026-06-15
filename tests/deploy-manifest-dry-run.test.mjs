import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

// ---- Task 3: deploy manifest and dry-run checks ----

test('deploy-manifest.js exports DEPLOY_ORDER, DEPLOY_STEPS, createDeployManifest, and validateDeployManifest', async () => {
  const src = await readText('services/api/src/deploy-manifest.js');

  const requiredExports = [
    'DEPLOY_ORDER',
    'DEPLOY_STEPS',
    'createDeployManifest',
    'validateDeployManifest',
  ];
  for (const exp of requiredExports) {
    assert.ok(
      src.includes(`export `) && src.includes(exp),
      `Missing export: ${exp}`
    );
  }
});

test('DEPLOY_ORDER defines the canonical deployment sequence from the testnet cutover plan', async () => {
  const { DEPLOY_ORDER } = await import('../services/api/src/deploy-manifest.js');

  // Verify it's an array
  assert(Array.isArray(DEPLOY_ORDER), 'DEPLOY_ORDER should be an array');

  // Verify deployment order from the plan
  assert.equal(DEPLOY_ORDER[0].contract, 'TradingVault', 'Step 1 should be TradingVault');
  assert.equal(DEPLOY_ORDER[1].contract, 'NonceManager', 'Step 2 should be NonceManager');
  assert.equal(DEPLOY_ORDER[2].contract, 'MarketRegistry', 'Step 3 should be MarketRegistry');
  assert.equal(DEPLOY_ORDER[3].contract, 'FeeManager', 'Step 4 should be FeeManager');
  assert.equal(DEPLOY_ORDER[4].contract, 'DelegateKeyRegistry', 'Step 5 should be DelegateKeyRegistry');
  assert.equal(DEPLOY_ORDER[5].contract, 'Settlement', 'Step 6 should be Settlement (last, depends on all)');

  // Verify dependencies are declared
  assert.equal(DEPLOY_ORDER[0].dependencies.length, 0, 'TradingVault should have no dependencies');
  assert.equal(DEPLOY_ORDER[5].dependencies.length, 5, 'Settlement should depend on all 5 preceding contracts');
});

test('DEPLOY_STEPS defines detailed step metadata including post-deploy actions', async () => {
  const { DEPLOY_STEPS, DEPLOY_ORDER } = await import('../services/api/src/deploy-manifest.js');

  assert(Array.isArray(DEPLOY_STEPS), 'DEPLOY_STEPS should be an array');
  assert.ok(DEPLOY_STEPS.length >= DEPLOY_ORDER.length, 'DEPLOY_STEPS should cover at least DEPLOY_ORDER length');

  // Verify post-deploy actions exist for Settlement
  const settlementStep = DEPLOY_STEPS.find((s) => s.contract === 'Settlement');
  assert.ok(settlementStep, 'Settlement step should exist');
  assert.ok(Array.isArray(settlementStep.postDeployActions), 'Settlement should have postDeployActions');

  // Verify vault wiring step exists
  const hasVaultWiring = DEPLOY_STEPS.some(
    (s) => (s.name?.toLowerCase().includes('vault') || s.name?.toLowerCase().includes('wiring') || s.name?.toLowerCase().includes('authority'))
  );
  assert.ok(hasVaultWiring, 'Should have vault settlement-authority wiring step');
});

test('createDeployManifest returns a draft manifest with no deployed addresses and mock safety metadata', async () => {
  const { createDeployManifest } = await import('../services/api/src/deploy-manifest.js');

  const manifest = createDeployManifest();

  // Draft mode — no real deployments
  assert.equal(manifest.mode, 'draft-dry-run', 'Mode should be draft-dry-run');
  assert.equal(manifest.deployed, false, 'Should not be deployed');
  assert.equal(manifest.canBroadcast, false, 'Should not be able to broadcast');

  // No contract addresses populated
  assert.equal(manifest.addresses.TradingVault, null, 'TradingVault should be null');
  assert.equal(manifest.addresses.Settlement, null, 'Settlement should be null');
  assert.equal(manifest.addresses.NonceManager, null, 'NonceManager should be null');
  assert.equal(manifest.addresses.MarketRegistry, null, 'MarketRegistry should be null');
  assert.equal(manifest.addresses.FeeManager, null, 'FeeManager should be null');
  assert.equal(manifest.addresses.DelegateKeyRegistry, null, 'DelegateKeyRegistry should be null');

  // Safety metadata preserved
  assert.equal(manifest.realQuaiTransactions, false, 'Should preserve realQuaiTransactions: false');
  assert.equal(manifest.walletRequired, false, 'Should preserve walletRequired: false');
  assert.equal(manifest.noWalletLoaded, true, 'Should confirm no wallet loaded');
  assert.equal(manifest.noRpcAccess, true, 'Should confirm no RPC access');
  assert.equal(manifest.noFundsMovement, true, 'Should confirm no funds movement');
  assert.equal(manifest.noBroadcast, true, 'Should confirm no broadcast capability');

  // Deploy steps present but unexecuted
  assert.ok(Array.isArray(manifest.steps), 'Should have steps array');
  assert.ok(manifest.steps.length >= 6, 'Should have at least 6 deployment steps');
  assert.equal(manifest.steps[0].status, 'pending', 'First step should be pending');
});

test('validateDeployManifest rejects manifest with real addresses without approval', async () => {
  const { createDeployManifest, validateDeployManifest } = await import('../services/api/src/deploy-manifest.js');

  const manifest = createDeployManifest();
  // Create a mutable copy since the manifest is frozen for safety
  const mutable = structuredClone(manifest);
  mutable.addresses = Object.assign({}, mutable.addresses, {
    TradingVault: '0x1234567890123456789012345678901234567890',
  });

  const result = validateDeployManifest(mutable);

  assert(!result.valid, 'Should reject manifest with real addresses in draft mode');
  assert.ok(result.errors.length > 0, 'Should have validation errors');
  assert.ok(
    result.errors.some((e) => e.includes('address') || e.includes('address')),
    'Should have an address-related error'
  );
});

test('validateDeployManifest accepts a clean draft manifest with no addresses', async () => {
  const { createDeployManifest, validateDeployManifest } = await import('../services/api/src/deploy-manifest.js');

  const manifest = createDeployManifest();
  const result = validateDeployManifest(manifest);

  assert(result.valid, 'Draft manifest with null addresses should be valid');
  assert.equal(result.mode, 'draft-dry-run', 'Should report draft-dry-run mode');
  assert.equal(result.realAddressesPresent, false, 'Should confirm no real addresses');
});

test('validateDeployManifest carries safety metadata in all validation results', async () => {
  const { createDeployManifest, validateDeployManifest } = await import('../services/api/src/deploy-manifest.js');

  const result = validateDeployManifest(createDeployManifest());

  assert.equal(result.realQuaiTransactions, false, 'Should always carry realQuaiTransactions: false');
  assert.equal(result.walletRequired, false, 'Should always carry walletRequired: false');
  assert.equal(result.noWalletLoaded, true, 'Should always confirm no wallet loaded');
  assert.equal(result.noRpcAccess, true, 'Should always confirm no RPC access');
  assert.equal(result.noFundsMovement, true, 'Should always confirm no funds movement');
  assert.equal(result.noBroadcast, true, 'Should always confirm no broadcast');
});

test('validateDeployManifest verifies dependency ordering — Settlement must come after its dependencies', async () => {
  const { createDeployManifest, validateDeployManifest } = await import('../services/api/src/deploy-manifest.js');

  const manifest = createDeployManifest();

  // Verify correct step ordering in the manifest
  const settlementIdx = manifest.steps.findIndex((s) => s.contract === 'Settlement');
  const vaultIdx = manifest.steps.findIndex((s) => s.contract === 'TradingVault');

  assert(
    settlementIdx > vaultIdx,
    'Settlement should come after TradingVault in the steps array'
  );

  const result = validateDeployManifest(manifest);
  assert(result.valid, 'Draft manifest with correct step ordering should validate');
});

test('deploy manifest preserves NO_WITHDRAW and NO_ADMIN in all step metadata', async () => {
  const { createDeployManifest } = await import('../services/api/src/deploy-manifest.js');

  const manifest = createDeployManifest();

  for (const step of manifest.steps) {
    assert.equal(step.noWithdraw, true, `${step.contract} step should preserve noWithdraw: true`);
    assert.equal(step.noAdmin, true, `${step.contract} step should preserve noAdmin: true`);
  }
});

test('deploy manifest does not embed secrets, live RPC URLs, or real addresses', async () => {
  const src = await readText('services/api/src/deploy-manifest.js');

  assert.doesNotMatch(
    src,
    /https:\/\/[^`\s]*rpc/i,
    'deploy manifest source must not embed RPC URLs'
  );
  assert.doesNotMatch(
    src,
    /0x[a-fA-F0-9]{40}/,
    'deploy manifest source must not embed real addresses'
  );
});
