import {
  CUSTODY_NOTE,
  INDEXER_SOURCE,
  MARKET_ID,
  MOCK_VAULT_PROJECTION_SOURCE,
  createMockVaultBalanceProjection,
} from './mock-dex.js';
import {
  TRADINGVAULT_EVENT_PROJECTION_SOURCE,
  createVaultHistoryProjectionEnvelope,
} from './vault-operations.js';

const PUBLIC_CUSTODY_NOTE = 'public-read-only-no-custody';
const PRIVATE_STREAM_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];
const REQUIRED_PRIVATE_PERMISSIONS = ['READ_ONLY'];
const SAFE_DELEGATE_DEFAULTS = ['NO_WITHDRAW', 'NO_ADMIN'];
const FORBIDDEN_PRIVATE_PERMISSIONS = ['WITHDRAW', 'ADMIN'];
const MOCK_STREAM_SAFETY_NOTICE = 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.';

const clone = (value) => JSON.parse(JSON.stringify(value));

const publicContractsForMarket = (marketId) => [
  {
    channel: 'global.tickers',
    visibility: 'public',
    payload: 'ticker_snapshot',
    source: 'mock-market-data',
  },
  {
    channel: `market.${marketId}.depth`,
    visibility: 'public',
    payload: 'orderbook_depth',
    source: 'mock-orderbook',
  },
  {
    channel: `market.${marketId}.trades`,
    visibility: 'public',
    payload: 'trade_projection',
    source: INDEXER_SOURCE,
    finality: 'confirmed-settlement-only',
  },
  {
    channel: `market.${marketId}.klines.1m`,
    visibility: 'public',
    payload: 'kline_snapshot',
    source: 'mock-candle-projection',
  },
  {
    channel: `market.${marketId}.klines.15m`,
    visibility: 'public',
    payload: 'kline_snapshot',
    source: 'mock-candle-projection',
  },
];

const privateContract = ({ channel, payload, source = 'mock-private-projection', finality }) => ({
  channel,
  visibility: 'private',
  payload,
  source,
  ...(finality === undefined ? {} : { finality }),
  requiredPermissions: REQUIRED_PRIVATE_PERMISSIONS,
  delegateDefaults: SAFE_DELEGATE_DEFAULTS,
  forbiddenPermissions: FORBIDDEN_PRIVATE_PERMISSIONS,
  custody: CUSTODY_NOTE,
});

const privateContracts = () => [
  privateContract({ channel: 'orders', payload: 'order_projection', source: 'mock-order-projection' }),
  privateContract({
    channel: 'fills',
    payload: 'fill_projection',
    source: INDEXER_SOURCE,
    finality: 'confirmed-settlement-only',
  }),
  privateContract({ channel: 'balances', payload: 'vault_balance_projection', source: MOCK_VAULT_PROJECTION_SOURCE }),
  privateContract({
    channel: 'settlements',
    payload: 'settlement_status_projection',
    source: INDEXER_SOURCE,
    finality: 'confirmed-settlement-only',
  }),
  privateContract({
    channel: 'deposits',
    payload: 'deposit_projection',
    source: TRADINGVAULT_EVENT_PROJECTION_SOURCE,
  }),
  privateContract({
    channel: 'withdrawals',
    payload: 'withdrawal_projection',
    source: TRADINGVAULT_EVENT_PROJECTION_SOURCE,
  }),
];

export const listStreamContracts = ({ marketId = MARKET_ID } = {}) => ({
  public: publicContractsForMarket(marketId),
  private: privateContracts(),
});

const marketChannel = (channel, suffix) => {
  const prefix = 'market.';
  if (!channel.startsWith(prefix) || !channel.endsWith(suffix)) {
    return null;
  }

  const marketId = channel.slice(prefix.length, -suffix.length);
  return marketId.length > 0 ? marketId : null;
};

const snapshotEnvelope = ({ channel, visibility, payload, source, custody, data, extra = {} }) => ({
  channel,
  visibility,
  payload,
  source,
  custody,
  ...extra,
  data: clone(data),
});

const sourceFromState = (state) => state.projectionSource ?? INDEXER_SOURCE;

const publicTickerSnapshot = () => ({
  tickers: [
    {
      marketId: MARKET_ID,
      lastPrice: null,
      bestBid: null,
      bestAsk: null,
      volume24h: '0',
      source: 'mock-market-data',
    },
  ],
});

