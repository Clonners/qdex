/**
 * Testnet gas price estimation — read-only deployment cost calculator.
 *
 * Queries the configured testnet RPC for current gas price (eth_gasPrice)
 * and calculates estimated deployment costs for all 6 deployable contracts.
 * This enables operators to assess real-time deployment costs before
 * requesting explicit deployment approval.
 *
 * Boundaries:
 * - Read-only JSON-RPC method only: `eth_gasPrice`
 * - No wallet loading, signing, broadcasting, or contract deployment
 * - Uses same RPC timeout/retry as testnet-connection-probe
 * - Fail-closed: if RPC unavailable, returns estimate with fallback gas price
 * - Explicit approval-gate metadata in all results
 */

import { TESTNET_CONFIG } from './testnet-config.js';
import { sendRpcRequest, DEFAULT_TIMEOUT_MS } from './testnet-connection-probe.js';

// ── Constants ─────────────────────────────────────────────────────────

/** Number of deployable contracts in QDEX */
export const DEPLOYABLE_CONTRACT_COUNT = 6;

/**
 * Estimated gas costs per contract deployment (from artifact analysis).
 * These are conservative estimates based on bytecode size and constructor complexity.
 * Actual deployment costs may vary by 5-15% depending on network state.
 */
export const CONTRACT_DEPLOYMENT_GAS_ESTIMATES = Object.freeze({
  TradingVault: 1200000,
  NonceManager: 1100000,
  MarketRegistry: 1150000,
  FeeManager: 1050000,
  DelegateKeyRegistry: 1100000,
  Settlement: 1300000,
});

/** Safety multiplier for gas cost estimates */
export const GAS_SAFETY_MULTIPLIER = 1.5;

/** Fallback gas price in wei (200 gwei) when RPC unavailable */
export const FALLBACK_GAS_PRICE_WEI = 200n * 10n ** 9n;

/** Human-readable QUAI unit name for testnet */
export const NATIVE_CURRENCY = 'QUAI';

/** Decimal precision for QUAI display */
export const QUAI_DECIMALS = 18;

// ── Helper functions ──────────────────────────────────────────────────

/**
 * Convert wei amount to QUAI (decimal string with QUAI_DECIMALS precision).
 *
 * @param {bigint} wei - Amount in wei
 * @returns {string} - QUAI amount as decimal string (e.g. "2.160000")
 */
export function weiToQuai(wei) {
  const divisor = 10n ** BigInt(QUAI_DECIMALS);
  const integer = wei / divisor;
  const fraction = wei % divisor;
  const fractionStr = String(fraction).padStart(QUAI_DECIMALS, '0');
  return `${integer}.${fractionStr}`;
}

/**
 * Calculate estimated deployment cost for a single contract.
 *
 * @param {string} contractName - Contract name
 * @param {bigint} gasPriceWei - Current gas price in wei
 * @param {number} gasEstimate - Estimated gas units for deployment
 * @param {number} [safetyMultiplier] - Safety multiplier (default: GAS_SAFETY_MULTIPLIER)
 * @returns {object} - Cost estimate with gas, price, and cost in wei/QUAI
 */
export function estimateContractCost(contractName, gasPriceWei, gasEstimate, safetyMultiplier = GAS_SAFETY_MULTIPLIER) {
  const gasWithSafety = Math.ceil(gasEstimate * safetyMultiplier);
  const costWei = BigInt(gasWithSafety) * gasPriceWei;

  return {
    contract: contractName,
    baseGasEstimate: gasEstimate,
    gasWithSafety: gasWithSafety,
    gasPriceWei: Number(gasPriceWei),
    gasPriceGwei: Number(gasPriceWei / 10n ** 9n),
    costWei: Number(costWei),
    costQuai: weiToQuai(costWei),
  };
}

/**
 * Probe the current gas price from the testnet RPC.
 *
 * @returns {Promise<{gasPriceWei: bigint|null, gasPriceGwei: number|null, success: boolean, error: string|null, usedFallback: boolean}>}
 */
export async function probeGasPrice() {
  // Fail-closed: no RPC URL means we use fallback
  if (!TESTNET_CONFIG.rpcUrl) {
    return {
      gasPriceWei: null,
      gasPriceGwei: null,
      success: false,
      error: 'rpcUrl not configured',
      usedFallback: false,
    };
  }

  const result = await sendRpcRequest('eth_gasPrice');

  if (!result.success) {
    // Fallback: return error but indicate RPC attempted
    return {
      gasPriceWei: null,
      gasPriceWeiHex: null,
      gasPriceGwei: null,
      success: false,
      error: result.error,
      usedFallback: false,
    };
  }

  const gasPriceHex = String(result.data);
  let gasPriceWei;

  try {
    gasPriceWei = gasPriceHex.startsWith('0x')
      ? BigInt(gasPriceHex)
      : BigInt(gasPriceHex);
  } catch {
    return {
      gasPriceWei: null,
      gasPriceWeiHex: gasPriceHex,
      gasPriceGwei: null,
      success: false,
      error: `invalid gas price format: ${gasPriceHex}`,
      usedFallback: false,
    };
  }

  const gasPriceGwei = Number(gasPriceWei / 10n ** 9n);

  return {
    gasPriceWei,
    gasPriceWeiHex: gasPriceHex,
    gasPriceGwei,
    success: true,
    error: null,
    usedFallback: false,
  };
}

/**
 * Calculate deployment cost report using current or fallback gas price.
 *
 * @param {bigint} [gasPriceWei] - Override gas price (for testing). Uses probe if not provided.
 * @param {boolean} [useFallback] - Force fallback gas price
 * @returns {object} - Deployment cost report
 */
