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

const localListingReviewRequest = (overrides = {}) => ({
  baseSymbol: 'COMMUNITY',
  quoteSymbol: 'WQI',
  tokenModel: 'erc20-style-vault-token',
  requestedMarketId: 'COMMUNITY-WQI',
  pricePrecision: 8,
  amountPrecision: 8,
  minAmount: '1',
  reviewNotes: 'metadata-only local queue request from TypeScript SDK',
  ...overrides,
});

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
    assert.match(registry.assetListingCaveat, /WQUAI, WQI/);
    assert.equal(registry.listedAssetStatus.status, 'wrapped-token-listing');
    assert.deepEqual(registry.listedAssetStatus.primaryQuoteAssets, ['WQUAI', 'WQI']);
    assert.equal(registry.listedAssetStatus.supportedAssetModel, 'erc20-style-vault-token');
    assert.equal(registry.listedAssetStatus.userListedTokens, true);
    assert.equal(registry.listedAssetStatus.listingFlowStatus, 'design-required');
    assert.equal(registry.listedAssetStatus.nativeQiTreatment, 'out-of-scope-direct-settlement-use-WQI');
    assert.equal(registry.listedAssetStatus.nativeQiDirectSettlement, false);
    assert.equal(registry.listedAssetStatus.realQuaiTransactions, false);
    assert.equal(registry.listedAssetStatus.walletRequired, false);
    assert.match(registry.listedAssetStatus.safetyNotice, /WQUAI, WQI, and approved community tokens/i);
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

test('TypeScript SDK exposes read-only mock vault balances without wallet or withdrawal authority', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });

    const balances = await client.account.balances();

    assert.deepEqual(balances.balances, []);
    assert.equal(balances.source, 'mock-vault-projection');
    assert.equal(balances.custody, 'non-custodial-contract-vault');
    assert.deepEqual(balances.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(balances.withdrawalAuthority, 'owner-wallet-only');
    assert.equal(balances.settlementMode, 'mock');
    assert.equal(balances.realQuaiTransactions, false);
    assert.equal(balances.walletRequired, false);
    assert.match(balances.safetyNotice, /no wallet loaded, no funds moved/);
  });
});

test('TypeScript SDK exposes prepare-only owner-wallet vault operation placeholders without tx authority', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });
    const baseRequest = {
      owner: '0x1111111111111111111111111111111111111111',
      assetSymbol: 'WQI',
      amount: '10',
      chainId: 0,
      vaultContractRef: 'local-only-not-deployed',
    };

    const deposit = await client.vault.deposits.prepare(baseRequest);
    assert.equal(deposit.status, 501);
    assert.equal(deposit.body.error, 'owner_wallet_vault_deposit_not_implemented');
    assert.equal(deposit.body.source, 'owner-wallet-vault-operation-placeholder');
    assert.equal(deposit.body.custody, 'non-custodial-contract-vault');
    assert.equal(deposit.body.vaultOperation, 'deposit');
    assert.equal(deposit.body.operationStatus, 'prepare-only-not-implemented');
    assert.equal(deposit.body.ownerAuthorization, 'owner-wallet-required');
    assert.deepEqual(deposit.body.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(deposit.body.delegateAuthority, 'delegates-cannot-deposit-or-withdraw');
    assert.equal(deposit.body.realQuaiTransactions, false);
    assert.equal(deposit.body.walletRequired, false);
    assert.equal(deposit.body.fundsMoved, false);
    assert.equal(deposit.body.tradingVaultMutation, false);
    assert.equal(deposit.body.safety.noWalletLoading, true);
    assert.equal(deposit.body.safety.noRpcUrlAccess, true);
    assert.equal(deposit.body.safety.noSigning, true);
    assert.equal(deposit.body.safety.noBroadcast, true);
    assert.equal(deposit.body.safety.noTransactionSubmission, true);
    assert.equal(deposit.body.safety.noFundsMovement, true);
    assert.equal(deposit.body.safety.noDelegateWithdrawalAuthority, true);
    assert.equal(deposit.body.safety.noAdminWithdrawalAuthority, true);
    assert.match(deposit.body.message, /owner-wallet-only/);
    assert.match(deposit.body.message, /does not load wallets, sign, broadcast, submit transactions, mutate TradingVault, or move funds/);

    const withdrawal = await client.vault.withdrawals.prepare({
      ...baseRequest,
      assetSymbol: 'WQUAI',
      amount: '1.5',
    });
    assert.equal(withdrawal.status, 501);
    assert.equal(withdrawal.body.error, 'owner_wallet_vault_withdrawal_not_implemented');
    assert.equal(withdrawal.body.vaultOperation, 'withdrawal');
    assert.equal(withdrawal.body.ownerAuthorization, 'owner-wallet-required');
    assert.deepEqual(withdrawal.body.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(withdrawal.body.delegateAuthority, 'delegates-cannot-deposit-or-withdraw');
    assert.equal(withdrawal.body.realQuaiTransactions, false);
    assert.equal(withdrawal.body.walletRequired, false);
    assert.equal(withdrawal.body.fundsMoved, false);
    assert.equal(withdrawal.body.tradingVaultMutation, false);
    assert.match(withdrawal.body.safety.notice, /no wallet is loaded, no signature is created, no RPC URL is read, no transaction is submitted, and no funds move/);
  });
});

