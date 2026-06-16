# Post-Nonce-Cancel Owner-Signed Readiness Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Map the completed prepare-only nonce cancellation surfaces to the owner-signed approval gate required before any live NonceManager mutation.

**Architecture:** The current API, SDK, CLI, and terminal UI stay local/source-only and display either intentional owner-signed prepare placeholders or read-only metadata. Real NonceManager nonce cancellation is deferred until explicit Clonners approval plus verified contract/event-truth evidence; any future executable owner-signed nonce-cancel flow must stay separate from delegate/API keys, from matcher-local cancellation, and from withdrawal/admin authority.

**Tech Stack:** Markdown plan/spec ratchets, Node `node:test` doc guards, existing TypeScript API/SDK/CLI/terminal UI, Python SDK docs, and local Solidity/Hardhat NonceManager evidence only after approval.

---

## Current completed safe nonce-cancel surfaces

The repo now has the local/source-only nonce cancellation discovery and prepare plane wired across humans, bots, and the terminal UI:

- `POST /v1/nonces/cancel`

```text
POST /v1/nonces/cancel
```

Current nonce-cancel truth is still a prepare-only owner-signed boundary:

```text
source: owner-signed-nonce-cancel-placeholder
custody: non-custodial
nonceManager: owner-signed-required
permissions: NO_WITHDRAW, NO_ADMIN
realQuaiTransactions: false
walletRequired: false
fundsMoved: false
tradingVaultMutation: false
nonceManagerMutation: false
approvalGate: explicit-approval-required-before-wallet-signing-or-quai-broadcast
```

Current prepare endpoint is an intentional non-implemented owner-signed boundary. It returns `owner_signed_nonce_cancel_not_implemented` with `owner-signed-required`, `NO_WITHDRAW`, `NO_ADMIN`, and explicit wording that matcher-local cancellation does not mutate on-chain NonceManager nonces:

```text
source: owner-signed-nonce-cancel-placeholder
error: owner_signed_nonce_cancel_not_implemented
ownerAuthorization: owner-signed-required
nonceManager: owner-signed-required
permissions: NO_WITHDRAW, NO_ADMIN
realQuaiTransactions: false
walletRequired: false
fundsMoved: false
tradingVaultMutation: false
nonceManagerMutation: false
approvalGate: explicit-approval-required-before-wallet-signing-or-quai-broadcast
```

Completed client/UI surfaces:

- TypeScript SDK nonce-cancel prepare-only client
- Python SDK nonce-cancel prepare-only client
- `qdex nonces cancel --prepare`
- terminal UI prepare-only nonce cancel trigger (`nonce-cancel-prepare-trigger.js`)
- terminal UI prepare-only nonce cancel panel (`nonce-cancel-prepare-panel.js`)
- local API + terminal UI nonce cancel prepare smoke (`nonce-cancel-prepare-binding.js`, `local-api-nonce-cancel-prepare-smoke.test.mjs`)

These surfaces intentionally do not sign, submit, relay, deploy, mutate NonceManager, or move value. They let bots and UI learn the future owner-signed boundary without confusing placeholder state for real Quai nonce cancellation event truth.

## Owner-signed approval gate

A real nonce cancellation implementation requires explicit Clonners approval required before owner-wallet signing, RPC URL access, broadcast, live NonceManager mutation, transaction submission, or funds movement.

Minimum evidence before replacing the placeholder:

1. verified `NonceManager` contract address evidence,
2. verified source/interface evidence for `NonceCancelled` and `NonceRangeCancelled`,
3. owner-wallet UX/signing design that does not expose key material to operators, bots, or local config,
4. `NonceCancelled` and `NonceRangeCancelled` event-truth indexing,
5. proof-service/UI copy that separates prepare state from confirmed NonceManager event truth,
6. local contract tests proving nonce cancellation does not imply withdrawal or admin authority,
7. local contract tests proving delegate/API keys cannot submit nonce cancellation,
8. explicit review of how rejected or expired owner-signed nonce-cancel requests are represented without mutating local order state.

No future implementation should mark a nonce as cancelled from API-local state alone. Confirmed state must come from contract event truth.

## Matcher-local vs owner-signed boundary

Matcher-local cancellation (`CANCEL_ORDER`, `CANCEL_ALL`) removes only open matcher quantity for UI/bot order management. It does not invalidate on-chain nonces.

Owner-signed nonce cancellation targets the contract `NonceManager` surface directly:

```solidity
cancelNonce(uint256 nonce)
cancelNonceRange(uint256 from, uint256 to)
```

Delegate/API keys cannot submit the owner-signed nonce-cancel flow by default. `CANCEL_ORDER` and `CANCEL_ALL` remain matcher-local permissions only.

Required invariant for every nonce-cancel surface:

```text
permissions: NO_WITHDRAW, NO_ADMIN
nonceManagerMutation: false
approvalGate: explicit-approval-required-before-wallet-signing-or-quai-broadcast
```

