# TypeScript SDK

First-class client for bots, market makers and frontend code.

Smoke stub available now:

```ts
import { QDexClient, createMockSignedOrder, runMockCrossSmoke } from '@qdex/sdk-typescript';

const dex = new QDexClient({ baseUrl: 'http://127.0.0.1:8787' });
const contractRegistry = await dex.contracts.get();
const accountBalances = await dex.account.balances();
const listingPolicy = await dex.listings.policy.get();
const listingReviewFlow = await dex.listings.reviewFlow.get();
const listingRequestPrepare = await dex.listings.requests.prepareSubmit({
  baseSymbol: 'COMMUNITY',
  quoteSymbol: 'WQUAI',
  tokenModel: 'erc20-style-vault-token',
  requestedMarketId: 'COMMUNITY-WQUAI',
  pricePrecision: 8,
  amountPrecision: 8,
  minAmount: '1',
  reviewNotes: 'metadata-only local request',
});
const listingReviewQueue = await dex.listings.requests.listLocalReviewQueue();
const queuedListingRequest = await dex.listings.requests.enqueueLocalReview({
  baseSymbol: 'COMMUNITY',
  quoteSymbol: 'WQI',
  tokenModel: 'erc20-style-vault-token',
  requestedMarketId: 'COMMUNITY-WQI',
  pricePrecision: 8,
  amountPrecision: 8,
  minAmount: '1',
  reviewNotes: 'metadata-only local review queue request',
});
const listingReviewDecision = await dex.listings.requests.decideLocalReview(queuedListingRequest.body.requestId, {
  decision: 'approve',
  reviewStage: 'clonners_local_approval',
  decisionNotes: 'metadata-only local approval',
});
const relayerGate = await dex.relayer.settlementModeGate.get();
const nonceCancelPrepare = await dex.nonces.prepareCancel({
  action: 'cancelNonce',
  owner: '0x1111111111111111111111111111111111111111',
  nonce: '77',
  chainId: 0,
  nonceManagerContract: '0x0000000000000000000000000000000000000000',
  expiresAt: 1780003600,
  signature: '0xowner-signed-placeholder',
});
const fillsStream = dex.fills.openStream({ timeoutMs: 2000 });
const initialFillsSnapshot = await fillsStream.next();
await fillsStream.close();
const ordersStream = dex.orders.openStream({ timeoutMs: 2000 });
const initialOrdersSnapshot = await ordersStream.next();
await ordersStream.close();

const result = await runMockCrossSmoke(dex, {
  restingSell: createMockSignedOrder({ side: 'sell', amount: '100', price: '5', nonce: '1' }),
  crossingBuy: createMockSignedOrder({ side: 'buy', amount: '100', price: '6', nonce: '2' }),
});

console.log(contractRegistry.deploymentStatus); // local-only-not-deployed
console.log(accountBalances.source); // mock-vault-projection
console.log(accountBalances.permissions); // READ_ONLY, NO_WITHDRAW, NO_ADMIN
console.log(accountBalances.settlementMode); // mock
console.log(contractRegistry.listedAssetStatus.status); // wrapped-token-listing
console.log(contractRegistry.listedAssetStatus.primaryQuoteAssets); // WQUAI, WQI
console.log(contractRegistry.listedAssetStatus.supportedAssetModel); // erc20-style-vault-token
console.log(contractRegistry.listedAssetStatus.nativeQiTreatment); // out-of-scope-direct-settlement-use-WQI
console.log(listingPolicy.source); // listed-asset-marketregistry-policy
console.log(listingPolicy.status); // design-only-local-metadata
console.log(listingPolicy.primaryQuoteAssets); // WQUAI, WQI
console.log(listingPolicy.supportedAssets[2].symbol); // community-created-erc20-style-token
console.log(listingPolicy.marketRegistry.truthSource); // MarketRegistry-enabled-pair-metadata
console.log(listingPolicy.safety.delegatePermissions); // NO_WITHDRAW, NO_ADMIN
console.log(listingReviewFlow.source); // listed-asset-marketregistry-review-flow
console.log(listingReviewFlow.status); // design-only-local-metadata
console.log(listingReviewFlow.phase); // clonners-managed-local-review-before-dao
console.log(listingReviewFlow.approvalOutcome.approvedStatus); // approved-local-metadata-only
console.log(listingReviewFlow.approvalOutcome.rejectedStatus); // rejected-local-metadata-only
console.log(listingReviewFlow.safety.permissions); // NO_WITHDRAW, NO_ADMIN
console.log(listingRequestPrepare.status); // 501
console.log(listingRequestPrepare.body.error); // listing_request_not_implemented
console.log(listingRequestPrepare.body.requestStatus); // not-implemented-approval-required
console.log(listingRequestPrepare.body.source); // listed-asset-marketregistry-policy
console.log(listingRequestPrepare.body.status); // design-only-local-metadata
console.log(listingRequestPrepare.body.primaryQuoteAssets); // WQUAI, WQI
console.log(listingRequestPrepare.body.supportedAsset); // community-created-erc20-style-token
console.log(listingRequestPrepare.body.permissions); // NO_WITHDRAW, NO_ADMIN
console.log(listingRequestPrepare.body.marketRegistry.marketRegistryMutation); // false
console.log(listingReviewQueue.queueStatus); // local-in-memory-review-queue
console.log(listingReviewQueue.persistence); // in-memory-local-server-only
console.log(queuedListingRequest.status); // 202
console.log(queuedListingRequest.body.requestStatus); // queued-local-review
console.log(queuedListingRequest.body.reviewDecision); // pending-local-review
console.log(queuedListingRequest.body.permissions); // NO_WITHDRAW, NO_ADMIN
console.log(listingReviewDecision.status); // 200
console.log(listingReviewDecision.body.decisionMode); // decisionMode: local_review_decision
console.log(listingReviewDecision.body.requestStatus); // reviewed-local-metadata-only
console.log(listingReviewDecision.body.reviewDecision); // approved-local-metadata-only
console.log(listingReviewDecision.body.nextMutationGate); // explicit Clonners approval required before MarketRegistry.addMarket
console.log(listingReviewDecision.body.permissions); // NO_WITHDRAW, NO_ADMIN
console.log(relayerGate.source); // relayer-approval-gate
console.log(relayerGate.currentSettlementMode); // currentSettlementMode: mock
console.log(relayerGate.modes.quai_contract.reason); // real_quai_approval_gate_blocked
console.log(nonceCancelPrepare.status); // 501
console.log(nonceCancelPrepare.body.error); // owner_signed_nonce_cancel_not_implemented
console.log(nonceCancelPrepare.body.nonceManager); // owner-signed-required
console.log(nonceCancelPrepare.body.permissions); // NO_WITHDRAW, NO_ADMIN
console.log(initialFillsSnapshot.snapshot.permissions); // READ_ONLY, NO_WITHDRAW, NO_ADMIN
console.log(initialOrdersSnapshot.snapshot.channel); // orders
console.log(result.fill.projectionType); // IndexedFillProjection
console.log(result.fill.sourceEventId);
console.log(result.proof.settlementMode); // mock
```

