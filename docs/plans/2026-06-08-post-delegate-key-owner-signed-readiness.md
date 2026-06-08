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

## Completed projection schema slice

Completed: read-only DelegateKeyRegistry `DelegateKeyRegistered`/`DelegateKeyRevoked` projection schema ratchet.

The schema now defines event-shaped projection rows before any owner-signed transaction behavior exists:

```text
DelegateKeyRegisteredProjection
DelegateKeyRevokedProjection
source: delegatekeyregistry-event-projection
eventName: DelegateKeyRegistered | DelegateKeyRevoked
settlementMode: mock | quai_contract
mock rows keep settlementTx/blockNumber/blockHash/eventIndex/explorerUrl null
real rows require settlementTx, blockNumber, blockHash, eventIndex, explorerUrl
permissions: READ_ONLY, PLACE_ORDER, CANCEL_ORDER, CANCEL_ALL, NO_WITHDRAW, NO_ADMIN
```

The projection schema remains docs/spec/source-only until approved event evidence exists. It must not load wallets, read RPC URLs, sign, broadcast, deploy, submit transactions, mutate a live `DelegateKeyRegistry`, mutate TradingVault balances, or move funds.

## Completed history API slice

Completed: read-only delegate-key registration/revocation history API envelopes.

The API now exposes empty/mock history envelopes for future event truth without adding owner-signed behavior:

```text
GET /v1/delegate-keys/registrations
GET /v1/delegate-keys/revocations
source: delegatekeyregistry-event-projection
projectionType: DelegateKeyRegisteredProjection | DelegateKeyRevokedProjection
settlementMode: mock
mock rows keep settlementTx/blockNumber/blockHash/eventIndex/explorerUrl null
permissions: READ_ONLY, NO_WITHDRAW, NO_ADMIN
delegateCanWithdraw: false
delegateCanAdmin: false
delegateKeyRegistryMutation: false
```

The history API is local/source-only and read-only. It must not load wallets, read RPC URLs, sign, broadcast, deploy, submit transactions, mutate a live `DelegateKeyRegistry`, mutate TradingVault balances, or move funds.

Completed: read-only TypeScript/Python/qdex delegate-key history clients for `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`.

The clients now expose TypeScript SDK `delegateKeys.listRegistrations()` / `delegateKeys.listRevocations()`, Python SDK `delegate_keys.list_registrations()` / `delegate_keys.list_revocations()`, and `qdex api registrations` / `qdex api revocations`, all backed by empty/mock local projection rows with `source: delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed: terminal UI read-only delegate-key history panel for those projection envelopes.

The terminal UI now exposes `web/terminal-ui/src/delegate-key-history-panel.js`, `mockVerticalSliceFixture.delegateKeyHistory`, and renderer coverage for empty/mock `DelegateKeyRegisteredProjection` / `DelegateKeyRevokedProjection` rows. It displays `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and mock-null event evidence without wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed: local API + terminal UI delegate-key history integration smoke for `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`.

The smoke binding uses `web/terminal-ui/src/delegate-key-history-binding.js` to fetch both REST envelopes from local `createApiServer()`, normalize them through the terminal UI history panel, treat empty mock arrays as valid state, and render only `delegatekeyregistry-event-projection` metadata with `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, mock-null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed: private DelegateKeyRegistry registration/revocation WebSocket snapshot alignment for `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations`.

The stream contracts and WebSocket transport now reuse `createDelegateKeyHistoryProjectionEnvelope()` for private read-only registration/revocation history snapshots. They preserve `source: delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, empty mock arrays, mock-null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed: terminal UI binding for private DelegateKeyRegistry history streams.

The terminal UI now exposes `web/terminal-ui/src/live-delegate-key-history.js`, opens `/v1/ws?channel=delegate-key-registrations` plus `/v1/ws?channel=delegate-key-revocations`, validates the private `delegatekeyregistry-event-projection` snapshots, and renders only read-only `DelegateKeyRegisteredProjection` / `DelegateKeyRevokedProjection` metadata with `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, mock-null event evidence, no live `DelegateKeyRegistry` mutation, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Next bounded local/source-only slice: local API + terminal UI DelegateKeyRegistry history stream integration smoke, with REST + WebSocket agreement checks before rendering and still no live `DelegateKeyRegistry` mutation or wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

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

### Completed Task 2: Read-only DelegateKeyRegistry event projection schema ratchet

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
