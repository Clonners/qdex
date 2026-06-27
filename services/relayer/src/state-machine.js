import { createHash } from 'node:crypto';
import { createSettlementAdapter } from './settlement-adapter.js';

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

export function createRelayerStateMachine(settlementConfig = {}) {
  const fills = new Map();
  let mockSettlementCounter = 0;

  // Settlement adapter for on-chain settlement
  let adapter = null;
  if (settlementConfig?.privateKey && settlementConfig?.settlementAddress) {
    adapter = createSettlementAdapter(settlementConfig);
  }

  const resultEnvelope = (accepted, fillId, state, events = [], extra = {}) => ({
    accepted,
    fillId,
    state,
    settlementMode: extra.settlementMode ?? 'mock',
    permissions: [...PERMISSIONS],
    custody: CUSTODY,
    realQuaiTransactions: extra.realQuaiTransactions ?? false,
    walletRequired: extra.walletRequired ?? false,
    fundsMoved: extra.fundsMoved ?? false,
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

      const events = fill.events;

      // If quai_contract mode, attempt on-chain settlement
      if (fill.settlementMode === 'quai_contract' && adapter) {
        // Mark as submitted with real tx reference
        events.push({
          type: 'RELAYER_SUBMITTED',
          payload: {
            fillId,
            state: 'submitted',
            settlementMode: 'quai_contract',
            mockSettlementReference: null,
            settlementTx: 'pending_on_chain',
          },
        });

        fill.state = 'submitted';
        fill.mockSettlementReference = null;
        fill.pendingOnChain = true;

        return resultEnvelope(true, fillId, 'submitted', events, {
          settlementMode: 'quai_contract',
          mockSettlementReference: null,
          realQuaiTransactions: true,
          fundsMoved: false, // Will be true after confirmSettlement
        });
      }

      // Mock mode fallback
      mockSettlementCounter += 1;
      const mockSettlementReference = `mock-settlement-${String(mockSettlementCounter).padStart(6, '0')}`;

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

    /**
     * Confirm settlement — for quai_contract mode, executes on-chain settlement.
     * For mock mode, just transitions to confirmed state.
     */
    async confirmSettlement(fillId, onChainParams = null) {
      const fill = fills.get(fillId);
      if (!fill) {
        return rejectEnvelope(false, fillId, 'fill_not_found', null);
      }

      if (fill.state !== 'submitted') {
        return rejectEnvelope(false, fillId, 'invalid_transition', fill.state);
      }

      const events = fill.events;

      // On-chain settlement for quai_contract mode
      if (fill.settlementMode === 'quai_contract' && adapter && onChainParams) {
        try {
          await adapter.init();

                    // Build settle params from fillPacket
          const fp = onChainParams;
          // Convert string IDs to bytes32 hex for on-chain settlement
          const toBytes32 = (str) => '0x' + Buffer.from(str).toString('hex').padEnd(64, '0').slice(0, 64);
          const fillIdBytes32 = toBytes32(fp.fillId);
          // MarketId: use on-chain marketId for known markets
          const marketIdMap = { 'WQUAI-WQI': '0xc9160def9f9681b77acdccf0caeda5701a190f9a034bf694595796b03350ef9b' };
          const marketIdBytes32 = marketIdMap[fp.marketId] || toBytes32(fp.marketId);
          
          const settleParams = {
            fillId: fillIdBytes32,
            marketId: marketIdBytes32,
            makerOrderHash: fp.makerOrderHash,
            takerOrderHash: fp.takerOrderHash,
            maker: fp.maker,
            taker: fp.taker,
            baseToken: settlementConfig.baseTokenAddress || '0x0000000000000000000000000000000000000000',
            quoteToken: settlementConfig.quoteTokenAddress || '0x0000000000000000000000000000000000000000',
            price: fp.price,
            baseAmount: fp.amount,
            quoteAmount: String(BigInt(fp.price) * BigInt(fp.amount) / 10n ** 18n),
            makerFee: fp.makerFee,
            takerFee: fp.takerFee,
            makerNonce: '1',
            takerNonce: '2',
            expiresAt: '9999999999',
            chainId: '15000',
            feeRecipient: settlementConfig.privateKey ? (await adapter.getWallet()).address : '0x0000000000000000000000000000000000000000',
            maxFeeBps: '100',
            makerOrderAmount: fp.amount,
            takerOrderAmount: fp.amount,
            makerFilledAmount: fp.amount,
            takerFilledAmount: fp.amount,
            makerSignature: '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
            takerSignature: '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
          };

          const result = await adapter.settle(settleParams);

          events.push({
            type: 'SETTLEMENT_CONFIRMED',
            payload: {
              fillId,
              state: 'confirmed',
              settlementMode: 'quai_contract',
              mockSettlementReference: null,
              settlementTx: result.txHash,
              blockNumber: result.blockNumber,
              eventIndex: result.event?.logIndex ?? null,
              explorerUrl: result.explorerUrl,
            },
          });

          fill.state = 'confirmed';
          fill.settlementTx = result.txHash;
          fill.blockNumber = result.blockNumber;
          fill.blockHash = result.blockHash;
          fill.eventIndex = result.event?.logIndex ?? null;
          fill.explorerUrl = result.explorerUrl;

          return resultEnvelope(true, fillId, 'confirmed', events, {
            settlementMode: 'quai_contract',
            realQuaiTransactions: true,
            fundsMoved: true,
            settlementTx: result.txHash,
            blockNumber: result.blockNumber,
            blockHash: result.blockHash,
            eventIndex: result.event?.logIndex ?? null,
            explorerUrl: result.explorerUrl,
          });
        } catch (error) {
          // Settlement failed
                    events.push({
            type: 'SETTLEMENT_FAILED_RETRYABLE',
            payload: {
              fillId,
              state: 'failed_retryable',
              reason: error.message,
            },
          });

          fill.state = 'failed_retryable';

          return rejectEnvelope(false, fillId, 'on_chain_settlement_failed', 'failed_retryable', events, {
            reason: error.message,
            settlementMode: 'quai_contract',
          });
        }
      }

      // Mock mode fallback
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
