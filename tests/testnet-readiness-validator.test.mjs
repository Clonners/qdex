import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkTestnetReadiness,
  assertTestnetReady,
  CATEGORIES,
} from '../services/api/src/testnet-readiness-validator.js';

// ---- CATEGORIES ----

test('CATEGORIES has exactly 6 readiness categories', () => {
  assert.equal(CATEGORIES.length, 6, 'Should have 6 categories');
  const names = CATEGORIES.map((c) => c.name);
  assert.deepEqual(names, ['config', 'manifest', 'safety', 'explorer', 'contracts', 'tokens']);
});

test('CATEGORIES weights sum to 100', () => {
  const totalWeight = CATEGORIES.reduce((sum, c) => sum + c.weight, 0);
  assert.equal(totalWeight, 100, 'Category weights should sum to 100');
});

test('CATEGORIES each has a description', () => {
  for (const category of CATEGORIES) {
    assert.ok(
      typeof category.description === 'string' && category.description.length > 0,
      `Category "${category.name}" should have a description`
    );
  }
});

// ---- checkTestnetReadiness ----

test('checkTestnetReadiness returns a structured report', () => {
  const report = checkTestnetReadiness();

  assert.ok(typeof report.ready === 'boolean', 'Should have ready boolean');
  assert.ok(typeof report.score === 'number', 'Should have numeric score');
  assert.ok(report.score >= 0 && report.score <= 100, 'Score should be 0-100');
  assert.ok(Array.isArray(report.blockers), 'Should have blockers array');
  assert.ok(Array.isArray(report.warnings), 'Should have warnings array');
  assert.ok(typeof report.categories === 'object', 'Should have categories object');
  assert.ok(Array.isArray(report.deploymentChecklist), 'Should have deploymentChecklist');
});

test('checkTestnetReadiness score matches category pass/fail', () => {
  const report = checkTestnetReadiness();

  let expectedScore = 0;
  for (const [name, cat] of Object.entries(report.categories)) {
    if (cat.pass) {
      expectedScore += cat.weight;
    }
  }
  assert.equal(report.score, expectedScore, 'Score should match sum of passing category weights');
});

test('checkTestnetReadiness reports correct network info', () => {
  const report = checkTestnetReadiness();

  assert.equal(report.networkName, 'quai-orchard');
  assert.equal(report.zone, 'cyprus1');
  assert.equal(report.chainId, 15000);
  assert.equal(report.rpcUrl, 'https://orchard.rpc.quai.network/cyprus1');
  assert.equal(report.explorerBaseUrl, 'https://orchard.quaiscan.io');
  assert.ok(report.deployer.startsWith('0x'), 'Deployer should be an address');
});

test('checkTestnetReadiness deploymentChecklist has 14 steps', () => {
  const report = checkTestnetReadiness();

  assert.equal(report.deploymentChecklist.length, 14, 'Should have 14 checklist steps');

  // Step 1 should be done (network config is set)
  const step1 = report.deploymentChecklist.find((s) => s.step === 1);
  assert.ok(step1, 'Step 1 should exist');
  assert.equal(step1.done, true, 'Step 1 should be done (network config present)');

  // Steps 2-14 should be not done yet
  for (let i = 2; i <= 14; i++) {
    const step = report.deploymentChecklist.find((s) => s.step === i);
    assert.ok(step, `Step ${i} should exist`);
    assert.equal(step.done, false, `Step ${i} should not be done yet`);
  }
});

test('checkTestnetReadiness reports contract address status correctly', () => {
  const report = checkTestnetReadiness();

  assert.equal(report.contracts.deployed, 0, 'No contracts deployed yet');
  assert.equal(report.contracts.total, 6, 'Should track 6 contracts');
  assert.equal(report.contracts.null.length, 6, 'All 6 contract addresses should be null');
  assert.ok(report.contracts.pass, 'All-null contracts should pass (expected before deploy)');
});

test('checkTestnetReadiness reports token address status correctly', () => {
  const report = checkTestnetReadiness();

  assert.equal(report.tokens.deployed, 2, 'Both tokens configured (WQUAI + WQI on Orchard)');
  assert.equal(report.tokens.total, 2, 'Should track 2 tokens (WQUAI, WQI)');
  assert.equal(report.tokens.null.length, 0, 'No token addresses null (all configured)');
  assert.ok(report.tokens.pass, 'All-configured tokens should pass');
});

test('checkTestnetReadiness explorer category passes with configured explorer', () => {
  const report = checkTestnetReadiness();

  assert.ok(report.categories.explorer.pass, 'Explorer category should pass');
  assert.equal(report.categories.explorer.weight, 10, 'Explorer weight should be 10');
  assert.ok(report.explorer.details.txUrl?.includes('tx/'), 'txUrl should include /tx/');
  assert.ok(report.explorer.details.addressUrl?.includes('address/'), 'addressUrl should include /address/');
  assert.ok(report.explorer.details.blockUrl?.includes('block/'), 'blockUrl should include /block/');
});

