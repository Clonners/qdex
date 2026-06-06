const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';
const ZERO_DELEGATE = '0x0000000000000000000000000000000000000000';
const DEFAULT_OWNER = '0x1111111111111111111111111111111111111111';
const DEFAULT_SETTLEMENT_CONTRACT = '0x2222222222222222222222222222222222222222';
const MOCK_SIGNED_AT = 1780000000;
const DEFAULT_EXPIRES_AT = 1780003600;

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

class QDexHttpError extends Error {
  constructor(message, { status, body }) {
    super(message);
    this.name = 'QDexHttpError';
    this.status = status;
    this.body = body;
  }
}

const assertOk = ({ status, body }, path) => {
  if (status < 200 || status >= 300) {
    throw new QDexHttpError(`QDex API request failed for ${path}: HTTP ${status}`, { status, body });
  }

  return body;
};

export const createMockSignedOrder = (overrides = {}) => {
  const type = overrides.type ?? 'limit';
  const owner = overrides.owner ?? DEFAULT_OWNER;
  const delegate = overrides.delegate ?? ZERO_DELEGATE;
  const nonce = overrides.nonce ?? '1';
  const timeInForce = overrides.timeInForce ?? (type === 'market_ioc' ? 'IOC' : 'GTC');
  const maxSlippageBps = overrides.maxSlippageBps ?? (type === 'market_ioc' ? 50 : 0);

  const order = {
    marketId: 'QI-QUAI',
    side: 'sell',
    type,
    baseToken: 'mock:QI',
    quoteToken: 'mock:QUAI',
    amount: '100',
    price: '5',
    timeInForce,
    maxSlippageBps,
    owner,
    delegate,
    nonce,
    expiresAt: DEFAULT_EXPIRES_AT,
    chainId: 0,
    settlementContract: DEFAULT_SETTLEMENT_CONTRACT,
    clientOrderId: `sdk-mock-order-${nonce}`,
    ...overrides,
  };

  order.signature = {
    scheme: 'mock',
    signer: order.owner,
    value: `0xmock-${order.nonce}`,
    signedAt: MOCK_SIGNED_AT,
    ...(overrides.signature ?? {}),
  };

  return order;
};

export class QDexClient {
  constructor({ baseUrl = DEFAULT_BASE_URL, fetch: fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('QDexClient requires a fetch implementation.');
    }

    this.baseUrl = trimTrailingSlash(baseUrl);
    this.fetch = fetchImpl;

    this.markets = {
      list: async () => (await this.#requestOk('/v1/markets')).markets,
    };

    this.tickers = {
      list: async () => (await this.#requestOk('/v1/tickers')).tickers,
      get: async (marketId) => this.#requestOk(`/v1/tickers/${encodeURIComponent(marketId)}`),
    };

    this.orderbook = {
      get: async (marketId) => this.#requestOk(`/v1/orderbook/${encodeURIComponent(marketId)}`),
    };

    this.orders = {
      list: async () => this.#requestOk('/v1/orders'),
      submitSignedOrder: async (order) => this.#requestOk('/v1/orders', {
        method: 'POST',
        body: { order },
      }),
      cancelAll: async () => this.#request('/v1/orders/cancel-all', { method: 'POST' }),
    };

    this.fills = {
      list: async () => this.#requestOk('/v1/fills'),
    };

    this.trades = {
      list: async (marketId) => this.#requestOk(`/v1/trades/${encodeURIComponent(marketId)}`),
    };

    this.proofs = {
      trade: async (tradeId) => this.#requestOk(`/v1/proofs/trades/${encodeURIComponent(tradeId)}`),
    };

    this.delegateKeys = {
      list: async () => this.#requestOk('/v1/delegate-keys'),
    };
  }

  async #requestOk(path, options = {}) {
    return assertOk(await this.#request(path, options), path);
  }

  async #request(path, { method = 'GET', body } = {}) {
    const headers = body === undefined ? {} : { 'content-type': 'application/json' };
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    const parsedBody = text.length > 0 ? JSON.parse(text) : null;

    return {
      status: response.status,
      body: parsedBody,
    };
  }
}

const firstFillFrom = (orderResponse) => {
  const fill = orderResponse.fills?.[0];
  if (fill === undefined) {
    throw new Error('Mock cross smoke expected the crossing order to produce one fill.');
  }

  return fill;
};

export const runMockCrossSmoke = async (client, {
  restingSell = createMockSignedOrder({
    side: 'sell',
    amount: '100',
    price: '5',
    nonce: '1001',
    owner: DEFAULT_OWNER,
  }),
  crossingBuy = createMockSignedOrder({
    side: 'buy',
    amount: '100',
    price: '6',
    nonce: '1002',
    owner: '0x3333333333333333333333333333333333333333',
  }),
} = {}) => {
  const marketId = restingSell.marketId;
  const bookBefore = await client.orderbook.get(marketId);
  const restingOrderInitial = await client.orders.submitSignedOrder(restingSell);
  const bookWithResting = await client.orderbook.get(marketId);
  const crossingOrder = await client.orders.submitSignedOrder(crossingBuy);
  const fill = firstFillFrom(crossingOrder);
  const orders = await client.orders.list();
  const restingOrder = orders.orders.find((order) => order.orderHash === restingOrderInitial.orderHash) ?? restingOrderInitial;
  const fills = await client.fills.list();
  const trades = await client.trades.list(marketId);
  const proofEnvelope = await client.proofs.trade(fill.tradeId);
  const bookAfter = await client.orderbook.get(marketId);

  return {
    marketId,
    bookBefore,
    bookWithResting,
    bookAfter,
    restingOrder,
    crossingOrder,
    fill,
    fills,
    trades,
    proofEnvelope,
    proof: proofEnvelope.proof,
  };
};

export { QDexHttpError };
