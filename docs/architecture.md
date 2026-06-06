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
