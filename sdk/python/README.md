# Python SDK

Python client for agents, research scripts and market makers.

Current status: dependency-light mock smoke stub. It mirrors the TypeScript SDK/`qdex smoke` bot loop against the local mock API without adding wallet, transaction, withdrawal, or custody authority.

Executable mock surface:

```python
from qdex_client import QDexClient, create_mock_signed_order, run_mock_cross_smoke

dex = QDexClient(base_url=base_url)
markets = dex.markets.list()
book = dex.orderbook.get("QI-QUAI")
contracts = dex.contracts.get()
balances = dex.account.balances()
listing_policy = dex.listings.policy.get()
listing_review_flow = dex.listings.review_flow.get()
listing_request_prepare = dex.listings.requests.prepare_submit({
    "baseSymbol": "COMMUNITY",
    "quoteSymbol": "WQUAI",
    "tokenModel": "erc20-style-vault-token",
    "requestedMarketId": "COMMUNITY-WQUAI",
    "pricePrecision": 8,
    "amountPrecision": 8,
    "minAmount": "1",
    "reviewNotes": "metadata-only local request",
})
listing_review_queue = dex.listings.requests.list_local_review_queue()
queued_listing_request = dex.listings.requests.enqueue_local_review({
    "baseSymbol": "COMMUNITY",
    "quoteSymbol": "WQI",
    "tokenModel": "erc20-style-vault-token",
    "requestedMarketId": "COMMUNITY-WQI",
    "pricePrecision": 8,
    "amountPrecision": 8,
    "minAmount": "1",
    "reviewNotes": "metadata-only local review queue request",
})
listing_review_decision = dex.listings.requests.decide_local_review(queued_listing_request["body"]["requestId"], {
    "decision": "reject",
    "reviewStage": "token_safety_review",
    "decisionNotes": "metadata-only local rejection",
    "rejectionReason": "metadata-incomplete-local-only",
})
assert contracts["listedAssetStatus"]["status"] == "wrapped-token-listing"
assert contracts["listedAssetStatus"]["primaryQuoteAssets"] == ["WQUAI", "WQI"]
assert contracts["listedAssetStatus"]["supportedAssetModel"] == "erc20-style-vault-token"
assert contracts["listedAssetStatus"]["nativeQiTreatment"] == "out-of-scope-direct-settlement-use-WQI"
assert balances["source"] == "mock-vault-projection"
assert balances["permissions"] == ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"]
assert balances["settlementMode"] == "mock"
assert listing_policy["source"] == "listed-asset-marketregistry-policy"
assert listing_policy["status"] == "design-only-local-metadata"
assert listing_policy["supportedAssets"][2]["symbol"] == "community-created-erc20-style-token"
assert listing_policy["marketRegistry"]["truthSource"] == "MarketRegistry-enabled-pair-metadata"
assert listing_policy["safety"]["delegatePermissions"] == ["NO_WITHDRAW", "NO_ADMIN"]
assert listing_review_flow["source"] == "listed-asset-marketregistry-review-flow"
assert listing_review_flow["status"] == "design-only-local-metadata"
assert listing_review_flow["phase"] == "clonners-managed-local-review-before-dao"
assert listing_review_flow["approvalOutcome"]["approvedStatus"] == "approved-local-metadata-only"
assert listing_review_flow["approvalOutcome"]["rejectedStatus"] == "rejected-local-metadata-only"
assert listing_review_flow["safety"]["permissions"] == ["NO_WITHDRAW", "NO_ADMIN"]
assert listing_request_prepare["status"] == 501
assert listing_request_prepare["body"]["error"] == "listing_request_not_implemented"
assert listing_request_prepare["body"]["requestStatus"] == "not-implemented-approval-required"
assert listing_request_prepare["body"]["source"] == "listed-asset-marketregistry-policy"
assert listing_request_prepare["body"]["status"] == "design-only-local-metadata"
assert listing_request_prepare["body"]["supportedAsset"] == "community-created-erc20-style-token"
assert listing_request_prepare["body"]["primaryQuoteAssets"] == ["WQUAI", "WQI"]
assert listing_request_prepare["body"]["permissions"] == ["NO_WITHDRAW", "NO_ADMIN"]
assert listing_review_queue["queueStatus"] == "local-in-memory-review-queue"
assert listing_review_queue["persistence"] == "in-memory-local-server-only"
assert queued_listing_request["status"] == 202
assert queued_listing_request["body"]["requestStatus"] == "queued-local-review"
assert queued_listing_request["body"]["reviewDecision"] == "pending-local-review"
assert queued_listing_request["body"]["permissions"] == ["NO_WITHDRAW", "NO_ADMIN"]
assert listing_review_decision["status"] == 200
assert listing_review_decision["body"]["decisionMode"] == "local_review_decision"
assert listing_review_decision["body"]["requestStatus"] == "reviewed-local-metadata-only"
assert listing_review_decision["body"]["reviewDecision"] == "rejected-local-metadata-only"
assert listing_review_decision["body"]["nextMutationGate"] == "explicit Clonners approval required before MarketRegistry.addMarket"
assert listing_review_decision["body"]["permissions"] == ["NO_WITHDRAW", "NO_ADMIN"]
relayer_gate = dex.relayer.settlement_mode_gate.get()
nonce_cancel_prepare = dex.nonces.prepare_cancel({
    "action": "cancelNonce",
    "owner": "0x1111111111111111111111111111111111111111",
    "nonce": "77",
    "chainId": 0,
    "nonceManagerContract": "0x0000000000000000000000000000000000000000",
    "expiresAt": 1780003600,
    "signature": "0xowner-signed-placeholder",
})

resting_sell = create_mock_signed_order(side="sell", amount="100", price="5", nonce="1")
crossing_buy = create_mock_signed_order(side="buy", amount="100", price="6", nonce="2")
smoke = run_mock_cross_smoke(dex, resting_sell=resting_sell, crossing_buy=crossing_buy)
assert smoke["fill"]["projectionType"] == "IndexedFillProjection"
proof = smoke["proof"]
```

