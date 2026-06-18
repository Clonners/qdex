/**
 * Testnet contract ABI completeness validator — read-only pre-deployment gate.
 *
 * Validates that compiled Hardhat artifacts contain all required functions and
 * events for the QDEX protocol. This is the bridge between "bytecode exists"
 * (contract-artifact-verification.js) and "interface is deployable" (ready for
 * testnet deployment).
 *
 * Boundaries:
 * - Read-only file system access to contracts/artifacts/ only
 * - No RPC calls, no wallet loading, no signing, no broadcasting
 * - No deployment or funds movement
 * - Safety metadata always present
 * - Fail-closed: missing required ABI members produces blockers
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = __filename.replace(/\/[^/]+$/, '');

// ── Required ABI completeness definitions ────────────────────────────────────
// Each contract lists required functions and events that MUST be present in
// the compiled ABI for the DEX protocol to operate correctly.
//
// These are derived from the cutover plan event list (Task 5) and the contract
// architecture docs.

/** @type {Readonly<Record<string, { functions: string[]; events: string[] }>} */
export const REQUIRED_ABI_MEMBERS = Object.freeze({
  TradingVault: {
    functions: [
      'deposit',
      'withdraw',
      'balanceOf',
      'owner',
      'setSettlementAuthority',
    ],
    events: ['Deposit', 'Withdraw'],
  },
  Settlement: {
    functions: [
      'settleTrade',
      'settlementStatus',
    ],
    events: ['TradeSettled'],
  },
  NonceManager: {
    functions: [
      'incrementNonce',
      'cancelNonce',
      'cancelNonceRange',
    ],
    events: ['NonceUsed', 'NonceCancelled', 'NonceRangeCancelled'],
  },
  MarketRegistry: {
    functions: [
      'addMarket',
      'disableMarket',
      'isMarketEnabled',
    ],
    events: ['MarketAdded', 'MarketDisabled'],
  },
  FeeManager: {
    functions: [
      'setFeePolicy',
      'getFeeBps',
    ],
    events: ['FeesUpdated'],
  },
  DelegateKeyRegistry: {
    functions: [
      'registerKey',
      'revokeKey',
      'getKeyPermissions',
    ],
    events: ['DelegateKeyRegistered', 'DelegateKeyRevoked'],
  },
});

export const ABI_COMPLETENESS_CONTRACTS = Object.freeze([
  'TradingVault',
  'Settlement',
  'NonceManager',
  'MarketRegistry',
  'FeeManager',
  'DelegateKeyRegistry',
]);

// ── Internal helpers ─────────────────────────────────────────────────────────

