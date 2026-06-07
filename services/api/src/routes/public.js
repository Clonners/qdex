import { createContractRegistryResponse } from '../contract-registry.js';
import { jsonResult } from '../http.js';
import {
  createListingRequestPlaceholderResponse,
  createListingRequestReviewFlowResponse,
  createTokenListingPolicyResponse,
} from '../listing-policy.js';
import { createRelayerSettlementModeGateStatus } from '../relayer-gate-status.js';

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

export const handlePublicRoute = (context) => {
  const { method, pathname, searchParams, state } = context;
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
    return jsonResult(200, state.getOrderbook(orderbookMarket));
  }

  const tradesMarket = marketPathValue(pathname, '/v1/trades/');
  if (method === 'GET' && tradesMarket !== null) {
    return jsonResult(200, {
      marketId: tradesMarket,
      trades: state.listTrades(tradesMarket),
      source: state.projectionSource ?? 'in-memory-indexer-projection',
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
    return jsonResult(200, createContractRegistryResponse());
  }

  if (method === 'GET' && pathname === '/v1/listings/policy') {
    return jsonResult(200, createTokenListingPolicyResponse());
  }

  if (method === 'GET' && pathname === '/v1/listings/review-flow') {
    return jsonResult(200, createListingRequestReviewFlowResponse());
  }

  if (method === 'POST' && pathname === '/v1/listings/requests') {
    return jsonResult(501, createListingRequestPlaceholderResponse());
  }

  if (method === 'GET' && pathname === '/v1/relayer/settlement-mode-gate') {
    return jsonResult(200, createRelayerSettlementModeGateStatus());
  }

  return null;
};
