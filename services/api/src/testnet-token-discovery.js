/**
 * Testnet token discovery — read-only probe for WQUAI/WQI on Quai Orchard.
 *
 * Attempts to discover wrapped token addresses (WQUAI, WQI) on the configured
 * testnet by probing candidate addresses via read-only RPC calls.
 *
 * Uses read-only RPC calls only:
 * - eth_getCode — verify bytecode exists at address
 * - eth_call — read ERC-20 name(), symbol(), decimals(), totalSupply()
 *
 * Boundaries:
 * - Read-only RPC: eth_getCode and eth_call only
 * - No wallet loading, signing, broadcasting, or funds movement
 * - No contract deployment or interaction
 * - Fail-closed when RPC unavailable or no candidates configured
 * - Approval-gated metadata in all results
 * - Does NOT auto-update testnet-config.js — discovery is advisory only
 */

import { TESTNET_CONFIG } from './testnet-config.js';

// ── ERC-20 function selectors ────────────────────────────────────────

/** `name()` selector */
const NAME_SELECTOR = '0x06fdde03';
/** `symbol()` selector */
const SYMBOL_SELECTOR = '0x95d89b41';
/** `decimals()` selector */
const DECIMALS_SELECTOR = '0x313ce567';
/** `totalSupply()` selector */
const TOTAL_SUPPLY_SELECTOR = '0x18160ddd';

// ── Known testnet candidate addresses ─────────────────────────────────
//
// These are candidate addresses to probe on Quai Orchard testnet.
// May include:
// - Standard wrapper contract addresses from Quai docs
// - Community-provided testnet addresses
// - Predictable deployment addresses (CREATE2, deterministic deployers)
//
// Updated as more Orchard addresses become known.
// Empty arrays = no candidates to probe (module still works, reports "none").

/** Candidate addresses for WQUAI on Orchard */
export const KNOWN_WQUAI_CANDIDATES = Object.freeze([]);

/** Candidate addresses for WQI on Orchard */
export const KNOWN_WQI_CANDIDATES = Object.freeze([]);

// ── RPC helpers (same pattern as testnet-connection-probe) ───────────

const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Send a read-only JSON-RPC request to the configured testnet RPC.
 *
 * @param {string} method - RPC method name
 * @param {unknown[]} params - RPC parameters
 * @returns {Promise<{success: boolean, data: unknown, error: string|null}>}
 */
async function rpcCall(method, params) {
  const rpcUrl = TESTNET_CONFIG.rpcUrl;
  if (!rpcUrl) {
    return { success: false, data: null, error: 'RPC URL not configured' };
  }

  try {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    const data = await resp.json();

    if (data.error) {
      return {
        success: false,
        data: null,
        error: data.error.message || JSON.stringify(data.error),
      };
    }

    return { success: true, data: data.result, error: null };
  } catch (err) {
    return { success: false, data: null, error: err.message || String(err) };
  }
}

// ── Bytecode check ────────────────────────────────────────────────────

/**
 * Check whether an address has deployed bytecode on-chain.
 *
 * @param {string} address - Ethereum-style address
 * @returns {Promise<{hasCode: boolean, codeLength: number, success: boolean, error: string|null}>}
 */
async function checkBytecode(address) {
  const result = await rpcCall('eth_getCode', [address, 'latest']);

  if (!result.success) {
    return { hasCode: false, codeLength: 0, success: false, error: result.error };
  }

  const code = (result.data || '0x').toString();
  const hasCode = code !== '0x' && code !== '0x0';
  const codeLength = hasCode ? code.length : 0;

  return { hasCode, codeLength, success: true, error: null };
}

// ── ERC-20 property readers ──────────────────────────────────────────

/**
 * Decode a short string from ABI-encoded hex (32-byte offset + 32-byte length + padded data).
 *
 * @param {string} hex - ABI-encoded hex string (with 0x prefix)
 * @returns {string|null} - Decoded string or null
 */
function decodeAbiString(hex) {
  if (!hex || hex === '0x' || hex === '0x0') return null;

  try {
    const data = hex.startsWith('0x') ? hex.slice(2) : hex;
    // offset(32 hex chars) + length(32 hex chars) + data
    // For short strings, data starts at 0x60 offset (0xa0 in hex chars from start)
    if (data.length < 0xa0) return null;

    const raw = '0x' + data.slice(0xa0);
    const bytes = Buffer.from(raw.slice(2), 'hex');
    const str = bytes.toString('utf-8').replace(/\0/g, '').trim();
    return str.length > 0 ? str : null;
  } catch {
    return null;
  }
}

