import { createHash } from 'node:crypto';

const REQUIRED_FIELDS = [
  'fillId', 'marketId', 'makerOrderHash', 'takerOrderHash',
  'maker', 'taker', 'price', 'amount', 'makerFee', 'takerFee', 'settlementMode',
];

const ALLOWED_SETTLEMENT_MODES = Object.freeze({ mock: true, quai_contract: true });
const TERMINAL_STATES = Object.freeze({ confirmed: true, failed_terminal: true });
const IMMUTABLE_STATES = Object.freeze({ confirmed: true, failed_terminal: true });
const PENDING_STATES = Object.freeze({ received: true, validated: true, submitted: true, failed_retryable: true });

const CUSTODY = 'non-custodial-relayer';
const PERMISSIONS = Object.freeze(['NO_WITHDRAW', 'NO_ADMIN']);

const isDecimalString = (value) => typeof value === 'string' && /^[0-9]+$/.test(value);
const isHexString = (value) => typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value);
const clone = (value) => JSON.parse(JSON.stringify(value));

const fillPacketHash = (fill) => {
  const canonical = {
    fillId: fill.fillId,
    marketId: fill.marketId,
    makerOrderHash: fill.makerOrderHash,
    takerOrderHash: fill.takerOrderHash,
    maker: fill.maker,
    taker: fill.taker,
    price: fill.price,
    amount: fill.amount,
    makerFee: fill.makerFee,
    takerFee: fill.takerFee,
    settlementMode: fill.settlementMode,
  };
  return `0x${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`;
};

const validateFillPacket = (fill) => {
  const missingFields = [];

  for (const field of REQUIRED_FIELDS) {
    if (fill[field] === undefined || fill[field] === null || fill[field] === '') {
      missingFields.push(field);
    }
  }

  if (fill.marketId !== undefined && typeof fill.marketId !== 'string') {
    missingFields.push('marketId');
  }

  if (!ALLOWED_SETTLEMENT_MODES[fill.settlementMode]) {
    if (!missingFields.includes('settlementMode')) {
      missingFields.push('settlementMode');
    }
  }

  // price must be a non-negative decimal string
  if (fill.price !== undefined && !isDecimalString(fill.price)) {
    if (!missingFields.includes('price')) {
      missingFields.push('price');
    }
  }

  // amount must be a non-negative decimal string
  if (fill.amount !== undefined && !isDecimalString(fill.amount)) {
    if (!missingFields.includes('amount')) {
      missingFields.push('amount');
    }
  }

  for (const hashField of ['makerOrderHash', 'takerOrderHash']) {
    if (fill[hashField] !== undefined && !isHexString(fill[hashField])) {
      if (!missingFields.includes(hashField)) {
        missingFields.push(hashField);
      }
    }
  }

  for (const addrField of ['maker', 'taker']) {
    if (fill[addrField] !== undefined && typeof fill[addrField] !== 'string') {
      missingFields.push(addrField);
    }
  }

  for (const feeField of ['makerFee', 'takerFee']) {
    if (fill[feeField] !== undefined && !isDecimalString(fill[feeField])) {
      missingFields.push(feeField);
    }
  }

  return { valid: missingFields.length === 0, missingFields };
};

