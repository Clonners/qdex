import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPLOYABLE_CONTRACT_COUNT,
  CONTRACT_DEPLOYMENT_GAS_ESTIMATES,
  GAS_SAFETY_MULTIPLIER,
  FALLBACK_GAS_PRICE_WEI,
  NATIVE_CURRENCY,
  QUAI_DECIMALS,
  weiToQuai,
  estimateContractCost,
  probeGasPrice,
  estimateDeploymentCost,
  formatCostSummary,
  checkDeploymentSufficiency,
} from '../services/api/src/testnet-gas-estimation.js';

// ── Module exports ────────────────────────────────────────────────────

describe('testnet-gas-estimation: module exports', () => {
  it('exports DEPLOYABLE_CONTRACT_COUNT = 6', () => {
    assert.equal(DEPLOYABLE_CONTRACT_COUNT, 6);
  });

  it('exports CONTRACT_DEPLOYMENT_GAS_ESTIMATES with all 6 contracts', () => {
    const names = Object.keys(CONTRACT_DEPLOYMENT_GAS_ESTIMATES);
    assert.equal(names.length, 6);
    assert.ok(names.includes('TradingVault'));
    assert.ok(names.includes('NonceManager'));
    assert.ok(names.includes('MarketRegistry'));
    assert.ok(names.includes('FeeManager'));
    assert.ok(names.includes('DelegateKeyRegistry'));
    assert.ok(names.includes('Settlement'));
  });

  it('all gas estimates are positive integers', () => {
    for (const [name, gas] of Object.entries(CONTRACT_DEPLOYMENT_GAS_ESTIMATES)) {
      assert.ok(Number.isInteger(gas), `${name} gas estimate must be integer`);
      assert.ok(gas > 0, `${name} gas estimate must be positive`);
      assert.ok(gas >= 500000, `${name} gas estimate too low (< 500K)`);
    }
  });

  it('exports GAS_SAFETY_MULTIPLIER = 1.5', () => {
    assert.equal(GAS_SAFETY_MULTIPLIER, 1.5);
  });

  it('exports FALLBACK_GAS_PRICE_WEI (200 gwei)', () => {
    assert.equal(FALLBACK_GAS_PRICE_WEI, 200n * 10n ** 9n);
  });

  it('exports NATIVE_CURRENCY = "QUAI"', () => {
    assert.equal(NATIVE_CURRENCY, 'QUAI');
  });

  it('exports QUAI_DECIMALS = 18', () => {
    assert.equal(QUAI_DECIMALS, 18);
  });

  it('exports all public functions', () => {
    assert.equal(typeof weiToQuai, 'function');
    assert.equal(typeof estimateContractCost, 'function');
    assert.equal(typeof probeGasPrice, 'function');
    assert.equal(typeof estimateDeploymentCost, 'function');
    assert.equal(typeof formatCostSummary, 'function');
    assert.equal(typeof checkDeploymentSufficiency, 'function');
  });
});

// ── weiToQuai ─────────────────────────────────────────────────────────

describe('testnet-gas-estimation: weiToQuai', () => {
  it('converts 0 wei to "0.000000000000000000"', () => {
    assert.equal(weiToQuai(0n), '0.000000000000000000');
  });

  it('converts 1 QUAI (10^18 wei) to "1.000000000000000000"', () => {
    assert.equal(weiToQuai(10n ** 18n), '1.000000000000000000');
  });

  it('converts 2.5 QUAI correctly', () => {
    const twoPointFive = 2n * 10n ** 18n + 5n * 10n ** 17n;
    assert.equal(weiToQuai(twoPointFive), '2.500000000000000000');
  });

  it('converts small wei amounts with leading zeros', () => {
    // 1 gwei = 10^9 wei = 0.000000001 QUAI
    assert.equal(weiToQuai(10n ** 9n), '0.000000001000000000');
  });

  it('converts large wei amounts', () => {
    const tenThousandQuai = 10000n * 10n ** 18n;
    assert.equal(weiToQuai(tenThousandQuai), '10000.000000000000000000');
  });
});