test('TypeScript SDK exposes read-only relayer settlement-mode gate metadata without wallet or tx authority', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });

    const gate = await client.relayer.settlementModeGate.get();

    assert.equal(gate.source, 'relayer-approval-gate');
    assert.equal(gate.currentSettlementMode, 'mock');
    assert.equal(gate.custody, 'non-custodial-relayer-gate');
    assert.equal(gate.realQuaiTransactions, false);
    assert.equal(gate.walletRequired, false);
    assert.deepEqual(gate.requiredEventTruthFields, [
      'settlementTx',
      'blockNumber',
      'blockHash',
      'eventIndex',
      'explorerUrl',
    ]);
    assert.equal(gate.modes.mock.allowed, true);
    assert.equal(gate.modes.mock.reason, 'mock_mode_local_only');
    assert.equal(gate.modes.quai_contract.allowed, false);
    assert.equal(gate.modes.quai_contract.reason, 'real_quai_approval_gate_blocked');
    assert.ok(gate.modes.quai_contract.missingFields.includes('approval.explicitApproval'));
    assert.ok(gate.modes.quai_contract.missingFields.includes('eventTruth.requiredFields.settlementTx'));
    assert.equal(gate.safety.noWalletLoading, true);
    assert.equal(gate.safety.noSigning, true);
    assert.equal(gate.safety.noBroadcast, true);
    assert.equal(gate.safety.noRpcUrlAccess, true);
    assert.equal(gate.safety.noTransactionSubmission, true);
    assert.equal(gate.safety.proofTrigger, 'TradeSettled');
  });
});

test('TypeScript SDK exposes read-only listing policy metadata without listing-admin or tx authority', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });

    const policy = await client.listings.policy.get();

    assert.equal(policy.source, 'listed-asset-marketregistry-policy');
    assert.equal(policy.status, 'design-only-local-metadata');
    assert.equal(policy.assetModel, 'erc20-style-vault-token');
    assert.deepEqual(policy.primaryQuoteAssets, ['WQUAI', 'WQI']);
    assert.deepEqual(policy.supportedAssets.map((asset) => asset.symbol), [
      'WQUAI',
      'WQI',
      'community-created-erc20-style-token',
    ]);
    assert.equal(policy.supportedAssets[0].address, null);
    assert.equal(policy.supportedAssets[1].address, null);
    assert.equal(policy.supportedAssets[2].listingStatus, 'listable-after-review');
    assert.equal(policy.exampleMarkets[0].marketId, 'WQI-WQUAI');
    assert.equal(policy.exampleMarkets[0].custodyAuthority, false);
    assert.equal(policy.marketRegistry.truthSource, 'MarketRegistry-enabled-pair-metadata');
    assert.equal(policy.marketRegistry.balanceMovement, false);
    assert.equal(policy.marketRegistry.operatorWithdrawalAuthority, false);
    assert.deepEqual(policy.safety.delegatePermissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(policy.safety.realQuaiTransactions, false);
    assert.equal(policy.safety.walletRequired, false);
    assert.equal(policy.safety.noWalletLoading, true);
    assert.equal(policy.safety.noSigning, true);
    assert.equal(policy.safety.noBroadcast, true);
    assert.equal(policy.safety.noRpcUrlAccess, true);
    assert.equal(policy.safety.noTransactionSubmission, true);
    assert.match(policy.safety.notice, /no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds/i);
    assert.match(policy.marketRegistry.notes, /cannot move TradingVault balances or grant withdrawal\/admin power/i);
  });
});

