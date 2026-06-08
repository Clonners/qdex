# Post-Vault Owner-Wallet Readiness Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Map the completed mock vault/balance and prepare-only deposit/withdrawal surfaces to the approval-gated owner-wallet path required before real TradingVault funds can move.

**Architecture:** The current API, SDK, CLI, and terminal UI stay local/source-only and display either `mock-vault-projection` balances or intentional owner-wallet prepare placeholders. Real value movement is deferred until explicit Clonners approval plus verified contract/listing/event-truth evidence; any future executable owner-wallet flow must be separated from delegate/API keys and from mock projections.

**Tech Stack:** Markdown plan/spec ratchets, Node `node:test` doc guards, existing TypeScript API/SDK/CLI/terminal UI, Python SDK docs, and local Solidity/Hardhat contract evidence only after approval.

---

## Current completed safe vault surfaces

The repo now has the local/source-only vault discovery plane wired across humans, bots, and the terminal UI:

- `GET /v1/account/balances`
- `/v1/ws?channel=balances`
- `POST /v1/vault/deposits/prepare`
- `POST /v1/vault/withdrawals/prepare`

```text
GET /v1/account/balances
/v1/ws?channel=balances
POST /v1/vault/deposits/prepare
POST /v1/vault/withdrawals/prepare
```

Current safe balance truth is still a mock projection:

```text
source: mock-vault-projection
settlementMode: mock
realQuaiTransactions: false
walletRequired: false
fundsMoved: false
```

Current prepare endpoints are intentional non-implemented owner-wallet boundaries. They return `owner-wallet-vault-operation-placeholder` with `prepare-only-not-implemented`, `owner-wallet-required`, and `delegates-cannot-deposit-or-withdraw` metadata:

```text
source: owner-wallet-vault-operation-placeholder
operationStatus: prepare-only-not-implemented
ownerAuthorization: owner-wallet-required
permissions: NO_WITHDRAW, NO_ADMIN
delegateAuthority: delegates-cannot-deposit-or-withdraw
tradingVaultMutation: false
```

Completed client/UI surfaces:

- TypeScript SDK `vault.deposits.prepare()` / `vault.withdrawals.prepare()`
- Python SDK `vault.deposits.prepare()` / `vault.withdrawals.prepare()`
- `qdex vault deposit --prepare` / `qdex vault withdraw --prepare`
- terminal UI prepare-only vault operation panel
- local API + terminal UI vault prepare smoke

These surfaces intentionally do not sign, submit, relay, deploy, or move value. They let bots and UI learn the future boundary without confusing placeholder state for a real Quai transaction.

## Owner-wallet approval gate

A real deposit/withdrawal implementation requires explicit Clonners approval required before owner-wallet signing, RPC URL access, broadcast, TradingVault mutation, transaction submission, or funds movement.

Minimum evidence before replacing the placeholder:

1. verified `TradingVault` contract address evidence,
2. listed asset token evidence from the WQUAI/WQI/community-token listing flow,
3. owner-wallet UX/signing design that does not expose key material to the operator,
4. `Deposit` and `Withdraw` event-truth indexing,
5. proof-service/UI copy that separates prepare state from confirmed contract event truth,
6. local contract tests proving caller-owned withdrawals remain available and admin/operator withdrawal selectors remain absent,
7. explicit review of how failed or rejected wallet requests are represented without mutating local balances.

No future implementation should mark a deposit or withdrawal as final from API-local state alone. Finality must come from contract event truth.

## Delegate/API key boundary

Delegate/API keys remain trading/automation keys, not owner-wallet keys. Every vault-related response must continue to carry `NO_WITHDRAW` and `NO_ADMIN`.

Required invariant for every vault operation surface:

```text
delegateAuthority: delegates-cannot-deposit-or-withdraw
permissions: NO_WITHDRAW, NO_ADMIN
```

A future owner-wallet deposit/withdrawal flow must require the main owner wallet or a separately approved high-trust path. It must not be reachable through normal delegate keys, market-maker API keys, or read-only streams.

## Disallowed autonomous work

Do not add any of the following without explicit approval:

```text
no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, real contract address claims, relayer jobs, TradingVault mutation, or funds movement
```

Also do not add:

- transaction helpers,
- signer/key configuration,
- environment-variable based wallet/RPC wiring,
- public server exposure,
- remote pushes,
- admin/operator withdrawal paths,
- balance changes based on optimistic local state.

## Completed local/source-only projection slice

Completed: read-only TradingVault `Deposit`/`Withdraw` projection schema ratchet before any owner-wallet transaction behavior.

That slice stayed source/docs/tests only and defined, without runtime chain access:

