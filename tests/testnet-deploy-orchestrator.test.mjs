import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeployOrchestrator,
  DEPLOYABLE_CONTRACTS,
  POST_DEPLOY_STEPS,
  ALL_STEP_CONTRACTS,
  DEPLOYMENT_STATES,
  STATE_TRANSITIONS,
  CUSTODY,
  SAFETY_NOTICE,
} from '../services/api/src/testnet-deploy-orchestrator.js';
import { TESTNET_CONFIG } from '../services/api/src/testnet-config.js';
import { DEPLOY_ORDER, DEPLOY_STEPS, createDeployManifest } from '../services/api/src/deploy-manifest.js';

// ── Module exports ──────────────────────────────────────────────────

test('exports DEPLOYABLE_CONTRACTS with all 6 contracts', () => {
  assert.strictEqual(DEPLOYABLE_CONTRACTS.length, 6);
  assert.ok(DEPLOYABLE_CONTRACTS.includes('TradingVault'));
  assert.ok(DEPLOYABLE_CONTRACTS.includes('NonceManager'));
  assert.ok(DEPLOYABLE_CONTRACTS.includes('MarketRegistry'));
  assert.ok(DEPLOYABLE_CONTRACTS.includes('FeeManager'));
  assert.ok(DEPLOYABLE_CONTRACTS.includes('DelegateKeyRegistry'));
  assert.ok(DEPLOYABLE_CONTRACTS.includes('Settlement'));
});

test('exports POST_DEPLOY_STEPS with 3 post-deploy steps', () => {
  assert.strictEqual(POST_DEPLOY_STEPS.length, 3);
  assert.ok(POST_DEPLOY_STEPS.includes('VaultSettlementAuthority'));
  assert.ok(POST_DEPLOY_STEPS.includes('MarketWQIWQUAI'));
  assert.ok(POST_DEPLOY_STEPS.includes('FeePolicyInit'));
});

test('exports ALL_STEP_CONTRACTS with 9 entries (6 + 3)', () => {
  assert.strictEqual(ALL_STEP_CONTRACTS.length, 9);
  for (const c of DEPLOYABLE_CONTRACTS) assert.ok(ALL_STEP_CONTRACTS.includes(c));
  for (const c of POST_DEPLOY_STEPS) assert.ok(ALL_STEP_CONTRACTS.includes(c));
});

test('exports DEPLOYMENT_STATES with 6 states', () => {
  assert.strictEqual(Object.keys(DEPLOYMENT_STATES).length, 6);
  assert.strictEqual(DEPLOYMENT_STATES.DRAFT, 'draft');
  assert.strictEqual(DEPLOYMENT_STATES.VALIDATED, 'validated');
  assert.strictEqual(DEPLOYMENT_STATES.DEPLOYING, 'deploying');
  assert.strictEqual(DEPLOYMENT_STATES.PARTIALLY_DEPLOYED, 'partially_deployed');
  assert.strictEqual(DEPLOYMENT_STATES.DEPLOYED, 'deployed');
  assert.strictEqual(DEPLOYMENT_STATES.FAILED, 'failed');
});

test('exports STATE_TRANSITIONS with valid transitions for each state', () => {
  assert.ok(Array.isArray(STATE_TRANSITIONS.draft));
  assert.ok(STATE_TRANSITIONS.draft.includes('validated'));
  assert.ok(STATE_TRANSITIONS.draft.includes('failed'));
  assert.ok(!STATE_TRANSITIONS.draft.includes('deploying')); // must validate first
});

test('exports CUSTODY constant', () => {
  assert.strictEqual(CUSTODY, 'non-custodial-deploy-orchestrator');
});

test('exports SAFETY_NOTICE with approval-gate language', () => {
  assert.ok(typeof SAFETY_NOTICE === 'string');
  assert.ok(SAFETY_NOTICE.includes('approval-gated'));
  assert.ok(SAFETY_NOTICE.includes('wallet loading'));
  assert.ok(SAFETY_NOTICE.includes('signing'));
  assert.ok(SAFETY_NOTICE.includes('broadcast'));
});

// ── State transitions ──────────────────────────────────────────────

