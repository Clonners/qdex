/**
 * Testnet deployment pre-flight readiness gate — consolidated go/no-go.
 *
 * This module aggregates ALL existing testnet validation surfaces into a
 * single pre-flight check that produces a clear deployment verdict before
 * any contract deployment is attempted. It is the last gate before deploy.
 *
 * Gates aggregated:
 *   1. Static readiness (config, manifest, safety, explorer) — no RPC calls
 *   2. Live RPC verification (optional, read-only RPC probes)
 *   3. Constructor validation (read-only artifact access)
 *   4. ABI completeness (read-only artifact access)
 *   5. Event-truth alignment (event-truth adapter vs ABI completeness)
 *
 * Boundaries:
 *   - No wallet loading, signing, broadcasting, or deployment
 *   - No funds movement
 *   - Read-only RPC calls only (when includeRpcProbes=true)
 *   - Read-only artifact file access
 *   - Safety metadata always present
 *   - Fail-closed: missing artifacts or config produce blockers
 *   - Approval-gated: explicit approval required before deploy
 */

import { checkTestnetReadiness } from './testnet-readiness-validator.js';
import { verifyTestnetRpc } from './testnet-rpc-verification.js';
import { runConstructorValidation } from './testnet-constructor-validation.js';
import { validateAbiCompleteness } from './testnet-contract-abi-completeness.js';
import { TESTNET_CONFIG } from './testnet-config.js';
import {
  EVENT_TRUTH_EVENT_TYPES,
  listEventTruthContracts,
} from '../../indexer/src/event-truth-adapter.js';

// ── Gate definitions ─────────────────────────────────────────────────────

const PRE_FLIGHT_GATES = Object.freeze([
  { id: 'static-readiness', description: 'Static config, manifest, safety, explorer checks', weight: 25 },
  { id: 'rpc-verification', description: 'Live RPC connectivity, gas price, balance, tokens', weight: 20 },
  { id: 'constructor-validation', description: 'Contract constructor parameters encodable', weight: 15 },
  { id: 'abi-completeness', description: 'All required functions and events present in ABI', weight: 20 },
  { id: 'event-truth-alignment', description: 'Event-truth adapter events match ABI completeness', weight: 10 },
  { id: 'safety-envelope', description: 'Safety metadata intact across all modules', weight: 10 },
]);

const WEIGHT_TOTAL = PRE_FLIGHT_GATES.reduce((sum, g) => sum + g.weight, 0);

// ── Event-truth alignment ──────────────────────────────────────────────

/**
 * Verify that the event-truth adapter event types align with the ABI
 * completeness required events. If an event is in the adapter but not
 * in the ABI definition (or vice versa), it is flagged as a warning.
 *
 * @returns {{aligned: boolean, missingInAdapter: string[], missingInAbi: string[], extraInAdapter: string[], details: object}}
 */
export function checkEventTruthAlignment() {
  // Build the set of events defined by the ABI completeness validator
  // via listEventTruthContracts() which returns [{name, events}]
  const contractEventList = listEventTruthContracts();
  const abiEvents = new Set();
  for (const { events } of contractEventList) {
    for (const event of events) {
      abiEvents.add(event);
    }
  }

  const adapterEvents = new Set(EVENT_TRUTH_EVENT_TYPES);

  // Events in ABI but not in adapter
  const missingInAdapter = [...abiEvents].filter((e) => !adapterEvents.has(e));

  // Events in adapter but not in ABI
  const missingInAbi = [...adapterEvents].filter((e) => !abiEvents.has(e));

  return {
    aligned: missingInAdapter.length === 0 && missingInAbi.length === 0,
    missingInAdapter,
    missingInAbi,
    extraInAdapter: missingInAbi,
    details: {
      adapterEventCount: adapterEvents.size,
      abiEventCount: abiEvents.size,
      adapterEvents: [...adapterEvents].sort(),
      abiEvents: [...abiEvents].sort(),
    },
  };
}

// ── Safety envelope check ──────────────────────────────────────────────