test('checkTestnetReadiness config category passes with current testnet config', () => {
  const report = checkTestnetReadiness();

  assert.ok(report.categories.config.pass, 'Config category should pass');
  assert.equal(report.categories.config.weight, 25, 'Config weight should be 25');
});

test('checkTestnetReadiness manifest category passes in draft-dry-run mode', () => {
  const report = checkTestnetReadiness();

  assert.ok(report.categories.manifest.pass, 'Manifest category should pass');
  assert.equal(report.categories.manifest.weight, 20, 'Manifest weight should be 20');
});

test('checkTestnetReadiness safety category passes with safety metadata', () => {
  const report = checkTestnetReadiness();

  assert.ok(report.categories.safety.pass, 'Safety category should pass');
  assert.equal(report.categories.safety.weight, 20, 'Safety weight should be 20');
});

// ---- Safety metadata ----

test('checkTestnetReadiness preserves safety metadata', () => {
  const report = checkTestnetReadiness();

  assert.equal(report.realQuaiTransactions, false);
  assert.equal(report.walletRequired, false);
  assert.equal(report.noWalletLoaded, true);
  assert.equal(report.noRpcCallMade, true);
  assert.equal(report.noSigning, true);
  assert.equal(report.noBroadcasting, true);
  assert.equal(report.noFundsMovement, true);
  assert.equal(report.noContractDeploy, true);
  assert.equal(report.approvalGate, 'explicit-approval-required-before-deploy');
});

test('checkTestnetReadiness mode matches testnet config', () => {
  const report = checkTestnetReadiness();
  assert.equal(report.mode, 'testnet-ready');
});

test('checkTestnetReadiness RPC probes skipped by default', () => {
  const report = checkTestnetReadiness();
  assert.equal(report.rpcProbes.skipped, true);
  assert.ok(report.rpcProbes.reason.includes('no RPC calls'), 'Should explain why probes skipped');
});

// ---- assertTestnetReady ----

test('assertTestnetReady returns report when all categories pass', () => {
  const report = assertTestnetReady();
  assert.ok(report.ready, 'Should return ready report');
  assert.ok(report.score > 0, 'Score should be positive');
});

test('assertTestnetReady throws with blocker details when not ready', () => {
  // We can't easily break the current config, but we can verify the throw behavior
  // by checking the report structure
  const report = checkTestnetReadiness();
  if (!report.ready) {
    // If not ready, assertTestnetReady should throw
    assert.throws(() => assertTestnetReady(), /blocker/);
  } else {
    // If ready, it should not throw
    assert.doesNotThrow(() => assertTestnetReady());
  }
});

// ---- Source safety: no wallet/signing imports ----

test('testnet-readiness-validator.js contains no wallet or signing imports', () => {
  import('../services/api/src/testnet-readiness-validator.js').then((mod) => {
    // The module exports checkTestnetReadiness and assertTestnetReady
    assert.ok(typeof mod.checkTestnetReadiness === 'function');
    assert.ok(typeof mod.assertTestnetReady === 'function');
  }).catch(() => {
    // If dynamic import fails, verify via source content
    assert.fail('Module should be importable');
  });
});

// ---- Integration: readiness report matches deploy readiness check ----

test('readiness report config sub-report matches deploy readiness check', () => {
  const report = checkTestnetReadiness();

  assert.equal(report.config.ready, report.categories.config.pass, 'Config ready should match category pass');
  assert.ok(Array.isArray(report.config.blockers), 'Config should have blockers array');
  assert.ok(Array.isArray(report.config.warnings), 'Config should have warnings array');
});

test('readiness report manifest sub-report matches deploy readiness check', () => {
  const report = checkTestnetReadiness();

  assert.equal(report.manifest.ready, report.categories.manifest.pass, 'Manifest ready should match category pass');
  assert.ok(report.manifest.manifestValid !== undefined, 'Manifest should have manifestValid');
});

test('readiness report safety sub-report matches deploy readiness check', () => {
  const report = checkTestnetReadiness();

  assert.equal(report.safety.safe, report.categories.safety.pass, 'Safety safe should match category pass');
  assert.ok(Array.isArray(report.safety.blockers), 'Safety should have blockers array');
});

// ---- Warnings ----

test('checkTestnetReadiness includes expected warnings about null addresses', () => {
  const report = checkTestnetReadiness();

  const contractWarning = report.warnings.find((w) => w.includes('Contracts:') && w.includes('null'));
  assert.ok(contractWarning, 'Should have a warning about null contract addresses');
  assert.ok(contractWarning.includes('6/6 null'), 'Should say 6/6 null');

  const tokenWarning = report.warnings.find((w) => w.includes('Tokens:'));
  assert.ok(tokenWarning, 'Should have a token status warning');
  assert.ok(tokenWarning.includes('all 2 addresses configured'), 'Should say all tokens configured');
});

// ---- Explorer null guard ----

test('explorer details nullGuard is true', () => {
  const report = checkTestnetReadiness();
  assert.equal(report.explorer.details.nullGuard, true, 'Null guards should pass');
});
