# Python SDK

Python client for agents, research scripts and market makers.

Current status: dependency-light mock smoke stub. It mirrors the TypeScript SDK/`qdex smoke` bot loop against the local mock API without adding wallet, transaction, withdrawal, or custody authority. Public market-data streams are bounded local WebSocket readers only: no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Executable mock surface:

```python
from qdex_client import QDexClient, create_mock_signed_order, run_mock_cross_smoke

dex = QDexClient(base_url=base_url)
markets = dex.markets.list()
book = dex.orderbook.get("WQUAI-WQI")
one_minute_klines = dex.klines.get("WQUAI-WQI", interval="1m")  # /v1/klines/<MARKET>?interval=1m
kline_stream = dex.klines.open_stream("WQUAI-WQI", interval="1m", timeout=2)  # /v1/ws?channel=market.<MARKET>.klines.1m
try:
    initial_kline_stream_snapshot = kline_stream.next()
finally:
    kline_stream.close()
kline_stream_snapshots = dex.klines.stream("WQUAI-WQI", interval="1m", limit=1, timeout=2)
ticker_stream = dex.tickers.open_stream(timeout=2)  # /v1/ws?channel=global.tickers
try:
    initial_ticker_stream_snapshot = ticker_stream.next()
finally:
    ticker_stream.close()
ticker_stream_snapshots = dex.tickers.stream(limit=1, timeout=2)
depth_stream = dex.orderbook.open_stream("WQUAI-WQI", timeout=2)  # /v1/ws?channel=market.<MARKET>.depth
try:
    initial_depth_stream_snapshot = depth_stream.next()
finally:
    depth_stream.close()
depth_stream_snapshots = dex.orderbook.stream("WQUAI-WQI", limit=1, timeout=2)
trade_stream = dex.trades.open_stream("WQUAI-WQI", timeout=2)  # /v1/ws?channel=market.<MARKET>.trades
try:
    initial_trade_stream_snapshot = trade_stream.next()
finally:
    trade_stream.close()
trade_stream_snapshots = dex.trades.stream("WQUAI-WQI", limit=1, timeout=2)
contracts = dex.contracts.get()
fees = dex.fees.get()
fee_stream = dex.fees.open_stream(timeout=2)
try:
    initial_fee_stream_snapshot = fee_stream.next()
finally:
    fee_stream.close()
fee_stream_snapshots = dex.fees.stream(limit=1, timeout=2)
account_overview = dex.account.get()
balances = dex.account.balances()
vault_deposits = dex.vault.deposits.list()
vault_withdrawals = dex.vault.withdrawals.list()
vault_deposit_stream = dex.vault.deposits.open_stream(timeout=2)
try:
    initial_deposit_stream_snapshot = vault_deposit_stream.next()
finally:
    vault_deposit_stream.close()
vault_withdrawal_stream_snapshots = dex.vault.withdrawals.stream(limit=1, timeout=2)
vault_deposit_prepare = dex.vault.deposits.prepare({
    "owner": "0x1111111111111111111111111111111111111111",
    "assetSymbol": "WQI",
    "amount": "10",
    "chainId": 0,
    "vaultContractRef": "local-only-not-deployed",
})
vault_withdrawal_prepare = dex.vault.withdrawals.prepare({
    "owner": "0x1111111111111111111111111111111111111111",
    "assetSymbol": "WQUAI",
    "amount": "1",
    "chainId": 0,
    "vaultContractRef": "local-only-not-deployed",
})
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
assert one_minute_klines["source"] == "mock-candle-projection"  # /v1/klines/<MARKET>?interval=1m
assert one_minute_klines["interval"] == "1m"
assert initial_kline_stream_snapshot["snapshot"]["channel"] == "market.WQUAI-WQI.klines.1m"  # /v1/ws?channel=market.<MARKET>.klines.1m
assert initial_kline_stream_snapshot["snapshot"]["payload"] == "kline_snapshot"
assert initial_kline_stream_snapshot["snapshot"]["source"] == "mock-candle-projection"
assert initial_kline_stream_snapshot["snapshot"]["custody"] == "public-read-only-no-custody"
assert kline_stream_snapshots[0]["snapshot"]["payload"] == "kline_snapshot"
assert initial_ticker_stream_snapshot["snapshot"]["channel"] == "global.tickers"
assert initial_ticker_stream_snapshot["snapshot"]["payload"] == "ticker_snapshot"
assert initial_ticker_stream_snapshot["snapshot"]["custody"] == "public-read-only-no-custody"
assert initial_ticker_stream_snapshot["snapshot"]["data"]["tickers"][0]["source"] == "mock-market-data"
assert ticker_stream_snapshots[0]["snapshot"]["payload"] == "ticker_snapshot"
assert initial_depth_stream_snapshot["snapshot"]["payload"] == "orderbook_depth"
assert initial_depth_stream_snapshot["snapshot"]["custody"] == "public-read-only-no-custody"
assert initial_depth_stream_snapshot["snapshot"]["data"]["source"] == "mock-orderbook"
assert depth_stream_snapshots[0]["snapshot"]["payload"] == "orderbook_depth"
assert initial_trade_stream_snapshot["snapshot"]["payload"] == "trade_projection"
assert initial_trade_stream_snapshot["snapshot"]["custody"] == "public-read-only-no-custody"
assert initial_trade_stream_snapshot["snapshot"]["data"]["source"] == "in-memory-indexer-projection"
assert initial_trade_stream_snapshot["snapshot"]["data"]["settlementStatus"] == "confirmed"  # confirmed-settlement-only
assert trade_stream_snapshots[0]["snapshot"]["payload"] == "trade_projection"
assert contracts["listedAssetStatus"]["primaryQuoteAssets"] == ["WQUAI", "WQI"]
assert contracts["listedAssetStatus"]["supportedAssetModel"] == "erc20-style-vault-token"
assert contracts["listedAssetStatus"]["nativeQiTreatment"] == "out-of-scope-direct-settlement-use-WQI"
assert fees["source"] == "feemanager-policy-projection"  # GET /v1/fees
assert fees["feeSchedules"][0]["projectionType"] == "FeeScheduleProjection"
assert fees["feeSchedules"][0]["eventName"] == "FeesUpdated"  # eventName: FeesUpdated
assert fees["hardMaxFeeBps"] == 1000  # hardMaxFeeBps: 1000
assert fees["feeRecipient"] is None  # feeRecipient: None
assert fees["permissions"] == ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"]
assert fees["feeManagerMutation"] is False  # feeManagerMutation: False
assert fees["tradingVaultMutation"] is False  # tradingVaultMutation: False
assert initial_fee_stream_snapshot["snapshot"]["channel"] == "fees"  # /v1/ws?channel=fees
assert initial_fee_stream_snapshot["snapshot"]["payload"] == "fee_schedule_projection"
assert initial_fee_stream_snapshot["snapshot"]["custody"] == "public-read-only-no-custody"
assert initial_fee_stream_snapshot["snapshot"]["data"]["source"] == "feemanager-policy-projection"
assert initial_fee_stream_snapshot["snapshot"]["data"]["feeSchedules"][0]["projectionType"] == "FeeScheduleProjection"
assert initial_fee_stream_snapshot["snapshot"]["data"]["permissions"] == ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"]
assert fee_stream_snapshots[0]["snapshot"]["data"]["hardMaxFeeBps"] == 1000
assert account_overview["source"] == "mock-account-overview"
assert account_overview["session"]["mode"] == "mock-local-no-wallet-session"
assert account_overview["balances"]["source"] == "mock-vault-projection"
assert account_overview["orders"]["source"] == "mock-order-projection"
assert account_overview["fills"]["projectionType"] == "IndexedFillProjection"
assert account_overview["permissions"] == ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"]
assert account_overview["settlementMode"] == "mock"  # settlementMode: mock
assert account_overview["realQuaiTransactions"] is False  # realQuaiTransactions: false
assert account_overview["walletRequired"] is False  # walletRequired: false
assert account_overview["fundsMoved"] is False  # fundsMoved: false
assert account_overview["tradingVaultMutation"] is False  # tradingVaultMutation: false
assert balances["source"] == "mock-vault-projection"
assert balances["permissions"] == ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"]
assert balances["settlementMode"] == "mock"
assert vault_deposits["source"] == "tradingvault-event-projection"  # source: tradingvault-event-projection
assert vault_deposits["projectionType"] == "TradingVaultDepositProjection"
assert vault_deposits["permissions"] == ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"]
assert vault_deposits["settlementMode"] == "mock"  # settlementMode: mock
assert vault_deposits["realQuaiTransactions"] is False  # realQuaiTransactions: False
assert vault_deposits["walletRequired"] is False  # walletRequired: False
assert vault_deposits["fundsMoved"] is False  # fundsMoved: False
assert vault_deposits["tradingVaultMutation"] is False  # tradingVaultMutation: False
assert vault_withdrawals["projectionType"] == "TradingVaultWithdrawalProjection"  # GET /v1/vault/withdrawals
assert initial_deposit_stream_snapshot["snapshot"]["source"] == "tradingvault-event-projection"  # /v1/ws?channel=deposits
assert initial_deposit_stream_snapshot["snapshot"]["data"]["projectionType"] == "TradingVaultDepositProjection"
assert initial_deposit_stream_snapshot["snapshot"]["permissions"] == ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"]
assert initial_deposit_stream_snapshot["snapshot"]["data"]["settlementMode"] == "mock"  # settlementMode: mock
assert initial_deposit_stream_snapshot["snapshot"]["data"]["fundsMoved"] is False  # fundsMoved: False
assert initial_deposit_stream_snapshot["snapshot"]["data"]["tradingVaultMutation"] is False  # tradingVaultMutation: False
assert vault_withdrawal_stream_snapshots[0]["snapshot"]["channel"] == "withdrawals"  # /v1/ws?channel=withdrawals
assert vault_withdrawal_stream_snapshots[0]["snapshot"]["data"]["projectionType"] == "TradingVaultWithdrawalProjection"
assert vault_deposit_prepare["status"] == 501
assert vault_deposit_prepare["body"]["error"] == "owner_wallet_vault_deposit_not_implemented"
assert vault_deposit_prepare["body"]["source"] == "owner-wallet-vault-operation-placeholder"
assert vault_deposit_prepare["body"]["custody"] == "non-custodial-contract-vault"
assert vault_deposit_prepare["body"]["operationStatus"] == "prepare-only-not-implemented"
assert vault_deposit_prepare["body"]["ownerAuthorization"] == "owner-wallet-required"
assert vault_deposit_prepare["body"]["delegateAuthority"] == "delegates-cannot-deposit-or-withdraw"
assert vault_deposit_prepare["body"]["permissions"] == ["NO_WITHDRAW", "NO_ADMIN"]
assert vault_deposit_prepare["body"]["fundsMoved"] is False  # fundsMoved: False
assert vault_deposit_prepare["body"]["tradingVaultMutation"] is False  # tradingVaultMutation: False
assert vault_withdrawal_prepare["body"]["error"] == "owner_wallet_vault_withdrawal_not_implemented"
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
delegate_key_prepare = dex.delegate_keys.prepare_register({
    "owner": "0x1111111111111111111111111111111111111111",
    "delegate": "0x3333333333333333333333333333333333333333",
    "allowedMarkets": ["WQUAI-WQI"],
    "maxNotional": "1000",
    "permissions": ["PLACE_ORDER", "CANCEL_ORDER", "CANCEL_ALL", "NO_WITHDRAW", "NO_ADMIN"],
    "expiresAt": 1780003600,
    "signature": "0xowner-signed-placeholder",
})
delegate_key_revocation_prepare = dex.delegate_keys.prepare_revoke("bot-mm-1", {
    "owner": "0x1111111111111111111111111111111111111111",
    "signature": "0xowner-signed-placeholder",
})
nonce_cancellations = dex.nonces.cancellations.list()
nonce_cancellation_stream = dex.nonces.cancellations.open_stream(timeout=2)
try:
    initial_nonce_cancellation_stream_snapshot = nonce_cancellation_stream.next()
finally:
    nonce_cancellation_stream.close()
nonce_cancellation_stream_snapshots = dex.nonces.cancellations.stream(limit=1, timeout=2)
orders_stream = dex.orders.open_stream(timeout=2)  # /v1/ws?channel=orders
try:
    initial_order_stream_snapshot = orders_stream.next()
finally:
    orders_stream.close()
order_stream_snapshots = dex.orders.stream(limit=1, timeout=2)
fills_list = dex.fills.list()
fill_stream = dex.fills.open_stream(timeout=2)
try:
    initial_fill_stream_snapshot = fill_stream.next()
finally:
    fill_stream.close()
fill_stream_snapshots = dex.fills.stream(limit=1, timeout=2)
delegate_key_registrations = dex.delegate_keys.list_registrations()
delegate_key_revocations = dex.delegate_keys.list_revocations()
delegate_key_registration_stream = dex.delegate_keys.registrations.open_stream(timeout=2)
try:
    initial_delegate_key_registration_stream_snapshot = delegate_key_registration_stream.next()
finally:
    delegate_key_registration_stream.close()
delegate_key_revocation_stream_snapshots = dex.delegate_keys.revocations.stream(limit=1, timeout=2)

resting_sell = create_mock_signed_order(side="sell", amount="100", price="5", nonce="1")
crossing_buy = create_mock_signed_order(side="buy", amount="100", price="6", nonce="2")
smoke = run_mock_cross_smoke(dex, resting_sell=resting_sell, crossing_buy=crossing_buy)
assert smoke["fill"]["projectionType"] == "IndexedFillProjection"
proof = smoke["proof"]
```

