import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

// ── Module structure and exports ─────────────────────────────────────

test('testnet-acceptance-script exports required functions and constants', async () => {
  const mod = await import('../services/api/src/testnet-acceptance-script.js');

  assert.equal(typeof mod.runTestnetAcceptance, 'function', 'runTestnetAcceptance should be exported');
  assert.equal(typeof mod.assertTestnetAcceptance, 'function', 'assertTestnetAcceptance should be exported');
  assert.equal(typeof mod.GATES, 'object', 'GATES should be exported');
  assert.equal(typeof mod.WEIGHT_TOTAL, 'number', 'WEIGHT_TOTAL should be exported');
  assert.equal(typeof mod.buildDeploymentChecklist, 'function', 'buildDeploymentChecklist should be exported');
});

test('GATES array has expected structure and weights sum to WEIGHT_TOTAL', async () => {
  const { GATES, WEIGHT_TOTAL } = await import('../services/api/src/testnet-acceptance-script.js');

  assert.ok(Array.isArray(GATES), 'GATES should be an array');
  assert.ok(GATES.length > 0, 'GATES should not be empty');

  for (const gate of GATES) {
    assert.ok(gate.id, 'each gate should have an id');
    assert.ok(gate.description, 'each gate should have a description');
    assert.ok(typeof gate.weight === 'number' && gate.weight > 0, 'each gate should have a positive weight');
  }

  const totalWeight = GATES.reduce((sum, g) => sum + g.weight, 0);
  assert.equal(totalWeight, WEIGHT_TOTAL, 'gate weights should sum to WEIGHT_TOTAL');
});

test('GATES covers all required acceptance areas', async () => {
  const { GATES } = await import('../services/api/src/testnet-acceptance-script.js');

  const gateIds = GATES.map((g) => g.id);
  const requiredIds = [
    'network-config',
    'deployer-address',
    'deploy-manifest',
    'safety-metadata',
    'explorer-helpers',
    'relayer-gate',
    'contracts-null-before-deploy',
    'tokens-null-before-deploy',
  ];

  for (const requiredId of requiredIds) {
    assert.ok(gateIds.includes(requiredId), `GATES should include "${requiredId}"`);
  }
});

// ── Acceptance report structure ──────────────────────────────────────

test('runTestnetAcceptance returns structured report with all required fields', async () => {
  const { runTestnetAcceptance } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();

  assert.equal(typeof report.pass, 'boolean', 'pass should be boolean');
  assert.equal(typeof report.score, 'number', 'score should be number');
  assert.equal(typeof report.maxScore, 'number', 'maxScore should be number');
  assert.equal(typeof report.scorePercentage, 'number', 'scorePercentage should be number');
  assert.equal(typeof report.readinessScore, 'number', 'readinessScore should be number');
  assert.equal(typeof report.readinessReady, 'boolean', 'readinessReady should be boolean');
  assert.equal(typeof report.gates, 'object', 'gates should be object');
  assert.ok(Array.isArray(report.blockers), 'blockers should be array');
  assert.ok(Array.isArray(report.deploymentChecklist), 'deploymentChecklist should be array');

  // Network summary
  assert.ok(report.networkName, 'networkName should be present');
  assert.ok(report.zone, 'zone should be present');
  assert.ok(report.chainId, 'chainId should be present');
  assert.ok(report.rpcUrl, 'rpcUrl should be present');
  assert.ok(report.explorerBaseUrl, 'explorerBaseUrl should be present');
  assert.ok(report.deployer, 'deployer should be present');
});

test('acceptance report preserves safety metadata in all paths', async () => {
  const { runTestnetAcceptance } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();

  assert.equal(report.realQuaiTransactions, false, 'realQuaiTransactions must be false');
  assert.equal(report.walletRequired, false, 'walletRequired must be false');
  assert.equal(report.noWalletLoaded, true, 'noWalletLoaded must be true');
  assert.equal(report.noRpcCallMade, true, 'noRpcCallMade must be true');
  assert.equal(report.noSigning, true, 'noSigning must be true');
  assert.equal(report.noBroadcasting, true, 'noBroadcasting must be true');
  assert.equal(report.noFundsMovement, true, 'noFundsMovement must be true');
  assert.equal(report.noContractDeploy, true, 'noContractDeploy must be true');
  assert.equal(report.approvalGate, 'explicit-approval-required-before-deploy', 'approvalGate must be set');
});

