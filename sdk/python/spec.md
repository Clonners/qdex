# Python SDK Bot Contract

The Python SDK is for agents, research scripts, and market makers. It mirrors the TypeScript bot flow while preserving the same custody boundary: API state is projection/cache, and settlement/indexer events remain final truth.

## Client surface

```python
dex = QDexClient(base_url=base_url, wallet=wallet, delegate_key=delegate_key)

markets = dex.markets.list()
book = dex.orderbook.get(market_id)
contracts = dex.contracts.get()  # GET /v1/contracts
fees = dex.fees.get()  # GET /v1/fees -> feemanager-policy-projection, FeeScheduleProjection, READ_ONLY
balances = dex.account.balances()  # GET /v1/account/balances -> mock-vault-projection, read-only, no wallet loaded, no funds moved
vault_deposits = dex.vault.deposits.list()  # GET /v1/vault/deposits -> source: tradingvault-event-projection, TradingVaultDepositProjection, READ_ONLY
vault_withdrawals = dex.vault.withdrawals.list()  # GET /v1/vault/withdrawals -> source: tradingvault-event-projection, TradingVaultWithdrawalProjection, READ_ONLY
deposit_history_stream = dex.vault.deposits.open_stream()  # /v1/ws?channel=deposits
deposit_history_snapshot = deposit_history_stream.next()
deposit_history_stream.close()
withdrawal_history_stream = dex.vault.withdrawals.open_stream()  # /v1/ws?channel=withdrawals
withdrawal_history_snapshot = withdrawal_history_stream.next()
withdrawal_history_stream.close()
limit = 1
vault_deposit_stream_snapshots = dex.vault.deposits.stream(limit=limit)
vault_withdrawal_stream_snapshots = dex.vault.withdrawals.stream(limit=limit)
vault_deposit_prepare = dex.vault.deposits.prepare({
    'owner': '0xowner',
    'assetSymbol': 'WQI',
    'amount': '10',
    'chainId': 0,
    'vaultContractRef': 'local-only-not-deployed',
})  # POST /v1/vault/deposits/prepare -> owner_wallet_vault_deposit_not_implemented while prepare-only
vault_withdrawal_prepare = dex.vault.withdrawals.prepare({
    'owner': '0xowner',
    'assetSymbol': 'WQUAI',
    'amount': '1',
    'chainId': 0,
    'vaultContractRef': 'local-only-not-deployed',
})  # POST /v1/vault/withdrawals/prepare -> owner_wallet_vault_withdrawal_not_implemented while prepare-only
listing_policy = dex.listings.policy.get()  # GET /v1/listings/policy
listing_review_flow = dex.listings.review_flow.get()  # GET /v1/listings/review-flow
listing_request_prepare = dex.listings.requests.prepare_submit({
    'baseSymbol': 'COMMUNITY',
    'quoteSymbol': 'WQUAI',
    'tokenModel': 'erc20-style-vault-token',
    'requestedMarketId': 'COMMUNITY-WQUAI',
    'pricePrecision': 8,
    'amountPrecision': 8,
    'minAmount': '1',
})  # POST /v1/listings/requests -> listing_request_not_implemented / not-implemented-approval-required while prepare-only
listing_review_queue = dex.listings.requests.list_local_review_queue()  # GET /v1/listings/requests
queued_listing_request = dex.listings.requests.enqueue_local_review({
    'baseSymbol': 'COMMUNITY',
    'quoteSymbol': 'WQI',
    'tokenModel': 'erc20-style-vault-token',
    'requestedMarketId': 'COMMUNITY-WQI',
    'pricePrecision': 8,
    'amountPrecision': 8,
    'minAmount': '1',
})  # POST /v1/listings/requests with requestMode: local_review_queue -> queued-local-review / pending-local-review
listing_review_decision = dex.listings.requests.decide_local_review('listing-request-000001', {
    'decision': 'reject',
    'reviewStage': 'token_safety_review',
    'decisionNotes': 'metadata-only local rejection',
    'rejectionReason': 'metadata-incomplete-local-only',
})  # POST /v1/listings/requests/{requestId}/decision with decisionMode: local_review_decision -> reviewed-local-metadata-only / rejected-local-metadata-only
relayer_gate = dex.relayer.settlement_mode_gate.get()  # GET /v1/relayer/settlement-mode-gate
nonce_cancel_prepare = dex.nonces.prepare_cancel({
    'action': 'cancelNonce',
    'owner': '0xowner',
    'nonce': '42',
    'chainId': 0,
    'nonceManagerContract': '0xnonce-manager',
    'expiresAt': 1780003600,
    'signature': '0xowner-signature',
})  # POST /v1/nonces/cancel -> owner_signed_nonce_cancel_not_implemented while prepare-only
delegate_key_prepare = dex.delegate_keys.prepare_register({
    'owner': '0xowner',
    'delegate': '0xdelegate',
    'allowedMarkets': ['QI-QUAI'],
    'maxNotional': '1000',
    'permissions': ['PLACE_ORDER', 'CANCEL_ORDER', 'CANCEL_ALL', 'NO_WITHDRAW', 'NO_ADMIN'],
    'expiresAt': 1780003600,
    'signature': '0xowner-signature',
})  # POST /v1/delegate-keys -> delegate_key_registration_not_implemented / prepare-only-owner-signed-required
delegate_key_revocation_prepare = dex.delegate_keys.prepare_revoke('bot-mm-1', {
    'owner': '0xowner',
    'signature': '0xowner-signature',
})  # DELETE /v1/delegate-keys/{keyId} -> delegate_key_revocation_not_implemented / owner-wallet-signature-required
delegate_key_registrations = dex.delegate_keys.list_registrations()  # GET /v1/delegate-keys/registrations -> delegatekeyregistry-event-projection / DelegateKeyRegisteredProjection
delegate_key_revocations = dex.delegate_keys.list_revocations()  # GET /v1/delegate-keys/revocations -> delegatekeyregistry-event-projection / DelegateKeyRevokedProjection
delegate_key_registration_stream = dex.delegate_keys.registrations.open_stream()  # /v1/ws?channel=delegate-key-registrations
delegate_key_registration_snapshot = delegate_key_registration_stream.next()
delegate_key_registration_stream.close()
delegate_key_revocation_stream = dex.delegate_keys.revocations.open_stream()  # /v1/ws?channel=delegate-key-revocations
delegate_key_revocation_snapshot = delegate_key_revocation_stream.next()
delegate_key_revocation_stream.close()
delegate_key_registration_stream_snapshots = dex.delegate_keys.registrations.stream(limit=limit)
delegate_key_revocation_stream_snapshots = dex.delegate_keys.revocations.stream(limit=limit)

limit_order: SignedOrder = dex.orders.create_limit_order(
    market_id='QI-QUAI',
    side='buy',
    amount='1000',
    price='0.123',
)

market_order: SignedOrder = dex.orders.create_market_ioc_order(
    market_id='QI-QUAI',
    side='sell',
    quote_amount='100',
    max_slippage_bps=50,
)

order_result: OrderSubmissionResult = dex.orders.submit_signed_order(limit_order)  # POST /v1/orders
fill_projection: IndexedFillProjection | None = (order_result.get('fills') or [None])[0]
if fill_projection is not None:
    assert fill_projection['projectionType'] == 'IndexedFillProjection'
for fill in dex.fills.stream():
    handle_fill(fill)
proof: TradeProof = dex.proofs.trade(trade_id)  # GET /v1/proofs/trades/:tradeId
dex.orders.cancel_all(market_id='QI-QUAI')
```