`dex.klines.get()` calls `GET /v1/klines/<MARKET>?interval=1m` and returns public candle projection metadata with `source: mock-candle-projection`, empty local mock `candles`, and no custody authority. `dex.klines.open_stream()` consumes `/v1/ws?channel=market.<MARKET>.klines.1m`, and bounded `dex.klines.stream(limit=limit)` exposes the same public-read-only-no-custody `kline_snapshot` stream to bots. These kline/candle helpers preserve `mock-candle-projection`, `public-read-only-no-custody`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior. A standalone test `test_python_sdk_consumes_public_klines_stream_without_custody_authority` covers the full bounded `open_stream`/`stream` pattern with 17 assertions.

`dex.tickers.open_stream()` consumes public `/v1/ws?channel=global.tickers` snapshots, and bounded `dex.tickers.stream(limit=limit)` exposes the same public-read-only-no-custody `ticker_snapshot` stream to bots. Each snapshot preserves `ticker_snapshot`, `source: mock-market-data`, `visibility: public`, `custody: public-read-only-no-custody`, `data.tickers[0].marketId`, `data.tickers[0].source`, null `lastPrice`/`bestBid`/`bestAsk` (mock), and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior. A standalone test `test_python_sdk_consumes_public_tickers_stream_without_custody_authority` covers the full bounded `open_stream`/`stream` pattern with 18 assertions.

