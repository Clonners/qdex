# System Architecture

## Baseline architecture

```text
┌────────────────────────────────────────────────────────────────┐
│ Humans / Agents / Market Makers                                │
│ - Terminal Web UI                                               │
│ - CLI                                                           │
│ - TypeScript/Python SDK                                         │
└──────────────────────────────┬─────────────────────────────────┘
                               │ REST / WebSocket
                               v
┌────────────────────────────────────────────────────────────────┐
│ API Gateway                                                     │
│ - auth challenge/session                                        │
│ - public market data                                            │
│ - private orders/balances/fills                                 │
│ - WebSocket streams                                             │
└───────────────┬─────────────────────────────┬──────────────────┘
                │                             │
                v                             v
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Matching Engine               │  │ Indexer / Proof Service       │
│ - price-time priority         │  │ - deposits/withdrawals        │
│ - open order state            │  │ - fills/events                │
│ - partial fills               │  │ - proof API                   │
│ - deterministic matching      │  │ - explorer links              │
└───────────────┬──────────────┘  └───────────────▲──────────────┘
                │ matched fills                   │ contract events
                v                                 │
┌──────────────────────────────┐                  │
│ Relayer                       │                  │
│ - validates fill packet       │                  │
│ - submits settlement tx       │                  │
│ - tracks confirmation         │                  │
└───────────────┬──────────────┘                  │
                │ tx                              │
                v                                 │
┌────────────────────────────────────────────────────────────────┐
│ Quai Smart Contracts                                            │
│ - TradingVault                                                  │
│ - Settlement                                                    │
│ - NonceManager                                                  │
│ - MarketRegistry                                                │
│ - FeeManager                                                    │
│ - DelegateKeyRegistry                                           │
└────────────────────────────────────────────────────────────────┘
```

## Source of truth by plane

- Funds: `TradingVault` contract state and emitted events.
- Order intent: signed EIP-712-like order payloads.
- Open orderbook: off-chain matching-engine state, periodically snapshot/commit later.
- Final fills: settlement contract events.
- UI/API balances: indexed cache derived from contract events.

## Non-custodial invariant

The operator may run matching, relaying, listing and indexing infrastructure, but must not have a code path that can withdraw user funds.

Withdrawals require the user's wallet or a separately approved high-trust path. Bot/delegate keys default to `NO_WITHDRAW`.

The first owner-wallet vault operation boundary is prepare-only: [`docs/vault-operations.md`](./vault-operations.md) documents `POST /v1/vault/deposits/prepare` and `POST /v1/vault/withdrawals/prepare`. Those routes are discovery/placeholders only; they keep `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`, and they do not load wallets, read RPC URLs, sign, broadcast, submit transactions, deploy, or move funds.

The post-vault owner-wallet readiness plan is pinned in `docs/plans/2026-06-08-post-vault-owner-wallet-readiness.md`. The read-only TradingVault `Deposit`/`Withdraw` projection schema is pinned in `services/indexer/schema.md`, `docs/api-openapi.yaml`, and `docs/vault-operations.md`; API/UI state must continue to distinguish prepare placeholders, mock projection rows with null tx/block/explorer evidence, and future confirmed contract event truth. The read-only vault history REST and private stream surfaces now expose `GET /v1/vault/deposits`, `GET /v1/vault/withdrawals`, `/v1/ws?channel=deposits`, and `/v1/ws?channel=withdrawals` with `source: tradingvault-event-projection`, `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `settlementMode: mock`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`; terminal UI binding surfaces consume those same projection/cache envelopes without wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

The post-delegate-key owner-signed readiness plan is pinned in `docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md` and the core delegate/API key boundary is documented in `docs/delegate-keys.md`. Current `GET /v1/delegate-keys`, `GET /v1/delegate-keys/registrations`, `GET /v1/delegate-keys/revocations`, `POST /v1/delegate-keys`, and `DELETE /v1/delegate-keys/{keyId}` surfaces stay read-only or prepare-only with `delegate-key-registry-projection`, `delegatekeyregistry-event-projection`, `delegate-key-owner-signed-prepare-boundary`, `owner-wallet-signature-required`, `NO_WITHDRAW`, and `NO_ADMIN`. The read-only DelegateKeyRegistry `DelegateKeyRegistered`/`DelegateKeyRevoked` projection schema is pinned in `services/indexer/schema.md`, `docs/api-openapi.yaml`, and `docs/delegate-keys.md`; future API/UI state must distinguish prepare placeholders, mock projection rows with null tx/block/explorer evidence, and confirmed registry event truth before any live registry mutation, wallet/RPC/signing/broadcast/deploy/tx/funds behavior, or positive withdrawal/admin delegate permission. Read-only DelegateKeyRegistry history API surfaces and the terminal UI read-only delegate-key history panel now expose `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations` with empty/mock rows as valid local state.

## Post-mock MVP readiness

The current mock loop is a local executable MVP, not real Quai settlement. Post-mock MVP readiness work must keep `settlementMode: mock`, null proof tx/block/explorer fields, and `local-only-not-deployed` contract metadata until approved contract evidence replaces the mock plane.

Matcher-local cancellation is not on-chain nonce cancellation. The former removes open matcher quantity for bots/UI; the latter needs a separate owner-signed NonceManager flow before any claim that signed order replay has been invalidated on-chain. Delegate/API keys remain `NO_WITHDRAW`/`NO_ADMIN` and cannot submit that owner flow by default.

See [`docs/plans/2026-06-06-post-mock-mvp-readiness-owner-signed-nonce-cancel.md`](./plans/2026-06-06-post-mock-mvp-readiness-owner-signed-nonce-cancel.md) for the approval-gated replacement map.

## Wrapped token listing boundary

QDEX MVP uses WQUAI, WQI, and listed community-created tokens as ERC-20-style vault assets. Native Qi direct settlement is out of scope for the current DEX plan; the Qi-facing market surface is WQI, not raw native Qi.

Market listing is a metadata/governance plane, not custody authority: `MarketRegistry` can enable or disable token pairs, but it must not move user balances or grant withdrawal/admin power. The token listing and MarketRegistry metadata flow is documented in [`docs/listing-policy.md`](./listing-policy.md). Existing safe listing surfaces: `GET /v1/listings/policy`, `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision`, and prepare-only fallback.

The current local authority slice is Clonners-managed and DAO-ready: `MarketRegistry.proposeMarketAuthority` nominates the future DAO/multisig, `acceptMarketAuthority` must be called by that proposed authority, and `MarketAuthorityHandoffProposed` / `MarketAuthorityHandoffAccepted` provide event truth. This handoff is metadata authority only, not custody.

Approval required: runtime listing submission beyond local queue/decision state or MarketRegistry admin mutation. The post-listing-policy MarketRegistry admin boundary is documented in [`docs/plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md`](./plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md), and no autonomous work past the current local authority/local queue/decision surfaces should add wallets, RPC URLs, signing, broadcasts, deploys, transaction helpers, real token addresses, listing-admin keys, `MarketRegistry` mutation, or funds movement.

See [`docs/plans/2026-06-07-native-qi-wrapper-adapter-boundary.md`](./plans/2026-06-07-native-qi-wrapper-adapter-boundary.md) for the corrected wrapped/listed-token boundary.
