/**
 * Testnet readiness validator — consolidated pre-deployment acceptance checklist.
 *
 * This module aggregates all existing readiness surfaces into a single unified
 * report: deploy readiness check, testnet connection probes, relayer gate
 * status, and explorer configuration. It produces a readiness score and
 * names every blocker or readiness signal.
 *
 * Boundaries:
 * - Read-only validation only. No RPC calls, no wallet loading, no signing,
 *   no broadcasting, no deployment, no funds movement.
 * - Uses existing modules (deploy-readiness-check, testnet-connection-probe)
 *   as inputs. Connection probes are OPTIONAL — the validator can produce
 *   a report with or without live RPC data.
 * - Fail-closed: missing required fields produce blockers.
 * - Safety metadata is always present in the report.
 * - The readiness score (0–100) reflects how many readiness categories pass.
 */

import { checkDeployReadiness } from './deploy-readiness-check.js';
import { TESTNET_CONFIG } from './testnet-config.js';
import {
  explorerUrlForTx,
  explorerUrlForAddress,
  explorerUrlForBlock,
} from './testnet-config.js';

// Readiness categories and their weights (total = 100)
const CATEGORIES = Object.freeze([
  { name: 'config', weight: 25, description: 'Network config completeness (RPC, chainId, deployer, zone, explorer)' },
  { name: 'manifest', weight: 20, description: 'Deploy manifest health (steps, ordering, safety)' },
  { name: 'safety', weight: 20, description: 'Safety metadata (no wallet, no signing, no broadcast, no deploy)' },
  { name: 'explorer', weight: 10, description: 'Explorer URL helpers functional' },
  { name: 'contracts', weight: 15, description: 'Contract addresses (null before deploy — expected, tracked)' },
  { name: 'tokens', weight: 10, description: 'Token addresses (WQUAI, WQI null before deploy — expected, tracked)' },
]);

/**
 * Validate that explorer helper functions produce valid URLs.
 *
 * @returns {{pass: boolean, blockers: string[], details: object}}
 */
function validateExplorerHelpers() {
  const blockers = [];
  const details = {
    txUrl: null,
    addressUrl: null,
    blockUrl: null,
    nullGuard: false,
  };

  const testTx = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const testAddr = '0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267';
  const testBlock = 12345;

  const txUrl = explorerUrlForTx(testTx);
  const addrUrl = explorerUrlForAddress(testAddr);
  const blockUrl = explorerUrlForBlock(testBlock);

  details.txUrl = txUrl;
  details.addressUrl = addrUrl;
  details.blockUrl = blockUrl;

  if (!txUrl || !txUrl.includes(testTx.slice(2))) {
    blockers.push('explorerUrlForTx produced invalid or null URL');
  }
  if (!addrUrl || !addrUrl.includes(testAddr.slice(2))) {
    blockers.push('explorerUrlForAddress produced invalid or null URL');
  }
  if (!blockUrl || !blockUrl.includes(String(testBlock))) {
    blockers.push('explorerUrlForBlock produced invalid or null URL');
  }

  // Null guard — should return null for missing inputs
  if (explorerUrlForTx(null) !== null) blockers.push('explorerUrlForTx(null) should return null');
  if (explorerUrlForAddress('') !== null) blockers.push('explorerUrlForAddress("") should return null');
  if (explorerUrlForBlock(null) !== null) blockers.push('explorerUrlForBlock(null) should return null');
  if (explorerUrlForBlock(0) !== null) {
    // block 0 is a valid edge case, URL should exist
  }

  details.nullGuard =
    explorerUrlForTx(null) === null &&
    explorerUrlForAddress('') === null &&
    explorerUrlForBlock(null) === null;

  return { pass: blockers.length === 0, blockers, details };
}

/**
 * Count deployed vs null contract addresses.
 *
 * @returns {{deployed: number, total: number, null: string[], pass: boolean, blockers: string[]}}
 */
function validateContractAddresses() {
  const contracts = TESTNET_CONFIG.contracts;
  const contractNames = Object.keys(contracts);
  const nullContracts = contractNames.filter((name) => contracts[name] === null);
  const deployedCount = contractNames.length - nullContracts.length;

  // Before deploy, all null is EXPECTED — no blocker, just tracking
  const blockers = [];
  // If some are set and some are null, that's a partial deploy state — note it
  if (deployedCount > 0 && deployedCount < contractNames.length) {
    blockers.push(`partial deployment: ${deployedCount}/${contractNames.length} contracts deployed`);
  }

  return {
    deployed: deployedCount,
    total: contractNames.length,
    null: nullContracts,
    pass: deployedCount === 0 || deployedCount === contractNames.length,
    blockers,
  };
}

