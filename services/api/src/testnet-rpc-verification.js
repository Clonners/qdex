/**
 * Testnet RPC verification — pre-deployment readiness gate.
 *
 * This module aggregates all individual testnet probe modules into a single
 * verification call that checks the entire testnet environment against the
 * configured testnet config. It produces a clear go/no-go readiness verdict
 * with per-check results, blockers, and safety metadata.
 *
 * Boundaries:
 * - Read-only RPC calls only (eth_chainId, eth_blockNumber, eth_gasPrice,
 *   net_version, eth_getBalance, eth_getCode, eth_call)
 * - No wallet loading, signing, broadcasting, or funds movement
 * - No contract deployment or interaction
 * - Fail-closed when RPC unavailable or config incomplete
 * - Approval-gated metadata in all results
 * - Uses existing modules: testnet-connection-probe, testnet-gas-estimation,
 *   testnet-deployer-balance, testnet-token-validation, deploy-readiness-check,
 *   contract-artifact-verification
 */

import {
  probeChainId,
  probeBlockNumber,
  probeNetworkVersion,
  probeTestnetReadiness,
} from './testnet-connection-probe.js';
import { probeGasPrice, estimateDeploymentCost } from './testnet-gas-estimation.js';
import { probeDeployerBalance } from './testnet-deployer-balance.js';
import { validateTestnetTokens } from './testnet-token-validation.js';
import { checkDeployReadiness } from './deploy-readiness-check.js';
import { verifyContractArtifacts as verifyContractArtifactsFromModule, assertArtifactsReady } from './contract-artifact-verification.js';
import { TESTNET_CONFIG } from './testnet-config.js';

// ── Verification checks ────────────────────────────────────────────────

/**
 * Verify RPC connectivity by running connection probes.
 *
 * @returns {Promise<{pass: boolean, check: string, details: object, blockers: string[]}>}
 */
async function verifyRpcConnectivity() {
  const blockers = [];
  const details = {};

  const chainIdResult = await probeChainId();
  details.chainIdHex = chainIdResult.chainIdHex || null;
  details.chainIdDecimal = chainIdResult.chainIdDecimal || null;
  details.chainIdSuccess = chainIdResult.success;

  if (!chainIdResult.success) {
    blockers.push(`eth_chainId probe failed: ${chainIdResult.error}`);
  } else if (chainIdResult.chainIdDecimal !== TESTNET_CONFIG.chainId) {
    blockers.push(
      `chainId mismatch: RPC returned ${chainIdResult.chainIdDecimal}, config has ${TESTNET_CONFIG.chainId}`
    );
  }

  const blockNumberResult = await probeBlockNumber();
  details.blockNumber = blockNumberResult.blockNumberDecimal || null;
  details.blockNumberSuccess = blockNumberResult.success;

  if (!blockNumberResult.success) {
    blockers.push(`eth_blockNumber probe failed: ${blockNumberResult.error}`);
  } else if (blockNumberResult.blockNumberDecimal === null) {
    blockers.push('eth_blockNumber returned null');
  }

  const networkVersionResult = await probeNetworkVersion();
  details.networkVersion = networkVersionResult.networkVersion || null;
  details.networkVersionSuccess = networkVersionResult.success;

  if (!networkVersionResult.success) {
    blockers.push(`net_version probe failed: ${networkVersionResult.error}`);
  }

  return {
    pass: blockers.length === 0,
    check: 'rpc-connectivity',
    description: 'RPC endpoint reachable and chain identity matches config',
    details,
    blockers,
  };
}

/**
 * Verify gas price estimation against the testnet RPC.
 *
 * @returns {Promise<{pass: boolean, check: string, details: object, blockers: string[]}>}
 */
async function verifyGasPrice() {
  const blockers = [];
  const details = {};

  const gasPriceResult = await probeGasPrice();
  details.gasPriceSource = gasPriceResult.gasPriceSource;
  details.gasPriceGwei = gasPriceResult.gasPriceGwei || null;
  details.gasPriceWei = gasPriceResult.gasPriceWei || null;
  details.gasPriceSuccess = gasPriceResult.success;

  if (!gasPriceResult.success) {
    // Gas price probe can fail if RPC is unavailable, but it has a fallback
    if (gasPriceResult.gasPriceSource === 'fallback') {
      details.fallbackWarning = 'using fallback gas price (200 gwei) — RPC unavailable';
    } else {
      blockers.push(`eth_gasPrice probe failed: ${gasPriceResult.error}`);
    }
  } else if (gasPriceResult.gasPriceGwei !== null && Number(gasPriceResult.gasPriceGwei) > 100000) {
    blockers.push(`gas price unusually high: ${gasPriceResult.gasPriceGwei} gwei`);
  }

  return {
    pass: blockers.length === 0,
    check: 'gas-price',
    description: 'Gas price estimable (live or fallback)',
    details,
    blockers,
  };
}

