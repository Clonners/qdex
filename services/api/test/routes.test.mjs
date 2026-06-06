import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../src/server.js';

const withServer = async (callback) => {
  const server = createApiServer();

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const requestJson = async (baseUrl, path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  return {
    status: response.status,
    headers: response.headers,
    body: await response.json(),
  };
};

const ZERO_DELEGATE = '0x0000000000000000000000000000000000000000';
const SETTLEMENT_CONTRACT = '0x2222222222222222222222222222222222222222';

const mockOrder = (overrides = {}) => {
  const owner = overrides.owner ?? '0x1111111111111111111111111111111111111111';
  const nonce = overrides.nonce ?? '1';

  return {
    marketId: 'QI-QUAI',
    side: 'sell',
    type: 'limit',
    baseToken: 'mock:QI',
    quoteToken: 'mock:QUAI',
    amount: '100',
    price: '5',
    timeInForce: 'GTC',
    maxSlippageBps: 0,
    owner,
    delegate: ZERO_DELEGATE,
    nonce,
    expiresAt: 1780003600,
    chainId: 0,
    settlementContract: SETTLEMENT_CONTRACT,
    clientOrderId: `mock-order-${nonce}`,
    signature: {
      scheme: 'mock',
      signer: owner,
      value: `0xmock-${nonce}`,
      signedAt: 1780000000,
    },
    ...overrides,
    signature: {
      scheme: 'mock',
      signer: owner,
      value: `0xmock-${nonce}`,
      signedAt: 1780000000,
      ...(overrides.signature ?? {}),
    },
  };
};

test('API JSON responses allow local terminal UI proof fetches without exposing custody authority', async () => {
  await withServer(async (baseUrl) => {
    const proof = await requestJson(baseUrl, '/v1/proofs/trades/mock-trade-0001', {
      headers: {
        origin: 'http://127.0.0.1:8080',
      },
    });

    assert.equal(proof.status, 404);
    assert.equal(proof.headers.get('access-control-allow-origin'), '*');
    assert.equal(proof.headers.get('access-control-allow-methods'), 'GET, POST, DELETE, OPTIONS');
    assert.match(proof.headers.get('access-control-allow-headers'), /content-type/i);
    assert.equal(proof.body.custody, 'non-custodial-no-withdrawal-authority');
  });
});

test('public routes expose mock market data with non-custodial settlement metadata', async () => {
  await withServer(async (baseUrl) => {
    const health = await requestJson(baseUrl, '/v1/health');
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, {
      ok: true,
      service: '@qdex/api',
      mode: 'mock-mvp',
      custody: 'non-custodial',
      settlement: 'mock-now-quai-contract-later',
    });

    const markets = await requestJson(baseUrl, '/v1/markets');
    assert.equal(markets.status, 200);
    assert.equal(markets.body.markets.length, 1);
    assert.deepEqual(markets.body.markets[0], {
      id: 'QI-QUAI',
      base: 'QI',
      quote: 'QUAI',
      status: 'planned',
      zone: 'single-zone-mvp',
      custodyModel: 'contract-vault-non-custodial',
      settlementSource: 'mock-until-quai-contracts',
    });

    const orderbook = await requestJson(baseUrl, '/v1/orderbook/QI-QUAI');
    assert.equal(orderbook.status, 200);
    assert.deepEqual(orderbook.body, {
      marketId: 'QI-QUAI',
      sequence: 0,
      bids: [],
      asks: [],
      source: 'mock-orderbook',
    });
  });
});

