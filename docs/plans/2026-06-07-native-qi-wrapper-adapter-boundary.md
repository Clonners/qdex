# Wrapped Token Listing Boundary Implementation Plan

> **For Hermes:** This plan supersedes the earlier native-Qi-adapter blocker. Do not keep asking Clonners to choose a native Qi adapter path for the MVP unless he explicitly reopens direct native Qi settlement.

**Correction:** QDEX MVP uses `WQUAI`, `WQI`, and listed community-created tokens. Native Qi is not a direct `TradingVault` asset in the current DEX plan.

**Goal:** Replace the native-Qi-adapter decision plateau with a wrapped/listed-token market plane: users trade contract/vault tokens, and markets are enabled through listing/registry metadata.

**Architecture:** `TradingVault` accepts listed ERC-20-style vault tokens only. `MarketRegistry` lists approved token pairs such as `WQI-WQUAI` and future community token pairs. Settlement truth remains `TradeSettled`; listing metadata is not custody authority.

**Tech Stack:** Node `node:test` doc ratchets, TypeScript OpenAPI/API metadata, SDK/CLI docs, and local Solidity `MarketRegistry`/`TradingVault` ratchets. No deploys, wallets, RPC URLs, signing, broadcasts, or real funds are introduced by this plan.

---

## Current direction

The asset plane is:

```text
WQUAI / WQI / listed community tokens
  -> TradingVault ERC-20-style balances
  -> MarketRegistry enabled pairs
  -> signed orders
  -> Settlement TradeSettled event truth
```

This means:

- `WQUAI` is the QUAI-facing wrapped/tokenized quote asset.
- `WQI` is the Qi-facing wrapped/tokenized asset used by the DEX.
- Tokens created by users can be listed after whatever review/governance/admin policy the product chooses.
- Native Qi direct settlement is out of scope for the MVP and must not block the autonomous campaign.

## Disallowed shortcuts

- Do not reintroduce `wrapped_qi_receipt_token`, `contract_native_qi_adapter`, or `conversion_settlement_flow` as the active next task.
- Do not represent raw native Qi as a normal `TradingVault.deposit(token, amount)` asset.
- Do not claim direct native Qi custody, settlement, redemption, unwrap, or conversion behavior from the local mock loop.
- Do not add wallet loading, RPC URLs, signing, broadcasts, deploy scripts, or real tx behavior.
- Do not give listing/admin authority any withdrawal path over user balances.

## API and metadata boundary

Public metadata should describe the listed-asset direction, not a native Qi decision gate:

```text
listedAssetStatus.status: wrapped-token-listing
primaryQuoteAssets: WQUAI, WQI
supportedAssetModel: erc20-style-vault-token
userListedTokens: true
listingFlowStatus: design-required
nativeQiTreatment: out-of-scope-direct-settlement-use-WQI
nativeQiDirectSettlement: false
realQuaiTransactions: false
walletRequired: false
```

`GET /v1/contracts`, SDKs, CLI, and docs should state that the MVP settles listed vault tokens such as `WQUAI`, `WQI`, and approved community tokens.

## Delegate and custody boundary

Delegate/API keys remain trading-only and cannot become listing-admin, withdrawal, wrapping, or redemption authority.

Required permission copy keeps `NO_WITHDRAW` and `NO_ADMIN` explicit:

```text
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
NO_WITHDRAW
NO_ADMIN
```

## Completed metadata correction

Completed: the campaign direction has been corrected away from a native Qi adapter selection blocker. The active contract/API metadata boundary is now listed/wrapped-token assets.

Result:

- `/v1/contracts` exposes `listedAssetStatus` instead of asking for a native Qi path decision.
- Docs and SDK/CLI copy pin `WQUAI`, `WQI`, and listed community-created tokens as the MVP asset model.
- Native Qi direct settlement remains out of scope unless explicitly reopened.

## Completed token listing metadata slice

Completed: `GET /v1/listings/policy` exposes read-only listing metadata for the token listing and MarketRegistry metadata flow. Policy doc: `docs/listing-policy.md`.

This slice defines how user-created tokens become listable markets without granting custody or withdrawal authority.

**Implemented files:**

- Test: `tests/token-listing-boundary.test.mjs` plus API route coverage.
- Docs: `docs/listing-policy.md`, `docs/contracts.md`, `docs/architecture.md`.
- API/OpenAPI: read-only listing policy/status surface before runtime behavior.

**Pinned invariants:**

- Listed assets are ERC-20-style vault tokens.
- `MarketRegistry` is market metadata/enabled-pair truth, not custody truth.
- Token listing can enable/disable markets but cannot move user balances.
- Delegate/API keys remain `NO_WITHDRAW` and `NO_ADMIN`.
- Real deploy/tx/wallet/RPC behavior remains approval-gated.

## Completed listing policy client slice

Completed: TypeScript SDK, Python SDK, and `qdex` CLI clients expose the read-only listing policy without adding wallet loading, RPC URLs, signing, broadcasts, deploys, transaction submission, listing-admin runtime behavior, or funds movement.

Token listing and MarketRegistry metadata flow clients are now complete as a read-only surface; future work moves to a separate approval-gated admin boundary.

## Next implementation slice

post-listing-policy MarketRegistry admin boundary: [`docs/plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md`](./2026-06-07-post-listing-policy-marketregistry-admin-boundary.md) pins future listing submission and MarketRegistry admin metadata as design-only, approval-gated work. Do not add runtime listing submission, listing-admin keys, real token addresses, wallets, RPC URLs, signing, broadcasts, deploys, transaction helpers, or claims that MarketRegistry metadata can move TradingVault balances.

---

No deploys, RPC URLs, wallet loading, signing, broadcasts, transaction submissions, or real funds are introduced by this plan.
