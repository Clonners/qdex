/**
 * Testnet deployment status — read-only aggregation endpoint for deployment readiness.
 *
 * This module consolidates all testnet readiness evidence (config completeness,
 * deploy manifest, safety metadata, explorer helpers, contract/token address
 * tracking, relayer gate state) into a single structured deployment status report.
 * It is designed as the primary operator-facing view before deployment.
 *
 * Boundaries:
 * - Read-only aggregation only. No RPC calls, no wallet loading, no signing,
 *   no broadcasting, no deployment, no funds movement.
 * - Uses existing synchronous readiness modules (no async probes by default).
 * - Fail-closed: missing config fields produce explicit blockers.
 * - Safety metadata is always present in every response.
 * - The report distinguishes "ready for deployment" from "approved for deployment".
 */

import { TESTNET_CONFIG } from './testnet-config.js';
import { checkDeployReadiness } from './deploy-readiness-check.js';
import { checkTestnetReadiness } from './testnet-readiness-validator.js';
import { createDeployManifest, validateDeployManifest, DEPLOY_ORDER } from './deploy-manifest.js';

// ── Helper functions ─────────────────────────────────────────────────

function getContractStatus() {
  const contracts = TESTNET_CONFIG.contracts;
  const entries = Object.entries(contracts).map(([name, address]) => ({
    name,
    address: address ?? null,
    deployed: typeof address === 'string' && address !== '',
  }));

  const deployedCount = entries.filter((e) => e.deployed).length;
  const totalCount = entries.length;

  return {
    total: totalCount,
    deployed: deployedCount,
    pending: totalCount - deployedCount,
    contracts: entries,
    allDeployed: deployedCount === totalCount,
    allNull: deployedCount === 0,
  };
}

function getTokenStatus() {
  const tokens = TESTNET_CONFIG.tokens;
  const entries = Object.entries(tokens).map(([name, address]) => ({
    name,
    address: address ?? null,
    configured: typeof address === 'string' && address !== '',
  }));

  const configuredCount = entries.filter((e) => e.configured).length;
  const totalCount = entries.length;

  return {
    total: totalCount,
    configured: configuredCount,
    missing: totalCount - configuredCount,
    tokens: entries,
    allConfigured: configuredCount === totalCount,
  };
}

function getManifestStatus() {
  const manifest = createDeployManifest();
  const validation = validateDeployManifest(manifest);

  return {
    mode: manifest.mode,
    valid: validation.valid,
    errors: validation.errors ?? [],
    steps: manifest.steps.map((s) => ({
      contract: s.contract,
      status: s.status,
      address: s.address ?? null,
      dependencies: s.dependencies,
      noWithdraw: s.noWithdraw,
      noAdmin: s.noAdmin,
    })),
    canBroadcast: manifest.canBroadcast,
    deployed: manifest.deployed,
    realQuaiTransactions: manifest.realQuaiTransactions,
    walletRequired: manifest.walletRequired,
  };
}

function getDeploymentOrder() {
  return DEPLOY_ORDER.map((step) => ({
    contract: step.contract,
    dependencies: step.dependencies,
    description: step.description ?? null,
  }));
}

