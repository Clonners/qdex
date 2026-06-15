// Expanded real-mode gate: receipt_wait and failure_classification checks.
// These checks ensure the relayer has explicit configuration for how long
// to wait for settlement receipts and how failures are classified, before
// it ever touches real settlement logic.
// No wallet loading, signing, broadcast, RPC access, or transaction submission.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRelayerRealModeReadiness, REAL_MODE_REQUIRED_CHECKS } from '../src/real-mode-gate.js';

const MOCK_FILL = {
  fillId: 'fill-000001',
  marketId: 'WQUAI-WQI',
  makerOrderHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
  takerOrderHash: '0x0000000000000000000000000000000000000000000000000000000000000002',
  maker: '0x1111111111111111111111111111111111111111',
  taker: '0x3333333333333333333333333333333333333333',
  price: '123000000000000000',
  amount: '1000000000000000000',
  makerFee: '0',
  takerFee: '0',
  settlementMode: 'quai_contract',
  makerSignature: '0xmaker_sig',
  takerSignature: '0xtaker_sig',
};

const clone = (v) => JSON.parse(JSON.stringify(v));

// Full config with all checks passing, including the new receipt_wait + failure_classification.
const FULL_CONFIG = {
  settlementMode: 'quai_contract',
  approval: {
    explicitApproval: true,
    approvalId: 'clonners-testnet-001',
    approvedBy: 'Clonners',
    approvedAt: '2026-06-15T00:00:00Z',
    scope: 'testnet-settlement',
  },
  eventTruth: {
    proofTrigger: 'TradeSettled',
    settlementContract: '0xSettlement1111111111111111111111111111',
    chainId: '1',
    zone: 'solo',
    indexerSource: 'local-testnet-indexer',
    finalityDepth: 1,
    requiredFields: ['settlementTx', 'blockNumber', 'blockHash', 'eventIndex', 'explorerUrl'],
  },
  contracts: {
    TradingVault: '0xVault1111111111111111111111111111111',
    Settlement: '0xSettlement1111111111111111111111111111',
    NonceManager: '0xNonce11111111111111111111111111111',
    MarketRegistry: '0xMarket11111111111111111111111111111',
    FeeManager: '0xFee111111111111111111111111111111',
    DelegateKeyRegistry: '0xDelegate11111111111111111111111111',
  },
  chainId: '1',
  zone: 'solo',
  market: {
    marketId: 'WQUAI-WQI',
    enabled: true,
  },
  feeSchedule: {
    makerFeeBps: 10,
    takerFeeBps: 20,
    hardMaxFeeBps: 1000,
    withinCaps: true,
  },
  nonceCheck: {
    makerNonceUsed: false,
    takerNonceUsed: false,
    makerNonceCancelled: false,
    takerNonceCancelled: false,
  },
  delegatePolicy: {
    NO_WITHDRAW: true,
    NO_ADMIN: true,
    delegateCanWithdraw: false,
    delegateCanAdmin: false,
  },
  slippageCheck: {
    withinBounds: true,
  },
  orderAmountCheck: {
    valid: true,
  },
  fillPacket: MOCK_FILL,
  receiptWait: {
    enabled: true,
    maxWaitMs: 30000,
    pollingIntervalMs: 2000,
  },
  failureClassification: {
    retryableTimeout: true,
    terminalRevert: true,
    maxRetries: 3,
  },
};