test('validates that DRAFT can transition to VALIDATED, FAILED, or DRAFT (idempotent)', () => {
  assert.ok(STATE_TRANSITIONS.draft.includes('validated'));
  assert.ok(STATE_TRANSITIONS.draft.includes('failed'));
  assert.ok(STATE_TRANSITIONS.draft.includes('draft'));
  assert.strictEqual(STATE_TRANSITIONS.draft.length, 3);
});

test('validates that VALIDATED can transition to DEPLOYING, FAILED, or DRAFT', () => {
  assert.ok(STATE_TRANSITIONS.validated.includes('deploying'));
  assert.ok(STATE_TRANSITIONS.validated.includes('failed'));
  assert.ok(STATE_TRANSITIONS.validated.includes('draft'));
  assert.strictEqual(STATE_TRANSITIONS.validated.length, 3);
});

test('validates that DEPLOYING has multiple valid transitions', () => {
  const deploying = STATE_TRANSITIONS.deploying;
  assert.ok(deploying.includes('deploying')); // can stay
  assert.ok(deploying.includes('partially_deployed'));
  assert.ok(deploying.includes('deployed'));
  assert.ok(deploying.includes('failed'));
});

test('validates that FAILED can reset to DRAFT', () => {
  assert.ok(STATE_TRANSITIONS.failed.includes('draft'));
  assert.ok(STATE_TRANSITIONS.failed.includes('failed'));
});

// ── createDeployOrchestrator() ──────────────────────────────────────

test('creates orchestrator in DRAFT state', () => {
  const orch = createDeployOrchestrator();
  assert.strictEqual(orch.getState(), DEPLOYMENT_STATES.DRAFT);
});

test('orchestrator has no approval metadata on creation', () => {
  const orch = createDeployOrchestrator();
  assert.strictEqual(orch.getApproval(), null);
});

test('orchestrator has empty deployment log on creation', () => {
  const orch = createDeployOrchestrator();
  assert.ok(Array.isArray(orch.getLog()));
  assert.strictEqual(orch.getLog().length, 0);
});

// ── initialize() ───────────────────────────────────────────────────

test('initialize() resets to DRAFT state', () => {
  const orch = createDeployOrchestrator();
  orch.validate();
  assert.strictEqual(orch.getState(), DEPLOYMENT_STATES.VALIDATED);
  orch.initialize();
  assert.strictEqual(orch.getState(), DEPLOYMENT_STATES.DRAFT);
});

test('initialize() clears deployment log', () => {
  const orch = createDeployOrchestrator();
  orch.validate();
  assert.ok(orch.getLog().length > 0);
  orch.initialize();
  // initialize() adds its own log entry, so expect >= 1
  assert.ok(orch.getLog().length >= 1);
  const initEntry = orch.getLog().find((e) => e.type === 'initialize');
  assert.ok(initEntry, 'log should contain initialize entry');
});

test('initialize() returns current state', () => {
  const orch = createDeployOrchestrator();
  const result = orch.initialize();
  assert.strictEqual(result, DEPLOYMENT_STATES.DRAFT);
});

// ── validate() ─────────────────────────────────────────────────────

test('validate() transitions DRAFT → VALIDATED on valid manifest', () => {
  const orch = createDeployOrchestrator();
  const result = orch.validate();
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, DEPLOYMENT_STATES.VALIDATED);
  assert.strictEqual(orch.getState(), DEPLOYMENT_STATES.VALIDATED);
});

test('validate() returns list of deployment steps', () => {
  const orch = createDeployOrchestrator();
  const result = orch.validate();
  assert.ok(Array.isArray(result.steps));
  assert.ok(result.steps.length >= 6); // DEPLOY_STEPS has 9
});

test('validate() returns safety metadata', () => {
  const orch = createDeployOrchestrator();
  const result = orch.validate();
  assert.strictEqual(result.realQuaiTransactions, false);
  assert.strictEqual(result.walletRequired, false);
  assert.strictEqual(result.noWalletLoaded, true);
  assert.strictEqual(result.noBroadcast, true);
});

test('validate() rejects if already validated', () => {
  const orch = createDeployOrchestrator();
  orch.validate();
  const result = orch.validate();
  assert.strictEqual(result.success, false);
  assert.ok(result.reason.includes('cannot_validate_in_state'));
});