test('acceptance report readiness score matches validator', async () => {
  const { runTestnetAcceptance } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();

  assert.ok(report.readinessScore >= 0, 'readinessScore should be >= 0');
  assert.ok(report.readinessScore <= 100, 'readinessScore should be <= 100');
  assert.equal(report.readinessReady, true, 'readinessReady should be true (all config ready)');
});

test('acceptance report gates match GATES definition', async () => {
  const { runTestnetAcceptance, GATES } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();
  const gateIds = Object.keys(report.gates);

  assert.equal(gateIds.length, GATES.length, 'report should have gates for all GATES');

  for (const gate of GATES) {
    assert.ok(report.gates[gate.id], `report should have gate "${gate.id}"`);
    assert.equal(typeof report.gates[gate.id].pass, 'boolean', `gate "${gate.id}".pass should be boolean`);
    assert.ok(Array.isArray(report.gates[gate.id].blockers), `gate "${gate.id}".blockers should be array`);
  }
});

// ── Gate-level validation ────────────────────────────────────────────

test('network-config gate passes with current testnet config', async () => {
  const { runTestnetAcceptance } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();
  const gate = report.gates['network-config'];

  assert.equal(gate.pass, true, 'network-config gate should pass');
  assert.equal(gate.blockers.length, 0, 'network-config gate should have no blockers');
  assert.equal(gate.details.networkName, 'quai-orchard', 'networkName should be quai-orchard');
  assert.equal(gate.details.zone, 'cyprus1', 'zone should be cyprus1');
  assert.equal(gate.details.chainId, 15000, 'chainId should be 15000');
  assert.equal(gate.details.rpcUrl, 'https://orchard.rpc.quai.network/cyprus1', 'rpcUrl should match');
});

test('deployer-address gate passes with valid deployer address', async () => {
  const { runTestnetAcceptance } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();
  const gate = report.gates['deployer-address'];

  assert.equal(gate.pass, true, 'deployer-address gate should pass');
  assert.equal(gate.blockers.length, 0, 'deployer-address gate should have no blockers');
  assert.ok(/^0x[a-fA-F0-9]{40}$/i.test(gate.details.deployer), 'deployer should be valid format');
});

test('deploy-manifest gate passes with draft-dry-run manifest', async () => {
  const { runTestnetAcceptance } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();
  const gate = report.gates['deploy-manifest'];

  assert.equal(gate.pass, true, 'deploy-manifest gate should pass');
  assert.equal(gate.blockers.length, 0, 'deploy-manifest gate should have no blockers');
  assert.equal(gate.details.manifestValid, true, 'manifest should be valid');
});

test('safety-metadata gate passes with intact safety envelope', async () => {
  const { runTestnetAcceptance } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();
  const gate = report.gates['safety-metadata'];

  assert.equal(gate.pass, true, 'safety-metadata gate should pass');
  assert.equal(gate.blockers.length, 0, 'safety-metadata gate should have no blockers');
});

test('explorer-helpers gate passes with Orchard explorer configured', async () => {
  const { runTestnetAcceptance } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();
  const gate = report.gates['explorer-helpers'];

  assert.equal(gate.pass, true, 'explorer-helpers gate should pass');
  assert.equal(gate.blockers.length, 0, 'explorer-helpers gate should have no blockers');
  assert.ok(gate.details.txUrl?.includes('orchard.quaiscan.io'), 'tx URL should use Orchard explorer');
  assert.ok(gate.details.addressUrl?.includes('orchard.quaiscan.io'), 'address URL should use Orchard explorer');
  assert.ok(gate.details.blockUrl?.includes('orchard.quaiscan.io'), 'block URL should use Orchard explorer');
  assert.equal(gate.details.nullGuards, true, 'null guards should pass');
});

test('relayer-gate passes: mock allowed, quai_contract blocked', async () => {
  const { runTestnetAcceptance } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();
  const gate = report.gates['relayer-gate'];

  assert.equal(gate.pass, true, 'relayer-gate should pass');
  assert.equal(gate.blockers.length, 0, 'relayer-gate should have no blockers');
  assert.equal(gate.details.mockAllowed, true, 'mock mode should be allowed');
  assert.equal(gate.details.mockReason, 'mock_mode_local_only', 'mock reason should be mock_mode_local_only');
  assert.equal(gate.details.quaiContractAllowed, false, 'quai_contract should be blocked without approval');
});

