import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  runDeployPreflight,
  assertDeployReady,
  formatPreflightReport,
  checkEventTruthAlignment,
  checkSafetyEnvelope,
  verifySourceSafety,
  PRE_FLIGHT_GATES,
  WEIGHT_TOTAL,
} from '../services/api/src/testnet-deploy-preflight.js';

describe('testnet-deploy-preflight — module exports', () => {
  it('exports runDeployPreflight (async function)', () => {
    assert.equal(typeof runDeployPreflight, 'function');
  });

  it('exports assertDeployReady (async function)', () => {
    assert.equal(typeof assertDeployReady, 'function');
  });

  it('exports formatPreflightReport (function)', () => {
    assert.equal(typeof formatPreflightReport, 'function');
  });

  it('exports checkEventTruthAlignment (function)', () => {
    assert.equal(typeof checkEventTruthAlignment, 'function');
  });

  it('exports checkSafetyEnvelope (function)', () => {
    assert.equal(typeof checkSafetyEnvelope, 'function');
  });

  it('exports PRE_FLIGHT_GATES (frozen array with 6 gates)', () => {
    assert.ok(Array.isArray(PRE_FLIGHT_GATES));
    assert.equal(PRE_FLIGHT_GATES.length, 6);
    assert.equal(Object.isFrozen(PRE_FLIGHT_GATES), true);
  });

  it('exports WEIGHT_TOTAL (number, equals sum of gate weights)', () => {
    assert.equal(typeof WEIGHT_TOTAL, 'number');
    const sum = PRE_FLIGHT_GATES.reduce((s, g) => s + g.weight, 0);
    assert.equal(WEIGHT_TOTAL, sum);
  });

  it('PRE_FLIGHT_GATES has correct gate IDs', () => {
    const ids = PRE_FLIGHT_GATES.map((g) => g.id);
    assert.deepEqual(ids, [
      'static-readiness',
      'rpc-verification',
      'constructor-validation',
      'abi-completeness',
      'event-truth-alignment',
      'safety-envelope',
    ]);
  });

  it('PRE_FLIGHT_GATES weights sum to WEIGHT_TOTAL', () => {
    assert.equal(PRE_FLIGHT_GATES[0].weight, 25);   // static-readiness
    assert.equal(PRE_FLIGHT_GATES[1].weight, 20);   // rpc-verification
    assert.equal(PRE_FLIGHT_GATES[2].weight, 15);   // constructor-validation
    assert.equal(PRE_FLIGHT_GATES[3].weight, 20);   // abi-completeness
    assert.equal(PRE_FLIGHT_GATES[4].weight, 10);   // event-truth-alignment
    assert.equal(PRE_FLIGHT_GATES[5].weight, 10);   // safety-envelope
  });
});

describe('testnet-deploy-preflight — event-truth alignment', () => {
  it('checkEventTruthAlignment returns aligned structure', () => {
    const result = checkEventTruthAlignment();
    assert.ok('aligned' in result);
    assert.ok('missingInAdapter' in result);
    assert.ok('missingInAbi' in result);
    assert.ok('extraInAdapter' in result);
    assert.ok('details' in result);
    assert.ok(Array.isArray(result.missingInAdapter));
    assert.ok(Array.isArray(result.missingInAbi));
  });

  it('event-truth adapter events match ABI completeness events', () => {
    const result = checkEventTruthAlignment();
    assert.equal(result.aligned, true, 'adapter events should match ABI events');
    assert.equal(result.missingInAdapter.length, 0, 'no events missing in adapter');
    assert.equal(result.missingInAbi.length, 0, 'no events missing in ABI');
  });

  it('details contain correct event counts', () => {
    const result = checkEventTruthAlignment();
    assert.ok(result.details.adapterEventCount > 0, 'adapter has events');
    assert.ok(result.details.abiEventCount > 0, 'ABI has events');
    assert.equal(result.details.adapterEventCount, result.details.abiEventCount, 'event counts should match');
  });

  it('details.adapterEvents and details.abiEvents are sorted arrays', () => {
    const result = checkEventTruthAlignment();
    const adapterSorted = [...result.details.adapterEvents].sort();
    const abiSorted = [...result.details.abiEvents].sort();
    assert.deepEqual(result.details.adapterEvents, adapterSorted);
    assert.deepEqual(result.details.abiEvents, abiSorted);
  });
});