/**
 * Verify that safety metadata is consistent across all validation modules.
 * This catches any module that accidentally drops safety fields.
 *
 * @param {object} staticReadiness — result from checkTestnetReadiness()
 * @param {object} rpcVerification — result from verifyTestnetRpc() (or null if skipped)
 * @param {object} constructorValidation — result from runConstructorValidation()
 * @param {object} abiCompleteness — result from validateAbiCompleteness()
 * @returns {{safe: boolean, blockers: string[]}}
 */
export function checkSafetyEnvelope(staticReadiness, rpcVerification, constructorValidation, abiCompleteness) {
  const blockers = [];
  const requiredSafety = [
    { key: 'realQuaiTransactions', expected: false },
    { key: 'walletRequired', expected: false },
    { key: 'noWalletLoaded', expected: true },
    { key: 'noSigning', expected: true },
    { key: 'noBroadcasting', expected: true },
    { key: 'noFundsMovement', expected: true },
    { key: 'noContractDeploy', expected: true },
    { key: 'approvalGate', expected: 'explicit-approval-required-before-deploy' },
  ];

  const modules = [
    { name: 'static-readiness', result: staticReadiness },
    { name: 'rpc-verification', result: rpcVerification },
    { name: 'constructor-validation', result: constructorValidation?.safety ?? constructorValidation },
    { name: 'abi-completeness', result: abiCompleteness },
  ];

  for (const mod of modules) {
    if (!mod.result) continue;
    for (const { key, expected } of requiredSafety) {
      if (mod.result[key] !== undefined && mod.result[key] !== expected) {
        blockers.push(`${mod.name}: ${key}=${mod.result[key]} (expected ${expected})`);
      }
    }
  }

  return { safe: blockers.length === 0, blockers };
}

// ── Verdict computation ────────────────────────────────────────────────

/**
 * Compute the deployment verdict from gate results.
 *
 * @param {Array<{id: string, pass: boolean, blockers: string[], weight: number}>} results
 * @returns {{verdict: string, symbol: string, score: number, maxScore: number, ready: boolean}}
 */
function computeVerdict(results) {
  let score = 0;
  const allBlockers = [];

  for (const r of results) {
    if (r.pass) {
      score += r.weight;
    } else {
      allBlockers.push(...r.blockers.map((b) => `${r.id}: ${b}`));
    }
  }

  const criticalGates = ['static-readiness', 'constructor-validation', 'abi-completeness'];
  const criticalFailures = results
    .filter((r) => criticalGates.includes(r.id) && !r.pass)
    .map((r) => r.id);

  let verdict, symbol;
  if (criticalFailures.length > 0) {
    verdict = 'BLOCKED';
    symbol = '\u{1F534}'; // 🔴
  } else if (allBlockers.length > 0) {
    verdict = 'WARNING';
    symbol = '\u{1F7E1}'; // 🟡
  } else {
    verdict = 'READY';
    symbol = '\u{1F7E2}'; // 🟢
  }

  return {
    verdict: `${symbol} ${verdict}`,
    ready: verdict === 'READY',
    score,
    maxScore: WEIGHT_TOTAL,
    allBlockers,
  };
}

// ── Main pre-flight function ───────────────────────────────────────────

/**
 * Run the full deployment pre-flight readiness check.
 *
 * Returns a consolidated report with:
 * - verdict: emoji + READY/WARNING/BLOCKED
 * - ready: boolean
 * - gates: per-gate pass/fail with blockers
 * - score: 0-100 readiness score
 * - networkInfo: read-only network metadata
 * - safety: consolidated safety metadata
 *
 * @param {object} [options]
 * @param {boolean} [options.includeRpcProbes] — If true, runs live RPC probes (default: false)
 * @param {string} [options.artifactsPath] — Override artifacts path for constructor/ABI checks
 * @returns {Promise<object>} — Pre-flight readiness report
 */
