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

test('GET /v1/relayer/settlement-mode-gate exposes read-only approval gate status', async () => {
  await withServer(async (baseUrl) => {
    const response = await requestJson(baseUrl, '/v1/relayer/settlement-mode-gate');

    assert.equal(response.status, 200);
    assert.equal(response.body.source, 'relayer-approval-gate');
    assert.equal(response.body.currentSettlementMode, 'mock');
    assert.equal(response.body.custody, 'non-custodial-relayer-gate');
    assert.equal(response.body.realQuaiTransactions, false);
    assert.equal(response.body.walletRequired, false);

    assert.equal(response.body.modes.mock.allowed, true);
    assert.equal(response.body.modes.mock.reason, 'mock_mode_local_only');
    assert.equal(response.body.modes.mock.realQuaiTransactions, false);
    assert.equal(response.body.modes.mock.walletRequired, false);

    assert.equal(response.body.modes.quai_contract.allowed, false);
    assert.equal(response.body.modes.quai_contract.reason, 'real_quai_approval_gate_blocked');
    assert.equal(response.body.modes.quai_contract.realQuaiTransactions, false);
    assert.equal(response.body.modes.quai_contract.walletRequired, false);
    assert.ok(response.body.modes.quai_contract.missingFields.includes('approval.explicitApproval'));
    assert.ok(response.body.modes.quai_contract.missingFields.includes('eventTruth.requiredFields.settlementTx'));
    assert.deepEqual(response.body.modes.quai_contract.requiredEventTruthFields, [
      'settlementTx',
      'blockNumber',
      'blockHash',
      'eventIndex',
      'explorerUrl',
    ]);

    assert.deepEqual(response.body.safety, {
      approvalRequired: true,
      explicitApproval: 'Clonners approval required before quai_contract activation',
      noWalletLoading: true,
      noSigning: true,
      noBroadcast: true,
      noRpcUrlAccess: true,
      noTransactionSubmission: true,
      proofTrigger: 'TradeSettled',
      notice:
        'Read-only relayer gate metadata only: no wallet loading, signing, broadcast, RPC URL access, or transaction submission is performed.',
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
    assert.equal(postOrder.status, 400);
    assert.equal(postOrder.body.error, 'order_rejected');
    assert.equal(postOrder.body.reason, 'missing_required_fields');
    assert.equal(postOrder.body.custody, 'non-custodial-no-withdrawal-authority');
  });
});

test('POST /v1/nonces/cancel is an owner-signed NonceManager placeholder without tx authority', async () => {
  await withServer(async (baseUrl) => {
    const response = await requestJson(baseUrl, '/v1/nonces/cancel', {
      method: 'POST',
      body: JSON.stringify({
        action: 'cancelNonce',
        owner: '0x1111111111111111111111111111111111111111',
        nonce: '42',
        nonceRange: null,
        chainId: 0,
        nonceManagerContract: '0x0000000000000000000000000000000000000000',
        expiresAt: 1780003600,
        signature: '0xowner-signed-placeholder',
      }),
    });

    assert.equal(response.status, 501);
    assert.deepEqual(response.body, {
      error: 'owner_signed_nonce_cancel_not_implemented',
      source: 'owner-signed-nonce-cancel-placeholder',
      custody: 'non-custodial',
      nonceManager: 'owner-signed-required',
      permissions: ['NO_WITHDRAW', 'NO_ADMIN'],
      message: 'Matcher-local cancellation does not mutate on-chain NonceManager nonces.',
      realQuaiTransactions: false,
      walletRequired: false,
      approvalGate: 'explicit-approval-required-before-wallet-signing-or-quai-broadcast',
    });
  });
});

test('mock order cancellation removes only matcher-open quantity without nonce or withdrawal authority', async () => {
  await withServer(async (baseUrl) => {
    const firstRestingSell = mockOrder({
      side: 'sell',
      amount: '100',
      price: '5',
      nonce: '301',
      owner: '0x1111111111111111111111111111111111111111',
    });
    const secondRestingSell = mockOrder({
      side: 'sell',
      amount: '200',
      price: '6',
      nonce: '302',
      owner: '0x2222222222222222222222222222222222222222',
    });

    const firstOrder = await requestJson(baseUrl, '/v1/orders', {
      method: 'POST',
      body: JSON.stringify({ order: firstRestingSell }),
    });
    const secondOrder = await requestJson(baseUrl, '/v1/orders', {
      method: 'POST',
      body: JSON.stringify({ order: secondRestingSell }),
    });
    assert.equal(firstOrder.status, 201);
    assert.equal(secondOrder.status, 201);

    const bookBeforeCancel = await requestJson(baseUrl, '/v1/orderbook/QI-QUAI');
    assert.deepEqual(bookBeforeCancel.body.asks.map((order) => order.orderHash), [
      firstOrder.body.orderHash,
      secondOrder.body.orderHash,
    ]);

    const cancelOne = await requestJson(baseUrl, `/v1/orders/${encodeURIComponent(firstOrder.body.orderHash)}`, {
      method: 'DELETE',
    });
    assert.equal(cancelOne.status, 200);
    assert.equal(cancelOne.body.cancelled, true);
    assert.equal(cancelOne.body.cancelledCount, 1);
    assert.equal(cancelOne.body.orderHash, firstOrder.body.orderHash);
    assert.equal(cancelOne.body.source, 'mock-matching-engine');
    assert.equal(cancelOne.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.equal(cancelOne.body.nonceManager, 'matcher-local-cancel-only-on-chain-nonce-unchanged');
    assert.deepEqual(cancelOne.body.permissions, ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.match(cancelOne.body.message, /does not cancel the on-chain nonce/i);
    assert.deepEqual(cancelOne.body.cancelledOrders, [
      {
        orderHash: firstOrder.body.orderHash,
        marketId: 'QI-QUAI',
        owner: firstRestingSell.owner,
        delegate: ZERO_DELEGATE,
        side: 'sell',
        type: 'limit',
        amount: '100',
        price: '5',
        filledAmount: '0',
        remainingAmount: '0',
        status: 'cancelled',
        custody: 'non-custodial-no-withdrawal-authority',
        cancelledAmount: '100',
        cancelReason: 'cancel_order',
        nonceCancellation: 'not-implied-matcher-local-only',
      },
    ]);

    const missingCancel = await requestJson(baseUrl, '/v1/orders/0xmissing', {
      method: 'DELETE',
    });
    assert.equal(missingCancel.status, 404);
    assert.equal(missingCancel.body.error, 'order_not_found');
    assert.equal(missingCancel.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.equal(missingCancel.body.nonceManager, 'matcher-local-cancel-only-on-chain-nonce-unchanged');
    assert.deepEqual(missingCancel.body.permissions, ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.match(missingCancel.body.message, /No mock matcher order exists/);

    const alreadyCancelled = await requestJson(baseUrl, `/v1/orders/${encodeURIComponent(firstOrder.body.orderHash)}`, {
      method: 'DELETE',
    });
    assert.equal(alreadyCancelled.status, 409);
    assert.equal(alreadyCancelled.body.error, 'order_not_open');
    assert.equal(alreadyCancelled.body.orderHash, firstOrder.body.orderHash);
    assert.equal(alreadyCancelled.body.status, 'cancelled');
    assert.equal(alreadyCancelled.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.equal(alreadyCancelled.body.nonceManager, 'matcher-local-cancel-only-on-chain-nonce-unchanged');
    assert.deepEqual(alreadyCancelled.body.permissions, ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.match(alreadyCancelled.body.message, /Only remaining matcher-open quantity/);

    const bookAfterSingleCancel = await requestJson(baseUrl, '/v1/orderbook/QI-QUAI');
    assert.deepEqual(bookAfterSingleCancel.body.asks.map((order) => order.orderHash), [secondOrder.body.orderHash]);

    const cancelAll = await requestJson(baseUrl, '/v1/orders/cancel-all', {
      method: 'POST',
      body: JSON.stringify({ marketId: 'QI-QUAI' }),
    });
    assert.equal(cancelAll.status, 200);
    assert.equal(cancelAll.body.cancelled, true);
    assert.equal(cancelAll.body.cancelledCount, 1);
    assert.equal(cancelAll.body.source, 'mock-matching-engine');
    assert.equal(cancelAll.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.equal(cancelAll.body.nonceManager, 'matcher-local-cancel-only-on-chain-nonce-unchanged');
    assert.deepEqual(cancelAll.body.permissions, ['CANCEL_ALL', 'CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.deepEqual(cancelAll.body.filters, { marketId: 'QI-QUAI', owner: null });
    assert.match(cancelAll.body.message, /does not cancel the on-chain nonce/i);
    assert.deepEqual(cancelAll.body.cancelledOrders, [
      {
        orderHash: secondOrder.body.orderHash,
        marketId: 'QI-QUAI',
        owner: secondRestingSell.owner,
        delegate: ZERO_DELEGATE,
        side: 'sell',
        type: 'limit',
        amount: '200',
        price: '6',
        filledAmount: '0',
        remainingAmount: '0',
        status: 'cancelled',
        custody: 'non-custodial-no-withdrawal-authority',
        cancelledAmount: '200',
        cancelReason: 'cancel_all',
        nonceCancellation: 'not-implied-matcher-local-only',
      },
    ]);

    const bookAfterCancelAll = await requestJson(baseUrl, '/v1/orderbook/QI-QUAI');
    assert.deepEqual(bookAfterCancelAll.body.asks, []);

    const orders = await requestJson(baseUrl, '/v1/orders');
    assert.deepEqual(orders.body.orders.map((order) => order.status), ['cancelled', 'cancelled']);

    const emptyCancelAll = await requestJson(baseUrl, '/v1/orders/cancel-all', {
      method: 'POST',
      body: JSON.stringify({ marketId: 'QI-QUAI' }),
    });
    assert.equal(emptyCancelAll.status, 200);
    assert.equal(emptyCancelAll.body.cancelled, false);
    assert.equal(emptyCancelAll.body.cancelledCount, 0);
    assert.deepEqual(emptyCancelAll.body.cancelledOrders, []);
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
    assert.equal(fill.projectionType, 'IndexedFillProjection');
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
