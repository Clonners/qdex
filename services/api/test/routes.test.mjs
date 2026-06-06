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
    body: await response.json(),
  };
};

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
    assert.equal(postOrder.status, 501);
    assert.equal(postOrder.body.error, 'not_implemented');
    assert.equal(postOrder.body.route, 'POST /v1/orders');
    assert.equal(postOrder.body.next, 'wire_signed_order_validation_and_matching_engine');
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
      source: 'mock-proof-projection',
      message: 'No indexed settlement proof exists for this trade yet.',
    });
  });
});