const privateSnapshot = ({ channel, payload, source, data }) => snapshotEnvelope({
  channel,
  visibility: 'private',
  payload,
  source,
  custody: CUSTODY_NOTE,
  extra: {
    permissions: PRIVATE_STREAM_PERMISSIONS,
    safetyNotice: MOCK_STREAM_SAFETY_NOTICE,
  },
  data,
});

export const createStreamSnapshot = ({ channel, state } = {}) => {
  if (typeof channel !== 'string' || channel.length === 0) {
    throw new TypeError('createStreamSnapshot requires a non-empty channel string.');
  }

  if (state === undefined || state === null) {
    throw new TypeError('createStreamSnapshot requires the current mock DEX state.');
  }

  if (channel === 'global.tickers') {
    return snapshotEnvelope({
      channel,
      visibility: 'public',
      payload: 'ticker_snapshot',
      source: 'mock-market-data',
      custody: PUBLIC_CUSTODY_NOTE,
      data: publicTickerSnapshot(),
    });
  }

  const depthMarket = marketChannel(channel, '.depth');
  if (depthMarket !== null) {
    return snapshotEnvelope({
      channel,
      visibility: 'public',
      payload: 'orderbook_depth',
      source: 'mock-orderbook',
      custody: PUBLIC_CUSTODY_NOTE,
      data: state.getOrderbook(depthMarket),
    });
  }

  const tradesMarket = marketChannel(channel, '.trades');
  if (tradesMarket !== null) {
    const source = sourceFromState(state);
    return snapshotEnvelope({
      channel,
      visibility: 'public',
      payload: 'trade_projection',
      source,
      custody: PUBLIC_CUSTODY_NOTE,
      data: {
        marketId: tradesMarket,
        trades: state.listTrades(tradesMarket),
        source,
      },
    });
  }

  const oneMinuteKlinesMarket = marketChannel(channel, '.klines.1m');
  if (oneMinuteKlinesMarket !== null) {
    return snapshotEnvelope({
      channel,
      visibility: 'public',
      payload: 'kline_snapshot',
      source: 'mock-candle-projection',
      custody: PUBLIC_CUSTODY_NOTE,
      data: {
        marketId: oneMinuteKlinesMarket,
        interval: '1m',
        candles: [],
        source: 'mock-candle-projection',
      },
    });
  }

  const fifteenMinuteKlinesMarket = marketChannel(channel, '.klines.15m');
  if (fifteenMinuteKlinesMarket !== null) {
    return snapshotEnvelope({
      channel,
      visibility: 'public',
      payload: 'kline_snapshot',
      source: 'mock-candle-projection',
      custody: PUBLIC_CUSTODY_NOTE,
      data: {
        marketId: fifteenMinuteKlinesMarket,
        interval: '15m',
        candles: [],
        source: 'mock-candle-projection',
      },
    });
  }

  if (channel === 'orders') {
    return privateSnapshot({
      channel,
      payload: 'order_projection',
      source: 'mock-order-projection',
      data: {
        orders: state.listOrders(),
        source: 'mock-order-projection',
      },
    });
  }

  if (channel === 'fills') {
    const source = sourceFromState(state);
    return privateSnapshot({
      channel,
      payload: 'fill_projection',
      source,
      data: {
        fills: state.listFills(),
        source,
      },
    });
  }

  if (channel === 'balances') {
    return privateSnapshot({
      channel,
      payload: 'vault_balance_projection',
      source: MOCK_VAULT_PROJECTION_SOURCE,
      data: createMockVaultBalanceProjection(),
    });
  }

  if (channel === 'settlements') {
    const source = sourceFromState(state);
    return privateSnapshot({
      channel,
      payload: 'settlement_status_projection',
      source,
      data: {
        settlements: state.listFills().map((fill) => ({
          fillId: fill.fillId,
          tradeId: fill.tradeId,
          settlementMode: fill.settlementMode,
          settlementStatus: fill.settlementStatus,
          sourceEventId: fill.sourceEventId,
        })),
        source,
      },
    });
  }

  if (channel === 'deposits' || channel === 'withdrawals') {
    const operation = channel === 'deposits' ? 'deposit' : 'withdrawal';
    const data = createVaultHistoryProjectionEnvelope(operation);

    return privateSnapshot({
      channel,
      payload: channel === 'deposits' ? 'deposit_projection' : 'withdrawal_projection',
      source: data.source,
      data,
    });
  }

  return {
    channel,
    error: 'stream_channel_not_supported',
    message: 'Unsupported mock MVP stream channel.',
  };
};

export { MOCK_STREAM_SAFETY_NOTICE };