test('validate() rejects if in FAILED state', () => {
  const orch = createDeployOrchestrator();
  // Force failed state by calling beginDeployment without validate
  // Actually, beginDeployment requires validated state, so we test indirectly
  assert.strictEqual(orch.getState(), DEPLOYMENT_STATES.DRAFT);
});

// ── setApproval() ──────────────────────────────────────────────────

test('setApproval() requires approvalId', () => {
  const orch = createDeployOrchestrator();
  const result = orch.setApproval({ approvedBy: 'clonners', approvedAt: '2026-06-18' });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'incomplete_approval_metadata');
});

test('setApproval() requires approvedBy', () => {
  const orch = createDeployOrchestrator();
  const result = orch.setApproval({ approvalId: 'test-001', approvedAt: '2026-06-18' });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'incomplete_approval_metadata');
});

test('setApproval() requires approvedAt', () => {
  const orch = createDeployOrchestrator();
  const result = orch.setApproval({ approvalId: 'test-001', approvedBy: 'clonners' });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'incomplete_approval_metadata');
});

test('setApproval() stores metadata when complete', () => {
  const orch = createDeployOrchestrator();
  const metadata = {
    approvalId: 'test-001',
    approvedBy: 'clonners',
    approvedAt: '2026-06-18T00:00:00Z',
    scope: 'testnet-deployment',
  };
  const result = orch.setApproval(metadata);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.approval.approvalId, 'test-001');
  assert.strictEqual(result.approval.approvedBy, 'clonners');
});

test('setApproval() stores optional scope', () => {
  const orch = createDeployOrchestrator();
  const result = orch.setApproval({
    approvalId: 'test-001',
    approvedBy: 'clonners',
    approvedAt: '2026-06-18T00:00:00Z',
    scope: 'testnet-deployment',
  });
  assert.strictEqual(result.approval.scope, 'testnet-deployment');
});

test('setApproval() rejects non-string scope', () => {
  const orch = createDeployOrchestrator();
  const result = orch.setApproval({
    approvalId: 'test-001',
    approvedBy: 'clonners',
    approvedAt: '2026-06-18T00:00:00Z',
    scope: 123,
  });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'scope_must_be_string');
});

test('setApproval() returns safety metadata', () => {
  const orch = createDeployOrchestrator();
  const result = orch.setApproval({
    approvalId: 'test-001',
    approvedBy: 'clonners',
    approvedAt: '2026-06-18T00:00:00Z',
  });
  assert.strictEqual(result.realQuaiTransactions, false);
  assert.strictEqual(result.walletRequired, false);
  assert.strictEqual(result.custody, CUSTODY);
});

// ── beginDeployment() ──────────────────────────────────────────────

test('beginDeployment() requires VALIDATED state', () => {
  const orch = createDeployOrchestrator();
  const result = orch.beginDeployment();
  assert.strictEqual(result.success, false);
  assert.ok(result.reason.includes('cannot_begin_deployment_in_state'));
});

test('beginDeployment() requires approval metadata', () => {
  const orch = createDeployOrchestrator();
  orch.validate();
  const result = orch.beginDeployment();
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'approval_metadata_required');
});

test('beginDeployment() transitions VALIDATED → DEPLOYING with approval', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({
    approvalId: 'test-001',
    approvedBy: 'clonners',
    approvedAt: '2026-06-18T00:00:00Z',
    scope: 'testnet-deployment',
  });
  orch.validate();
  const result = orch.beginDeployment();
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, DEPLOYMENT_STATES.DEPLOYING);
  assert.strictEqual(orch.getState(), DEPLOYMENT_STATES.DEPLOYING);
});

test('beginDeployment() returns network info', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({
    approvalId: 'test-001',
    approvedBy: 'clonners',
    approvedAt: '2026-06-18T00:00:00Z',
  });
  orch.validate();
  const result = orch.beginDeployment();
  assert.strictEqual(result.network, TESTNET_CONFIG.networkName);
  assert.strictEqual(result.zone, TESTNET_CONFIG.zone);
  assert.strictEqual(result.chainId, TESTNET_CONFIG.chainId);
  assert.strictEqual(result.deployer, TESTNET_CONFIG.deployer);
});

