import { createHash } from 'node:crypto';

import { createMatchingEngine } from '../../matching-engine/src/index.js';
import { createRelayerStateMachine } from '../../relayer/src/state-machine.js';
import { createInMemoryIndexerProjection } from '../../indexer/src/in-memory-projection.js';
import { createListingReviewQueue } from './listing-review-queue.js';
import { createInMemoryProofService } from '../../proof-service/src/in-memory-proof-service.js';
import { calculateFee, getFeeSchedule } from './fee-policy.js';

export const MARKET_ID = 'WQUAI-WQI';
export const CUSTODY_NOTE = 'non-custodial-no-withdrawal-authority';
export const INDEXER_SOURCE = 'in-memory-indexer-projection';
export const MOCK_VAULT_PROJECTION_SOURCE = 'mock-vault-projection';
export const MOCK_VAULT_BALANCE_SAFETY_NOTICE = 'Mock vault projection only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.';
export const MOCK_ACCOUNT_OVERVIEW_SOURCE = 'mock-account-overview';
export const MOCK_ACCOUNT_OVERVIEW_SAFETY_NOTICE = 'Mock account overview only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.';

const MOCK_VAULT_BALANCE_PROJECTION = {
  balances: [],
  source: MOCK_VAULT_PROJECTION_SOURCE,
  custody: 'non-custodial-contract-vault',
  permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
  withdrawalAuthority: 'owner-wallet-only',
  settlementMode: 'mock',
  realQuaiTransactions: false,
  walletRequired: false,
  safetyNotice: MOCK_VAULT_BALANCE_SAFETY_NOTICE,
};

const CANCELLATION_NONCE_NOTE = 'matcher-local-cancel-only-on-chain-nonce-unchanged';
const CANCELLATION_MESSAGE = 'Mock cancellation removes only matcher-open quantity and does not cancel the on-chain nonce; user nonce cancellation must be signed through NonceManager later.';
const CANCEL_ORDER_PERMISSIONS = ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN'];
const CANCEL_ALL_PERMISSIONS = ['CANCEL_ALL', 'CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN'];
const MOCK_EPOCH_SECONDS = 1780000000;
const ALLOWED_SIDES = new Set(['buy', 'sell']);
const ALLOWED_TYPES = new Set(['limit', 'market_ioc']);
const ALLOWED_TIME_IN_FORCE = new Set(['GTC', 'IOC', 'FOK', 'POST_ONLY']);
const ALLOWED_VAULT_TOKENS = new Set(['WQUAI', 'WQI', 'USDT']);
const REQUIRED_ORDER_FIELDS = [
  'marketId',
  'side',
  'type',
  'baseToken',
  'quoteToken',
  'amount',
  'price',
  'timeInForce',
  'maxSlippageBps',
  'owner',
  'delegate',
  'nonce',
  'expiresAt',
  'chainId',
  'settlementContract',
  'signature',
];

const MOCK_VAULT_OPERATION_SAFETY_NOTICE = 'Mock vault operation only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.';
const DEPOSIT_PERMISSIONS = ['DEPOSIT', 'NO_WITHDRAW', 'NO_ADMIN'];
const WITHDRAW_PERMISSIONS = ['WITHDRAW', 'NO_DEPOSIT', 'NO_ADMIN'];

const canonicalOrder = (order) => ({
  marketId: order.marketId,
  side: order.side,
  type: order.type,
  baseToken: order.baseToken,
  quoteToken: order.quoteToken,
  amount: order.amount,
  price: order.price,
  timeInForce: order.timeInForce,
  maxSlippageBps: order.maxSlippageBps,
  owner: order.owner,
  delegate: order.delegate,
  nonce: order.nonce,
  expiresAt: order.expiresAt,
  chainId: order.chainId,
  settlementContract: order.settlementContract,
});

const clone = (value) => JSON.parse(JSON.stringify(value));

export const createMockVaultBalanceProjection = (balances = []) => clone({
  balances,
  source: MOCK_VAULT_PROJECTION_SOURCE,
  custody: 'non-custodial-contract-vault',
  permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
  withdrawalAuthority: 'owner-wallet-only',
  settlementMode: 'mock',
  realQuaiTransactions: false,
  walletRequired: false,
  safetyNotice: MOCK_VAULT_BALANCE_SAFETY_NOTICE,
});

