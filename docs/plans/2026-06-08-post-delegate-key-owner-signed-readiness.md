# Post-Delegate-Key Owner-Signed Readiness Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Map the completed read-only and prepare-only delegate/API key surfaces to the owner-signed approval gate required before any live DelegateKeyRegistry mutation.

**Architecture:** The current API, SDK, CLI, and terminal UI stay local/source-only and display either `delegate-key-registry-projection` metadata or intentional owner-signed prepare placeholders. Real registry changes are deferred until explicit Clonners approval plus verified contract/listing/event-truth evidence; any future executable owner-signed delegate-key flow must stay separate from withdrawal/admin authority and from local prepare state.

**Tech Stack:** Markdown plan/spec ratchets, Node `node:test` doc guards, existing TypeScript API/SDK/CLI/terminal UI, Python SDK docs, and local Solidity/Hardhat DelegateKeyRegistry evidence only after approval.

---

## Current completed safe delegate/API key surfaces

The repo now has the local/source-only delegate/API key discovery and prepare plane wired across humans, bots, and the terminal UI:

- `GET /v1/delegate-keys`
- `POST /v1/delegate-keys`
- `DELETE /v1/delegate-keys/{keyId}`

```text
GET /v1/delegate-keys
POST /v1/delegate-keys
DELETE /v1/delegate-keys/{keyId}
```

Current read-only delegate truth is still local metadata:

```text
source: delegate-key-registry-projection
custody: non-custodial-no-withdrawal-authority
defaultPermissions: READ_ONLY, PLACE_ORDER, CANCEL_ORDER, CANCEL_ALL, NO_WITHDRAW, NO_ADMIN
delegateCanWithdraw: false
delegateCanAdmin: false
realQuaiTransactions: false
walletRequired: false
fundsMoved: false
tradingVaultMutation: false
```

Current prepare endpoints are intentional non-implemented owner-signed boundaries. They return `delegate-key-owner-signed-prepare-boundary` with `prepare-only-owner-signed-required` and `owner-wallet-signature-required` metadata:

```text
source: delegate-key-owner-signed-prepare-boundary
operationStatus: prepare-only-owner-signed-required
ownerAuthorization: owner-wallet-signature-required
delegateAuthority: trade-only-no-withdraw-no-admin
permissions: PLACE_ORDER, CANCEL_ORDER, CANCEL_ALL, NO_WITHDRAW, NO_ADMIN
delegateCanWithdraw: false
delegateCanAdmin: false
fundsMoved: false
tradingVaultMutation: false
```

Completed client/UI surfaces:

- TypeScript SDK `delegateKeys.prepareRegister()` / `delegateKeys.prepareRevoke()`
- Python SDK `delegate_keys.prepare_register()` / `delegate_keys.prepare_revoke()`
- `qdex api create-key --prepare` / `qdex api revoke-key --prepare`
- terminal UI prepare-only delegate/API key panel
- local API + terminal UI delegate/API key prepare smoke

These surfaces intentionally do not sign, submit, relay, deploy, change registry state, or move value. They let bots and UI learn the future owner-signed boundary without confusing placeholder state for real Quai registry event truth.

## Owner-signed approval gate

A real delegate/API key registration or revocation implementation requires explicit Clonners approval required before owner-wallet signing, RPC URL access, broadcast, live DelegateKeyRegistry mutation, transaction submission, or funds movement.

Minimum evidence before replacing the placeholder:

1. verified `DelegateKeyRegistry` contract address evidence,
2. verified source/interface evidence for `DelegateKeyRegistered` and `DelegateKeyRevoked`,
3. owner-wallet UX/signing design that does not expose key material to operators, bots, or local config,
4. `DelegateKeyRegistered` and `DelegateKeyRevoked` event-truth indexing,
5. proof-service/UI copy that separates prepare state from confirmed registry event truth,
6. local contract tests proving delegates stay market/notional/expiry scoped,
7. local contract tests proving delegate keys keep `NO_WITHDRAW` and `NO_ADMIN`,
8. explicit review of how rejected or expired owner-signed requests are represented without mutating local registry projections.

No future implementation should mark a delegate key as registered or revoked from API-local state alone. Confirmed state must come from contract event truth.

## Delegate permission boundary

Delegate/API keys remain trading/automation keys, not owner-wallet keys and not admin keys. Every delegate-key response must continue to carry `NO_WITHDRAW` and `NO_ADMIN`.

Every read-only/list response must keep `READ_ONLY` visible so bots can distinguish inspection from owner-signed mutation flows. Trading-capable prepare metadata should keep `PLACE_ORDER`, `CANCEL_ORDER`, and `CANCEL_ALL` scoped with `NO_WITHDRAW` and `NO_ADMIN`.

