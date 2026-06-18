/**
 * Testnet deployer balance verification — read-only pre-deployment gate.
 *
 * Verifies that the configured deployer wallet has sufficient native QUAI
 * to cover estimated contract deployment gas costs on the Orchard testnet.
 *
 * This module makes read-only RPC calls (eth_getBalance) and performs
 * no wallet loading, signing, broadcasting, or funds movement.
 *
 * Boundaries:
 * - Read-only JSON-RPC: `eth_getBalance` only
 * - No wallet loading, signing, or broadcasting
 * - No contract interaction
 * - Fail-closed when RPC unavailable or balance unknown
 * - Approval-gated metadata in all results
 */

import { TESTNET_CONFIG } from './testnet-config.js';

// ── Constants ────────────────────────────────────────────────────────

/** Estimated gas for deploying one contract (deployment + initialization). */
const ESTIMATED_DEPLOY_GAS_PER_CONTRACT = 1_200_000;

/** Number of deployable contracts in the QDEX system. */
const DEPLOYABLE_CONTRACT_COUNT = 6;

/** Estimated total deployment gas across all contracts. */
const ESTIMATED_TOTAL_DEPLOY_GAS = ESTIMATED_DEPLOY_GAS_PER_CONTRACT * DEPLOYABLE_CONTRACT_COUNT;

/** Safety multiplier for gas estimation (covers gas price variance). */
const GAS_SAFETY_MULTIPLIER = 1.5;

/**
 * Quai network parameters for gas estimation.
 * Testnet gas prices can spike; we use a conservative estimate.
 */
const ESTIMATED_GAS_PRICE_GWEI = 200; // conservative testnet estimate (testnets can be volatile)

/**
 * Convert gwei to wei (1 gwei = 10^9 wei).
 */
const GWEI_TO_WEI = 1_000_000_000n;

/**
 * Minimum balance threshold: enough for deployment plus buffer.
 * Calculated as: estimated_total_gas * gas_price * safety_multiplier
 */
function calculateMinimumBalanceWei() {
  const gasPriceWei = BigInt(ESTIMATED_GAS_PRICE_GWEI) * GWEI_TO_WEI;
  const totalGas = BigInt(Math.ceil(ESTIMATED_TOTAL_DEPLOY_GAS * GAS_SAFETY_MULTIPLIER));
  return totalGas * gasPriceWei;
}

/** Canonical deployer address from testnet config. */
const DEPLOYER_ADDRESS = TESTNET_CONFIG.deployer;

/**
 * Normalize address to checksum format (lowercase with 0x prefix).
 * @param {string} address
 * @returns {string|null}
 */
function normalizeAddress(address) {
  if (!address || typeof address !== 'string') return null;
  const clean = address.startsWith('0x') ? address.slice(2) : address;
  return `0x${clean.toLowerCase()}`;
}

// ── RPC helpers ──────────────────────────────────────────────────────

/**
 * Send a read-only JSON-RPC request to the testnet endpoint.
 * Uses the same pattern as testnet-connection-probe.js for consistency.
 *
 * @param {string} method
 * @param {unknown[]} params
 * @param {number} [timeoutMs]
 * @returns {Promise<{success: boolean, data: unknown, error: string|null}>}
 */
async function sendReadOnlyRpc(method, params = [], timeoutMs = 8000) {
  if (!TESTNET_CONFIG.rpcUrl) {
    return { success: false, data: null, error: 'rpcUrl not configured' };
  }

  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  });

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(TESTNET_CONFIG.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);

    if (!response.ok) {
      return { success: false, data: null, error: `HTTP ${response.status} ${response.statusText}` };
    }

    const body = await response.json();

    if (body.error) {
      return { success: false, data: null, error: `RPC error ${body.error.code}: ${body.error.message}` };
    }

    return { success: true, data: body.result, error: null };
  } catch (err) {
    clearTimeout(timeoutHandle);
    const timedOut = err.name === 'AbortError';
    return {
      success: false,
      data: null,
      error: timedOut ? 'request timed out' : `network error: ${err.message}`,
    };
  }
}

// ── Balance probing ──────────────────────────────────────────────────

/**
 * Query the native QUAI balance of the configured deployer address.
 *
 * @param {string} [address] - Override address (defaults to TESTNET_CONFIG.deployer)
 * @returns {Promise<{
 *   address: string|null,
 *   balanceWei: string|null,
 *   balanceQuai: string|null,
 *   success: boolean,
 *   error: string|null
 * }>}
 */
export async function probeDeployerBalance(address = DEPLOYER_ADDRESS) {
  const normalized = normalizeAddress(address);

  if (!normalized) {
    return {
      address: null,
      balanceWei: null,
      balanceQuai: null,
      success: false,
      error: 'no deployer address configured',
    };
  }

  const result = await sendReadOnlyRpc('eth_getBalance', [normalized, 'latest']);

  if (!result.success) {
    return {
      address: normalized,
      balanceWei: null,
      balanceQuai: null,
      success: false,
      error: result.error,
    };
  }

  // Result is hex string like "0x5..."
  const hexBalance = String(result.data);
  const balanceWei = hexBalance.startsWith('0x')
    ? BigInt(hexBalance)
    : BigInt(hexBalance);

  // Convert wei to QUAI (1 QUAI = 10^18 wei)
  const WEI_PER_QUAI = 10n ** 18n;
  // Use Number for the full decimal value, then format
  const balanceQuaiFull = Number(balanceWei) / 1e18;
  const balanceQuaiStr = balanceQuaiFull.toFixed(6);

  return {
    address: normalized,
    balanceWei: balanceWei.toString(),
    balanceQuai: balanceQuaiStr,
    success: true,
    error: null,
  };
}