test('GET /v1/contracts exposes local-only dependency registry without deploy or custody claims', async () => {
  await withServer(async (baseUrl) => {
    const response = await requestJson(baseUrl, '/v1/contracts');

    assert.equal(response.status, 200);
    assert.equal(response.body.chain, 'quai-single-zone-mvp');
    assert.equal(response.body.settlementMode, 'mock');
    assert.equal(response.body.deploymentStatus, 'local-only-not-deployed');
    assert.equal(response.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.equal(response.body.realQuaiTransactions, false);
    assert.equal(response.body.walletRequired, false);
    assert.match(response.body.nativeQiCaveat, /UTXO/);

    assert.deepEqual(Object.keys(response.body.contracts).sort(), [
      'delegateKeyRegistry',
      'feeManager',
      'marketRegistry',
      'nonceManager',
      'settlement',
      'tradingVault',
    ]);

    assert.equal(response.body.contracts.tradingVault.address, null);
    assert.equal(response.body.contracts.tradingVault.contractName, 'TradingVault');
    assert.equal(response.body.contracts.tradingVault.interface, 'ITradingVault');
    assert.equal(response.body.contracts.tradingVault.operatorWithdrawalAuthority, false);

    assert.equal(response.body.contracts.settlement.address, null);
    assert.equal(response.body.contracts.settlement.contractName, 'Settlement');
    assert.equal(response.body.contracts.settlement.proofTrigger, 'TradeSettled');
    assert.deepEqual(response.body.contracts.settlement.dependencies, [
      'TradingVault',
      'NonceManager',
      'MarketRegistry',
      'FeeManager',
      'DelegateKeyRegistry',
    ]);

    assert.equal(response.body.contracts.nonceManager.nonceTruth, 'external-nonce-manager');
    assert.equal(response.body.contracts.marketRegistry.marketTruth, 'external-market-registry');
    assert.equal(response.body.contracts.feeManager.feeTruth, 'external-fee-manager');
    assert.deepEqual(response.body.contracts.delegateKeyRegistry.requiredPermissions, [
      'PLACE_ORDER',
      'NO_WITHDRAW',
      'NO_ADMIN',
    ]);
  });
});

test('private routes expose order and fill placeholders without withdrawal authority', async () => {
  await withServer(async (baseUrl) => {
    const orders = await requestJson(baseUrl, '/v1/orders');
    assert.equal(orders.status, 200);
    assert.deepEqual(orders.body, {
      orders: [],
      source: 'mock-order-projection',
    });

    const balances = await requestJson(baseUrl, '/v1/account/balances');
    assert.equal(balances.status, 200);
    assert.deepEqual(balances.body, {
      balances: [],
      source: 'mock-vault-projection',
      custody: 'non-custodial-contract-vault',
      withdrawalAuthority: 'owner-wallet-only',
    });

    const postOrder = await requestJson(baseUrl, '/v1/orders', {
      method: 'POST',
      body: JSON.stringify({ order: { marketId: 'QI-QUAI' } }),
    });
    assert.equal(postOrder.status, 400);
    assert.equal(postOrder.body.error, 'order_rejected');
    assert.equal(postOrder.body.reason, 'missing_required_fields');
    assert.equal(postOrder.body.custody, 'non-custodial-no-withdrawal-authority');
  });
});

test('POST /v1/orders crosses mock orders into confirmed fills and proof projection', async () => {
  await withServer(async (baseUrl) => {
    const restingSell = mockOrder({
      side: 'sell',
      amount: '100',
      price: '5',
      nonce: '101',
      owner: '0x1111111111111111111111111111111111111111',
    });

    const sell = await requestJson(baseUrl, '/v1/orders', {
      method: 'POST',
      body: JSON.stringify({ order: restingSell }),
    });
    assert.equal(sell.status, 201);
    assert.equal(sell.body.status, 'open');
    assert.equal(sell.body.filledAmount, '0');
    assert.equal(sell.body.remainingAmount, '100');
    assert.deepEqual(sell.body.fills, []);
    assert.equal(sell.body.custody, 'non-custodial-no-withdrawal-authority');

    const bookAfterSell = await requestJson(baseUrl, '/v1/orderbook/QI-QUAI');
    assert.equal(bookAfterSell.status, 200);
    assert.deepEqual(bookAfterSell.body.bids, []);
    assert.deepEqual(bookAfterSell.body.asks, [
      {
        orderHash: sell.body.orderHash,
        price: '5',
        amount: '100',
        remainingAmount: '100',
        owner: restingSell.owner,
      },
    ]);

    const takerBuy = mockOrder({
      side: 'buy',
      amount: '100',
      price: '6',
      nonce: '202',
      owner: '0x3333333333333333333333333333333333333333',
    });

    const buy = await requestJson(baseUrl, '/v1/orders', {
      method: 'POST',
      body: JSON.stringify({ order: takerBuy }),
    });
    assert.equal(buy.status, 201);
    assert.equal(buy.body.status, 'filled');
    assert.equal(buy.body.filledAmount, '100');
    assert.equal(buy.body.remainingAmount, '0');
    assert.equal(buy.body.fills.length, 1);

    const [fill] = buy.body.fills;
    assert.equal(fill.fillId, 'fill-000001');
    assert.equal(fill.tradeId, 'trade-000001');
    assert.equal(fill.marketId, 'QI-QUAI');
    assert.equal(fill.makerOrderHash, sell.body.orderHash);
    assert.equal(fill.takerOrderHash, buy.body.orderHash);
    assert.equal(fill.price, '5');
    assert.equal(fill.amount, '100');
    assert.equal(fill.settlementMode, 'mock');
    assert.equal(fill.settlementStatus, 'confirmed');
    assert.equal(fill.sourceEventId, 'event-000001');
    assert.equal(Object.hasOwn(fill, 'createdAt'), false);

    const fills = await requestJson(baseUrl, '/v1/fills');
    assert.equal(fills.status, 200);
    assert.equal(fills.body.source, 'in-memory-indexer-projection');
    assert.deepEqual(fills.body.fills, [fill]);

    const trades = await requestJson(baseUrl, '/v1/trades/QI-QUAI');
    assert.equal(trades.status, 200);
    assert.equal(trades.body.source, 'in-memory-indexer-projection');
    assert.deepEqual(trades.body.trades, [
      {
        tradeId: 'trade-000001',
        fillId: 'fill-000001',
        marketId: 'QI-QUAI',
        price: '5',
        amount: '100',
        settlementStatus: 'confirmed',
        proofUrl: '/v1/proofs/trades/trade-000001',
      },
    ]);

    const proof = await requestJson(baseUrl, '/v1/proofs/trades/trade-000001');
    assert.equal(proof.status, 200);
    assert.equal(proof.body.source, 'proof-service-indexer-projection');
    assert.equal(proof.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.deepEqual(proof.body.proof, {
      tradeId: 'trade-000001',
      fillId: 'fill-000001',
      orderHashes: [sell.body.orderHash, buy.body.orderHash],
      settlementMode: 'mock',
      mockSettlementReference: 'mock-settlement-fill-000001',
      settlementTx: null,
      blockNumber: null,
      blockHash: null,
      eventIndex: 0,
      maker: restingSell.owner,
      taker: takerBuy.owner,
      market: 'QI-QUAI',
      price: '5',
      amount: '100',
      fees: {
        maker: '0',
        taker: '0',
      },
      explorerUrl: null,
      safetyNotice: 'Mock proof only: no real Quai transaction, no explorer URL, no funds moved.',
      rawEvent: {
        eventId: 'event-000001',
        type: 'SETTLEMENT_CONFIRMED',
        source: 'mock-settlement',
        fillId: 'fill-000001',
        settlementMode: 'mock',
        mockSettlementReference: 'mock-settlement-fill-000001',
        settlementTx: null,
        blockNumber: null,
        blockHash: null,
        eventIndex: 0,
      },
      createdFromEventId: 'event-000001',
    });

    const bookAfterMatch = await requestJson(baseUrl, '/v1/orderbook/QI-QUAI');
    assert.equal(bookAfterMatch.status, 200);
    assert.deepEqual(bookAfterMatch.body.bids, []);
    assert.deepEqual(bookAfterMatch.body.asks, []);
  });
});

test('proof routes return deterministic projection-shaped not-found responses', async () => {
  await withServer(async (baseUrl) => {
    const proof = await requestJson(baseUrl, '/v1/proofs/trades/mock-trade-0001');

    assert.equal(proof.status, 404);
    assert.deepEqual(proof.body, {
      error: 'proof_not_found',
      tradeId: 'mock-trade-0001',
      proof: null,
      source: 'proof-service-indexer-projection',
      custody: 'non-custodial-no-withdrawal-authority',
      message: 'No indexed settlement proof exists for this trade yet.',
    });
  });
});