// ── estimateContractCost ──────────────────────────────────────────────

describe('testnet-gas-estimation: estimateContractCost', () => {
  const gasPrice = 200n * 10n ** 9n; // 200 gwei

  it('returns all required fields', () => {
    const result = estimateContractCost('TradingVault', gasPrice, 1200000);
    assert.ok('contract' in result);
    assert.ok('baseGasEstimate' in result);
    assert.ok('gasWithSafety' in result);
    assert.ok('gasPriceWei' in result);
    assert.ok('gasPriceGwei' in result);
    assert.ok('costWei' in result);
    assert.ok('costQuai' in result);
  });

  it('applies safety multiplier to gas estimate', () => {
    const result = estimateContractCost('TestContract', gasPrice, 1000000);
    assert.equal(result.gasWithSafety, Math.ceil(1000000 * GAS_SAFETY_MULTIPLIER));
  });

  it('calculates correct gas price in gwei', () => {
    const result = estimateContractCost('TestContract', gasPrice, 1000000);
    assert.equal(result.gasPriceGwei, 200);
  });

  it('costWei equals gasWithSafety * gasPriceWei', () => {
    const result = estimateContractCost('TestContract', gasPrice, 1000000);
    const expectedWei = result.gasWithSafety * result.gasPriceWei;
    assert.equal(result.costWei, expectedWei);
  });

  it('costQuai is a valid decimal string', () => {
    const result = estimateContractCost('TradingVault', gasPrice, 1200000);
    assert.ok(typeof result.costQuai === 'string');
    assert.ok(result.costQuai.includes('.'));
    assert.ok(parseFloat(result.costQuai) > 0);
  });

  it('uses custom safety multiplier when provided', () => {
    const result = estimateContractCost('TestContract', gasPrice, 1000000, 2.0);
    assert.equal(result.gasWithSafety, 2000000);
  });

  it('costs scale with gas price', () => {
    const lowGas = estimateContractCost('TestContract', 50n * 10n ** 9n, 1000000);
    const highGas = estimateContractCost('TestContract', 500n * 10n ** 9n, 1000000);
    assert.ok(highGas.costWei > lowGas.costWei);
  });
});

// ── probeGasPrice (live) ─────────────────────────────────────────────

describe('testnet-gas-estimation: probeGasPrice (live)', () => {
  it('returns success with gas price from Orchard RPC', async () => {
    const result = await probeGasPrice();
    assert.ok(result.success, `probe should succeed: ${result.error}`);
    assert.ok(result.gasPriceWei !== null, 'gasPriceWei must not be null');
    assert.ok(result.gasPriceGwei !== null, 'gasPriceGwei must not be null');
    assert.equal(result.usedFallback, false, 'should not use fallback on success');
    assert.equal(result.error, null, 'no error on success');
  });

  it('gas price is positive and reasonable (< 10000 gwei)', async () => {
    const result = await probeGasPrice();
    assert.ok(result.gasPriceGwei > 0, 'gas price must be positive');
    assert.ok(result.gasPriceGwei < 10000, 'gas price seems unreasonably high');
  });

  it('gasPriceWei is consistent with gasPriceGwei', async () => {
    const result = await probeGasPrice();
    const expectedGwei = Number(result.gasPriceWei / 10n ** 9n);
    assert.equal(result.gasPriceGwei, expectedGwei);
  });
});

// ── estimateDeploymentCost (with override) ────────────────────────────

