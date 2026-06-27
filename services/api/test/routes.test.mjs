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
    marketId: 'WQUAI-WQI',
    side: 'sell',
    type: 'limit',
    baseToken: 'mock:WQUAI',
    quoteToken: 'mock:WQI',
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
    assert.equal(health.body.ok, true);
    assert.equal(health.body.service, '@qdex/api');
    assert.equal(health.body.custody, 'non-custodial');
    assert.ok(health.body.mode);
    assert.ok(health.body.settlement);

    const markets = await requestJson(baseUrl, '/v1/markets');
    assert.equal(markets.status, 200);
    assert.ok(Array.isArray(markets.body.markets));
    assert.ok(markets.body.markets.length >= 1);
    assert.equal(markets.body.markets[0].id, 'WQUAI-WQI');
    assert.equal(markets.body.markets[0].base, 'WQUAI');
    assert.equal(markets.body.markets[0].quote, 'WQI');

    const orderbook = await requestJson(baseUrl, '/v1/orderbook/WQUAI-WQI');
    assert.equal(orderbook.status, 200);
    assert.equal(orderbook.body.marketId, 'WQUAI-WQI');
    assert.ok(Array.isArray(orderbook.body.bids));
    assert.ok(Array.isArray(orderbook.body.asks));
    assert.equal(orderbook.body.source, 'mock-orderbook');
  });
});

