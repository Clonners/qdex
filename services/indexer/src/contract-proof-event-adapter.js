export const PUBLIC_CONTRACT_PROOF_EVENT = 'TradeSettled';
export const CONTRACT_PROOF_EVENT_SOURCE = `quai-contract:${PUBLIC_CONTRACT_PROOF_EVENT}`;
export const FINAL_SETTLEMENT_EVENT = 'SETTLEMENT_CONFIRMED';
export const QUAI_CONTRACT_SETTLEMENT_MODE = 'quai_contract';
export const NONCE_CANCELLATION_PROOF_EVENTS = ['NonceCancelled', 'NonceRangeCancelled'];
export const NONCE_CANCEL_CONFIRMED_EVENT = 'NONCE_CANCEL_CONFIRMED';
export const NONCE_RANGE_CANCEL_CONFIRMED_EVENT = 'NONCE_RANGE_CANCEL_CONFIRMED';
export const MATCHER_LOCAL_NONCE_UNCHANGED = 'matcher-local-cancel-only-on-chain-nonce-unchanged';

const REQUIRED_QUAI_EVENT_EVIDENCE_FIELDS = [
  'contractAddress',
  'settlementTx',
  'blockNumber',
  'blockHash',
  'eventIndex',
  'explorerUrl',
];

const REQUIRED_TRADE_SETTLED_FIELDS = [
  'tradeId',
  'fillId',
  'marketId',
  'makerOrderHash',
  'takerOrderHash',
  'maker',
  'taker',
  'price',
  'baseAmount',
  'makerFee',
  'takerFee',
];

const REQUIRED_NONCE_CANCELLATION_EVIDENCE_FIELDS = [
  'contractAddress',
  'txHash',
  'blockNumber',
  'blockHash',
  'eventIndex',
  'explorerUrl',
];

const REQUIRED_NONCE_CANCELLED_FIELDS = ['user', 'nonce'];
const REQUIRED_NONCE_RANGE_CANCELLED_FIELDS = ['user', 'from', 'to'];

export const listPublicProofTriggerEvents = () => [PUBLIC_CONTRACT_PROOF_EVENT];
export const listNonceCancellationProofEvents = () => [...NONCE_CANCELLATION_PROOF_EVENTS];

const isMissing = (value) => value === undefined || value === null || value === '';
const missingFields = (record, fields) => fields.filter((field) => isMissing(record?.[field]));

const asString = (value) => (typeof value === 'bigint' ? value.toString() : String(value));

const contractEventId = ({ contractAddress, settlementTx, eventIndex }) => (
  `${QUAI_CONTRACT_SETTLEMENT_MODE}:${contractAddress}:${settlementTx}:${eventIndex}`
);

const nonceCancellationEventId = ({ contractAddress, txHash, eventIndex }) => (
  `${QUAI_CONTRACT_SETTLEMENT_MODE}_nonce:${contractAddress}:${txHash}:${eventIndex}`
);

const nonceCancellationProofId = ({ eventName, args, evidence }) => {
  if (eventName === 'NonceCancelled') {
    return `nonce-cancel:${args.user}:${asString(args.nonce)}:${evidence.txHash}:${evidence.eventIndex}`;
  }

  return `nonce-range-cancel:${args.user}:${asString(args.from)}-${asString(args.to)}:${evidence.txHash}:${evidence.eventIndex}`;
};

const rejectedNonceCancellationEvent = (eventName) => ({
  projected: false,
  reason: String(eventName).startsWith('matcher_local_')
    ? 'matcher_local_cancellation_not_nonce_manager_event'
    : 'not_nonce_cancellation_contract_event',
  eventName,
  nonceManager: MATCHER_LOCAL_NONCE_UNCHANGED,
  acceptedEventNames: listNonceCancellationProofEvents(),
});

