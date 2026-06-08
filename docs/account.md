# Account Overview

`GET /v1/account` exposes a read-only local account overview for bots, operators, and the terminal UI before any wallet-backed account session is wired.

The route is intentionally projection/cache metadata. It performs no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, TradingVault mutation, or funds movement.

## Response shape

The current local envelope is:

```text
source: mock-account-overview
session.mode: mock-local-no-wallet-session
permissions: READ_ONLY, NO_WITHDRAW, NO_ADMIN
settlementMode: mock
realQuaiTransactions: false
walletRequired: false
fundsMoved: false
tradingVaultMutation: false
```

It combines existing local read-only surfaces:

- `balances`: the same `mock-vault-projection` returned by `GET /v1/account/balances`.
- `orders`: matcher-local open orders from `mock-order-projection`.
- `fills`: confirmed-only `IndexedFillProjection` rows from `in-memory-indexer-projection`.

## Safety boundary

`GET /v1/account` is an account overview, not an owner-wallet operation and not custody authority.

Required safety copy for every consumer:

```text
Mock account overview only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.
```

Delegate/API keys remain `NO_WITHDRAW` and `NO_ADMIN`; account overview visibility cannot grant withdrawal or admin power.

## Current and next slices

Read-only account overview API visibility is complete for the local API/OpenAPI/docs layer. The next bounded local/source-only slice is TypeScript/Python/qdex read-only account overview clients that call `GET /v1/account` and preserve the same safety envelope.

Still out of scope without explicit approval: wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, live owner-wallet sessions, real token addresses, `TradingVault` mutation, or funds movement.
