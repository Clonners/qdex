/**
 * Tests for testnet-rpc-verification.js
 *
 * Covers:
 * - Module exports (constants, functions)
 * - Verification checks array
 * - Source safety verification
 * - Full verification report shape and safety metadata
 * - Live RPC verification (read-only probes)
 * - Format verification report
 * - Per-check results
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  verifyTestnetRpc,
  assertTestnetReady,
  formatVerificationReport,
  verifySourceSafety,
  VERIFICATION_CHECKS,
  __testExports,
} from './testnet-rpc-verification.js';

// ── Module exports ──────────────────────────────────────────────────────

describe('testnet-rpc-verification module exports', () => {
  it('exports VERIFICATION_CHECKS with 7 checks', () => {
    assert.ok(Array.isArray(VERIFICATION_CHECKS));
    assert.equal(VERIFICATION_CHECKS.length, 7);
    assert.ok(VERIFICATION_CHECKS.includes('rpc-connectivity'));
    assert.ok(VERIFICATION_CHECKS.includes('gas-price'));
    assert.ok(VERIFICATION_CHECKS.includes('deployment-cost'));
    assert.ok(VERIFICATION_CHECKS.includes('deployer-balance'));
    assert.ok(VERIFICATION_CHECKS.includes('token-addresses'));
    assert.ok(VERIFICATION_CHECKS.includes('deploy-readiness'));
    assert.ok(VERIFICATION_CHECKS.includes('contract-artifacts'));
  });

  it('exports verifyTestnetRpc function', () => {
    assert.ok(typeof verifyTestnetRpc === 'function');
  });

  it('exports assertTestnetReady function', () => {
    assert.ok(typeof assertTestnetReady === 'function');
  });

  it('exports formatVerificationReport function', () => {
    assert.ok(typeof formatVerificationReport === 'function');
  });

  it('exports verifySourceSafety function', () => {
    assert.ok(typeof verifySourceSafety === 'function');
  });

  it('exports __testExports namespace', () => {
    assert.ok(__testExports);
    assert.ok(typeof __testExports.verifyRpcConnectivity === 'function');
    assert.ok(typeof __testExports.verifyGasPrice === 'function');
    assert.ok(typeof __testExports.verifyDeploymentCost === 'function');
    assert.ok(typeof __testExports.verifyDeployerBalance === 'function');
    assert.ok(typeof __testExports.verifyTokens === 'function');
    assert.ok(typeof __testExports.verifyDeployReadiness === 'function');
    assert.ok(typeof __testExports.checkContractArtifacts === 'function');
  });
});

// ── Source safety ───────────────────────────────────────────────────────

describe('testnet-rpc-verification: source safety scan', () => {
  it('verifySourceSafety returns true', () => {
    assert.equal(verifySourceSafety(), true);
  });

  it('source contains no wallet/signing/broadcast patterns', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const source = readFileSync(join(__dirname, 'testnet-rpc-verification.js'), 'utf-8');

    const prohibitedPatterns = [
      /eth_sign\b/i,
      /eth_sendTransaction\b/i,
      /personal_sign\b/i,
      /wallet\.load\b/i,
      /privateKey\s*=/i,
      /eth_accounts\b/i,
    ];

    for (const pattern of prohibitedPatterns) {
      assert.equal(
        pattern.test(source),
        false,
        `source contains prohibited pattern: ${pattern}`
      );
    }
  });

  it('source references only read-only modules', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const source = readFileSync(join(__dirname, 'testnet-rpc-verification.js'), 'utf-8');

    assert.ok(source.includes('testnet-connection-probe'));
    assert.ok(source.includes('testnet-gas-estimation'));
    assert.ok(source.includes('testnet-deployer-balance'));
    assert.ok(source.includes('testnet-token-validation'));
    assert.ok(source.includes('deploy-readiness-check'));
    assert.ok(source.includes('contract-artifact-verification'));
    assert.equal(
      /eth_sendTransaction|eth_sign|eth_signTransaction/.test(source),
      false
    );
  });
});

// ── Full verification report ────────────────────────────────────────────

describe('full verification report', () => {
  it('returns an object with expected shape', async () => {
    const report = await verifyTestnetRpc();
    assert.ok(typeof report === 'object');
    assert.ok('ready' in report);
    assert.ok('verdict' in report);
    assert.ok('checks' in report);
    assert.ok('blockers' in report);
    assert.ok('blockerCount' in report);
    assert.ok('checksPassed' in report);
    assert.ok('checksTotal' in report);
    assert.ok('networkInfo' in report);
    assert.ok('realQuaiTransactions' in report);
    assert.ok('walletRequired' in report);
    assert.ok('noWalletLoaded' in report);
    assert.ok('noSigning' in report);
    assert.ok('noBroadcasting' in report);
    assert.ok('noFundsMovement' in report);
    assert.ok('noContractDeploy' in report);
    assert.ok('approvalGate' in report);
  });

  it('has 7 verification checks', async () => {
    const report = await verifyTestnetRpc();
    assert.equal(report.checks.length, 7);
    assert.equal(report.checksTotal, 7);
  });

  it('has correct check names', async () => {
    const report = await verifyTestnetRpc();
    const checkNames = report.checks.map((c) => c.check);
    assert.ok(checkNames.includes('rpc-connectivity'));
    assert.ok(checkNames.includes('gas-price'));
    assert.ok(checkNames.includes('deployment-cost'));
    assert.ok(checkNames.includes('deployer-balance'));
    assert.ok(checkNames.includes('token-addresses'));
    assert.ok(checkNames.includes('deploy-readiness'));
    assert.ok(checkNames.includes('contract-artifacts'));
  });

  it('each check has pass, check, description, details, blockers', async () => {
    const report = await verifyTestnetRpc();
    for (const check of report.checks) {
      assert.ok('pass' in check, `${check.check} missing pass`);
      assert.ok('check' in check, `${check.check} missing check name`);
      assert.ok('description' in check, `${check.check} missing description`);
      assert.ok('details' in check, `${check.check} missing details`);
      assert.ok('blockers' in check, `${check.check} missing blockers`);
      assert.equal(typeof check.pass, 'boolean');
      assert.equal(typeof check.check, 'string');
      assert.equal(typeof check.description, 'string');
      assert.ok(Array.isArray(check.blockers));
    }
  });

  it('blockerCount matches blockers array length', async () => {
    const report = await verifyTestnetRpc();
    assert.equal(report.blockerCount, report.blockers.length);
  });

  it('checksPassed matches number of passing checks', async () => {
    const report = await verifyTestnetRpc();
    const actualPassed = report.checks.filter((c) => c.pass).length;
    assert.equal(report.checksPassed, actualPassed);
  });

  it('ready reflects all checks passing', async () => {
    const report = await verifyTestnetRpc();
    const allPass = report.checks.every((c) => c.pass);
    assert.equal(report.ready, allPass);
  });

  it('verdict contains emoji and status', async () => {
    const report = await verifyTestnetRpc();
    assert.ok(typeof report.verdict === 'string');
    assert.ok(
      report.verdict.includes('🟢') ||
      report.verdict.includes('🟡') ||
      report.verdict.includes('🔴')
    );
    assert.ok(
      report.verdict.includes('READY') ||
      report.verdict.includes('WARNING') ||
      report.verdict.includes('BLOCKED')
    );
  });

  it('networkInfo contains all expected fields', async () => {
    const report = await verifyTestnetRpc();
    const info = report.networkInfo;
    assert.ok('networkName' in info);
    assert.ok('zone' in info);
    assert.ok('chainId' in info);
    assert.ok('rpcUrl' in info);
    assert.ok('explorerBaseUrl' in info);
    assert.ok('deployer' in info);
    assert.ok('mode' in info);
  });

  it('networkInfo matches testnet config', async () => {
    const report = await verifyTestnetRpc();
    const info = report.networkInfo;
    assert.equal(info.networkName, 'quai-orchard');
    assert.equal(info.zone, 'cyprus1');
    assert.equal(info.chainId, 15000);
    assert.ok(info.rpcUrl && info.rpcUrl.includes('orchard'));
    assert.ok(info.explorerBaseUrl && info.explorerBaseUrl.includes('quaiscan'));
    assert.ok(info.deployer && info.deployer.startsWith('0x'));
  });

  it('safety metadata is always present and correct', async () => {
    const report = await verifyTestnetRpc();
    assert.equal(report.realQuaiTransactions, false);
    assert.equal(report.walletRequired, false);
    assert.equal(report.noWalletLoaded, true);
    assert.equal(report.noSigning, true);
    assert.equal(report.noBroadcasting, true);
    assert.equal(report.noFundsMovement, true);
    assert.equal(report.noContractDeploy, true);
    assert.ok(report.approvalGate && report.approvalGate.includes('approval'));
    assert.equal(report.readOnlyRpcOnly, true);
  });
});

// ── RPC connectivity check ─────────────────────────────────────────────

describe('RPC connectivity check (live)', () => {
  it('rpc-connectivity check runs and returns result', async () => {
    const { verifyRpcConnectivity } = __testExports;
    const result = await verifyRpcConnectivity();
    assert.ok('pass' in result);
    assert.equal(result.check, 'rpc-connectivity');
    assert.ok('details' in result);
    assert.ok('blockers' in result);
    assert.ok('description' in result);
  });

  it('rpc-connectivity details contain chainId info', async () => {
    const { verifyRpcConnectivity } = __testExports;
    const result = await verifyRpcConnectivity();
    assert.ok(
      result.details.chainIdHex !== undefined ||
      result.details.chainIdDecimal !== undefined ||
      result.details.chainIdSuccess !== undefined
    );
  });

  it('rpc-connectivity details contain blockNumber info', async () => {
    const { verifyRpcConnectivity } = __testExports;
    const result = await verifyRpcConnectivity();
    assert.ok(
      result.details.blockNumber !== undefined ||
      result.details.blockNumberSuccess !== undefined
    );
  });
});

// ── Gas price check ────────────────────────────────────────────────────

describe('gas-price check (live)', () => {
  it('gas-price check runs and returns result', async () => {
    const { verifyGasPrice } = __testExports;
    const result = await verifyGasPrice();
    assert.ok('pass' in result);
    assert.equal(result.check, 'gas-price');
    assert.ok('details' in result);
    assert.ok('blockers' in result);
  });

  it('gas-price details contain gas price info', async () => {
    const { verifyGasPrice } = __testExports;
    const result = await verifyGasPrice();
    assert.ok(
      result.details.gasPriceSource !== undefined ||
      result.details.gasPriceGwei !== undefined
    );
  });
});

// ── Deployment cost check ──────────────────────────────────────────────

describe('deployment-cost check (live)', () => {
  it('deployment-cost check runs and returns result', async () => {
    const { verifyDeploymentCost } = __testExports;
    const result = await verifyDeploymentCost();
    assert.ok('pass' in result);
    assert.equal(result.check, 'deployment-cost');
    assert.ok('details' in result);
    assert.ok('blockers' in result);
  });

  it('deployment-cost details contain contract count', async () => {
    const { verifyDeploymentCost } = __testExports;
    const result = await verifyDeploymentCost();
    assert.ok(result.details.contracts !== undefined);
  });
});

// ── Deployer balance check ─────────────────────────────────────────────

describe('deployer-balance check (live)', () => {
  it('deployer-balance check runs and returns result', async () => {
    const { verifyDeployerBalance } = __testExports;
    const result = await verifyDeployerBalance();
    assert.ok('pass' in result);
    assert.equal(result.check, 'deployer-balance');
    assert.ok('details' in result);
    assert.ok('blockers' in result);
  });

  it('deployer-balance details contain deployer address', async () => {
    const { verifyDeployerBalance } = __testExports;
    const result = await verifyDeployerBalance();
    assert.ok(result.details.deployer !== undefined);
  });
});

// ── Token addresses check ──────────────────────────────────────────────

describe('token-addresses check (live)', () => {
  it('token-addresses check runs and returns result', async () => {
    const { verifyTokens } = __testExports;
    const result = await verifyTokens();
    assert.ok('pass' in result);
    assert.equal(result.check, 'token-addresses');
    assert.ok('details' in result);
    assert.ok('blockers' in result);
  });

  it('token-addresses details contain configured/null counts', async () => {
    const { verifyTokens } = __testExports;
    const result = await verifyTokens();
    assert.ok(result.details.configuredCount !== undefined);
    assert.ok(result.details.nullCount !== undefined);
  });
});

// ── Deploy readiness check ─────────────────────────────────────────────

describe('deploy-readiness check', () => {
  it('deploy-readiness check runs and returns result', async () => {
    const { verifyDeployReadiness } = __testExports;
    const result = await verifyDeployReadiness();
    assert.ok('pass' in result);
    assert.equal(result.check, 'deploy-readiness');
    assert.ok('details' in result);
    assert.ok('blockers' in result);
  });

  it('deploy-readiness details contain config/manifest/safety flags', async () => {
    const { verifyDeployReadiness } = __testExports;
    const result = await verifyDeployReadiness();
    assert.ok('configReady' in result.details);
    assert.ok('manifestReady' in result.details);
    assert.ok('safetySafe' in result.details);
  });
});

// ── Contract artifacts check ───────────────────────────────────────────

describe('contract-artifacts check', () => {
  it('contract-artifacts check runs and returns result', async () => {
    const { checkContractArtifacts } = __testExports;
    const result = await checkContractArtifacts();
    assert.ok('pass' in result);
    assert.equal(result.check, 'contract-artifacts');
    assert.ok('details' in result);
    assert.ok('blockers' in result);
  });

  it('contract-artifacts details contain contract count', async () => {
    const { checkContractArtifacts } = __testExports;
    const result = await checkContractArtifacts();
    assert.ok(
      result.details.totalContracts !== undefined ||
      result.details.validContracts !== undefined
    );
  });
});

// ── Format verification report ─────────────────────────────────────────

describe('formatVerificationReport', () => {
  it('formats a passing report', () => {
    const mockReport = {
      ready: true,
      verdict: '🟢 READY',
      checks: [
        { pass: true, check: 'rpc-connectivity', description: 'test', details: {}, blockers: [] },
      ],
      blockers: [],
      blockerCount: 0,
      checksPassed: 1,
      checksTotal: 1,
      networkInfo: {
        networkName: 'test',
        zone: 'zone-0',
        chainId: 1337,
        rpcUrl: 'http://test',
        explorerBaseUrl: 'http://test',
        deployer: '0x0000000000000000000000000000000000000000',
        mode: 'testnet-ready',
      },
      realQuaiTransactions: false,
      walletRequired: false,
      noWalletLoaded: true,
      noSigning: true,
      noBroadcasting: true,
      noFundsMovement: true,
      noContractDeploy: true,
      approvalGate: 'explicit-approval-required-before-deploy',
    };

    const formatted = formatVerificationReport(mockReport);
    assert.ok(typeof formatted === 'string');
    assert.ok(formatted.includes('Testnet RPC Verification Report'));
    assert.ok(formatted.includes('Verdict: 🟢 READY'));
    assert.ok(formatted.includes('Ready: YES'));
    assert.ok(formatted.includes('Checks: 1/1 passed'));
    assert.ok(formatted.includes('realQuaiTransactions: false'));
    assert.ok(formatted.includes('noContractDeploy: true'));
    assert.ok(formatted.includes('approvalGate'));
  });

  it('formats a blocked report', () => {
    const mockReport = {
      ready: false,
      verdict: '🔴 BLOCKED',
      checks: [
        { pass: false, check: 'rpc-connectivity', description: 'test', details: {}, blockers: ['connection failed'] },
      ],
      blockers: ['rpc-connectivity: connection failed'],
      blockerCount: 1,
      checksPassed: 0,
      checksTotal: 1,
      networkInfo: {
        networkName: 'test',
        zone: 'zone-0',
        chainId: 1337,
        rpcUrl: 'http://test',
        explorerBaseUrl: 'http://test',
        deployer: '0x0000000000000000000000000000000000000000',
        mode: 'testnet-ready',
      },
      realQuaiTransactions: false,
      walletRequired: false,
      noWalletLoaded: true,
      noSigning: true,
      noBroadcasting: true,
      noFundsMovement: true,
      noContractDeploy: true,
      approvalGate: 'explicit-approval-required-before-deploy',
    };

    const formatted = formatVerificationReport(mockReport);
    assert.ok(formatted.includes('🔴 BLOCKED'));
    assert.ok(formatted.includes('Ready: NO'));
    assert.ok(formatted.includes('Blockers: 1'));
    assert.ok(formatted.includes('⚠️'));
  });

  it('formats a warning report', () => {
    const mockReport = {
      ready: false,
      verdict: '🟡 WARNING',
      checks: [
        { pass: false, check: 'deployer-balance', description: 'test', details: {}, blockers: ['insufficient'] },
      ],
      blockers: ['deployer-balance: insufficient'],
      blockerCount: 1,
      checksPassed: 0,
      checksTotal: 1,
      networkInfo: {
        networkName: 'test',
        zone: 'zone-0',
        chainId: 1337,
        rpcUrl: 'http://test',
        explorerBaseUrl: 'http://test',
        deployer: '0x0000000000000000000000000000000000000000',
        mode: 'testnet-ready',
      },
      realQuaiTransactions: false,
      walletRequired: false,
      noWalletLoaded: true,
      noSigning: true,
      noBroadcasting: true,
      noFundsMovement: true,
      noContractDeploy: true,
      approvalGate: 'explicit-approval-required-before-deploy',
    };

    const formatted = formatVerificationReport(mockReport);
    assert.ok(formatted.includes('🟡 WARNING'));
  });
});

// ── assertTestnetReady ─────────────────────────────────────────────────

describe('assertTestnetReady', () => {
  it('returns report when testnet is ready or throws descriptive error', async () => {
    try {
      const report = await assertTestnetReady();
      assert.ok(report);
      assert.ok('ready' in report);
    } catch (err) {
      // If not ready, the error message should contain blocker info
      assert.ok(err.message.includes('blocker'));
    }
  });
});
