import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { QDexClient, createMockSignedOrder, runMockCrossSmoke } from '../src/client.js';

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

test('TypeScript SDK smoke drives mock API order -> fill -> proof loop without custody shortcuts', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });

    const markets = await client.markets.list();
    assert.equal(markets[0].id, 'QI-QUAI');

    const bookBefore = await client.orderbook.get('QI-QUAI');
    assert.equal(bookBefore.source, 'mock-orderbook');
    assert.deepEqual(bookBefore.bids, []);
    assert.deepEqual(bookBefore.asks, []);

    const restingSell = createMockSignedOrder({
      side: 'sell',
      amount: '100',
      price: '5',
      nonce: '901',
      owner: '0x1111111111111111111111111111111111111111',
    });
    const crossingBuy = createMockSignedOrder({
      side: 'buy',
      amount: '100',
      price: '6',
      nonce: '902',
      owner: '0x3333333333333333333333333333333333333333',
    });

    const smoke = await runMockCrossSmoke(client, { restingSell, crossingBuy });

    assert.equal(smoke.marketId, 'QI-QUAI');
    assert.equal(smoke.restingOrder.status, 'filled');
    assert.equal(smoke.crossingOrder.status, 'filled');
    assert.equal(smoke.fill.fillId, 'fill-000001');
    assert.equal(smoke.fill.projectionType, 'IndexedFillProjection');
    assert.equal(smoke.fill.tradeId, 'trade-000001');
    assert.equal(smoke.fill.sourceEventId, 'event-000001');
    assert.equal(smoke.fill.settlementMode, 'mock');
    assert.equal(smoke.fill.settlementStatus, 'confirmed');
    assert.equal(Object.hasOwn(smoke.fill, 'createdAt'), false);

    assert.equal(smoke.fills.source, 'in-memory-indexer-projection');
    assert.deepEqual(smoke.fills.fills, [smoke.fill]);

    assert.equal(smoke.trades.source, 'in-memory-indexer-projection');
    assert.equal(smoke.trades.trades[0].proofUrl, '/v1/proofs/trades/trade-000001');

    assert.equal(smoke.proofEnvelope.source, 'proof-service-indexer-projection');
    assert.equal(smoke.proof.settlementMode, 'mock');
    assert.equal(smoke.proof.mockSettlementReference, 'mock-settlement-fill-000001');
    assert.equal(smoke.proof.settlementTx, null);
    assert.equal(smoke.proof.blockNumber, null);
    assert.equal(smoke.proof.blockHash, null);
    assert.equal(smoke.proof.explorerUrl, null);
    assert.match(smoke.proof.safetyNotice, /no real Quai transaction, no explorer URL, no funds moved/);

    const delegateKeys = await client.delegateKeys.list();
    assert.ok(delegateKeys.defaultPermissions.includes('NO_WITHDRAW'));
    assert.ok(delegateKeys.defaultPermissions.includes('NO_ADMIN'));
  });
});

test('TypeScript SDK exposes local-only contract registry metadata without wallet or deploy authority', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });

    const registry = await client.contracts.get();

    assert.equal(registry.deploymentStatus, 'local-only-not-deployed');
    assert.equal(registry.realQuaiTransactions, false);
    assert.equal(registry.walletRequired, false);
    assert.match(registry.nativeQiCaveat, /UTXO-model/);
    assert.equal(registry.contracts.tradingVault.address, null);
    assert.equal(registry.contracts.tradingVault.operatorWithdrawalAuthority, false);
    assert.equal(registry.contracts.settlement.proofTrigger, 'TradeSettled');
    assert.deepEqual(registry.contracts.settlement.dependencies, [
      'TradingVault',
      'NonceManager',
      'MarketRegistry',
      'FeeManager',
      'DelegateKeyRegistry',
    ]);
    assert.equal(registry.contracts.nonceManager.nonceTruth, 'external-nonce-manager');
    assert.equal(registry.contracts.marketRegistry.marketTruth, 'external-market-registry');
    assert.equal(registry.contracts.feeManager.feeTruth, 'external-fee-manager');
    assert.deepEqual(registry.contracts.delegateKeyRegistry.requiredPermissions, [
      'PLACE_ORDER',
      'NO_WITHDRAW',
      'NO_ADMIN',
    ]);
    assert.equal(registry.safety.approvalGate, 'explicit-approval-required-before-deploy-or-transaction');
  });
});