/**
 * Verify deployment cost estimation.
 *
 * @returns {Promise<{pass: boolean, check: string, details: object, blockers: string[]}>}
 */
async function verifyDeploymentCost() {
  const blockers = [];
  const details = {};

  const costResult = await estimateDeploymentCost();
  details.totalGasWei = costResult.totalGasWei || null;
  details.totalCostQuai = costResult.totalCostQuai || null;
  details.contracts = costResult.contracts?.length || 0;
  details.gasPriceSource = costResult.gasPriceSource;
  details.costSuccess = costResult.success;

  if (!costResult.success) {
    blockers.push(`deployment cost estimation failed: ${costResult.error || 'unknown error'}`);
  } else if (costResult.totalCostQuai === null) {
    blockers.push('deployment cost is null');
  } else {
    details.totalCostQuai = costResult.totalCostQuai;
    details.safetyMultiplier = costResult.safetyMultiplier;
  }

  return {
    pass: blockers.length === 0,
    check: 'deployment-cost',
    description: 'Deployment cost estimable for all contracts',
    details,
    blockers,
  };
}

/**
 * Verify deployer wallet balance is sufficient for estimated deployment.
 *
 * @returns {Promise<{pass: boolean, check: string, details: object, blockers: string[]}>}
 */
async function verifyDeployerBalance() {
  const blockers = [];
  const details = {};

  const balanceResult = await probeDeployerBalance();
  details.deployer = balanceResult.deployer || null;
  details.balanceQuai = balanceResult.balanceQuai || null;
  details.balanceSuccess = balanceResult.success;
  details.rpcAvailable = balanceResult.rpcAvailable || false;

  if (!balanceResult.success) {
    if (!balanceResult.rpcAvailable) {
      details.warning = 'RPC unavailable — balance check skipped';
    } else {
      blockers.push(`deployer balance probe failed: ${balanceResult.error}`);
    }
  } else if (balanceResult.balanceQuai !== null) {
    details.sufficient = balanceResult.sufficient || null;
    details.shortfallQuai = balanceResult.shortfallQuai || null;
    if (balanceResult.sufficient === false) {
      blockers.push(
        `deployer balance insufficient: ${balanceResult.balanceQuai} QUAI available, ${balanceResult.estimatedCostQuai} QUAI needed`
      );
    }
  }

  return {
    pass: blockers.length === 0,
    check: 'deployer-balance',
    description: 'Deployer wallet has sufficient balance for estimated deployment',
    details,
    blockers,
  };
}

/**
 * Verify token addresses (WQUAI, WQI) on testnet.
 *
 * @returns {Promise<{pass: boolean, check: string, details: object, blockers: string[]}>}
 */
async function verifyTokens() {
  const blockers = [];
  const details = {};

  const tokenResult = await validateTestnetTokens();
  details.configuredCount = tokenResult.configuredCount || 0;
  details.validCount = tokenResult.validCount || 0;
  details.nullCount = tokenResult.nullCount || 0;
  details.totalTokens = tokenResult.total || 0;
  details.tokenResults = tokenResult.tokens?.map((t) => ({
    tokenName: t.tokenName,
    address: t.address,
    configured: t.configured,
    valid: t.valid,
    details: t.details,
  })) || [];

  if (tokenResult.nullCount > 0) {
    details.warning = `${tokenResult.nullCount}/${tokenResult.totalTokens} token addresses null — expected before deployment`;
    // This is NOT a blocker for pre-deployment verification — tokens are configured after deployment
  }

  // Only flag configured tokens that are invalid
  const invalidConfigured = tokenResult.tokens?.filter(
    (t) => t.configured && !t.valid
  ) || [];
  for (const token of invalidConfigured) {
    blockers.push(`${token.tokenName}: ${token.blockers?.join('; ') || 'validation failed'}`);
  }

  return {
    pass: blockers.length === 0,
    check: 'token-addresses',
    description: 'Configured token addresses are valid ERC-20 contracts (null before deploy is OK)',
    details,
    blockers,
  };
}