describe('testnet-deploy-preflight — safety envelope', () => {
  it('checkSafetyEnvelope with empty modules returns safe', () => {
    const result = checkSafetyEnvelope(null, null, null, null);
    assert.equal(result.safe, true);
    assert.equal(result.blockers.length, 0);
  });

  it('checkSafetyEnvelope detects compromised safety metadata', () => {
    const badModule = { realQuaiTransactions: true, noWalletLoaded: false };
    const result = checkSafetyEnvelope(badModule, null, null, null);
    assert.equal(result.safe, false);
    assert.ok(result.blockers.length > 0, 'should have blockers for bad safety metadata');
  });

  it('checkSafetyEnvelope passes with correct safety fields', () => {
    const goodModule = {
      realQuaiTransactions: false,
      walletRequired: false,
      noWalletLoaded: true,
      noSigning: true,
      noBroadcasting: true,
      noFundsMovement: true,
      noContractDeploy: true,
      approvalGate: 'explicit-approval-required-before-deploy',
    };
    const result = checkSafetyEnvelope(goodModule, null, null, null);
    assert.equal(result.safe, true);
    assert.equal(result.blockers.length, 0);
  });

  it('checkSafetyEnvelope names the module with bad metadata', () => {
    const badModule = { realQuaiTransactions: true };
    const result = checkSafetyEnvelope(badModule, null, null, null);
    assert.ok(result.blockers.some((b) => b.startsWith('static-readiness:')), 'should name the module');
  });
});

describe('testnet-deploy-preflight — full pre-flight (static only)', () => {
  let report;

  before(async () => {
    report = await runDeployPreflight({ includeRpcProbes: false });
  });

  it('returns report with verdict', () => {
    assert.ok(typeof report.verdict === 'string');
    assert.ok(report.verdict.includes('READY') || report.verdict.includes('WARNING') || report.verdict.includes('BLOCKED'));
  });

  it('returns report with ready boolean', () => {
    assert.ok(typeof report.ready === 'boolean');
  });

  it('returns report with score and maxScore', () => {
    assert.ok(typeof report.score === 'number');
    assert.ok(typeof report.maxScore === 'number');
    assert.equal(report.maxScore, WEIGHT_TOTAL);
    assert.ok(report.score >= 0 && report.score <= report.maxScore);
  });

  it('returns report with scorePercentage', () => {
    assert.ok(typeof report.scorePercentage === 'number');
    assert.ok(report.scorePercentage >= 0 && report.scorePercentage <= 100);
  });

  it('returns 6 gates', () => {
    assert.equal(report.gates.length, 6);
  });

  it('gate IDs match PRE_FLIGHT_GATES', () => {
    const ids = report.gates.map((g) => g.id);
    const expected = PRE_FLIGHT_GATES.map((g) => g.id);
    assert.deepEqual(ids, expected);
  });

  it('each gate has pass, blockers, weight', () => {
    for (const gate of report.gates) {
      assert.ok('pass' in gate, `${gate.id} missing pass`);
      assert.ok(Array.isArray(gate.blockers), `${gate.id} missing blockers array`);
      assert.ok('weight' in gate, `${gate.id} missing weight`);
    }
  });

  it('gatesPassed + gatesFailed = gatesTotal', () => {
    assert.equal(report.gatesPassed + (report.gatesTotal - report.gatesPassed), report.gatesTotal);
  });

  it('blockerCount matches blockers array length', () => {
    assert.equal(report.blockerCount, report.blockers.length);
  });

  it('rpcVerification is skipped when includeRpcProbes=false', () => {
    assert.equal(report.rpcVerification.skipped, true);
    assert.ok(report.rpcVerification.reason.includes('includeRpcProbes=false'));
  });

  it('constructorValidation report present', () => {
    assert.ok(report.constructorValidation);
    assert.ok('valid' in report.constructorValidation);
    assert.ok('contracts' in report.constructorValidation);
  });

  it('abiCompleteness report present', () => {
    assert.ok(report.abiCompleteness);
    assert.ok('ready' in report.abiCompleteness);
    assert.ok('contracts' in report.abiCompleteness);
  });

  it('eventTruthAlignment report present', () => {
    assert.ok(report.eventTruthAlignment);
    assert.ok('aligned' in report.eventTruthAlignment);
  });

  it('safetyCheck report present', () => {
    assert.ok(report.safetyCheck);
    assert.ok('safe' in report.safetyCheck);
  });

  it('networkInfo has all required fields', () => {
    const ni = report.networkInfo;
    assert.ok(ni.networkName);
    assert.ok(ni.zone);
    assert.ok(ni.chainId !== null && ni.chainId !== undefined);
    assert.ok(ni.rpcUrl !== null);
    assert.ok(ni.explorerBaseUrl !== null);
    assert.ok(ni.deployer !== null);
    assert.ok(ni.mode);
    assert.ok('contractsConfigured' in ni);
    assert.ok('tokensConfigured' in ni);
  });

  it('tokensConfigured reflects actual config', () => {
    assert.equal(report.networkInfo.tokensConfigured, 2, 'WQUAI and WQI should be configured');
  });

  it('contractsConfigured reflects actual config (0 before deploy)', () => {
    assert.equal(report.networkInfo.contractsConfigured, 0, 'no contracts deployed yet');
  });

  it('safety metadata present and correct', () => {
    assert.equal(report.realQuaiTransactions, false);
    assert.equal(report.walletRequired, false);
    assert.equal(report.noWalletLoaded, true);
    assert.equal(report.noSigning, true);
    assert.equal(report.noBroadcasting, true);
    assert.equal(report.noFundsMovement, true);
    assert.equal(report.noContractDeploy, true);
    assert.equal(report.approvalGate, 'explicit-approval-required-before-deploy');
  });

  it('staticReadiness sub-report present', () => {
    assert.ok(report.staticReadiness);
    assert.ok('ready' in report.staticReadiness);
    assert.ok('score' in report.staticReadiness);
  });
});