```text
TradingVaultDepositProjection
TradingVaultWithdrawalProjection
sourceEventId
eventName: Deposit | Withdraw
settlementMode: mock | quai_contract
mock rows with null settlementTx/block/explorer
real rows require settlementTx, blockNumber, blockHash, eventIndex, explorerUrl
permissions: READ_ONLY, NO_WITHDRAW, NO_ADMIN
```

The completed schema makes future deposit/withdrawal history event-shaped before any endpoint or terminal panel can imply real fund movement.

## Completed local/source-only history API slice

Completed: read-only vault deposit/withdrawal history API envelopes.

The API now exposes:

```text
GET /v1/vault/deposits
GET /v1/vault/withdrawals
```

Those responses are metadata/projection envelopes only: `source: tradingvault-event-projection`, `settlementMode: mock`, empty local arrays until event evidence exists, null `settlementTx`/`blockNumber`/`blockHash`/`eventIndex`/`explorerUrl`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`.

## Completed local/source-only vault history clients

Completed: read-only TypeScript/Python/qdex clients for vault deposit/withdrawal history.

The client surfaces now expose TypeScript/Python SDK `dex.vault.deposits.list()` / `dex.vault.withdrawals.list()` and CLI `qdex vault deposits` / `qdex vault withdrawals`. They consume the existing `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals` envelopes with `source: tradingvault-event-projection`, `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

## Completed local/source-only terminal UI vault history panel

Completed: terminal UI read-only vault history panel.

The terminal UI static fixture now renders read-only TradingVault deposit/withdrawal history from `tradingvault-event-projection` envelopes with `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, empty local/mock arrays as valid state, mock-null tx/block/event/explorer evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Next bounded local/source-only slice: local API + terminal UI vault history integration smoke, still backed by `GET /v1/vault/deposits`, `GET /v1/vault/withdrawals`, mock-null evidence, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

---

### Task 1: Add this post-vault readiness ratchet

**Objective:** Guard the approval boundary and prevent future autonomous runs from jumping from prepare-only UI to wallet behavior.

**Files:**
- Create: `tests/post-vault-owner-wallet-readiness.test.mjs`
- Create: `docs/plans/2026-06-08-post-vault-owner-wallet-readiness.md`
- Modify: `docs/vault-operations.md`
- Modify: `docs/contracts.md`
- Modify: `docs/architecture.md`
- Modify: `CAMPAIGN_STATUS.md`

**Step 1: Write failing test**

```js
assert.ok(plan.includes('explicit Clonners approval required before owner-wallet signing'));
assert.ok(vaultDoc.includes('read-only TradingVault `Deposit`/`Withdraw` projection schema ratchet'));
```

**Step 2: Run test to verify failure**

Run: `node --test tests/post-vault-owner-wallet-readiness.test.mjs`
Expected: FAIL because the plan and doc links do not exist yet.

**Step 3: Write minimal docs**

Add the plan and link it from the vault/core docs. Do not add API behavior, wallet code, RPC config, transaction helpers, or live token addresses.

**Step 4: Run test to verify pass**

Run: `node --test tests/post-vault-owner-wallet-readiness.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/post-vault-owner-wallet-readiness.test.mjs docs/plans/2026-06-08-post-vault-owner-wallet-readiness.md docs/vault-operations.md docs/contracts.md docs/architecture.md CAMPAIGN_STATUS.md
git commit -m "docs: pin post-vault owner-wallet readiness"
```

### Task 2: Future read-only deposit/withdrawal projection schema ratchet

**Objective:** Define event-shaped deposit/withdrawal projection rows without adding transaction behavior.

**Files:**
- Create or modify: `tests/vault-event-projection-schema.test.mjs`
- Modify: `services/indexer/schema.md`
- Modify: `docs/api-openapi.yaml`
- Modify: `docs/vault-operations.md`

**Step 1: Write failing test**

```js
assert.ok(schema.includes('TradingVaultDepositProjection'));
assert.ok(schema.includes('TradingVaultWithdrawalProjection'));
assert.ok(schema.includes('real rows require settlementTx, blockNumber, blockHash, eventIndex, explorerUrl'));
```

**Step 2: Run test to verify failure**

Run: `node --test tests/vault-event-projection-schema.test.mjs`
Expected: FAIL until the projection names and event-truth fields are documented.

**Step 3: Write minimal docs/specs**

Define read-only projection rows only. Keep mock rows explicit and require event truth for real Quai rows.

**Step 4: Run test to verify pass**

Run: `node --test tests/vault-event-projection-schema.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/vault-event-projection-schema.test.mjs services/indexer/schema.md docs/api-openapi.yaml docs/vault-operations.md CAMPAIGN_STATUS.md
git commit -m "docs: define vault event projection schema"
```