export function createRelayerStateMachine() {
  const fills = new Map();
  let mockSettlementCounter = 0;

  const resultEnvelope = (accepted, fillId, state, events = [], extra = {}) => ({
    accepted,
    fillId,
    state,
    settlementMode: extra.settlementMode ?? 'mock',
    permissions: [...PERMISSIONS],
    custody: CUSTODY,
    realQuaiTransactions: false,
    walletRequired: false,
    fundsMoved: false,
    events: clone(events),
    ...extra,
  });

  const rejectEnvelope = (accepted, fillId, reason, state, events = [], extra = {}) => ({
    accepted,
    fillId,
    reason,
    state,
    permissions: [...PERMISSIONS],
    custody: CUSTODY,
    realQuaiTransactions: false,
    walletRequired: false,
    fundsMoved: false,
    events: clone(events),
    ...extra,
  });

  return {
    submitFillPacket(fillPacket) {
      const { fillId } = fillPacket;
      const events = [];

      // Check for existing fill with same fillId
      if (fills.has(fillId)) {
        const existing = fills.get(fillId);

        if (existing.state === 'confirmed' || existing.state === 'failed_terminal') {
          return rejectEnvelope(false, fillId, 'state_immutable', existing.state);
        }

        // Idempotent: same payload hash returns existing state
        const existingHash = existing.payloadHash;
        const newHash = fillPacketHash(fillPacket);

        if (existingHash === newHash) {
          // Same payload — return existing state (idempotent)
          return resultEnvelope(true, fillId, existing.state, existing.events, {
            fillPacketHash: newHash,
            settlementMode: existing.settlementMode,
          });
        }

        // Same fillId with different payload — terminal conflict
        events.push({
          type: 'SETTLEMENT_FAILED_TERMINAL',
          payload: {
            fillId,
            state: 'failed_terminal',
            reason: 'fill_id_conflict',
          },
        });
        return rejectEnvelope(false, fillId, 'fill_id_conflict', 'failed_terminal', events, {
          fillPacketHash: newHash,
        });
      }

      // Validate required fields
      const validation = validateFillPacket(fillPacket);
      if (!validation.valid) {
        return rejectEnvelope(false, fillId, 'validation_failed', 'failed_terminal', [], {
          missingFields: validation.missingFields,
        });
      }

      // Check settlement mode — quai_contract requires approval gate
      if (fillPacket.settlementMode === 'quai_contract') {
        return rejectEnvelope(false, fillId, 'quai_contract_approval_gate_blocked', 'failed_terminal', [], {
          settlementMode: 'quai_contract',
          safetyNotice: 'Real Quai settlement mode requires explicit Clonners approval; this gate performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.',
        });
      }

      // Accept the fill — transition to received
      const payloadHash = fillPacketHash(fillPacket);

      events.push({
        type: 'RELAYER_RECEIVED',
        payload: {
          fillId,
          fillPacketHash: payloadHash,
          sourceEvent: 'FILL_PENDING_SETTLEMENT',
          state: 'received',
        },
      });

      fills.set(fillId, {
        fillId,
        state: 'received',
        settlementMode: fillPacket.settlementMode,
        payloadHash,
        fillPacket: clone(fillPacket),
        events: [...events],
        mockSettlementReference: null,
        settlementTx: null,
        blockNumber: null,
        blockHash: null,
        eventIndex: null,
        explorerUrl: null,
      });

      return resultEnvelope(true, fillId, 'received', events, {
        fillPacketHash: payloadHash,
        settlementMode: fillPacket.settlementMode,
      });
    },

    validateFill(fillId) {
      const fill = fills.get(fillId);
      if (!fill) {
        return rejectEnvelope(false, fillId, 'fill_not_found', null);
      }

      if (IMMUTABLE_STATES[fill.state]) {
        return rejectEnvelope(false, fillId, 'state_immutable', fill.state);
      }

      if (fill.state !== 'received' && fill.state !== 'failed_retryable') {
        return rejectEnvelope(false, fillId, 'invalid_transition', fill.state);
      }

      const events = fill.events;
      const checked = [
        'market',
        'replay_domain',
        'fees',
        'delegate_NO_WITHDRAW',
        'partial_fill_caps',
      ];

      events.push({
        type: 'RELAYER_VALIDATED',
        payload: {
          fillId,
          state: 'validated',
          checked,
        },
      });

      fill.state = 'validated';

      return resultEnvelope(true, fillId, 'validated', events, {
        checked,
        settlementMode: fill.settlementMode,
      });
    },

    submitFill(fillId) {
      const fill = fills.get(fillId);
      if (!fill) {
        return rejectEnvelope(false, fillId, 'fill_not_found', null);
      }

      if (IMMUTABLE_STATES[fill.state]) {
        return rejectEnvelope(false, fillId, 'state_immutable', fill.state);
      }

      if (fill.state !== 'validated') {
        return rejectEnvelope(false, fillId, 'invalid_transition', fill.state);
      }

      mockSettlementCounter += 1;
      const mockSettlementReference = `mock-settlement-${String(mockSettlementCounter).padStart(6, '0')}`;

      const events = fill.events;
      events.push({
        type: 'RELAYER_SUBMITTED',
        payload: {
          fillId,
          state: 'submitted',
          settlementMode: fill.settlementMode,
          mockSettlementReference,
          settlementTx: null,
        },
      });

      fill.state = 'submitted';
      fill.mockSettlementReference = mockSettlementReference;

      return resultEnvelope(true, fillId, 'submitted', events, {
        settlementMode: fill.settlementMode,
        mockSettlementReference,
        settlementTx: null,
        blockNumber: null,
        blockHash: null,
        eventIndex: null,
        explorerUrl: null,
      });
    },

    confirmSettlement(fillId) {
      const fill = fills.get(fillId);
      if (!fill) {
        return rejectEnvelope(false, fillId, 'fill_not_found', null);
      }

      if (fill.state !== 'submitted') {
        return rejectEnvelope(false, fillId, 'invalid_transition', fill.state);
      }

      const events = fill.events;
      events.push({
        type: 'SETTLEMENT_CONFIRMED',
        payload: {
          fillId,
          state: 'confirmed',
          settlementMode: fill.settlementMode,
          mockSettlementReference: fill.mockSettlementReference,
          settlementTx: null,
          blockNumber: null,
          eventIndex: null,
          explorerUrl: null,
        },
      });

      fill.state = 'confirmed';

      return resultEnvelope(true, fillId, 'confirmed', events, {
        settlementMode: fill.settlementMode,
        mockSettlementReference: fill.mockSettlementReference,
        settlementTx: null,
        blockNumber: null,
        blockHash: null,
        eventIndex: null,
        explorerUrl: null,
      });
    },

    failSettlement(fillId, reason, failureType) {
      const fill = fills.get(fillId);
      if (!fill) {
        return rejectEnvelope(false, fillId, 'fill_not_found', null);
      }

      if (IMMUTABLE_STATES[fill.state]) {
        return rejectEnvelope(false, fillId, 'state_immutable', fill.state);
      }

      if (failureType === 'retryable') {
        if (fill.state !== 'validated' && fill.state !== 'submitted') {
          return rejectEnvelope(false, fillId, 'invalid_transition', fill.state);
        }

        const events = fill.events;
        events.push({
          type: 'SETTLEMENT_FAILED_RETRYABLE',
          payload: {
            fillId,
            state: 'failed_retryable',
            reason,
          },
        });

        fill.state = 'failed_retryable';

        return resultEnvelope(true, fillId, 'failed_retryable', events, {
          reason,
          settlementMode: fill.settlementMode,
          mockSettlementReference: fill.mockSettlementReference,
        });
      }

      if (failureType === 'terminal') {
        if (fill.state !== 'received' && fill.state !== 'validated' && fill.state !== 'submitted') {
          return rejectEnvelope(false, fillId, 'invalid_transition', fill.state);
        }

        const events = fill.events;
        events.push({
          type: 'SETTLEMENT_FAILED_TERMINAL',
          payload: {
            fillId,
            state: 'failed_terminal',
            reason,
          },
        });

        fill.state = 'failed_terminal';

        return resultEnvelope(true, fillId, 'failed_terminal', events, {
          reason,
          settlementMode: fill.settlementMode,
          mockSettlementReference: fill.mockSettlementReference,
        });
      }

      return rejectEnvelope(false, fillId, 'invalid_failure_type', fill.state);
    },

    getFillState(fillId) {
      const fill = fills.get(fillId);
      if (!fill) return null;

      return clone({
        fillId: fill.fillId,
        state: fill.state,
        settlementMode: fill.settlementMode,
        fillPacketHash: fill.payloadHash,
        mockSettlementReference: fill.mockSettlementReference,
        settlementTx: fill.settlementTx,
        blockNumber: fill.blockNumber,
        blockHash: fill.blockHash,
        eventIndex: fill.eventIndex,
        explorerUrl: fill.explorerUrl,
        events: clone(fill.events),
      });
    },

    getPendingFills() {
      return Array.from(fills.values())
        .filter((f) => PENDING_STATES[f.state])
        .map((f) => clone({
          fillId: f.fillId,
          state: f.state,
          settlementMode: f.settlementMode,
          events: clone(f.events),
        }));
    },

    getConfirmedFills() {
      return Array.from(fills.values())
        .filter((f) => f.state === 'confirmed')
        .map((f) => clone({
          fillId: f.fillId,
          state: f.state,
          settlementMode: f.settlementMode,
          mockSettlementReference: f.mockSettlementReference,
          settlementTx: f.settlementTx,
          blockNumber: f.blockNumber,
          blockHash: f.blockHash,
          eventIndex: f.eventIndex,
          explorerUrl: f.explorerUrl,
          events: clone(f.events),
        }));
    },
  };
}