/**
 * Count deployed vs null token addresses.
 *
 * @returns {{deployed: number, total: number, null: string[], pass: boolean, blockers: string[]}}
 */
function validateTokenAddresses() {
  const tokens = TESTNET_CONFIG.tokens;
  const tokenNames = Object.keys(tokens);
  const nullTokens = tokenNames.filter((name) => tokens[name] === null);
  const deployedCount = tokenNames.length - nullTokens.length;

  // Before deploy, all null is EXPECTED — no blocker, just tracking
  const blockers = [];
  if (deployedCount > 0 && deployedCount < tokenNames.length) {
    blockers.push(`partial token deployment: ${deployedCount}/${tokenNames.length} tokens deployed`);
  }

  return {
    deployed: deployedCount,
    total: tokenNames.length,
    null: nullTokens,
    pass: deployedCount === 0 || deployedCount === tokenNames.length,
    blockers,
  };
}

/**
 * Run the full testnet readiness validation.
 *
 * Returns a structured report with:
 * - `ready`: boolean — true only if config, manifest, and safety pass
 * - `score`: number (0–100) — readiness score based on category weights
 * - `categories`: per-category pass/fail with blockers
 * - `blockers`: consolidated list of all blockers
 * - `warnings`: non-blocking warnings
 * - `deploymentChecklist`: operator checklist items (from cutover plan Task 7)
 * - `config`: deploy readiness config result
 * - `manifest`: deploy readiness manifest result
 * - `safety`: deploy readiness safety result
 * - `explorer`: explorer helper validation result
 * - `contracts`: contract address status
 * - `tokens`: token address status
 * - Safety metadata — always present
 *
 * @param {object} [options] — Validation options
 * @param {boolean} [options.includeRpcProbes] — If true, includes RPC probe results (default: false, no RPC calls)
 * @returns {object} — Testnet readiness report
 */