test('GET /v1/contracts exposes local-only dependency registry without deploy or custody claims', async () => {
  await withServer(async (baseUrl) => {
    const response = await requestJson(baseUrl, '/v1/contracts');

    assert.equal(response.status, 200);
    assert.equal(response.body.chain, 'quai-single-zone-mvp');
    assert.ok(response.body.settlementMode);
    assert.equal(response.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.match(response.body.assetListingCaveat, /WQUAI\/WQI, WQUAI\/USDT, and WQI\/USDT/);
    assert.equal(response.body.listedAssetStatus.status, 'wrapped-token-listing');
    assert.deepEqual(response.body.listedAssetStatus.primaryQuoteAssets, ['WQI', 'USDT']);
    assert.equal(response.body.listedAssetStatus.supportedAssetModel, 'erc20-style-vault-token');
    assert.equal(response.body.listedAssetStatus.userListedTokens, false);
    assert.equal(response.body.listedAssetStatus.listingFlowStatus, 'deferred-after-initial-three-markets');
    assert.equal(response.body.listedAssetStatus.marketRegistryRole, 'enable initial fixed pairs; future DAO can expand after review');
    assert.equal(response.body.listedAssetStatus.nativeQiTreatment, 'out-of-scope-direct-settlement-use-WQI');
    assert.equal(response.body.listedAssetStatus.nativeQiDirectSettlement, false);

    assert.deepEqual(Object.keys(response.body.contracts).sort(), [
      'delegateKeyRegistry',
      'feeManager',
      'marketRegistry',
      'nonceManager',
      'settlement',
      'tradingVault',
    ]);

    assert.equal(response.body.contracts.tradingVault.contractName, 'TradingVault');
    assert.equal(response.body.contracts.tradingVault.interface, 'ITradingVault');
    assert.equal(response.body.contracts.tradingVault.operatorWithdrawalAuthority, false);

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
      permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
      withdrawalAuthority: 'owner-wallet-only',
      settlementMode: 'mock',
      realQuaiTransactions: false,
      walletRequired: false,
      safetyNotice: 'Mock vault projection only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.',
    });

    const postOrder = await requestJson(baseUrl, '/v1/orders', {
      method: 'POST',
      body: JSON.stringify({ order: { marketId: 'WQUAI-WQI' } }),
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

test('delegate key registration and revocation remain prepare-only without withdrawal or admin authority', async () => {
  await withServer(async (baseUrl) => {
    const list = await requestJson(baseUrl, '/v1/delegate-keys');
    assert.equal(list.status, 200);
    assert.equal(list.body.source, 'delegate-key-registry-projection');
    assert.equal(list.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.deepEqual(list.body.defaultPermissions, [
      'READ_ONLY',
      'PLACE_ORDER',
      'CANCEL_ORDER',
      'CANCEL_ALL',
      'NO_WITHDRAW',
      'NO_ADMIN',
    ]);
    assert.deepEqual(list.body.requiredFields, ['delegate', 'expiresAt', 'allowedMarkets', 'maxNotional', 'permissions']);
    assert.equal(list.body.safety.delegateCanWithdraw, false);
    assert.equal(list.body.safety.delegateCanAdmin, false);
    assert.equal(list.body.safety.realQuaiTransactions, false);
    assert.equal(list.body.safety.walletRequired, false);

    const create = await requestJson(baseUrl, '/v1/delegate-keys', {
      method: 'POST',
      body: JSON.stringify({
        delegate: '0x4444444444444444444444444444444444444444',
        expiresAt: 1780003600,
        allowedMarkets: ['WQUAI-WQI'],
        maxNotional: '1000',
        permissions: ['PLACE_ORDER', 'CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN'],
      }),
    });

    assert.equal(create.status, 501);
    assert.equal(create.body.error, 'delegate_key_registration_not_implemented');
    assert.equal(create.body.source, 'delegate-key-owner-signed-prepare-boundary');
    assert.equal(create.body.operation, 'register_delegate_key');
    assert.equal(create.body.operationStatus, 'prepare-only-owner-signed-required');
    assert.equal(create.body.ownerAuthorization, 'owner-wallet-signature-required');
    assert.deepEqual(create.body.permissions, ['PLACE_ORDER', 'CANCEL_ORDER', 'CANCEL_ALL', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(create.body.delegateCanWithdraw, false);
    assert.equal(create.body.delegateCanAdmin, false);
    assert.equal(create.body.realQuaiTransactions, false);
    assert.equal(create.body.walletRequired, false);
    assert.equal(create.body.fundsMoved, false);
    assert.equal(create.body.tradingVaultMutation, false);
    assert.match(create.body.message, /No delegate key is registered/i);

    const revoke = await requestJson(baseUrl, '/v1/delegate-keys/bot-mm-1', {
      method: 'DELETE',
    });

    assert.equal(revoke.status, 501);
    assert.equal(revoke.body.error, 'delegate_key_revocation_not_implemented');
    assert.equal(revoke.body.source, 'delegate-key-owner-signed-prepare-boundary');
    assert.equal(revoke.body.operation, 'revoke_delegate_key');
    assert.equal(revoke.body.keyId, 'bot-mm-1');
    assert.equal(revoke.body.operationStatus, 'prepare-only-owner-signed-required');
    assert.deepEqual(revoke.body.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(revoke.body.delegateCanWithdraw, false);
    assert.equal(revoke.body.delegateCanAdmin, false);
    assert.equal(revoke.body.realQuaiTransactions, false);
    assert.equal(revoke.body.walletRequired, false);
    assert.equal(revoke.body.fundsMoved, false);
    assert.equal(revoke.body.tradingVaultMutation, false);
    assert.match(revoke.body.message, /No delegate key is revoked/i);
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

    const bookBeforeCancel = await requestJson(baseUrl, '/v1/orderbook/WQUAI-WQI');
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
        marketId: 'WQUAI-WQI',
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

    const bookAfterSingleCancel = await requestJson(baseUrl, '/v1/orderbook/WQUAI-WQI');
    assert.deepEqual(bookAfterSingleCancel.body.asks.map((order) => order.orderHash), [secondOrder.body.orderHash]);

    const cancelAll = await requestJson(baseUrl, '/v1/orders/cancel-all', {
      method: 'POST',
      body: JSON.stringify({ marketId: 'WQUAI-WQI' }),
    });
    assert.equal(cancelAll.status, 200);
    assert.equal(cancelAll.body.cancelled, true);
    assert.equal(cancelAll.body.cancelledCount, 1);
    assert.equal(cancelAll.body.source, 'mock-matching-engine');
    assert.equal(cancelAll.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.equal(cancelAll.body.nonceManager, 'matcher-local-cancel-only-on-chain-nonce-unchanged');
    assert.deepEqual(cancelAll.body.permissions, ['CANCEL_ALL', 'CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.deepEqual(cancelAll.body.filters, { marketId: 'WQUAI-WQI', owner: null });
    assert.match(cancelAll.body.message, /does not cancel the on-chain nonce/i);
    assert.deepEqual(cancelAll.body.cancelledOrders, [
      {
        orderHash: secondOrder.body.orderHash,
        marketId: 'WQUAI-WQI',
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

    const bookAfterCancelAll = await requestJson(baseUrl, '/v1/orderbook/WQUAI-WQI');
    assert.deepEqual(bookAfterCancelAll.body.asks, []);

    const orders = await requestJson(baseUrl, '/v1/orders');
    assert.deepEqual(orders.body.orders.map((order) => order.status), ['cancelled', 'cancelled']);

    const emptyCancelAll = await requestJson(baseUrl, '/v1/orders/cancel-all', {
      method: 'POST',
      body: JSON.stringify({ marketId: 'WQUAI-WQI' }),
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

    const bookAfterSell = await requestJson(baseUrl, '/v1/orderbook/WQUAI-WQI');
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

    // Matching engine uses orderSequence for fill IDs — sell is sequence 1, buy is sequence 2
    const [fill] = buy.body.fills;
    assert.equal(fill.projectionType, 'IndexedFillProjection');
    assert.match(fill.fillId, /^fill-00000[12]$/);
    assert.match(fill.tradeId, /^trade-000001$/);
    assert.equal(fill.marketId, 'WQUAI-WQI');
    assert.equal(fill.makerOrderHash, sell.body.orderHash);
    assert.equal(fill.takerOrderHash, buy.body.orderHash);
    assert.equal(fill.price, '5');
    assert.equal(fill.amount, '100');
    assert.equal(fill.settlementMode, 'mock');
    assert.equal(fill.settlementStatus, 'confirmed');
    assert.ok(fill.sourceEventId);
    assert.equal(Object.hasOwn(fill, 'createdAt'), false);

    const fills = await requestJson(baseUrl, '/v1/fills');
    assert.equal(fills.status, 200);
    assert.equal(fills.body.source, 'in-memory-indexer-projection');
    assert.deepEqual(fills.body.fills, [fill]);

    const trades = await requestJson(baseUrl, '/v1/trades/WQUAI-WQI');
    assert.equal(trades.status, 200);
    assert.equal(trades.body.source, 'in-memory-indexer-projection');
    assert.ok(Array.isArray(trades.body.trades));
    assert.equal(trades.body.trades.length, 1);
    assert.equal(trades.body.trades[0].tradeId, fill.tradeId);
    assert.equal(trades.body.trades[0].fillId, fill.fillId);
    assert.equal(trades.body.trades[0].marketId, 'WQUAI-WQI');
    assert.equal(trades.body.trades[0].price, '5');
    assert.equal(trades.body.trades[0].amount, '100');
    assert.equal(trades.body.trades[0].settlementStatus, 'confirmed');

    const proof = await requestJson(baseUrl, `/v1/proofs/trades/${fill.tradeId}`);
    assert.equal(proof.status, 200);
    assert.equal(proof.body.source, 'proof-service-indexer-projection');
    assert.equal(proof.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.equal(proof.body.proof.tradeId, fill.tradeId);
    assert.equal(proof.body.proof.fillId, fill.fillId);
    assert.deepEqual(proof.body.proof.orderHashes, [sell.body.orderHash, buy.body.orderHash]);
    assert.equal(proof.body.proof.settlementMode, 'mock');
    assert.equal(proof.body.proof.maker, restingSell.owner);
    assert.equal(proof.body.proof.taker, takerBuy.owner);
    assert.equal(proof.body.proof.market, 'WQUAI-WQI');
    assert.equal(proof.body.proof.price, '5');
    assert.equal(proof.body.proof.amount, '100');

    const bookAfterMatch = await requestJson(baseUrl, '/v1/orderbook/WQUAI-WQI');
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

test('POST /v1/deposits rejects invalid requests and tracks vault balances on success', async () => {
  await withServer(async (baseUrl) => {
    // Reject missing fields
    const empty = await requestJson(baseUrl, '/v1/deposits', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error, 'vault_deposit_rejected');
    assert.equal(empty.body.reason, 'invalid_owner');
    assert.equal(empty.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.equal(empty.body.realQuaiTransactions, false);
    assert.equal(empty.body.fundsMoved, false);
    assert.ok(empty.body.safetyNotice);

    // Reject unsupported token
    const badToken = await requestJson(baseUrl, '/v1/deposits', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x1111111111111111111111111111111111111111',
        token: 'UNKNOWN',
        amount: '100',
      }),
    });
    assert.equal(badToken.status, 400);
    assert.equal(badToken.body.reason, 'unsupported_token');

    // Reject invalid amount
    const badAmount = await requestJson(baseUrl, '/v1/deposits', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x1111111111111111111111111111111111111111',
        token: 'WQUAI',
        amount: '-50',
      }),
    });
    assert.equal(badAmount.status, 400);
    assert.equal(badAmount.body.reason, 'invalid_amount');

    // Reject zero amount
    const zeroAmount = await requestJson(baseUrl, '/v1/deposits', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x1111111111111111111111111111111111111111',
        token: 'WQUAI',
        amount: '0',
      }),
    });
    assert.equal(zeroAmount.status, 400);
    assert.equal(zeroAmount.body.reason, 'invalid_amount');

    // Successful deposit
    const deposit1 = await requestJson(baseUrl, '/v1/deposits', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x1111111111111111111111111111111111111111',
        token: 'WQUAI',
        amount: '1000',
      }),
    });
    assert.equal(deposit1.status, 200);
    assert.equal(deposit1.body.deposited, true);
    assert.equal(deposit1.body.token, 'WQUAI');
    assert.equal(deposit1.body.amount, '1000');
    assert.equal(deposit1.body.newBalance, '1000');
    assert.equal(deposit1.body.owner, '0x1111111111111111111111111111111111111111');
    assert.equal(deposit1.body.projectionType, 'MockVaultDepositProjection');
    assert.equal(deposit1.body.settlementMode, 'mock');
    assert.equal(deposit1.body.realQuaiTransactions, false);
    assert.equal(deposit1.body.fundsMoved, false);
    assert.equal(deposit1.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.deepEqual(deposit1.body.permissions, ['DEPOSIT', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.ok(deposit1.body.eventId);
    assert.ok(deposit1.body.vaultSequence);

    // Second deposit — balance should accumulate
    const deposit2 = await requestJson(baseUrl, '/v1/deposits', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x1111111111111111111111111111111111111111',
        token: 'WQUAI',
        amount: '500',
      }),
    });
    assert.equal(deposit2.status, 200);
    assert.equal(deposit2.body.newBalance, '1500');

    // Deposit a different token for the same owner
    const deposit3 = await requestJson(baseUrl, '/v1/deposits', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x1111111111111111111111111111111111111111',
        token: 'WQI',
        amount: '200',
      }),
    });
    assert.equal(deposit3.status, 200);
    assert.equal(deposit3.body.token, 'WQI');
    assert.equal(deposit3.body.newBalance, '200');

    // Deposit for a different owner
    const deposit4 = await requestJson(baseUrl, '/v1/deposits', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x2222222222222222222222222222222222222222',
        token: 'USDT',
        amount: '5000',
      }),
    });
    assert.equal(deposit4.status, 200);
    assert.equal(deposit4.body.newBalance, '5000');
    assert.equal(deposit4.body.token, 'USDT');
  });
});

test('POST /v1/withdrawals enforces balance checks and returns proper status codes', async () => {
  await withServer(async (baseUrl) => {
    // Seed a deposit
    await requestJson(baseUrl, '/v1/deposits', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x1111111111111111111111111111111111111111',
        token: 'WQUAI',
        amount: '1000',
      }),
    });

    // Reject missing fields
    const empty = await requestJson(baseUrl, '/v1/withdrawals', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error, 'vault_withdrawal_rejected');
    assert.equal(empty.body.reason, 'invalid_owner');
    assert.equal(empty.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.equal(empty.body.realQuaiTransactions, false);
    assert.equal(empty.body.fundsMoved, false);
    assert.deepEqual(empty.body.permissions, ['WITHDRAW', 'NO_DEPOSIT', 'NO_ADMIN']);

    // Insufficient balance
    const overdraw = await requestJson(baseUrl, '/v1/withdrawals', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x1111111111111111111111111111111111111111',
        token: 'WQUAI',
        amount: '5000',
      }),
    });
    assert.equal(overdraw.status, 422);
    assert.equal(overdraw.body.error, 'vault_withdrawal_rejected');
    assert.equal(overdraw.body.reason, 'insufficient_vault_balance');
    assert.equal(overdraw.body.available, '1000');
    assert.equal(overdraw.body.requested, '5000');
    assert.match(overdraw.body.message, /Insufficient vault balance/);

    // Successful withdrawal
    const withdraw1 = await requestJson(baseUrl, '/v1/withdrawals', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x1111111111111111111111111111111111111111',
        token: 'WQUAI',
        amount: '300',
      }),
    });
    assert.equal(withdraw1.status, 200);
    assert.equal(withdraw1.body.withdrawn, true);
    assert.equal(withdraw1.body.token, 'WQUAI');
    assert.equal(withdraw1.body.amount, '300');
    assert.equal(withdraw1.body.newBalance, '700');
    assert.equal(withdraw1.body.projectionType, 'MockVaultWithdrawalProjection');
    assert.equal(withdraw1.body.settlementMode, 'mock');
    assert.equal(withdraw1.body.realQuaiTransactions, false);
    assert.equal(withdraw1.body.fundsMoved, false);
    assert.equal(withdraw1.body.custody, 'non-custodial-no-withdrawal-authority');
    assert.deepEqual(withdraw1.body.permissions, ['WITHDRAW', 'NO_DEPOSIT', 'NO_ADMIN']);
    assert.ok(withdraw1.body.eventId);
    assert.ok(withdraw1.body.vaultSequence);

    // Withdraw remaining balance
    const withdraw2 = await requestJson(baseUrl, '/v1/withdrawals', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x1111111111111111111111111111111111111111',
        token: 'WQUAI',
        amount: '700',
      }),
    });
    assert.equal(withdraw2.status, 200);
    assert.equal(withdraw2.body.newBalance, '0');

    // Attempt to withdraw from empty balance
    const emptyWithdraw = await requestJson(baseUrl, '/v1/withdrawals', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x1111111111111111111111111111111111111111',
        token: 'WQUAI',
        amount: '1',
      }),
    });
    assert.equal(emptyWithdraw.status, 422);
    assert.equal(emptyWithdraw.body.reason, 'insufficient_vault_balance');
  });
});