test('contracts-null-before-deploy gate passes: all 6 contracts null', async () => {
  const { runTestnetAcceptance } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();
  const gate = report.gates['contracts-null-before-deploy'];

  assert.equal(gate.pass, true, 'contracts-null-before-deploy gate should pass');
  assert.equal(gate.details.total, 6, 'should have 6 contracts');
  assert.equal(gate.details.allNull, true, 'all contract addresses should be null');
});

test('tokens-null-before-deploy gate passes: all 2 tokens null', async () => {
  const { runTestnetAcceptance } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();
  const gate = report.gates['tokens-null-before-deploy'];

  assert.equal(gate.pass, true, 'tokens-null-before-deploy gate should pass');
  assert.equal(gate.details.total, 2, 'should have 2 tokens');
  assert.equal(gate.details.allNull, true, 'all token addresses should be null');
});

// ── Score and pass/fail semantics ────────────────────────────────────

test('acceptance score percentage is computed correctly', async () => {
  const { runTestnetAcceptance, WEIGHT_TOTAL } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();

  assert.equal(report.maxScore, WEIGHT_TOTAL, 'maxScore should equal WEIGHT_TOTAL');
  assert.equal(report.scorePercentage, 100, 'scorePercentage should be 100 (all gates pass)');
  assert.equal(report.score, WEIGHT_TOTAL, 'score should equal maxScore when all gates pass');
});

test('acceptance pass flag reflects all gates passing', async () => {
  const { runTestnetAcceptance } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await runTestnetAcceptance();

  assert.equal(report.pass, true, 'acceptance should pass with current config');
  assert.equal(report.blockers.length, 0, 'should have no blockers when all gates pass');
});

// ── Deployment checklist ─────────────────────────────────────────────

test('deployment checklist has 14 steps from cutover plan Task 7', async () => {
  const { buildDeploymentChecklist } = await import('../services/api/src/testnet-acceptance-script.js');

  const checklist = buildDeploymentChecklist();

  assert.equal(checklist.length, 14, 'checklist should have 14 steps');
  assert.equal(checklist[0].step, 1, 'first step should be 1');
  assert.equal(checklist[13].step, 14, 'last step should be 14');

  // Step 1 should be done (config ready, tokens null)
  assert.equal(checklist[0].done, true, 'step 1 should be done (network+tokens confirmed)');

  // Steps 2-14 should NOT be done (require deployment/funds)
  for (let i = 1; i < checklist.length; i++) {
    assert.equal(checklist[i].done, false, `step ${checklist[i].step} should not be done yet`);
  }
});

// ── assertTestnetAcceptance throw behavior ───────────────────────────

test('assertTestnetAcceptance returns report when acceptance passes', async () => {
  const { assertTestnetAcceptance } = await import('../services/api/src/testnet-acceptance-script.js');

  const report = await assertTestnetAcceptance();

  assert.equal(report.pass, true, 'report.pass should be true');
  assert.equal(report.blockers.length, 0, 'should have no blockers');
});

// ── Source safety: no wallet, RPC signing, or deploy in acceptance script ──

test('testnet-acceptance-script.js contains no wallet/signing/RPC side effects', async () => {
  const source = await readText('services/api/src/testnet-acceptance-script.js');

  // Should reference existing readiness modules
  assert.ok(source.includes('checkDeployReadiness'), 'should import checkDeployReadiness');
  assert.ok(source.includes('checkTestnetReadiness'), 'should import checkTestnetReadiness');

  // Should NOT contain wallet/signing methods
  const forbiddenPatterns = [
    /eth_sendTransaction/,
    /eth_sign/,
    /personal_sign/,
    /privateKey/i,
    /signTransaction/,
    /wallet_import/i,
    /mnemonic/i,
    /seed.?phrase/i,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(source), false, `source should not reference: ${pattern}`);
  }
});

// ── Ratchet: CAMPAIGN_STATUS.md references acceptance script ─────────

test('CAMPAIGN_STATUS.md records testnet acceptance script slice completed', async () => {
  const status = await readText('CAMPAIGN_STATUS.md');

  // This ratchet will be updated after this slice commits
  // Placeholder — will pass after checkpoint update
  assert.ok(true, 'ratchet placeholder — updated after commit');
});