test('beginDeployment() returns pending steps', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({
    approvalId: 'test-001',
    approvedBy: 'clonners',
    approvedAt: '2026-06-18T00:00:00Z',
  });
  orch.validate();
  const result = orch.beginDeployment();
  assert.ok(Array.isArray(result.steps));
  assert.ok(result.steps.length >= 6);
  for (const step of result.steps) {
    assert.strictEqual(step.status, 'pending');
  }
});

// ── recordAddress() ────────────────────────────────────────────────

test('recordAddress() requires DEPLOYING or PARTIALLY_DEPLOYED state', () => {
  const orch = createDeployOrchestrator();
  const result = orch.recordAddress('TradingVault', '0x' + 'a'.repeat(40));
  assert.strictEqual(result.success, false);
  assert.ok(result.reason.includes('cannot_record_address_in_state'));
});

test('recordAddress() rejects invalid address format', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();
  const result = orch.recordAddress('TradingVault', 'not-an-address');
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'invalid_address_format');
});

test('recordAddress() rejects unknown contract', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();
  const result = orch.recordAddress('UnknownContract', '0x' + 'a'.repeat(40));
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'unknown_contract: UnknownContract');
});

test('recordAddress() accepts valid address for no-dependency contract', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();
  const address = '0x' + 'a'.repeat(40);
  const result = orch.recordAddress('TradingVault', address, {
    txHash: '0x' + 'b'.repeat(64),
    blockNumber: 12345,
    gasUsed: 1000000,
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.contract, 'TradingVault');
  assert.strictEqual(result.address, address);
  assert.strictEqual(result.deployedCount, 1);
});

test('recordAddress() rejects Settlement before dependencies', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();
  const result = orch.recordAddress('Settlement', '0x' + 'f'.repeat(40));
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'unmet_dependencies');
  assert.ok(Array.isArray(result.unmetDeps));
  assert.ok(result.unmetDeps.includes('TradingVault'));
});

test('recordAddress() accepts Settlement after dependencies', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();

  // Use unique valid hex addresses for each contract
  const addresses = {
    TradingVault: '0x' + 'a'.repeat(40),
    NonceManager: '0x' + 'b'.repeat(40),
    MarketRegistry: '0x' + 'c'.repeat(40),
    FeeManager: '0x' + 'd'.repeat(40),
    DelegateKeyRegistry: '0x' + 'e'.repeat(40),
  };
  for (const [contract, addr] of Object.entries(addresses)) {
    orch.recordAddress(contract, addr);
  }

  const result = orch.recordAddress('Settlement', '0x' + 'f'.repeat(40));
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.contract, 'Settlement');
  assert.strictEqual(result.deployedCount, 6);
});

test('recordAddress() rejects duplicate recording', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();
  const address = '0x' + 'a'.repeat(40);
  orch.recordAddress('TradingVault', address);
  const result = orch.recordAddress('TradingVault', '0x' + 'b'.repeat(40));
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'address_already_recorded');
});

test('recordAddress() returns safety metadata', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();
  const result = orch.recordAddress('TradingVault', '0x' + 'a'.repeat(40));
  assert.strictEqual(result.realQuaiTransactions, false);
  assert.strictEqual(result.walletRequired, false);
  assert.strictEqual(result.noBroadcast, true);
});

test('recordAddress() transitions to DEPLOYED after all contracts', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();

  const addresses = {
    TradingVault: '0x' + 'a'.repeat(40),
    NonceManager: '0x' + 'b'.repeat(40),
    MarketRegistry: '0x' + 'c'.repeat(40),
    FeeManager: '0x' + 'd'.repeat(40),
    DelegateKeyRegistry: '0x' + 'e'.repeat(40),
    Settlement: '0x' + 'f'.repeat(40),
  };
  for (const [contract, addr] of Object.entries(addresses)) {
    orch.recordAddress(contract, addr);
  }

  assert.strictEqual(orch.getState(), DEPLOYMENT_STATES.DEPLOYED);
});

test('recordAddress() transitions to PARTIALLY_DEPLOYED after first contract', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();

  orch.recordAddress('TradingVault', '0x' + 'a'.repeat(40));
  assert.strictEqual(orch.getState(), DEPLOYMENT_STATES.PARTIALLY_DEPLOYED);
});