function computeVerdict(deployReadiness, testnetReadiness, contractStatus, tokenStatus) {
  const blockers = [];
  const warnings = [];

  // Config blockers
  if (!deployReadiness.config.ready) {
    blockers.push(...deployReadiness.config.blockers.map((b) => `config: ${b}`));
  }

  // Manifest blockers
  if (!deployReadiness.manifest.ready) {
    blockers.push(...deployReadiness.manifest.blockers.map((b) => `manifest: ${b}`));
  }

  // Safety blockers
  if (!deployReadiness.safety.safe) {
    blockers.push(...deployReadiness.safety.blockers.map((b) => `safety: ${b}`));
  }

  // Token warnings (not blockers before deploy)
  if (!tokenStatus.allConfigured) {
    warnings.push(`tokens: ${tokenStatus.missing}/${tokenStatus.total} not configured (expected before deploy)`);
  }

  // Contract status (not a blocker before deploy)
  if (!contractStatus.allDeployed && !contractStatus.allNull) {
    blockers.push(`contracts: partial deployment detected (${contractStatus.deployed}/${contractStatus.total})`);
  }

  // Readiness score
  const score = testnetReadiness.score;
  if (score < 100) {
    warnings.push(`readiness score: ${score}/100`);
  }

  return {
    verdict: blockers.length === 0 ? 'READY' : 'BLOCKED',
    emoji: blockers.length === 0 ? '✅' : '🚫',
    blockers,
    warnings,
    score,
    deployerConfirmed: Boolean(TESTNET_CONFIG.deployer),
    rpcConfigured: Boolean(TESTNET_CONFIG.rpcUrl),
    chainIdConfigured: Boolean(TESTNET_CONFIG.chainId),
    explorerConfigured: Boolean(TESTNET_CONFIG.explorerBaseUrl),
    contractsDeployed: contractStatus.deployed,
    contractsTotal: contractStatus.total,
    tokensConfigured: tokenStatus.configured,
    tokensTotal: tokenStatus.total,
  };
}

// ── Main export ──────────────────────────────────────────────────────

/**
 * Compute the full testnet deployment status report.
 *
 * @returns {object} — Deployment status report
 */
export function getTestnetDeploymentStatus() {
  const deployReadiness = checkDeployReadiness();
  const testnetReadiness = checkTestnetReadiness();
  const contractStatus = getContractStatus();
  const tokenStatus = getTokenStatus();
  const manifestStatus = getManifestStatus();
  const deploymentOrder = getDeploymentOrder();
  const verdict = computeVerdict(deployReadiness, testnetReadiness, contractStatus, tokenStatus);

  // Deployment checklist progress
  const checklist = buildDeploymentChecklist(contractStatus, tokenStatus);

  return {
    // Network identity
    networkName: TESTNET_CONFIG.networkName,
    zone: TESTNET_CONFIG.zone,
    chainId: TESTNET_CONFIG.chainId,
    rpcUrl: TESTNET_CONFIG.rpcUrl || null,
    explorerBaseUrl: TESTNET_CONFIG.explorerBaseUrl || null,
    deployer: TESTNET_CONFIG.deployer || null,
    mode: TESTNET_CONFIG.mode,

    // Verdict
    verdict: verdict.verdict,
    verdictEmoji: verdict.emoji,
    readinessScore: verdict.score,

    // Blockers and warnings
    blockers: verdict.blockers,
    warnings: verdict.warnings,
    blockerCount: verdict.blockers.length,
    warningCount: verdict.warnings.length,

    // Sub-reports
    config: {
      ready: deployReadiness.config.ready,
      blockers: deployReadiness.config.blockers,
      warnings: deployReadiness.config.warnings,
    },
    manifest: manifestStatus,
    safety: {
      safe: deployReadiness.safety.safe,
      blockers: deployReadiness.safety.blockers,
    },
    contracts: contractStatus,
    tokens: tokenStatus,
    deploymentOrder,

    // Deployment checklist (cutover plan Task 7)
    checklist,

    // Safety metadata — always present
    realQuaiTransactions: false,
    walletRequired: false,
    noWalletLoaded: true,
    noRpcCallMade: true,
    noSigning: true,
    noBroadcasting: true,
    noFundsMovement: true,
    noContractDeploy: true,
    approvalGate: 'explicit-approval-required-before-deploy',
    custody: 'non-custodial-deploy-status',
  };
}

/**
 * Build the deployment checklist with current completion status.
 *
 * @param {object} contractStatus
 * @param {object} tokenStatus
 * @returns {Array} — Checklist items
 */