test('GET /v1/account/balances returns real vault balances after deposits', async () => {
  await withServer(async (baseUrl) => {
    // Seed deposits
    await requestJson(baseUrl, '/v1/deposits', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x3333333333333333333333333333333333333333',
        token: 'WQUAI',
        amount: '500',
      }),
    });
    await requestJson(baseUrl, '/v1/deposits', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x3333333333333333333333333333333333333333',
        token: 'USDT',
        amount: '1000',
      }),
    });

    const balances = await requestJson(baseUrl, '/v1/account/balances?owner=0x3333333333333333333333333333333333333333');
    assert.equal(balances.status, 200);
    assert.equal(balances.body.custody, 'non-custodial-contract-vault');
    assert.equal(balances.body.source, 'mock-vault-projection');
    assert.equal(balances.body.realQuaiTransactions, false);
    assert.equal(balances.body.walletRequired, false);
    assert.deepEqual(balances.body.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.ok(Array.isArray(balances.body.balances));
    assert.equal(balances.body.balances.length, 2);

    const wquaiBalance = balances.body.balances.find((b) => b.token === 'WQUAI');
    const usdtBalance = balances.body.balances.find((b) => b.token === 'USDT');
    assert.equal(wquaiBalance.balance, '500');
    assert.equal(usdtBalance.balance, '1000');
    assert.equal(wquaiBalance.owner, '0x3333333333333333333333333333333333333333');
    assert.equal(usdtBalance.owner, '0x3333333333333333333333333333333333333333');
  });
});