test('TypeScript SDK exposes owner-signed nonce-cancel prepare placeholder without wallet or tx authority', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });

    const result = await client.nonces.prepareCancel({
      action: 'cancelNonce',
      owner: '0x1111111111111111111111111111111111111111',
      nonce: '77',
      chainId: 0,
      nonceManagerContract: '0x0000000000000000000000000000000000000000',
      expiresAt: 1780003600,
      signature: '0xowner-signed-placeholder',
    });

    assert.equal(result.status, 501);
    assert.equal(result.body.error, 'owner_signed_nonce_cancel_not_implemented');
    assert.equal(result.body.source, 'owner-signed-nonce-cancel-placeholder');
    assert.equal(result.body.custody, 'non-custodial');
    assert.equal(result.body.nonceManager, 'owner-signed-required');
    assert.deepEqual(result.body.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(result.body.permissions.includes('CANCEL_ORDER'), false);
    assert.match(result.body.message, /Matcher-local cancellation does not mutate on-chain NonceManager nonces/);
    assert.equal(result.body.realQuaiTransactions, false);
    assert.equal(result.body.walletRequired, false);
    assert.equal(result.body.approvalGate, 'explicit-approval-required-before-wallet-signing-or-quai-broadcast');
  });
});

test('TypeScript SDK cancelAll cancels mock resting orders without nonce or withdrawal authority', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });

    const restingSell = createMockSignedOrder({
      side: 'sell',
      amount: '100',
      price: '5',
      nonce: '906',
      owner: '0x1111111111111111111111111111111111111111',
    });
    const acceptedOrder = await client.orders.submitSignedOrder(restingSell);
    assert.equal(acceptedOrder.status, 'open');

    const cancelResult = await client.orders.cancelAll({ marketId: 'QI-QUAI' });
    assert.equal(cancelResult.cancelled, true);
    assert.equal(cancelResult.cancelledCount, 1);
    assert.deepEqual(cancelResult.permissions, ['CANCEL_ALL', 'CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(cancelResult.nonceManager, 'matcher-local-cancel-only-on-chain-nonce-unchanged');
    assert.match(cancelResult.message, /does not cancel the on-chain nonce/i);
    assert.equal(cancelResult.cancelledOrders[0].orderHash, acceptedOrder.orderHash);
    assert.equal(cancelResult.cancelledOrders[0].status, 'cancelled');
    assert.equal(cancelResult.cancelledOrders[0].remainingAmount, '0');
    assert.equal(cancelResult.cancelledOrders[0].nonceCancellation, 'not-implied-matcher-local-only');

    const bookAfterCancel = await client.orderbook.get('QI-QUAI');
    assert.deepEqual(bookAfterCancel.asks, []);
  });
});

test('TypeScript SDK consumes private fills stream over local WebSocket with live fanout', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });
    const fillsStream = client.fills.openStream({ timeoutMs: 2_000 });

    try {
      const initialMessage = await fillsStream.next();
      assert.equal(initialMessage.type, 'snapshot');
      assert.equal(initialMessage.transport, 'websocket');
      assert.equal(initialMessage.snapshot.channel, 'fills');
      assert.equal(initialMessage.snapshot.visibility, 'private');
      assert.deepEqual(initialMessage.snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.deepEqual(initialMessage.snapshot.data.fills, []);

      const restingSell = createMockSignedOrder({
        side: 'sell',
        amount: '100',
        price: '5',
        nonce: '904',
        owner: '0x1111111111111111111111111111111111111111',
      });
      const crossingBuy = createMockSignedOrder({
        side: 'buy',
        amount: '100',
        price: '6',
        nonce: '905',
        owner: '0x3333333333333333333333333333333333333333',
      });

      const restingOrder = await client.orders.submitSignedOrder(restingSell);
      assert.equal(restingOrder.fills.length, 0);
      const crossingOrder = await client.orders.submitSignedOrder(crossingBuy);
      assert.equal(crossingOrder.fills.length, 1);

      const liveMessage = await fillsStream.next();
      assert.equal(liveMessage.streamEvent.reason, 'mock_settlement_confirmed');
      assert.deepEqual(liveMessage.streamEvent.channels, [
        'market.QI-QUAI.depth',
        'orders',
        'market.QI-QUAI.trades',
        'fills',
        'settlements',
        'global.tickers',
      ]);
      assert.equal(liveMessage.snapshot.source, 'in-memory-indexer-projection');
      assert.deepEqual(liveMessage.snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.deepEqual(liveMessage.snapshot.data.fills, [crossingOrder.fills[0]]);
      assert.equal(liveMessage.snapshot.data.fills[0].projectionType, 'IndexedFillProjection');
      assert.equal(liveMessage.snapshot.data.fills[0].sourceEventId, 'event-000001');
      assert.equal(Object.hasOwn(liveMessage.snapshot.data.fills[0], 'createdAt'), false);
    } finally {
      await fillsStream.close();
    }
  });
});

