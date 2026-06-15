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
// Minimal mock config for testing
const MOCK_CONFIG = {
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
};

describe('relayer real-mode gate', () => {
  it('exposes REAL_MODE_REQUIRED_CHECKS list', () => {
    assert.ok(Array.isArray(REAL_MODE_REQUIRED_CHECKS));
    assert.ok(REAL_MODE_REQUIRED_CHECKS.length > 0);
    assert.ok(REAL_MODE_REQUIRED_CHECKS.includes('explicit_approval'));
    assert.ok(REAL_MODE_REQUIRED_CHECKS.includes('complete_contracts'));
    assert.ok(REAL_MODE_REQUIRED_CHECKS.includes('chain_id_match'));
    assert.ok(REAL_MODE_REQUIRED_CHECKS.includes('signatures_present'));
    assert.ok(REAL_MODE_REQUIRED_CHECKS.includes('market_enabled'));
    assert.ok(REAL_MODE_REQUIRED_CHECKS.includes('fee_within_caps'));
    assert.ok(REAL_MODE_REQUIRED_CHECKS.includes('nonces_available'));
    assert.ok(REAL_MODE_REQUIRED_CHECKS.includes('delegate_NO_WITHDRAW'));
    assert.ok(REAL_MODE_REQUIRED_CHECKS.includes('delegate_NO_ADMIN'));
    assert.ok(REAL_MODE_REQUIRED_CHECKS.includes('slippage_bounds'));
    assert.ok(REAL_MODE_REQUIRED_CHECKS.includes('order_amount_valid'));
  });

  it('mock mode always returns ready with no checks', () => {
    const result = evaluateRelayerRealModeReadiness({
      settlementMode: 'mock',
    });

    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'mock_mode_local_only');
    assert.equal(result.settlementMode, 'mock');
    assert.equal(result.realQuaiTransactions, false);
    assert.equal(result.walletRequired, false);
    assert.equal(result.fundsMoved, false);
    assert.deepEqual(result.failedChecks, []);
  });

  it('rejects unknown settlement mode', () => {
    const result = evaluateRelayerRealModeReadiness({
      settlementMode: 'unknown_mode',
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'unsupported_settlement_mode');
    assert.equal(result.realQuaiTransactions, false);
    assert.equal(result.walletRequired, false);
  });

  it('rejects quai_contract without explicit approval', () => {
    const result = evaluateRelayerRealModeReadiness({
      settlementMode: 'quai_contract',
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'real_mode_checks_failed');
    assert.ok(result.failedChecks.includes('explicit_approval'));
    assert.equal(result.realQuaiTransactions, false);
    assert.equal(result.walletRequired, false);
    assert.equal(result.fundsMoved, false);
    assert.ok(result.safetyNotice);
  });

  it('fails explicit_approval check when approval not set', () => {
    const result = evaluateRelayerRealModeReadiness({
      settlementMode: 'quai_contract',
      approval: { explicitApproval: false },
    });

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('explicit_approval'));
  });

  it('fails complete_contracts check when addresses missing', () => {
    const config = clone(MOCK_CONFIG);
    config.contracts.TradingVault = null;
    const result = evaluateRelayerRealModeReadiness(config);

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('complete_contracts'));
  });

  it('fails complete_contracts check when all addresses null', () => {
    const config = clone(MOCK_CONFIG);
    config.contracts = {
      TradingVault: null,
      Settlement: null,
      NonceManager: null,
      MarketRegistry: null,
      FeeManager: null,
      DelegateKeyRegistry: null,
    };
    const result = evaluateRelayerRealModeReadiness(config);

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('complete_contracts'));
  });

  it('fails chain_id_match when config chainId does not match event truth', () => {
    const config = clone(MOCK_CONFIG);
    config.chainId = '999';
    const result = evaluateRelayerRealModeReadiness(config);

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('chain_id_match'));
  });

  it('fails signatures_present when maker/taker signatures missing', () => {
    const result = evaluateRelayerRealModeReadiness({
      ...MOCK_CONFIG,
      fillPacket: { ...MOCK_FILL, makerSignature: null, takerSignature: null },
    });

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('signatures_present'));
  });

  it('fails market_enabled when market disabled', () => {
    const config = clone(MOCK_CONFIG);
    config.market.enabled = false;
    const result = evaluateRelayerRealModeReadiness(config);

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('market_enabled'));
  });

  it('fails fee_within_caps when fee exceeds hard cap', () => {
    const config = clone(MOCK_CONFIG);
    config.feeSchedule.withinCaps = false;
    const result = evaluateRelayerRealModeReadiness(config);

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('fee_within_caps'));
  });

  it('fails nonces_available when maker nonce is used', () => {
    const config = clone(MOCK_CONFIG);
    config.nonceCheck.makerNonceUsed = true;
    const result = evaluateRelayerRealModeReadiness(config);

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('nonces_available'));
  });

  it('fails nonces_available when taker nonce is cancelled', () => {
    const config = clone(MOCK_CONFIG);
    config.nonceCheck.takerNonceCancelled = true;
    const result = evaluateRelayerRealModeReadiness(config);

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('nonces_available'));
  });

  it('fails delegate_NO_WITHDRAW when delegate can withdraw', () => {
    const config = clone(MOCK_CONFIG);
    config.delegatePolicy.NO_WITHDRAW = false;
    config.delegatePolicy.delegateCanWithdraw = true;
    const result = evaluateRelayerRealModeReadiness(config);

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('delegate_NO_WITHDRAW'));
  });

  it('fails delegate_NO_ADMIN when delegate can admin', () => {
    const config = clone(MOCK_CONFIG);
    config.delegatePolicy.NO_ADMIN = false;
    config.delegatePolicy.delegateCanAdmin = true;
    const result = evaluateRelayerRealModeReadiness(config);

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('delegate_NO_ADMIN'));
  });

  it('fails slippage_bounds when slippage exceeded', () => {
    const config = clone(MOCK_CONFIG);
    config.slippageCheck.withinBounds = false;
    const result = evaluateRelayerRealModeReadiness(config);

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('slippage_bounds'));
  });

  it('fails order_amount_valid when order amount invalid', () => {
    const config = clone(MOCK_CONFIG);
    config.orderAmountCheck.valid = false;
    const result = evaluateRelayerRealModeReadiness(config);

    assert.equal(result.allowed, false);
    assert.ok(result.failedChecks.includes('order_amount_valid'));
  });

  it('returns ready when all checks pass', () => {
    const config = clone(MOCK_CONFIG);
    config.receiptWait = { enabled: true, maxWaitMs: 30000, pollingIntervalMs: 2000 };
    config.failureClassification = { retryableTimeout: true, terminalRevert: true, maxRetries: 3 };
    const result = evaluateRelayerRealModeReadiness(config);

    assert.equal(result.allowed, true);
    assert.equal(result.reason, 'real_mode_checks_passed');
    assert.equal(result.settlementMode, 'quai_contract');
    assert.equal(result.realQuaiTransactions, false);
    assert.equal(result.walletRequired, false);
    assert.equal(result.fundsMoved, false);
    assert.deepEqual(result.failedChecks, []);
    assert.equal(result.nextAction, 'separately-approved-wallet-and-broadcast-implementation-required');
  });

  it('preserves NO_WITHDRAW NO_ADMIN safety metadata in all results', () => {
    const testCases = [
      { settlementMode: 'mock' },
      { settlementMode: 'unknown' },
      { settlementMode: 'quai_contract' },
      MOCK_CONFIG,
    ];

    for (const config of testCases) {
      const result = evaluateRelayerRealModeReadiness(config);
      assert.ok(result.permissions?.includes('NO_WITHDRAW') || result.custody !== undefined, `permissions or custody present for ${JSON.stringify(config.settlementMode)}`);
      assert.equal(result.realQuaiTransactions, false);
      assert.equal(result.walletRequired, false);
      assert.equal(result.fundsMoved, false);
    }
  });

  it('reports all 14 failed checks when all inputs are absent', () => {
    const result = evaluateRelayerRealModeReadiness({
      settlementMode: 'quai_contract',
    });

    assert.equal(result.allowed, false);
    // Should fail on: explicit_approval, complete_contracts, chain_id_match,
    // signatures_present, market_enabled, fee_within_caps, nonces_available,
    // delegate_NO_WITHDRAW, delegate_NO_ADMIN, slippage_bounds, order_amount_valid,
    // receipt_wait, failure_classification
    assert.equal(result.failedChecks.length, REAL_MODE_REQUIRED_CHECKS.length);
  });
});
