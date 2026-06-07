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
listing_policy = dex.listings.policy.get()
assert contracts["listedAssetStatus"]["status"] == "wrapped-token-listing"
assert contracts["listedAssetStatus"]["primaryQuoteAssets"] == ["WQUAI", "WQI"]
assert contracts["listedAssetStatus"]["supportedAssetModel"] == "erc20-style-vault-token"
assert contracts["listedAssetStatus"]["nativeQiTreatment"] == "out-of-scope-direct-settlement-use-WQI"
assert listing_policy["source"] == "listed-asset-marketregistry-policy"
assert listing_policy["status"] == "design-only-local-metadata"
assert listing_policy["supportedAssets"][2]["symbol"] == "community-created-erc20-style-token"
assert listing_policy["marketRegistry"]["truthSource"] == "MarketRegistry-enabled-pair-metadata"
assert listing_policy["safety"]["delegatePermissions"] == ["NO_WITHDRAW", "NO_ADMIN"]
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

`contracts.get()` calls `GET /v1/contracts` and returns local-only contract metadata with null addresses, `local-only-not-deployed`, `realQuaiTransactions: False`, `walletRequired: False`, `TradeSettled` as the proof trigger, and delegate safety requiring `PLACE_ORDER`, `NO_WITHDRAW`, and `NO_ADMIN`. It also returns `listedAssetStatus`: `wrapped-token-listing`, primary quote assets `WQUAI` and `WQI`, user-listed token support, and native Qi direct settlement out of scope in favor of WQI. It does not load wallets, send transactions, read RPC URLs, deploy contracts, or claim real Quai contract addresses; its safety notice says no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real native Qi settlement claim.

`dex.listings.policy.get()` calls `GET /v1/listings/policy` and returns read-only `listed-asset-marketregistry-policy` / `design-only-local-metadata` for WQUAI, WQI, and `community-created-erc20-style-token` assets. It exposes `MarketRegistry-enabled-pair-metadata`, `NO_WITHDRAW`, and `NO_ADMIN` safety only; there is no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds, and the metadata cannot move TradingVault balances or grant withdrawal/admin power.

`dex.relayer.settlement_mode_gate.get()` calls `GET /v1/relayer/settlement-mode-gate` and returns read-only `relayer-approval-gate` metadata for `currentSettlementMode: mock` plus the blocked `quai_contract` reason `real_quai_approval_gate_blocked`; it performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.

Mock proofs intentionally keep `settlementMode: mock`, `settlementTx: None`, no explorer URL, and explicit no-funds-moved safety copy.

`dex.nonces.prepare_cancel()` calls `POST /v1/nonces/cancel` and returns the prepare-only 501 placeholder body (`owner_signed_nonce_cancel_not_implemented`, `owner-signed-required`, `NO_WITHDRAW`, `NO_ADMIN`) with no wallet loading, signing, broadcast, or relayer submission.