test('TypeScript SDK exposes read-only listing review-flow metadata without MarketRegistry mutation authority', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });

    const reviewFlow = await client.listings.reviewFlow.get();

    assert.equal(reviewFlow.source, 'listed-asset-marketregistry-review-flow');
    assert.equal(reviewFlow.status, 'design-only-local-metadata');
    assert.equal(reviewFlow.phase, 'clonners-managed-local-review-before-dao');
    assert.equal(
      reviewFlow.requestSurface,
      'prepare-only POST /v1/listings/requests; POST /v1/listings/requests with requestMode=local_review_queue; GET /v1/listings/requests inspection; POST /v1/listings/requests/{requestId}/decision with decisionMode=local_review_decision',
    );
    assert.equal(
      reviewFlow.clientSurface,
      'TypeScript/Python/qdex listing policy, review-flow, local queue, and local decision clients',
    );
    assert.deepEqual(reviewFlow.stages.map((stage) => stage.id), [
      'metadata_intake',
      'token_safety_review',
      'market_parameter_review',
      'clonners_local_approval',
      'marketregistry_admin_gate',
    ]);
    assert.equal(reviewFlow.approvalOutcome.approvedStatus, 'approved-local-metadata-only');
    assert.equal(reviewFlow.approvalOutcome.rejectedStatus, 'rejected-local-metadata-only');
    assert.equal(reviewFlow.approvalOutcome.marketRegistryMutation, false);
    assert.equal(reviewFlow.approvalOutcome.realQuaiTransactions, false);
    assert.deepEqual(reviewFlow.safety.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(reviewFlow.safety.marketRegistryMutation, false);
    assert.equal(reviewFlow.safety.realQuaiTransactions, false);
    assert.equal(reviewFlow.safety.walletRequired, false);
    assert.equal(reviewFlow.safety.noWalletLoading, true);
    assert.equal(reviewFlow.safety.noRpcUrlAccess, true);
    assert.equal(reviewFlow.safety.noSigning, true);
    assert.equal(reviewFlow.safety.noBroadcast, true);
    assert.equal(reviewFlow.safety.noDeploys, true);
    assert.equal(reviewFlow.safety.noTransactionSubmission, true);
    assert.equal(reviewFlow.safety.noListingAdminKeys, true);
    assert.equal(reviewFlow.safety.noRealTokenAddresses, true);
    assert.equal(reviewFlow.safety.noFundsMovement, true);
    assert.match(
      reviewFlow.safety.notice,
      /approved in-memory queue\/decision state only; it does not mutate MarketRegistry, move TradingVault balances, grant withdrawal\/admin authority/i,
    );
  });
});

test('TypeScript SDK queues and inspects local listing review requests without MarketRegistry mutation authority', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });

    const emptyQueue = await client.listings.requests.listLocalReviewQueue();
    assert.equal(emptyQueue.source, 'listed-asset-marketregistry-review-flow');
    assert.equal(emptyQueue.status, 'design-only-local-metadata');
    assert.equal(emptyQueue.phase, 'clonners-managed-local-review-before-dao');
    assert.equal(emptyQueue.queueStatus, 'local-in-memory-review-queue');
    assert.equal(emptyQueue.persistence, 'in-memory-local-server-only');
    assert.equal(emptyQueue.count, 0);
    assert.deepEqual(emptyQueue.requests, []);
    assert.deepEqual(emptyQueue.safety.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(emptyQueue.safety.marketRegistryMutation, false);
    assert.equal(emptyQueue.safety.realQuaiTransactions, false);
    assert.equal(emptyQueue.safety.walletRequired, false);

    const queuedResult = await client.listings.requests.enqueueLocalReview(localListingReviewRequest());
    assert.equal(queuedResult.status, 202);

    const queued = queuedResult.body;
    assert.equal(queued.source, 'listed-asset-marketregistry-review-flow');
    assert.equal(queued.status, 'design-only-local-metadata');
    assert.equal(queued.requestStatus, 'queued-local-review');
    assert.equal(queued.phase, 'clonners-managed-local-review-before-dao');
    assert.equal(queued.requestMode, 'local_review_queue');
    assert.equal(queued.reviewStage, 'metadata_intake');
    assert.equal(queued.reviewDecision, 'pending-local-review');
    assert.equal(queued.marketRegistry.marketRegistryMutation, false);
    assert.equal(queued.marketRegistry.canMoveTradingVaultBalances, false);
    assert.equal(queued.marketRegistry.canGrantWithdrawalAuthority, false);
    assert.deepEqual(queued.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(queued.realQuaiTransactions, false);
    assert.equal(queued.walletRequired, false);
    assert.equal(queued.safety.noWalletLoading, true);
    assert.equal(queued.safety.noRpcUrlAccess, true);
    assert.equal(queued.safety.noSigning, true);
    assert.equal(queued.safety.noBroadcast, true);
    assert.equal(queued.safety.noDeploys, true);
    assert.equal(queued.safety.noTransactionSubmission, true);
    assert.equal(queued.safety.noListingAdminKeys, true);
    assert.equal(queued.safety.noRealTokenAddresses, true);
    assert.equal(queued.safety.noFundsMovement, true);
    assert.match(queued.message, /in-memory local review queue/i);
    assert.match(queued.message, /does not mutate MarketRegistry/i);
    assert.deepEqual(queued.request, localListingReviewRequest());

    const queue = await client.listings.requests.listLocalReviewQueue();
    assert.equal(queue.count, 1);
    assert.deepEqual(queue.requests, [queued]);
  });
});