const MOCK_OPEN_ORDERS_PROJECTION = {
  orders: [],
  source: 'mock-order-projection',
  projectionType: 'LocalOrderProjection',
  custody: 'non-custodial-no-withdrawal-authority',
  permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
  matcherLocalOnly: true,
  settlementMode: 'mock',
  settlementTx: null,
  blockNumber: null,
  blockHash: null,
  eventIndex: null,
  explorerUrl: null,
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  safetyNotice: 'Mock open orders only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.',
};

export const createMockOpenOrdersEnvelope = (orders = []) => ({
  ...clone(MOCK_OPEN_ORDERS_PROJECTION),
  orders: clone(orders),
});

export const createMockAccountOverview = ({
  orders = [],
  fills = [],
  balances = [],
  projectionSource = INDEXER_SOURCE,
} = {}) => ({
  account: null,
  source: MOCK_ACCOUNT_OVERVIEW_SOURCE,
  projectionType: 'LocalAccountOverviewProjection',
  custody: 'non-custodial-contract-vault',
  session: {
    mode: 'mock-local-no-wallet-session',
    authenticated: false,
    walletRequired: false,
  },
  permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
  balances: createMockVaultBalanceProjection(balances),
  orders: {
    open: clone(orders),
    source: 'mock-order-projection',
    matcherLocalOnly: true,
  },
  fills: {
    items: clone(fills),
    source: projectionSource,
    projectionType: 'IndexedFillProjection',
    confirmedOnly: true,
  },
  settlementMode: 'mock',
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  safety: {
    noWalletLoading: true,
    noRpcUrlAccess: true,
    noSigning: true,
    noBroadcast: true,
    noDeploys: true,
    noTransactionSubmission: true,
    noFundsMovement: true,
    delegateCanWithdraw: false,
    delegateCanAdmin: false,
    notice: MOCK_ACCOUNT_OVERVIEW_SAFETY_NOTICE,
  },
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isDecimalString = (value) => typeof value === 'string' && /^[0-9]+$/.test(value);
const isPositiveDecimalString = (value) => isDecimalString(value) && BigInt(value) > 0n;
const paddedId = (prefix, value) => `${prefix}-${String(value).padStart(6, '0')}`;
const streamChannelsForMutation = (fills) => {
  const channels = [`market.${MARKET_ID}.depth`, 'orders'];
  if (fills.length > 0) {
    channels.push(`market.${MARKET_ID}.trades`, 'fills', 'settlements', 'global.tickers');
  }
  return channels;
};
const streamChannelsForCancellation = () => [`market.${MARKET_ID}.depth`, 'orders'];

const compareRestingOrders = (side) => (left, right) => {
  const leftPrice = BigInt(left.price);
  const rightPrice = BigInt(right.price);

  if (leftPrice !== rightPrice) {
    if (side === 'buy') {
      return leftPrice > rightPrice ? -1 : 1;
    }

    return leftPrice < rightPrice ? -1 : 1;
  }

  return left.acceptedSequence - right.acceptedSequence;
};

export const createOrderHash = (order) => `0x${createHash('sha256')
  .update(JSON.stringify(canonicalOrder(order)))
  .digest('hex')}`;

const rejectOrder = (reason, message, extra = {}) => ({
  accepted: false,
  statusCode: 400,
  body: {
    error: 'order_rejected',
    reason,
    message,
    custody: CUSTODY_NOTE,
    ...extra,
  },
});

const validateOrder = (order) => {
  if (!isObject(order)) {
    return rejectOrder('missing_order', 'POST /v1/orders requires a JSON body with an order object.');
  }

  const missingFields = REQUIRED_ORDER_FIELDS.filter((field) => order[field] === undefined || order[field] === null || order[field] === '');
  if (missingFields.length > 0) {
    return rejectOrder('missing_required_fields', 'SignedOrder is missing replay-safe required fields.', { missingFields });
  }

  if (order.marketId !== MARKET_ID) {
    return rejectOrder('market_disabled', 'Only the WQUAI-WQI mock market is enabled for the MVP slice.');
  }

  if (!ALLOWED_SIDES.has(order.side)) {
    return rejectOrder('invalid_side', 'Order side must be buy or sell.');
  }

  if (!ALLOWED_TYPES.has(order.type)) {
    return rejectOrder('invalid_type', 'Order type must be limit or market_ioc.');
  }

  if (!ALLOWED_TIME_IN_FORCE.has(order.timeInForce)) {
    return rejectOrder('invalid_time_in_force', 'Unsupported timeInForce value.');
  }

  if (!isPositiveDecimalString(order.amount) || !isPositiveDecimalString(order.price) || !isDecimalString(order.nonce)) {
    return rejectOrder('precision_or_min_amount_failed', 'amount, price, and nonce must be positive decimal strings where applicable.');
  }

  if (!Number.isInteger(order.maxSlippageBps) || order.maxSlippageBps < 0 || order.maxSlippageBps > 10000) {
    return rejectOrder('invalid_slippage_bound', 'maxSlippageBps must be an integer between 0 and 10000.');
  }

  if (order.type === 'market_ioc' && (order.timeInForce !== 'IOC' || order.maxSlippageBps <= 0)) {
    return rejectOrder('market_ioc_requires_slippage_bound', 'market_ioc orders must be IOC limit orders with signed slippage protection.');
  }

  if (!Number.isInteger(order.expiresAt) || order.expiresAt <= MOCK_EPOCH_SECONDS) {
    return rejectOrder('order_expired', 'Order expiry must be after the deterministic mock matcher clock.');
  }

  if (!Number.isInteger(order.chainId) || order.chainId < 0 || typeof order.settlementContract !== 'string') {
    return rejectOrder('missing_replay_domain', 'chainId and settlementContract are required replay-domain fields.');
  }

  if (!isObject(order.signature) || order.signature.scheme !== 'mock' || typeof order.signature.signer !== 'string' || typeof order.signature.value !== 'string') {
    return rejectOrder('invalid_signature', 'MVP orders require a mock signature with signer and value.');
  }

  if (order.signature.signer !== order.owner && order.signature.signer !== order.delegate) {
    return rejectOrder('invalid_signature', 'Signature signer must be the owner wallet or approved delegate.');
  }

  return { accepted: true };
};

const canRest = (order) => order.type === 'limit' && order.timeInForce !== 'IOC' && order.timeInForce !== 'FOK';
const hasOpenQuantity = (order) => (order.status === 'open' || order.status === 'partially_filled') && BigInt(order.remainingAmount) > 0n;
const crosses = (incoming, resting) => (
  incoming.side === 'buy'
    ? BigInt(incoming.price) >= BigInt(resting.price)
    : BigInt(resting.price) >= BigInt(incoming.price)
);

const applyFill = (order, amount) => {
  const filledAmount = BigInt(order.filledAmount) + BigInt(amount);
  const remainingAmount = BigInt(order.remainingAmount) - BigInt(amount);

  order.filledAmount = filledAmount.toString();
  order.remainingAmount = remainingAmount.toString();
  order.status = remainingAmount === 0n ? 'filled' : 'partially_filled';
};

const publicOrder = ({ acceptedSequence, signedOrder, ...order }) => clone(order);
const bookOrder = (order) => ({
  orderHash: order.orderHash,
  price: order.price,
  amount: order.amount,
  remainingAmount: order.remainingAmount,
  owner: order.owner,
});

export const createMockDexState = ({
  indexer = createInMemoryIndexerProjection(),
  listingReviewQueue = createListingReviewQueue(),
  proofService = createInMemoryProofService({ indexer }),
  settlementConfig,
  vaultAdapter = null,
} = {}) => {
  // Matching engine — deterministic price-time priority matching
  const engine = createMatchingEngine();

  // Relayer — fill settlement state machine (received → validated → submitted → confirmed)
  // Wire settlement adapter for on-chain settlement when config is provided
  const relayer = createRelayerStateMachine(settlementConfig);

  // Determine settlement mode: quai_contract when adapter is configured, mock otherwise
  const hasOnChainConfig = !!(settlementConfig && settlementConfig.privateKey && settlementConfig.settlementAddress);
  const activeSettlementMode = hasOnChainConfig ? 'quai_contract' : 'mock';

  // Internal state for stream listeners and settlement sequencing
  const streamListeners = new Set();
  let fillSequence = 0;
  let tradeSequence = 0;

  const emitStreamUpdate = ({ fills = [], reason, channels, ...metadata }) => {
    const streamEvent = {
      reason: reason ?? (fills.length > 0 ? 'mock_settlement_confirmed' : 'orderbook_changed'),
      marketId: MARKET_ID,
      channels: channels ?? streamChannelsForMutation(fills),
      ...metadata,
    };

    for (const listener of streamListeners) {
      listener(streamEvent);
    }
  };

  const projectSettlementEvent = async (fillPacket) => {
    // Route FillPacket through relayer state machine: received → validated → submitted → confirmed
    const relayerSubmit = relayer.submitFillPacket(fillPacket);
    if (!relayerSubmit.accepted) {
      return null;
    }

    const relayerValidate = relayer.validateFill(fillPacket.fillId);
    if (!relayerValidate.accepted) {
      return null;
    }

    const relayerSubmitFill = relayer.submitFill(fillPacket.fillId);
    if (!relayerSubmitFill.accepted) {
      return null;
    }

    const relayerConfirm = await relayer.confirmSettlement(fillPacket.fillId, fillPacket);
    if (!relayerConfirm.accepted) {
      return null;
    }

    // Relayer confirmed — project settlement event to indexer
    fillSequence += 1;
    tradeSequence += 1;

    const eventId = paddedId('event', fillSequence);
    const tradeId = paddedId('trade', tradeSequence);
    const eventIndex = fillSequence - 1;
    const mockSettlementReference = relayerConfirm.mockSettlementReference ?? `mock-settlement-${fillPacket.fillId}`;

    const settlementEvent = {
      eventId,
      type: 'SETTLEMENT_CONFIRMED',
      source: 'mock-settlement',
      fillId: fillPacket.fillId,
      tradeId,
      orderHashes: [fillPacket.makerOrderHash, fillPacket.takerOrderHash],
      settlementMode: activeSettlementMode,
      mockSettlementReference: activeSettlementMode === 'mock' ? mockSettlementReference : null,
      settlementTx: relayerConfirm.settlementTx ?? null,
      blockNumber: relayerConfirm.blockNumber ?? null,
      blockHash: relayerConfirm.blockHash ?? null,
      eventIndex: relayerConfirm.eventIndex ?? eventIndex,
      maker: fillPacket.maker,
      taker: fillPacket.taker,
      market: fillPacket.marketId,
      price: fillPacket.price,
      amount: fillPacket.amount,
      fees: {
        maker: fillPacket.makerFee ?? '0',
        taker: fillPacket.takerFee ?? '0',
      },
      explorerUrl: relayerConfirm.explorerUrl ?? null,
    };

    const projectionResult = indexer.projectSettlementEvent(settlementEvent);
    if (!projectionResult.projected) {
      return null;
    }

    return indexer.listFills().find((fill) => fill.fillId === fillPacket.fillId) ?? null;
  };

  const cancellationBody = ({ cancelledOrders, permissions, filters, orderHash }) => ({
    cancelled: cancelledOrders.length > 0,
    cancelledCount: cancelledOrders.length,
    ...(orderHash === undefined ? {} : { orderHash }),
    cancelledOrders,
    ...(filters === undefined ? {} : { filters }),
    source: 'mock-matching-engine',
    custody: CUSTODY_NOTE,
    nonceManager: CANCELLATION_NONCE_NOTE,
    permissions,
    message: CANCELLATION_MESSAGE,
  });

  const cancellationStreamUpdate = ({ cancelledOrders, permissions, reason, filters }) => ({
    fills: [],
    reason,
    channels: streamChannelsForCancellation(),
    source: 'mock-matching-engine',
    custody: CUSTODY_NOTE,
    nonceManager: CANCELLATION_NONCE_NOTE,
    permissions,
    cancelledOrderHashes: cancelledOrders.map((order) => order.orderHash),
    ...(filters === undefined ? {} : { filters }),
    message: CANCELLATION_MESSAGE,
  });

  return {
    projectionSource: INDEXER_SOURCE,

    async submitOrder(order) {
      const validation = validateOrder(order);
      if (!validation.accepted) {
        return validation;
      }

      // Delegate to matching engine — deterministic price-time priority matching
      const engineResult = engine.submitOrder(order);
      if (!engineResult.accepted) {
        return engineResult;
      }

      // Route engine fills through relayer → indexer pipeline
      const projectedFills = [];
      const { makerFeeBps, takerFeeBps } = getFeeSchedule();

      for (const fillPacket of engineResult.body.fills ?? []) {
        // Calculate fees from FeeManager schedule
        const makerFee = calculateFee(fillPacket.price, fillPacket.amount, makerFeeBps);
        const takerFee = calculateFee(fillPacket.price, fillPacket.amount, takerFeeBps);

        // Ensure relayer-required fields
        const fillForRelayer = {
          ...fillPacket,
          makerFee,
          takerFee,
          settlementMode: activeSettlementMode,
        };
        const projected = await projectSettlementEvent(fillForRelayer);
        if (projected) {
          projectedFills.push(projected);
        }
      }

      emitStreamUpdate({ fills: projectedFills });

      return {
        accepted: true,
        statusCode: 201,
        body: {
          ...engineResult.body,
          fills: projectedFills,
          source: 'mock-matching-engine',
          settlement: projectedFills.length > 0 ? 'mock-settlement-confirmed' : 'awaiting-cross',
        },
      };
    },

    listOrders() {
      return engine.listOrders();
    },

    cancelOrder(orderHash) {
      const engineResult = engine.cancelOrder(orderHash);

      if (engineResult.statusCode === 404 || engineResult.statusCode === 409) {
        return {
          statusCode: engineResult.statusCode,
          body: {
            error: engineResult.body.error,
            orderHash,
            ...(engineResult.body.status ? { status: engineResult.body.status } : {}),
            source: 'mock-matching-engine',
            custody: CUSTODY_NOTE,
            nonceManager: CANCELLATION_NONCE_NOTE,
            permissions: CANCEL_ORDER_PERMISSIONS,
            message: engineResult.body.message ?? 'Cancellation failed.',
          },
        };
      }

      emitStreamUpdate(cancellationStreamUpdate({
        cancelledOrders: engineResult.body.cancelledOrders ?? [],
        permissions: CANCEL_ORDER_PERMISSIONS,
        reason: 'matcher_local_order_cancelled',
      }));

      return engineResult;
    },

    cancelAll(options = {}) {
      const engineResult = engine.cancelAll(options);

      if (engineResult.body.cancelledCount > 0) {
        emitStreamUpdate(cancellationStreamUpdate({
          cancelledOrders: engineResult.body.cancelledOrders ?? [],
          permissions: CANCEL_ALL_PERMISSIONS,
          reason: 'matcher_local_orders_cancelled',
          filters: engineResult.body.filters,
        }));
      }

      return engineResult;
    },

    listFills() {
      return indexer.listFills();
    },

    // Relayer state accessors — settlement lifecycle visibility
    getRelayerFillState(fillId) {
      return relayer.getFillState(fillId);
    },

    getSettlements() {
      const pending = relayer.getPendingFills();
      const confirmed = relayer.getConfirmedFills();
      const all = [...confirmed, ...pending];

      return {
        status: 'active',
        settlementMode: 'mock',
        fills: all.map((fill) => ({
          fillId: fill.fillId,
          status: fill.state,
          settlementMode: fill.settlementMode,
        })),
      };
    },

    getRelayerPendingFills() {
      return relayer.getPendingFills();
    },

    getRelayerConfirmedFills() {
      return relayer.getConfirmedFills();
    },

    getRelayerFills() {
      const pending = relayer.getPendingFills();
      const confirmed = relayer.getConfirmedFills();
      return [...confirmed, ...pending];
    },

    getOpenOrders() {
      // Return all open orders from the matching engine
      return engine.getOpenOrders() || [];
    },

    getRecentTrades(marketId = MARKET_ID, limit = 20) {
      const fills = indexer.listFills().filter(f => f.marketId === marketId);
      return fills.slice(-limit);
    },

    submitListingRequest(request) {
      return listingReviewQueue.enqueue(request);
    },

    decideListingRequest(requestId, decision) {
      return listingReviewQueue.decide(requestId, decision);
    },

    listListingRequests() {
      return listingReviewQueue.list();
    },

    listTrades(marketId) {
      return indexer.listTrades(marketId);
    },

    getTradeProof(tradeId) {
      return proofService.getTradeProof(tradeId);
    },

    getProof(tradeId) {
      const result = proofService.getTradeProof(tradeId);
      return result.statusCode === 200 ? clone(result.body.proof) : null;
    },

    listProofs() {
      return indexer.listProofs();
    },

    getOrderbook(marketId) {
      return engine.getOrderbook(marketId);
    },

    listVaultBalances(owner) {
      return indexer.listVaultBalances(owner);
    },

    listDeposits(owner) {
      return indexer.listDeposits(owner);
    },

    listWithdrawals(owner) {
      return indexer.listWithdrawals(owner);
    },

    // Vault adapter for real on-chain vault operations
    vaultAdapter,

    subscribeStreamUpdates(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('subscribeStreamUpdates requires a listener function.');
      }

      streamListeners.add(listener);
      return () => {
        streamListeners.delete(listener);
      };
    },

    deposit({ owner, token, amount } = {}) {
      if (!owner || typeof owner !== 'string' || owner.length < 10) {
        return {
          accepted: false,
          statusCode: 400,
          body: {
            error: 'vault_deposit_rejected',
            reason: 'invalid_owner',
            message: 'Owner address is required for vault deposit.',
            custody: CUSTODY_NOTE,
            permissions: DEPOSIT_PERMISSIONS,
            settlementMode: 'mock',
            realQuaiTransactions: false,
            walletRequired: false,
            fundsMoved: false,
            safetyNotice: MOCK_VAULT_OPERATION_SAFETY_NOTICE,
          },
        };
      }

      if (!token || !ALLOWED_VAULT_TOKENS.has(token)) {
        return {
          accepted: false,
          statusCode: 400,
          body: {
            error: 'vault_deposit_rejected',
            reason: 'unsupported_token',
            message: `Token must be one of: ${Array.from(ALLOWED_VAULT_TOKENS).join(', ')}.`,
            custody: CUSTODY_NOTE,
            permissions: DEPOSIT_PERMISSIONS,
            settlementMode: 'mock',
            realQuaiTransactions: false,
            walletRequired: false,
            fundsMoved: false,
            safetyNotice: MOCK_VAULT_OPERATION_SAFETY_NOTICE,
          },
        };
      }

      if (!isPositiveDecimalString(amount)) {
        return {
          accepted: false,
          statusCode: 400,
          body: {
            error: 'vault_deposit_rejected',
            reason: 'invalid_amount',
            message: 'Amount must be a positive decimal string.',
            custody: CUSTODY_NOTE,
            permissions: DEPOSIT_PERMISSIONS,
            settlementMode: 'mock',
            realQuaiTransactions: false,
            walletRequired: false,
            fundsMoved: false,
            safetyNotice: MOCK_VAULT_OPERATION_SAFETY_NOTICE,
          },
        };
      }

      const vaultSequence = indexer.nextVaultSequence();
      const eventId = paddedId('vault-event', vaultSequence);

      const depositEvent = {
        eventId,
        type: 'VAULT_DEPOSIT',
        source: 'mock-vault',
        owner,
        token,
        amount,
        vaultSequence,
      };

      const projectionResult = indexer.projectDepositEvent(depositEvent);
      if (!projectionResult.projected) {
        return {
          accepted: false,
          statusCode: 400,
          body: {
            error: 'vault_deposit_rejected',
            reason: projectionResult.reason,
            message: `Vault deposit projection failed: ${projectionResult.reason}.`,
            custody: CUSTODY_NOTE,
            permissions: DEPOSIT_PERMISSIONS,
            settlementMode: 'mock',
            realQuaiTransactions: false,
            walletRequired: false,
            fundsMoved: false,
            ...projectionResult,
            safetyNotice: MOCK_VAULT_OPERATION_SAFETY_NOTICE,
          },
        };
      }

      emitStreamUpdate({
        fills: [],
        reason: 'mock_vault_deposit',
        channels: ['vault.balances', 'vault.deposits'],
        deposit: projectionResult.record,
      });

      return {
        accepted: true,
        statusCode: 200,
        body: {
          deposited: true,
          ...projectionResult.record,
          newBalance: projectionResult.newBalance,
          owner,
          token,
          amount,
          source: 'mock-vault',
          custody: CUSTODY_NOTE,
          permissions: DEPOSIT_PERMISSIONS,
          settlementMode: 'mock',
          realQuaiTransactions: false,
          walletRequired: false,
          fundsMoved: false,
          safetyNotice: MOCK_VAULT_OPERATION_SAFETY_NOTICE,
        },
      };
    },

    withdraw({ owner, token, amount } = {}) {
      if (!owner || typeof owner !== 'string' || owner.length < 10) {
        return {
          accepted: false,
          statusCode: 400,
          body: {
            error: 'vault_withdrawal_rejected',
            reason: 'invalid_owner',
            message: 'Owner address is required for vault withdrawal.',
            custody: CUSTODY_NOTE,
            permissions: WITHDRAW_PERMISSIONS,
            settlementMode: 'mock',
            realQuaiTransactions: false,
            walletRequired: false,
            fundsMoved: false,
            safetyNotice: MOCK_VAULT_OPERATION_SAFETY_NOTICE,
          },
        };
      }

      if (!token || !ALLOWED_VAULT_TOKENS.has(token)) {
        return {
          accepted: false,
          statusCode: 400,
          body: {
            error: 'vault_withdrawal_rejected',
            reason: 'unsupported_token',
            message: `Token must be one of: ${Array.from(ALLOWED_VAULT_TOKENS).join(', ')}.`,
            custody: CUSTODY_NOTE,
            permissions: WITHDRAW_PERMISSIONS,
            settlementMode: 'mock',
            realQuaiTransactions: false,
            walletRequired: false,
            fundsMoved: false,
            safetyNotice: MOCK_VAULT_OPERATION_SAFETY_NOTICE,
          },
        };
      }

      if (!isPositiveDecimalString(amount)) {
        return {
          accepted: false,
          statusCode: 400,
          body: {
            error: 'vault_withdrawal_rejected',
            reason: 'invalid_amount',
            message: 'Amount must be a positive decimal string.',
            custody: CUSTODY_NOTE,
            permissions: WITHDRAW_PERMISSIONS,
            settlementMode: 'mock',
            realQuaiTransactions: false,
            walletRequired: false,
            fundsMoved: false,
            safetyNotice: MOCK_VAULT_OPERATION_SAFETY_NOTICE,
          },
        };
      }

      const vaultSequence = indexer.nextVaultSequence();
      const eventId = paddedId('vault-event', vaultSequence);

      const withdrawalEvent = {
        eventId,
        type: 'VAULT_WITHDRAWAL',
        source: 'mock-vault',
        owner,
        token,
        amount,
        vaultSequence,
      };

      const projectionResult = indexer.projectWithdrawalEvent(withdrawalEvent);
      if (!projectionResult.projected) {
        const status = projectionResult.reason === 'insufficient_vault_balance' ? 422 : 400;
        return {
          accepted: false,
          statusCode: status,
          body: {
            error: 'vault_withdrawal_rejected',
            reason: projectionResult.reason,
            message: projectionResult.reason === 'insufficient_vault_balance'
              ? `Insufficient vault balance: ${projectionResult.available} available, ${projectionResult.requested} requested.`
              : `Vault withdrawal projection failed: ${projectionResult.reason}.`,
            custody: CUSTODY_NOTE,
            permissions: WITHDRAW_PERMISSIONS,
            settlementMode: 'mock',
            realQuaiTransactions: false,
            walletRequired: false,
            fundsMoved: false,
            ...projectionResult,
            safetyNotice: MOCK_VAULT_OPERATION_SAFETY_NOTICE,
          },
        };
      }

      emitStreamUpdate({
        fills: [],
        reason: 'mock_vault_withdrawal',
        channels: ['vault.balances', 'vault.withdrawals'],
        withdrawal: projectionResult.record,
      });

      return {
        accepted: true,
        statusCode: 200,
        body: {
          withdrawn: true,
          ...projectionResult.record,
          newBalance: projectionResult.newBalance,
          owner,
          token,
          amount,
          source: 'mock-vault',
          custody: CUSTODY_NOTE,
          permissions: WITHDRAW_PERMISSIONS,
          settlementMode: 'mock',
          realQuaiTransactions: false,
          walletRequired: false,
          fundsMoved: false,
          safetyNotice: MOCK_VAULT_OPERATION_SAFETY_NOTICE,
        },
      };
    },
  };
};