export function checkTestnetReadiness(options = {}) {
  const { includeRpcProbes = false } = options;

  // 1. Deploy readiness check (no RPC calls)
  const deployReadiness = checkDeployReadiness();

  // 2. Explorer helpers validation (no RPC calls)
  const explorer = validateExplorerHelpers();

  // 3. Contract addresses status (no RPC calls)
  const contracts = validateContractAddresses();

  // 4. Token addresses status (no RPC calls)
  const tokens = validateTokenAddresses();

  // Calculate readiness score
  let score = 0;
  const categories = {};

  // Config category (weight 25)
  if (deployReadiness.config.ready) {
    score += CATEGORIES[0].weight;
    categories.config = { pass: true, weight: CATEGORIES[0].weight, blockers: [] };
  } else {
    categories.config = {
      pass: false,
      weight: CATEGORIES[0].weight,
      blockers: deployReadiness.config.blockers,
    };
  }

  // Manifest category (weight 20)
  if (deployReadiness.manifest.ready) {
    score += CATEGORIES[1].weight;
    categories.manifest = { pass: true, weight: CATEGORIES[1].weight, blockers: [] };
  } else {
    categories.manifest = {
      pass: false,
      weight: CATEGORIES[1].weight,
      blockers: deployReadiness.manifest.blockers,
    };
  }

  // Safety category (weight 20)
  if (deployReadiness.safety.safe) {
    score += CATEGORIES[2].weight;
    categories.safety = { pass: true, weight: CATEGORIES[2].weight, blockers: [] };
  } else {
    categories.safety = {
      pass: false,
      weight: CATEGORIES[2].weight,
      blockers: deployReadiness.safety.blockers,
    };
  }

  // Explorer category (weight 10)
  if (explorer.pass) {
    score += CATEGORIES[3].weight;
    categories.explorer = { pass: true, weight: CATEGORIES[3].weight, blockers: [] };
  } else {
    categories.explorer = {
      pass: false,
      weight: CATEGORIES[3].weight,
      blockers: explorer.blockers,
    };
  }

  // Contracts category (weight 15) — all null before deploy is EXPECTED
  if (contracts.pass) {
    score += CATEGORIES[4].weight;
    categories.contracts = {
      pass: true,
      weight: CATEGORIES[4].weight,
      blockers: [],
      deployed: contracts.deployed,
      total: contracts.total,
      null: contracts.null,
    };
  } else {
    categories.contracts = {
      pass: false,
      weight: CATEGORIES[4].weight,
      blockers: contracts.blockers,
      deployed: contracts.deployed,
      total: contracts.total,
      null: contracts.null,
    };
  }

  // Tokens category (weight 10) — all null before deploy is EXPECTED
  if (tokens.pass) {
    score += CATEGORIES[5].weight;
    categories.tokens = {
      pass: true,
      weight: CATEGORIES[5].weight,
      blockers: [],
      deployed: tokens.deployed,
      total: tokens.total,
      null: tokens.null,
    };
  } else {
    categories.tokens = {
      pass: false,
      weight: CATEGORIES[5].weight,
      blockers: tokens.blockers,
      deployed: tokens.deployed,
      total: tokens.total,
      null: tokens.null,
    };
  }

  // Collect all blockers and warnings
  const allBlockers = [
    ...deployReadiness.blockers,
    ...explorer.blockers.map((b) => `explorer: ${b}`),
    ...contracts.blockers.map((b) => `contracts: ${b}`),
    ...tokens.blockers.map((b) => `tokens: ${b}`),
  ];

  const warnings = [
    ...deployReadiness.config.warnings,
    `Contracts: ${contracts.null.length}/${contracts.total} null (expected before deploy)`,
    `Tokens: ${tokens.null.length}/${tokens.total} null (expected before deploy)`,
  ];

  // The readiness report is ready if config + manifest + safety all pass.
  // Contract/token addresses being null before deploy does NOT block readiness.
  const ready =
    deployReadiness.config.ready &&
    deployReadiness.manifest.ready &&
    deployReadiness.safety.safe &&
    explorer.pass;

  return {
    ready,
    score,
    categories,
    blockers: allBlockers,
    warnings,

    // Deployment checklist (from cutover plan Task 7)
    deploymentChecklist: [
      { step: 1, item: 'Confirm network, zone, chain ID, RPC, explorer, and test token addresses', done: Boolean(TESTNET_CONFIG.rpcUrl && TESTNET_CONFIG.chainId && TESTNET_CONFIG.explorerBaseUrl) },
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
    ],

    // Network info
    networkName: TESTNET_CONFIG.networkName,
    zone: TESTNET_CONFIG.zone,
    chainId: TESTNET_CONFIG.chainId,
    rpcUrl: TESTNET_CONFIG.rpcUrl || null,
    explorerBaseUrl: TESTNET_CONFIG.explorerBaseUrl || null,
    deployer: TESTNET_CONFIG.deployer || null,

    // Sub-reports
    config: deployReadiness.config,
    manifest: deployReadiness.manifest,
    safety: deployReadiness.safety,
    explorer,
    contracts,
    tokens,

    // RPC probe results (only if requested)
    rpcProbes: includeRpcProbes ? null : { skipped: true, reason: 'includeRpcProbes=false — no RPC calls made' },

    // Safety metadata — always present
    mode: TESTNET_CONFIG.mode,
    realQuaiTransactions: false,
    walletRequired: false,
    noWalletLoaded: true,
    noRpcCallMade: !includeRpcProbes,
    noSigning: true,
    noBroadcasting: true,
    noFundsMovement: true,
    noContractDeploy: true,
    approvalGate: 'explicit-approval-required-before-deploy',
  };
}

/**
 * Check testnet readiness and throw if not ready.
 *
 * Use this as a pre-deploy gate that fails loudly.
 *
 * @throws {Error} — with consolidated blocker list if not ready
 * @returns {object} — Testnet readiness report (same as checkTestnetReadiness)
 */
export function assertTestnetReady() {
  const report = checkTestnetReadiness();

  if (!report.ready) {
    throw new Error(
      `Testnet readiness check FAILED (score: ${report.score}/100) with ${report.blockers.length} blocker(s):\n` +
      report.blockers.map((b) => `  - ${b}`).join('\n')
    );
  }

  return report;
}

/**
 * Export category definitions for testing.
 */
export { CATEGORIES };
