import { createHash } from 'node:crypto';

const CUSTODY_NOTE = 'non-custodial-no-withdrawal-authority';
const MOCK_EPOCH_SECONDS = 1780000000;
const ALLOWED_MARKETS = new Set(['WQUAI-WQI']);
const ALLOWED_SIDES = new Set(['buy', 'sell']);
const ALLOWED_TYPES = new Set(['limit', 'market_ioc']);
const ALLOWED_TIME_IN_FORCE = new Set(['GTC', 'IOC', 'FOK', 'POST_ONLY']);
const REQUIRED_ORDER_FIELDS = [
  'marketId', 'side', 'type', 'baseToken', 'quoteToken',
  'amount', 'price', 'timeInForce', 'maxSlippageBps',
  'owner', 'delegate', 'nonce', 'expiresAt',
  'chainId', 'settlementContract', 'signature',
];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isDecimalString = (value) => typeof value === 'string' && /^[0-9]+$/.test(value);
const isPositiveDecimalString = (value) => isDecimalString(value) && BigInt(value) > 0n;
const clone = (value) => JSON.parse(JSON.stringify(value));

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

  const missingFields = REQUIRED_ORDER_FIELDS.filter((f) => order[f] === undefined || order[f] === null || order[f] === '');
  if (missingFields.length > 0) {
    return rejectOrder('missing_required_fields', 'SignedOrder is missing replay-safe required fields.', { missingFields });
  }

  if (!ALLOWED_MARKETS.has(order.marketId)) {
    return rejectOrder('market_disabled', 'Only enabled markets are accepted by the matching engine.');
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
const hasOpenQuantity = (order) => order.status !== 'filled' && order.status !== 'cancelled' && BigInt(order.remainingAmount) > 0n;

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

export function createMatchingEngine() {
  const state = {
    orderSequence: 0,
    orders: new Map(),
    book: {
      bids: [],
      asks: [],
    },
  };

  const sortedBookSide = (side) => {
    const orders = side === 'buy' ? state.book.bids : state.book.asks;
    orders.sort(compareRestingOrders(side));
    return orders;
  };

  const removeFilledRestingOrders = () => {
    state.book.bids = state.book.bids.filter((o) => o.remainingAmount !== '0');
    state.book.asks = state.book.asks.filter((o) => o.remainingAmount !== '0');
  };

  const removeRestingOrder = (orderHash) => {
    state.book.bids = state.book.bids.filter((o) => o.orderHash !== orderHash);
    state.book.asks = state.book.asks.filter((o) => o.orderHash !== orderHash);
  };

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

      // Sync resting order state back to the map since applyFill mutates in place
      state.orders.set(resting.orderHash, resting);

      fills.push({
        fillId: `fill-${String(state.orderSequence).padStart(6, '0')}`,
        marketId: incoming.marketId,
        makerOrderHash: resting.orderHash,
        takerOrderHash: incoming.orderHash,
        maker: resting.owner,
        taker: incoming.owner,
        price,
        amount: fillAmount.toString(),
        settlementMode: 'mock',
        projectionType: 'IndexedFillProjection',
      });
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
          body: {
            error: 'order_not_found',
            orderHash,
            source: 'mock-matching-engine',
            custody: CUSTODY_NOTE,
            nonceManager: 'matcher-local-cancel-only-on-chain-nonce-unchanged',
            permissions: ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN'],
            message: 'No mock matcher order exists for this orderHash. Cancellation is matcher-local only and does not cancel the on-chain nonce.',
          },
        };
      }

      if (!hasOpenQuantity(order)) {
        return {
          statusCode: 409,
          body: {
            error: 'order_not_open',
            orderHash,
            status: order.status,
            source: 'mock-matching-engine',
            custody: CUSTODY_NOTE,
            nonceManager: 'matcher-local-cancel-only-on-chain-nonce-unchanged',
            permissions: ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN'],
            message: 'Only remaining matcher-open quantity can be cancelled. Cancellation is matcher-local only.',
          },
        };
      }

      const cancelledAmount = order.remainingAmount;
      order.remainingAmount = '0';
      order.status = 'cancelled';
      order.cancelledAmount = cancelledAmount;
      order.cancelReason = 'cancel_order';
      order.nonceCancellation = 'not-implied-matcher-local-only';
      removeRestingOrder(orderHash);

      return {
        statusCode: 200,
        body: {
          cancelled: true,
          cancelledCount: 1,
          orderHash,
          cancelledOrders: [publicOrder(order)],
          source: 'mock-matching-engine',
          custody: CUSTODY_NOTE,
          nonceManager: 'matcher-local-cancel-only-on-chain-nonce-unchanged',
          permissions: ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN'],
          message: 'Mock cancellation removes only matcher-open quantity and does not cancel the on-chain nonce.',
        },
      };
    },

    cancelAll(options = {}) {
      const filters = {
        marketId: options?.marketId ?? null,
        owner: options?.owner ?? null,
      };

      const candidates = Array.from(state.orders.values()).filter((order) => {
        if (!hasOpenQuantity(order)) return false;
        if (filters.marketId !== null && order.marketId !== filters.marketId) return false;
        if (filters.owner !== null && order.owner !== filters.owner) return false;
        return true;
      });

      const cancelledOrders = candidates.map((order) => {
        const cancelledAmount = order.remainingAmount;
        order.remainingAmount = '0';
        order.status = 'cancelled';
        order.cancelledAmount = cancelledAmount;
        order.cancelReason = 'cancel_all';
        order.nonceCancellation = 'not-implied-matcher-local-only';
        removeRestingOrder(order.orderHash);
        return publicOrder(order);
      });

      return {
        statusCode: 200,
        body: {
          cancelled: cancelledOrders.length > 0,
          cancelledCount: cancelledOrders.length,
          cancelledOrders,
          filters,
          source: 'mock-matching-engine',
          custody: CUSTODY_NOTE,
          nonceManager: 'matcher-local-cancel-only-on-chain-nonce-unchanged',
          permissions: ['CANCEL_ALL', 'CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN'],
          message: 'Mock cancellation removes only matcher-open quantity and does not cancel the on-chain nonce.',
        },
      };
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
  };
}
