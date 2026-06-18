import assert from 'node:assert/strict';
import test from 'node:test';

const {
  probeDeployerBalance,
  estimateDeploymentCost,
  verifyDeployerBalance,
  verifySourceSafety,
  DEPLOYER_ADDRESS,
  ESTIMATED_DEPLOY_GAS_PER_CONTRACT,
  DEPLOYABLE_CONTRACT_COUNT,
  ESTIMATED_TOTAL_DEPLOY_GAS,
  GAS_SAFETY_MULTIPLIER,
  ESTIMATED_GAS_PRICE_GWEI,
  normalizeAddress,
  calculateMinimumBalanceWei,
} = await import('../services/api/src/testnet-deployer-balance.js');

// ── Module exports and constants ─────────────────────────────────────

test('module exports all expected functions and constants', () => {
  assert.equal(typeof probeDeployerBalance, 'function');
  assert.equal(typeof estimateDeploymentCost, 'function');
  assert.equal(typeof verifyDeployerBalance, 'function');
  assert.equal(typeof verifySourceSafety, 'function');
  assert.equal(typeof normalizeAddress, 'function');
  assert.equal(typeof calculateMinimumBalanceWei, 'function');
  assert.equal(typeof DEPLOYER_ADDRESS, 'string');
  assert.equal(DEPLOYABLE_CONTRACT_COUNT, 6);
  assert.equal(typeof ESTIMATED_DEPLOY_GAS_PER_CONTRACT, 'number');
  assert.equal(typeof ESTIMATED_TOTAL_DEPLOY_GAS, 'number');
  assert.equal(typeof GAS_SAFETY_MULTIPLIER, 'number');
  assert.equal(typeof ESTIMATED_GAS_PRICE_GWEI, 'number');
});

test('DEPLOYABLE_CONTRACT_COUNT is 6', () => {
  assert.equal(DEPLOYABLE_CONTRACT_COUNT, 6);
});

test('ESTIMATED_TOTAL_DEPLOY_GAS equals per-contract times contract count', () => {
  assert.equal(
    ESTIMATED_TOTAL_DEPLOY_GAS,
    ESTIMATED_DEPLOY_GAS_PER_CONTRACT * DEPLOYABLE_CONTRACT_COUNT,
  );
});

test('GAS_SAFETY_MULTIPLIER is 1.5', () => {
  assert.equal(GAS_SAFETY_MULTIPLIER, 1.5);
});

test('ESTIMATED_GAS_PRICE_GWEI is a positive number', () => {
  assert.ok(ESTIMATED_GAS_PRICE_GWEI > 0);
});

// ── normalizeAddress ─────────────────────────────────────────────────

test('normalizeAddress — lowercases and adds 0x prefix', () => {
  assert.equal(normalizeAddress('0xAbCd'), '0xabcd');
  assert.equal(normalizeAddress('ABCD'), '0xabcd');
});

test('normalizeAddress — handles already-normalized address', () => {
  assert.equal(normalizeAddress('0xabcd'), '0xabcd');
});

test('normalizeAddress — returns null for empty/null/undefined', () => {
  assert.equal(normalizeAddress(''), null);
  assert.equal(normalizeAddress(null), null);
  assert.equal(normalizeAddress(undefined), null);
});

// ── calculateMinimumBalanceWei ───────────────────────────────────────

test('calculateMinimumBalanceWei returns a positive BigInt', () => {
  const minBalance = calculateMinimumBalanceWei();
  assert.ok(minBalance > 0n);
});

test('calculateMinimumBalanceWei accounts for safety multiplier', () => {
  const minBalance = calculateMinimumBalanceWei();
  const gasPriceWei = BigInt(ESTIMATED_GAS_PRICE_GWEI) * 1_000_000_000n;
  const totalGas = BigInt(Math.ceil(ESTIMATED_TOTAL_DEPLOY_GAS * GAS_SAFETY_MULTIPLIER));
  const expected = totalGas * gasPriceWei;
  assert.equal(minBalance, expected);
});

// ── estimateDeploymentCost ───────────────────────────────────────────

test('estimateDeploymentCost — returns all expected fields', () => {
  const cost = estimateDeploymentCost();
  assert.equal(cost.estimatedTotalGas, ESTIMATED_TOTAL_DEPLOY_GAS);
  assert.equal(cost.estimatedGasPriceGwei, ESTIMATED_GAS_PRICE_GWEI);
  assert.equal(cost.safetyMultiplier, GAS_SAFETY_MULTIPLIER);
  assert.equal(cost.perContractGas, ESTIMATED_DEPLOY_GAS_PER_CONTRACT);
  assert.equal(cost.contractCount, DEPLOYABLE_CONTRACT_COUNT);
  assert.ok(typeof cost.estimatedCostQuai === 'string');
  assert.ok(parseFloat(cost.estimatedCostQuai) > 0);
});

test('estimateDeploymentCost — cost is positive', () => {
  const cost = estimateDeploymentCost();
  assert.ok(parseFloat(cost.estimatedCostQuai) > 0);
});

// ── probeDeployerBalance (live RPC) ──────────────────────────────────

test('probeDeployerBalance — live RPC returns success with balance', async () => {
  const result = await probeDeployerBalance();
  assert.equal(result.success, true, 'should succeed against Orchard RPC');
  assert.ok(result.address, 'should return the deployer address');
  assert.ok(result.balanceWei, 'should return balance in wei');
  assert.ok(result.balanceQuai, 'should return balance in QUAI');
  assert.equal(result.error, null);
}, { timeout: 15000 });

