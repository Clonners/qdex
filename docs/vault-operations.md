# TradingVault Deposit/Withdrawal Prepare Boundary

This document pins the first owner-wallet-only prepare boundary for moving value into or out of the future `TradingVault`. It is intentionally not a live transaction flow.

## API surface

```text
POST /v1/vault/deposits/prepare
POST /v1/vault/withdrawals/prepare
```

Both endpoints are an owner-wallet-only prepare-only boundary. They return HTTP `501` with `source: owner-wallet-vault-operation-placeholder` until an explicitly approved wallet/signing/broadcast design exists.

Required safety fields in the placeholder envelope:

```text
ownerAuthorization: owner-wallet-required
permissions: NO_WITHDRAW, NO_ADMIN
realQuaiTransactions: false
walletRequired: false
fundsMoved: false
tradingVaultMutation: false
```

## Custody rules

- Deposits and withdrawals are main-owner-wallet actions in the real system.
- Delegate/API keys cannot deposit or withdraw by default.
- Delegate/API keys keep `NO_WITHDRAW` and `NO_ADMIN` in every related response.
- The placeholder never creates a signature, transaction, relayer job, or vault mutation.
- No admin/operator withdrawal path is introduced by this surface.

## Explicit non-goals for this slice

This boundary performs no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds movement.

It also does not:

- read or store wallet material,
- load a relayer key,
- infer real token addresses,
- claim a real Quai transaction,
- mutate `TradingVault`,
- move user funds,
- grant delegate withdrawal/admin authority.

## Future approval gate

A later real Quai deposit/withdrawal flow needs explicit Clonners approval plus:

1. owner-wallet signing design,
2. TradingVault contract address evidence,
3. token/listing evidence from the listed-asset flow,
4. event-truth indexing for `Deposit` and `Withdraw`,
5. UI/API proof copy that separates prepare state from confirmed contract event truth.

Until then, the API is documentation/discovery only and stays `prepare-only-not-implemented`.

## Post-vault readiness

The post-vault owner-wallet readiness plan is pinned in `docs/plans/2026-06-08-post-vault-owner-wallet-readiness.md`. It maps the completed mock-vault balance stream, prepare-only API endpoints, SDK/Python/qdex clients, terminal UI panel, and local API/UI smoke to the explicit owner-wallet approval gate without adding wallet behavior.

## Read-only TradingVault event projections

The read-only TradingVault `Deposit`/`Withdraw` projection schema ratchet is now pinned in `services/indexer/schema.md` and `docs/api-openapi.yaml` before any owner-wallet transaction behavior exists.

Projection row names:

```text
TradingVaultDepositProjection
TradingVaultWithdrawalProjection
```

Required projection rules:

- event-truth rows only: `Deposit` creates `TradingVaultDepositProjection`; `Withdraw` creates `TradingVaultWithdrawalProjection`.
- mock rows keep settlementTx/blockNumber/blockHash/eventIndex/explorerUrl null and must remain visibly mock/local-only.
- real rows require settlementTx, blockNumber, blockHash, eventIndex, explorerUrl before any future confirmed deposit/withdrawal history display.
- every row carries `READ_ONLY`, `NO_WITHDRAW`, and `NO_ADMIN`.
- projection rows are read models only; they do not create wallet requests, submit transactions, mutate `TradingVault`, or move funds.

This projection schema preserves no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, TradingVault mutation, or funds movement.

## Read-only vault history API

The read-only vault history API now exposes event-shaped history envelopes without owner-wallet behavior:

```text
GET /v1/vault/deposits
GET /v1/vault/withdrawals
```

Every response is a local/source-only projection envelope backed by the projection schemas:

```text
source: tradingvault-event-projection
projectionType: TradingVaultDepositProjection | TradingVaultWithdrawalProjection
settlementMode: mock
settlementTx: null
blockNumber: null
blockHash: null
eventIndex: null
explorerUrl: null
permissions: READ_ONLY, NO_WITHDRAW, NO_ADMIN
realQuaiTransactions: false
walletRequired: false
fundsMoved: false
tradingVaultMutation: false
```

The history endpoints may return empty local/mock arrays until real event evidence exists. They are read-only projection/cache surfaces and preserve no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, TradingVault mutation, or funds movement.

Completed local/source-only client exposure: TypeScript/Python SDK `dex.vault.deposits.list()` / `dex.vault.withdrawals.list()` and CLI `qdex vault deposits` / `qdex vault withdrawals` now consume the same `tradingvault-event-projection` envelopes. Next local/source-only step: terminal UI read-only vault history panel, still backed by the same mock-null evidence envelope and still without wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