describe('testnet-gas-estimation: estimateDeploymentCost', () => {
  const testGasPrice = 200n * 10n ** 9n; // 200 gwei

  it('returns report with all 6 contracts when using override', async () => {
    const report = await estimateDeploymentCost(testGasPrice);
    assert.equal(report.contractCount, 6);
    assert.equal(report.contractEstimates.length, 6);
  });

  it('gasPriceSource is "override" when override provided', async () => {
    const report = await estimateDeploymentCost(testGasPrice);
    assert.equal(report.gasPriceSource, 'override');
  });

  it('totalCostWei is sum of all contract costs', async () => {
    const report = await estimateDeploymentCost(testGasPrice);
    const sum = report.contractEstimates.reduce((acc, e) => acc + e.costWei, 0);
    assert.equal(report.totalCostWei, sum);
  });

  it('totalCostQuai matches weiToQuai(totalCostWei)', async () => {
    const report = await estimateDeploymentCost(testGasPrice);
    const expectedQuai = weiToQuai(BigInt(report.totalCostWei));
    assert.equal(report.totalCostQuai, expectedQuai);
  });

  it('includes network info from TESTNET_CONFIG', async () => {
    const report = await estimateDeploymentCost(testGasPrice);
    assert.equal(report.networkName, 'quai-orchard');
    assert.equal(report.zone, 'cyprus1');
    assert.equal(report.chainId, 15000);
  });

  it('safety metadata always present', async () => {
    const report = await estimateDeploymentCost(testGasPrice);
    assert.equal(report.realQuaiTransactions, false);
    assert.equal(report.walletRequired, false);
    assert.equal(report.noWalletLoaded, true);
    assert.equal(report.noSigning, true);
    assert.equal(report.noBroadcasting, true);
    assert.equal(report.noFundsMovement, true);
    assert.equal(report.noContractDeploy, true);
    assert.ok(report.approvalGate);
  });

  it('uses fallback when useFallback=true', async () => {
    const report = await estimateDeploymentCost(undefined, true);
    assert.equal(report.gasPriceSource, 'fallback');
    assert.equal(report.usedFallback, true);
    assert.equal(report.activeGasPriceGwei, Number(FALLBACK_GAS_PRICE_WEI / 10n ** 9n));
  });

  it('total cost at 200 gwei is reasonable (< 10 QUAI)', async () => {
    const report = await estimateDeploymentCost(testGasPrice);
    const totalQuai = parseFloat(report.totalCostQuai);
    assert.ok(totalQuai > 0, 'total cost must be positive');
    assert.ok(totalQuai < 10, `total cost ${totalQuai} QUAI seems too high at 200 gwei`);
  });
});

// ── estimateDeploymentCost (live) ─────────────────────────────────────

describe('testnet-gas-estimation: estimateDeploymentCost (live)', () => {
  it('probes live gas price and produces complete report', async () => {
    const report = await estimateDeploymentCost();
    assert.equal(report.gasPriceSource, 'live-rpc');
    assert.equal(report.usedFallback, false);
    assert.ok(report.activeGasPriceGwei > 0, 'live gas price must be positive');
    assert.equal(report.contractCount, 6);
    assert.ok(report.totalCostWei > 0, 'total cost must be positive');
  });

  it('live report has safety metadata', async () => {
    const report = await estimateDeploymentCost();
    assert.equal(report.realQuaiTransactions, false);
    assert.equal(report.approvalGate, 'explicit-approval-required-before-deploy');
  });
});

// ── formatCostSummary ─────────────────────────────────────────────────

describe('testnet-gas-estimation: formatCostSummary', () => {
  const report = {
    networkName: 'quai-orchard',
    zone: 'cyprus1',
    chainId: 15000,
    activeGasPriceGwei: 200,
    gasPriceSource: 'override',
    safetyMultiplier: 1.5,
    usedFallback: false,
    contractEstimates: [
      { contract: 'TradingVault', gasWithSafety: 1800000, costQuai: '3.600000000000000000' },
      { contract: 'Settlement', gasWithSafety: 1950000, costQuai: '3.900000000000000000' },
    ],
    totalCostQuai: '7.500000000000000000',
  };

  it('includes network info in summary', () => {
    const summary = formatCostSummary(report);
    assert.ok(summary.includes('quai-orchard'));
    assert.ok(summary.includes('cyprus1'));
    assert.ok(summary.includes('15000'));
  });

  it('includes gas price in summary', () => {
    const summary = formatCostSummary(report);
    assert.ok(summary.includes('200 gwei'));
  });

  it('includes per-contract costs', () => {
    const summary = formatCostSummary(report);
    assert.ok(summary.includes('TradingVault'));
    assert.ok(summary.includes('3.600000000000000000'));
  });

  it('includes total cost in summary', () => {
    const summary = formatCostSummary(report);
    assert.ok(summary.includes('Total estimated'));
    assert.ok(summary.includes('7.500000000000000000'));
  });

  it('includes approval notice in summary', () => {
    const summary = formatCostSummary(report);
    assert.ok(summary.includes('explicit approval'));
  });

  it('shows fallback warning when usedFallback=true', () => {
    const fallbackReport = { ...report, usedFallback: true };
    const summary = formatCostSummary(fallbackReport);
    assert.ok(summary.includes('fallback'), 'should include fallback warning');
  });
});