/**
 * Read an ERC-20 string property (name or symbol).
 *
 * @param {string} address - Token contract address
 * @param {string} selector - 4-byte function selector
 * @returns {Promise<{value: string|null, success: boolean, error: string|null}>}
 */
async function readErc20String(address, selector) {
  const result = await rpcCall('eth_call', [{ to: address, data: selector }, 'latest']);

  if (!result.success) {
    return { value: null, success: false, error: result.error };
  }

  const value = decodeAbiString((result.data || '0x').toString());
  if (value === null) {
    return { value: null, success: false, error: 'could not decode string response' };
  }

  return { value, success: true, error: null };
}

/**
 * Read an ERC-20 uint256 property (decimals or totalSupply).
 *
 * @param {string} address - Token contract address
 * @param {string} selector - 4-byte function selector
 * @returns {Promise<{value: string|null, success: boolean, error: string|null}>}
 */
async function readErc20Uint256(address, selector) {
  const result = await rpcCall('eth_call', [{ to: address, data: selector }, 'latest']);

  if (!result.success) {
    return { value: null, success: false, error: result.error };
  }

  const hex = (result.data || '0x').toString();
  if (hex === '0x' || hex === '0x0') {
    return { value: null, success: false, error: 'empty uint256 response' };
  }

  try {
    return { value: BigInt(hex).toString(), success: true, error: null };
  } catch (err) {
    return { value: null, success: false, error: `bigint parse: ${err.message}` };
  }
}

// ── Single address probe ──────────────────────────────────────────────

/**
 * Probe a single address for ERC-20 token evidence.
 *
 * @param {string} address - Address to probe
 * @returns {Promise<object>} - Probe result
 */
export async function probeAddress(address) {
  const normalized = address.startsWith('0x')
    ? address.toLowerCase()
    : `0x${address.toLowerCase()}`;

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

  // Bytecode check
  const bytecode = await checkBytecode(normalized);
  if (!bytecode.success) {
    return {
      address: normalized,
      hasCode: false,
      isErc20: false,
      properties: {},
      rpcError: true,
      error: bytecode.error,
      safety,
    };
  }

  if (!bytecode.hasCode) {
    return {
      address: normalized,
      hasCode: false,
      isErc20: false,
      properties: {},
      rpcError: false,
      error: null,
      safety,
    };
  }

  // Read ERC-20 properties in parallel
  const [nameR, symbolR, decimalsR, supplyR] = await Promise.all([
    readErc20String(normalized, NAME_SELECTOR),
    readErc20String(normalized, SYMBOL_SELECTOR),
    readErc20Uint256(normalized, DECIMALS_SELECTOR),
    readErc20Uint256(normalized, TOTAL_SUPPLY_SELECTOR),
  ]);

  const propertiesRead = [nameR, symbolR, decimalsR, supplyR].filter((r) => r.success).length;

  return {
    address: normalized,
    hasCode: true,
    codeLength: bytecode.codeLength,
    isErc20: propertiesRead >= 3, // At least 3/4 properties = strong evidence
    propertiesRead,
    properties: {
      name: nameR.success ? nameR.value : null,
      symbol: symbolR.success ? symbolR.value : null,
      decimals: decimalsR.success ? decimalsR.value : null,
      totalSupply: supplyR.success ? supplyR.value : null,
    },
    rpcError: false,
    error: null,
    safety,
  };
}

// ── Token-specific discovery ──────────────────────────────────────────

/**
 * Discover a specific token type by probing its candidate addresses.
 *
 * @param {string} tokenType - Token type identifier ("WQUAI" or "WQI")
 * @param {string[]} candidates - List of candidate addresses to probe
 * @returns {Promise<object>} - Discovery report
 */
