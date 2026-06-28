import { createContractRegistryResponse } from '../contract-registry.js';
import { createFeeScheduleResponse, updateFeeSchedule, getFeeSchedule, FEEMANAGER_POLICY_PROJECTION_SOURCE } from '../fee-policy.js';
import { jsonResult } from '../http.js';
import {
  createListingRequestPlaceholderResponse,
  createListingRequestReviewFlowResponse,
  createTokenListingPolicyResponse,
} from '../listing-policy.js';
import { createRelayerSettlementModeGateStatus } from '../relayer-gate-status.js';
import { getTestnetDeploymentStatus } from '../testnet-deployment-status.js';
import { TESTNET_CONFIG } from '../testnet-config.js';

const MARKET_ID = 'WQUAI-WQI';

const markets = Object.freeze([
  Object.freeze({
    id: MARKET_ID,
    base: 'WQUAI',
    quote: 'WQI',
    status: 'active',
    zone: 'single-zone-mvp',
    custodyModel: 'contract-vault-non-custodial',
    settlementSource: 'quai-contract-deployed',
    settlementContract: TESTNET_CONFIG.contracts.Settlement,
  }),
  Object.freeze({
    id: 'WQUAI-USDT',
    base: 'WQUAI',
    quote: 'USDT',
    status: 'planned',
    zone: 'single-zone-mvp',
    custodyModel: 'contract-vault-non-custodial',
    settlementSource: 'quai-contract-deployed',
    settlementContract: TESTNET_CONFIG.contracts.Settlement,
  }),
  Object.freeze({
    id: 'WQI-USDT',
    base: 'WQI',
    quote: 'USDT',
    status: 'planned',
    zone: 'single-zone-mvp',
    custodyModel: 'contract-vault-non-custodial',
    settlementSource: 'quai-contract-deployed',
    settlementContract: TESTNET_CONFIG.contracts.Settlement,
  }),
]);

const marketPathValue = (pathname, prefix) => {
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const rawValue = pathname.slice(prefix.length);
  return rawValue.length > 0 ? decodeURIComponent(rawValue) : null;
};

const listingRequestDecisionId = (pathname) => {
  const prefix = '/v1/listings/requests/';
  const suffix = '/decision';
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return null;
  }

  const rawValue = pathname.slice(prefix.length, pathname.length - suffix.length);
  return rawValue.length > 0 && !rawValue.includes('/') ? decodeURIComponent(rawValue) : null;
};