export const adaptContractNonceCancellationEventToNonceProofEvent = ({ eventName, args, evidence }) => {
  if (!NONCE_CANCELLATION_PROOF_EVENTS.includes(eventName)) {
    return rejectedNonceCancellationEvent(eventName);
  }

  const missingEvidence = missingFields(evidence, REQUIRED_NONCE_CANCELLATION_EVIDENCE_FIELDS);
  if (missingEvidence.length > 0) {
    return {
      projected: false,
      reason: 'missing_nonce_cancellation_event_evidence',
      eventName,
      missingFields: missingEvidence,
    };
  }

  const requiredArgs = eventName === 'NonceCancelled'
    ? REQUIRED_NONCE_CANCELLED_FIELDS
    : REQUIRED_NONCE_RANGE_CANCELLED_FIELDS;
  const missingArgs = missingFields(args, requiredArgs);
  if (missingArgs.length > 0) {
    return {
      projected: false,
      reason: 'missing_nonce_cancellation_event_fields',
      eventName,
      missingFields: missingArgs,
    };
  }

  const isSingleNonce = eventName === 'NonceCancelled';
  const eventId = nonceCancellationEventId(evidence);
  const proofId = nonceCancellationProofId({ eventName, args, evidence });

  return {
    projected: true,
    event: {
      eventId,
      type: isSingleNonce ? NONCE_CANCEL_CONFIRMED_EVENT : NONCE_RANGE_CANCEL_CONFIRMED_EVENT,
      source: `quai-contract:${eventName}`,
      proofId,
      action: isSingleNonce ? 'cancelNonce' : 'cancelNonceRange',
      owner: args.user,
      nonce: isSingleNonce ? asString(args.nonce) : null,
      nonceRange: isSingleNonce ? null : {
        from: asString(args.from),
        to: asString(args.to),
      },
      nonceManagerContract: evidence.contractAddress,
      nonceManager: 'contract-event-truth',
      custody: 'non-custodial-no-withdrawal-authority',
      permissions: ['NO_WITHDRAW', 'NO_ADMIN'],
      txHash: evidence.txHash,
      blockNumber: evidence.blockNumber,
      blockHash: evidence.blockHash,
      eventIndex: evidence.eventIndex,
      explorerUrl: evidence.explorerUrl,
    },
  };
};

export const adaptContractProofEventToSettlementEvent = ({ eventName, args, evidence }) => {
  if (eventName !== PUBLIC_CONTRACT_PROOF_EVENT) {
    return {
      projected: false,
      reason: 'not_public_contract_proof_event',
      eventName,
      acceptedEventName: PUBLIC_CONTRACT_PROOF_EVENT,
    };
  }

  const missing = missingFields(evidence, REQUIRED_QUAI_EVENT_EVIDENCE_FIELDS);
  if (missing.length > 0) {
    return {
      projected: false,
      reason: 'missing_quai_contract_event_evidence',
      eventName,
      missingFields: missing,
    };
  }

  const missingTradeSettledFields = missingFields(args, REQUIRED_TRADE_SETTLED_FIELDS);
  if (missingTradeSettledFields.length > 0) {
    return {
      projected: false,
      reason: 'missing_trade_settled_event_fields',
      eventName,
      missingFields: missingTradeSettledFields,
    };
  }

  return {
    projected: true,
    event: {
      eventId: contractEventId(evidence),
      type: FINAL_SETTLEMENT_EVENT,
      source: CONTRACT_PROOF_EVENT_SOURCE,
      fillId: args.fillId,
      tradeId: args.tradeId,
      orderHashes: [args.makerOrderHash, args.takerOrderHash],
      settlementMode: QUAI_CONTRACT_SETTLEMENT_MODE,
      mockSettlementReference: null,
      settlementTx: evidence.settlementTx,
      blockNumber: evidence.blockNumber,
      blockHash: evidence.blockHash,
      eventIndex: evidence.eventIndex,
      maker: args.maker,
      taker: args.taker,
      market: args.marketId,
      price: asString(args.price),
      amount: asString(args.baseAmount),
      fees: {
        maker: asString(args.makerFee),
        taker: asString(args.takerFee),
      },
      explorerUrl: evidence.explorerUrl,
    },
  };
};
