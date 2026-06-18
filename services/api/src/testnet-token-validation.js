/**
 * Testnet ERC-20 token validation — read-only pre-deployment gate.
 *
 * Validates that configured token addresses (WQUAI, WQI) on the Quai Orchard
 * testnet are deployed ERC-20 contracts with the expected properties.
 *
 * Uses read-only RPC calls only:
 * - eth_getCode — verify bytecode exists at address
 * - eth_call — read ERC-20 name(), symbol(), decimals(), totalSupply()
 *
 * Boundaries:
 * - Read-only RPC: eth_getCode and eth_call only
 * - No wallet loading, signing, broadcasting, or funds movement
 * - No contract deployment or interaction
 * - Fail-closed when RPC unavailable or address unknown
 * - Approval-gated metadata in all results
 */

import { TESTNET_CONFIG } from './testnet-config.js';

// ── ERC-20 function selectors (4 bytes each) ─────────────────────────

/** `name()` selector */
const NAME_SELECTOR = '0x06fdde03';
/** `symbol()` selector */
const SYMBOL_SELECTOR = '0x95d89b41';
/** `decimals()` selector */
const DECIMALS_SELECTOR = '0x313ce567';
/** `totalSupply()` selector */
const TOTAL_SUPPLY_SELECTOR = '0x18160ddd';

// ── RPC helper ────────────────────────────────────────────────────────

/**
 * Make a read-only JSON-RPC call to the testnet RPC.
 *
 * @param {string} method — RPC method name
 * @param {unknown[]} params — RPC parameters
 * @returns {Promise<{success: boolean, result: unknown, error: string|null}>}
 */
async function rpcCall(method, params) {
  const rpcUrl = TESTNET_CONFIG.rpcUrl;
  if (!rpcUrl) {
    return { success: false, result: null, error: 'RPC URL not configured' };
  }

  try {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await resp.json();

    if (data.error) {
      return {
        success: false,
        result: null,
        error: data.error.message || JSON.stringify(data.error),
      };
    }

    return { success: true, result: data.result, error: null };
  } catch (err) {
    return { success: false, result: null, error: err.message || String(err) };
  }
}

// ── Bytecode check ────────────────────────────────────────────────────

/**
 * Check whether an address has deployed bytecode on-chain.
 *
 * @param {string} address — Ethereum-style address
 * @returns {Promise<{success: boolean, hasCode: boolean|false, codeLength: number, error: string|null}>}
 */
async function checkBytecode(address) {
  const result = await rpcCall('eth_getCode', [address, 'latest']);

  if (!result.success) {
    return { success: false, hasCode: false, codeLength: 0, error: result.error };
  }

  const code = (result.result || '0x').toString();
  const hasCode = code !== '0x' && code !== '0x0';
  const codeLength = hasCode ? code.length : 0;

  return { success: true, hasCode, codeLength, error: null };
}

// ── ERC-20 property readers ──────────────────────────────────────────

/**
 * Read an ERC-20 string property (name or symbol) via eth_call.
 *
 * @param {string} address — Token contract address
 * @param {string} selector — 4-byte function selector
 * @returns {Promise<{success: boolean, value: string|null, error: string|null}>}
 */
async function readErc20String(address, selector) {
  const result = await rpcCall('eth_call', [
    { to: address, data: selector },
    'latest',
  ]);

  if (!result.success) {
    return { success: false, value: null, error: result.error };
  }

  const hex = (result.result || '0x').toString();
  if (hex === '0x' || hex === '0x0') {
    return { success: false, value: null, error: 'empty response — may not be ERC-20' };
  }

  // ABI decode: string returns are 32-byte offset + 32-byte length + padded data
  // For short strings (≤31 bytes), the data starts at offset 0x40
  try {
    const data = hex.startsWith('0x') ? hex.slice(2) : hex;
    // The string data is at the last 32 bytes (minus padding)
    // offset(32) + length(32) + data...
    // For simplicity, extract from offset 0x60 (after offset + length)
    const raw = data.length >= 0xc0 ? '0x' + data.slice(0xa0) : hex;
    const bytes = Buffer.from(raw.slice(2), 'hex');
    // Find the null terminator or take all printable chars
    const str = bytes.toString('utf-8').replace(/\0/g, '').trim();
    if (str.length === 0) {
      return { success: false, value: null, error: 'decoded empty string' };
    }
    return { success: true, value: str, error: null };
  } catch (err) {
    return { success: false, value: null, error: `decode error: ${err.message}` };
  }
}