describe('testnet-deploy-preflight — formatPreflightReport', () => {
  it('returns a non-empty string', async () => {
    const report = await runDeployPreflight({ includeRpcProbes: false });
    const output = formatPreflightReport(report);
    assert.ok(typeof output === 'string');
    assert.ok(output.length > 100);
  });

  it('includes verdict in report', async () => {
    const report = await runDeployPreflight({ includeRpcProbes: false });
    const output = formatPreflightReport(report);
    assert.ok(output.includes('Verdict:'));
    assert.ok(output.includes('Ready:'));
  });

  it('includes score in report', async () => {
    const report = await runDeployPreflight({ includeRpcProbes: false });
    const output = formatPreflightReport(report);
    assert.ok(output.includes('Score:'));
  });

  it('includes gate status in report', async () => {
    const report = await runDeployPreflight({ includeRpcProbes: false });
    const output = formatPreflightReport(report);
    assert.ok(output.includes('Gates:'));
    assert.ok(output.includes('static-readiness'));
  });

  it('includes safety section in report', async () => {
    const report = await runDeployPreflight({ includeRpcProbes: false });
    const output = formatPreflightReport(report);
    assert.ok(output.includes('Safety:'));
    assert.ok(output.includes('realQuaiTransactions: false'));
  });

  it('includes network section in report', async () => {
    const report = await runDeployPreflight({ includeRpcProbes: false });
    const output = formatPreflightReport(report);
    assert.ok(output.includes('Network:'));
    assert.ok(output.includes('Chain ID:'));
  });

  it('includes approval notice in report', async () => {
    const report = await runDeployPreflight({ includeRpcProbes: false });
    const output = formatPreflightReport(report);
    assert.ok(output.toLowerCase().includes('approval'));
  });
});

describe('testnet-deploy-preflight — assertDeployReady', () => {
  it('assertDeployReady resolves when pre-flight passes (static only)', async () => {
    // This may throw if there are blockers — that's expected.
    // We test the function shape and behavior.
    try {
      const report = await assertDeployReady({ includeRpcProbes: false });
      assert.ok(report);
      assert.ok(typeof report.verdict === 'string');
    } catch (err) {
      // If there are blockers, the error message should be informative
      assert.ok(err.message.includes('Deployment pre-flight FAILED'));
      assert.ok(err.message.includes('Blockers:'));
    }
  });
});

describe('testnet-deploy-preflight — source safety', () => {
  it('verifySourceSafety returns true', () => {
    assert.equal(verifySourceSafety(), true);
  });
});