function resolveArtifactsPath() {
  const possiblePaths = [
    resolve(__dirname, '../../../contracts/artifacts'),
    resolve(__dirname, '../../contracts/artifacts'),
    resolve(process.cwd(), 'contracts/artifacts'),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

function readArtifact(artifactsPath, contractName) {
  const artifactFile = join(artifactsPath, 'src', `${contractName}.sol`, `${contractName}.json`);

  if (!existsSync(artifactFile)) {
    return { data: null, path: null, error: `artifact not found: ${artifactFile}` };
  }

  try {
    const raw = readFileSync(artifactFile, 'utf8');
    const data = JSON.parse(raw);
    return { data, path: artifactFile, error: null };
  } catch (err) {
    return { data: null, path: null, error: `failed to parse artifact: ${err.message}` };
  }
}

/**
 * Extract function names from ABI.
 */
function extractFunctionNames(abi) {
  if (!Array.isArray(abi)) return [];
  return abi
    .filter((item) => item.type === 'function' && item.name)
    .map((item) => item.name);
}

/**
 * Extract event names from ABI.
 */
function extractEventNames(abi) {
  if (!Array.isArray(abi)) return [];
  return abi
    .filter((item) => item.type === 'event' && item.name)
    .map((item) => item.name);
}

/**
 * Check ABI completeness for a single contract.
 *
 * @param {object} artifact - Parsed artifact JSON
 * @param {string} contractName - Contract name
 * @returns {{complete: boolean, missingFunctions: string[], missingEvents: string[], presentFunctions: string[], presentEvents: string[]}}
 */
export function checkAbiCompleteness(artifact, contractName) {
  const required = REQUIRED_ABI_MEMBERS[contractName];
  if (!required) {
    return {
      complete: false,
      missingFunctions: [],
      missingEvents: [],
      presentFunctions: [],
      presentEvents: [],
      error: `no completeness definition for contract "${contractName}"`,
    };
  }

  const presentFunctions = extractFunctionNames(artifact.abi);
  const presentEvents = extractEventNames(artifact.abi);

  const missingFunctions = required.functions.filter(
    (fn) => !presentFunctions.includes(fn),
  );
  const missingEvents = required.events.filter(
    (evt) => !presentEvents.includes(evt),
  );

  return {
    complete: missingFunctions.length === 0 && missingEvents.length === 0,
    missingFunctions,
    missingEvents,
    presentFunctions,
    presentEvents,
    error: null,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate ABI completeness for all deployable contracts.
 *
 * Reads compiled Hardhat artifacts and checks that each contract's ABI
 * contains all required functions and events for the DEX protocol.
 *
 * @param {object} [options]
 * @param {string} [options.artifactsPath] - Override artifacts path
 * @returns {object} - ABI completeness validation report
 */
export function validateAbiCompleteness(options = {}) {
  const artifactsPath = options.artifactsPath || resolveArtifactsPath();
  const results = {};
  const allBlockers = [];
  let totalMissingFunctions = 0;
  let totalMissingEvents = 0;

  for (const contractName of ABI_COMPLETENESS_CONTRACTS) {
    const result = { contract: contractName };

    // 1. Read artifact
    const readResult = artifactsPath
      ? readArtifact(artifactsPath, contractName)
      : { data: null, path: null, error: 'artifacts directory not found' };

    if (readResult.error) {
      result.readError = readResult.error;
      result.complete = false;
      result.missingFunctions = [];
      result.missingEvents = [];
      allBlockers.push(`${contractName}: ${readResult.error}`);
      results[contractName] = result;
      continue;
    }

    result.artifactPath = readResult.path;

    // 2. Check completeness
    const completeness = checkAbiCompleteness(readResult.data, contractName);
    result.complete = completeness.complete;
    result.missingFunctions = completeness.missingFunctions;
    result.missingEvents = completeness.missingEvents;
    result.presentFunctions = completeness.presentFunctions;
    result.presentEvents = completeness.presentEvents;
    result.requiredFunctions = REQUIRED_ABI_MEMBERS[contractName].functions;
    result.requiredEvents = REQUIRED_ABI_MEMBERS[contractName].events;

    if (completeness.missingFunctions.length > 0) {
      totalMissingFunctions += completeness.missingFunctions.length;
      allBlockers.push(
        `${contractName}: missing functions: ${completeness.missingFunctions.join(', ')}`,
      );
    }
    if (completeness.missingEvents.length > 0) {
      totalMissingEvents += completeness.missingEvents.length;
      allBlockers.push(
        `${contractName}: missing events: ${completeness.missingEvents.join(', ')}`,
      );
    }

    results[contractName] = result;
  }

  const allComplete = ABI_COMPLETENESS_CONTRACTS.every(
    (name) => results[name] && results[name].complete === true,
  );

  return {
    ready: allComplete,
    artifactsPath,
    contracts: results,
    contractsChecked: ABI_COMPLETENESS_CONTRACTS.length,
    contractsComplete: ABI_COMPLETENESS_CONTRACTS.filter(
      (name) => results[name] && results[name].complete === true,
    ).length,
    contractsIncomplete: ABI_COMPLETENESS_CONTRACTS.filter(
      (name) => results[name] && results[name].complete !== true,
    ).length,
    totalMissingFunctions,
    totalMissingEvents,
    blockers: allBlockers,

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
 * Assert ABI completeness, throw if incomplete.
 *
 * @throws {Error} — with consolidated blocker list if incomplete
 * @returns {object} - Validation report
 */
export function assertAbiComplete(options) {
  const report = validateAbiCompleteness(options);

  if (!report.ready) {
    const missing = [];
    if (report.totalMissingFunctions > 0) {
      missing.push(`${report.totalMissingFunctions} function(s)`);
    }
    if (report.totalMissingEvents > 0) {
      missing.push(`${report.totalMissingEvents} event(s)`);
    }
    throw new Error(
      `ABI completeness validation FAILED — ${report.contractsIncomplete}/${report.contractsChecked} incomplete, missing ${missing.join(' and ')}:\n` +
        report.blockers.map((b) => `  - ${b}`).join('\n'),
    );
  }

  return report;
}

/**
 * Generate a human-readable ABI completeness summary.
 *
 * @param {object} report - Report from validateAbiCompleteness()
 * @returns {string} - Formatted summary
 */
export function formatAbiCompletenessSummary(report) {
  const lines = [];
  lines.push('=== QDEX Contract ABI Completeness Report ===');
  lines.push('');
  lines.push(`Contracts checked: ${report.contractsChecked}`);
  lines.push(`Complete: ${report.contractsComplete}/${report.contractsChecked}`);
  lines.push(`Ready for deployment: ${report.ready}`);
  lines.push('');

  for (const contractName of ABI_COMPLETENESS_CONTRACTS) {
    const r = report.contracts[contractName];
    if (!r) continue;

    const status = r.readError
      ? `❌ ${r.readError}`
      : r.complete
        ? '✅ complete'
        : `❌ missing ${r.missingFunctions.length} function(s), ${r.missingEvents.length} event(s)`;

    lines.push(`${contractName}: ${status}`);

    if (r.missingFunctions && r.missingFunctions.length > 0) {
      lines.push(`  Missing functions: ${r.missingFunctions.join(', ')}`);
    }
    if (r.missingEvents && r.missingEvents.length > 0) {
      lines.push(`  Missing events: ${r.missingEvents.join(', ')}`);
    }
  }

  if (report.blockers.length > 0) {
    lines.push('');
    lines.push('Blockers:');
    for (const b of report.blockers) {
      lines.push(`  - ${b}`);
    }
  }

  lines.push('');
  lines.push('Safety: no wallet loaded, no RPC calls, no signing, no broadcast');
  lines.push('Approval: explicit approval required before deployment');

  return lines.join('\n');
}

// Export internals for testing
export { resolveArtifactsPath, readArtifact, extractFunctionNames, extractEventNames };
