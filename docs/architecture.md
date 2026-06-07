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

## Post-mock MVP readiness

The current mock loop is a local executable MVP, not real Quai settlement. Post-mock MVP readiness work must keep `settlementMode: mock`, null proof tx/block/explorer fields, and `local-only-not-deployed` contract metadata until approved contract evidence replaces the mock plane.

Matcher-local cancellation is not on-chain nonce cancellation. The former removes open matcher quantity for bots/UI; the latter needs a separate owner-signed NonceManager flow before any claim that signed order replay has been invalidated on-chain. Delegate/API keys remain `NO_WITHDRAW`/`NO_ADMIN` and cannot submit that owner flow by default.

See [`docs/plans/2026-06-06-post-mock-mvp-readiness-owner-signed-nonce-cancel.md`](./plans/2026-06-06-post-mock-mvp-readiness-owner-signed-nonce-cancel.md) for the approval-gated replacement map.

## Wrapped token listing boundary

QDEX MVP uses WQUAI, WQI, and listed community-created tokens as ERC-20-style vault assets. Native Qi direct settlement is out of scope for the current DEX plan; the Qi-facing market surface is WQI, not raw native Qi.

Market listing is a metadata/governance plane, not custody authority: `MarketRegistry` can enable or disable token pairs, but it must not move user balances or grant withdrawal/admin power. The active safe slice is the token listing and MarketRegistry metadata flow exposed as read-only local policy in [`docs/listing-policy.md`](./listing-policy.md) and `GET /v1/listings/policy`.

See [`docs/plans/2026-06-07-native-qi-wrapper-adapter-boundary.md`](./plans/2026-06-07-native-qi-wrapper-adapter-boundary.md) for the corrected wrapped/listed-token boundary.
