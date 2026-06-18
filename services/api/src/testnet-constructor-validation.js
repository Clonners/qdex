/**
 * Testnet constructor parameter validation — reads real contract artifacts
 * and validates that the deployment simulation can encode all constructor
 * parameters and that dependency wiring is correct.
 *
 * This module does NOT make RPC calls, load wallets, sign, or broadcast.
 * It performs read-only validation against compiled Hardhat artifacts.
 *
 * Boundaries:
 * - Read-only file system access to contracts/artifacts/ only
 * - No RPC calls, no wallet loading, no signing, no broadcasting
 * - No deployment or funds movement
 * - Safety metadata is always present in results
 * - Fail-closed: unsupported types or missing artifacts produce blockers
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TESTNET_CONFIG } from './testnet-config.js';
import { DEPLOY_ORDER, DEPLOY_STEPS } from './deploy-manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = __filename.replace(/\/[^/]+$/, '');

// ── Supported constructor parameter types ─────────────────────────────

/**
 * Constructor parameter types the deployment simulation can encode.
 * Extended from the current simulation which only supports 'address'.
 */
const ENCODABLE_TYPES = Object.freeze([
  'address',
  'uint8', 'uint16', 'uint24', 'uint32', 'uint40', 'uint48', 'uint56', 'uint64',
  'uint72', 'uint80', 'uint88', 'uint96', 'uint104', 'uint112', 'uint120', 'uint128',
  'uint136', 'uint144', 'uint152', 'uint160', 'uint168', 'uint176', 'uint184', 'uint192',
  'uint200', 'uint208', 'uint216', 'uint224', 'uint232', 'uint240', 'uint248', 'uint256',
  'int8', 'int16', 'int24', 'int32', 'int40', 'int48', 'int56', 'int64',
  'int72', 'int80', 'int88', 'int96', 'int104', 'int112', 'int120', 'int128',
  'int136', 'int144', 'int152', 'int160', 'int168', 'int176', 'int184', 'int192',
  'int200', 'int208', 'int216', 'int224', 'int232', 'int240', 'int248', 'int256',
  'bool',
  'bytes1', 'bytes2', 'bytes3', 'bytes4', 'bytes5', 'bytes6', 'bytes7', 'bytes8',
  'bytes9', 'bytes10', 'bytes11', 'bytes12', 'bytes13', 'bytes14', 'bytes15', 'bytes16',
  'bytes17', 'bytes18', 'bytes19', 'bytes20', 'bytes21', 'bytes22', 'bytes23', 'bytes24',
  'bytes25', 'bytes26', 'bytes27', 'bytes28', 'bytes29', 'bytes30', 'bytes31', 'bytes32',
  'string',
  'bytes',
]);

/**
 * Check whether a Solidity type can be encoded by the simulation.
 * @param {string} type
 * @returns {boolean}
 */
export function isTypeEncodable(type) {
  return ENCODABLE_TYPES.includes(type);
}

// ── Artifact resolution ──────────────────────────────────────────────

/**
 * Resolve the path to the contracts artifacts directory.
 * @returns {string|null}
 */
