# Post-Mock MVP Readiness and Owner-Signed Nonce-Cancel Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the current local mock DEX loop with approval-gated real Quai readiness without losing non-custodial invariants.

**Architecture:** The current mock loop remains the executable MVP while this plan maps each mock plane to local-only ratchets and explicit approval gates. Owner-signed nonce cancellation is separated from matcher-local cancellation so bots cannot mistake off-chain order removal for on-chain replay protection.

**Tech Stack:** Node `node:test` doc ratchets, TypeScript API/SDK/CLI/UI, Python SDK docs, Solidity `0.8.20` local Hardhat contracts, and Quais SDK/Orchard only after approval.

---

## Current local MVP boundary

The working MVP boundary is still local and mock-backed:

```text
mock market -> signed/mock orders -> deterministic matching -> FillPacket -> mock settlement confirmed -> indexed fill/proof projection
```

That local loop now reaches API, SDKs, CLI, WebSocket streams, and terminal UI proof/cancel panels. It must keep these visible safety fields until real Quai event truth replaces the mock plane:

- `settlementMode: mock`
- `realQuaiTransactions: false`
- `walletRequired: false`
- mock proof tx/block/explorer fields stay `null`
- no matcher-local `createdAt` on public `IndexedFillProjection` rows

No deploys, RPC URLs, wallets, transaction sends, or real funds are introduced by this plan.

## Gap map before real Quai replacement

| Plane | Current local truth | Next safe boundary |
| --- | --- | --- |
| Open orders | In-memory matcher state and matcher-local cancellation | Keep as non-authoritative cache; add signed owner nonce-cancel separately. |
| Final fills/proofs | In-memory proof-service projection from mock `SETTLEMENT_CONFIRMED` events | Real proof rows require `TradeSettled` event evidence with tx/block/event identity. |
| Contracts | Local Hardhat `TradingVault`, `Settlement`, `NonceManager`, `MarketRegistry`, `FeeManager`, `DelegateKeyRegistry` | Preserve TV/ST/NM/MR/FM/DK ratchets before any approved Orchard work. |
| Contract metadata | `/v1/contracts` returns `local-only-not-deployed` and `address: null` | Replace only after approved deployment evidence, verified source links, and event-truth indexing. |
| Delegates/API keys | `READ_ONLY`, `PLACE_ORDER`, `CANCEL_ORDER`, `CANCEL_ALL`, `NO_WITHDRAW`, `NO_ADMIN` | Never grant nonce-cancel, withdraw, or admin power to delegate/API keys by default. |
| Native Qi | Documented caveat only | Native Qi remains UTXO-model and needs a wrapper/adapter/conversion design before any real `QI-QUAI` settlement claim. |
| Relayer | Mock/local confirmation path | Real Quai broadcast mode remains approval-gated and must not read wallet material autonomously. |

## Owner-signed nonce-cancel boundary

Matcher-local cancellation removes only open matcher quantity and does not mutate `NonceManager`. It is useful for UI/bot order management, but it is not replay protection once an order signature has escaped the matcher.

Owner-signed nonce cancellation is the separate contract-facing flow. It targets the on-chain nonce surface directly: `cancelNonce(uint256 nonce)` for one nonce and `cancelNonceRange(uint256 from, uint256 to)` for bounded ranges.

```solidity
cancelNonce(uint256 nonce)
cancelNonceRange(uint256 from, uint256 to)
```

The first API slice should be prepare-only or precise `501` placeholder behavior until an approved wallet/broadcast flow exists. A future signed request can carry:

```json
{
  "action": "cancelNonce",
  "owner": "0xowner",
  "nonce": "42",
  "nonceRange": null,
  "chainId": 0,
  "nonceManagerContract": "0xnonce-manager",
  "expiresAt": 1780000000,
  "signature": "0xsignature"
}
```

Rules:

- The signer must be the main wallet for the owner, or a separately approved high-trust flow.
- Delegate/API keys cannot submit this flow.
- `CANCEL_ORDER` and `CANCEL_ALL` remain matcher-local permissions only.
- `NO_WITHDRAW` and `NO_ADMIN` remain required in delegate metadata and responses.
- The flow cannot move vault balances, withdraw funds, or change market/fee/admin policy.
- Real broadcast or relayer submission requires explicit Clonners approval and event-truth indexing.

## Approval gates

Do not cross any gate autonomously:

- Real Quai deployment addresses require explicit Clonners approval, deployment transcript, contract address list, and verified source links.
- Contract proofs require event-truth indexing from `TradeSettled`; API/cache rows are projection only.
- Nonce-cancel proof UX requires `NonceCancelled`/`NonceRangeCancelled` event indexing before claiming on-chain cancellation status.
- Quais SDK relayer mode requires an approved signing/broadcast design and must not use cron-held wallet material.
- Native Qi wrapper/adapter work must be designed and reviewed before any real `QI-QUAI` settlement claim.

## Next implementation tasks

### Task 1: Add owner-signed nonce-cancel API/OpenAPI placeholder

**Objective:** Make matcher-local cancellation and contract nonce cancellation unambiguous at the API boundary.

**Files:**
- Modify: `docs/api-openapi.yaml`
- Modify: `docs/order-schema.md`
- Modify: `services/api/src/routes/private.js`
- Test: `services/api/test/routes.test.mjs`

**Step 1: Write failing test**

Add a focused route test asserting `POST /v1/nonces/cancel` returns status `501` with:

```json
{
  "error": "owner_signed_nonce_cancel_not_implemented",
  "source": "owner-signed-nonce-cancel-placeholder",
  "custody": "non-custodial",
  "nonceManager": "owner-signed-required",
  "permissions": ["NO_WITHDRAW", "NO_ADMIN"],
  "message": "Matcher-local cancellation does not mutate on-chain NonceManager nonces."
}
```

