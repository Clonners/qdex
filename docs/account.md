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

Read-only account overview API visibility and bot/operator client exposure are complete for the local API/OpenAPI/docs/SDK/CLI layer. TypeScript SDK `account.get()`, Python SDK `account.get()`, and `qdex account` call `GET /v1/account` and preserve the same `mock-account-overview`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior safety envelope.

### Read-only open orders REST API envelope

`GET /v1/account/orders` exposes a read-only open orders projection for bots, operators, and the terminal UI. It returns `source: mock-order-projection`, `projectionType: LocalOrderProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `matcherLocalOnly: true`, `settlementMode: mock`, with mock-null on-chain evidence:

```text
settlementTx: null
blockNumber: null
blockHash: null
eventIndex: null
explorerUrl: null
realQuaiTransactions: false
walletRequired: false
fundsMoved: false
tradingVaultMutation: false
```

It performs no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, TradingVault mutation, or funds movement.

Terminal UI exposure complete: `web/terminal-ui/src/account-overview-panel.js` renders the same `GET /v1/account` envelope as a read-only account overview panel with `LocalAccountOverviewProjection`, `mock-local-no-wallet-session`, nested `mock-vault-projection` balances, matcher-local `mock-order-projection` open orders, confirmed-only `IndexedFillProjection` rows, and explicit no-wallet/no-funds/no-delegate-withdrawal-admin safety copy.

Local API + terminal UI account overview integration smoke complete: `web/terminal-ui/src/account-overview-binding.js` performs the local API + terminal UI account overview integration smoke by reading `GET /v1/account` from local `createApiServer()` smoke tests, validates `source: mock-account-overview`, `LocalAccountOverviewProjection`, `mock-local-no-wallet-session`, nested `mock-vault-projection` balances, matcher-local `mock-order-projection` open orders, confirmed-only `IndexedFillProjection` rows, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior before rendering the terminal account overview panel.

The next bounded local/source-only slice is another bounded local/source-only MVP surface that keeps wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, live owner-wallet sessions, real token addresses, `TradingVault` mutation, and funds movement out of scope unless explicitly approved.

Still out of scope without explicit approval: wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, live owner-wallet sessions, real token addresses, `TradingVault` mutation, or funds movement.
