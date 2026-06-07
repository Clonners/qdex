import { createHash } from 'node:crypto';

import { createInMemoryIndexerProjection } from '../../indexer/src/in-memory-projection.js';
import { createListingReviewQueue } from './listing-review-queue.js';
import { createInMemoryProofService } from '../../proof-service/src/in-memory-proof-service.js';

export const MARKET_ID = 'QI-QUAI';
export const CUSTODY_NOTE = 'non-custodial-no-withdrawal-authority';
export const INDEXER_SOURCE = 'in-memory-indexer-projection';

const CANCELLATION_NONCE_NOTE = 'matcher-local-cancel-only-on-chain-nonce-unchanged';
const CANCELLATION_MESSAGE = 'Mock cancellation removes only matcher-open quantity and does not cancel the on-chain nonce; user nonce cancellation must be signed through NonceManager later.';
const CANCEL_ORDER_PERMISSIONS = ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN'];
const CANCEL_ALL_PERMISSIONS = ['CANCEL_ALL', 'CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN'];
const MOCK_EPOCH_SECONDS = 1780000000;
const ALLOWED_SIDES = new Set(['buy', 'sell']);
const ALLOWED_TYPES = new Set(['limit', 'market_ioc']);
const ALLOWED_TIME_IN_FORCE = new Set(['GTC', 'IOC', 'FOK', 'POST_ONLY']);
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
    return rejectOrder('market_disabled', 'Only the QI-QUAI mock market is enabled for the MVP slice.');
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
} = {}) => {
  const state = {
    orderSequence: 0,
    fillSequence: 0,
    tradeSequence: 0,
    orders: new Map(),
    book: {
      bids: [],
      asks: [],
    },
  };
  const streamListeners = new Set();

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

  const sortedBookSide = (side) => {
    const orders = side === 'buy' ? state.book.bids : state.book.asks;
    orders.sort(compareRestingOrders(side));
    return orders;
  };

  const projectFill = ({ maker, taker, price, amount }) => {
    state.fillSequence += 1;
    state.tradeSequence += 1;

    const fillId = paddedId('fill', state.fillSequence);
    const tradeId = paddedId('trade', state.tradeSequence);
    const eventId = paddedId('event', state.fillSequence);
    const eventIndex = state.fillSequence - 1;
    const mockSettlementReference = `mock-settlement-${fillId}`;

    const settlementEvent = {
      eventId,
      type: 'SETTLEMENT_CONFIRMED',
      source: 'mock-settlement',
      fillId,
      tradeId,
      orderHashes: [maker.orderHash, taker.orderHash],
      settlementMode: 'mock',
      mockSettlementReference,
      settlementTx: null,
      blockNumber: null,
      blockHash: null,
      eventIndex,
      maker: maker.owner,
      taker: taker.owner,
      market: MARKET_ID,
      price,
      amount,
      fees: {
        maker: '0',
        taker: '0',
      },
      explorerUrl: null,
    };

    const projectionResult = indexer.projectSettlementEvent(settlementEvent);
    if (!projectionResult.projected) {
      throw new Error(`Mock settlement event failed indexer projection: ${projectionResult.reason ?? 'unknown'}`);
    }

    const projectedFill = indexer.listFills().find((fill) => fill.fillId === fillId);
    if (projectedFill === undefined) {
      throw new Error(`Indexer did not expose projected fill ${fillId}`);
    }

    return projectedFill;
  };

  const removeFilledRestingOrders = () => {
    state.book.bids = state.book.bids.filter((order) => order.remainingAmount !== '0');
    state.book.asks = state.book.asks.filter((order) => order.remainingAmount !== '0');
  };

  const removeRestingOrder = (orderHash) => {
    state.book.bids = state.book.bids.filter((order) => order.orderHash !== orderHash);
    state.book.asks = state.book.asks.filter((order) => order.orderHash !== orderHash);
  };

  const cancelProjectedOrder = (order, reason) => {
    const cancelledAmount = order.remainingAmount;

    order.remainingAmount = '0';
    order.status = 'cancelled';
    order.cancelledAmount = cancelledAmount;
    order.cancelReason = reason;
    order.nonceCancellation = 'not-implied-matcher-local-only';
    removeRestingOrder(order.orderHash);

    return publicOrder(order);
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

  const cancellationErrorBody = ({ error, orderHash, status, message }) => ({
    error,
    orderHash,
    ...(status === undefined ? {} : { status }),
    source: 'mock-matching-engine',
    custody: CUSTODY_NOTE,
    nonceManager: CANCELLATION_NONCE_NOTE,
    permissions: CANCEL_ORDER_PERMISSIONS,
    message,
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

  const matchOrder = (incoming) => {
    const fills = [];
    const oppositeSide = incoming.side === 'buy' ? 'sell' : 'buy';
    const oppositeOrders = sortedBookSide(oppositeSide);

    for (const resting of [...oppositeOrders]) {
      if (incoming.remainingAmount === '0' || !crosses(incoming, resting)) {
        break;
      }

      const fillAmount = BigInt(incoming.remainingAmount) < BigInt(resting.remainingAmount)
        ? incoming.remainingAmount
        : resting.remainingAmount;
      const price = resting.price;

      applyFill(resting, fillAmount);
      applyFill(incoming, fillAmount);
      fills.push(projectFill({ maker: resting, taker: incoming, price, amount: fillAmount }));
    }

    removeFilledRestingOrders();
    return fills;
  };

  const restOrder = (order) => {
    if (!canRest(order) || order.remainingAmount === '0') {
      return;
    }

    const bookSide = order.side === 'buy' ? state.book.bids : state.book.asks;
    bookSide.push(order);
    sortedBookSide(order.side);
  };

  return {
    projectionSource: INDEXER_SOURCE,

    submitOrder(order) {
      const validation = validateOrder(order);
      if (!validation.accepted) {
        return validation;
      }

      const orderHash = createOrderHash(order);
      if (state.orders.has(orderHash)) {
        return rejectOrder('duplicate_order', 'Order hash already exists in the mock matcher.');
      }

      state.orderSequence += 1;
      const projectedOrder = {
        orderHash,
        marketId: order.marketId,
        owner: order.owner,
        delegate: order.delegate,
        side: order.side,
        type: order.type,
        amount: order.amount,
        price: order.price,
        filledAmount: '0',
        remainingAmount: order.amount,
        status: 'open',
        custody: CUSTODY_NOTE,
        acceptedSequence: state.orderSequence,
        signedOrder: clone(order),
      };

      state.orders.set(orderHash, projectedOrder);
      const fills = matchOrder(projectedOrder);
      restOrder(projectedOrder);
      emitStreamUpdate({ fills });

      return {
        accepted: true,
        statusCode: 201,
        body: {
          ...publicOrder(projectedOrder),
          fills,
          source: 'mock-matching-engine',
          settlement: fills.length > 0 ? 'mock-settlement-confirmed' : 'awaiting-cross',
        },
      };
    },

    listOrders() {
      return Array.from(state.orders.values()).map(publicOrder);
    },

    cancelOrder(orderHash) {
      const order = state.orders.get(orderHash);
      if (order === undefined) {
        return {
          statusCode: 404,
          body: cancellationErrorBody({
            error: 'order_not_found',
            orderHash,
            message: 'No mock matcher order exists for this orderHash.',
          }),
        };
      }

      if (!hasOpenQuantity(order)) {
        return {
          statusCode: 409,
          body: cancellationErrorBody({
            error: 'order_not_open',
            orderHash,
            status: order.status,
            message: 'Only remaining matcher-open quantity can be cancelled.',
          }),
        };
      }

      const cancelledOrders = [cancelProjectedOrder(order, 'cancel_order')];
      emitStreamUpdate(cancellationStreamUpdate({
        cancelledOrders,
        permissions: CANCEL_ORDER_PERMISSIONS,
        reason: 'matcher_local_order_cancelled',
      }));

      return {
        statusCode: 200,
        body: cancellationBody({
          cancelledOrders,
          orderHash,
          permissions: CANCEL_ORDER_PERMISSIONS,
        }),
      };
    },

    cancelAll(options = {}) {
      const filters = {
        marketId: options?.marketId ?? null,
        owner: options?.owner ?? null,
      };
      const candidates = Array.from(state.orders.values()).filter((order) => {
        if (!hasOpenQuantity(order)) {
          return false;
        }

        if (filters.marketId !== null && order.marketId !== filters.marketId) {
          return false;
        }

        if (filters.owner !== null && order.owner !== filters.owner) {
          return false;
        }

        return true;
      });

      const cancelledOrders = candidates.map((order) => cancelProjectedOrder(order, 'cancel_all'));
      if (cancelledOrders.length > 0) {
        emitStreamUpdate(cancellationStreamUpdate({
          cancelledOrders,
          permissions: CANCEL_ALL_PERMISSIONS,
          reason: 'matcher_local_orders_cancelled',
          filters,
        }));
      }

      return {
        statusCode: 200,
        body: cancellationBody({
          cancelledOrders,
          filters,
          permissions: CANCEL_ALL_PERMISSIONS,
        }),
      };
    },

    listFills() {
      return indexer.listFills();
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

    getOrderbook(marketId) {
      return {
        marketId,
        sequence: state.orderSequence,
        bids: state.book.bids.map(bookOrder),
        asks: state.book.asks.map(bookOrder),
        source: 'mock-orderbook',
      };
    },

    subscribeStreamUpdates(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('subscribeStreamUpdates requires a listener function.');
      }

      streamListeners.add(listener);
      return () => {
        streamListeners.delete(listener);
      };
    },
  };
};