**Step 2: Run test to verify failure**

Run: `pnpm --filter @qdex/api test -- --test-name-pattern nonce`
Expected: FAIL — route is missing or returns `404`.

**Step 3: Write minimal implementation**

Add only the placeholder route and OpenAPI/docs text. Do not add wallet loading, broadcast code, relayer submission, or contract calls.

**Step 4: Run test to verify pass**

Run: `pnpm --filter @qdex/api test -- --test-name-pattern nonce`
Expected: PASS.

**Step 5: Commit**

```bash
git add docs/api-openapi.yaml docs/order-schema.md services/api/src/routes/private.js services/api/test/routes.test.mjs
git commit -m "feat: add owner-signed nonce-cancel API placeholder"
```

### Task 2: Add SDK/CLI nonce-cancel prepare-only clients

**Objective:** Let bot clients discover the safe nonce-cancel boundary without creating transaction authority.

**Files:**
- Modify: `sdk/typescript/spec.md`
- Modify: `sdk/typescript/src/client.js`
- Modify: `sdk/typescript/test/client-smoke.test.mjs`
- Modify: `sdk/python/spec.md`
- Modify: `sdk/python/qdex_client.py`
- Modify: `sdk/python/test/test_client_smoke.py`
- Modify: `cli/qdex/spec.md`
- Modify: `cli/qdex/src/index.js`
- Modify: `cli/qdex/test/cli-smoke.test.mjs`

**Step 1: Write failing tests**

Assert TypeScript, Python, and CLI helpers expose prepare/placeholder behavior and preserve `NO_WITHDRAW`/`NO_ADMIN`.

**Step 2: Run tests to verify failure**

Run: `pnpm --filter @qdex/sdk-typescript test && pnpm --filter @qdex/sdk-python test && pnpm --filter @qdex/cli test`
Expected: FAIL — helpers/commands are missing.

**Step 3: Write minimal implementation**

Call the API placeholder and print the safety message. Keep streams bounded and do not add signing or broadcast behavior.

**Step 4: Run tests to verify pass**

Run the same focused commands and then `pnpm check`.

**Step 5: Commit**

```bash
git add sdk/typescript sdk/python cli/qdex
git commit -m "feat: expose safe nonce-cancel prepare clients"
```

### Task 3: Add proof-service/indexer projection for NonceCancelled events

**Objective:** Define how future contract nonce-cancel events become API/proof rows.

**Files:**
- Modify: `services/indexer/schema.md`
- Modify: `services/proof-service/spec.md`
- Modify: `services/proof-service/src/contract-proof-event-adapter.js`
- Test: `tests/contract-proof-event-adapter.test.mjs`

**Step 1: Write failing test**

Assert only `NonceCancelled` and `NonceRangeCancelled` contract events can project nonce-cancel proof rows; matcher-local cancellation events must be suppressed.

**Step 2: Run test to verify failure**

Run: `node --test tests/contract-proof-event-adapter.test.mjs`
Expected: FAIL — nonce-cancel projection does not exist.

**Step 3: Write minimal implementation**

Add event adapter logic only. Keep real Quai proofs blocked unless tx/block/event evidence is complete.

**Step 4: Run test to verify pass**

Run focused test, then `pnpm check`.

**Step 5: Commit**

```bash
git add services/indexer services/proof-service tests/contract-proof-event-adapter.test.mjs
git commit -m "feat: define nonce-cancel proof projection"
```

### Task 4: Add relayer real-Quai approval gate tests

**Objective:** Ensure real relayer mode cannot activate without explicit approval and complete event-truth inputs.

**Files:**
- Modify: `services/relayer/spec.md`
- Create or modify: `tests/relayer-approval-gate.test.mjs`

**Step 1: Write failing test**

Assert docs/specs require approval before any `quai_contract` submission mode and keep mock confirmation explicit.

**Step 2: Run test to verify failure**

Run: `node --test tests/relayer-approval-gate.test.mjs`
Expected: FAIL — approval gate ratchet is missing.

**Step 3: Write minimal implementation**

Document the gate and add local-only guard surfaces. Do not add Quais SDK runtime code yet.

**Step 4: Run test to verify pass**

Run focused test, then `pnpm check`.

**Step 5: Commit**

```bash
git add services/relayer/spec.md tests/relayer-approval-gate.test.mjs
git commit -m "test: pin relayer real-quai approval gate"
```

### Task 5: Write native Qi wrapper/adapter design before real QI-QUAI settlement

**Objective:** Prevent accidental ERC-20 assumptions for native Qi before contract settlement claims become real.

**Files:**
- Create: `docs/native-qi-wrapper-adapter.md`
- Modify: `docs/contracts.md`
- Modify: `docs/architecture.md`
- Test: `tests/native-qi-wrapper-adapter.test.mjs`

**Step 1: Write failing test**

Assert the design doc states native Qi is UTXO-model, cannot be treated as an ERC-20 vault token, and needs an explicit wrapper/adapter/conversion proof before real `QI-QUAI` settlement.

**Step 2: Run test to verify failure**

Run: `node --test tests/native-qi-wrapper-adapter.test.mjs`
Expected: FAIL — design doc is missing.

**Step 3: Write minimal implementation**

Document the adapter options, event/proof requirements, and approval gates. Do not implement contracts or transactions.

**Step 4: Run test to verify pass**

Run focused test, then `pnpm check`.

**Step 5: Commit**

```bash
git add docs/native-qi-wrapper-adapter.md docs/contracts.md docs/architecture.md tests/native-qi-wrapper-adapter.test.mjs
git commit -m "docs: plan native qi wrapper adapter"
```