test('TypeScript SDK records local listing review decisions without MarketRegistry mutation authority', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });
    const queuedResult = await client.listings.requests.enqueueLocalReview(localListingReviewRequest({
      reviewNotes: 'metadata-only local decision request from TypeScript SDK',
    }));
    const queued = queuedResult.body;

    const decisionResult = await client.listings.requests.decideLocalReview(queued.requestId, {
      decision: 'approve',
      reviewStage: 'clonners_local_approval',
      decisionNotes: 'approved locally for metadata-only smoke coverage',
    });

    assert.equal(decisionResult.status, 200);
    const decision = decisionResult.body;
    assert.equal(decision.requestId, queued.requestId);
    assert.equal(decision.source, 'listed-asset-marketregistry-review-flow');
    assert.equal(decision.status, 'design-only-local-metadata');
    assert.equal(decision.requestStatus, 'reviewed-local-metadata-only');
    assert.equal(decision.phase, 'clonners-managed-local-review-before-dao');
    assert.equal(decision.decisionMode, 'local_review_decision');
    assert.equal(decision.reviewStage, 'clonners_local_approval');
    assert.equal(decision.reviewDecision, 'approved-local-metadata-only');
    assert.equal(decision.nextMutationGate, 'explicit Clonners approval required before MarketRegistry.addMarket');
    assert.deepEqual(decision.decision, {
      decision: 'approve',
      decisionNotes: 'approved locally for metadata-only smoke coverage',
    });
    assert.deepEqual(decision.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(decision.realQuaiTransactions, false);
    assert.equal(decision.walletRequired, false);
    assert.equal(decision.marketRegistry.marketRegistryMutation, false);
    assert.equal(decision.marketRegistry.canMoveTradingVaultBalances, false);
    assert.equal(decision.marketRegistry.canGrantWithdrawalAuthority, false);
    assert.equal(decision.safety.noWalletLoading, true);
    assert.equal(decision.safety.noRpcUrlAccess, true);
    assert.equal(decision.safety.noSigning, true);
    assert.equal(decision.safety.noBroadcast, true);
    assert.equal(decision.safety.noDeploys, true);
    assert.equal(decision.safety.noTransactionSubmission, true);
    assert.equal(decision.safety.noListingAdminKeys, true);
    assert.equal(decision.safety.noRealTokenAddresses, true);
    assert.equal(decision.safety.noFundsMovement, true);
    assert.match(decision.message, /Recorded local approval metadata only/i);
    assert.match(decision.message, /does not mutate MarketRegistry/i);

    const queue = await client.listings.requests.listLocalReviewQueue();
    assert.equal(queue.requests[0].requestId, queued.requestId);
    assert.equal(queue.requests[0].reviewDecision, 'approved-local-metadata-only');
  });
});

test('TypeScript SDK exposes prepare-only listing request placeholder without treating 501 as submission success', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });

    const result = await client.listings.requests.prepareSubmit({
      baseSymbol: 'COMMUNITY',
      quoteSymbol: 'WQUAI',
      tokenModel: 'erc20-style-vault-token',
      requestedMarketId: 'COMMUNITY-WQUAI',
      pricePrecision: 8,
      amountPrecision: 8,
      minAmount: '1',
      reviewNotes: 'metadata-only local request',
    });

    assert.equal(result.status, 501);
    assert.equal(result.body.error, 'listing_request_not_implemented');
    assert.equal(result.body.source, 'listed-asset-marketregistry-policy');
    assert.equal(result.body.status, 'design-only-local-metadata');
    assert.equal(result.body.requestStatus, 'not-implemented-approval-required');
    assert.equal(result.body.approvalGate, 'listing-submission-approval-gate');
    assert.deepEqual(result.body.primaryQuoteAssets, ['WQUAI', 'WQI']);
    assert.equal(result.body.supportedAsset, 'community-created-erc20-style-token');
    assert.deepEqual(result.body.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(result.body.realQuaiTransactions, false);
    assert.equal(result.body.walletRequired, false);
    assert.equal(result.body.marketRegistry.marketRegistryMutation, false);
    assert.equal(result.body.marketRegistry.canMoveTradingVaultBalances, false);
    assert.equal(result.body.marketRegistry.canGrantWithdrawalAuthority, false);
    assert.equal(result.body.safety.noRuntimeListingQueue, true);
    assert.equal(result.body.safety.noListingAdminKeys, true);
    assert.equal(result.body.safety.noRealTokenAddresses, true);
    assert.equal(result.body.safety.noFundsMovement, true);
    assert.match(result.body.safety.notice, /no listing request was submitted/i);
    assert.match(result.body.message, /does not submit listings, mutate MarketRegistry, move TradingVault balances, or grant withdrawal\/admin authority/i);
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