// ── checkDeploymentSufficiency ────────────────────────────────────────

describe('testnet-gas-estimation: checkDeploymentSufficiency', () => {
  const lowCostReport = {
    totalCostWei: 3600000000000000000, // 3.6 QUAI at 200 gwei (simplified)
    totalCostQuai: '3.600000000000000000',
  };

  it('returns null sufficient when balance not provided', () => {
    const result = checkDeploymentSufficiency(lowCostReport, null);
    assert.equal(result.sufficient, null);
    assert.equal(result.reason, 'deployer balance not provided');
  });

  it('returns sufficient=true when balance exceeds cost', () => {
    const result = checkDeploymentSufficiency(lowCostReport, '10.0');
    assert.equal(result.sufficient, true);
    assert.equal(result.shortfallQuai, null);
    assert.ok(result.reason.includes('sufficient'));
  });

  it('returns sufficient=false when balance below cost', () => {
    const result = checkDeploymentSufficiency(lowCostReport, '2.0');
    assert.equal(result.sufficient, false);
    assert.ok(result.shortfallQuai !== null, 'shortfall must be present');
    assert.ok(parseFloat(result.shortfallQuai) > 0, 'shortfall must be positive');
  });

  it('returns safety metadata', () => {
    const result = checkDeploymentSufficiency(lowCostReport, '10.0');
    assert.ok(result.safetyMetadata);
    assert.equal(result.safetyMetadata.realQuaiTransactions, false);
    assert.equal(result.safetyMetadata.approvalGate, 'explicit-approval-required-before-deploy');
  });
});

// ── Source safety scan ────────────────────────────────────────────────

describe('testnet-gas-estimation: source safety scan', () => {
  it('source contains no wallet/signing/broadcast patterns', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const sourcePath = join(__dirname, '..', 'services', 'api', 'src', 'testnet-gas-estimation.js');
    const source = readFileSync(sourcePath, 'utf-8');

    const forbiddenPatterns = [
      /privateKey/i,
      /signTransaction/i,
      /sendTransaction/i,
      /eth_sign/i,
      /personal_sign/i,
      /wallet\.fromMnemonic/i,
      /wallet\.fromPrivateKey/i,
      /deploy\(/i,
    ];

    for (const pattern of forbiddenPatterns) {
      assert.equal(source.match(pattern), null, `source must not contain pattern: ${pattern}`);
    }
  });

  it('source contains read-only RPC method references only', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const sourcePath = join(__dirname, '..', 'services', 'api', 'src', 'testnet-gas-estimation.js');
    const source = readFileSync(sourcePath, 'utf-8');

    // Should reference only read-only methods
    assert.ok(source.includes('eth_gasPrice'), 'must use eth_gasPrice');
    // Should NOT reference write methods
    assert.equal(source.match(/eth_sendTransaction|eth_call.*data|eth_estimateGas.*data|eth_deploy/i), null,
      'must not reference write RPC methods');
  });
});

// ── Integration: readiness report ─────────────────────────────────────

describe('testnet-gas-estimation: readiness integration', () => {
  it('cost estimate integrates with connection probe chainId', async () => {
    const report = await estimateDeploymentCost();
    assert.equal(report.chainId, 15000, 'should match testnet config chainId');
    assert.equal(report.networkName, 'quai-orchard', 'should match testnet config network');
    assert.equal(report.zone, 'cyprus1', 'should match testnet config zone');
  });
});