## Order semantics

- `create_limit_order` signs a replay-safe `SignedOrder` for normal limit flow.
- `create_market_ioc_order` creates a `market_ioc` IOC limit order, never an unbounded market order.
- Every `market_ioc` order carries signed price/slippage bounds through `max_slippage_bps`.
- `submit_signed_order` posts the exact signed payload to `POST /v1/orders`; the SDK must not mutate amount, price, nonce, owner, delegate, chain, or settlement contract fields after signing.
- `OrderSubmissionResult` is the API response shape: it contains order state plus zero or more `IndexedFillProjection` rows projected from confirmed/mock-confirmed settlement.
- OrderSubmissionResult fills are public IndexedFillProjection rows and each row must carry `projectionType: 'IndexedFillProjection'` plus `sourceEventId`.
- `submit_signed_order` must not expose the matcher/relayer `FillPacket` handoff object as its public return type.
- `orders.cancel_all(market_id=...)` calls `POST /v1/orders/cancel-all`; in local mock mode it cancels only matcher-open quantity, carries `CANCEL_ALL`, `CANCEL_ORDER`, `NO_WITHDRAW`, and `NO_ADMIN`, and does not cancel on-chain NonceManager nonces without a separate owner-signed flow.

## Contract registry

`contracts.get()` is a read-only contract-registry call to `GET /v1/contracts`. In local MVP mode it must preserve `local-only-not-deployed`, null contract addresses, `realQuaiTransactions: false`, `walletRequired: false`, and `NO_WITHDRAW`/`NO_ADMIN` delegate safety.