test('TypeScript SDK consumes private orders stream for matcher-local cancellation updates', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });
    const ordersStream = client.orders.openStream({ timeoutMs: 2_000 });

    try {
      const initialMessage = await ordersStream.next();
      assert.equal(initialMessage.type, 'snapshot');
      assert.equal(initialMessage.transport, 'websocket');
      assert.equal(initialMessage.snapshot.channel, 'orders');
      assert.equal(initialMessage.snapshot.visibility, 'private');
      assert.deepEqual(initialMessage.snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.deepEqual(initialMessage.snapshot.data.orders, []);

      const restingSell = createMockSignedOrder({
        side: 'sell',
        amount: '100',
        price: '5',
        nonce: '907',
        owner: '0x1111111111111111111111111111111111111111',
      });

      const acceptedOrder = await client.orders.submitSignedOrder(restingSell);
      assert.equal(acceptedOrder.status, 'open');

      const openMessage = await ordersStream.next();
      assert.equal(openMessage.streamEvent.reason, 'orderbook_changed');
      assert.deepEqual(openMessage.snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.equal(openMessage.snapshot.data.orders[0].orderHash, acceptedOrder.orderHash);
      assert.equal(openMessage.snapshot.data.orders[0].status, 'open');
      assert.equal(Object.hasOwn(openMessage.snapshot.data.orders[0], 'createdAt'), false);

      const cancelResult = await client.orders.cancel(acceptedOrder.orderHash);
      assert.equal(cancelResult.cancelled, true);
      assert.equal(cancelResult.nonceManager, 'matcher-local-cancel-only-on-chain-nonce-unchanged');

      const cancelMessage = await ordersStream.next();
      assert.equal(cancelMessage.streamEvent.reason, 'matcher_local_order_cancelled');
      assert.deepEqual(cancelMessage.streamEvent.channels, ['market.QI-QUAI.depth', 'orders']);
      assert.equal(cancelMessage.streamEvent.nonceManager, 'matcher-local-cancel-only-on-chain-nonce-unchanged');
      assert.deepEqual(cancelMessage.streamEvent.permissions, ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.deepEqual(cancelMessage.streamEvent.cancelledOrderHashes, [acceptedOrder.orderHash]);
      assert.match(cancelMessage.streamEvent.message, /does not cancel the on-chain nonce/i);
      assert.deepEqual(cancelMessage.snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.equal(cancelMessage.snapshot.data.orders[0].orderHash, acceptedOrder.orderHash);
      assert.equal(cancelMessage.snapshot.data.orders[0].status, 'cancelled');
      assert.equal(cancelMessage.snapshot.data.orders[0].remainingAmount, '0');
      assert.equal(cancelMessage.snapshot.data.orders[0].nonceCancellation, 'not-implied-matcher-local-only');
      assert.equal(Object.hasOwn(cancelMessage.snapshot.data.orders[0], 'createdAt'), false);
    } finally {
      await ordersStream.close();
    }
  });
});

test('TypeScript SDK preserves market_ioc as signed IOC limit order with slippage bounds', () => {
  const order = createMockSignedOrder({
    side: 'sell',
    type: 'market_ioc',
    timeInForce: 'IOC',
    maxSlippageBps: 50,
    nonce: '903',
  });

  assert.equal(order.type, 'market_ioc');
  assert.equal(order.timeInForce, 'IOC');
  assert.equal(order.maxSlippageBps, 50);
  assert.equal(order.signature.scheme, 'mock');
  assert.equal(order.signature.signer, order.owner);
});
