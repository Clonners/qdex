import { jsonResult } from '../http.js';

const MARKET_ID = 'QI-QUAI';

const market = Object.freeze({
  id: MARKET_ID,
  base: 'QI',
  quote: 'QUAI',
  status: 'planned',
  zone: 'single-zone-mvp',
  custodyModel: 'contract-vault-non-custodial',
  settlementSource: 'mock-until-quai-contracts',
});

const marketPathValue = (pathname, prefix) => {
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const rawValue = pathname.slice(prefix.length);
  return rawValue.length > 0 ? decodeURIComponent(rawValue) : null;
};

export const handlePublicRoute = ({ method, pathname, searchParams }) => {
  if (method === 'GET' && pathname === '/v1/health') {
    return jsonResult(200, {
      ok: true,
      service: '@qdex/api',
      mode: 'mock-mvp',
      custody: 'non-custodial',
      settlement: 'mock-now-quai-contract-later',
    });
  }

  if (method === 'GET' && pathname === '/v1/markets') {
    return jsonResult(200, { markets: [market] });
  }

  if (method === 'GET' && pathname === '/v1/tickers') {
    return jsonResult(200, {
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
  }

  const tickerMarket = marketPathValue(pathname, '/v1/tickers/');
  if (method === 'GET' && tickerMarket !== null) {
    return jsonResult(200, {
      marketId: tickerMarket,
      lastPrice: null,
      bestBid: null,
      bestAsk: null,
      volume24h: '0',
      source: 'mock-market-data',
    });
  }

  const orderbookMarket = marketPathValue(pathname, '/v1/orderbook/');
  if (method === 'GET' && orderbookMarket !== null) {
    return jsonResult(200, {
      marketId: orderbookMarket,
      sequence: 0,
      bids: [],
      asks: [],
      source: 'mock-orderbook',
    });
  }

  const tradesMarket = marketPathValue(pathname, '/v1/trades/');
  if (method === 'GET' && tradesMarket !== null) {
    return jsonResult(200, {
      marketId: tradesMarket,
      trades: [],
      source: 'mock-trade-projection',
    });
  }

  const klinesMarket = marketPathValue(pathname, '/v1/klines/');
  if (method === 'GET' && klinesMarket !== null) {
    return jsonResult(200, {
      marketId: klinesMarket,
      interval: searchParams.get('interval') ?? '15m',
      candles: [],
      source: 'mock-candle-projection',
    });
  }

  if (method === 'GET' && pathname === '/v1/fees') {
    return jsonResult(200, {
      makerFeeBps: 0,
      takerFeeBps: 0,
      maxFeeBps: 0,
      source: 'mock-fee-manager',
      note: 'Production fees must be contract-capped and timelock-governed.',
    });
  }

  if (method === 'GET' && pathname === '/v1/contracts') {
    return jsonResult(200, {
      chain: 'quai-single-zone-mvp',
      settlementMode: 'mock',
      contracts: {
        tradingVault: null,
        settlement: null,
        nonceManager: null,
        marketRegistry: null,
        feeManager: null,
        delegateKeyRegistry: null,
      },
      source: 'docs/quai-tooling.md',
    });
  }

  return null;
};