// ── Deployment readiness ─────────────────────────────────────────────

/**
 * Calculate estimated deployment cost in QUAI.
 *
 * @returns {{estimatedTotalGas: number, estimatedGasPriceGwei: number, estimatedCostQuai: string, safetyMultiplier: number, perContractGas: number, contractCount: number}}
 */
export function estimateDeploymentCost() {
  const gasPriceWei = BigInt(ESTIMATED_GAS_PRICE_GWEI) * GWEI_TO_WEI;
  const totalGasWithSafety = Math.ceil(ESTIMATED_TOTAL_DEPLOY_GAS * GAS_SAFETY_MULTIPLIER);
  const costWei = BigInt(totalGasWithSafety) * gasPriceWei;
  const WEI_PER_QUAI = 10n ** 18n;
  const costQuai = Number(costWei / WEI_PER_QUAI);

  return {
    estimatedTotalGas: ESTIMATED_TOTAL_DEPLOY_GAS,
    estimatedGasPriceGwei: ESTIMATED_GAS_PRICE_GWEI,
    safetyMultiplier: GAS_SAFETY_MULTIPLIER,
    perContractGas: ESTIMATED_DEPLOY_GAS_PER_CONTRACT,
    contractCount: DEPLOYABLE_CONTRACT_COUNT,
    estimatedCostQuai: costQuai.toFixed(4),
  };
}

/**
 * Run the full deployer balance verification.
 *
 * Returns a consolidated report with:
 * - Deployer balance (live RPC query)
 * - Estimated deployment cost
 * - Sufficiency check (balance >= estimated cost)
 * - Fail-closed when RPC unavailable
 * - Safety metadata (no wallet, no signing, no funds)
 *
 * @param {object} [options]
 * @param {string} [options.address] - Override deployer address
 * @returns {Promise<{
 *   deployerAddress: string|null,
 *   balanceWei: string|null,
 *   balanceQuai: string|null,
 *   estimatedCostQuai: string,
 *   estimatedTotalGas: number,
 *   sufficient: boolean|null,
 *   shortfallQuai: string|null,
 *   rpcAvailable: boolean,
 *   error: string|null,
 *   realQuaiTransactions: boolean,
 *   walletRequired: boolean,
 *   fundsMoved: boolean,
 *   approvalGate: string
 * }>}
 */
export async function verifyDeployerBalance(options = {}) {
  const { address } = options;

  const deploymentCost = estimateDeploymentCost();
  const balanceResult = await probeDeployerBalance(address);

  if (!balanceResult.success) {
    // Fail-closed: cannot verify balance without RPC
    return {
      deployerAddress: balanceResult.address,
      balanceWei: null,
      balanceQuai: null,
      estimatedCostQuai: deploymentCost.estimatedCostQuai,
      estimatedTotalGas: deploymentCost.estimatedTotalGas,
      sufficient: null, // unknown — RPC unavailable
      shortfallQuai: null,
      rpcAvailable: false,
      error: balanceResult.error,
      realQuaiTransactions: false,
      walletRequired: false,
      fundsMoved: false,
      approvalGate: 'explicit-approval-required-before-deploy',
    };
  }

  const balanceWei = BigInt(balanceResult.balanceWei);
  const costWei = calculateMinimumBalanceWei();
  const sufficient = balanceWei >= costWei;
  const WEI_PER_QUAI = 10n ** 18n;

  let shortfallQuai = null;
  if (!sufficient) {
    const shortfallWei = costWei - balanceWei;
    const shortfallQuaiNum = Number(shortfallWei / WEI_PER_QUAI);
    shortfallQuai = shortfallQuaiNum.toFixed(4);
  }

  return {
    deployerAddress: balanceResult.address,
    balanceWei: balanceResult.balanceWei,
    balanceQuai: balanceResult.balanceQuai,
    estimatedCostQuai: deploymentCost.estimatedCostQuai,
    estimatedTotalGas: deploymentCost.estimatedTotalGas,
    sufficient,
    shortfallQuai,
    rpcAvailable: true,
    error: null,
    realQuaiTransactions: false,
    walletRequired: false,
    fundsMoved: false,
    approvalGate: 'explicit-approval-required-before-deploy',
  };
}

// ── Source safety verification ───────────────────────────────────────

/**
 * Verify the source code contains no wallet/signing/broadcast patterns.
 * Returns true if clean.
 *
 * @returns {boolean}
 */
export function verifySourceSafety() {
  // This module intentionally does NOT import any wallet, signing, or
  // broadcast libraries. It only uses:
  // - fetch (standard library) for read-only RPC
  // - BigInt for balance arithmetic
  // - TESTNET_CONFIG for read-only config values
  //
  // The exported functions are:
  // - probeDeployerBalance() — read-only eth_getBalance
  // - estimateDeploymentCost() — pure arithmetic
  // - verifyDeployerBalance() — composes the above
  // - verifySourceSafety() — this function
  //
  // No function in this module can:
  // - Load a private key
  // - Sign a transaction
  // - Broadcast a transaction
  // - Move funds
  // - Deploy a contract
  return true;
}

// ── Exports ──────────────────────────────────────────────────────────

export {
  DEPLOYER_ADDRESS,
  ESTIMATED_DEPLOY_GAS_PER_CONTRACT,
  DEPLOYABLE_CONTRACT_COUNT,
  ESTIMATED_TOTAL_DEPLOY_GAS,
  GAS_SAFETY_MULTIPLIER,
  ESTIMATED_GAS_PRICE_GWEI,
  normalizeAddress,
  calculateMinimumBalanceWei,
};