`contracts.get()` calls `GET /v1/contracts` and returns local-only contract metadata with null addresses, `realQuaiTransactions: false`, `walletRequired: false`, and no deploy/transaction side effects. `contractRegistry.listedAssetStatus.status` is `wrapped-token-listing`; primary quote assets are `WQUAI` and `WQI`. Listing policy metadata is already exposed through GET /v1/listings/policy; listing requests remain prepare-only through POST /v1/listings/requests; runtime listing submission or MarketRegistry admin mutation requires explicit Clonners approval. Approved community-created tokens are listable only through those approval-gated metadata surfaces, and raw native Qi direct settlement is out of scope. The safety notice preserves: no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real native Qi settlement claim.

`dex.account.balances()` calls `GET /v1/account/balances` and returns the read-only `mock-vault-projection` envelope with `settlementMode: mock`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, and `walletRequired: false`. It has no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.

`dex.listings.policy.get()` calls `GET /v1/listings/policy` and returns read-only `listed-asset-marketregistry-policy` / `design-only-local-metadata` for WQUAI, WQI, and `community-created-erc20-style-token` assets. It exposes `MarketRegistry-enabled-pair-metadata`, `NO_WITHDRAW`, and `NO_ADMIN` safety only; there is no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds, and the metadata cannot move TradingVault balances or grant withdrawal/admin power.

`dex.listings.reviewFlow.get()` calls `GET /v1/listings/review-flow` and returns read-only `listed-asset-marketregistry-review-flow` / `design-only-local-metadata` for `phase: clonners-managed-local-review-before-dao`. It exposes local-only review statuses like `approved-local-metadata-only` and `rejected-local-metadata-only`, keeps `NO_WITHDRAW` and `NO_ADMIN`, has no wallets/RPC/signing/broadcast/deploy/tx/funds behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`dex.listings.requests.prepareSubmit()` calls `POST /v1/listings/requests` and returns the prepare-only 501 placeholder body (`listing_request_not_implemented`, `not-implemented-approval-required`, `listed-asset-marketregistry-policy`, `design-only-local-metadata`) for WQUAI/WQI `community-created-erc20-style-token` metadata. This client treats the intentional 501 as a boundary response, not as a generic transport failure and not as proof of submission: it preserves `NO_WITHDRAW`/`NO_ADMIN`, no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and does not prove a listing request was submitted on-chain.

`dex.listings.requests.listLocalReviewQueue()` calls `GET /v1/listings/requests`, and `dex.listings.requests.enqueueLocalReview()` calls `POST /v1/listings/requests with requestMode: local_review_queue`. The local queue surface returns `listed-asset-marketregistry-review-flow`, `local-in-memory-review-queue`, `in-memory-local-server-only`, `queued-local-review`, and `pending-local-review` metadata only. It preserves `NO_WITHDRAW`/`NO_ADMIN`, has no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`dex.listings.requests.decideLocalReview()` calls `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision` and records immutable local review metadata only. The response carries `reviewed-local-metadata-only`, `approved-local-metadata-only` / `rejected-local-metadata-only`, `explicit Clonners approval required before MarketRegistry.addMarket`, `NO_WITHDRAW`, and `NO_ADMIN`; it has no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`dex.relayer.settlementModeGate.get()` calls `GET /v1/relayer/settlement-mode-gate` and returns read-only `relayer-approval-gate` metadata for `currentSettlementMode: mock` plus the blocked `quai_contract` reason `real_quai_approval_gate_blocked`; it performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.

`dex.nonces.prepareCancel()` calls `POST /v1/nonces/cancel` and returns the prepare-only 501 placeholder body (`owner_signed_nonce_cancel_not_implemented`, `owner-signed-required`, `NO_WITHDRAW`, `NO_ADMIN`) with no wallet loading, signing, broadcast, or relayer submission.

`fills.openStream()` consumes the local `/v1/ws?channel=fills` WebSocket transport. Private stream snapshots remain read-only and carry `NO_WITHDRAW`/`NO_ADMIN` permissions.

`orders.openStream()` consumes `/v1/ws?channel=orders` for order/cancel stream snapshots. Matcher-local cancellation updates keep on-chain nonce wording explicit and do not grant withdrawal/admin authority.

The smoke helper is deliberately mock-only: it proves the API/indexer/proof loop without wallets, transactions, real Quai settlement, or fund movement.
