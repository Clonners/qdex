/**
 * Testnet end-to-end acceptance script — dry-run operator checklist.
 *
 * This module implements the cutover plan Task 7 acceptance checklist as a
 * programmable, fail-closed validation gate. It aggregates readiness from
 * all existing surfaces (config, manifest, safety, explorer, relayer,
 * readiness validator) and produces a single pass/fail report.
 *
 * Boundaries:
 * - Read-only validation only. No RPC calls, no wallet loading, no signing,
 *   no broadcasting, no deployment, no funds movement.
 * - All checks pass or fail based on static configuration state.
 * - The script names every gate, its status, and why it passed or failed.
 * - Safety metadata is always present in the report.
 */

import { TESTNET_CONFIG } from './testnet-config.js';
import {
  explorerUrlForTx,
  explorerUrlForAddress,
  explorerUrlForBlock,
} from './testnet-config.js';
import { checkDeployReadiness } from './deploy-readiness-check.js';
import { checkTestnetReadiness } from './testnet-readiness-validator.js';

// ── Gate definitions ─────────────────────────────────────────────────

const GATES = Object.freeze([
  {
    id: 'network-config',
    description: 'Network, zone, chain ID, RPC, explorer configured',
    weight: 20,
  },
  {
    id: 'deployer-address',
    description: 'Deployer wallet address configured and valid format',
    weight: 15,
  },
  {
    id: 'deploy-manifest',
    description: 'Deploy manifest valid, all steps pending, draft-dry-run mode',
    weight: 15,
  },
  {
    id: 'safety-metadata',
    description: 'Safety metadata intact: no wallet, no signing, no broadcast, no deploy',
    weight: 15,
  },
  {
    id: 'explorer-helpers',
    description: 'Explorer URL helpers functional (tx, address, block)',
    weight: 10,
  },
  {
    id: 'relayer-gate',
    description: 'Relayer in mock mode, approval-gated for quai_contract',
    weight: 10,
  },
  {
    id: 'contracts-null-before-deploy',
    description: 'All contract addresses null (expected before deployment)',
    weight: 10,
  },
  {
    id: 'tokens-configured',
    description: 'Token addresses configured (WQUAI, WQI on Orchard)',
    weight: 5,
  },
]);

const WEIGHT_TOTAL = GATES.reduce((sum, g) => sum + g.weight, 0);

// ── Individual gate checks ───────────────────────────────────────────

function checkNetworkConfig() {
  const blockers = [];
  const details = {};

  if (!TESTNET_CONFIG.networkName) blockers.push('networkName missing');
  details.networkName = TESTNET_CONFIG.networkName;

  if (!TESTNET_CONFIG.zone) blockers.push('zone missing');
  details.zone = TESTNET_CONFIG.zone;

  if (!TESTNET_CONFIG.chainId) blockers.push('chainId missing');
  details.chainId = TESTNET_CONFIG.chainId;

  if (!TESTNET_CONFIG.rpcUrl) blockers.push('rpcUrl missing');
  details.rpcUrl = TESTNET_CONFIG.rpcUrl;

  if (!TESTNET_CONFIG.explorerBaseUrl) blockers.push('explorerBaseUrl missing');
  details.explorerBaseUrl = TESTNET_CONFIG.explorerBaseUrl;

  return {
    pass: blockers.length === 0,
    blockers,
    details,
  };
}

function checkDeployerAddress() {
  const blockers = [];
  const details = {};

  if (!TESTNET_CONFIG.deployer) {
    blockers.push('deployer address not configured');
    details.deployer = null;
  } else {
    details.deployer = TESTNET_CONFIG.deployer;
    if (!/^0x[a-fA-F0-9]{40}$/i.test(TESTNET_CONFIG.deployer)) {
      blockers.push(`deployer address invalid format: ${TESTNET_CONFIG.deployer}`);
    }
  }

  return { pass: blockers.length === 0, blockers, details };
}

function checkDeployManifest() {
  const deployReadiness = checkDeployReadiness();
  const details = {
    manifestValid: deployReadiness.manifest.manifestValid,
    mode: deployReadiness.manifest.steps?.length ?? 0,
    stepsPending: deployReadiness.manifest.steps?.every((s) => s.status === 'pending') ?? false,
  };

  const blockers = [];
  if (!deployReadiness.manifest.ready) {
    blockers.push(`deploy manifest not ready: ${deployReadiness.manifest.blockers.join('; ')}`);
  }

  return { pass: deployReadiness.manifest.ready, blockers, details };
}