`contracts.get()` calls `GET /v1/contracts` and returns local-only contract metadata with null addresses, `local-only-not-deployed`, `realQuaiTransactions: False`, `walletRequired: False`, `TradeSettled` as the proof trigger, and delegate safety requiring `PLACE_ORDER`, `NO_WITHDRAW`, and `NO_ADMIN`. It also returns `listedAssetStatus`: `wrapped-token-listing`, primary quote assets `WQUAI` and `WQI`, user-listed token support, and native Qi direct settlement out of scope in favor of WQI. Listing policy metadata is already exposed through GET /v1/listings/policy; listing requests remain prepare-only through POST /v1/listings/requests; runtime listing submission or MarketRegistry admin mutation requires explicit Clonners approval. It does not load wallets, send transactions, read RPC URLs, deploy contracts, or claim real Quai contract addresses; its safety notice says no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real native Qi settlement claim.

`dex.account.balances()` calls `GET /v1/account/balances` and returns the read-only `mock-vault-projection` envelope with `settlementMode: mock`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: False`, and `walletRequired: False`. It has no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.

`dex.listings.policy.get()` calls `GET /v1/listings/policy` and returns read-only `listed-asset-marketregistry-policy` / `design-only-local-metadata` for WQUAI, WQI, and `community-created-erc20-style-token` assets. It exposes `MarketRegistry-enabled-pair-metadata`, `NO_WITHDRAW`, and `NO_ADMIN` safety only; there is no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds, and the metadata cannot move TradingVault balances or grant withdrawal/admin power.

`dex.listings.review_flow.get()` calls `GET /v1/listings/review-flow` and returns read-only `listed-asset-marketregistry-review-flow` / `design-only-local-metadata` for `phase: clonners-managed-local-review-before-dao`. It exposes local-only review statuses like `approved-local-metadata-only` and `rejected-local-metadata-only`, keeps `NO_WITHDRAW` and `NO_ADMIN`, has no wallets/RPC/signing/broadcast/deploy/tx/funds behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`dex.listings.requests.prepare_submit()` calls `POST /v1/listings/requests` and returns the prepare-only 501 placeholder body (`listing_request_not_implemented`, `not-implemented-approval-required`, `listed-asset-marketregistry-policy`, `design-only-local-metadata`) for WQUAI/WQI `community-created-erc20-style-token` metadata. It treats the intentional 501 as a boundary response, not as a generic transport failure and not as proof of submission: it preserves `NO_WITHDRAW`/`NO_ADMIN`, no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and does not prove a listing request was submitted on-chain.

`dex.listings.requests.list_local_review_queue()` calls `GET /v1/listings/requests`, and `dex.listings.requests.enqueue_local_review()` calls `POST /v1/listings/requests with requestMode: local_review_queue`. The local queue surface returns `listed-asset-marketregistry-review-flow`, `local-in-memory-review-queue`, `in-memory-local-server-only`, `queued-local-review`, and `pending-local-review` metadata only. It preserves `NO_WITHDRAW`/`NO_ADMIN`, has no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`dex.listings.requests.decide_local_review()` calls `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision` and records immutable local review metadata only. The response carries `reviewed-local-metadata-only`, `approved-local-metadata-only` / `rejected-local-metadata-only`, `explicit Clonners approval required before MarketRegistry.addMarket`, `NO_WITHDRAW`, and `NO_ADMIN`; it has no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`dex.relayer.settlement_mode_gate.get()` calls `GET /v1/relayer/settlement-mode-gate` and returns read-only `relayer-approval-gate` metadata for `currentSettlementMode: mock` plus the blocked `quai_contract` reason `real_quai_approval_gate_blocked`; it performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.

Mock proofs intentionally keep `settlementMode: mock`, `settlementTx: None`, no explorer URL, and explicit no-funds-moved safety copy.

`dex.nonces.prepare_cancel()` calls `POST /v1/nonces/cancel` and returns the prepare-only 501 placeholder body (`owner_signed_nonce_cancel_not_implemented`, `owner-signed-required`, `NO_WITHDRAW`, `NO_ADMIN`) with no wallet loading, signing, broadcast, or relayer submission.