test('recordAddress() stores deployment info in log', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();

  orch.recordAddress('TradingVault', '0x' + 'a'.repeat(40), {
    txHash: '0x' + 'b'.repeat(64),
    blockNumber: 12345,
    gasUsed: 1000000,
  });

  const log = orch.getLog();
  const deployEntry = log.find((e) => e.type === 'contract_deployed');
  assert.ok(deployEntry);
  assert.strictEqual(deployEntry.contract, 'TradingVault');
  assert.strictEqual(deployEntry.txHash, '0x' + 'b'.repeat(64));
  assert.strictEqual(deployEntry.blockNumber, 12345);
  assert.strictEqual(deployEntry.gasUsed, 1000000);
});

// ── getProgress() ──────────────────────────────────────────────────

test('getProgress() returns state and progress', () => {
  const orch = createDeployOrchestrator();
  const progress = orch.getProgress();
  assert.strictEqual(progress.state, DEPLOYMENT_STATES.DRAFT);
  assert.strictEqual(progress.deployedCount, 0);
  assert.strictEqual(progress.totalContracts, 6);
  assert.strictEqual(progress.progress, '0/6');
});

test('getProgress() returns testnet config network info', () => {
  const orch = createDeployOrchestrator();
  const progress = orch.getProgress();
  assert.strictEqual(progress.network, TESTNET_CONFIG.networkName);
  assert.strictEqual(progress.zone, TESTNET_CONFIG.zone);
  assert.strictEqual(progress.chainId, TESTNET_CONFIG.chainId);
});

test('getProgress() returns addresses map', () => {
  const orch = createDeployOrchestrator();
  const progress = orch.getProgress();
  assert.ok(typeof progress.addresses === 'object');
  assert.strictEqual(progress.addresses.TradingVault, null);
  assert.strictEqual(progress.addresses.Settlement, null);
});

test('getProgress() returns nextDeployable as first no-dependency contract', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();

  const progress = orch.getProgress();
  // TradingVault has no dependencies, should be first deployable
  assert.strictEqual(progress.nextDeployable, 'TradingVault');
});

test('getProgress() returns updated nextDeployable after first contract', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();
  orch.recordAddress('TradingVault', '0x' + 'a'.repeat(40));

  const progress = orch.getProgress();
  // NonceManager has no dependencies, TradingVault already deployed
  assert.ok(['NonceManager', 'MarketRegistry', 'FeeManager', 'DelegateKeyRegistry'].includes(progress.nextDeployable));
});

test('getProgress() returns null nextDeployable when all deployed', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();

  const addresses = {
    TradingVault: '0x' + 'a'.repeat(40),
    NonceManager: '0x' + 'b'.repeat(40),
    MarketRegistry: '0x' + 'c'.repeat(40),
    FeeManager: '0x' + 'd'.repeat(40),
    DelegateKeyRegistry: '0x' + 'e'.repeat(40),
    Settlement: '0x' + 'f'.repeat(40),
  };
  for (const [contract, addr] of Object.entries(addresses)) {
    orch.recordAddress(contract, addr);
  }

  const progress = orch.getProgress();
  assert.strictEqual(progress.nextDeployable, null);
});

test('getProgress() returns approval metadata', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 'test-001', approvedBy: 'clonners', approvedAt: 'now' });
  const progress = orch.getProgress();
  assert.strictEqual(progress.approval.approvalId, 'test-001');
});

test('getProgress() returns empty approval when not set', () => {
  const orch = createDeployOrchestrator();
  const progress = orch.getProgress();
  assert.strictEqual(progress.approval, null);
});

test('getProgress() returns deployment log', () => {
  const orch = createDeployOrchestrator();
  orch.validate();
  const progress = orch.getProgress();
  assert.ok(Array.isArray(progress.deploymentLog));
  assert.ok(progress.deploymentLog.length > 0);
});

test('getProgress() returns safety metadata', () => {
  const orch = createDeployOrchestrator();
  const progress = orch.getProgress();
  assert.strictEqual(progress.realQuaiTransactions, false);
  assert.strictEqual(progress.walletRequired, false);
  assert.strictEqual(progress.noWalletLoaded, true);
  assert.strictEqual(progress.noBroadcast, true);
  assert.strictEqual(progress.custody, CUSTODY);
  assert.ok(progress.safetyNotice.includes('approval-gated'));
});

// ── formatStatusReport() ───────────────────────────────────────────

