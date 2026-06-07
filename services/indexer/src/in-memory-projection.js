const MOCK_SAFETY_NOTICE = 'Mock proof only: no real Quai transaction, no explorer URL, no funds moved.';
const NONCE_CANCELLATION_SAFETY_NOTICE = 'Owner-signed NonceManager cancellation proof: verify txHash, blockNumber, eventIndex, and explorerUrl against the NonceManager event.';
const FINAL_SETTLEMENT_EVENT = 'SETTLEMENT_CONFIRMED';
const NONCE_CANCELLATION_EVENTS = new Set(['NONCE_CANCEL_CONFIRMED', 'NONCE_RANGE_CANCEL_CONFIRMED']);
const MOCK_SETTLEMENT_MODE = 'mock';
const QUAI_CONTRACT_SETTLEMENT_MODE = 'quai_contract';
const MATCHER_LOCAL_NONCE_UNCHANGED = 'matcher-local-cancel-only-on-chain-nonce-unchanged';

const clone = (value) => JSON.parse(JSON.stringify(value));

const isMissing = (value) => value === undefined || value === null || value === '';

const missingFields = (event, fields) => fields.filter((field) => isMissing(event[field]));

const buildEventIdentity = (event) => {
  if (event.settlementMode === MOCK_SETTLEMENT_MODE) {
    return `mock:${event.mockSettlementReference}:${event.eventIndex}`;
  }

  return `quai_contract:${event.settlementTx}:${event.eventIndex}`;
};

const buildNonceCancellationEventIdentity = (event) => `quai_contract_nonce:${event.txHash}:${event.eventIndex}`;

const validateNonceCancellationEvent = (event) => {
  if (!NONCE_CANCELLATION_EVENTS.has(event.type)) {
    return {
      projected: false,
      reason: 'not_nonce_manager_contract_cancellation',
      eventType: event.type,
      nonceManager: MATCHER_LOCAL_NONCE_UNCHANGED,
    };
  }

  const commonMissing = missingFields(event, [
    'eventId',
    'source',
    'proofId',
    'action',
    'owner',
    'nonceManagerContract',
    'nonceManager',
    'custody',
    'permissions',
    'txHash',
    'blockNumber',
    'blockHash',
    'eventIndex',
    'explorerUrl',
  ]);
  if (commonMissing.length > 0) {
    return {
      projected: false,
      reason: 'invalid_nonce_cancellation_event',
      missingFields: commonMissing,
    };
  }

  if (event.type === 'NONCE_CANCEL_CONFIRMED' && isMissing(event.nonce)) {
    return {
      projected: false,
      reason: 'invalid_nonce_cancellation_event',
      missingFields: ['nonce'],
    };
  }

  if (event.type === 'NONCE_RANGE_CANCEL_CONFIRMED') {
    const missingRange = missingFields(event.nonceRange ?? {}, ['from', 'to']);
    if (missingRange.length > 0) {
      return {
        projected: false,
        reason: 'invalid_nonce_cancellation_event',
        missingFields: missingRange.map((field) => `nonceRange.${field}`),
      };
    }
  }

  return null;
};

const validateSettlementMode = (event) => {
  if (event.settlementMode === MOCK_SETTLEMENT_MODE) {
    const missing = missingFields(event, ['mockSettlementReference']);
    if (missing.length > 0) {
      return {
        projected: false,
        reason: 'invalid_mock_settlement_event',
        missingFields: missing,
      };
    }

    if (event.settlementTx !== null || event.blockNumber !== null || event.blockHash !== null || event.explorerUrl !== null) {
      return {
        projected: false,
        reason: 'invalid_mock_settlement_event',
        missingFields: ['settlementTx=null', 'blockNumber=null', 'blockHash=null', 'explorerUrl=null'],
      };
    }

    return null;
  }

  if (event.settlementMode === QUAI_CONTRACT_SETTLEMENT_MODE) {
    const missing = missingFields(event, ['settlementTx', 'blockNumber', 'blockHash', 'explorerUrl']);
    if (missing.length > 0) {
      return {
        projected: false,
        reason: 'invalid_quai_contract_settlement_event',
        missingFields: missing,
      };
    }

    return null;
  }

  return {
    projected: false,
    reason: 'unsupported_settlement_mode',
    settlementMode: event.settlementMode,
  };
};

const validateProjectableEvent = (event) => {
  if (event.type !== FINAL_SETTLEMENT_EVENT) {
    return {
      projected: false,
      reason: 'not_final_settlement',
      eventType: event.type,
    };
  }

  const commonMissing = missingFields(event, [
    'eventId',
    'source',
    'fillId',
    'tradeId',
    'orderHashes',
    'settlementMode',
    'eventIndex',
    'maker',
    'taker',
    'market',
    'price',
    'amount',
    'fees',
  ]);
  if (commonMissing.length > 0) {
    return {
      projected: false,
      reason: 'invalid_settlement_event',
      missingFields: commonMissing,
    };
  }

  return validateSettlementMode(event);
};

