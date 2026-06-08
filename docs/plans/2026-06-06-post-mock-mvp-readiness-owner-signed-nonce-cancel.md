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
| Native Qi | Documented caveat only | Raw native Qi direct settlement is out of scope for the MVP. QDEX uses WQUAI, WQI, and listed community-created tokens as ERC-20-style vault assets; the Qi-facing market surface is WQI. |
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
- Token listing and MarketRegistry work must keep listing authority separate from custody; raw native Qi direct settlement is out of scope unless explicitly reopened.

## Completed post-mock readiness tasks

### Completed Task 1: Owner-signed nonce-cancel API/OpenAPI placeholder

**Objective:** Make matcher-local cancellation and contract nonce cancellation unambiguous at the API boundary.

Completed: `POST /v1/nonces/cancel` returns a prepare-only `501` boundary with `owner_signed_nonce_cancel_not_implemented`, `owner-signed-required`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, and explicit wording that matcher-local cancellation does not mutate on-chain `NonceManager` nonces.

Result:

- API/OpenAPI/order-schema surfaces do not load wallets, sign, broadcast, submit to the relayer, or claim on-chain status.
- The route is discovery/prepare-only until a separate owner-signed main-wallet flow is approved.

### Completed Task 2: SDK/CLI nonce-cancel prepare-only clients

**Objective:** Let bot clients discover the safe nonce-cancel boundary without creating transaction authority.

Completed: TypeScript SDK, Python SDK, and `qdex nonces cancel --prepare` call the placeholder without treating it as a generic failure.

Result:

- Clients return the intentional `501 owner_signed_nonce_cancel_not_implemented` envelope.
- No wallet loading, signing, broadcast behavior, relayer submission, transaction helpers, or on-chain status claims were added.

### Completed Task 3: Nonce-cancel proof/indexer projection boundary

**Objective:** Define how future contract nonce-cancel events become API/proof rows.

Completed: future `NonceCancelled` and `NonceRangeCancelled` event projections are separated from matcher-local cancellation events.

Result:

- Nonce-cancel proofs are not trade settlements and do not imply withdrawal or admin authority.
- Matcher-local cancellation stream events are suppressed from on-chain nonce proof projection.
- Real Quai nonce proof rows require event truth such as tx hash, block number, block hash, event index, and explorer URL.

### Completed Task 4: Relayer real-Quai approval gate

**Objective:** Ensure real relayer mode cannot activate without explicit approval and complete event-truth inputs.

Completed: `quai_contract` mode is blocked unless explicit Clonners approval and event-truth readiness metadata are present.

Result:

- `evaluateRelayerSettlementModeGate()` is metadata/readiness-only and keeps `realQuaiTransactions: false` plus `walletRequired: false`.
- API/SDK/CLI clients can read the gate state, but no wallet loading, signing, broadcast, RPC access, relayer submission, or transaction behavior was added.

### Completed Task 5: Wrapped token listing correction

**Objective:** Remove the stale native-Qi-adapter blocker and pin the MVP to listed ERC-20-style vault tokens.

Completed: [`docs/plans/2026-06-07-native-qi-wrapper-adapter-boundary.md`](./2026-06-07-native-qi-wrapper-adapter-boundary.md) now supersedes the native Qi adapter blocker and pins WQUAI, WQI, and listed community-created tokens as the MVP asset model.

Result:

- Raw native Qi direct settlement is out of scope for the MVP.
- `/v1/contracts`, SDKs, CLI, and docs expose read-only `listedAssetStatus` metadata.
- No native Qi adapter interface, runtime behavior, wallet loading, signing, broadcast, deployment, transaction submission, or real settlement claim was added.

### Completed Task 6: Listing policy and prepare-only listing request surfaces

**Objective:** Complete the design-only listed-asset / MarketRegistry metadata surfaces without adding runtime listing authority.

Completed: `GET /v1/listings/policy` exposes the read-only listing policy, `POST /v1/listings/requests` preserves an intentional prepare-only `501` fallback, and approved `requestMode: local_review_queue` writes only to the local in-memory review queue.

Result:

- TypeScript SDK, Python SDK, and `qdex listings request --prepare` clients return the prepare-only envelope without treating it as an on-chain listing submission; queue and decision clients are complete local-only slices.
- `source: listed-asset-marketregistry-policy`, `status: design-only-local-metadata`, `requestStatus: not-implemented-approval-required`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, and `walletRequired: false` stay pinned.
- No runtime listing submission, listing-admin keys, real token addresses, wallets, RPC URLs, signing, broadcasts, deploys, transaction helpers, MarketRegistry mutation, funds movement, or TradingVault balance authority was added.

## Remaining implementation direction

Existing safe surfaces: `GET /v1/listings/policy`, `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision`, and prepare-only fallback.

Next boundary: explicit Clonners approval before runtime listing submission beyond local queue/decision state or MarketRegistry admin mutation.

Required boundary before runtime listing behavior:

- listed assets are ERC-20-style vault tokens,
- `MarketRegistry` is market metadata/enabled-pair truth, not custody truth,
- listing/admin metadata can enable or disable markets but cannot move balances,
- delegate/API keys remain `NO_WITHDRAW` and `NO_ADMIN`,
- real deploy/tx/wallet/RPC behavior remains approval-gated.

Do not add runtime listing submission, listing-admin keys, real token addresses, wallets, RPC URLs, signing, broadcasts, deploys, transaction helpers, MarketRegistry mutation, or real native Qi settlement claims. Listing/admin metadata may enable token pairs only after approval, and it must never move user balances or grant withdrawal/admin power.