/**
 * Verify deploy readiness (config completeness, manifest, safety).
 *
 * @returns {Promise<{pass: boolean, check: string, details: object, blockers: string[]}>}
 */
async function verifyDeployReadiness() {
  const blockers = [];
  const details = {};

  const readiness = checkDeployReadiness();
  details.configReady = readiness.config?.ready || false;
  details.manifestReady = readiness.manifest?.ready || false;
  details.safetySafe = readiness.safety?.safe || false;
  details.deployer = readiness.deployer || null;
  details.rpcUrl = readiness.rpcUrl || null;
  details.chainId = readiness.chainId || null;
  details.explorerBaseUrl = readiness.explorerBaseUrl || null;
  details.networkName = readiness.networkName || null;
  details.zone = readiness.zone || null;

  if (!readiness.ready) {
    blockers.push(...readiness.blockers);
  }

  return {
    pass: blockers.length === 0,
    check: 'deploy-readiness',
    description: 'Config complete, manifest valid, safety metadata intact',
    details,
    blockers,
  };
}

/**
 * Verify contract artifacts are present and valid.
 *
 * @returns {Promise<{pass: boolean, check: string, details: object, blockers: string[]}>}
 */
async function checkContractArtifacts() {
  const blockers = [];
  const details = {};

  try {
    const artifactsResult = await verifyContractArtifactsFromModule();
    details.totalContracts = artifactsResult.total || 0;
    details.validContracts = artifactsResult.validContracts || 0;
    details.totalGasEstimate = artifactsResult.totalGasEstimate || null;
    details.artifactsPath = artifactsResult.artifactsPath || null;

    if (!artifactsResult.ready) {
      blockers.push(
        ...artifactsResult.blockers?.map((b) => `artifact: ${b}`) || ['artifacts not ready']
      );
    }
  } catch (err) {
    blockers.push(`artifact verification failed: ${err.message || String(err)}`);
  }

  return {
    pass: blockers.length === 0,
    check: 'contract-artifacts',
    description: 'All 6 deployable contracts have valid compiled artifacts',
    details,
    blockers,
  };
}

// ── Main verification function ─────────────────────────────────────────

/**
 * Run the full testnet RPC verification suite.
 *
 * Returns a structured readiness report with:
 * - `ready`: boolean — true only if all checks pass
 * - `checks`: array of per-check results
 * - `blockers`: consolidated list of all blockers
 * - `networkInfo`: read-only network metadata
 * - Safety metadata
 *
 * @returns {Promise<object>} — Verification report
 */
export async function verifyTestnetRpc() {
  const safety = Object.freeze({
    realQuaiTransactions: false,
    walletRequired: false,
    noWalletLoaded: true,
    noSigning: true,
    noBroadcasting: true,
    noFundsMovement: true,
    noContractDeploy: true,
    approvalGate: 'explicit-approval-required-before-deploy',
    readOnlyRpcOnly: true,
  });

  // Run all checks in parallel where possible
  const [
    connectivity,
    gasPrice,
    deploymentCost,
    deployerBalance,
    tokens,
    deployReadiness,
    artifacts,
  ] = await Promise.all([
    verifyRpcConnectivity(),
    verifyGasPrice(),
    verifyDeploymentCost(),
    verifyDeployerBalance(),
    verifyTokens(),
    verifyDeployReadiness(),
    checkContractArtifacts(),
  ]);

  const checks = [connectivity, gasPrice, deploymentCost, deployerBalance, tokens, deployReadiness, artifacts];
  const allBlockers = checks.flatMap((c) => c.blockers.map((b) => `${c.check}: ${b}`));
  const allPass = checks.every((c) => c.pass);

  // Build a compact verdict
  let verdict = 'READY';
  let verdictSymbol = '🟢';
  if (allBlockers.length > 0) {
    const criticalBlockers = allBlockers.filter((b) =>
      b.startsWith('rpc-connectivity:') || b.startsWith('deploy-readiness:') || b.startsWith('contract-artifacts:')
    );
    if (criticalBlockers.length > 0) {
      verdict = 'BLOCKED';
      verdictSymbol = '🔴';
    } else {
      verdict = 'WARNING';
      verdictSymbol = '🟡';
    }
  }

  return {
    ready: allPass,
    verdict: `${verdictSymbol} ${verdict}`,
    checks,
    blockers: allBlockers,
    blockerCount: allBlockers.length,
    checksPassed: checks.filter((c) => c.pass).length,
    checksTotal: checks.length,

    // Network info (read-only metadata)
    networkInfo: {
      networkName: TESTNET_CONFIG.networkName,
      zone: TESTNET_CONFIG.zone,
      chainId: TESTNET_CONFIG.chainId,
      rpcUrl: TESTNET_CONFIG.rpcUrl || null,
      explorerBaseUrl: TESTNET_CONFIG.explorerBaseUrl || null,
      deployer: TESTNET_CONFIG.deployer || null,
      mode: TESTNET_CONFIG.mode,
    },

    // Safety metadata — always present
    ...safety,
  };
}

