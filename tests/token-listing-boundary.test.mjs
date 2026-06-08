import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const sectionBetween = (text, startMarker, endMarker) => {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker ${endMarker}`);
  return text.slice(start, end);
};

test('token listing policy doc pins MarketRegistry metadata flow without custody authority', async () => {
  const policy = await readText('docs/listing-policy.md');

  for (const requiredText of [
    '# Token Listing and MarketRegistry Metadata Policy',
    'WQUAI',
    'WQI',
    'community-created ERC-20-style vault tokens',
    '`MarketRegistry` is market metadata/enabled-pair truth, not custody truth',
    '`TradingVault` remains the only vault-balance surface',
    '`addMarket`',
    '`disableMarket`',
    '`marketInfo`',
    'clonners-operator-managed',
    'futureAuthority: dao-governance',
    'MarketRegistry.proposeMarketAuthority -> MarketRegistry.acceptMarketAuthority',
    'MarketAuthorityHandoffProposed, MarketAuthorityHandoffAccepted',
    'cannot move user balances',
    '`NO_WITHDRAW`',
    '`NO_ADMIN`',
    'realQuaiTransactions: false',
    'walletRequired: false',
    'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds',
  ]) {
    assert.ok(policy.includes(requiredText), `docs/listing-policy.md should include ${requiredText}`);
  }

  assert.doesNotMatch(
    policy,
    /wrapped_qi_receipt_token|contract_native_qi_adapter|conversion_settlement_flow/,
    'listing policy must not reopen direct native Qi adapter paths as active blockers',
  );
});

test('OpenAPI exposes read-only token listing policy route and schema', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const route = sectionBetween(spec, '  /v1/listings/policy:', '  /v1/listings/requests:');
  const tokenListingPolicy = sectionBetween(spec, '    TokenListingPolicy:', '    TokenListingAsset:');
  const tokenListingAsset = sectionBetween(spec, '    TokenListingAsset:', '    TokenListingMarketRegistry:');
  const marketRegistry = sectionBetween(spec, '    TokenListingMarketRegistry:', '    TokenListingAuthority:');
  const listingAuthority = sectionBetween(spec, '    TokenListingAuthority:', '    TokenListingSafety:');
  const safety = sectionBetween(spec, '    TokenListingSafety:', '    ListingRequestReviewFlow:');

  for (const requiredText of [
    'summary: Read-only token listing and MarketRegistry metadata policy',
    '$ref: "#/components/schemas/TokenListingPolicy"',
    'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds',
  ]) {
    assert.ok(route.includes(requiredText), `/v1/listings/policy route should include ${requiredText}`);
  }

  for (const requiredText of [
    'required: [source, status, assetModel, primaryQuoteAssets, supportedAssets, exampleMarkets, listingLifecycle, marketRegistry, listingAuthority, safety]',
    'enum: [listed-asset-marketregistry-policy]',
    'enum: [design-only-local-metadata]',
    'enum: [erc20-style-vault-token]',
    'enum: [WQUAI, WQI]',
    'supportedAssets:',
    'exampleMarkets:',
    'listingLifecycle:',
    'listingAuthority:',
  ]) {
    assert.ok(tokenListingPolicy.includes(requiredText), `TokenListingPolicy schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'symbol:',
    'enum: [WQUAI, WQI, community-created-erc20-style-token]',
    'address:',
    'type: [string, "null"]',
    'listingStatus:',
    'enum: [listed, listable-after-review]',
    'nativeQiDirectSettlement:',
    'enum: [false]',
  ]) {
    assert.ok(tokenListingAsset.includes(requiredText), `TokenListingAsset schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'truthSource:',
    'enum: [MarketRegistry-enabled-pair-metadata]',
    'canEnableMarkets:',
    'canDisableMarkets:',
    'custodyAuthority:',
    'balanceMovement:',
    'operatorWithdrawalAuthority:',
    'enum: [false]',
  ]) {
    assert.ok(marketRegistry.includes(requiredText), `TokenListingMarketRegistry schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'currentPhase:',
    'enum: [clonners-operator-managed]',
    'futureAuthority:',
    'enum: [dao-governance]',
    'handoffPattern:',
    'MarketRegistry.proposeMarketAuthority -> MarketRegistry.acceptMarketAuthority',
    'authorityCan:',
    'enum: [addMarket, disableMarket, proposeMarketAuthority]',
    'authorityCannot:',
    'enum: [moveTradingVaultBalances, withdrawUserFunds, grantDelegateAdmin, loadWallets, broadcastTransactions]',
    'MarketAuthorityHandoffProposed',
    'MarketAuthorityHandoffAccepted',
    'delegateWithdrawalAuthority:',
    'delegateAdminAuthority:',
  ]) {
    assert.ok(listingAuthority.includes(requiredText), `TokenListingAuthority schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'realQuaiTransactions:',
    'walletRequired:',
    'noWalletLoading:',
    'noSigning:',
    'noBroadcast:',
    'noRpcUrlAccess:',
    'noTransactionSubmission:',
    'delegatePermissions:',
    'enum: [NO_WITHDRAW, NO_ADMIN]',
  ]) {
    assert.ok(safety.includes(requiredText), `TokenListingSafety schema should include ${requiredText}`);
  }
});

test('OpenAPI and docs expose local listing request review approval flow without runtime mutation', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const policy = await readText('docs/listing-policy.md');
  const route = sectionBetween(spec, '  /v1/listings/review-flow:', '  /v1/listings/requests:');
  const reviewFlow = sectionBetween(spec, '    ListingRequestReviewFlow:', '    ListingRequestPrepare:');

  for (const requiredText of [
    'summary: Read-only local listing request review and approval flow',
    'Clonners-managed local review metadata only',
    'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, real token addresses, MarketRegistry mutation, or real funds',
    '$ref: "#/components/schemas/ListingRequestReviewFlow"',
  ]) {
    assert.ok(route.includes(requiredText), `/v1/listings/review-flow route should include ${requiredText}`);
  }

  for (const requiredText of [
    'required: [source, status, phase, requestSurface, clientSurface, reviewAuthority, stages, approvalOutcome, safety]',
    'enum: [listed-asset-marketregistry-review-flow]',
    'enum: [design-only-local-metadata]',
    'enum: [clonners-managed-local-review-before-dao]',
    'prepare-only POST /v1/listings/requests',
    'POST /v1/listings/requests/{requestId}/decision with decisionMode=local_review_decision',
    'TypeScript/Python/qdex listing policy, review-flow, local queue, and local decision clients',
    'Clonners-managed MarketRegistry authority',
    'MarketRegistry.proposeMarketAuthority -> MarketRegistry.acceptMarketAuthority',
    'metadata_intake',
    'token_safety_review',
    'market_parameter_review',
    'clonners_local_approval',
    'marketregistry_admin_gate',
    'approved-local-metadata-only',
    'rejected-local-metadata-only',
    'explicit Clonners approval required before MarketRegistry.addMarket',
    'marketRegistryMutation:',
    'enum: [false]',
    'realQuaiTransactions:',
    'walletRequired:',
    'enum: [NO_WITHDRAW, NO_ADMIN]',
    'noListingAdminKeys:',
    'noRealTokenAddresses:',
    'noFundsMovement:',
  ]) {
    assert.ok(reviewFlow.includes(requiredText), `ListingRequestReviewFlow schema should include ${requiredText}`);
  }

  for (const requiredText of [
    '## Local listing request review/approval flow',
    '`GET /v1/listings/review-flow` exposes the Clonners-managed local review and approval state machine as metadata only',
    '`phase: clonners-managed-local-review-before-dao`',
    '`POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision`',
    'TypeScript/Python/qdex listing policy, review-flow, local queue, and local decision clients',
    '`marketRegistryMutation: false`',
    '`approved-local-metadata-only`',
    '`rejected-local-metadata-only`',
    '`NO_WITHDRAW`',
    '`NO_ADMIN`',
    'explicit Clonners approval required before `MarketRegistry.addMarket`',
  ]) {
    assert.ok(policy.includes(requiredText), `docs/listing-policy.md should include ${requiredText}`);
  }

  assert.doesNotMatch(
    `${route}\n${reviewFlow}\n${policy}`,
    /walletPrivateKey|listingAdminPrivateKey|rpcUrl\s*:|txHash|signature|deployed address|MarketRegistry mutation submitted/i,
    'review flow must not introduce wallet/RPC/signing/deploy/tx mechanics or mutation claims',
  );
});

test('OpenAPI and docs expose prepare-only listing request placeholder without MarketRegistry mutation', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const policy = await readText('docs/listing-policy.md');
  const route = sectionBetween(spec, '  /v1/listings/requests:', '  /v1/relayer/settlement-mode-gate:');
  const requestSchema = sectionBetween(
    spec,
    '    ListingRequestPrepare:',
    '    ListingRequestPlaceholderResponse:',
  );
  const responseSchema = sectionBetween(
    spec,
    '    ListingRequestPlaceholderResponse:',
    '    ListingRequestSafety:',
  );
  const safetySchema = sectionBetween(spec, '    ListingRequestSafety:', '    ContractMetadata:');

  for (const requiredText of [
    'summary: Prepare-only listing request approval gate',
    'POST /v1/listings/requests is an intentional 501 placeholder',
    'not-implemented approval boundary',
    'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, real token addresses, listing-admin runtime behavior, MarketRegistry mutation, or real funds',
    '$ref: "#/components/schemas/ListingRequestPrepare"',
    '"501":',
    '$ref: "#/components/schemas/ListingRequestPlaceholderResponse"',
  ]) {
    assert.ok(route.includes(requiredText), `/v1/listings/requests route should include ${requiredText}`);
  }
  assert.doesNotMatch(route, /"201":/, 'placeholder must not advertise successful listing creation');

  for (const requiredText of [
    'required: [baseSymbol, quoteSymbol, tokenModel, requestedMarketId, pricePrecision, amountPrecision, minAmount]',
    'baseSymbol:',
    'quoteSymbol:',
    'enum: [WQUAI, WQI]',
    'tokenModel:',
    'enum: [erc20-style-vault-token]',
    'requestedMarketId:',
    'pricePrecision:',
    'amountPrecision:',
    'minAmount:',
    'reviewNotes:',
  ]) {
    assert.ok(requestSchema.includes(requiredText), `ListingRequestPrepare schema should include ${requiredText}`);
  }
  assert.doesNotMatch(requestSchema, /tokenAddress|contractAddress|txHash|signature|rpcUrl/i, 'prepare schema must stay metadata-only');

  for (const requiredText of [
    'required: [error, source, status, requestStatus, approvalGate, custody, assetModel, primaryQuoteAssets, supportedAsset, marketRegistry, permissions, realQuaiTransactions, walletRequired, safety, message]',
    'enum: [listing_request_not_implemented]',
    'enum: [listed-asset-marketregistry-policy]',
    'enum: [design-only-local-metadata]',
    'enum: [not-implemented-approval-required]',
    'enum: [listing-submission-approval-gate]',
    'enum: [non-custodial]',
    'enum: [community-created-erc20-style-token]',
    'marketRegistryMutation:',
    'canMoveTradingVaultBalances:',
    'canGrantWithdrawalAuthority:',
    'canGrantAdminAuthority:',
    'enum: [NO_WITHDRAW, NO_ADMIN]',
    'realQuaiTransactions:',
    'walletRequired:',
  ]) {
    assert.ok(responseSchema.includes(requiredText), `ListingRequestPlaceholderResponse schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'noWalletLoading:',
    'noRpcUrlAccess:',
    'noSigning:',
    'noBroadcast:',
    'noDeploys:',
    'noTransactionSubmission:',
    'noRuntimeListingQueue:',
    'noListingAdminKeys:',
    'noRealTokenAddresses:',
    'noFundsMovement:',
  ]) {
    assert.ok(safetySchema.includes(requiredText), `ListingRequestSafety schema should include ${requiredText}`);
  }

  for (const requiredText of [
    '## Prepare-only listing request API placeholder',
    '`POST /v1/listings/requests` returns `501`',
    '`source: listed-asset-marketregistry-policy`',
    '`status: design-only-local-metadata`',
    '`requestStatus: not-implemented-approval-required`',
    '`marketRegistryMutation: false`',
    '`realQuaiTransactions: false`',
    '`walletRequired: false`',
    '`NO_WITHDRAW`',
    '`NO_ADMIN`',
    'listing/admin metadata cannot move `TradingVault` balances or grant withdrawal/admin authority',
  ]) {
    assert.ok(policy.includes(requiredText), `docs/listing-policy.md should include ${requiredText}`);
  }
  assert.doesNotMatch(
    policy,
    /has been submitted on-chain|listing request submitted|MarketRegistry mutation submitted/i,
    'docs must not claim the placeholder submits listings or mutates MarketRegistry',
  );
});