describe('relayer real-mode gate — expanded checks', () => {
  it('REAL_MODE_REQUIRED_CHECKS includes receipt_wait and failure_classification', () => {
    assert.ok(Array.isArray(REAL_MODE_REQUIRED_CHECKS));
    assert.ok(REAL_MODE_REQUIRED_CHECKS.includes('receipt_wait'), 'receipt_wait check must be listed');
    assert.ok(REAL_MODE_REQUIRED_CHECKS.includes('failure_classification'), 'failure_classification check must be listed');
  });

  it('mock mode ignores receipt_wait and failure_classification', () => {
    const result = evaluateRelayerRealModeReadiness({
      settlementMode: 'mock',
    });

    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'mock_mode_local_only');
    assert.deepEqual(result.failedChecks, []);
  });

  it('fails receipt_wait when not configured', () => {
    const result = evaluateRelayerRealModeReadiness({
      ...FULL_CONFIG,
      receiptWait: undefined,
    });

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('receipt_wait'));
    assert.ok(result.checkFailures.receipt_wait, 'receipt_wait failure reason must be present');
  });

  it('fails receipt_wait when maxWaitMs is missing', () => {
    const result = evaluateRelayerRealModeReadiness({
      ...FULL_CONFIG,
      receiptWait: { enabled: true },
    });

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('receipt_wait'));
  });

  it('fails receipt_wait when maxWaitMs is zero or negative', () => {
    const result = evaluateRelayerRealModeReadiness({
      ...FULL_CONFIG,
      receiptWait: { enabled: true, maxWaitMs: 0, pollingIntervalMs: 1000 },
    });

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('receipt_wait'));
  });

  it('fails receipt_wait when pollingIntervalMs exceeds maxWaitMs', () => {
    const result = evaluateRelayerRealModeReadiness({
      ...FULL_CONFIG,
      receiptWait: { enabled: true, maxWaitMs: 5000, pollingIntervalMs: 10000 },
    });

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('receipt_wait'));
  });

  it('fails failure_classification when not configured', () => {
    const result = evaluateRelayerRealModeReadiness({
      ...FULL_CONFIG,
      failureClassification: undefined,
    });

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('failure_classification'));
    assert.ok(result.checkFailures.failure_classification, 'failure_classification failure reason must be present');
  });

  it('fails failure_classification when retryableTimeout is not true', () => {
    const result = evaluateRelayerRealModeReadiness({
      ...FULL_CONFIG,
      failureClassification: { retryableTimeout: false, terminalRevert: true, maxRetries: 3 },
    });

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('failure_classification'));
  });

  it('fails failure_classification when terminalRevert is not true', () => {
    const result = evaluateRelayerRealModeReadiness({
      ...FULL_CONFIG,
      failureClassification: { retryableTimeout: true, terminalRevert: false, maxRetries: 3 },
    });

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('failure_classification'));
  });

  it('fails failure_classification when maxRetries is less than 1', () => {
    const result = evaluateRelayerRealModeReadiness({
      ...FULL_CONFIG,
      failureClassification: { retryableTimeout: true, terminalRevert: true, maxRetries: 0 },
    });

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('failure_classification'));
  });

  it('fails failure_classification when maxRetries exceeds 10', () => {
    const result = evaluateRelayerRealModeReadiness({
      ...FULL_CONFIG,
      failureClassification: { retryableTimeout: true, terminalRevert: true, maxRetries: 11 },
    });

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('failure_classification'));
  });

  it('passes all checks with valid receipt_wait + failure_classification', () => {
    const result = evaluateRelayerRealModeReadiness(FULL_CONFIG);

    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'real_mode_checks_passed');
    assert.deepEqual(result.failedChecks, []);
    assert.equal(result.nextAction, 'separately-approved-wallet-and-broadcast-implementation-required');
  });

  it('reports receipt_wait and failure_classification as failed when all 14 checks are absent', () => {
    const result = evaluateRelayerRealModeReadiness({
      settlementMode: 'quai_contract',
    });

    assert.equal(result.allowed, false);
    assert.equal(result.failedChecks.length, REAL_MODE_REQUIRED_CHECKS.length);
    assert.ok(result.failedChecks.includes('receipt_wait'));
    assert.ok(result.failedChecks.includes('failure_classification'));
  });

  it('preserves safety metadata with expanded checks', () => {
    const result = evaluateRelayerRealModeReadiness(FULL_CONFIG);

    assert.equal(result.realQuaiTransactions, false);
    assert.equal(result.walletRequired, false);
    assert.equal(result.fundsMoved, false);
    assert.ok(result.permissions?.includes('NO_WITHDRAW'));
    assert.ok(result.permissions?.includes('NO_ADMIN'));
    assert.ok(result.custody);
    assert.ok(result.safetyNotice);
  });

  it('receipt_wait accepts boundary value maxWaitMs=1 with pollingIntervalMs=1', () => {
    const config = clone(FULL_CONFIG);
    config.receiptWait = { enabled: true, maxWaitMs: 1, pollingIntervalMs: 1 };
    const result = evaluateRelayerRealModeReadiness(config);

    // receipt_wait should pass; all other checks also pass
    assert.ok(!result.failedChecks.includes('receipt_wait'));
  });

  it('failure_classification accepts maxRetries=1 and maxRetries=10', () => {
    const config1 = clone(FULL_CONFIG);
    config1.failureClassification = { retryableTimeout: true, terminalRevert: true, maxRetries: 1 };
    const result1 = evaluateRelayerRealModeReadiness(config1);
    assert.ok(!result1.failedChecks.includes('failure_classification'));

    const config10 = clone(FULL_CONFIG);
    config10.failureClassification = { retryableTimeout: true, terminalRevert: true, maxRetries: 10 };
    const result10 = evaluateRelayerRealModeReadiness(config10);
    assert.ok(!result10.failedChecks.includes('failure_classification'));
  });
});