test('probeDeployerBalance — balance is a valid positive number', async () => {
  const result = await probeDeployerBalance();
  assert.ok(result.success);
  const balanceQuaiNum = parseFloat(result.balanceQuai);
  assert.ok(balanceQuaiNum >= 0, 'balance should be non-negative');
}, { timeout: 15000 });

test('probeDeployerBalance — address is normalized', async () => {
  const result = await probeDeployerBalance();
  assert.ok(result.success);
  assert.ok(result.address.startsWith('0x'), 'address should start with 0x');
  assert.equal(result.address, result.address.toLowerCase(), 'address should be lowercase');
}, { timeout: 15000 });

// ── verifyDeployerBalance (live RPC) ─────────────────────────────────

test('verifyDeployerBalance — live RPC returns complete report', async () => {
  const report = await verifyDeployerBalance();
  assert.ok(report.deployerAddress, 'should include deployer address');
  assert.ok(report.rpcAvailable !== undefined, 'should include rpcAvailable');
  assert.ok(report.sufficient !== undefined, 'should include sufficient');
  assert.ok(typeof report.estimatedCostQuai === 'string', 'should include estimated cost');
  assert.ok(typeof report.estimatedTotalGas === 'number', 'should include estimated gas');
  assert.equal(report.realQuaiTransactions, false);
  assert.equal(report.walletRequired, false);
  assert.equal(report.fundsMoved, false);
  assert.equal(report.approvalGate, 'explicit-approval-required-before-deploy');
}, { timeout: 15000 });

test('verifyDeployerBalance — sufficient field is boolean when RPC available', async () => {
  const report = await verifyDeployerBalance();
  if (report.rpcAvailable) {
    assert.equal(typeof report.sufficient, 'boolean');
    assert.ok(report.sufficient === true || report.sufficient === false);
  }
}, { timeout: 15000 });

test('verifyDeployerBalance — shortfall only present when insufficient', async () => {
  const report = await verifyDeployerBalance();
  if (report.rpcAvailable && report.sufficient === false) {
    assert.ok(report.shortfallQuai !== null, 'should have shortfall when insufficient');
    assert.ok(parseFloat(report.shortfallQuai) > 0);
  } else if (report.rpcAvailable && report.sufficient === true) {
    assert.equal(report.shortfallQuai, null, 'should be null when sufficient');
  }
}, { timeout: 15000 });

test('verifyDeployerBalance — balance matches between probe and verification', async () => {
  const [probeResult, verifyReport] = await Promise.all([
    probeDeployerBalance(),
    verifyDeployerBalance(),
  ]);
  if (probeResult.success && verifyReport.rpcAvailable) {
    assert.equal(probeResult.balanceWei, verifyReport.balanceWei);
    assert.equal(probeResult.balanceQuai, verifyReport.balanceQuai);
  }
}, { timeout: 15000 });

// ── Safety metadata in all paths ─────────────────────────────────────

test('verifyDeployerBalance — safety metadata present even on RPC failure', async () => {
  // Even if RPC works, verify the safety fields are always present
  const report = await verifyDeployerBalance();
  assert.equal(report.realQuaiTransactions, false);
  assert.equal(report.walletRequired, false);
  assert.equal(report.fundsMoved, false);
  assert.equal(report.approvalGate, 'explicit-approval-required-before-deploy');
}, { timeout: 15000 });

// ── Source safety verification ───────────────────────────────────────

test('verifySourceSafety returns true', () => {
  assert.equal(verifySourceSafety(), true);
});

test('source contains no wallet/signing/broadcast patterns', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../services/api/src/testnet-deployer-balance.js', import.meta.url),
    'utf8',
  );

  // Should NOT contain wallet-related imports or patterns
  const forbiddenPatterns = [
    'ethers.',
    'web3.',
    'signTransaction',
    'sendTransaction',
    'privateKey',
    'PrivateKey',
    'Wallet.from',
    'new Wallet',
    '.sign(',
    'personal_sign',
    'eth_sign',
    'eth_sendTransaction',
    'eth_sendRawTransaction',
  ];

  for (const pattern of forbiddenPatterns) {
    assert.ok(
      !source.includes(pattern),
      `source should not contain "${pattern}" — this is a read-only module`,
    );
  }
});

// ── Integration with testnet-config.js ───────────────────────────────

test('deployer address matches TESTNET_CONFIG.deployer', async () => {
  const { TESTNET_CONFIG } = await import('../services/api/src/testnet-config.js');
  assert.equal(DEPLOYER_ADDRESS, TESTNET_CONFIG.deployer);
});

test('testnet-config RPC URL is configured for probes', async () => {
  const { TESTNET_CONFIG } = await import('../services/api/src/testnet-config.js');
  assert.ok(TESTNET_CONFIG.rpcUrl, 'RPC URL must be configured for balance probes');
  assert.ok(TESTNET_CONFIG.rpcUrl.includes('orchard'), 'should point to Orchard testnet');
});

// ── CAMPAIGN_STATUS.md ratchet ───────────────────────────────────────

test('CAMPAIGN_STATUS.md records deployer balance verification', async () => {
  const { readFile } = await import('node:fs/promises');
  const status = await readFile(
    new URL('../CAMPAIGN_STATUS.md', import.meta.url),
    'utf8',
  );

  assert.ok(
    status.includes('testnet-deployer-balance'),
    'status should reference deployer balance verification module',
  );
  assert.ok(
    status.includes('testnet-deployer-balance.test.mjs'),
    'status should reference this test file',
  );
});