`dex.trades.open_stream(market_id)` consumes public `/v1/ws?channel=market.<MARKET>.trades` snapshots, and bounded `dex.trades.stream(market_id, limit=limit)` exposes the same public-read-only-no-custody `trade_projection` stream to bots. Each snapshot preserves `trade_projection`, `source: in-memory-indexer-projection`, `visibility: public`, `custody: public-read-only-no-custody`, `data.marketId`, `data.trades` (empty mock array), `confirmed-settlement-only`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior. A standalone test `test_python_sdk_consumes_public_trades_stream_without_custody_authority` covers the full bounded `open_stream`/`stream` pattern with 18 assertions.

`dex.orderbook.open_stream(market_id)` consumes public `/v1/ws?channel=market.<MARKET>.depth` snapshots, and bounded `dex.orderbook.stream(market_id, limit=limit)` exposes the same public-read-only-no-custody `orderbook_depth` stream to bots. Each snapshot preserves `orderbook_depth`, `source: mock-orderbook`, `visibility: public`, `custody: public-read-only-no-custody`, `data.marketId`, `data.bids` (empty mock array), `data.asks` (empty mock array), and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior. A standalone test `test_python_sdk_consumes_public_orderbook_depth_stream_without_custody_authority` covers the full bounded `open_stream`/`stream` pattern with 22 assertions.