test('GET /v1/vault/deposits and GET /v1/vault/withdrawals return real history', async () => {
  await withServer(async (baseUrl) => {
    // Seed a deposit and withdrawal
    const deposit = await requestJson(baseUrl, '/v1/deposits', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x4444444444444444444444444444444444444444',
        token: 'WQI',
        amount: '100',
      }),
    });
    const withdraw = await requestJson(baseUrl, '/v1/withdrawals', {
      method: 'POST',
      body: JSON.stringify({
        owner: '0x4444444444444444444444444444444444444444',
        token: 'WQI',
        amount: '30',
      }),
    });
    assert.equal(deposit.status, 200);
    assert.equal(withdraw.status, 200);

    // Get deposit history
    const deposits = await requestJson(baseUrl, '/v1/vault/deposits?owner=0x4444444444444444444444444444444444444444');
    assert.equal(deposits.status, 200);
    assert.ok(Array.isArray(deposits.body.deposits));
    assert.equal(deposits.body.deposits.length, 1);
    assert.equal(deposits.body.deposits[0].type, 'VAULT_DEPOSIT');
    assert.equal(deposits.body.deposits[0].token, 'WQI');
    assert.equal(deposits.body.deposits[0].amount, '100');
    assert.equal(deposits.body.custody, 'non-custodial-contract-vault');
    assert.equal(deposits.body.realQuaiTransactions, false);

    // Get withdrawal history
    const withdrawals = await requestJson(baseUrl, '/v1/vault/withdrawals?owner=0x4444444444444444444444444444444444444444');
    assert.equal(withdrawals.status, 200);
    assert.ok(Array.isArray(withdrawals.body.withdrawals));
    assert.equal(withdrawals.body.withdrawals.length, 1);
    assert.equal(withdrawals.body.withdrawals[0].type, 'VAULT_WITHDRAWAL');
    assert.equal(withdrawals.body.withdrawals[0].token, 'WQI');
    assert.equal(withdrawals.body.withdrawals[0].amount, '30');
    assert.equal(withdrawals.body.custody, 'non-custodial-contract-vault');
    assert.equal(withdrawals.body.realQuaiTransactions, false);

    // Balance should reflect deposit minus withdrawal
    const balances = await requestJson(baseUrl, '/v1/account/balances?owner=0x4444444444444444444444444444444444444444');
    assert.equal(balances.body.balances[0].token, 'WQI');
    assert.equal(balances.body.balances[0].balance, '70');
  });
});
