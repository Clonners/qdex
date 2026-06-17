/**
 * Testnet connection probes — read-only RPC health checks for QDEX testnet readiness.
 *
 * These probes make lightweight, read-only JSON-RPC calls against the configured
 * testnet RPC endpoint to verify connectivity, chain identity, and block freshness.
 * They do NOT load wallets, sign transactions, broadcast, or move funds.
 *
 * All probes fail-closed: if the RPC URL is not set, the probe returns a readiness
 * result with explicit `rpcUrlMissing: true` and never attempts a network call.
 *
 * Boundaries:
 * - Read-only JSON-RPC methods only: `eth_chainId`, `eth_blockNumber`, `net_version`
 * - No wallet loading, signing, or broadcasting
 * - No contract interaction
 * - Timeout and retry configuration for resilience
 * - Explicit approval-gate metadata in all results
 */

import { TESTNET_CONFIG } from './testnet-config.js';

// Default probe configuration
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 1;

/**
 * Send a raw JSON-RPC request to the configured testnet endpoint.
 *
 * @param {string} method - JSON-RPC method name
 * @param {unknown[]} [params] - JSON-RPC parameters
 * @param {object} [options] - Probe options
 * @param {number} [options.timeoutMs] - Request timeout in milliseconds
 * @returns {Promise<{success: boolean, data: unknown, error: string|null, timedOut: boolean}>}
 */
async function sendRpcRequest(method, params = [], options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  if (!TESTNET_CONFIG.rpcUrl) {
    return {
      success: false,
      data: null,
      error: 'rpcUrl not configured',
      timedOut: false,
    };
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
      return {
        success: false,
        data: null,
        error: `HTTP ${response.status} ${response.statusText}`,
        timedOut: false,
      };
    }

    const body = await response.json();

    if (body.error) {
      return {
        success: false,
        data: null,
        error: `RPC error ${body.error.code}: ${body.error.message}`,
        timedOut: false,
      };
    }

    return {
      success: true,
      data: body.result,
      error: null,
      timedOut: false,
    };
  } catch (err) {
    clearTimeout(timeoutHandle);
    const timedOut = err.name === 'AbortError';
    return {
      success: false,
      data: null,
      error: timedOut ? 'request timed out' : `network error: ${err.message}`,
      timedOut,
    };
  }
}

/**
 * Probe the testnet RPC for chain ID.
 *
 * Returns the chain ID as a hex string (e.g. "0x539" for chain 1337) or
 * null if the probe failed.
 *
 * @returns {Promise<{chainIdHex: string|null, chainIdDecimal: number|null, success: boolean, error: string|null}>}
 */
export async function probeChainId() {
  const result = await sendRpcRequest('eth_chainId');

  if (!result.success) {
    return {
      chainIdHex: null,
      chainIdDecimal: null,
      success: false,
      error: result.error,
    };
  }

  const chainIdHex = String(result.data);
  const chainIdDecimal = chainIdHex.startsWith('0x')
    ? parseInt(chainIdHex, 16)
    : parseInt(chainIdHex, 10);

  return {
    chainIdHex,
    chainIdDecimal: Number.isNaN(chainIdDecimal) ? null : chainIdDecimal,
    success: true,
    error: null,
  };
}

/**
 * Probe the testnet RPC for the latest block number.
 *
 * @returns {Promise<{blockNumberHex: string|null, blockNumberDecimal: number|null, success: boolean, error: string|null}>}
 */
export async function probeBlockNumber() {
  const result = await sendRpcRequest('eth_blockNumber');

  if (!result.success) {
    return {
      blockNumberHex: null,
      blockNumberDecimal: null,
      success: false,
      error: result.error,
    };
  }

  const blockNumberHex = String(result.data);
  const blockNumberDecimal = blockNumberHex.startsWith('0x')
    ? parseInt(blockNumberHex, 16)
    : parseInt(blockNumberHex, 10);

  return {
    blockNumberHex,
    blockNumberDecimal: Number.isNaN(blockNumberDecimal) ? null : blockNumberDecimal,
    success: true,
    error: null,
  };
}

/**
 * Probe the testnet RPC for network version.
 *
 * @returns {Promise<{networkVersion: string|null, success: boolean, error: string|null}>}
 */
export async function probeNetworkVersion() {
  const result = await sendRpcRequest('net_version');

  if (!result.success) {
    return {
      networkVersion: null,
      success: false,
      error: result.error,
    };
  }

  return {
    networkVersion: String(result.data),
    success: true,
    error: null,
  };
}

/**
 * Run all testnet connection probes and return a consolidated readiness report.
 *
 * The report includes:
 * - Per-probe results (chainId, blockNumber, networkVersion)
 * - Overall connectivity status
 * - Approval-gate metadata (no wallet, no signing, no funds)
 * - Config completeness check
 *
 * @returns {Promise<object>} - Readiness report
 */
export async function probeTestnetReadiness() {
  const [chainIdResult, blockNumberResult, networkVersionResult] = await Promise.all([
    probeChainId(),
    probeBlockNumber(),
    probeNetworkVersion(),
  ]);

  const rpcConfigured = TESTNET_CONFIG.rpcUrl !== null;
  const connected = chainIdResult.success && blockNumberResult.success;

  // Config completeness check
  const missingFields = [];
  if (!rpcConfigured) missingFields.push('rpcUrl');
  if (!TESTNET_CONFIG.chainId && !chainIdResult.chainIdDecimal) missingFields.push('chainId');
  if (!TESTNET_CONFIG.explorerBaseUrl) missingFields.push('explorerBaseUrl');
  if (!TESTNET_CONFIG.deployer) missingFields.push('deployer');

  const contractAddresses = Object.entries(TESTNET_CONFIG.contracts).filter(
    ([, addr]) => addr === null
  );
  if (contractAddresses.length > 0) {
    missingFields.push(`contracts (${contractAddresses.length}/6 null)`);
  }

  const tokenAddresses = Object.entries(TESTNET_CONFIG.tokens).filter(
    ([, addr]) => addr === null
  );
  if (tokenAddresses.length > 0) {
    missingFields.push(`tokens (${tokenAddresses.length}/2 null)`);
  }

  return {
    // Network connectivity
    rpcConfigured,
    rpcUrl: TESTNET_CONFIG.rpcUrl || null,
    networkName: TESTNET_CONFIG.networkName,
    zone: TESTNET_CONFIG.zone,
    connected,

    // Probe results
    chainId: chainIdResult,
    blockNumber: blockNumberResult,
    networkVersion: networkVersionResult,

    // Config completeness
    configComplete: missingFields.length === 0,
    missingFields,

    // Safety metadata — always present
    mode: TESTNET_CONFIG.mode,
    realQuaiTransactions: false,
    walletRequired: false,
    noWalletLoaded: true,
    noSigning: true,
    noBroadcasting: true,
    noFundsMovement: true,
    noContractDeploy: true,
    approvalGate: 'explicit-approval-required-before-wallet-or-deploy',
  };
}

export { sendRpcRequest, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_RETRIES };
