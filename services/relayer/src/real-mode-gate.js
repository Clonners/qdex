// Real-mode readiness gate for the relayer.
// Expands the binary quai_contract approval gate into a comprehensive
// pre-submit checklist. Returns fail-closed readiness metadata.
// No wallet loading, signing, broadcast, RPC access, or transaction submission.

export const REAL_MODE_REQUIRED_CHECKS = Object.freeze([
  'explicit_approval',
  'complete_contracts',
  'chain_id_match',
  'signatures_present',
  'market_enabled',
  'fee_within_caps',
  'nonces_available',
  'delegate_NO_WITHDRAW',
  'delegate_NO_ADMIN',
  'slippage_bounds',
  'order_amount_valid',
  'receipt_wait',
  'failure_classification',
]);

const MOCK_MODE = 'mock';
const REAL_QUAI_MODE = 'quai_contract';

const CUSTODY = 'non-custodial-relayer-gate';
const PERMISSIONS = Object.freeze(['NO_WITHDRAW', 'NO_ADMIN']);

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

const requiredContractNames = Object.freeze([
  'TradingVault',
  'Settlement',
  'NonceManager',
  'MarketRegistry',
  'FeeManager',
  'DelegateKeyRegistry',
]);

// ── Check functions ──────────────────────────────────────────────────

const checkExplicitApproval = ({ approval = {} } = {}) => {
  if (approval.explicitApproval !== true) return 'approval.explicitApproval must be true';
  if (!hasText(approval.approvalId)) return 'approval.approvalId required';
  if (!hasText(approval.approvedBy)) return 'approval.approvedBy required';
  if (!hasText(approval.approvedAt)) return 'approval.approvedAt required';
  if (!hasText(approval.scope)) return 'approval.scope required';
  return null;
};

const checkCompleteContracts = ({ contracts = {} } = {}) => {
  const missing = requiredContractNames.filter((name) => !hasText(contracts[name]));
  if (missing.length > 0) {
    return `missing contract addresses: ${missing.join(', ')}`;
  }
  return null;
};

const checkChainIdMatch = ({ chainId, eventTruth = {} } = {}) => {
  if (!hasText(chainId)) return 'config chainId absent';
  if (!hasText(eventTruth.chainId)) return 'eventTruth chainId absent';
  if (chainId !== eventTruth.chainId) {
    return `chainId mismatch: config="${chainId}" vs eventTruth="${eventTruth.chainId}"`;
  }
  return null;
};

const checkSignaturesPresent = ({ fillPacket = {} } = {}) => {
  if (!hasText(fillPacket.makerSignature)) return 'makerSignature absent or empty';
  if (!hasText(fillPacket.takerSignature)) return 'takerSignature absent or empty';
  return null;
};

const checkMarketEnabled = ({ market = {} } = {}) => {
  if (!market.marketId) return 'marketId absent';
  if (market.enabled !== true) return `market "${market.marketId ?? 'unknown'}" not enabled`;
  return null;
};

const checkFeeWithinCaps = ({ feeSchedule = {} } = {}) => {
  if (feeSchedule.withinCaps !== true) {
    return `fee schedule outside caps (makerBps=${feeSchedule.makerFeeBps}, takerBps=${feeSchedule.takerFeeBps}, hardMax=${feeSchedule.hardMaxFeeBps})`;
  }
  return null;
};

const checkNoncesAvailable = ({ nonceCheck = {} } = {}) => {
  // Fail-closed: all four nonce fields must be explicitly present and false.
  const requiredNonces = ['makerNonceUsed', 'takerNonceUsed', 'makerNonceCancelled', 'takerNonceCancelled'];
  for (const field of requiredNonces) {
    if (nonceCheck[field] !== false) {
      return `nonceCheck.${field} must be explicitly false (got ${JSON.stringify(nonceCheck[field])})`;
    }
  }
  return null;
};

const checkDelegateNO_WITHDRAW = ({ delegatePolicy = {} } = {}) => {
  if (delegatePolicy.NO_WITHDRAW !== true) return 'delegate NO_WITHDRAW not enforced';
  if (delegatePolicy.delegateCanWithdraw !== false) return 'delegate can withdraw';
  return null;
};

const checkDelegateNO_ADMIN = ({ delegatePolicy = {} } = {}) => {
  if (delegatePolicy.NO_ADMIN !== true) return 'delegate NO_ADMIN not enforced';
  if (delegatePolicy.delegateCanAdmin !== false) return 'delegate can admin';
  return null;
};

const checkSlippageBounds = ({ slippageCheck = {} } = {}) => {
  if (slippageCheck.withinBounds !== true) return 'slippage bounds exceeded';
  return null;
};

const checkOrderAmountValid = ({ orderAmountCheck = {} } = {}) => {
  if (orderAmountCheck.valid !== true) return 'order amount invalid';
  return null;
};

