/**
 * Deploy readiness check — fail-closed gate before testnet contract deployment.
 *
 * This module consolidates the deploy manifest validation, testnet config
 * completeness, and safety metadata into a single readiness report.
 *
 * Boundaries:
 * - Read-only validation only. No RPC calls, no wallet loading, no signing,
 *   no broadcasting, no deployment, no funds movement.
 * - Returns a structured report that names every blocker or readiness signal.
 * - Fail-closed: any missing required field produces a blocker.
 * - Safety metadata is always present in the report.
 */

import { TESTNET_CONFIG } from './testnet-config.js';
import { createDeployManifest, validateDeployManifest, DEPLOY_ORDER } from './deploy-manifest.js';

/**
 * Check whether the testnet config has all required fields for deployment.
 *
 * @returns {{ready: boolean, blockers: string[], warnings: string[]}}
 */
function checkConfigCompleteness() {
  const blockers = [];
  const warnings = [];

  // Required fields for deployment
  if (!TESTNET_CONFIG.rpcUrl) {
    blockers.push('rpcUrl not configured');
  }

  if (!TESTNET_CONFIG.chainId) {
    blockers.push('chainId not configured');
  } else {
    warnings.push(`chainId: ${TESTNET_CONFIG.chainId} (must match target network)`);
  }

  if (!TESTNET_CONFIG.networkName) {
    blockers.push('networkName not configured');
  }

  if (!TESTNET_CONFIG.zone) {
    blockers.push('zone not configured');
  }

  if (!TESTNET_CONFIG.explorerBaseUrl) {
    warnings.push('explorerBaseUrl not configured (recommended for deployment verification)');
  }

  if (!TESTNET_CONFIG.deployer) {
    blockers.push('deployer address not configured');
  } else {
    // Validate deployer address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(TESTNET_CONFIG.deployer)) {
      blockers.push('deployer address has invalid format');
    }
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
  };
}

/**
 * Check deploy manifest health — validates the draft manifest and reports
 * deployment status.
 *
 * @returns {{ready: boolean, manifestValid: boolean, blockers: string[], steps: Array}}
 */
function checkDeployManifest() {
  const manifest = createDeployManifest();
  const validation = validateDeployManifest(manifest);

  const blockers = [];

  if (!validation.valid) {
    blockers.push(`deploy manifest invalid: ${validation.errors.join('; ')}`);
  }

  if (validation.realAddressesPresent) {
    blockers.push('deploy manifest contains real addresses without approval metadata');
  }

  // Check that mode is draft-dry-run (not deployed)
  if (manifest.mode !== 'draft-dry-run') {
    blockers.push(`deploy manifest mode is "${manifest.mode}", expected "draft-dry-run"`);
  }

  // Verify all steps are pending
  const nonPendingSteps = manifest.steps.filter((s) => s.status !== 'pending');
  if (nonPendingSteps.length > 0) {
    const names = nonPendingSteps.map((s) => `${s.contract} (${s.status})`).join(', ');
    blockers.push(`steps not all pending: ${names}`);
  }

  return {
    ready: blockers.length === 0,
    manifestValid: validation.valid,
    blockers,
    steps: manifest.steps.map((s) => ({
      contract: s.contract,
      status: s.status,
      address: s.address,
      dependencies: s.dependencies,
      noWithdraw: s.noWithdraw,
      noAdmin: s.noAdmin,
    })),
  };
}

/**
 * Check safety metadata integrity — verifies that no real-network side effects
 * are accidentally enabled.
 *
 * @returns {{safe: boolean, blockers: string[]}}
 */
function checkSafetyMetadata() {
  const blockers = [];

  // Testnet config safety
  if (TESTNET_CONFIG.mode === 'live') {
    blockers.push('testnet config mode is "live", expected "testnet-ready" or "prepare-only"');
  }

  const manifest = createDeployManifest();
  if (manifest.canBroadcast !== false) {
    blockers.push('deploy manifest canBroadcast is not false');
  }
  if (manifest.deployed !== false) {
    blockers.push('deploy manifest deployed is not false');
  }
  if (manifest.realQuaiTransactions !== false) {
    blockers.push('deploy manifest realQuaiTransactions is not false');
  }
  if (manifest.walletRequired !== false) {
    blockers.push('deploy manifest walletRequired is not false');
  }

  // Verify all steps preserve noWithdraw and noAdmin
  for (const step of manifest.steps) {
    if (step.noWithdraw !== true) {
      blockers.push(`${step.contract} step missing noWithdraw: true`);
    }
    if (step.noAdmin !== true) {
      blockers.push(`${step.contract} step missing noAdmin: true`);
    }
  }

  return {
    safe: blockers.length === 0,
    blockers,
  };
}

/**
 * Run the full deploy readiness check.
 *
 * Returns a structured report with:
 * - `ready`: boolean — true only if all sub-checks pass
 * - `config`: config completeness result
 * - `manifest`: deploy manifest health result
 * - `safety`: safety metadata result
 * - `blockers`: consolidated list of all blockers
 * - `deploymentOrder`: canonical deployment order with dependency info
 * - Safety metadata
 *
 * @returns {object} — Deploy readiness report
 */
export function checkDeployReadiness() {
  const config = checkConfigCompleteness();
  const manifest = checkDeployManifest();
  const safety = checkSafetyMetadata();

  const allBlockers = [
    ...config.blockers.map((b) => `config: ${b}`),
    ...manifest.blockers.map((b) => `manifest: ${b}`),
    ...safety.blockers.map((b) => `safety: ${b}`),
  ];

  return {
    ready: config.ready && manifest.ready && safety.safe,
    config,
    manifest,
    safety,
    blockers: allBlockers,

    // Deployment order reference
    deploymentOrder: DEPLOY_ORDER.map((step) => ({
      contract: step.contract,
      dependencies: step.dependencies,
      description: step.description,
    })),

    // Network info (read-only metadata)
    networkName: TESTNET_CONFIG.networkName,
    zone: TESTNET_CONFIG.zone,
    chainId: TESTNET_CONFIG.chainId,
    rpcUrl: TESTNET_CONFIG.rpcUrl || null,
    explorerBaseUrl: TESTNET_CONFIG.explorerBaseUrl || null,
    deployer: TESTNET_CONFIG.deployer || null,

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
  };
}

/**
 * Check deploy readiness and throw if not ready.
 *
 * Use this as a pre-deploy gate that fails loudly.
 *
 * @throws {Error} — with consolidated blocker list if not ready
 * @returns {object} — Deploy readiness report (same as checkDeployReadiness)
 */
export function assertDeployReady() {
  const report = checkDeployReadiness();

  if (!report.ready) {
    throw new Error(
      `Deploy readiness check FAILED with ${report.blockers.length} blocker(s):\n` +
      report.blockers.map((b) => `  - ${b}`).join('\n')
    );
  }

  return report;
}

export { checkConfigCompleteness, checkDeployManifest, checkSafetyMetadata };