const rawProofEvent = (event) => ({
  eventId: event.eventId,
  type: event.type,
  source: event.source,
  fillId: event.fillId,
  settlementMode: event.settlementMode,
  mockSettlementReference: event.mockSettlementReference ?? null,
  settlementTx: event.settlementTx ?? null,
  blockNumber: event.blockNumber ?? null,
  blockHash: event.blockHash ?? null,
  eventIndex: event.eventIndex,
});

const projectFill = (event) => ({
  projectionType: 'IndexedFillProjection',
  fillId: event.fillId,
  tradeId: event.tradeId,
  marketId: event.market,
  makerOrderHash: event.orderHashes[0],
  takerOrderHash: event.orderHashes[1],
  maker: event.maker,
  taker: event.taker,
  price: event.price,
  amount: event.amount,
  makerFee: event.fees.maker,
  takerFee: event.fees.taker,
  settlementMode: event.settlementMode,
  settlementStatus: 'confirmed',
  sourceEventId: event.eventId,
});

const projectTrade = (event) => ({
  tradeId: event.tradeId,
  fillId: event.fillId,
  marketId: event.market,
  price: event.price,
  amount: event.amount,
  settlementStatus: 'confirmed',
  proofUrl: `/v1/proofs/trades/${event.tradeId}`,
});

const projectProof = (event) => ({
  tradeId: event.tradeId,
  fillId: event.fillId,
  orderHashes: clone(event.orderHashes),
  settlementMode: event.settlementMode,
  mockSettlementReference: event.mockSettlementReference ?? null,
  settlementTx: event.settlementTx ?? null,
  blockNumber: event.blockNumber ?? null,
  blockHash: event.blockHash ?? null,
  eventIndex: event.eventIndex,
  maker: event.maker,
  taker: event.taker,
  market: event.market,
  price: event.price,
  amount: event.amount,
  fees: clone(event.fees),
  explorerUrl: event.explorerUrl ?? null,
  safetyNotice: event.settlementMode === MOCK_SETTLEMENT_MODE
    ? MOCK_SAFETY_NOTICE
    : 'Quai contract proof: verify settlementTx, blockNumber, eventIndex, and explorerUrl against contract events.',
  rawEvent: rawProofEvent(event),
  createdFromEventId: event.eventId,
});

const projectNonceCancellationProof = (event) => ({
  proofType: 'NonceCancellationProof',
  proofId: event.proofId,
  action: event.action,
  owner: event.owner,
  nonce: event.nonce ?? null,
  nonceRange: event.nonceRange === null ? null : clone(event.nonceRange),
  nonceManagerContract: event.nonceManagerContract,
  nonceManager: event.nonceManager,
  custody: event.custody,
  permissions: clone(event.permissions),
  txHash: event.txHash,
  blockNumber: event.blockNumber,
  blockHash: event.blockHash,
  eventIndex: event.eventIndex,
  explorerUrl: event.explorerUrl,
  sourceEventId: event.eventId,
  safetyNotice: NONCE_CANCELLATION_SAFETY_NOTICE,
});

export const createInMemoryIndexerProjection = () => {
  const acceptedEventIdentities = new Set();
  const acceptedNonceCancellationEventIdentities = new Set();
  const fills = [];
  const trades = [];
  const proofs = new Map();
  const nonceCancellationProofs = new Map();

  return {
    projectSettlementEvent(inputEvent) {
      const event = clone(inputEvent);
      const validation = validateProjectableEvent(event);
      if (validation !== null) {
        return validation;
      }

      const eventIdentity = buildEventIdentity(event);
      if (acceptedEventIdentities.has(eventIdentity)) {
        return {
          projected: false,
          reason: 'duplicate_event',
          eventIdentity,
        };
      }

      acceptedEventIdentities.add(eventIdentity);
      fills.push(projectFill(event));
      trades.push(projectTrade(event));
      proofs.set(event.tradeId, projectProof(event));

      return {
        projected: true,
        eventIdentity,
        fillId: event.fillId,
        tradeId: event.tradeId,
      };
    },

    projectNonceCancellationEvent(inputEvent) {
      const event = clone(inputEvent);
      const validation = validateNonceCancellationEvent(event);
      if (validation !== null) {
        return validation;
      }

      const eventIdentity = buildNonceCancellationEventIdentity(event);
      if (acceptedNonceCancellationEventIdentities.has(eventIdentity)) {
        return {
          projected: false,
          reason: 'duplicate_nonce_cancellation_event',
          eventIdentity,
        };
      }

      acceptedNonceCancellationEventIdentities.add(eventIdentity);
      nonceCancellationProofs.set(event.proofId, projectNonceCancellationProof(event));

      return {
        projected: true,
        eventIdentity,
        proofId: event.proofId,
      };
    },

    listFills() {
      return clone(fills);
    },

    listTrades(marketId) {
      return clone(trades.filter((trade) => trade.marketId === marketId));
    },

    listProofs() {
      return clone(Array.from(proofs.values()));
    },

    getProof(tradeId) {
      return proofs.has(tradeId) ? clone(proofs.get(tradeId)) : null;
    },

    listNonceCancellationProofs() {
      return clone(Array.from(nonceCancellationProofs.values()));
    },

    getNonceCancellationProof(proofId) {
      return nonceCancellationProofs.has(proofId) ? clone(nonceCancellationProofs.get(proofId)) : null;
    },
  };
};
