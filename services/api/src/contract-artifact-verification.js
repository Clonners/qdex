/**
 * Contract artifact verification — validates compiled Hardhat artifacts are
 * deployment-ready before any testnet deployment attempt.
 *
 * This module reads local contract artifacts from the Hardhat build output and
 * verifies that all deployable contracts have valid ABI and bytecode, estimates
 * deployment gas costs from bytecode sizes, and produces a structured readiness
 * report. It does NOT make RPC calls, load wallets, sign, or broadcast.
 *
 * Boundaries:
 * - Read-only file system access to contracts/artifacts/ only
 * - No RPC calls, no wallet loading, no signing, no broadcasting
 * - No deployment or funds movement
 * - Safety metadata is always present in results
 * - Fail-closed: missing artifacts or invalid structure produces blockers
 *
 * Gas estimation heuristic: each byte of deployment bytecode costs ~16 gas
 * (EIP-2028 bytecode deposit cost), plus a fixed overhead of ~21,000 gas per
 * contract for tx base cost + initialization overhead. This is a rough estimate
 * for pre-deployment budgeting, not a precise on-chain prediction.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = __filename.replace(/\/[^/]+$/, '');

// Gas cost constants for deployment estimation
const GAS_PER_BYTE_DEPOSIT = 16; // EIP-2028 bytecode deposit cost
const GAS_PER_ZERO_BYTE = 4; // Zero bytes are cheaper
const GAS_TX_BASE_COST = 21000; // Ethereum tx base cost
const GAS_CONTRACT_CREATION_OVERHEAD = 32000; // Extra overhead for contract creation
const GAS_CONSTRUCTOR_AVERAGE = 50000; // Estimated constructor execution gas

// Deployable contracts from DEPLOY_ORDER (canonical deployment order)
const DEPLOYABLE_CONTRACTS = Object.freeze([
  'TradingVault',
  'NonceManager',
  'MarketRegistry',
  'FeeManager',
  'DelegateKeyRegistry',
  'Settlement',
]);

/**
 * Resolve the path to the contracts artifacts directory.
 *
 * @returns {string|null} - Path to artifacts directory, or null if not found
 */