There is intentionally no positive `WITHDRAW` or `ADMIN` permission in the nonce-cancel interface, and no delegate nonce-cancel permission in the MVP.

## Disallowed autonomous work

Do not add any of the following without explicit approval:

```text
no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, real contract address claims, live NonceManager mutation, TradingVault mutation, or funds movement
```

Also do not add:

- transaction helpers,
- signer/key configuration,
- environment-variable based wallet/RPC wiring,
- public server exposure,
- remote pushes,
- delegate nonce-cancel permissions,
- optimistic local NonceManager changes that claim confirmed event truth.

## Completed terminal UI nonce cancel prepare render panel

Completed: terminal UI nonce cancel prepare render panel added `nonce-cancel-prepare-panel.js` with `createMockNonceCancelPrepareFixture()`, `normalizeNonceCancelPreparePanelFixture()`, mock fixture integration into `mockVerticalSliceFixture.nonceCancelPrepare`, package syntax check registration, and ratchet updates; preserves `owner-signed-nonce-cancel-placeholder`, `owner-signed-required`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, `nonceManagerMutation: false`, `approvalGate: explicit-approval-required-before-wallet-signing-or-quai-broadcast`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

## Completed terminal UI nonce cancel prepare trigger

Completed: terminal UI nonce cancel prepare trigger added `nonce-cancel-prepare-trigger.js` with `bindNonceCancelPrepareTrigger()` — browser click binding for both `cancelNonce` and `cancelNonceRange` operations, intentional HTTP `501` owner-signed boundary validation, safety envelope normalization, status updates, and error handling; preserves `owner-signed-nonce-cancel-placeholder`, `owner-signed-required`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, `nonceManagerMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

## Completed local API + terminal UI nonce cancel prepare smoke

Completed: local API + terminal UI nonce cancel prepare render smoke added `nonce-cancel-prepare-binding.js` and `local-api-nonce-cancel-prepare-smoke.test.mjs`; it starts local `createApiServer()`, clicks cancel and cancel-range buttons, validates intentional HTTP `501` owner-signed nonce cancel boundary envelopes, and renders only no-wallet/no-RPC/no-signing/no-broadcast/no-deploy/no-tx/no-funds metadata.

Next bounded local/source-only slice: another bounded MVP surface; live `NonceManager` mutation remains approval-gated with no wallet/RPC/signing/broadcast/deploy/tx/funds behavior approved.

## Completed read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` projection schema ratchet

Completed: read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` projection schema ratchet added `NonceCancelledProjection` and `NonceRangeCancelledProjection` to `services/indexer/schema.md`, `docs/api-openapi.yaml`, `docs/contracts.md`, `docs/architecture.md`, and test ratchet; preserves `nonce-manager-event-projection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, null mock tx/block/explorer evidence, real event evidence required before confirmed nonce cancellation display, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMovedByProjection: false`, `nonceManagerMutationByProjection: false`, `tradingVaultMutationByProjection: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

## Completed read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` history API envelopes

Completed: read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` history API envelopes added `GET /v1/nonces/cancellations` route, `NonceCancellationHistoryResponse` schema in OpenAPI, `docs/nonce-operations.md`, and `tests/nonce-cancellations-history-api.test.mjs`; preserves `nonce-manager-event-projection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, null mock tx/block/explorer evidence, real event evidence required before confirmed nonce cancellation display, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `nonceManagerMutation: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

---

### Task 1: Add this post-nonce-cancel readiness ratchet

**Objective:** Guard the approval boundary and prevent future autonomous runs from jumping from prepare-only nonce-cancel UI to wallet or live NonceManager mutation behavior.

**Files:**
- Create: `tests/post-nonce-cancel-owner-signed-readiness.test.mjs`
- Create: `docs/plans/2026-06-08-post-nonce-cancel-owner-signed-readiness.md`
- Modify: `docs/contracts.md`
- Modify: `docs/architecture.md`
- Modify: `CAMPAIGN_STATUS.md`

**Step 1: Write failing test**

```js
assert.ok(plan.includes('explicit Clonners approval required before owner-wallet signing'));
assert.ok(contracts.includes('read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` projection'));
```

**Step 2: Run test to verify failure**

Run: `node --test tests/post-nonce-cancel-owner-signed-readiness.test.mjs`
Expected: FAIL because the plan and doc links do not exist yet.

**Step 3: Write minimal docs**

Add the plan and link it from the nonce-cancel/core docs. Do not add API behavior, wallet code, RPC config, transaction helpers, live NonceManager mutation, or live token/contract addresses.

**Step 4: Run test to verify pass**

Run: `node --test tests/post-nonce-cancel-owner-signed-readiness.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/post-nonce-cancel-owner-signed-readiness.test.mjs docs/plans/2026-06-08-post-nonce-cancel-owner-signed-readiness.md docs/contracts.md docs/architecture.md CAMPAIGN_STATUS.md
git commit -m "docs: pin post-nonce-cancel owner-signed readiness"
```
