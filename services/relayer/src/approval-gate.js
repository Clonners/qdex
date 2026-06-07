export const REQUIRED_QUAI_EVENT_TRUTH_FIELDS = Object.freeze([
  'settlementTx',
  'blockNumber',
  'blockHash',
  'eventIndex',
  'explorerUrl',
]);

const REAL_QUAI_MODE = 'quai_contract';
const MOCK_MODE = 'mock';

const GATE_SAFETY_NOTICE =
  'Real Quai relayer mode is approval-gated: this gate only validates explicit approval and event-truth readiness; it performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.';

const MOCK_SAFETY_NOTICE =
  'Mock mode is local-only: no real Quai transaction, no explorer URL, and no funds moved.';

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const hasPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

const requiredFieldListContains = (requiredFields, field) => {
  if (Array.isArray(requiredFields)) {
    return requiredFields.includes(field);
  }

  if (requiredFields && typeof requiredFields === 'object') {
    return requiredFields[field] === true;
  }

  return false;
};

const collectRealQuaiGateMissingFields = ({ approval = {}, eventTruth = {} }) => {
  const missingFields = [];

  if (approval.explicitApproval !== true) missingFields.push('approval.explicitApproval');
  if (!hasText(approval.approvalId)) missingFields.push('approval.approvalId');
  if (!hasText(approval.approvedBy)) missingFields.push('approval.approvedBy');
  if (!hasText(approval.approvedAt)) missingFields.push('approval.approvedAt');
  if (!hasText(approval.scope)) missingFields.push('approval.scope');

  if (eventTruth.proofTrigger !== 'TradeSettled') missingFields.push('eventTruth.proofTrigger');
  if (!hasText(eventTruth.settlementContract)) missingFields.push('eventTruth.settlementContract');
  if (!hasText(eventTruth.chainId)) missingFields.push('eventTruth.chainId');
  if (!hasText(eventTruth.zone)) missingFields.push('eventTruth.zone');
  if (!hasText(eventTruth.indexerSource)) missingFields.push('eventTruth.indexerSource');
  if (!hasPositiveInteger(eventTruth.finalityDepth)) missingFields.push('eventTruth.finalityDepth');

  for (const field of REQUIRED_QUAI_EVENT_TRUTH_FIELDS) {
    if (!requiredFieldListContains(eventTruth.requiredFields, field)) {
      missingFields.push(`eventTruth.requiredFields.${field}`);
    }
  }

  return missingFields;
};

const blockedRealQuaiGateResult = (missingFields) => ({
  allowed: false,
  reason: 'real_quai_approval_gate_blocked',
  settlementMode: REAL_QUAI_MODE,
  missingFields,
  requiredEventTruthFields: REQUIRED_QUAI_EVENT_TRUTH_FIELDS,
  realQuaiTransactions: false,
  walletRequired: false,
  custody: 'non-custodial-relayer-gate',
  safetyNotice:
    'Real Quai relayer mode requires explicit Clonners approval and complete event-truth inputs; this gate performs no wallet loading, signing, broadcast, RPC URL, or transaction submission.',
});

const readyRealQuaiGateResult = ({ approval }) => ({
  allowed: true,
  reason: 'real_quai_approval_gate_ready',
  settlementMode: REAL_QUAI_MODE,
  proofTrigger: 'TradeSettled',
  requiredEventTruthFields: REQUIRED_QUAI_EVENT_TRUTH_FIELDS,
  realQuaiTransactions: false,
  walletRequired: false,
  custody: 'non-custodial-relayer-gate',
  approvalId: approval.approvalId,
  nextAction: 'separately-approved-wallet-and-broadcast-implementation-required',
  safetyNotice: GATE_SAFETY_NOTICE,
});

export const evaluateRelayerSettlementModeGate = ({ settlementMode, approval = {}, eventTruth = {} } = {}) => {
  if (settlementMode === MOCK_MODE) {
    return {
      allowed: true,
      reason: 'mock_mode_local_only',
      settlementMode: MOCK_MODE,
      requiredEventTruthFields: [],
      realQuaiTransactions: false,
      walletRequired: false,
      custody: 'non-custodial-relayer-gate',
      safetyNotice: MOCK_SAFETY_NOTICE,
    };
  }

  if (settlementMode !== REAL_QUAI_MODE) {
    return {
      allowed: false,
      reason: 'unsupported_settlement_mode',
      settlementMode: settlementMode ?? null,
      supportedSettlementModes: [MOCK_MODE, REAL_QUAI_MODE],
      realQuaiTransactions: false,
      walletRequired: false,
      custody: 'non-custodial-relayer-gate',
      safetyNotice: 'Relayer settlement mode must be explicit; no implicit real Quai mode is allowed.',
    };
  }

  const missingFields = collectRealQuaiGateMissingFields({ approval, eventTruth });
  if (missingFields.length > 0) {
    return blockedRealQuaiGateResult(missingFields);
  }

  return readyRealQuaiGateResult({ approval });
};
