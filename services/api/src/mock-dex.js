import { createHash } from 'node:crypto';

export const MARKET_ID = 'QI-QUAI';
export const CUSTODY_NOTE = 'non-custodial-no-withdrawal-authority';

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

export const createMockDexState = () => {
  const state = {
    orderSequence: 0,
    fillSequence: 0,
    tradeSequence: 0,
    orders: new Map(),
    fills: [],
    trades: [],
    proofs: new Map(),
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

  const projectFill = ({ maker, taker, price, amount }) => {
    state.fillSequence += 1;
    state.tradeSequence += 1;

    const fillId = paddedId('fill', state.fillSequence);
    const tradeId = paddedId('trade', state.tradeSequence);
    const fill = {
      fillId,
      tradeId,
      marketId: MARKET_ID,
      makerOrderHash: maker.orderHash,
      takerOrderHash: taker.orderHash,
      maker: maker.owner,
      taker: taker.owner,
      price,
      amount,
      makerFee: '0',
      takerFee: '0',
      settlementMode: 'mock',
      settlementStatus: 'confirmed',
      createdAt: MOCK_EPOCH_SECONDS + state.fillSequence,
    };

    const trade = {
      tradeId,
      fillId,
      marketId: MARKET_ID,
      price,
      amount,
      settlementStatus: 'confirmed',
      proofUrl: `/v1/proofs/trades/${tradeId}`,
    };

    const proof = {
      tradeId,
      orderHashes: [maker.orderHash, taker.orderHash],
      settlementTx: `mock-settlement-${fillId}`,
      blockNumber: 0,
      eventIndex: state.fillSequence - 1,
      market: MARKET_ID,
      price,
      amount,
      makerFee: '0',
      takerFee: '0',
      explorerUrl: null,
      rawEvent: {
        type: 'MockSettlementConfirmed',
        fillId,
        settlementMode: 'mock',
      },
    };

    state.fills.push(fill);
    state.trades.push(trade);
    state.proofs.set(tradeId, proof);

    return clone(fill);
  };

  const removeFilledRestingOrders = () => {
    state.book.bids = state.book.bids.filter((order) => order.remainingAmount !== '0');
    state.book.asks = state.book.asks.filter((order) => order.remainingAmount !== '0');
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

    listFills() {
      return clone(state.fills);
    },

    listTrades(marketId) {
      return clone(state.trades.filter((trade) => trade.marketId === marketId));
    },

    getProof(tradeId) {
      return state.proofs.has(tradeId) ? clone(state.proofs.get(tradeId)) : null;
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
};
