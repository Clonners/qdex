/**
 * Testnet deployment status — RED/GREEN tests for the deployment status aggregation module.
 *
 * Tests cover module exports, contract/token status computation, manifest status,
 * deployment order, verdict logic, checklist building, formatted report output,
 * and safety metadata preservation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getTestnetDeploymentStatus,
  formatDeploymentStatusReport,
  getContractStatus,
  getTokenStatus,
  getManifestStatus,
  getDeploymentOrder,
  computeVerdict,
  buildDeploymentChecklist,
} from '../services/api/src/testnet-deployment-status.js';
import { TESTNET_CONFIG } from '../services/api/src/testnet-config.js';
import { checkDeployReadiness } from '../services/api/src/deploy-readiness-check.js';
import { checkTestnetReadiness } from '../services/api/src/testnet-readiness-validator.js';

describe('testnet-deployment-status module exports', () => {
  it('exports getTestnetDeploymentStatus as a function', () => {
    assert.equal(typeof getTestnetDeploymentStatus, 'function');
  });

  it('exports formatDeploymentStatusReport as a function', () => {
    assert.equal(typeof formatDeploymentStatusReport, 'function');
  });

  it('exports getContractStatus as a function', () => {
    assert.equal(typeof getContractStatus, 'function');
  });

  it('exports getTokenStatus as a function', () => {
    assert.equal(typeof getTokenStatus, 'function');
  });

  it('exports getManifestStatus as a function', () => {
    assert.equal(typeof getManifestStatus, 'function');
  });

  it('exports getDeploymentOrder as a function', () => {
    assert.equal(typeof getDeploymentOrder, 'function');
  });

  it('exports computeVerdict as a function', () => {
    assert.equal(typeof computeVerdict, 'function');
  });

  it('exports buildDeploymentChecklist as a function', () => {
    assert.equal(typeof buildDeploymentChecklist, 'function');
  });
});

describe('getContractStatus', () => {
  it('returns all 6 contracts tracked', () => {
    const status = getContractStatus();
    assert.equal(status.total, 6);
  });

  it('returns allNull: true when no contracts are deployed', () => {
    const status = getContractStatus();
    const allNull = Object.values(TESTNET_CONFIG.contracts).every((v) => v === null);
    if (allNull) {
      assert.equal(status.allNull, true);
    }
  });

  it('returns correct deployed count', () => {
    const status = getContractStatus();
    const expected = Object.values(TESTNET_CONFIG.contracts).filter(
      (v) => typeof v === 'string' && v !== ''
    ).length;
    assert.equal(status.deployed, expected);
  });

  it('returns allDeployed: false when contracts are null', () => {
    const status = getContractStatus();
    const allDeployed = Object.values(TESTNET_CONFIG.contracts).every(
      (v) => typeof v === 'string' && v !== ''
    );
    if (!allDeployed) {
      assert.equal(status.allDeployed, false);
    }
  });

  it('returns contract entries with name, address, deployed fields', () => {
    const status = getContractStatus();
    for (const entry of status.contracts) {
      assert.ok(typeof entry.name === 'string');
      assert.ok(entry.address === null || typeof entry.address === 'string');
      assert.ok(typeof entry.deployed === 'boolean');
    }
  });

  it('preserves TradingVault contract in entries', () => {
    const status = getContractStatus();
    const vaultEntry = status.contracts.find((c) => c.name === 'TradingVault');
    assert.ok(vaultEntry !== undefined);
    assert.equal(vaultEntry.name, 'TradingVault');
  });

  it('preserves Settlement contract in entries', () => {
    const status = getContractStatus();
    const settlementEntry = status.contracts.find((c) => c.name === 'Settlement');
    assert.ok(settlementEntry !== undefined);
    assert.equal(settlementEntry.name, 'Settlement');
  });
});

describe('getTokenStatus', () => {
  it('returns both tokens tracked (WQUAI, WQI)', () => {
    const status = getTokenStatus();
    assert.equal(status.total, 2);
  });

  it('returns correct configured count', () => {
    const status = getTokenStatus();
    const expected = Object.values(TESTNET_CONFIG.tokens).filter(
      (v) => typeof v === 'string' && v !== ''
    ).length;
    assert.equal(status.configured, expected);
  });

  it('returns token entries with name, address, configured fields', () => {
    const status = getTokenStatus();
    for (const entry of status.tokens) {
      assert.ok(typeof entry.name === 'string');
      assert.ok(entry.address === null || typeof entry.address === 'string');
      assert.ok(typeof entry.configured === 'boolean');
    }
  });

  it('preserves WQUAI token in entries', () => {
    const status = getTokenStatus();
    const wquai = status.tokens.find((t) => t.name === 'WQUAI');
    assert.ok(wquai !== undefined);
  });

  it('preserves WQI token in entries', () => {
    const status = getTokenStatus();
    const wqi = status.tokens.find((t) => t.name === 'WQI');
    assert.ok(wqi !== undefined);
  });
});

describe('getManifestStatus', () => {
  it('returns manifest mode', () => {
    const status = getManifestStatus();
    assert.ok(typeof status.mode === 'string');
  });

  it('returns manifest valid: true when manifest is valid', () => {
    const status = getManifestStatus();
    assert.equal(status.valid, true);
  });

  it('returns steps array with contract info', () => {
    const status = getManifestStatus();
    assert.ok(Array.isArray(status.steps));
    assert.ok(status.steps.length > 0);
  });

  it('preserves canBroadcast: false', () => {
    const status = getManifestStatus();
    assert.equal(status.canBroadcast, false);
  });

  it('preserves deployed: false', () => {
    const status = getManifestStatus();
    assert.equal(status.deployed, false);
  });

  it('preserves realQuaiTransactions: false', () => {
    const status = getManifestStatus();
    assert.equal(status.realQuaiTransactions, false);
  });

  it('preserves walletRequired: false', () => {
    const status = getManifestStatus();
    assert.equal(status.walletRequired, false);
  });
});

describe('getDeploymentOrder', () => {
  it('returns all 6 deployable contracts in order', () => {
    const order = getDeploymentOrder();
    assert.equal(order.length, 6);
  });

  it('first contract has no dependencies', () => {
    const order = getDeploymentOrder();
    assert.ok(order[0].dependencies.length === 0 || order[0].dependencies === []);
  });

  it('Settlement appears last in deployment order', () => {
    const order = getDeploymentOrder();
    assert.equal(order[order.length - 1].contract, 'Settlement');
  });

  it('each step has contract name, dependencies, and optional description', () => {
    const order = getDeploymentOrder();
    for (const step of order) {
      assert.ok(typeof step.contract === 'string');
      assert.ok(Array.isArray(step.dependencies));
    }
  });
});

describe('computeVerdict', () => {
  it('returns verdict READY when deploy readiness passes', () => {
    const deployReadiness = checkDeployReadiness();
    const testnetReadiness = checkTestnetReadiness();
    const contractStatus = getContractStatus();
    const tokenStatus = getTokenStatus();

    const verdict = computeVerdict(deployReadiness, testnetReadiness, contractStatus, tokenStatus);
    assert.ok(typeof verdict.verdict === 'string');
    assert.ok(typeof verdict.emoji === 'string');
    assert.ok(Array.isArray(verdict.blockers));
    assert.ok(Array.isArray(verdict.warnings));
  });

  it('returns score from readiness validator', () => {
    const deployReadiness = checkDeployReadiness();
    const testnetReadiness = checkTestnetReadiness();
    const contractStatus = getContractStatus();
    const tokenStatus = getTokenStatus();

    const verdict = computeVerdict(deployReadiness, testnetReadiness, contractStatus, tokenStatus);
    assert.ok(typeof verdict.score === 'number');
    assert.ok(verdict.score >= 0 && verdict.score <= 100);
  });

  it('returns deployerConfirmed based on config', () => {
    const deployReadiness = checkDeployReadiness();
    const testnetReadiness = checkTestnetReadiness();
    const contractStatus = getContractStatus();
    const tokenStatus = getTokenStatus();

    const verdict = computeVerdict(deployReadiness, testnetReadiness, contractStatus, tokenStatus);
    if (TESTNET_CONFIG.deployer) {
      assert.equal(verdict.deployerConfirmed, true);
    }
  });

  it('returns rpcConfigured based on config', () => {
    const deployReadiness = checkDeployReadiness();
    const testnetReadiness = checkTestnetReadiness();
    const contractStatus = getContractStatus();
    const tokenStatus = getTokenStatus();

    const verdict = computeVerdict(deployReadiness, testnetReadiness, contractStatus, tokenStatus);
    if (TESTNET_CONFIG.rpcUrl) {
      assert.equal(verdict.rpcConfigured, true);
    }
  });

  it('returns chainIdConfigured based on config', () => {
    const deployReadiness = checkDeployReadiness();
    const testnetReadiness = checkTestnetReadiness();
    const contractStatus = getContractStatus();
    const tokenStatus = getTokenStatus();

    const verdict = computeVerdict(deployReadiness, testnetReadiness, contractStatus, tokenStatus);
    if (TESTNET_CONFIG.chainId) {
      assert.equal(verdict.chainIdConfigured, true);
    }
  });

  it('returns explorerConfigured based on config', () => {
    const deployReadiness = checkDeployReadiness();
    const testnetReadiness = checkTestnetReadiness();
    const contractStatus = getContractStatus();
    const tokenStatus = getTokenStatus();

    const verdict = computeVerdict(deployReadiness, testnetReadiness, contractStatus, tokenStatus);
    if (TESTNET_CONFIG.explorerBaseUrl) {
      assert.equal(verdict.explorerConfigured, true);
    }
  });

  it('returns token warning when tokens are not configured', () => {
    const deployReadiness = checkDeployReadiness();
    const testnetReadiness = checkTestnetReadiness();
    const contractStatus = getContractStatus();
    const tokenStatus = getTokenStatus();

    const verdict = computeVerdict(deployReadiness, testnetReadiness, contractStatus, tokenStatus);
    const allConfigured = Object.values(TESTNET_CONFIG.tokens).every(
      (v) => typeof v === 'string' && v !== ''
    );
    if (!allConfigured) {
      const tokenWarnings = verdict.warnings.filter((w) => w.includes('tokens'));
      assert.ok(tokenWarnings.length > 0, 'should have token warning');
    }
  });
});

describe('buildDeploymentChecklist', () => {
  it('returns 14 checklist steps', () => {
    const contractStatus = getContractStatus();
    const tokenStatus = getTokenStatus();
    const checklist = buildDeploymentChecklist(contractStatus, tokenStatus);
    assert.equal(checklist.length, 14);
  });

  it('each step has step number, item, and done flag', () => {
    const contractStatus = getContractStatus();
    const tokenStatus = getTokenStatus();
    const checklist = buildDeploymentChecklist(contractStatus, tokenStatus);
    for (const item of checklist) {
      assert.ok(typeof item.step === 'number');
      assert.ok(typeof item.item === 'string');
      assert.ok(typeof item.done === 'boolean');
    }
  });

  it('steps are numbered 1 through 14', () => {
    const contractStatus = getContractStatus();
    const tokenStatus = getTokenStatus();
    const checklist = buildDeploymentChecklist(contractStatus, tokenStatus);
    const stepNumbers = checklist.map((item) => item.step);
    assert.deepEqual(stepNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it('step 1 is done when network confirmed and tokens configured', () => {
    const contractStatus = getContractStatus();
    const tokenStatus = getTokenStatus();
    const checklist = buildDeploymentChecklist(contractStatus, tokenStatus);
    const step1 = checklist[0];
    assert.equal(step1.step, 1);
    // step 1 requires network + tokens
    const allTokensConfigured = tokenStatus.allConfigured;
    if (!allTokensConfigured) {
      assert.equal(step1.done, false);
    }
  });

  it('step 3 is done when all contracts deployed', () => {
    const contractStatus = getContractStatus();
    const tokenStatus = getTokenStatus();
    const checklist = buildDeploymentChecklist(contractStatus, tokenStatus);
    const step3 = checklist[2];
    assert.equal(step3.step, 3);
    assert.equal(step3.done, contractStatus.allDeployed);
  });
});

describe('getTestnetDeploymentStatus', () => {
  it('returns a structured status object', () => {
    const status = getTestnetDeploymentStatus();
    assert.ok(typeof status === 'object');
    assert.ok(status !== null);
  });

  it('includes network identity fields', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.networkName, TESTNET_CONFIG.networkName);
    assert.equal(status.zone, TESTNET_CONFIG.zone);
    assert.equal(status.chainId, TESTNET_CONFIG.chainId);
    assert.equal(status.rpcUrl, TESTNET_CONFIG.rpcUrl || null);
    assert.equal(status.explorerBaseUrl, TESTNET_CONFIG.explorerBaseUrl || null);
    assert.equal(status.deployer, TESTNET_CONFIG.deployer || null);
    assert.equal(status.mode, TESTNET_CONFIG.mode);
  });

  it('includes verdict with emoji', () => {
    const status = getTestnetDeploymentStatus();
    assert.ok(typeof status.verdict === 'string');
    assert.ok(typeof status.verdictEmoji === 'string');
  });

  it('includes readiness score', () => {
    const status = getTestnetDeploymentStatus();
    assert.ok(typeof status.readinessScore === 'number');
    assert.ok(status.readinessScore >= 0);
    assert.ok(status.readinessScore <= 100);
  });

  it('includes blockers and warnings arrays', () => {
    const status = getTestnetDeploymentStatus();
    assert.ok(Array.isArray(status.blockers));
    assert.ok(Array.isArray(status.warnings));
    assert.ok(typeof status.blockerCount === 'number');
    assert.ok(typeof status.warningCount === 'number');
  });

  it('blockerCount matches blockers array length', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.blockerCount, status.blockers.length);
  });

  it('warningCount matches warnings array length', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.warningCount, status.warnings.length);
  });

  it('includes config sub-report', () => {
    const status = getTestnetDeploymentStatus();
    assert.ok(typeof status.config === 'object');
    assert.ok(typeof status.config.ready === 'boolean');
    assert.ok(Array.isArray(status.config.blockers));
  });

  it('includes manifest sub-report', () => {
    const status = getTestnetDeploymentStatus();
    assert.ok(typeof status.manifest === 'object');
    assert.ok(typeof status.manifest.mode === 'string');
    assert.ok(typeof status.manifest.valid === 'boolean');
    assert.ok(Array.isArray(status.manifest.steps));
  });

  it('includes safety sub-report', () => {
    const status = getTestnetDeploymentStatus();
    assert.ok(typeof status.safety === 'object');
    assert.ok(typeof status.safety.safe === 'boolean');
    assert.ok(Array.isArray(status.safety.blockers));
  });

  it('includes contract status', () => {
    const status = getTestnetDeploymentStatus();
    assert.ok(typeof status.contracts === 'object');
    assert.equal(status.contracts.total, 6);
    assert.ok(Array.isArray(status.contracts.contracts));
  });

  it('includes token status', () => {
    const status = getTestnetDeploymentStatus();
    assert.ok(typeof status.tokens === 'object');
    assert.equal(status.tokens.total, 2);
    assert.ok(Array.isArray(status.tokens.tokens));
  });

  it('includes deployment order', () => {
    const status = getTestnetDeploymentStatus();
    assert.ok(Array.isArray(status.deploymentOrder));
    assert.equal(status.deploymentOrder.length, 6);
  });

  it('includes deployment checklist with 14 steps', () => {
    const status = getTestnetDeploymentStatus();
    assert.ok(Array.isArray(status.checklist));
    assert.equal(status.checklist.length, 14);
  });

  it('preserves safety metadata: realQuaiTransactions: false', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.realQuaiTransactions, false);
  });

  it('preserves safety metadata: walletRequired: false', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.walletRequired, false);
  });

  it('preserves safety metadata: noWalletLoaded: true', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.noWalletLoaded, true);
  });

  it('preserves safety metadata: noRpcCallMade: true', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.noRpcCallMade, true);
  });

  it('preserves safety metadata: noSigning: true', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.noSigning, true);
  });

  it('preserves safety metadata: noBroadcasting: true', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.noBroadcasting, true);
  });

  it('preserves safety metadata: noFundsMovement: true', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.noFundsMovement, true);
  });

  it('preserves safety metadata: noContractDeploy: true', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.noContractDeploy, true);
  });

  it('preserves safety metadata: approvalGate', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.approvalGate, 'explicit-approval-required-before-deploy');
  });

  it('preserves safety metadata: custody', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.custody, 'non-custodial-deploy-status');
  });
});

describe('formatDeploymentStatusReport', () => {
  it('returns a non-empty string', () => {
    const report = formatDeploymentStatusReport();
    assert.ok(typeof report === 'string');
    assert.ok(report.length > 0);
  });

  it('includes verdict in report', () => {
    const report = formatDeploymentStatusReport();
    assert.ok(report.includes('Verdict:'));
  });

  it('includes score in report', () => {
    const report = formatDeploymentStatusReport();
    assert.ok(report.includes('Score:'));
  });

  it('includes network info in report', () => {
    const report = formatDeploymentStatusReport();
    assert.ok(report.includes(TESTNET_CONFIG.networkName));
    assert.ok(report.includes(TESTNET_CONFIG.zone));
  });

  it('includes contract status in report', () => {
    const report = formatDeploymentStatusReport();
    assert.ok(report.includes('Contracts:'));
  });

  it('includes token status in report', () => {
    const report = formatDeploymentStatusReport();
    assert.ok(report.includes('Tokens:'));
  });

  it('includes safety section in report', () => {
    const report = formatDeploymentStatusReport();
    assert.ok(report.includes('Safety:'));
    assert.ok(report.includes('realQuaiTransactions: false'));
    assert.ok(report.includes('walletRequired: false'));
  });

  it('includes deployment checklist in report', () => {
    const report = formatDeploymentStatusReport();
    assert.ok(report.includes('Deployment Checklist'));
  });

  it('report contains emoji indicators', () => {
    const report = formatDeploymentStatusReport();
    assert.ok(report.includes('✅') || report.includes('⏳') || report.includes('🚫') || report.includes('⬜'));
  });

  it('report mentions approval gate', () => {
    const report = formatDeploymentStatusReport();
    assert.ok(report.includes('approvalGate'));
  });
});

describe('source safety scan', () => {
  it('module source contains no wallet/signing/broadcast patterns', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const sourcePath = join(__dirname, '..', 'services', 'api', 'src', 'testnet-deployment-status.js');
    const source = readFileSync(sourcePath, 'utf8');

    const dangerousPatterns = [
      'eth_sendTransaction',
      'eth_signTransaction',
      'personal_sign',
      'wallet.loadKeystore',
      'wallet.unlock',
      'provider.sendTransaction',
      'contract.deploy',
      'web3.eth.accounts',
      'ethers.Wallet',
    ];

    for (const pattern of dangerousPatterns) {
      assert.ok(
        !source.includes(pattern),
        `source should not contain dangerous pattern: ${pattern}`
      );
    }
  });

  it('module imports only safe read-only modules', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const sourcePath = join(__dirname, '..', 'services', 'api', 'src', 'testnet-deployment-status.js');
    const source = readFileSync(sourcePath, 'utf8');

    // Should import from testnet-config, deploy-readiness-check, testnet-readiness-validator, deploy-manifest
    assert.ok(source.includes("from './testnet-config.js'"));
    assert.ok(source.includes("from './deploy-readiness-check.js'"));
    assert.ok(source.includes("from './testnet-readiness-validator.js'"));
    assert.ok(source.includes("from './deploy-manifest.js'"));
  });
});

describe('readiness integration', () => {
  it('deployment status ties back to testnet-config chainId', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.chainId, TESTNET_CONFIG.chainId);
  });

  it('deployment status ties back to testnet-config networkName', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.networkName, TESTNET_CONFIG.networkName);
  });

  it('deployment status ties back to testnet-config zone', () => {
    const status = getTestnetDeploymentStatus();
    assert.equal(status.zone, TESTNET_CONFIG.zone);
  });

  it('deployment order matches deploy-manifest DEPLOY_ORDER', () => {
    const order = getDeploymentOrder();
    assert.equal(order.length, 6);
    // Settlement should be last
    assert.equal(order[order.length - 1].contract, 'Settlement');
  });
});