function buildDeploymentChecklist(contractStatus, tokenStatus) {
  const networkConfirmed = Boolean(
    TESTNET_CONFIG.rpcUrl &&
    TESTNET_CONFIG.chainId &&
    TESTNET_CONFIG.explorerBaseUrl &&
    TESTNET_CONFIG.networkName &&
    TESTNET_CONFIG.zone
  );

  const deployerConfirmed = Boolean(
    TESTNET_CONFIG.deployer &&
    /^0x[a-fA-F0-9]{40}$/i.test(TESTNET_CONFIG.deployer)
  );

  return [
    { step: 1, item: 'Confirm network, zone, chain ID, RPC, explorer, and test token addresses', done: networkConfirmed && tokenStatus.allConfigured },
    { step: 2, item: 'Confirm test wallet funding and signing path', done: false },
    { step: 3, item: 'Deploy contracts and record addresses', done: contractStatus.allDeployed },
    { step: 4, item: 'Verify local contract invariants against deployed ABI/source', done: false },
    { step: 5, item: 'Enable WQI/WQUAI market', done: false },
    { step: 6, item: 'Deposit test WQI/WQUAI into TradingVault', done: false },
    { step: 7, item: 'Sign maker and taker orders', done: false },
    { step: 8, item: 'Let matcher cross', done: false },
    { step: 9, item: 'Relayer submits one settlement transaction', done: false },
    { step: 10, item: 'Wait for receipt/finality', done: false },
    { step: 11, item: 'Index TradeSettled event', done: false },
    { step: 12, item: 'API/SDK/CLI/UI show proof with real tx/block/event evidence', done: false },
    { step: 13, item: 'Owner withdraws test funds', done: false },
    { step: 14, item: 'Archive manifest, logs, and verification output with secrets redacted', done: false },
  ];
}

/**
 * Format a human-readable deployment status report for operator review.
 *
 * @returns {string} — Formatted status report
 */
export function formatDeploymentStatusReport() {
  const status = getTestnetDeploymentStatus();
  const lines = [];

  lines.push(`QDEX Testnet Deployment Status`);
  lines.push(`  Verdict: ${status.verdictEmoji} ${status.verdict}`);
  lines.push(`  Score: ${status.readinessScore}/100`);
  lines.push(`  Network: ${status.networkName} / ${status.zone} (chainId ${status.chainId})`);
  lines.push(`  Deployer: ${status.deployer ?? 'not configured'}`);
  lines.push('');

  // Contracts
  lines.push(`  Contracts: ${status.contracts.deployed}/${status.contracts.total} deployed`);
  for (const c of status.contracts.contracts) {
    const icon = c.deployed ? '✅' : '⏳';
    lines.push(`    ${icon} ${c.name}: ${c.address ?? 'pending'}`);
  }
  lines.push('');

  // Tokens
  lines.push(`  Tokens: ${status.tokens.configured}/${status.tokens.total} configured`);
  for (const t of status.tokens.tokens) {
    const icon = t.configured ? '✅' : '⏳';
    lines.push(`    ${icon} ${t.name}: ${t.address ?? 'pending'}`);
  }
  lines.push('');

  // Blockers
  if (status.blockers.length > 0) {
    lines.push('  Blockers:');
    for (const b of status.blockers) {
      lines.push(`    🚫 ${b}`);
    }
    lines.push('');
  }

  // Warnings
  if (status.warnings.length > 0) {
    lines.push('  Warnings:');
    for (const w of status.warnings) {
      lines.push(`    ⚠️ ${w}`);
    }
    lines.push('');
  }

  // Safety
  lines.push('  Safety:');
  lines.push(`    realQuaiTransactions: ${status.realQuaiTransactions}`);
  lines.push(`    walletRequired: ${status.walletRequired}`);
  lines.push(`    noWalletLoaded: ${status.noWalletLoaded}`);
  lines.push(`    approvalGate: ${status.approvalGate}`);
  lines.push('');

  lines.push('  ── Deployment Checklist ──');
  for (const item of status.checklist) {
    const icon = item.done ? '✅' : '⬜';
    lines.push(`    ${icon} Step ${item.step}: ${item.item}`);
  }

  return lines.join('\n');
}

export { getContractStatus, getTokenStatus, getManifestStatus, getDeploymentOrder, computeVerdict, buildDeploymentChecklist };
