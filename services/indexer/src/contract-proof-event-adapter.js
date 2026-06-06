export const PUBLIC_CONTRACT_PROOF_EVENT = 'TradeSettled';
export const CONTRACT_PROOF_EVENT_SOURCE = `quai-contract:${PUBLIC_CONTRACT_PROOF_EVENT}`;
export const FINAL_SETTLEMENT_EVENT = 'SETTLEMENT_CONFIRMED';
export const QUAI_CONTRACT_SETTLEMENT_MODE = 'quai_contract';

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

export const listPublicProofTriggerEvents = () => [PUBLIC_CONTRACT_PROOF_EVENT];

const isMissing = (value) => value === undefined || value === null || value === '';
const missingFields = (record, fields) => fields.filter((field) => isMissing(record?.[field]));

const asString = (value) => (typeof value === 'bigint' ? value.toString() : String(value));

const contractEventId = ({ contractAddress, settlementTx, eventIndex }) => (
  `${QUAI_CONTRACT_SETTLEMENT_MODE}:${contractAddress}:${settlementTx}:${eventIndex}`
);

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