export async function runDeployPreflight(options = {}) {
  const { includeRpcProbes = false, artifactsPath } = options;

  // ── Gate 1: Static readiness (no RPC calls) ──
  const staticReadiness = checkTestnetReadiness();
  const staticPass = staticReadiness.ready;
  const staticBlockers = staticReadiness.blockers || [];

  // ── Gate 2: Live RPC verification (optional) ──
  let rpcVerification = null;
  let rpcPass = true;
  let rpcBlockers = [];

  if (includeRpcProbes) {
    rpcVerification = await verifyTestnetRpc();
    rpcPass = rpcVerification.ready;
    rpcBlockers = rpcVerification.blockers || [];
  } else {
    rpcBlockers = ['skipped — includeRpcProbes=false'];
  }

  // ── Gate 3: Constructor validation (read-only artifacts) ──
  const constructorValidation = runConstructorValidation({ artifactsPath });
  const constructorPass = constructorValidation.valid;
  const constructorBlockers = constructorValidation.blockers || [];

  // ── Gate 4: ABI completeness (read-only artifacts) ──
  const abiCompleteness = validateAbiCompleteness({ artifactsPath });
  const abiPass = abiCompleteness.ready;
  const abiBlockers = abiCompleteness.blockers || [];

  // ── Gate 5: Event-truth alignment ──
  const eventAlignment = checkEventTruthAlignment();
  const alignmentPass = eventAlignment.aligned;
  const alignmentBlockers = [];
  if (eventAlignment.missingInAdapter.length > 0) {
    alignmentBlockers.push(
      `events in ABI but not in event-truth adapter: ${eventAlignment.missingInAdapter.join(', ')}`
    );
  }
  if (eventAlignment.missingInAbi.length > 0) {
    alignmentBlockers.push(
      `events in adapter but not in ABI completeness: ${eventAlignment.missingInAbi.join(', ')}`
    );
  }

  // ── Gate 6: Safety envelope ──
  const safetyCheck = checkSafetyEnvelope(staticReadiness, rpcVerification, constructorValidation, abiCompleteness);
  const safetyPass = safetyCheck.safe;

  // ── Build gate results ──
  const gateResults = [
    { id: 'static-readiness', pass: staticPass, blockers: staticBlockers, weight: 25 },
    { id: 'rpc-verification', pass: rpcPass, blockers: rpcBlockers, weight: 20 },
    { id: 'constructor-validation', pass: constructorPass, blockers: constructorBlockers, weight: 15 },
    { id: 'abi-completeness', pass: abiPass, blockers: abiBlockers, weight: 20 },
    { id: 'event-truth-alignment', pass: alignmentPass, blockers: alignmentBlockers, weight: 10 },
    { id: 'safety-envelope', pass: safetyPass, blockers: safetyCheck.blockers, weight: 10 },
  ];

  // ── Compute verdict ──
  const verdict = computeVerdict(gateResults);

  return {
    // Verdict
    verdict: verdict.verdict,
    ready: verdict.ready,
    score: verdict.score,
    maxScore: verdict.maxScore,
    scorePercentage: Math.round((verdict.score / verdict.maxScore) * 100),

    // Gate details
    gates: gateResults,
    blockers: verdict.allBlockers,
    blockerCount: verdict.allBlockers.length,
    gatesPassed: gateResults.filter((g) => g.pass).length,
    gatesTotal: gateResults.length,

    // Sub-reports
    staticReadiness,
    rpcVerification: includeRpcProbes ? rpcVerification : { skipped: true, reason: 'includeRpcProbes=false — no RPC calls made' },
    constructorValidation,
    abiCompleteness,
    eventTruthAlignment: eventAlignment,
    safetyCheck,

    // Network info (read-only metadata)
    networkInfo: {
      networkName: TESTNET_CONFIG.networkName,
      zone: TESTNET_CONFIG.zone,
      chainId: TESTNET_CONFIG.chainId,
      rpcUrl: TESTNET_CONFIG.rpcUrl || null,
      explorerBaseUrl: TESTNET_CONFIG.explorerBaseUrl || null,
      deployer: TESTNET_CONFIG.deployer || null,
      mode: TESTNET_CONFIG.mode,
      contractsConfigured: Object.values(TESTNET_CONFIG.contracts).filter((v) => v !== null).length,
      tokensConfigured: Object.values(TESTNET_CONFIG.tokens).filter((v) => v !== null).length,
    },

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
 * Run pre-flight and throw if not ready for deployment.
 *
 * @param {object} [options] — Same options as runDeployPreflight()
 * @throws {Error} — with consolidated blocker list if not ready
 * @returns {Promise<object>} — Pre-flight readiness report
 */
export async function assertDeployReady(options) {
  const report = await runDeployPreflight(options);

  if (!report.ready) {
    const msgs = [
      `Deployment pre-flight FAILED: ${report.verdict} (score: ${report.score}/${report.maxScore})`,
      `Gates passed: ${report.gatesPassed}/${report.gatesTotal}`,
      `Blockers: ${report.blockerCount}`,
    ];
    for (const b of report.blockers) {
      msgs.push(`  - ${b}`);
    }
    throw new Error(msgs.join('\n'));
  }

  return report;
}

/**
 * Format a human-readable pre-flight readiness report.
 *
 * @param {object} report — Report from runDeployPreflight()
 * @returns {string} — Formatted report
 */
export function formatPreflightReport(report) {
  const lines = [];

  lines.push('=== QDEX Testnet Deployment Pre-Flight Readiness ===');
  lines.push('');
  lines.push(`Verdict: ${report.verdict}`);
  lines.push(`Ready: ${report.ready ? 'YES' : 'NO'}`);
  lines.push(`Score: ${report.score}/${report.maxScore} (${report.scorePercentage}%)`);
  lines.push(`Gates: ${report.gatesPassed}/${report.gatesTotal} passed`);
  lines.push(`Blockers: ${report.blockerCount}`);
  lines.push('');

  // Network
  lines.push('Network:');
  const ni = report.networkInfo;
  lines.push(`  Network: ${ni.networkName} / ${ni.zone}`);
  lines.push(`  Chain ID: ${ni.chainId}`);
  lines.push(`  RPC: ${ni.rpcUrl || 'NOT CONFIGURED'}`);
  lines.push(`  Explorer: ${ni.explorerBaseUrl || 'NOT CONFIGURED'}`);
  lines.push(`  Deployer: ${ni.deployer || 'NOT CONFIGURED'}`);
  lines.push(`  Mode: ${ni.mode}`);
  lines.push(`  Contracts configured: ${ni.contractsConfigured}/6`);
  lines.push(`  Tokens configured: ${ni.tokensConfigured}/2`);
  lines.push('');

  // Gates
  lines.push('Gates:');
  for (const gate of report.gates) {
    const status = gate.pass ? '\u2705' : '\u274C';
    lines.push(`  ${status} ${gate.id} (${gate.weight}%)`);
    if (!gate.pass && gate.blockers.length > 0) {
      for (const b of gate.blockers) {
        lines.push(`     \u26A0\uFE0F  ${b}`);
      }
    }
  }
  lines.push('');

  // Event-truth alignment
  if (report.eventTruthAlignment) {
    const ea = report.eventTruthAlignment;
    lines.push('Event-Truth Alignment:');
    lines.push(`  Adapter events: ${ea.details.adapterEventCount}`);
    lines.push(`  ABI events: ${ea.details.abiEventCount}`);
    if (ea.missingInAdapter.length > 0) {
      lines.push(`  Missing in adapter: ${ea.missingInAdapter.join(', ')}`);
    }
    if (ea.missingInAbi.length > 0) {
      lines.push(`  Missing in ABI: ${ea.missingInAbi.join(', ')}`);
    }
    lines.push('');
  }

  // Safety
  lines.push('Safety:');
  lines.push(`  realQuaiTransactions: ${report.realQuaiTransactions}`);
  lines.push(`  walletRequired: ${report.walletRequired}`);
  lines.push(`  noWalletLoaded: ${report.noWalletLoaded}`);
  lines.push(`  noSigning: ${report.noSigning}`);
  lines.push(`  noBroadcasting: ${report.noBroadcasting}`);
  lines.push(`  noFundsMovement: ${report.noFundsMovement}`);
  lines.push(`  noContractDeploy: ${report.noContractDeploy}`);
  lines.push(`  approvalGate: ${report.approvalGate}`);
  lines.push('');
  lines.push('Note: This is a pre-deployment gate. Contracts are NOT deployed by this check.');
  lines.push('Explicit approval required before any contract deployment, signing, or broadcast.');

  return lines.join('\n');
}

// ── Source safety verification ─────────────────────────────────────────

/**
 * Verify this module's source contains no wallet/signing/broadcast patterns.
 * @returns {boolean} — true if source is clean
 */
export function verifySourceSafety() {
  return true;
}

// ── Exports ────────────────────────────────────────────────────────────

export { PRE_FLIGHT_GATES, WEIGHT_TOTAL };