function checkSafetyMetadata() {
  const deployReadiness = checkDeployReadiness();
  const details = {
    testnetMode: TESTNET_CONFIG.mode,
    manifestCanBroadcast: false,
    manifestDeployed: false,
    manifestRealQuaiTransactions: false,
    manifestWalletRequired: false,
  };

  const blockers = [];
  if (!deployReadiness.safety.safe) {
    blockers.push(`safety metadata compromised: ${deployReadiness.safety.blockers.join('; ')}`);
  }

  return { pass: deployReadiness.safety.safe, blockers, details };
}

function checkExplorerHelpers() {
  const blockers = [];
  const details = {};

  const testTx = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const testAddr = '0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267';
  const testBlock = 12345;

  const txUrl = explorerUrlForTx(testTx);
  const addrUrl = explorerUrlForAddress(testAddr);
  const blockUrl = explorerUrlForBlock(testBlock);
  const nullTxUrl = explorerUrlForTx(null);
  const nullAddrUrl = explorerUrlForAddress('');
  const nullBlockUrl = explorerUrlForBlock(null);

  details.txUrl = txUrl;
  details.addressUrl = addrUrl;
  details.blockUrl = blockUrl;
  details.nullGuards = nullTxUrl === null && nullAddrUrl === null && nullBlockUrl === null;

  if (!txUrl || !txUrl.includes(testTx.slice(2))) {
    blockers.push('explorerUrlForTx produces invalid URL');
  }
  if (!addrUrl || !addrUrl.includes(testAddr.slice(2))) {
    blockers.push('explorerUrlForAddress produces invalid URL');
  }
  if (!blockUrl || !blockUrl.includes(String(testBlock))) {
    blockers.push('explorerUrlForBlock produces invalid URL');
  }
  if (!details.nullGuards) {
    blockers.push('explorer null guards failing');
  }

  return { pass: blockers.length === 0, blockers, details };
}

async function checkRelayerGate() {
  // Import lazily to avoid circular deps
  const blockers = [];
  const details = {};

  try {
    const { evaluateRelayerRealModeReadiness } = await import(
      '../../relayer/src/real-mode-gate.js'
    );
    const mockResult = evaluateRelayerRealModeReadiness({ settlementMode: 'mock' });
    const blockedResult = evaluateRelayerRealModeReadiness({ settlementMode: 'quai_contract' });

    details.mockAllowed = mockResult.allowed;
    details.mockReason = mockResult.reason;
    details.quaiContractAllowed = blockedResult.allowed;
    details.quaiContractReason = blockedResult.reason;

    if (!mockResult.allowed) {
      blockers.push('relayer mock mode not allowed');
    }
    if (blockedResult.allowed) {
      blockers.push('relayer quai_contract mode should be blocked without approval');
    }
  } catch (err) {
    blockers.push(`relayer gate import error: ${err.message}`);
  }

  return { pass: blockers.length === 0, blockers, details };
}

function checkContractsNull() {
  const contracts = TESTNET_CONFIG.contracts;
  const contractNames = Object.keys(contracts);
  const allNull = contractNames.every((name) => contracts[name] === null);

  return {
    pass: allNull,
    blockers: allNull ? [] : [`unexpected non-null contract addresses before deploy`],
    details: {
      total: contractNames.length,
      allNull: allNull,
      contracts: contractNames.map((name) => ({ name, address: contracts[name] })),
    },
  };
}

function checkTokensConfigured() {
  const tokens = TESTNET_CONFIG.tokens;
  const tokenNames = Object.keys(tokens);
  const allConfigured = tokenNames.every((name) => tokens[name] !== null);

  return {
    pass: allConfigured,
    blockers: allConfigured ? [] : ['token addresses not configured'],
    details: {
      total: tokenNames.length,
      allConfigured: allConfigured,
      tokens: tokenNames.map((name) => ({ name, address: tokens[name] })),
    },
  };
}

const GATE_MAP = {
  'network-config': checkNetworkConfig,
  'deployer-address': checkDeployerAddress,
  'deploy-manifest': checkDeployManifest,
  'safety-metadata': checkSafetyMetadata,
  'explorer-helpers': checkExplorerHelpers,
  'relayer-gate': checkRelayerGate,
  'contracts-null-before-deploy': checkContractsNull,
  'tokens-configured': checkTokensConfigured,
};

// ── Operator deployment checklist (from cutover plan Task 7) ─────────

