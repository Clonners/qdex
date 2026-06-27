/**
 * Real network routes for QDEX API
 * 
 * Adds real RPC data endpoints alongside the mock endpoints:
 * - GET /v1/real/network - Network status
 * - GET /v1/real/balances/:address - Real balances from TradingVault
 * - GET /v1/real/fees - Real fee schedule from FeeManager
 * - GET /v1/real/markets - Real markets from MarketRegistry
 * - GET /v1/real/trades - Real trades from Settlement events
 * - GET /v1/real/block - Current block number
 */

import {
  getNetworkStatus,
  getAccountBalances,
  getFeeSchedule,
  getMarkets,
  getTrades,
  getBlockNumber,
  CONTRACTS,
  CHAIN_ID,
  QUAI_RPC_URL,
} from './real-network-adapter.js';

import {
  getTradeSettledEvents,
  getDepositEvents,
  getWithdrawEvents,
} from './real-event-indexer.js';

/**
 * Handle real network routes
 */
export function handleRealNetworkRoute(context) {
  const { pathname, searchParams, method } = context;

  if (method !== 'GET') {
    return null; // Not handled
  }

  // GET /v1/real/network
  if (pathname === '/v1/real/network') {
    return {
      statusCode: 200,
      body: {
        chainId: CHAIN_ID,
        network: 'orchard-cyprus1',
        rpcUrl: QUAI_RPC_URL,
        contracts: CONTRACTS,
        explorer: 'https://orchard.quaiscan.io',
        source: 'real-network',
        settlementMode: 'quai_contract',
      },
    };
  }

  // GET /v1/real/balances/:address
  if (pathname.startsWith('/v1/real/balances/')) {
    const address = pathname.replace('/v1/real/balances/', '');
    return getAccountBalancesReal(address);
  }

  // GET /v1/real/fees
  if (pathname === '/v1/real/fees') {
    return getFeesReal();
  }

  // GET /v1/real/markets
  if (pathname === '/v1/real/markets') {
    return getMarketsReal();
  }

  // GET /v1/real/trades
  if (pathname === '/v1/real/trades') {
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    return getTradesReal(limit);
  }

  // GET /v1/real/block
  if (pathname === '/v1/real/block') {
    return getBlockReal();
  }

  // GET /v1/real/events/trades
  if (pathname === '/v1/real/events/trades') {
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    return getTradeEventsReal(limit);
  }

  // GET /v1/real/events/deposits
  if (pathname === '/v1/real/events/deposits') {
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    return getDepositEventsReal(limit);
  }

  // GET /v1/real/events/withdrawals
  if (pathname === '/v1/real/events/withdrawals') {
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    return getWithdrawEventsReal(limit);
  }

  return null; // Not handled
}

async function getAccountBalancesReal(address) {
  try {
    const balances = await getAccountBalances(address);
    
    return {
      statusCode: 200,
      body: {
        address,
        balances: balances.balances || [],
        source: 'real-network',
        settlementMode: 'quai_contract',
        realQuaiTransactions: true,
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        error: 'rpc_error',
        message: error.message,
      },
    };
  }
}

async function getFeesReal() {
  try {
    const fees = await getFeeSchedule();
    
    return {
      statusCode: 200,
      body: {
        fees,
        source: 'real-network',
        settlementMode: 'quai_contract',
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        error: 'rpc_error',
        message: error.message,
      },
    };
  }
}

async function getMarketsReal() {
  try {
    const markets = await getMarkets();
    
    return {
      statusCode: 200,
      body: {
        markets,
        source: 'real-network',
        settlementMode: 'quai_contract',
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        error: 'rpc_error',
        message: error.message,
      },
    };
  }
}

async function getTradesReal(limit) {
  try {
    const trades = await getTrades('WQUAI-WQI', limit);
    
    return {
      statusCode: 200,
      body: {
        trades: trades.trades || [],
        source: 'real-network',
        settlementMode: 'quai_contract',
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        error: 'rpc_error',
        message: error.message,
      },
    };
  }
}

async function getBlockReal() {
  try {
    const blockNumber = await getBlockNumber();
    
    return {
      statusCode: 200,
      body: {
        blockNumber,
        source: 'real-network',
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        error: 'rpc_error',
        message: error.message,
      },
    };
  }
}

async function getTradeEventsReal(limit) {
  try {
    const events = await getTradeSettledEvents(limit);
    
    return {
      statusCode: 200,
      body: {
        trades: events,
        source: 'real-event-indexer',
        settlementMode: 'quai_contract',
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        error: 'indexer_error',
        message: error.message,
      },
    };
  }
}

async function getDepositEventsReal(limit) {
  try {
    const events = await getDepositEvents(limit);
    
    return {
      statusCode: 200,
      body: {
        deposits: events,
        source: 'real-event-indexer',
        settlementMode: 'quai_contract',
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        error: 'indexer_error',
        message: error.message,
      },
    };
  }
}

async function getWithdrawEventsReal(limit) {
  try {
    const events = await getWithdrawEvents(limit);
    
    return {
      statusCode: 200,
      body: {
        withdrawals: events,
        source: 'real-event-indexer',
        settlementMode: 'quai_contract',
      },
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        error: 'indexer_error',
        message: error.message,
      },
    };
  }
}