export async function estimateDeploymentCost(gasPriceWei, useFallback = false) {
  let activeGasPrice;
  let gasPriceSource;
  let gasPriceProbe;

  if (gasPriceWei !== undefined) {
    // Override provided
    activeGasPrice = BigInt(gasPriceWei);
    gasPriceSource = 'override';
    gasPriceProbe = {
      gasPriceWei: activeGasPrice,
      gasPriceGwei: Number(activeGasPrice / 10n ** 9n),
      success: true,
      error: null,
      usedFallback: false,
    };
  } else if (useFallback) {
    // Force fallback — skip RPC probe entirely
    activeGasPrice = FALLBACK_GAS_PRICE_WEI;
    gasPriceSource = 'fallback';
    gasPriceProbe = {
      gasPriceWei: activeGasPrice,
      gasPriceGwei: Number(activeGasPrice / 10n ** 9n),
      success: false,
      error: 'useFallback forced',
      usedFallback: true,
    };
  } else {
    // Probe live gas price
    gasPriceProbe = await probeGasPrice();
    if (gasPriceProbe.success && gasPriceProbe.gasPriceWei !== null) {
      activeGasPrice = gasPriceProbe.gasPriceWei;
      gasPriceSource = 'live-rpc';
    } else {
      activeGasPrice = FALLBACK_GAS_PRICE_WEI;
      gasPriceSource = 'fallback';
      gasPriceProbe = { ...gasPriceProbe, usedFallback: true };
    }
  }

  // Calculate per-contract costs
  const contractEstimates = [];
  let totalCostWei = 0n;

  for (const [name, gasEstimate] of Object.entries(CONTRACT_DEPLOYMENT_GAS_ESTIMATES)) {
    const estimate = estimateContractCost(name, activeGasPrice, gasEstimate);
    contractEstimates.push(estimate);
    totalCostWei += BigInt(estimate.costWei);
  }

  return {
    // Gas price info
    gasPriceSource,
    gasPriceProbe,
    activeGasPriceWei: Number(activeGasPrice),
    activeGasPriceGwei: Number(activeGasPrice / 10n ** 9n),
    usedFallback: gasPriceSource === 'fallback',

    // Per-contract estimates
    contractEstimates,
    contractCount: contractEstimates.length,

    // Total deployment cost
    totalCostWei: Number(totalCostWei),
    totalCostQuai: weiToQuai(totalCostWei),
    safetyMultiplier: GAS_SAFETY_MULTIPLIER,

    // Network info
    networkName: TESTNET_CONFIG.networkName,
    zone: TESTNET_CONFIG.zone,
    chainId: TESTNET_CONFIG.chainId,
    rpcUrl: TESTNET_CONFIG.rpcUrl || null,

    // Safety metadata — always present
    realQuaiTransactions: false,
    walletRequired: false,
    noWalletLoaded: true,
    noSigning: true,
    noBroadcasting: true,
    noFundsMovement: true,
    noContractDeploy: true,
    approvalGate: 'explicit-approval-required-before-deploy',
  };
}

/**
 * Format a human-readable cost summary string.
 *
 * @param {object} report - Deployment cost report from estimateDeploymentCost
 * @returns {string} - Formatted summary
 */
export function formatCostSummary(report) {
  const lines = [
    `QDEX Testnet Deployment Cost Estimate`,
    `Network: ${report.networkName} / ${report.zone} (chainId: ${report.chainId})`,
    `Gas price: ${report.activeGasPriceGwei} gwei (${report.gasPriceSource})`,
    `Safety multiplier: ${report.safetyMultiplier}×`,
    ``,
  ];

  for (const est of report.contractEstimates) {
    lines.push(
      `  ${est.contract}: ${est.gasWithSafety.toLocaleString()} gas ≈ ${est.costQuai} ${NATIVE_CURRENCY}`
    );
  }

  lines.push(``);
  lines.push(`Total estimated: ${report.totalCostQuai} ${NATIVE_CURRENCY}`);

  if (report.usedFallback) {
    lines.push(`⚠ Using fallback gas price (${report.activeGasPriceGwei} gwei) — RPC unavailable`);
  }

  lines.push(`⚠ Deployment requires explicit approval — no wallets/transactions used`);

  return lines.join('\n');
}

/**
 * Compare deployment cost against deployer balance and return sufficiency report.
 *
 * @param {object} report - Deployment cost report from estimateDeploymentCost
 * @param {string} [balanceQuai] - Deployer balance in QUAI (decimal string, e.g. "2029.5")
 * @returns {object} - Sufficiency report with sufficient/shortfall
 */
export function checkDeploymentSufficiency(report, balanceQuai) {
  const balanceWei = balanceQuai
    ? Math.floor(parseFloat(balanceQuai) * 10 ** QUAI_DECIMALS)
    : null;

  if (balanceWei === null) {
    return {
      sufficient: null,
      reason: 'deployer balance not provided',
      balanceQuai: null,
      requiredQuai: report.totalCostQuai,
      shortfallQuai: null,
    };
  }

  const balanceWeiBig = BigInt(balanceWei);
  const costWeiBig = BigInt(report.totalCostWei);
  const sufficient = balanceWeiBig >= costWeiBig;
  const shortfallWei = sufficient ? 0n : costWeiBig - balanceWeiBig;

  return {
    sufficient,
    reason: sufficient ? 'deployer balance sufficient' : 'deployer balance insufficient',
    balanceQuai: weiToQuai(balanceWeiBig),
    requiredQuai: report.totalCostQuai,
    shortfallQuai: sufficient ? null : weiToQuai(shortfallWei),
    safetyMetadata: {
      realQuaiTransactions: false,
      walletRequired: false,
      noWalletLoaded: true,
      noSigning: true,
      approvalGate: 'explicit-approval-required-before-deploy',
    },
  };
}

// Constants already exported above as `export const` — no re-export needed.