`fees.get()` is read-only FeeManager fee schedule metadata from `GET /v1/fees`. It returns `source: feemanager-policy-projection`, `projectionType: FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: None`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: False`, and `tradingVaultMutation: False`. This client has no wallet/RPC/signing/broadcast/deploy/tx/funds behavior, no fee-authority runtime keys, and no live FeeManager or TradingVault mutation authority.

`account.balances()` is a read-only mock vault projection from `GET /v1/account/balances`. It returns `source: mock-vault-projection`, `settlementMode: mock`, `permissions: [READ_ONLY, NO_WITHDRAW, NO_ADMIN]`, `realQuaiTransactions: false`, and `walletRequired: false`; it has no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.

`vault.deposits.list()` and `vault.withdrawals.list()` expose read-only TradingVault event history from `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals`. The envelopes return `source: tradingvault-event-projection`, `projectionType: TradingVaultDepositProjection` / `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: False`, `walletRequired: False`, `fundsMoved: False`, and `tradingVaultMutation: False` with mock-null tx/block/event/explorer evidence. These clients preserve no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and do not mutate TradingVault.

`vault.deposits.open_stream()` / `vault.withdrawals.open_stream()` and `vault.deposits.stream(limit=limit)` / `vault.withdrawals.stream(limit=limit)` consume private vault history snapshots from `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals`. Stream snapshots preserve `source: tradingvault-event-projection`, `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `fundsMoved: False`, and `tradingVaultMutation: False`; there is no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`vault.deposits.prepare()` and `vault.withdrawals.prepare()` expose the owner-wallet TradingVault prepare-only boundary through `POST /v1/vault/deposits/prepare` and `POST /v1/vault/withdrawals/prepare`. They intentionally return the API placeholder envelopes `owner_wallet_vault_deposit_not_implemented` / `owner_wallet_vault_withdrawal_not_implemented` with `source: owner-wallet-vault-operation-placeholder`, `custody: non-custodial-contract-vault`, `operationStatus: prepare-only-not-implemented`, `ownerAuthorization: owner-wallet-required`, `delegateAuthority: delegates-cannot-deposit-or-withdraw`, `NO_WITHDRAW`, `NO_ADMIN`, `fundsMoved: False`, and `tradingVaultMutation: False`. The clients treat HTTP 501 as a boundary response and preserve no wallet/RPC/sign/broadcast/deploy/tx/funds behavior.

The registry includes `listedAssetStatus`: `status: wrapped-token-listing`, `primaryQuoteAssets: [WQUAI, WQI]`, `supportedAssetModel: erc20-style-vault-token`, and `userListedTokens: True`. Listing policy metadata is already exposed through GET /v1/listings/policy; listing requests remain prepare-only through POST /v1/listings/requests; runtime listing submission or MarketRegistry admin mutation requires explicit Clonners approval; native Qi direct settlement is out of scope and the Qi-facing token surface is WQI. The status is read-only metadata and its safety notice must say the MVP settles listed vault tokens such as WQUAI, WQI, and approved community tokens with no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real native Qi settlement claim.

The Python SDK must not load wallets, send transactions, read RPC URLs, infer real contract addresses, or imply deploy authority from this metadata. Listed assets are ERC-20-style vault tokens; MarketRegistry/listing metadata cannot move balances or grant withdrawal/admin power.

## Listing policy

`listings.policy.get()` is a read-only listing-policy client for `GET /v1/listings/policy`. It returns `source: listed-asset-marketregistry-policy`, `status: design-only-local-metadata`, WQUAI/WQI primary quote assets, `community-created-erc20-style-token` metadata, and `MarketRegistry-enabled-pair-metadata` truth labels. The policy client must preserve `NO_WITHDRAW`/`NO_ADMIN` delegate safety, must not expose listing submission or listing-admin runtime helpers, and must say there is no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds. MarketRegistry metadata can enable/disable approved pairs only; it cannot move TradingVault balances or grant withdrawal/admin power.

## Listing review flow

`listings.review_flow.get()` is a read-only local review state-machine client for `GET /v1/listings/review-flow`. It returns `source: listed-asset-marketregistry-review-flow`, `status: design-only-local-metadata`, `phase: clonners-managed-local-review-before-dao`, local statuses such as `approved-local-metadata-only` / `rejected-local-metadata-only`, and `marketRegistryMutation: false`. It preserves `NO_WITHDRAW`/`NO_ADMIN`, has no wallets/RPC/signing/broadcast/deploy/tx/funds behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

## Listing request placeholder

`listings.requests.prepare_submit()` is a prepare-only client for `POST /v1/listings/requests`. It intentionally returns the API placeholder response `listing_request_not_implemented` with `requestStatus: not-implemented-approval-required`, `source: listed-asset-marketregistry-policy`, `status: design-only-local-metadata`, WQUAI/WQI quote framing, `community-created-erc20-style-token`, `NO_WITHDRAW`, and `NO_ADMIN`. The client must treat the intentional 501 as a boundary response, not a generic transport failure or proof of submission. It must not add listing-admin runtime behavior, real token addresses, wallets, RPC URLs, signing, broadcasts, deploys, transaction helpers, funds movement, or MarketRegistry mutation.

