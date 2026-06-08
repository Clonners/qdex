# qdex CLI

Terminal client for humans, bots and ops.

Implemented smoke/read-only stubs:

```bash
qdex --base-url http://127.0.0.1:8787 markets
qdex --base-url http://127.0.0.1:8787 book QI-QUAI
qdex --base-url http://127.0.0.1:8787 balance
qdex --base-url http://127.0.0.1:8787 contracts
qdex --base-url http://127.0.0.1:8787 listings policy
qdex --base-url http://127.0.0.1:8787 listings review-flow
qdex --base-url http://127.0.0.1:8787 listings requests
qdex --base-url http://127.0.0.1:8787 listings request --prepare --base-symbol COMMUNITY --quote-symbol WQUAI --token-model erc20-style-vault-token --market-id COMMUNITY-WQUAI --price-precision 8 --amount-precision 8 --min-amount 1
qdex --base-url http://127.0.0.1:8787 listings request --local-review-queue --base-symbol COMMUNITY --quote-symbol WQI --token-model erc20-style-vault-token --market-id COMMUNITY-WQI --price-precision 8 --amount-precision 8 --min-amount 1
qdex --base-url http://127.0.0.1:8787 listings request decision <request-id> --decision approve --review-stage clonners_local_approval --decision-notes "metadata-only local approval"
qdex --base-url http://127.0.0.1:8787 relayer gate
qdex --base-url http://127.0.0.1:8787 nonces cancel --prepare --owner 0xowner --nonce 42 --chain-id 0 --nonce-manager-contract 0xnonce-manager --expires-at 1780003600 --signature 0xowner-signature
qdex --base-url http://127.0.0.1:8787 vault deposit --prepare --owner 0xowner --asset-symbol WQI --amount 10 --chain-id 0 --vault-contract-ref local-only-not-deployed
qdex --base-url http://127.0.0.1:8787 vault withdraw --prepare --owner 0xowner --asset-symbol WQUAI --amount 1 --chain-id 0 --vault-contract-ref local-only-not-deployed
qdex --base-url http://127.0.0.1:8787 stream fills --limit 1
qdex --base-url http://127.0.0.1:8787 stream orders --limit 1
qdex --base-url http://127.0.0.1:8787 smoke
```

`qdex contracts` prints the `GET /v1/contracts` registry as local-only metadata: `local-only-not-deployed`, null addresses, no real Quai tx, no wallet required, and no deploy authority. It includes read-only `listedAssetStatus` metadata: `wrapped-token-listing`, primary quote assets `WQUAI` and `WQI`, user-listed token support, and the safety notice that the MVP settles listed vault tokens such as WQUAI, WQI, and approved community tokens with no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real native Qi settlement claim. Listing policy metadata is already exposed through GET /v1/listings/policy; listing requests remain prepare-only through POST /v1/listings/requests; runtime listing submission or MarketRegistry admin mutation requires explicit Clonners approval.

`qdex balance` prints `GET /v1/account/balances` as read-only `mock-vault-projection` metadata: `settlementMode: mock`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, no real Quai tx, no wallet required, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.

`qdex vault deposit --prepare` and `qdex vault withdraw --prepare` call `POST /v1/vault/deposits/prepare` and `POST /v1/vault/withdrawals/prepare` and print the intentional 501 owner-wallet placeholders (`owner_wallet_vault_deposit_not_implemented` / `owner_wallet_vault_withdrawal_not_implemented`). The output preserves `source: owner-wallet-vault-operation-placeholder`, `custody: non-custodial-contract-vault`, `operationStatus: prepare-only-not-implemented`, `ownerAuthorization: owner-wallet-required`, `delegateAuthority: delegates-cannot-deposit-or-withdraw`, `NO_WITHDRAW`, `NO_ADMIN`, `fundsMoved: false`, and `tradingVaultMutation: false`; the commands treat the placeholder as a boundary response with no wallet/RPC/sign/broadcast/deploy/tx/funds behavior.

`qdex listings policy` prints `GET /v1/listings/policy` read-only `listed-asset-marketregistry-policy` / `design-only-local-metadata` for WQUAI, WQI, and `community-created-erc20-style-token` assets. It exposes `MarketRegistry-enabled-pair-metadata`, `NO_WITHDRAW`, and `NO_ADMIN` safety only; there is no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds, and the metadata cannot move TradingVault balances or grant withdrawal/admin power.

`qdex listings review-flow` prints `GET /v1/listings/review-flow` read-only `listed-asset-marketregistry-review-flow` / `design-only-local-metadata` for `phase: clonners-managed-local-review-before-dao`. It exposes local-only review statuses like `approved-local-metadata-only` and `rejected-local-metadata-only`, keeps `NO_WITHDRAW` and `NO_ADMIN`, has no wallets/RPC/signing/broadcast/deploy/tx/funds behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`qdex listings request --prepare` calls `POST /v1/listings/requests` and prints the prepare-only 501 placeholder body (`listing_request_not_implemented`, `not-implemented-approval-required`, `listed-asset-marketregistry-policy`, `design-only-local-metadata`) for WQUAI/WQI `community-created-erc20-style-token` metadata. It treats the intentional 501 as a boundary response, not a generic transport failure and not proof of submission: it preserves `NO_WITHDRAW`/`NO_ADMIN`, no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and does not prove a listing request was submitted on-chain.

`qdex listings requests` calls `GET /v1/listings/requests`, and `qdex listings request --local-review-queue` calls `POST /v1/listings/requests with requestMode: local_review_queue`. The local queue output carries `listed-asset-marketregistry-review-flow`, `local-in-memory-review-queue`, `in-memory-local-server-only`, `queued-local-review`, and `pending-local-review` metadata only. It preserves `NO_WITHDRAW`/`NO_ADMIN`, has no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`qdex listings request decision <request-id>` calls `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision` and records immutable local review metadata only. The output carries `reviewed-local-metadata-only`, `approved-local-metadata-only` / `rejected-local-metadata-only`, `explicit Clonners approval required before MarketRegistry.addMarket`, `NO_WITHDRAW`, and `NO_ADMIN`; it has no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`qdex relayer gate` prints `GET /v1/relayer/settlement-mode-gate` read-only `relayer-approval-gate` metadata for `currentSettlementMode: mock` plus `real_quai_approval_gate_blocked` for `quai_contract`; it performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.

`qdex nonces cancel --prepare` calls `POST /v1/nonces/cancel` and prints the prepare-only 501 placeholder (`owner_signed_nonce_cancel_not_implemented`, `owner-signed-required`, `NO_WITHDRAW`, `NO_ADMIN`) with no wallet loading, signing, broadcast, or relayer submission.

`qdex stream fills` consumes `/v1/ws?channel=fills` and prints bounded WebSocket snapshot messages. Private stream output is read-only and preserves `READ_ONLY`, `NO_WITHDRAW`, and `NO_ADMIN` permission metadata.

`qdex stream orders` consumes `/v1/ws?channel=orders` for bounded order/cancel monitors. Matcher-local cancellation stream events keep `matcher-local-cancel-only-on-chain-nonce-unchanged` wording visible and never imply withdrawal/admin authority.

`qdex smoke` submits two deterministic mock signed orders, verifies the indexed fill/proof loop, and prints explicit public fill projection fields (`projectionType: IndexedFillProjection`, `sourceEventId`) plus mock-settlement safety fields (`settlementMode: mock`, `settlementTx: null`, `explorerUrl: null`, no real Quai tx/no funds moved). The fill rows are not matcher/relayer FillPacket handoffs. Delegate/API-key safety remains `NO_WITHDRAW`/`NO_ADMIN` by default.
