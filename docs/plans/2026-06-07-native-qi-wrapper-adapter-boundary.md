# Native Qi Wrapper/Adapter Boundary Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Define the approval-gated boundary for supporting native Qi in a real Quai TradingVault without treating UTXO Qi as an ERC-20 token.

**Architecture:** The current mock `QI-QUAI` loop stays mock-only while this plan defines evidence gates for wrapped Qi receipts, contract-native Qi adapters, or explicit conversion settlement flows. Real settlement remains blocked until one path has local-only ratchets, proof-service/indexer event truth, and explicit Clonners approval.

**Tech Stack:** Node `node:test` doc ratchets, Solidity `0.8.20` local Hardhat interface tests, TypeScript OpenAPI/API metadata, and Quais SDK research only after explicit approval.

---

## Current blocker

Native Qi is UTXO-model, while the current `TradingVault` implementation is account-model ERC-20-style vault accounting. Native Qi must not be represented as a normal ERC-20 token address inside `TradingVault` until Quai-specific contract support is proven.

The current mock `QI-QUAI` stays mock-only. Mock orderbooks, mock fills, mock proofs, and local-only Hardhat contract addresses do not prove that native Qi can be locked, settled, redeemed, or withdrawn by a real Quai contract.

## Acceptable design paths

Only one path should be selected for implementation, and only after evidence exists:

1. `wrapped_qi_receipt_token`
   - Users convert or wrap native Qi into an account-model receipt token.
   - `TradingVault` accepts only the receipt token, not raw native Qi.
   - The wrapper must expose reserve or conversion event truth and a redemption/unwrap proof path.
2. `contract_native_qi_adapter`
   - A Quai-supported contract primitive lets a contract verify and control native Qi state directly.
   - The adapter must prove lock, unlock, settle, and user-owned exit behavior without giving the operator withdrawal authority.
3. `conversion_settlement_flow`
   - Orders settle through an explicit conversion pipeline rather than pretending native Qi is already vault-held.
   - The indexer must separate trade settlement proof from conversion proof, and UI/API copy must state that both are required for real settlement truth.

## Disallowed shortcuts

- Do not add `TradingVault.deposit(qiToken, amount)` for native Qi as if it were ERC-20.
- Do not claim real `QI-QUAI` settlement from mock proofs, mock fills, local-only contract addresses, or matcher-local balances.
- Do not let the relayer, API, delegate key, or matching engine create a hidden custody path around native Qi.
- Do not promote `quai_contract` settlement mode just because local ERC-20-style tests are green.

## Evidence required before unblocking real QI-QUAI

Before any real native-Qi-backed market is presented as settled by Quai contracts, require all of this:

- Public Quai documentation or an approved local prototype showing the selected native Qi path.
- Local-only interface ratchets for the selected path.
- Reserve or conversion event truth for the native Qi leg.
- Redemption/unwrap proof path owned by the user, not by the operator.
- solvency invariant showing every receipt or settlement credit maps to verifiable native Qi backing or conversion evidence.
- Proof-service/indexer projection that keeps trade proof and native Qi backing/conversion proof distinguishable.
- `TradeSettled` remains the public trade-proof trigger; native Qi wrapper/conversion events are supporting evidence, not replacement trade events.
- Explicit Clonners approval before any testnet/mainnet deployment, transaction submission, RPC configuration, wallet loading, or real funds.

## API and metadata boundary

The next safe implementation slice should add read-only status metadata, not runtime native Qi behavior.

Required metadata while the design is unproven includes `nativeQiStatus: design-required`. This means keeping `local-only-not-deployed`, `realQuaiTransactions: false`, and `walletRequired: false` in public metadata:

```text
nativeQiStatus: design-required
contractMode: local-only-not-deployed
realQuaiTransactions: false
walletRequired: false
```

`GET /v1/contracts`, SDKs, CLI, and docs should state that `QI-QUAI` is mock/wrapped-only until the selected design path is approved and proven by event truth.

## Delegate and custody boundary

Delegate/API keys remain trading-only and cannot become native Qi custody tools.

Required permission copy keeps `NO_WITHDRAW` and `NO_ADMIN` explicit:

```text
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
NO_WITHDRAW
NO_ADMIN
```

Delegate/API keys cannot wrap, unwrap, redeem, or withdraw native Qi. Any owner action for native Qi exit must be a separate main-wallet flow with explicit user approval and proof-service/indexer visibility.

## Completed metadata tasks

### Completed Task 1: Add read-only native Qi status metadata to `/v1/contracts`

**Objective:** Expose that native Qi support is design-required and still blocked in local MVP mode.

Completed: `/v1/contracts` exposes read-only `nativeQiStatus: design-required` metadata.

Result:

- The contract registry response keeps `deploymentStatus: local-only-not-deployed`, null addresses, `realQuaiTransactions: false`, and `walletRequired: false`.
- `nativeQiStatus` states `currentTreatment: mock-only`, `nativeQiModel: UTXO-model`, accepted future paths, and `selectedPath: null`.
- No wallets, RPC URLs, signing, broadcasts, deploy scripts, tx helpers, or real contract addresses were added.

### Completed Task 2: Add OpenAPI/docs ratchets for `nativeQiStatus`

**Objective:** Keep API docs, SDK docs, and CLI copy from claiming real native Qi settlement before the design exists.

Completed: OpenAPI, API, SDK, CLI, and docs ratchets keep `QI-QUAI` mock-only and local-only.

Result:

- `docs/api-openapi.yaml`, `docs/contracts.md`, SDK specs/READMEs, and `qdex contracts` docs all expose the same read-only native Qi design boundary.
- Consumer docs preserve `NO_WITHDRAW`, `NO_ADMIN`, null-address, no-wallet, no-broadcast, no-RPC, and no-real-Quai-transaction safety language.
- The current repo remains in mock/native-Qi-design-required mode until explicit approval and external evidence select one future path.

## Remaining approval-gated task

### Task 3: Add local-only interface ratchets for the selected adapter path after approval

No selected path exists yet; do not add an adapter interface until Clonners approves one path with external evidence.

**Objective:** Prevent implementation from inventing a native Qi custody path without a written accepted design.

**Files:**
- Test: `tests/contract-interface-invariants.test.mjs`
- Create only after approval: `contracts/src/INativeQiAdapter.sol` or selected-path interface

**Step 1: Write failing interface test**

The test should assert the selected path name, user-owned exit surface, event-truth fields, and absence of operator withdrawal/admin shortcuts.

**Step 2: Run RED**

Run: `node --test tests/contract-interface-invariants.test.mjs`
Expected: FAIL on missing selected-path interface.

**Step 3: Add minimal interface only**

Add interface declarations and events only. Do not add implementation, deploy scripts, external network config, wallet loading, signing, broadcasts, or tx behavior.

**Step 4: Run GREEN**

Run: `pnpm check`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/contract-interface-invariants.test.mjs contracts/src

git commit -m "contracts: pin native qi adapter interface boundary"
```

---

No deploys, RPC URLs, wallet loading, signing, broadcasts, transaction submissions, or real funds are introduced by this plan.
