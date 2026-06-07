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

const localReviewPayload = (overrides = {}) => ({
  requestMode: 'local_review_queue',
  baseSymbol: 'COMMUNITY',
  quoteSymbol: 'WQUAI',
  tokenModel: 'erc20-style-vault-token',
  requestedMarketId: 'COMMUNITY-WQUAI',
  pricePrecision: 8,
  amountPrecision: 8,
  minAmount: '1',
  reviewNotes: 'local-only review request; no token address, wallet, RPC, tx, or funds',
  ...overrides,
});

test('POST /v1/listings/requests can queue a local-only listing review request for inspection', async () => {
  await withServer(async (baseUrl) => {
    const emptyQueue = await requestJson(baseUrl, '/v1/listings/requests');
    assert.equal(emptyQueue.status, 200);
    assert.equal(emptyQueue.body.source, 'listed-asset-marketregistry-review-flow');
    assert.equal(emptyQueue.body.queueStatus, 'local-in-memory-review-queue');
    assert.equal(emptyQueue.body.persistence, 'in-memory-local-server-only');
    assert.equal(emptyQueue.body.count, 0);
    assert.deepEqual(emptyQueue.body.requests, []);
    assert.equal(emptyQueue.body.safety.marketRegistryMutation, false);
    assert.equal(emptyQueue.body.safety.realQuaiTransactions, false);
    assert.deepEqual(emptyQueue.body.safety.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);

    const created = await requestJson(baseUrl, '/v1/listings/requests', {
      method: 'POST',
      body: JSON.stringify(localReviewPayload()),
    });

    assert.equal(created.status, 202);
    assert.equal(created.body.source, 'listed-asset-marketregistry-review-flow');
    assert.equal(created.body.status, 'design-only-local-metadata');
    assert.equal(created.body.requestStatus, 'queued-local-review');
    assert.equal(created.body.phase, 'clonners-managed-local-review-before-dao');
    assert.equal(created.body.requestMode, 'local_review_queue');
    assert.equal(created.body.requestId, 'listing-request-000001');
    assert.equal(created.body.reviewStage, 'metadata_intake');
    assert.equal(created.body.reviewDecision, 'pending-local-review');
    assert.equal(created.body.marketRegistry.marketRegistryMutation, false);
    assert.equal(created.body.marketRegistry.canMoveTradingVaultBalances, false);
    assert.equal(created.body.marketRegistry.canGrantWithdrawalAuthority, false);
    assert.equal(created.body.marketRegistry.canGrantAdminAuthority, false);
    assert.deepEqual(created.body.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(created.body.realQuaiTransactions, false);
    assert.equal(created.body.walletRequired, false);
    assert.equal(created.body.safety.noWalletLoading, true);
    assert.equal(created.body.safety.noRpcUrlAccess, true);
    assert.equal(created.body.safety.noSigning, true);
    assert.equal(created.body.safety.noBroadcast, true);
    assert.equal(created.body.safety.noDeploys, true);
    assert.equal(created.body.safety.noTransactionSubmission, true);
    assert.equal(created.body.safety.noListingAdminKeys, true);
    assert.equal(created.body.safety.noRealTokenAddresses, true);
    assert.equal(created.body.safety.noFundsMovement, true);
    assert.match(created.body.message, /in-memory local review queue/i);
    assert.match(created.body.message, /does not mutate MarketRegistry/i);
    assert.deepEqual(created.body.request, {
      baseSymbol: 'COMMUNITY',
      quoteSymbol: 'WQUAI',
      tokenModel: 'erc20-style-vault-token',
      requestedMarketId: 'COMMUNITY-WQUAI',
      pricePrecision: 8,
      amountPrecision: 8,
      minAmount: '1',
      reviewNotes: 'local-only review request; no token address, wallet, RPC, tx, or funds',
    });
    assert.equal(Object.hasOwn(created.body.request, 'tokenAddress'), false);
    assert.equal(Object.hasOwn(created.body.request, 'contractAddress'), false);

    const queue = await requestJson(baseUrl, '/v1/listings/requests');
    assert.equal(queue.status, 200);
    assert.equal(queue.body.count, 1);
    assert.deepEqual(queue.body.requests, [created.body]);
  });
});

test('POST /v1/listings/requests/:requestId/decision records a local-only approval decision without MarketRegistry mutation', async () => {
  await withServer(async (baseUrl) => {
    const created = await requestJson(baseUrl, '/v1/listings/requests', {
      method: 'POST',
      body: JSON.stringify(localReviewPayload()),
    });
    assert.equal(created.status, 202);

    const decision = await requestJson(baseUrl, `/v1/listings/requests/${created.body.requestId}/decision`, {
      method: 'POST',
      body: JSON.stringify({
        decisionMode: 'local_review_decision',
        decision: 'approve',
        reviewStage: 'clonners_local_approval',
        decisionNotes: 'metadata approved locally only; separate explicit approval is still required before MarketRegistry.addMarket',
      }),
    });

    assert.equal(decision.status, 200);
    assert.equal(decision.body.requestId, 'listing-request-000001');
    assert.equal(decision.body.source, 'listed-asset-marketregistry-review-flow');
    assert.equal(decision.body.status, 'design-only-local-metadata');
    assert.equal(decision.body.requestStatus, 'reviewed-local-metadata-only');
    assert.equal(decision.body.phase, 'clonners-managed-local-review-before-dao');
    assert.equal(decision.body.decisionMode, 'local_review_decision');
    assert.equal(decision.body.reviewStage, 'clonners_local_approval');
    assert.equal(decision.body.reviewDecision, 'approved-local-metadata-only');
    assert.equal(decision.body.decisionAt, 'local-review-decision-sequence-000001');
    assert.equal(decision.body.nextMutationGate, 'explicit Clonners approval required before MarketRegistry.addMarket');
    assert.equal(decision.body.marketRegistry.marketRegistryMutation, false);
    assert.equal(decision.body.marketRegistry.canMoveTradingVaultBalances, false);
    assert.equal(decision.body.marketRegistry.canGrantWithdrawalAuthority, false);
    assert.equal(decision.body.marketRegistry.canGrantAdminAuthority, false);
    assert.deepEqual(decision.body.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(decision.body.realQuaiTransactions, false);
    assert.equal(decision.body.walletRequired, false);
    assert.equal(decision.body.safety.noWalletLoading, true);
    assert.equal(decision.body.safety.noRpcUrlAccess, true);
    assert.equal(decision.body.safety.noSigning, true);
    assert.equal(decision.body.safety.noBroadcast, true);
    assert.equal(decision.body.safety.noDeploys, true);
    assert.equal(decision.body.safety.noTransactionSubmission, true);
    assert.equal(decision.body.safety.noListingAdminKeys, true);
    assert.equal(decision.body.safety.noRealTokenAddresses, true);
    assert.equal(decision.body.safety.noFundsMovement, true);
    assert.deepEqual(decision.body.decision, {
      decision: 'approve',
      decisionNotes: 'metadata approved locally only; separate explicit approval is still required before MarketRegistry.addMarket',
    });
    assert.match(decision.body.message, /local approval metadata only/i);
    assert.match(decision.body.message, /does not mutate MarketRegistry/i);

    const queue = await requestJson(baseUrl, '/v1/listings/requests');
    assert.equal(queue.status, 200);
    assert.equal(queue.body.count, 1);
    assert.equal(queue.body.requests[0].requestStatus, 'reviewed-local-metadata-only');
    assert.equal(queue.body.requests[0].reviewDecision, 'approved-local-metadata-only');
    assert.equal(queue.body.requests[0].nextMutationGate, 'explicit Clonners approval required before MarketRegistry.addMarket');
  });
});

test('local listing review decisions reject live authority fields and cannot decide missing queue records', async () => {
  await withServer(async (baseUrl) => {
    const created = await requestJson(baseUrl, '/v1/listings/requests', {
      method: 'POST',
      body: JSON.stringify(localReviewPayload()),
    });
    assert.equal(created.status, 202);

    const rejected = await requestJson(baseUrl, `/v1/listings/requests/${created.body.requestId}/decision`, {
      method: 'POST',
      body: JSON.stringify({
        decisionMode: 'local_review_decision',
        decision: 'reject',
        reviewStage: 'token_safety_review',
        rejectionReason: 'token_safety_review_failed',
        decisionNotes: 'local metadata rejection only',
        txHash: '0xnot-allowed',
      }),
    });

    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error, 'listing_review_decision_rejected');
    assert.equal(rejected.body.reason, 'forbidden_live_authority_fields');
    assert.deepEqual(rejected.body.forbiddenFields, ['txHash']);
    assert.equal(rejected.body.source, 'listed-asset-marketregistry-review-flow');
    assert.equal(rejected.body.marketRegistry.marketRegistryMutation, false);
    assert.equal(rejected.body.realQuaiTransactions, false);
    assert.equal(rejected.body.walletRequired, false);
    assert.deepEqual(rejected.body.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);

    const missing = await requestJson(baseUrl, '/v1/listings/requests/listing-request-999999/decision', {
      method: 'POST',
      body: JSON.stringify({
        decisionMode: 'local_review_decision',
        decision: 'approve',
        reviewStage: 'clonners_local_approval',
        decisionNotes: 'metadata approved locally only',
      }),
    });

    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, 'listing_review_decision_rejected');
    assert.equal(missing.body.reason, 'request_not_found');
    assert.equal(missing.body.requestId, 'listing-request-999999');
    assert.equal(missing.body.marketRegistry.marketRegistryMutation, false);
    assert.equal(missing.body.realQuaiTransactions, false);
    assert.equal(missing.body.walletRequired, false);

    const queue = await requestJson(baseUrl, '/v1/listings/requests');
    assert.equal(queue.status, 200);
    assert.equal(queue.body.requests[0].reviewDecision, 'pending-local-review');
  });
});

test('local listing review queue rejects live authority fields before recording requests', async () => {
  await withServer(async (baseUrl) => {
    const rejected = await requestJson(baseUrl, '/v1/listings/requests', {
      method: 'POST',
      body: JSON.stringify(localReviewPayload({ tokenAddress: '0x1234567890123456789012345678901234567890' })),
    });

    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error, 'listing_request_rejected');
    assert.equal(rejected.body.reason, 'forbidden_live_authority_fields');
    assert.deepEqual(rejected.body.forbiddenFields, ['tokenAddress']);
    assert.equal(rejected.body.source, 'listed-asset-marketregistry-review-flow');
    assert.equal(rejected.body.marketRegistry.marketRegistryMutation, false);
    assert.equal(rejected.body.realQuaiTransactions, false);
    assert.equal(rejected.body.walletRequired, false);
    assert.deepEqual(rejected.body.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.match(rejected.body.message, /Local listing review requests cannot carry live token addresses/i);

    const queue = await requestJson(baseUrl, '/v1/listings/requests');
    assert.equal(queue.status, 200);
    assert.equal(queue.body.count, 0);
    assert.deepEqual(queue.body.requests, []);
  });
});