`listings.requests.list_local_review_queue()` and `listings.requests.enqueue_local_review()` expose the approved local listing review queue only. `list_local_review_queue()` calls `GET /v1/listings/requests`; `enqueue_local_review()` calls `POST /v1/listings/requests with requestMode: local_review_queue` and returns `local-in-memory-review-queue`, `in-memory-local-server-only`, `queued-local-review`, and `pending-local-review` metadata from `listed-asset-marketregistry-review-flow`. These clients preserve `NO_WITHDRAW`/`NO_ADMIN`, have no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`listings.requests.decide_local_review()` records immutable local review decision metadata for an existing in-memory queued request through `POST /v1/listings/requests/{requestId}/decision`. The client supplies `decisionMode: local_review_decision` and surfaces `reviewed-local-metadata-only`, `approved-local-metadata-only` / `rejected-local-metadata-only`, and `nextMutationGate: explicit Clonners approval required before MarketRegistry.addMarket`; it preserves `NO_WITHDRAW`/`NO_ADMIN`, has no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

## Relayer settlement-mode gate

`relayer.settlement_mode_gate.get()` is read-only relayer approval-gate metadata from `GET /v1/relayer/settlement-mode-gate`. It exposes `source: relayer-approval-gate`, `currentSettlementMode: mock`, and the blocked `quai_contract` result `real_quai_approval_gate_blocked` so Python bots/operators can inspect readiness without wallet loading, signing, broadcast, RPC URL access, or transaction submission.

## Owner-signed nonce cancellation

`nonces.prepare_cancel()` is a prepare-only client for `POST /v1/nonces/cancel`. It intentionally surfaces the API placeholder response `owner_signed_nonce_cancel_not_implemented` with `owner-signed-required`, `NO_WITHDRAW`, and `NO_ADMIN`; it performs no wallet loading, signing, broadcast, or relayer submission and must not be confused with matcher-local `orders.cancel_all`.

`delegate_keys.prepare_register()` and `delegate_keys.prepare_revoke()` expose prepare-only owner-signed delegate/API key boundaries through `POST /v1/delegate-keys` and `DELETE /v1/delegate-keys/{keyId}`. They intentionally surface `delegate_key_registration_not_implemented` / `delegate_key_revocation_not_implemented` with `source: delegate-key-owner-signed-prepare-boundary`, `operationStatus: prepare-only-owner-signed-required`, `ownerAuthorization: owner-wallet-signature-required`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: False`, and `delegateCanAdmin: False`; they have no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and no live DelegateKeyRegistry or TradingVault mutation.

`delegate_keys.list_registrations()` and `delegate_keys.list_revocations()` expose read-only DelegateKeyRegistry history envelopes through `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`. They return `source: delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection` / `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateKeyRegistryMutation: False`, `delegateCanWithdraw: False`, and `delegateCanAdmin: False`; they preserve no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and do not mutate a live DelegateKeyRegistry or TradingVault.

`delegate_keys.registrations.open_stream()` / `delegate_keys.revocations.open_stream()` and `delegate_keys.registrations.stream(limit=limit)` / `delegate_keys.revocations.stream(limit=limit)` consume private DelegateKeyRegistry history snapshots from `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations`. Stream snapshots preserve `source: delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateKeyRegistryMutation: False`, `delegateCanWithdraw: False`, and `delegateCanAdmin: False`; there is no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and no live DelegateKeyRegistry or TradingVault mutation.

## Delegate/API key safety

Delegate keys default to NO_WITHDRAW and NO_ADMIN.

A delegate key may include:

```text
allowed_markets
max_notional
expires_at
READ_ONLY
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
NO_WITHDRAW
NO_ADMIN
```

Delegate keys cannot withdraw funds. Withdrawals require the main wallet or a separate future high-trust flow outside this bot SDK contract. The SDK must not expose a delegate-key withdrawal helper.

## Proof contract

The SDK consumes `TradeProof` as read-only projection data:

- `FillPacket` is an internal matcher/relayer handoff object, not a public SDK/API order response.
- `IndexedFillProjection` rows are public only after confirmed settlement/indexer truth and must carry `sourceEventId`.
- `TradeProof` is final only when backed by confirmed settlement/indexer truth.
- In local mock mode, proof responses keep `settlementMode: mock`, include a mock reference, and must not claim a real Quai transaction or moved funds.