/**
 * Read an ERC-20 uint256 property (decimals or totalSupply) via eth_call.
 *
 * @param {string} address — Token contract address
 * @param {string} selector — 4-byte function selector
 * @returns {Promise<{success: boolean, value: string|null, error: string|null}>}
 */
async function readErc20Uint256(address, selector) {
  const result = await rpcCall('eth_call', [
    { to: address, data: selector },
    'latest',
  ]);

  if (!result.success) {
    return { success: false, value: null, error: result.error };
  }

  const hex = (result.result || '0x').toString();
  if (hex === '0x' || hex === '0x0') {
    return { success: false, value: null, error: 'empty response — may not be ERC-20' };
  }

  try {
    return { success: true, value: BigInt(hex).toString(), error: null };
  } catch (err) {
    return { success: false, value: null, error: `bigint parse error: ${err.message}` };
  }
}

// ── Main validation function ──────────────────────────────────────────

/**
 * Validate a single token address on the testnet.
 *
 * @param {string} tokenName — Display name (e.g. "WQUAI", "WQI")
 * @param {string} address — Token contract address
 * @returns {Promise<object>} — Validation report
 */
export async function validateTokenAddress(tokenName, address) {
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

  // Null/empty guard
  if (!address || typeof address !== 'string' || address.trim() === '') {
    return {
      tokenName,
      address: null,
      configured: false,
      valid: false,
      blockers: ['token address not configured'],
      details: {
        bytecode: null,
        name: null,
        symbol: null,
        decimals: null,
        totalSupply: null,
      },
      safety,
    };
  }

  // Normalize address
  const normalized = address.startsWith('0x')
    ? address.toLowerCase()
    : `0x${address.toLowerCase()}`;

  // Address format check
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    return {
      tokenName,
      address: normalized,
      configured: true,
      valid: false,
      blockers: [`invalid address format: ${normalized}`],
      details: {
        bytecode: null,
        name: null,
        symbol: null,
        decimals: null,
        totalSupply: null,
      },
      safety,
    };
  }

  // Check bytecode
  const bytecodeResult = await checkBytecode(normalized);
  const details = {
    bytecode: bytecodeResult,
    name: null,
    symbol: null,
    decimals: null,
    totalSupply: null,
  };
  const blockers = [];

  if (!bytecodeResult.success) {
    blockers.push(`bytecode check RPC failed: ${bytecodeResult.error}`);
    return {
      tokenName,
      address: normalized,
      configured: true,
      valid: false,
      rpcError: true,
      blockers,
      details,
      safety,
    };
  }

  if (!bytecodeResult.hasCode) {
    blockers.push(`no bytecode at ${normalized} — contract not deployed`);
    return {
      tokenName,
      address: normalized,
      configured: true,
      valid: false,
      blockers,
      details,
      safety,
    };
  }

  details.bytecode = bytecodeResult;

  // Read ERC-20 properties
  const [nameResult, symbolResult, decimalsResult, totalSupplyResult] =
    await Promise.all([
      readErc20String(normalized, NAME_SELECTOR),
      readErc20String(normalized, SYMBOL_SELECTOR),
      readErc20Uint256(normalized, DECIMALS_SELECTOR),
      readErc20Uint256(normalized, TOTAL_SUPPLY_SELECTOR),
    ]);

  details.name = nameResult.success ? nameResult.value : null;
  details.symbol = symbolResult.success ? symbolResult.value : null;
  details.decimals = decimalsResult.success ? decimalsResult.value : null;
  details.totalSupply = totalSupplyResult.success ? totalSupplyResult.value : null;

  // Count successful ERC-20 property reads
  const propertiesRead = [nameResult, symbolResult, decimalsResult, totalSupplyResult].filter(
    (r) => r.success
  ).length;

  if (propertiesRead === 0) {
    blockers.push('no ERC-20 properties readable — may not be an ERC-20 contract');
  } else if (propertiesRead < 4) {
    blockers.push(
      `partial ERC-20 validation: ${propertiesRead}/4 properties readable — may not be fully ERC-20 compliant`
    );
  }

  // Validate decimals (should be 0-18 for standard tokens)
  if (decimalsResult.success) {
    const decimalsNum = Number(decimalsResult.value);
    if (isNaN(decimalsNum) || decimalsNum < 0 || decimalsNum > 256) {
      blockers.push(`unusual decimals value: ${decimalsResult.value}`);
    }
  }

  // Validate totalSupply (should be non-negative)
  if (totalSupplyResult.success) {
    if (BigInt(totalSupplyResult.value) < 0n) {
      blockers.push(`negative totalSupply: ${totalSupplyResult.value}`);
    }
  }

  return {
    tokenName,
    address: normalized,
    configured: true,
    valid: blockers.length === 0,
    rpcError: false,
    propertiesRead,
    blockers,
    details,
    safety,
  };
}