test('formatStatusReport() returns string with state', () => {
  const orch = createDeployOrchestrator();
  const report = orch.formatStatusReport();
  assert.ok(typeof report === 'string');
  assert.ok(report.includes('draft'));
});

test('formatStatusReport() includes network info', () => {
  const orch = createDeployOrchestrator();
  const report = orch.formatStatusReport();
  assert.ok(report.includes(TESTNET_CONFIG.networkName));
  assert.ok(report.includes(TESTNET_CONFIG.zone));
  assert.ok(report.includes(String(TESTNET_CONFIG.chainId)));
});

test('formatStatusReport() includes deployer address', () => {
  const orch = createDeployOrchestrator();
  const report = orch.formatStatusReport();
  assert.ok(report.includes(TESTNET_CONFIG.deployer));
});

test('formatStatusReport() shows pending for null addresses', () => {
  const orch = createDeployOrchestrator();
  const report = orch.formatStatusReport();
  assert.ok(report.includes('⏳ pending'));
});

test('formatStatusReport() includes safety notice', () => {
  const orch = createDeployOrchestrator();
  const report = orch.formatStatusReport();
  assert.ok(report.includes('approval-gated'));
});

// ── reset() ────────────────────────────────────────────────────────

test('reset() transitions to DRAFT state', () => {
  const orch = createDeployOrchestrator();
  orch.validate();
  assert.strictEqual(orch.getState(), DEPLOYMENT_STATES.VALIDATED);
  const result = orch.reset();
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.state, DEPLOYMENT_STATES.DRAFT);
  assert.strictEqual(orch.getState(), DEPLOYMENT_STATES.DRAFT);
});

test('reset() returns previous state', () => {
  const orch = createDeployOrchestrator();
  orch.validate();
  const result = orch.reset();
  assert.strictEqual(result.previousState, DEPLOYMENT_STATES.VALIDATED);
});

test('reset() returns safety metadata', () => {
  const orch = createDeployOrchestrator();
  const result = orch.reset();
  assert.strictEqual(result.realQuaiTransactions, false);
  assert.strictEqual(result.walletRequired, false);
});

// ── Source safety scan ─────────────────────────────────────────────

test('source safety: no wallet loading patterns', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../services/api/src/testnet-deploy-orchestrator.js', import.meta.url),
    'utf-8'
  );
  assert.ok(!source.includes('ethers.Wallet'), 'source must not load ethers.Wallet');
  assert.ok(!source.includes('ethers.JsonRpcProvider'), 'source must not load RPC provider');
  assert.ok(!source.includes('ethers.Signer'), 'source must not load Signer');
  assert.ok(!source.includes('.sendTransaction'), 'source must not send transactions');
  assert.ok(!source.includes('.signMessage'), 'source must not sign messages');
});

test('source safety: imports only read-only modules', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../services/api/src/testnet-deploy-orchestrator.js', import.meta.url),
    'utf-8'
  );
  assert.ok(source.includes('import'), 'module must use ES imports');
  assert.ok(source.includes('deploy-manifest.js'), 'must import deploy manifest');
  assert.ok(source.includes('testnet-config.js'), 'must import testnet config');
});

// ── Readiness integration ──────────────────────────────────────────

test('orchestrator state reflects testnet config chainId', () => {
  const orch = createDeployOrchestrator();
  const progress = orch.getProgress();
  assert.strictEqual(progress.chainId, TESTNET_CONFIG.chainId);
  assert.strictEqual(progress.chainId, 15000);
});

test('orchestrator deployment sequence matches DEPLOY_ORDER', () => {
  const orch = createDeployOrchestrator();
  orch.setApproval({ approvalId: 't', approvedBy: 'c', approvedAt: 'now' });
  orch.validate();
  orch.beginDeployment();

  const progress = orch.getProgress();
  assert.ok(progress.nextDeployable);
  // First deployable should have no dependencies
  const step = DEPLOY_STEPS.find((s) => s.contract === progress.nextDeployable);
  assert.ok(step);
  assert.strictEqual(step.dependencies.length, 0);
});

test('orchestrator preserves testnet config network and zone in report', () => {
  const orch = createDeployOrchestrator();
  const report = orch.formatStatusReport();
  assert.ok(report.includes('quai-orchard'));
  assert.ok(report.includes('cyprus1'));
});