Required invariant for every delegate/API key surface:

```text
permissions: READ_ONLY, PLACE_ORDER, CANCEL_ORDER, CANCEL_ALL, NO_WITHDRAW, NO_ADMIN
delegateCanWithdraw: false
delegateCanAdmin: false
```

There is intentionally no positive `WITHDRAW` or `ADMIN` delegate permission in the MVP interface.

A future owner-signed registration/revocation flow must require the main owner wallet or a separately approved high-trust path. It must not be reachable through normal market-maker API keys, read-only streams, or local prepare-only placeholders.

## Disallowed autonomous work

Do not add any of the following without explicit approval:

```text
no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, real contract address claims, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement
```

Also do not add:

- transaction helpers,
- signer/key configuration,
- environment-variable based wallet/RPC wiring,
- public server exposure,
- remote pushes,
- positive withdrawal/admin delegate permissions,
- optimistic local registry changes that claim confirmed event truth.

## Next bounded local/source-only slice

Next bounded local/source-only slice: read-only DelegateKeyRegistry `DelegateKeyRegistered`/`DelegateKeyRevoked` projection schema ratchet.

That future slice should define event-shaped projection rows before any owner-signed transaction behavior exists:

```text
DelegateKeyRegisteredProjection
DelegateKeyRevokedProjection
source: delegatekeyregistry-event-projection
eventName: DelegateKeyRegistered | DelegateKeyRevoked
settlementMode: mock | quai_contract
mock rows with null settlementTx/block/explorer
real rows require settlementTx, blockNumber, blockHash, eventIndex, explorerUrl
permissions: READ_ONLY, NO_WITHDRAW, NO_ADMIN
```

The projection schema should remain docs/spec/source-only until approved event evidence exists.

---

### Task 1: Add this post-delegate-key readiness ratchet

**Objective:** Guard the approval boundary and prevent future autonomous runs from jumping from prepare-only delegate UI to wallet or live registry mutation behavior.

**Files:**
- Create: `tests/post-delegate-key-owner-signed-readiness.test.mjs`
- Create: `docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md`
- Create: `docs/delegate-keys.md`
- Modify: `docs/contracts.md`
- Modify: `docs/architecture.md`
- Modify: `CAMPAIGN_STATUS.md`

**Step 1: Write failing test**

```js
assert.ok(plan.includes('explicit Clonners approval required before owner-wallet signing'));
assert.ok(delegateDoc.includes('read-only DelegateKeyRegistry `DelegateKeyRegistered`/`DelegateKeyRevoked` projection schema'));
```

**Step 2: Run test to verify failure**

Run: `node --test tests/post-delegate-key-owner-signed-readiness.test.mjs`
Expected: FAIL because the plan and delegate doc links do not exist yet.

**Step 3: Write minimal docs**

Add the plan and link it from delegate/core docs. Do not add API behavior, wallet code, RPC config, transaction helpers, live registry mutation, or live token/contract addresses.

**Step 4: Run test to verify pass**

Run: `node --test tests/post-delegate-key-owner-signed-readiness.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/post-delegate-key-owner-signed-readiness.test.mjs docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md docs/delegate-keys.md docs/contracts.md docs/architecture.md CAMPAIGN_STATUS.md
git commit -m "docs: pin post-delegate-key readiness"
```

### Task 2: Future read-only DelegateKeyRegistry event projection schema ratchet

**Objective:** Define event-shaped delegate registration/revocation projection rows without adding transaction behavior.

**Files:**
- Create or modify: `tests/delegate-key-event-projection-schema.test.mjs`
- Modify: `services/indexer/schema.md`
- Modify: `docs/api-openapi.yaml`
- Modify: `docs/delegate-keys.md`
- Modify: `CAMPAIGN_STATUS.md`

**Step 1: Write failing test**

```js
assert.ok(schema.includes('DelegateKeyRegisteredProjection'));
assert.ok(schema.includes('DelegateKeyRevokedProjection'));
assert.ok(schema.includes('real rows require settlementTx, blockNumber, blockHash, eventIndex, explorerUrl'));
```

**Step 2: Run test to verify failure**

Run: `node --test tests/delegate-key-event-projection-schema.test.mjs`
Expected: FAIL until the projection names and event-truth fields are documented.

**Step 3: Write minimal docs/specs**

Define read-only projection rows only. Keep mock rows explicit and require event truth for real Quai rows.

**Step 4: Run test to verify pass**

Run: `node --test tests/delegate-key-event-projection-schema.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/delegate-key-event-projection-schema.test.mjs services/indexer/schema.md docs/api-openapi.yaml docs/delegate-keys.md CAMPAIGN_STATUS.md
git commit -m "docs: define delegate key event projection schema"
```
