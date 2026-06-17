# qdex CLI Bot Contract

`qdex` is the terminal-native control surface for humans, bots, and ops. It mirrors the SDK bot flow while making custody and mock-settlement boundaries visible in every command output.

## Core commands

```bash
qdex markets
qdex ticker WQUAI-WQI
qdex klines WQUAI-WQI --interval 1m
qdex book WQUAI-WQI
qdex contracts
qdex fees
qdex listings policy
qdex listings review-flow
qdex listings requests
qdex listings request --prepare --base-symbol COMMUNITY --quote-symbol WQUAI --token-model erc20-style-vault-token --market-id COMMUNITY-WQUAI --price-precision 8 --amount-precision 8 --min-amount 1
qdex listings request --local-review-queue --base-symbol COMMUNITY --quote-symbol WQI --token-model erc20-style-vault-token --market-id COMMUNITY-WQI --price-precision 8 --amount-precision 8 --min-amount 1
qdex listings request decision <request-id> --decision approve --review-stage clonners_local_approval --decision-notes "metadata-only local approval"
qdex relayer gate
qdex nonces cancel --prepare --owner 0xowner --nonce 42 --chain-id 0 --nonce-manager-contract 0xnonce-manager --expires-at 1780003600 --signature 0xowner-signature
qdex api registrations
qdex api revocations
qdex api create-key bot-mm-1 --prepare --owner 0xowner --delegate 0xdelegate --allowed-market WQUAI-WQI --max-notional 1000 --expires-at 1780003600 --permission PLACE_ORDER --signature 0xowner-signature
qdex api revoke-key bot-mm-1 --prepare --owner 0xowner --signature 0xowner-signature
qdex vault deposits
qdex vault withdrawals
qdex vault deposit --prepare --owner 0xowner --asset-symbol WQI --amount 10 --chain-id 0 --vault-contract-ref local-only-not-deployed
qdex vault withdraw --prepare --owner 0xowner --asset-symbol WQUAI --amount 1 --chain-id 0 --vault-contract-ref local-only-not-deployed
qdex account
qdex balance
qdex order buy WQUAI-WQI --amount 1000 --price 0.123
qdex order sell WQUAI-WQI --quote-amount 100 --market --slippage-bps 50
qdex cancel --all
qdex stream fills
qdex stream orders
qdex stream deposits
qdex stream withdrawals
qdex stream delegate-key-registrations
qdex stream delegate-key-revocations
qdex stream fees
qdex stream nonce-cancellations
qdex stream open-orders
qdex stream tickers
qdex stream depth WQUAI-WQI
qdex stream trades WQUAI-WQI
qdex stream klines WQUAI-WQI --interval 1m --limit N
qdex proof trade <trade-id>
qdex api create-key bot-mm-1 --scope trade --expires 7d
```

## Order semantics