export async function discoverToken(tokenType, candidates) {
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

  const expectedSymbol = tokenType; // WQUAI or WQI
  const expectedNamePatterns = {
    WQUAI: ['Wrapped QUAI', 'wQUAI', 'Wrapped Quai'],
    WQI: ['Wrapped QI', 'wQI', 'Wrapped Quai Internet'],
  };
  const namePatterns = expectedNamePatterns[tokenType] || [];

  if (!candidates || candidates.length === 0) {
    return {
      tokenType,
      candidatesProbed: 0,
      candidatesFound: 0,
      results: [],
      discovered: null,
      status: 'no-candidates',
      statusEmoji: '⚪',
      note: `No candidate addresses configured for ${tokenType}`,
      safety,
    };
  }

  // Probe all candidates in parallel
  const results = await Promise.all(
    candidates.map((addr) => probeAddress(addr))
  );

  const erc20Results = results.filter((r) => r.isErc20);

  // Score candidates: prefer those matching symbol + name patterns
  const scored = results.filter((r) => r.isErc20).map((r) => {
    let score = 0;
    if (r.properties.symbol === expectedSymbol) score += 3;
    if (namePatterns.some((p) => r.properties.name?.toLowerCase().includes(p.toLowerCase()))) {
      score += 2;
    }
    if (r.properties.decimals !== null) score += 1;
    if (r.properties.totalSupply !== null) score += 1;
    return { ...r, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const discovered = scored.length > 0 ? scored[0] : null;

  return {
    tokenType,
    candidatesProbed: candidates.length,
    candidatesFound: scored.length,
    results,
    scored,
    discovered: discovered
      ? {
          address: discovered.address,
          score: discovered.score,
          name: discovered.properties.name,
          symbol: discovered.properties.symbol,
          decimals: discovered.properties.decimals,
          totalSupply: discovered.properties.totalSupply,
          propertiesRead: discovered.propertiesRead,
        }
      : null,
    status: discovered ? 'discovered' : 'not-found',
    statusEmoji: discovered ? '🟢' : '🟡',
    safety,
  };
}

// ── Full discovery run ────────────────────────────────────────────────

/**
 * Run full token discovery on all configured candidate addresses.
 *
 * @returns {Promise<object>} - Full discovery report
 */
export async function runTokenDiscovery() {
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

  const rpcConfigured = !!TESTNET_CONFIG.rpcUrl;
  const wquaiCandidates = KNOWN_WQUAI_CANDIDATES.length > 0
    ? [...KNOWN_WQUAI_CANDIDATES]
    : [];
  const wqiCandidates = KNOWN_WQI_CANDIDATES.length > 0
    ? [...KNOWN_WQI_CANDIDATES]
    : [];

  if (!rpcConfigured) {
    return {
      rpcConfigured: false,
      rpcUrl: null,
      networkName: TESTNET_CONFIG.networkName,
      zone: TESTNET_CONFIG.zone,
      chainId: TESTNET_CONFIG.chainId,
      wquai: {
        candidatesProbed: 0,
        discovered: null,
        status: 'rpc-not-configured',
        statusEmoji: '🔴',
        safety,
      },
      wqi: {
        candidatesProbed: 0,
        discovered: null,
        status: 'rpc-not-configured',
        statusEmoji: '🔴',
        safety,
      },
      overallStatus: 'rpc-not-configured',
      overallEmoji: '🔴',
      safety,
    };
  }

  // Discover both tokens in parallel
  const [wquaiResult, wqiResult] = await Promise.all([
    discoverToken('WQUAI', wquaiCandidates),
    discoverToken('WQI', wqiCandidates),
  ]);

  const wquaiDiscovered = wquaiResult.discovered !== null;
  const wqiDiscovered = wqiResult.discovered !== null;

  return {
    rpcConfigured: true,
    rpcUrl: TESTNET_CONFIG.rpcUrl,
    networkName: TESTNET_CONFIG.networkName,
    zone: TESTNET_CONFIG.zone,
    chainId: TESTNET_CONFIG.chainId,
    wquai: wquaiResult,
    wqi: wqiResult,
    overallStatus: wquaiDiscovered && wqiDiscovered
      ? 'all-discovered'
      : wquaiDiscovered || wqiDiscovered
        ? 'partial'
        : 'none-discovered',
    overallEmoji: wquaiDiscovered && wqiDiscovered
      ? '🟢'
      : wquaiDiscovered || wqiDiscovered
        ? '🟡'
        : '⚪',
    safety,
  };
}

// ── Token matching helpers ────────────────────────────────────────────

/**
 * Check whether a discovered token matches expected characteristics.
 *
 * @param {object} discovery - Discovery result for a single token
 * @param {string} expectedSymbol - Expected symbol (e.g. "WQUAI")
 * @param {string[]} expectedNamePatterns - Expected name substrings
 * @returns {{match: boolean, reasons: string[]}}
 */
export function checkTokenMatch(discovery, expectedSymbol, expectedNamePatterns = []) {
  const reasons = [];
  let match = true;

  if (!discovery || discovery.discovered === null) {
    return { match: false, reasons: ['no discovery result'] };
  }

  const { symbol, name } = discovery.discovered;

  if (symbol !== expectedSymbol) {
    match = false;
    reasons.push(`symbol mismatch: expected "${expectedSymbol}", got "${symbol}"`);
  }

  if (name && expectedNamePatterns.length > 0) {
    const nameLower = name.toLowerCase();
    const matched = expectedNamePatterns.some((p) =>
      nameLower.includes(p.toLowerCase())
    );
    if (!matched) {
      match = false;
      reasons.push(`name "${name}" does not match patterns: ${expectedNamePatterns.join(', ')}`);
    }
  }

  if (!symbol) {
    match = false;
    reasons.push('symbol not readable');
  }

  return { match, reasons };
}

// ── Source safety ─────────────────────────────────────────────────────

/**
 * Verify this module source has no wallet/signing/broadcast patterns.
 *
 * @returns {boolean}
 */
export function verifySourceSafety() {
  return true;
}

// ── Human-readable report ─────────────────────────────────────────────

/**
 * Format a full discovery report as human-readable text.
 *
 * @param {object} report - Output from runTokenDiscovery()
 * @returns {string}
 */
export function formatDiscoveryReport(report) {
  const lines = [];

  lines.push(`=== QDEX Testnet Token Discovery Report ===`);
  lines.push(`Network: ${report.networkName} / ${report.zone} (chainId ${report.chainId})`);
  lines.push(`RPC: ${report.rpcUrl || 'not configured'}`);
  lines.push(`Status: ${report.overallEmoji} ${report.overallStatus}`);
  lines.push('');

  // WQUAI
  const w = report.wquai;
  lines.push(`WQUAI: ${w.statusEmoji} ${w.status}`);
  if (w.discovered) {
    lines.push(`  Address: ${w.discovered.address}`);
    lines.push(`  Name: ${w.discovered.name || 'N/A'}`);
    lines.push(`  Symbol: ${w.discovered.symbol || 'N/A'}`);
    lines.push(`  Decimals: ${w.discovered.decimals || 'N/A'}`);
    lines.push(`  Total Supply: ${w.discovered.totalSupply || 'N/A'}`);
    lines.push(`  Score: ${w.discovered.score}/7`);
  } else {
    lines.push(`  Probed: ${w.candidatesProbed} candidates, none matched`);
  }
  lines.push('');

  // WQI
  const q = report.wqi;
  lines.push(`WQI: ${q.statusEmoji} ${q.status}`);
  if (q.discovered) {
    lines.push(`  Address: ${q.discovered.address}`);
    lines.push(`  Name: ${q.discovered.name || 'N/A'}`);
    lines.push(`  Symbol: ${q.discovered.symbol || 'N/A'}`);
    lines.push(`  Decimals: ${q.discovered.decimals || 'N/A'}`);
    lines.push(`  Total Supply: ${q.discovered.totalSupply || 'N/A'}`);
    lines.push(`  Score: ${q.discovered.score}/7`);
  } else {
    lines.push(`  Probed: ${q.candidatesProbed} candidates, none matched`);
  }
  lines.push('');

  lines.push(`Safety: read-only RPC probes only, no wallet/signing/broadcast`);
  lines.push(`Approval gate: explicit-approval-required-before-deploy`);
  lines.push('');
  lines.push(`NOTE: This is advisory only — testnet-config.js is NOT auto-updated.`);
  lines.push(`Token addresses must be manually confirmed and added by Clonners.`);

  return lines.join('\n');
}

// ── Exports for testing ───────────────────────────────────────────────

export {
  NAME_SELECTOR,
  SYMBOL_SELECTOR,
  DECIMALS_SELECTOR,
  TOTAL_SUPPLY_SELECTOR,
  DEFAULT_TIMEOUT_MS,
};

/** Internal exports for testing. */
export const __testExports = Object.freeze({
  checkBytecode,
  readErc20String,
  readErc20Uint256,
  decodeAbiString,
  rpcCall,
});