function resolveArtifactsPath() {
  // Walk up from this module to find the contracts directory
  // Module lives in services/api/src/, contracts is at repo root
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

/**
 * Read a Hardhat artifact JSON file for a contract.
 *
 * @param {string} artifactsPath - Path to artifacts directory
 * @param {string} contractName - Contract name (e.g., "TradingVault")
 * @returns {{data: object|null, path: string|null, error: string|null}}
 */
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
 * Validate that an artifact has the required structure for deployment.
 *
 * Checks:
 * - `abi` exists and is a non-empty array
 * - `bytecode` exists and is non-empty (has creation bytecode)
 * - `abi` contains at least one public/external function or event
 *
 * @param {object} artifact - Parsed artifact JSON
 * @returns {{valid: boolean, blockers: string[], warnings: string[]}}
 */
function validateArtifactStructure(artifact) {
  const blockers = [];
  const warnings = [];

  // Check ABI
  if (!artifact.abi) {
    blockers.push('missing ABI');
  } else if (!Array.isArray(artifact.abi)) {
    blockers.push('ABI is not an array');
  } else if (artifact.abi.length === 0) {
    blockers.push('ABI is empty — contract has no interface');
  } else {
    // Check for at least one function or event (sanity check)
    const hasFunctions = artifact.abi.some(
      (item) => item.type === 'function' || item.type === 'event'
    );
    if (!hasFunctions) {
      warnings.push('ABI has no functions or events (only constructor/fallback?)');
    }
  }

  // Check bytecode (creation code)
  if (!artifact.bytecode) {
    blockers.push('missing bytecode');
  } else if (typeof artifact.bytecode !== 'string') {
    blockers.push('bytecode is not a string');
  } else if (artifact.bytecode === '' || artifact.bytecode === '0x') {
    blockers.push('bytecode is empty');
  } else if (!artifact.bytecode.startsWith('0x')) {
    blockers.push('bytecode does not start with 0x prefix');
  }

  return { valid: blockers.length === 0, blockers, warnings };
}

/**
 * Estimate deployment gas cost for a contract from its bytecode size.
 *
 * Uses EIP-2028 bytecode deposit cost (16 gas per byte, 4 per zero byte)
 * plus fixed overhead for tx base cost and contract creation.
 *
 * @param {string} bytecode - Creation bytecode (hex string with 0x prefix)
 * @returns {number} - Estimated deployment gas cost
 */
function estimateDeploymentGas(bytecode) {
  if (!bytecode || bytecode.length <= 2) {
    return 0;
  }

  // Strip 0x prefix
  const hex = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
  const byteCount = hex.length / 2;

  // Count zero bytes for cheaper cost
  let zeroBytes = 0;
  for (let i = 0; i < hex.length; i += 2) {
    if (hex[i] === '0' && hex[i + 1] === '0') {
      zeroBytes++;
    }
  }

  const nonZeroBytes = byteCount - zeroBytes;
  const depositCost = nonZeroBytes * GAS_PER_BYTE_DEPOSIT + zeroBytes * GAS_PER_ZERO_BYTE;

  // Total estimate: tx base + creation overhead + constructor avg + deposit
  return GAS_TX_BASE_COST + GAS_CONTRACT_CREATION_OVERHEAD + GAS_CONSTRUCTOR_AVERAGE + depositCost;
}

/**
 * Extract constructor parameters from artifact ABI.
 *
 * @param {object} artifact - Parsed artifact JSON
 * @returns {{hasConstructor: boolean, inputCount: number, inputTypes: string[]}}
 */
function extractConstructorInfo(artifact) {
  if (!Array.isArray(artifact.abi)) {
    return { hasConstructor: false, inputCount: 0, inputTypes: [] };
  }

  const constructor = artifact.abi.find((item) => item.type === 'constructor');
  if (!constructor) {
    return { hasConstructor: false, inputCount: 0, inputTypes: [] };
  }

  const inputs = constructor.inputs || [];
  return {
    hasConstructor: true,
    inputCount: inputs.length,
    inputTypes: inputs.map((inp) => inp.type || 'unknown'),
  };
}

/**
 * Count public/external functions and events in the ABI.
 *
 * @param {object} artifact - Parsed artifact JSON
 * @returns {{functions: number, events: number, publicFunctions: string[], eventsList: string[]}}
 */
function countAbiInterfaces(artifact) {
  if (!Array.isArray(artifact.abi)) {
    return { functions: 0, events: 0, publicFunctions: [], eventsList: [] };
  }

  const functions = [];
  const events = [];

  for (const item of artifact.abi) {
    if (item.type === 'function' && item.name) {
      // Count view/pure functions too
      functions.push(item.name);
    } else if (item.type === 'event' && item.name) {
      events.push(item.name);
    }
  }

  return {
    functions: functions.length,
    events: events.length,
    publicFunctions: functions,
    eventsList: events,
  };
}

/**
 * Verify all deployable contracts have valid compiled artifacts.
 *
 * Returns a structured report with per-contract validation results,
 * gas estimates, constructor info, and a consolidated readiness status.
 *
 * @param {object} [options] - Verification options
 * @param {string} [options.artifactsPath] - Override artifacts path (default: auto-resolved)
 * @returns {object} - Contract artifact verification report
 */
export function verifyContractArtifacts(options = {}) {
  const artifactsPath = options.artifactsPath || resolveArtifactsPath();
  const results = {};
  const allBlockers = [];
  const allWarnings = [];
  let totalEstimatedGas = 0;

  for (const contractName of DEPLOYABLE_CONTRACTS) {
    const result = { contract: contractName };

    // 1. Read artifact
    const readResult = artifactsPath
      ? readArtifact(artifactsPath, contractName)
      : { data: null, path: null, error: 'artifacts directory not found' };

    if (readResult.error) {
      result.readError = readResult.error;
      result.valid = false;
      result.blockers = [readResult.error];
      allBlockers.push(`${contractName}: ${readResult.error}`);
      results[contractName] = result;
      continue;
    }

    result.artifactPath = readResult.path;

    // 2. Validate structure
    const validation = validateArtifactStructure(readResult.data);
    result.structureValid = validation.valid;
    result.blockers = validation.blockers;
    result.warnings = validation.warnings;

    if (!validation.valid) {
      allBlockers.push(
        `${contractName}: ${validation.blockers.join('; ')}`
      );
    }
    if (validation.warnings.length > 0) {
      allWarnings.push(
        `${contractName}: ${validation.warnings.join('; ')}`
      );
    }

    // 3. Bytecode analysis
    const bytecode = readResult.data.bytecode || '';
    const hexLength = bytecode.startsWith('0x') ? bytecode.slice(2).length : bytecode.length;
    result.bytecodeBytes = Math.floor(hexLength / 2);
    result.gasEstimate = estimateDeploymentGas(bytecode);
    totalEstimatedGas += result.gasEstimate;

    // 4. Constructor info
    result.constructor = extractConstructorInfo(readResult.data);

    // 5. ABI interface counts
    result.interfaces = countAbiInterfaces(readResult.data);

    // Overall validity
    result.valid = validation.valid;

    results[contractName] = result;
  }

  // Consolidated readiness
  const allArtifactsPresent = DEPLOYABLE_CONTRACTS.every(
    (name) => results[name] && !results[name].readError
  );
  const allStructuresValid = DEPLOYABLE_CONTRACTS.every(
    (name) => results[name] && results[name].structureValid
  );
  const ready = allArtifactsPresent && allStructuresValid;

  return {
    ready,
    artifactsPath,
    contracts: results,
    deployableContracts: DEPLOYABLE_CONTRACTS,
    contractsPresent: DEPLOYABLE_CONTRACTS.length,
    contractsValid: DEPLOYABLE_CONTRACTS.filter(
      (name) => results[name] && results[name].valid
    ).length,
    contractsInvalid: DEPLOYABLE_CONTRACTS.filter(
      (name) => results[name] && !results[name].valid
    ).length,
    totalEstimatedGas,
    totalEstimatedGasFormatted: `${(totalEstimatedGas / 1_000_000).toFixed(2)}M`,
    blockers: allBlockers,
    warnings: allWarnings,

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
 * Verify contract artifacts and throw if not ready.
 *
 * @throws {Error} — with consolidated blocker list if not ready
 * @returns {object} - Verification report (same as verifyContractArtifacts)
 */
export function assertArtifactsReady(options) {
  const report = verifyContractArtifacts(options);

  if (!report.ready) {
    throw new Error(
      `Contract artifact verification FAILED — ${report.contractsInvalid}/${report.contractsPresent} invalid:\n` +
      report.blockers.map((b) => `  - ${b}`).join('\n')
    );
  }

  return report;
}

// Export internals for testing
export {
  resolveArtifactsPath,
  readArtifact,
  validateArtifactStructure,
  estimateDeploymentGas,
  extractConstructorInfo,
  countAbiInterfaces,
  DEPLOYABLE_CONTRACTS,
  GAS_PER_BYTE_DEPOSIT,
  GAS_PER_ZERO_BYTE,
  GAS_TX_BASE_COST,
  GAS_CONTRACT_CREATION_OVERHEAD,
  GAS_CONSTRUCTOR_AVERAGE,
};