`contracts.get()` calls `GET /v1/contracts` and returns local-only contract metadata with null addresses, `local-only-not-deployed`, `realQuaiTransactions: False`, `walletRequired: False`, `TradeSettled` as the proof trigger, and delegate safety requiring `PLACE_ORDER`, `NO_WITHDRAW`, and `NO_ADMIN`. It also returns `listedAssetStatus`: `wrapped-token-listing`, primary quote assets `WQUAI` and `WQI`, user-listed token support, and native Qi direct settlement out of scope in favor of WQI. Listing policy metadata is already exposed through GET /v1/listings/policy; listing requests remain prepare-only through POST /v1/listings/requests; runtime listing submission or MarketRegistry admin mutation requires explicit Clonners approval. It does not load wallets, send transactions, read RPC URLs, deploy contracts, or claim real Quai contract addresses; its safety notice says no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real native Qi settlement claim.

`dex.fees.get()` calls `GET /v1/fees` and returns read-only FeeManager fee schedule metadata with `source: feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: None`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: False`, and `tradingVaultMutation: False`. It has no wallet/RPC/signing/broadcast/deploy/tx/funds behavior, no fee-authority runtime keys, and no live FeeManager or TradingVault mutation authority.

`dex.fees.open_stream()` consumes public `/v1/ws?channel=fees` snapshots, and bounded `dex.fees.stream(limit=limit)` exposes the same public-read-only-no-custody stream to bots. Each snapshot preserves `fee_schedule_projection`, `source: feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: None`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: False`, and `tradingVaultMutation: False`; there is no fee-authority runtime key, wallet/RPC/signing/broadcast/deploy/tx/funds behavior, or live FeeManager/TradingVault mutation authority.