export const handlePublicRoute = (context) => {
  const { method, pathname, searchParams, state } = context;
  // Orderbook endpoint
  if (method === 'GET' && pathname.startsWith('/v1/orderbook')) {
    const marketId = marketPathValue(pathname, '/v1/orderbook/') || MARKET_ID;
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);
    const dex = state;
    if (dex) {
      const orders = dex.getOpenOrders();
      const filtered = (orders || []).filter(o => o.marketId === marketId).slice(0, limit * 2);
      const bids = filtered.filter(o => o.side === 'buy').sort((a, b) => Number(b.price) - Number(a.price)).slice(0, limit);
      const asks = filtered.filter(o => o.side === 'sell').sort((a, b) => Number(a.price) - Number(b.price)).slice(0, limit);
      const trades = dex.getRecentTrades(marketId, limit);
      return jsonResult(200, {
        marketId,
        bids: bids.map(o => ({ price: o.price, amount: o.remainingAmount, orderHash: o.orderHash })),
        asks: asks.map(o => ({ price: o.price, amount: o.remainingAmount, orderHash: o.orderHash })),
        recentTrades: (trades || []).slice(0, limit),
        source: 'mock-matching-engine',
      });
    }
    return jsonResult(200, {
      marketId,
      bids: [],
      asks: [],
      recentTrades: [],
      source: 'mock-matching-engine',
    });
  }

  if (method === 'GET' && pathname === '/v1/health') {
    return jsonResult(200, {
      ok: true,
      service: '@qdex/api',
      mode: 'testnet-live',
      custody: 'non-custodial',
      settlement: 'quai-contract-deployed',
      network: TESTNET_CONFIG.networkName,
      zone: TESTNET_CONFIG.zone,
      chainId: TESTNET_CONFIG.chainId,
      rpc: TESTNET_CONFIG.rpcUrl,
    });
  }

  if (method === 'GET' && pathname === '/v1/markets') {
    return jsonResult(200, { markets: markets.map((market) => ({ ...market })) });
  }

  if (method === 'GET' && pathname === '/v1/tickers') {
    return jsonResult(200, {
      tickers: markets.map((market) => ({
        marketId: market.id,
        lastPrice: null,
        bestBid: null,
        bestAsk: null,
        volume24h: '0',
        source: 'mock-market-data',
      })),
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
    return jsonResult(200, createFeeScheduleResponse());
  }

  if (method === 'POST' && pathname === '/v1/fees/update') {
    const { makerFeeBps, takerFeeBps } = context.body ?? {};
    const result = updateFeeSchedule(makerFeeBps, takerFeeBps);
    if (!result.accepted) {
      return jsonResult(400, {
        error: 'fee_update_rejected',
        reason: result.reason,
        hardMaxFeeBps: result.hardMaxFeeBps,
        custody: 'non-custodial-fee-policy',
      });
    }
    return jsonResult(200, {
      updated: true,
      feeSchedule: getFeeSchedule(),
      source: FEEMANAGER_POLICY_PROJECTION_SOURCE,
      custody: 'non-custodial-fee-policy',
    });
  }

  if (method === 'GET' && pathname === '/v1/contracts') {
    return jsonResult(200, createContractRegistryResponse());
  }

  // Stats endpoint - persistent storage metrics + in-memory live data
  if (method === 'GET' && pathname === '/v1/stats') {
    const sqliteStats = state.getStats?.() ?? {};
    const openOrdersInMemory = state.getOpenOrders?.()?.length ?? sqliteStats?.openOrders ?? 0;
    const fills = state.listFills?.() ?? [];
    const trades = state.listTrades?.(MARKET_ID) ?? [];
    const proofs = state.listProofs?.() ?? [];
    return jsonResult(200, {
      openOrders: openOrdersInMemory,
      totalFills: fills.length,
      totalTrades: trades.length,
      totalProofs: proofs.length,
      totalDeposits: sqliteStats?.totalDeposits ?? 0,
      totalWithdrawals: sqliteStats?.totalWithdrawals ?? 0,
      source: 'mock-matching-engine + sqlite-storage',
      persistence: 'persistent',
    });
  }

  if (method === 'GET' && pathname === '/v1/listings/policy') {
    return jsonResult(200, createTokenListingPolicyResponse());
  }

  if (method === 'GET' && pathname === '/v1/listings/review-flow') {
    return jsonResult(200, createListingRequestReviewFlowResponse());
  }

  if (method === 'GET' && pathname === '/v1/listings/requests') {
    return jsonResult(200, state.listListingRequests());
  }

  const listingDecisionRequestId = listingRequestDecisionId(pathname);
  if (method === 'POST' && listingDecisionRequestId !== null) {
    const result = state.decideListingRequest(listingDecisionRequestId, context.body);
    return jsonResult(result.statusCode, result.body);
  }

  if (method === 'POST' && pathname === '/v1/listings/requests') {
    if (context.body?.requestMode !== 'local_review_queue') {
      return jsonResult(501, createListingRequestPlaceholderResponse());
    }

    const result = state.submitListingRequest(context.body);
    return jsonResult(result.statusCode, result.body);
  }

  if (method === 'GET' && pathname === '/v1/relayer/settlement-mode-gate') {
    return jsonResult(200, createRelayerSettlementModeGateStatus());
  }

  // Relayer settlement lifecycle — pending fills and confirmed fills
  if (method === 'GET' && pathname === '/v1/settlements') {
    return jsonResult(200, {
      pending: state.getRelayerPendingFills(),
      confirmed: state.getRelayerConfirmedFills(),
      source: 'relayer-state-machine',
      settlementMode: 'mock',
      realQuaiTransactions: false,
      walletRequired: false,
      custody: 'non-custodial-relayer',
      permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
    });
  }

  const settlementFillId = marketPathValue(pathname, '/v1/settlements/');
  if (method === 'GET' && settlementFillId !== null) {
    const fillState = state.getRelayerFillState(settlementFillId);
    if (fillState === null) {
      return jsonResult(404, {
        error: 'fill_not_found',
        fillId: settlementFillId,
        source: 'relayer-state-machine',
        custody: 'non-custodial-relayer',
        message: 'No relayer settlement lifecycle found for this fillId.',
      });
    }
    return jsonResult(200, {
      ...fillState,
      source: 'relayer-state-machine',
      settlementMode: 'mock',
      realQuaiTransactions: false,
      walletRequired: false,
      custody: 'non-custodial-relayer',
      permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
    });
  }

  if (method === 'GET' && pathname === '/v1/testnet/deployment-status') {
    return jsonResult(200, getTestnetDeploymentStatus());
  }

  return null;
};