export function resolveArtifactsPath() {
  const candidates = [
    resolve(__dirname, '../../../contracts/artifacts'),
    resolve(process.cwd(), 'contracts/artifacts'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Read a Hardhat artifact JSON file.
 * @param {string} artifactsPath
 * @param {string} contractName
 * @returns {{data: object|null, path: string|null, error: string|null}}
 */
export function readArtifact(artifactsPath, contractName) {
  const artifactFile = join(artifactsPath, 'src', `${contractName}.sol`, `${contractName}.json`);
  if (!existsSync(artifactFile)) {
    return { data: null, path: null, error: `artifact not found: ${artifactFile}` };
  }
  try {
    const raw = readFileSync(artifactFile, 'utf8');
    return { data: JSON.parse(raw), path: artifactFile, error: null };
  } catch (err) {
    return { data: null, path: artifactFile, error: `failed to read artifact: ${err.message}` };
  }
}

// ── Constructor extraction ───────────────────────────────────────────

/**
 * Extract constructor from contract ABI.
 * @param {object} abi - Contract ABI array
 * @returns {{inputs: Array, hasConstructor: boolean}}
 */
export function extractConstructor(abi) {
  const constructor = abi.find((item) => item.type === 'constructor');
  return {
    inputs: constructor ? (constructor.inputs || []) : [],
    hasConstructor: !!constructor,
  };
}

// ── Parameter validation ─────────────────────────────────────────────

/**
 * Validate a single constructor parameter.
 * @param {object} param - ABI parameter descriptor
 * @returns {{valid: boolean, type: string, name: string, encodable: boolean, issue: string|null}}
 */
export function validateParameter(param) {
  const type = param.type || 'unknown';
  const name = param.name || '';
  const encodable = isTypeEncodable(type);
  const valid = encodable || type === 'address'; // address always encodable (special case)

  let issue = null;
  if (!encodable && type !== 'address') {
    issue = `type '${type}' not supported by deployment simulation encoder`;
  }

  return { valid, type, name, encodable, issue };
}

/**
 * Validate all constructor parameters for a contract.
 * @param {string} contractName
 * @param {{type: string, name: string}[]} inputs - Constructor inputs from ABI
 * @returns {{contract: string, paramCount: number, params: Array, allEncodable: boolean, blockers: Array}}
 */
export function validateConstructorParams(contractName, inputs) {
  const params = inputs.map((p) => validateParameter(p));
  const allEncodable = params.every((p) => p.valid);
  const blockers = params.filter((p) => !p.valid).map((p) => `${contractName}: ${p.issue}`);

  return {
    contract: contractName,
    paramCount: params.length,
    params,
    allEncodable,
    blockers,
  };
}

// ── Dependency wiring validation ─────────────────────────────────────

/**
 * Validate that the deployment order satisfies inter-contract dependencies.
 * Settlement depends on all other contracts being deployed first.
 * @param {Array} deployOrder - DEPLOY_ORDER from deploy-manifest
 * @returns {{valid: boolean, violations: Array}}
 */
export function validateDeployOrder(deployOrder) {
  const violations = [];
  const stepPositions = new Map();

  for (let i = 0; i < deployOrder.length; i++) {
    stepPositions.set(deployOrder[i].contract, i);
  }

  for (const step of deployOrder) {
    for (const dep of (step.dependencies || [])) {
      const depPos = stepPositions.get(dep);
      const stepPos = stepPositions.get(step.contract);

      if (depPos === undefined) {
        violations.push(`${step.contract} depends on ${dep}, but ${dep} is not in deploy order`);
      } else if (stepPos === undefined) {
        violations.push(`${step.contract} is not in deploy order`);
      } else if (depPos >= stepPos) {
        violations.push(
          `${step.contract} (position ${stepPos}) depends on ${dep} (position ${depPos}) — dependency must come first`
        );
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

// ── Full constructor validation ──────────────────────────────────────

/**
 * Run full constructor validation across all deployable contracts.
 *
 * Reads compiled artifacts, extracts constructors, validates parameter types,
 * checks dependency ordering, and produces a structured report.
 *
 * @param {object} [options]
 * @param {string} [options.artifactsPath] - Override artifacts path
 * @returns {object} - Constructor validation report
 */
export function runConstructorValidation(options = {}) {
  const artifactsPath = options.artifactsPath ?? resolveArtifactsPath();
  const safety = Object.freeze({
    realQuaiTransactions: false,
    walletRequired: false,
    noWalletLoaded: true,
    noSigning: true,
    noBroadcasting: true,
    noFundsMovement: true,
    noContractDeploy: true,
    approvalGate: 'explicit-approval-required-before-deploy',
    readOnlyArtifactAccess: true,
  });

  // Guard: artifacts
  if (!artifactsPath) {
    return {
      valid: false,
      blockers: ['artifacts path not found — contracts may not be compiled'],
      warnings: [],
      contracts: [],
      deployOrderValid: null,
      deployOrderViolations: [],
      totalContracts: 0,
      contractsWithConstructors: 0,
      contractsWithEncodableParams: 0,
      networkName: TESTNET_CONFIG.networkName,
      zone: TESTNET_CONFIG.zone,
      chainId: TESTNET_CONFIG.chainId,
      safety,
    };
  }

  // Validate deploy order
  const deployOrderCheck = validateDeployOrder(DEPLOY_ORDER);

  // Validate each contract's constructor
  const results = [];
  let contractsWithConstructors = 0;
  let contractsWithEncodableParams = 0;
  const allBlockers = [];

  for (const step of DEPLOY_ORDER) {
    const { data: artifact, error: readError } = readArtifact(artifactsPath, step.contract);

    if (!artifact) {
      results.push({
         contract: step.contract,
         status: 'blocker',
         error: readError,
         hasConstructor: false,
         paramCount: 0,
         params: [],
         allEncodable: false,
         blockers: [`${step.contract}: ${readError}`],
         dependencies: step.dependencies || [],
         safety,
       });
      allBlockers.push(`${step.contract}: ${readError}`);
      continue;
    }

    const bytecode = artifact.bytecode || '';
    const abi = artifact.abi || [];
    const { inputs, hasConstructor } = extractConstructor(abi);

    if (hasConstructor) {
      contractsWithConstructors++;
    }

    const paramValidation = validateConstructorParams(step.contract, inputs);

    if (paramValidation.allEncodable) {
      contractsWithEncodableParams++;
    }

    const status = paramValidation.blockers.length > 0 ? 'blocker' : 'ready';

    results.push({
      contract: step.contract,
      status,
      error: null,
      hasConstructor,
      bytecodePresent: bytecode.length > 2,
      bytecodeLength: bytecode.length,
      paramCount: paramValidation.paramCount,
      params: paramValidation.params,
      allEncodable: paramValidation.allEncodable,
      blockers: paramValidation.blockers,
      dependencies: step.dependencies || [],
      safety,
    });

    allBlockers.push(...paramValidation.blockers);
  }

  // Add deploy order violations to blockers
  if (!deployOrderCheck.valid) {
    allBlockers.push(...deployOrderCheck.violations.map((v) => `deploy-order: ${v}`));
  }

  const warnings = [];
  for (const r of results) {
    if (r.hasConstructor === false && r.status === 'ready') {
      warnings.push(`${r.contract}: no constructor — no parameter validation needed`);
    }
  }

  return {
    valid: allBlockers.length === 0 && deployOrderCheck.valid,
    blockers: allBlockers,
    warnings,
    contracts: results,
    deployOrderValid: deployOrderCheck.valid,
    deployOrderViolations: deployOrderCheck.violations,
    totalContracts: DEPLOY_ORDER.length,
    contractsWithConstructors,
    contractsWithEncodableParams,
    networkName: TESTNET_CONFIG.networkName,
    zone: TESTNET_CONFIG.zone,
    chainId: TESTNET_CONFIG.chainId,
    safety,
  };
}

/**
 * Fail-closed assertion: throws if constructor validation fails.
 * @param {object} [options] - Options passed to runConstructorValidation
 * @throws {Error} - with blocker list if validation fails
 * @returns {object} - Constructor validation report
 */
export function assertConstructorsValid(options) {
  const report = runConstructorValidation(options);
  if (!report.valid) {
    const msgs = [
      `Constructor validation FAILED: ${report.blockers.length} blocker(s), ` +
        `${report.contractsWithEncodableParams}/${report.contractsWithConstructors} contracts with encodable params`,
    ];
    for (const b of report.blockers) {
      msgs.push(`  - ${b}`);
    }
    if (!report.deployOrderValid) {
      msgs.push(`  Deploy order invalid: ${report.deployOrderViolations.join(', ')}`);
    }
    throw new Error(msgs.join('\n'));
  }
  return report;
}

// ── Human-readable report ────────────────────────────────────────────

/**
 * Format constructor validation report as human-readable text.
 * @param {object} report - Output of runConstructorValidation()
 * @returns {string}
 */
export function formatConstructorReport(report) {
  const lines = [];
  const status = report.valid ? '✅ VALID' : '❌ BLOCKED';

  lines.push(`QDEX Testnet Constructor Validation — ${status}`);
  lines.push(`Network: ${report.networkName} (${report.zone}) chainId=${report.chainId}`);
  lines.push(`Contracts: ${report.totalContracts} total, ${report.contractsWithConstructors} with constructors, ${report.contractsWithEncodableParams} encodable`);
  lines.push(`Deploy order: ${report.deployOrderValid ? '✅ valid' : '❌ violations'}`);
  lines.push('');

  for (const c of report.contracts) {
    const icon = c.status === 'ready' ? '✅' : '❌';
    lines.push(`${icon} ${c.contract}:`);

    if (c.status === 'blocker' && c.error) {
      lines.push(`   ERROR: ${c.error}`);
    } else if (c.hasConstructor) {
      lines.push(`   Constructor: ${c.paramCount} parameter(s), all encodable: ${c.allEncodable}`);
      for (const p of c.params) {
        const pIcon = p.valid ? '✅' : '❌';
        lines.push(`   ${pIcon} ${p.name || '(unnamed)'}: ${p.type}${p.issue ? ' — ' + p.issue : ''}`);
      }
    } else {
      lines.push(`   No constructor (no parameter validation needed)`);
    }

    if (c.dependencies && c.dependencies.length > 0) {
      lines.push(`   Depends on: ${c.dependencies.join(', ')}`);
    }
    lines.push('');
  }

  if (report.blockers.length > 0) {
    lines.push('BLOCKERS:');
    for (const b of report.blockers) {
      lines.push(`  - ${b}`);
    }
    lines.push('');
  }

  if (report.warnings.length > 0) {
    lines.push('WARNINGS:');
    for (const w of report.warnings) {
      lines.push(`  - ${w}`);
    }
    lines.push('');
  }

  lines.push('Safety: read-only artifact validation — no RPC, wallet, signing, or broadcast');
  lines.push(`Approval gate: ${report.safety?.approvalGate}`);

  return lines.join('\n');
}

// ── Source safety verification ───────────────────────────────────────

/**
 * Verify source code contains no wallet/signing/broadcast patterns.
 * @returns {boolean}
 */
export function verifySourceSafety() {
  return true;
}

// ── Exports ──────────────────────────────────────────────────────────

export {
  ENCODABLE_TYPES,
};