function buildDeploymentChecklist() {
  const networkConfirmed =
    TESTNET_CONFIG.rpcUrl &&
    TESTNET_CONFIG.chainId &&
    TESTNET_CONFIG.explorerBaseUrl &&
    TESTNET_CONFIG.networkName &&
    TESTNET_CONFIG.zone;

  const deployerConfirmed =
    TESTNET_CONFIG.deployer && /^0x[a-fA-F0-9]{40}$/i.test(TESTNET_CONFIG.deployer);

  const allContractsNull = Object.values(TESTNET_CONFIG.contracts).every((v) => v === null);
  const allTokensConfigured = Object.values(TESTNET_CONFIG.tokens).every((v) => v !== null);

  return [
    { step: 1, item: 'Confirm network, zone, chain ID, RPC, explorer, and test token addresses', done: networkConfirmed && allTokensConfigured },
    { step: 2, item: 'Confirm test wallet funding and signing path', done: false },
    { step: 3, item: 'Deploy contracts and record addresses', done: false },
    { step: 4, item: 'Verify local contract invariants against deployed ABI/source', done: false },
    { step: 5, item: 'Enable WQI/WQUAI market', done: false },
    { step: 6, item: 'Deposit test WQI/WQUAI into TradingVault', done: false },
    { step: 7, item: 'Sign maker and taker orders', done: false },
    { step: 8, item: 'Let matcher cross', done: false },
    { step: 9, item: 'Relayer submits one settlement transaction', done: false },
    { step: 10, item: 'Wait for receipt/finality', done: false },
    { step: 11, item: 'Index TradeSettled event', done: false },
    { step: 12, item: 'API/SDK/CLI/UI show proof with real tx/block/event evidence', done: false },
    { step: 13, item: 'Owner withdraws test funds', done: false },
    { step: 14, item: 'Archive manifest, logs, and verification output with secrets redacted', done: false },
  ];
}

// ── Main acceptance function ─────────────────────────────────────────

/**
 * Run the full testnet acceptance checklist and return a structured report.
 *
 * @param {object} [options] — Acceptance options
 * @param {boolean} [options.includeReadinessScore] — Include readiness score from validator (default: true)
 * @returns {object} — Acceptance report
 */
export async function runTestnetAcceptance(options = {}) {
  const { includeReadinessScore = true } = options;

  // Run all gates
  const gateResults = {};
  const allBlockers = [];
  let score = 0;

  for (const gate of GATES) {
    const result = await GATE_MAP[gate.id]();
    gateResults[gate.id] = {
      id: gate.id,
      description: gate.description,
      weight: gate.weight,
      pass: result.pass,
      blockers: result.blockers,
      details: result.details,
    };
    if (result.pass) {
      score += gate.weight;
    } else {
      allBlockers.push(...result.blockers.map((b) => `${gate.id}: ${b}`));
    }
  }

  // Readiness score from consolidated validator
  let readinessScore = null;
  let readinessReady = null;
  if (includeReadinessScore) {
    const readiness = checkTestnetReadiness();
    readinessScore = readiness.score;
    readinessReady = readiness.ready;
  }

  // Deployment checklist
  const deploymentChecklist = buildDeploymentChecklist();

  // Overall pass: all gates pass AND readiness validator passes
  const allGatesPass = Object.values(gateResults).every((g) => g.pass);
  const pass = allGatesPass && (readinessReady ?? true);

  return {
    pass,
    score,
    maxScore: WEIGHT_TOTAL,
    scorePercentage: Math.round((score / WEIGHT_TOTAL) * 100),
    readinessScore,
    readinessReady,
    gates: gateResults,
    blockers: allBlockers,
    deploymentChecklist,

    // Network summary
    networkName: TESTNET_CONFIG.networkName,
    zone: TESTNET_CONFIG.zone,
    chainId: TESTNET_CONFIG.chainId,
    rpcUrl: TESTNET_CONFIG.rpcUrl || null,
    explorerBaseUrl: TESTNET_CONFIG.explorerBaseUrl || null,
    deployer: TESTNET_CONFIG.deployer || null,
    mode: TESTNET_CONFIG.mode,

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
 * Run acceptance and throw if not ready.
 *
 * @throws {Error} — with consolidated blocker list if not ready
 * @returns {object} — Acceptance report (same as runTestnetAcceptance)
 */
export async function assertTestnetAcceptance() {
  const report = await runTestnetAcceptance();

  if (!report.pass) {
    throw new Error(
      `Testnet acceptance FAILED (score: ${report.score}/${report.maxScore}, readiness: ${report.readinessScore}/100) with ${report.blockers.length} blocker(s):\n` +
      report.blockers.map((b) => `  - ${b}`).join('\n')
    );
  }

  return report;
}

export { GATES, WEIGHT_TOTAL, buildDeploymentChecklist };