test('OpenAPI and docs expose approved local in-memory listing review queue without MarketRegistry mutation', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const policy = await readText('docs/listing-policy.md');
  const plan = await readText('docs/plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md');
  const route = sectionBetween(spec, '  /v1/listings/requests:', '  /v1/relayer/settlement-mode-gate:');
  const prepareSchema = sectionBetween(spec, '    ListingRequestPrepare:', '    ListingRequestPlaceholderResponse:');
  const queueResponse = sectionBetween(spec, '    ListingRequestQueueResponse:', '    ListingRequestQueuedResponse:');
  const queuedResponse = sectionBetween(spec, '    ListingRequestQueuedResponse:', '    ListingRequestRejectionResponse:');
  const rejectionResponse = sectionBetween(spec, '    ListingRequestRejectionResponse:', '    ListingRequestSafety:');

  for (const requiredText of [
    'get:',
    'summary: Inspect local in-memory listing review queue',
    '$ref: "#/components/schemas/ListingRequestQueueResponse"',
    'requestMode=local_review_queue',
    '"202":',
    '$ref: "#/components/schemas/ListingRequestQueuedResponse"',
    '"400":',
    '$ref: "#/components/schemas/ListingRequestRejectionResponse"',
    '"501":',
    'prepare-only mode still returns the approval-gated placeholder',
  ]) {
    assert.ok(route.includes(requiredText), `/v1/listings/requests route should include local queue text ${requiredText}`);
  }

  for (const requiredText of [
    'requestMode:',
    'enum: [prepare_only, local_review_queue]',
    'local_review_queue',
  ]) {
    assert.ok(prepareSchema.includes(requiredText), `ListingRequestPrepare schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'required: [source, status, phase, queueStatus, persistence, inspectionSurface, submitSurface, count, requests, marketRegistry, safety, message]',
    'enum: [listed-asset-marketregistry-review-flow]',
    'enum: [local-in-memory-review-queue]',
    'enum: [in-memory-local-server-only]',
    'GET /v1/listings/requests',
    'POST /v1/listings/requests with requestMode=local_review_queue',
    'marketRegistryMutation:',
    'enum: [false]',
    'enum: [NO_WITHDRAW, NO_ADMIN]',
  ]) {
    assert.ok(queueResponse.includes(requiredText), `ListingRequestQueueResponse schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'required: [requestId, source, status, requestStatus, phase, requestMode, reviewStage, reviewDecision, submittedAt, request, custody, marketRegistry, permissions, realQuaiTransactions, walletRequired, safety, message]',
    'enum: [queued-local-review]',
    'enum: [local_review_queue]',
    'enum: [metadata_intake]',
    'enum: [pending-local-review]',
    'canMoveTradingVaultBalances:',
    'canGrantWithdrawalAuthority:',
    'canGrantAdminAuthority:',
    'realQuaiTransactions:',
    'walletRequired:',
  ]) {
    assert.ok(queuedResponse.includes(requiredText), `ListingRequestQueuedResponse schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'enum: [listing_request_rejected]',
    'enum: [rejected-local-review-input]',
    'forbiddenFields:',
    'missingFields:',
    'forbidden_live_authority_fields',
    'marketRegistryMutation:',
    'enum: [false]',
  ]) {
    assert.ok(rejectionResponse.includes(requiredText), `ListingRequestRejectionResponse schema should include ${requiredText}`);
  }

  for (const requiredText of [
    '## Approved local runtime listing review queue',
    '`POST /v1/listings/requests` with `requestMode: local_review_queue`',
    '`GET /v1/listings/requests` inspects the in-memory local queue',
    '`queueStatus: local-in-memory-review-queue`',
    '`persistence: in-memory-local-server-only`',
    '`requestStatus: queued-local-review`',
    '`reviewDecision: pending-local-review`',
    '`marketRegistryMutation: false`',
    '`realQuaiTransactions: false`',
    '`walletRequired: false`',
    '`NO_WITHDRAW`',
    '`NO_ADMIN`',
    'cannot move `TradingVault` balances, mutate `MarketRegistry`, or grant withdrawal/admin authority',
  ]) {
    assert.ok(policy.includes(requiredText), `docs/listing-policy.md should include local queue text ${requiredText}`);
  }

  assert.ok(
    plan.includes('Clonners approved the local runtime listing review queue'),
    'post-listing plan should mark the local review queue approval/implementation boundary',
  );
  assert.doesNotMatch(
    `${route}\n${prepareSchema}\n${queueResponse}\n${queuedResponse}\n${rejectionResponse}\n${policy}\n${plan}`,
    /walletPrivateKey|listingAdminPrivateKey|rpcUrl\s*:|MarketRegistry mutation submitted|has been submitted on-chain/i,
    'local runtime queue docs must not introduce wallets/RPC/signing/deploy/tx or on-chain submission claims',
  );
});

test('OpenAPI and docs expose local in-memory listing review decision workflow without MarketRegistry mutation', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const policy = await readText('docs/listing-policy.md');
  const plan = await readText('docs/plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md');
  const route = sectionBetween(spec, '  /v1/listings/requests/{requestId}/decision:', '  /v1/relayer/settlement-mode-gate:');
  const decisionRequest = sectionBetween(spec, '    ListingRequestDecision:', '    ListingRequestDecisionResponse:');
  const decisionResponse = sectionBetween(spec, '    ListingRequestDecisionResponse:', '    ListingRequestDecisionError:');
  const decisionError = sectionBetween(spec, '    ListingRequestDecisionError:', '    ListingRequestSafety:');

  for (const requiredText of [
    'summary: Record a local-only listing review decision',
    'decisionMode=local_review_decision',
    'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, real token addresses, listing-admin keys, MarketRegistry mutation, or real funds',
    '$ref: "#/components/schemas/ListingRequestDecision"',
    '"200":',
    '$ref: "#/components/schemas/ListingRequestDecisionResponse"',
    '"400":',
    '"404":',
    '"409":',
    '$ref: "#/components/schemas/ListingRequestDecisionError"',
  ]) {
    assert.ok(route.includes(requiredText), `/v1/listings/requests/{requestId}/decision route should include ${requiredText}`);
  }

  for (const requiredText of [
    'required: [decisionMode, decision, reviewStage, decisionNotes]',
    'decisionMode:',
    'enum: [local_review_decision]',
    'decision:',
    'enum: [approve, reject]',
    'reviewStage:',
    'enum: [token_safety_review, market_parameter_review, clonners_local_approval]',
    'decisionNotes:',
    'rejectionReason:',
  ]) {
    assert.ok(decisionRequest.includes(requiredText), `ListingRequestDecision schema should include ${requiredText}`);
  }
  assert.doesNotMatch(decisionRequest, /tokenAddress|contractAddress|txHash|signature|rpcUrl/i, 'decision request schema must stay metadata-only');

  for (const requiredText of [
    'required: [requestId, source, status, requestStatus, phase, decisionMode, reviewStage, reviewDecision, decisionAt, nextMutationGate, request, decision, custody, marketRegistry, permissions, realQuaiTransactions, walletRequired, safety, message]',
    'enum: [listed-asset-marketregistry-review-flow]',
    'enum: [design-only-local-metadata]',
    'enum: [reviewed-local-metadata-only]',
    'enum: [local_review_decision]',
    'enum: [approved-local-metadata-only, rejected-local-metadata-only]',
    'explicit Clonners approval required before MarketRegistry.addMarket',
    'marketRegistryMutation:',
    'enum: [false]',
    'enum: [NO_WITHDRAW, NO_ADMIN]',
    'realQuaiTransactions:',
    'walletRequired:',
  ]) {
    assert.ok(decisionResponse.includes(requiredText), `ListingRequestDecisionResponse schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'enum: [listing_review_decision_rejected]',
    'enum: [rejected-local-review-decision]',
    'request_not_found',
    'request_already_decided',
    'invalid_decision_body',
    'forbidden_live_authority_fields',
    'marketRegistryMutation:',
    'enum: [false]',
  ]) {
    assert.ok(decisionError.includes(requiredText), `ListingRequestDecisionError schema should include ${requiredText}`);
  }

  for (const requiredText of [
    '## Approved local review decision workflow',
    '`POST /v1/listings/requests/{requestId}/decision`',
    '`decisionMode: local_review_decision`',
    '`requestStatus: reviewed-local-metadata-only`',
    '`reviewDecision: approved-local-metadata-only`',
    '`reviewDecision: rejected-local-metadata-only`',
    'explicit Clonners approval required before `MarketRegistry.addMarket`',
    'cannot move `TradingVault` balances, mutate `MarketRegistry`, register real token addresses, or grant withdrawal/admin authority',
  ]) {
    assert.ok(policy.includes(requiredText), `docs/listing-policy.md should include local decision text ${requiredText}`);
  }

  assert.ok(
    plan.includes('Completed local review decision boundary'),
    'post-listing plan should mark the local review decision boundary complete after this slice',
  );
  assert.doesNotMatch(
    `${route}\n${decisionRequest}\n${decisionResponse}\n${decisionError}\n${policy}\n${plan}`,
    /walletPrivateKey|listingAdminPrivateKey|rpcUrl\s*:|MarketRegistry mutation submitted|has been submitted on-chain/i,
    'local review decision docs must not introduce wallets/RPC/signing/deploy/tx or on-chain submission claims',
  );
});

test('contracts and architecture docs link listing policy as the active safe metadata slice', async () => {
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');
  const plan = await readText('docs/plans/2026-06-07-native-qi-wrapper-adapter-boundary.md');

  for (const text of [contracts, architecture, plan]) {
    assert.ok(text.includes('docs/listing-policy.md'), 'docs should link the token listing policy');
    assert.ok(text.includes('token listing and MarketRegistry metadata flow'), 'docs should name the listing metadata flow');
  }

  assert.ok(
    plan.includes('Completed: `GET /v1/listings/policy` exposes read-only listing metadata'),
    'wrapped token plan should mark the listing-policy route slice complete once implemented',
  );
});