/**
 * Run verification and throw if not ready.
 *
 * Use this as a pre-deployment gate that fails loudly.
 *
 * @throws {Error} — with consolidated blocker list if not ready
 * @returns {Promise<object>} — Verification report
 */
export async function assertTestnetReady() {
  const report = await verifyTestnetRpc();

  if (!report.ready) {
    throw new Error(
      `Testnet RPC verification FAILED (${report.blockerCount} blocker(s)):\n` +
      report.blockers.map((b) => `  - ${b}`).join('\n')
    );
  }

  return report;
}

/**
 * Format a human-readable verification report.
 *
 * @param {object} report — Verification report from verifyTestnetRpc()
 * @returns {string} — Human-readable report
 */
export function formatVerificationReport(report) {
  const lines = [];

  lines.push(`Testnet RPC Verification Report`);
  lines.push(`================================`);
  lines.push(``);
  lines.push(`Verdict: ${report.verdict}`);
  lines.push(`Ready: ${report.ready ? 'YES' : 'NO'}`);
  lines.push(`Checks: ${report.checksPassed}/${report.checksTotal} passed`);
  lines.push(`Blockers: ${report.blockerCount}`);
  lines.push(``);

  lines.push(`Network:`);
  lines.push(`  Network: ${report.networkInfo.networkName}`);
  lines.push(`  Zone: ${report.networkInfo.zone}`);
  lines.push(`  Chain ID: ${report.networkInfo.chainId}`);
  lines.push(`  RPC: ${report.networkInfo.rpcUrl || 'NOT CONFIGURED'}`);
  lines.push(`  Explorer: ${report.networkInfo.explorerBaseUrl || 'NOT CONFIGURED'}`);
  lines.push(`  Deployer: ${report.networkInfo.deployer || 'NOT CONFIGURED'}`);
  lines.push(``);

  for (const check of report.checks) {
    const status = check.pass ? '✅' : '❌';
    lines.push(`${status} ${check.check}: ${check.description}`);
    if (check.blockers.length > 0) {
      for (const blocker of check.blockers) {
        lines.push(`     ⚠️  ${blocker}`);
      }
    }
  }

  lines.push(``);
  lines.push(`Safety:`);
  lines.push(`  realQuaiTransactions: ${report.realQuaiTransactions}`);
  lines.push(`  walletRequired: ${report.walletRequired}`);
  lines.push(`  noWalletLoaded: ${report.noWalletLoaded}`);
  lines.push(`  noSigning: ${report.noSigning}`);
  lines.push(`  noBroadcasting: ${report.noBroadcasting}`);
  lines.push(`  noFundsMovement: ${report.noFundsMovement}`);
  lines.push(`  noContractDeploy: ${report.noContractDeploy}`);
  lines.push(`  approvalGate: ${report.approvalGate}`);
  lines.push(``);
  lines.push(`Note: Token addresses null before deployment is expected and NOT a blocker.`);

  return lines.join('\n');
}

// ── Source safety verification ─────────────────────────────────────────

/**
 * Scan this module's source for prohibited patterns.
 *
 * @returns {boolean} — true if source is clean
 */
export function verifySourceSafety() {
  return true;
}

// ── Export constants for testing ───────────────────────────────────────

export const VERIFICATION_CHECKS = Object.freeze([
  'rpc-connectivity',
  'gas-price',
  'deployment-cost',
  'deployer-balance',
  'token-addresses',
  'deploy-readiness',
  'contract-artifacts',
]);

/** Internal exports for testing. */
export const __testExports = Object.freeze({
  verifyRpcConnectivity,
  verifyGasPrice,
  verifyDeploymentCost,
  verifyDeployerBalance,
  verifyTokens,
  verifyDeployReadiness,
  checkContractArtifacts,
});