- Limit commands create signed `SignedOrder` payloads and submit them to `POST /v1/orders`.
- CLI order responses contain order state plus IndexedFillProjection rows (`projectionType: IndexedFillProjection`), not matcher/relayer FillPacket handoffs.
- CLI market orders are market_ioc IOC limit orders with signed price/slippage bounds.
- `--slippage-bps` maps to signed slippage protection, not unlimited market execution.
- `stream fills --limit N` consumes local WebSocket snapshots from `/v1/ws?channel=fills` and keeps private stream permissions read-only: `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`.
- `stream orders --limit N` consumes local WebSocket snapshots from `/v1/ws?channel=orders` and surfaces live matcher-local order/cancel updates for bots without withdrawal/admin authority.
- `qdex stream deposits` and `qdex stream withdrawals` consume private TradingVault history snapshots from `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals`. They print `tradingvault-event-projection`, `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `fundsMoved: false`, and `tradingVaultMutation: false` with no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- Order cancellation stream events must preserve `matcher-local-cancel-only-on-chain-nonce-unchanged`, `CANCEL_ORDER`/`CANCEL_ALL`, `NO_WITHDRAW`, and `NO_ADMIN` wording so operators do not confuse off-chain removal with on-chain `NonceManager` mutation.
- Fills stream from confirmed/mock-confirmed projections; proofs use `GET /v1/proofs/trades/:tradeId`.
- `qdex cancel --all` calls `POST /v1/orders/cancel-all`; in local mock mode it cancels only matcher-open quantity, keeps `CANCEL_ALL`, `CANCEL_ORDER`, `NO_WITHDRAW`, and `NO_ADMIN` visible, and does not cancel on-chain NonceManager nonces without a separate owner-signed flow.
- `qdex nonces cancel --prepare` calls `POST /v1/nonces/cancel` and prints the prepare-only placeholder `owner_signed_nonce_cancel_not_implemented` with `owner-signed-required`, `NO_WITHDRAW`, and `NO_ADMIN`; it performs no wallet loading, signing, broadcast, or relayer submission and must not be confused with matcher-local order cancellation.
- `qdex api registrations` and `qdex api revocations` call `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`. They print read-only `source: delegatekeyregistry-event-projection` history envelopes with `DelegateKeyRegisteredProjection` / `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateKeyRegistryMutation: false`, `delegateCanWithdraw: false`, and `delegateCanAdmin: false`; the commands preserve no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and do not mutate a live DelegateKeyRegistry or TradingVault.
- `qdex stream delegate-key-registrations` and `qdex stream delegate-key-revocations` consume private DelegateKeyRegistry history snapshots from `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations`. They print `delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, and `delegateKeyRegistryMutation: false` with no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- `qdex stream fees` consumes public FeeManager fee schedule snapshots from `/v1/ws?channel=fees`. It prints `fee_schedule_projection`, `public-read-only-no-custody`, `feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, and `tradingVaultMutation: false` with no wallet/RPC/signing/broadcast/deploy/tx/funds behavior, no fee-authority runtime keys, and no live FeeManager or TradingVault mutation authority.
- `qdex stream nonce-cancellations` consumes private NonceManager cancellation history snapshots from `/v1/ws?channel=nonce-cancellations`. It prints `nonce_cancellation_projection`, `non-custodial-no-withdrawal-authority`, `nonce-manager-event-projection`, `NonceCancelledProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `nonceManagerMutation: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- `qdex stream open-orders` consumes private open orders snapshots from `/v1/ws?channel=open-orders`. It prints `open_orders_projection`, `non-custodial-no-withdrawal-authority`, `mock-order-projection`, `LocalOrderProjection`, `matcherLocalOnly: true`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- `qdex stream tickers` consumes public ticker snapshots from `/v1/ws?channel=global.tickers` and prints `ticker_snapshot`, `public-read-only-no-custody`, and `mock-market-data` with no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- `qdex stream depth WQUAI-WQI` consumes public market depth snapshots from `/v1/ws?channel=market.<MARKET>.depth` and prints `orderbook_depth`, `public-read-only-no-custody`, and `mock-orderbook` with no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- `qdex klines WQUAI-WQI --interval 1m` calls `/v1/klines/<MARKET>?interval=1m`, and `qdex stream klines WQUAI-WQI --interval 1m --limit N` consumes public candle snapshots from `/v1/ws?channel=market.<MARKET>.klines.1m`. They print `kline_snapshot`, `public-read-only-no-custody`, and `mock-candle-projection` with no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- `qdex stream trades WQUAI-WQI` consumes public trade projection snapshots from `/v1/ws?channel=market.<MARKET>.trades` and prints `trade_projection`, `public-read-only-no-custody`, `in-memory-indexer-projection`, and `confirmed-settlement-only` semantics with no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- `qdex api create-key bot-mm-1 --prepare` and `qdex api revoke-key bot-mm-1 --prepare` call `POST /v1/delegate-keys` and `DELETE /v1/delegate-keys/{keyId}`. They print prepare-only owner-signed delegate/API key placeholders (`delegate_key_registration_not_implemented` / `delegate_key_revocation_not_implemented`) with `source: delegate-key-owner-signed-prepare-boundary`, `operationStatus: prepare-only-owner-signed-required`, `ownerAuthorization: owner-wallet-signature-required`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, and `delegateCanAdmin: false`; the commands preserve no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and do not mutate a live DelegateKeyRegistry or TradingVault.
- `qdex account` calls `GET /v1/account` and prints the read-only `mock-account-overview` envelope with `mock-local-no-wallet-session`, nested `mock-vault-projection` balances, matcher-local `mock-order-projection` open orders, confirmed-only `IndexedFillProjection` rows, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`; it has no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and cannot grant delegate withdrawal/admin authority.
- `qdex account-orders` calls `GET /v1/account/orders` and prints the read-only `mock-order-projection` envelope with `projectionType: LocalOrderProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `matcherLocalOnly: true`, `settlementMode: mock`, mock-null `settlementTx`/`blockNumber`/`blockHash`/`eventIndex`/`explorerUrl`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`; it has no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and cannot grant delegate withdrawal/admin authority.
- `qdex balance` calls `GET /v1/account/balances` and prints the read-only `mock-vault-projection` envelope with `settlementMode: mock`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, and `walletRequired: false`; it has no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.
- `qdex vault deposits` and `qdex vault withdrawals` call `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals` and print read-only `source: tradingvault-event-projection` history envelopes. They expose `TradingVaultDepositProjection` / `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false` with mock-null event evidence and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- `qdex vault deposit --prepare` and `qdex vault withdraw --prepare` call `POST /v1/vault/deposits/prepare` and `POST /v1/vault/withdrawals/prepare`. They print the prepare-only owner-wallet placeholder envelopes `owner_wallet_vault_deposit_not_implemented` / `owner_wallet_vault_withdrawal_not_implemented` with `source: owner-wallet-vault-operation-placeholder`, `custody: non-custodial-contract-vault`, `operationStatus: prepare-only-not-implemented`, `ownerAuthorization: owner-wallet-required`, `delegateAuthority: delegates-cannot-deposit-or-withdraw`, `NO_WITHDRAW`, `NO_ADMIN`, `fundsMoved: false`, and `tradingVaultMutation: false`; the commands preserve no wallet/RPC/sign/broadcast/deploy/tx/funds behavior.
- `qdex contracts` calls `GET /v1/contracts` and prints `local-only-not-deployed` metadata with null addresses, `realQuaiTransactions: false`, `walletRequired: false`, and no wallet/deploy/transaction authority. It also prints `listedAssetStatus` with `status: wrapped-token-listing`, primary quote assets `WQUAI` and `WQI`, `supportedAssetModel: erc20-style-vault-token`, user-listed token support, plus `NO_WITHDRAW`/`NO_ADMIN` safety. Listing policy metadata is already exposed through GET /v1/listings/policy; listing requests remain prepare-only through POST /v1/listings/requests; runtime listing submission or MarketRegistry admin mutation requires explicit Clonners approval. The command output must not imply real native Qi direct settlement, wallet loading, RPC URL reads, signing, broadcast, transaction submission, deploy, or real contract addresses.
- `qdex fees` calls `GET /v1/fees` and prints read-only FeeManager fee schedule metadata. The output carries `source: feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, and `tradingVaultMutation: false`; it preserves no wallet/RPC/signing/broadcast/deploy/tx/funds behavior, no fee-authority runtime keys, and no live FeeManager or TradingVault mutation authority.
- `qdex listings policy` calls `GET /v1/listings/policy` and prints `source: listed-asset-marketregistry-policy`, `status: design-only-local-metadata`, WQUAI/WQI primary quote assets, `community-created-erc20-style-token` metadata, and `MarketRegistry-enabled-pair-metadata` truth labels. It is read-only local metadata only: `NO_WITHDRAW`/`NO_ADMIN`, no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds. It must not submit listings, load listing-admin keys, claim real token addresses, or imply MarketRegistry metadata can move balances or grant withdrawal/admin power.
- `qdex listings review-flow` calls `GET /v1/listings/review-flow` and prints read-only `listed-asset-marketregistry-review-flow`, `design-only-local-metadata`, `clonners-managed-local-review-before-dao`, and local statuses such as `approved-local-metadata-only` / `rejected-local-metadata-only`. It preserves `NO_WITHDRAW`/`NO_ADMIN`, has no wallets/RPC/signing/broadcast/deploy/tx/funds behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.
- `qdex listings request --prepare` calls `POST /v1/listings/requests` and prints the prepare-only 501 placeholder body (`listing_request_not_implemented`, `not-implemented-approval-required`, `listed-asset-marketregistry-policy`, `design-only-local-metadata`) for WQUAI/WQI `community-created-erc20-style-token` metadata. It treats the intentional 501 as a boundary response, not a generic transport failure and not proof of submission: `NO_WITHDRAW`/`NO_ADMIN`, no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and does not prove a listing request was submitted on-chain.
- `qdex listings requests` calls `GET /v1/listings/requests`, and `qdex listings request --local-review-queue` calls `POST /v1/listings/requests with requestMode: local_review_queue`. These local queue commands print `listed-asset-marketregistry-review-flow`, `local-in-memory-review-queue`, `in-memory-local-server-only`, `queued-local-review`, and `pending-local-review` metadata only. They preserve `NO_WITHDRAW`/`NO_ADMIN`, have no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.
- `qdex listings request decision <request-id>` calls `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision` and records immutable local review metadata only. It prints `reviewed-local-metadata-only`, `approved-local-metadata-only` / `rejected-local-metadata-only`, and `explicit Clonners approval required before MarketRegistry.addMarket`, while preserving `NO_WITHDRAW`/`NO_ADMIN`, no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.
- `qdex relayer gate` calls `GET /v1/relayer/settlement-mode-gate` and prints read-only `relayer-approval-gate` metadata for `currentSettlementMode: mock` plus the blocked `quai_contract` reason `real_quai_approval_gate_blocked`; it performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.

## API/delegate key scopes

Supported bot-safe permissions:

```text
READ_ONLY
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
NO_WITHDRAW
NO_ADMIN
```

`qdex api create-key bot-mm-1 --scope trade --expires 7d` creates a trade-scoped delegate/API key. It can place and cancel orders within its configured market/notional/expiry policy, but no withdraw command is available for delegate/API keys.

Withdrawal remains a main-wallet action only. Future withdrawal support must be a separate explicit user-wallet flow and must never be silently granted to bot API keys.

## Proof and mock safety

`qdex proof trade <trade-id>` must show whether the proof is mock or real.

In local mock mode:

```text
settlementMode: mock
mockSettlementReference: <mock id>
settlementTx: null
explorerUrl: null
```

The CLI must say there is no real Quai transaction and no funds moved. Once real Quai settlement is enabled later, proof output must come from confirmed indexer/contract-event truth, not matcher memory.