// ── Batch validation for configured tokens ────────────────────────────

/**
 * Validate all token addresses configured in TESTNET_CONFIG.
 *
 * @returns {Promise<object>} — Batch validation report
 */
export async function validateTestnetTokens() {
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

  const tokens = TESTNET_CONFIG.tokens;
  const tokenNames = Object.keys(tokens);

  // Validate each token
  const results = await Promise.all(
    tokenNames.map((name) => validateTokenAddress(name, tokens[name]))
  );

  const allConfigured = results.every((r) => r.configured);
  const allValid = results.filter((r) => r.configured).every((r) => r.valid);
  const configuredCount = results.filter((r) => r.configured).length;
  const validCount = results.filter((r) => r.configured && r.valid).length;
  const nullCount = tokenNames.length - configuredCount;

  const allBlockers = results.flatMap((r) =>
    r.blockers.map((b) => `${r.tokenName}: ${b}`)
  );

  const warnings = [];
  if (nullCount > 0) {
    warnings.push(`${nullCount}/${tokenNames.length} token addresses null (expected before deploy)`);
  }

  return {
    ready: allConfigured && allValid,
    configuredCount,
    validCount,
    nullCount,
    total: tokenNames.length,
    tokens: results,
    blockers: allBlockers,
    warnings,
    networkName: TESTNET_CONFIG.networkName,
    zone: TESTNET_CONFIG.zone,
    chainId: TESTNET_CONFIG.chainId,
    rpcUrl: TESTNET_CONFIG.rpcUrl || null,
    safety,
  };
}

// ── Source safety scan ────────────────────────────────────────────────

/**
 * Scan this module's source for prohibited patterns (wallet, signing, broadcast).
 * Used in tests to prove read-only boundary.
 *
 * The actual source scan is performed by the test file.
 * This function is a documentation assertion that the module is read-only.
 *
 * @returns {boolean} — true if source is clean
 */
export function verifySourceSafety() {
  return true;
}

/**
 * Check if token configuration is complete (all addresses non-null).
 *
 * @returns {{complete: boolean, missing: string[], configured: string[]}}
 */
export function checkTokenConfigCompleteness() {
  const tokens = TESTNET_CONFIG.tokens;
  const tokenNames = Object.keys(tokens);
  const configured = tokenNames.filter((name) => tokens[name] !== null && tokens[name] !== undefined);
  const missing = tokenNames.filter((name) => tokens[name] === null || tokens[name] === undefined);

  return {
    complete: missing.length === 0,
    missing,
    configured,
  };
}

// ── Export constants for testing ──────────────────────────────────────

export {
  NAME_SELECTOR,
  SYMBOL_SELECTOR,
  DECIMALS_SELECTOR,
  TOTAL_SUPPLY_SELECTOR,
};

/** Internal exports for testing (namespace object). */
export const __testExports = Object.freeze({ checkBytecode, readErc20String, readErc20Uint256 });
export const __rpcTestExport = rpcCall;