`dex.account.get()` calls `GET /v1/account` and returns the read-only `mock-account-overview` envelope with `mock-local-no-wallet-session`, nested `mock-vault-projection` balances, matcher-local `mock-order-projection` open orders, confirmed-only `IndexedFillProjection` rows, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`. It has no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and cannot grant delegate withdrawal/admin authority.

`dex.account.balances()` calls `GET /v1/account/balances` and returns the read-only `mock-vault-projection` envelope with `settlementMode: mock`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: False`, and `walletRequired: False`. It has no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.

`dex.vault.deposits.list()` and `dex.vault.withdrawals.list()` call `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals` and return read-only `source: tradingvault-event-projection` history envelopes. They expose `TradingVaultDepositProjection` / `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: False`, `walletRequired: False`, `fundsMoved: False`, and `tradingVaultMutation: False` with mock-null event evidence and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`dex.vault.deposits.open_stream()` and `dex.vault.withdrawals.open_stream()` consume private vault history snapshots from `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals`. Bounded `dex.vault.deposits.stream(limit=limit)` and `dex.vault.withdrawals.stream(limit=limit)` helpers expose the same `tradingvault-event-projection` snapshots with `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `fundsMoved: False`, and `tradingVaultMutation: False`; there is no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`dex.vault.deposits.prepare()` and `dex.vault.withdrawals.prepare()` call `POST /v1/vault/deposits/prepare` and `POST /v1/vault/withdrawals/prepare` and return the intentional 501 owner-wallet placeholders (`owner_wallet_vault_deposit_not_implemented` / `owner_wallet_vault_withdrawal_not_implemented`). The envelope preserves `source: owner-wallet-vault-operation-placeholder`, `custody: non-custodial-contract-vault`, `operationStatus: prepare-only-not-implemented`, `ownerAuthorization: owner-wallet-required`, `delegateAuthority: delegates-cannot-deposit-or-withdraw`, `NO_WITHDRAW`, `NO_ADMIN`, `fundsMoved: False`, and `tradingVaultMutation: False`; the SDK treats the placeholder as a boundary response with no wallet/RPC/sign/broadcast/deploy/tx/funds behavior.

`dex.listings.policy.get()` calls `GET /v1/listings/policy` and returns read-only `listed-asset-marketregistry-policy` / `design-only-local-metadata` for WQUAI, WQI, and `community-created-erc20-style-token` assets. It exposes `MarketRegistry-enabled-pair-metadata`, `NO_WITHDRAW`, and `NO_ADMIN` safety only; there is no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds, and the metadata cannot move TradingVault balances or grant withdrawal/admin power.

`dex.listings.review_flow.get()` calls `GET /v1/listings/review-flow` and returns read-only `listed-asset-marketregistry-review-flow` / `design-only-local-metadata` for `phase: clonners-managed-local-review-before-dao`. It exposes local-only review statuses like `approved-local-metadata-only` and `rejected-local-metadata-only`, keeps `NO_WITHDRAW` and `NO_ADMIN`, has no wallets/RPC/signing/broadcast/deploy/tx/funds behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`dex.listings.requests.prepare_submit()` calls `POST /v1/listings/requests` and returns the prepare-only 501 placeholder body (`listing_request_not_implemented`, `not-implemented-approval-required`, `listed-asset-marketregistry-policy`, `design-only-local-metadata`) for WQUAI/WQI `community-created-erc20-style-token` metadata. It treats the intentional 501 as a boundary response, not as a generic transport failure and not as proof of submission: it preserves `NO_WITHDRAW`/`NO_ADMIN`, no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and does not prove a listing request was submitted on-chain.

`dex.listings.requests.list_local_review_queue()` calls `GET /v1/listings/requests`, and `dex.listings.requests.enqueue_local_review()` calls `POST /v1/listings/requests with requestMode: local_review_queue`. The local queue surface returns `listed-asset-marketregistry-review-flow`, `local-in-memory-review-queue`, `in-memory-local-server-only`, `queued-local-review`, and `pending-local-review` metadata only. It preserves `NO_WITHDRAW`/`NO_ADMIN`, has no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`dex.listings.requests.decide_local_review()` calls `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision` and records immutable local review metadata only. The response carries `reviewed-local-metadata-only`, `approved-local-metadata-only` / `rejected-local-metadata-only`, `explicit Clonners approval required before MarketRegistry.addMarket`, `NO_WITHDRAW`, and `NO_ADMIN`; it has no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`dex.relayer.settlement_mode_gate.get()` calls `GET /v1/relayer/settlement-mode-gate` and returns read-only `relayer-approval-gate` metadata for `currentSettlementMode: mock` plus the blocked `quai_contract` reason `real_quai_approval_gate_blocked`; it performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.

Mock proofs intentionally keep `settlementMode: mock`, `settlementTx: None`, no explorer URL, and explicit no-funds-moved safety copy.

`dex.nonces.prepare_cancel()` calls `POST /v1/nonces/cancel` and returns the prepare-only 501 placeholder body (`owner_signed_nonce_cancel_not_implemented`, `owner-signed-required`, `NO_WITHDRAW`, `NO_ADMIN`) with no wallet loading, signing, broadcast, or relayer submission.

`dex.nonces.cancellations.list()` calls `GET /v1/nonces/cancellations` and returns read-only `source: nonce-manager-event-projection` history envelopes. It exposes `NonceCancelledProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: False`, `walletRequired: False`, `fundsMoved: False`, `nonceManagerMutation: False`, and `tradingVaultMutation: False` with mock-null event evidence and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`dex.nonces.cancellations.open_stream()` consumes private NonceManager cancellation history snapshots from `/v1/ws?channel=nonce-cancellations`. Bounded `dex.nonces.cancellations.stream(limit=limit)` exposes the same `nonce-manager-event-projection` snapshots with `nonce_cancellation_projection`, `NonceCancelledProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `nonceManagerMutation: False`, `tradingVaultMutation: False`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`dex.fills.open_stream()` consumes private fill history snapshots from `/v1/ws?channel=fills`. Bounded `dex.fills.stream(limit=limit)` exposes the same `in-memory-indexer-projection` snapshots with `fill_projection`, `IndexedFillProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `finality: confirmed-settlement-only`, `settlementMode: mock`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`dex.orders.open_stream()` consumes private order projection snapshots from `/v1/ws?channel=orders`. Bounded `dex.orders.stream(limit=limit)` exposes the same `mock-order-projection` snapshots with `order_projection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `matcher-local-cancel-only-on-chain-nonce-unchanged`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`dex.delegate_keys.prepare_register()` and `dex.delegate_keys.prepare_revoke()` call `POST /v1/delegate-keys` and `DELETE /v1/delegate-keys/{keyId}` and return intentional 501 owner-signed delegate/API key placeholder bodies (`delegate_key_registration_not_implemented` / `delegate_key_revocation_not_implemented`). The envelopes preserve `source: delegate-key-owner-signed-prepare-boundary`, `operationStatus: prepare-only-owner-signed-required`, `ownerAuthorization: owner-wallet-signature-required`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: False`, and `delegateCanAdmin: False`; these clients have no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and do not mutate a live DelegateKeyRegistry or TradingVault.

`dex.delegate_keys.list_registrations()` and `dex.delegate_keys.list_revocations()` call `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations` and return read-only DelegateKeyRegistry event history envelopes. They expose `source: delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection` / `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateKeyRegistryMutation: False`, `delegateCanWithdraw: False`, and `delegateCanAdmin: False` with no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`dex.delegate_keys.registrations.open_stream()` and `dex.delegate_keys.revocations.open_stream()` consume private DelegateKeyRegistry history snapshots from `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations`. Bounded `dex.delegate_keys.registrations.stream(limit=limit)` and `dex.delegate_keys.revocations.stream(limit=limit)` helpers expose the same `delegatekeyregistry-event-projection` snapshots with `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateKeyRegistryMutation: False`, `delegateCanWithdraw: False`, and `delegateCanAdmin: False`; there is no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and no live DelegateKeyRegistry or TradingVault mutation.