const checkReceiptWait = ({ receiptWait = {} } = {}) => {
  if (receiptWait.enabled !== true) return 'receiptWait.enabled must be true';
  if (!Number.isSafeInteger(receiptWait.maxWaitMs) || receiptWait.maxWaitMs < 1) {
    return `receiptWait.maxWaitMs must be a positive integer (got ${JSON.stringify(receiptWait.maxWaitMs)})`;
  }
  if (!Number.isSafeInteger(receiptWait.pollingIntervalMs) || receiptWait.pollingIntervalMs < 1) {
    return `receiptWait.pollingIntervalMs must be a positive integer (got ${JSON.stringify(receiptWait.pollingIntervalMs)})`;
  }
  if (receiptWait.pollingIntervalMs > receiptWait.maxWaitMs) {
    return `receiptWait.pollingIntervalMs (${receiptWait.pollingIntervalMs}ms) must not exceed maxWaitMs (${receiptWait.maxWaitMs}ms)`;
  }
  return null;
};

const checkFailureClassification = ({ failureClassification = {} } = {}) => {
  if (failureClassification.retryableTimeout !== true) return 'failureClassification.retryableTimeout must be true';
  if (failureClassification.terminalRevert !== true) return 'failureClassification.terminalRevert must be true';
  if (!Number.isSafeInteger(failureClassification.maxRetries) || failureClassification.maxRetries < 1) {
    return `failureClassification.maxRetries must be >= 1 (got ${JSON.stringify(failureClassification.maxRetries)})`;
  }
  if (failureClassification.maxRetries > 10) {
    return `failureClassification.maxRetries must be <= 10 (got ${failureClassification.maxRetries})`;
  }
  return null;
};

const CHECK_MAP = {
  explicit_approval: checkExplicitApproval,
  complete_contracts: checkCompleteContracts,
  chain_id_match: checkChainIdMatch,
  signatures_present: checkSignaturesPresent,
  market_enabled: checkMarketEnabled,
  fee_within_caps: checkFeeWithinCaps,
  nonces_available: checkNoncesAvailable,
  delegate_NO_WITHDRAW: checkDelegateNO_WITHDRAW,
  delegate_NO_ADMIN: checkDelegateNO_ADMIN,
  slippage_bounds: checkSlippageBounds,
  order_amount_valid: checkOrderAmountValid,
  receipt_wait: checkReceiptWait,
  failure_classification: checkFailureClassification,
};

const SAFETY_NOTICE =
  'Real Quai relayer mode is approval-gated: this gate only validates readiness; it performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.';

const MOCK_SAFETY_NOTICE =
  'Mock mode is local-only: no real Quai transaction, no explorer URL, and no funds moved.';

// ── Public API ───────────────────────────────────────────────────────

export function evaluateRelayerRealModeReadiness(config = {}) {
  const { settlementMode } = config;

  // Mock mode — always passes, no real checks
  if (settlementMode === MOCK_MODE) {
    return {
      allowed: true,
      reason: 'mock_mode_local_only',
      settlementMode: MOCK_MODE,
      permissions: [...PERMISSIONS],
      custody: CUSTODY,
      realQuaiTransactions: false,
      walletRequired: false,
      fundsMoved: false,
      failedChecks: [],
      safetyNotice: MOCK_SAFETY_NOTICE,
    };
  }

  // Unknown mode
  if (settlementMode !== REAL_QUAI_MODE) {
    return {
      allowed: false,
      reason: 'unsupported_settlement_mode',
      settlementMode: settlementMode ?? null,
      supportedSettlementModes: [MOCK_MODE, REAL_QUAI_MODE],
      permissions: [...PERMISSIONS],
      custody: CUSTODY,
      realQuaiTransactions: false,
      walletRequired: false,
      fundsMoved: false,
      failedChecks: [],
      safetyNotice: 'Relayer settlement mode must be explicit; no implicit real Quai mode is allowed.',
    };
  }

  // quai_contract mode — run all checks
  const failedChecks = [];
  const checkFailures = {};

  for (const [checkName, checkFn] of Object.entries(CHECK_MAP)) {
    const failure = checkFn(config);
    if (failure) {
      failedChecks.push(checkName);
      checkFailures[checkName] = failure;
    }
  }

  if (failedChecks.length > 0) {
    return {
      allowed: false,
      reason: 'real_mode_checks_failed',
      settlementMode: REAL_QUAI_MODE,
      permissions: [...PERMISSIONS],
      custody: CUSTODY,
      realQuaiTransactions: false,
      walletRequired: false,
      fundsMoved: false,
      failedChecks,
      checkFailures,
      nextAction: 'resolve failed checks and re-evaluate',
      safetyNotice: SAFETY_NOTICE,
    };
  }

  // All checks passed — readiness confirmed but NO wallet/broadcast yet
  return {
    allowed: true,
    reason: 'real_mode_checks_passed',
    settlementMode: REAL_QUAI_MODE,
    permissions: [...PERMISSIONS],
    custody: CUSTODY,
    realQuaiTransactions: false,
    walletRequired: false,
    fundsMoved: false,
    failedChecks: [],
    checkFailures: {},
    nextAction: 'separately-approved-wallet-and-broadcast-implementation-required',
    safetyNotice: SAFETY_NOTICE,
  };
}
