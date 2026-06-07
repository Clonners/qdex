# Token Listing and MarketRegistry Metadata Policy

## Goal

Define the token listing and MarketRegistry metadata flow for QDEX without adding runtime listing behavior, wallets, RPCs, deployments, transactions, or custody authority.

The MVP asset plane is WQUAI, WQI, and community-created ERC-20-style vault tokens. The first real listed market shape is expected to be `WQI-WQUAI`, while the old `QI-QUAI` fixture can remain a mock-only demo label until all UI/SDK fixtures are migrated.

## Asset model

- `WQUAI` is the QUAI-facing wrapped/tokenized vault asset.
- `WQI` is the Qi-facing vault asset; raw native Qi direct settlement is out of scope for this campaign.
- Community-created ERC-20-style vault tokens can become listable after review.
- All listed assets must behave as ERC-20-style vault tokens before `TradingVault.deposit(token, amount)` is treated as real.

## MarketRegistry boundary

`MarketRegistry` is market metadata/enabled-pair truth, not custody truth.

`TradingVault` remains the only vault-balance surface. Listing a token pair can make a market visible or disabled, but it cannot move user balances, unlock funds, withdraw funds, change settlement balances, or grant delegate/admin authority.

Allowed metadata transitions:

```text
submit-token-metadata
review-token-safety
define-precision-and-minimums
MarketRegistry.addMarket after approval
MarketRegistry.disableMarket if needed
```

Contract surfaces:

- `addMarket` records approved base/quote metadata, precision, and minimum amount.
- `disableMarket` disables an existing market without erasing metadata required for indexer replay.
- `marketInfo` is read-only market metadata for API, SDK, CLI, and indexer projections.

## Listing authority and DAO handoff

The approved local authority model starts Clonners-managed and keeps a clean migration path to DAO governance:

```text
currentPhase: clonners-operator-managed
initialAuthority: Clonners-controlled MarketRegistry authority
futureAuthority: dao-governance
handoffPattern: MarketRegistry.proposeMarketAuthority -> MarketRegistry.acceptMarketAuthority
eventTruth: MarketAuthorityHandoffProposed, MarketAuthorityHandoffAccepted
```

Authority can list/disable market metadata and propose the next authority. It cannot move `TradingVault` balances, withdraw user funds, grant delegate admin power, load wallets, or broadcast transactions.

DAO migration is two-step: the current Clonners-managed authority proposes the DAO/multisig, and that proposed DAO/multisig must accept before it gets listing authority. The old authority loses listing power after acceptance.

## Non-custodial invariants

- Listing/admin metadata cannot move user balances.
- Listing/admin metadata cannot grant withdrawal authority.
- Delegate/API keys stay trading-only and must preserve `NO_WITHDRAW` and `NO_ADMIN`.
- `MarketRegistry` may enable/disable metadata only; `Settlement` and `TradingVault` enforce actual fill and balance rules.
- `TradeSettled` remains the public trade-proof trigger.

## Read-only API status

`GET /v1/listings/policy` is a read-only metadata endpoint. It is intentionally not a listing submission endpoint.

Required safety metadata:

```text
source: listed-asset-marketregistry-policy
status: design-only-local-metadata
assetModel: erc20-style-vault-token
primaryQuoteAssets: WQUAI, WQI
realQuaiTransactions: false
walletRequired: false
```

This surface performs no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds movement.

## Local listing request review/approval flow

`GET /v1/listings/review-flow` exposes the Clonners-managed local review and approval state machine as metadata only. It does not persist a runtime listing queue, does not mutate `MarketRegistry`, and does not create real token addresses.

Required review-flow metadata:

```text
source: listed-asset-marketregistry-review-flow
status: design-only-local-metadata
phase: clonners-managed-local-review-before-dao
requestSurface: prepare-only POST /v1/listings/requests
marketRegistryMutation: false
approvedStatus: approved-local-metadata-only
rejectedStatus: rejected-local-metadata-only
realQuaiTransactions: false
walletRequired: false
permissions: NO_WITHDRAW, NO_ADMIN
```

The local stages are `metadata_intake`, `token_safety_review`, `market_parameter_review`, `clonners_local_approval`, and `marketregistry_admin_gate`. The safety contract pins `phase: clonners-managed-local-review-before-dao` and `marketRegistryMutation: false`. A local approval is `approved-local-metadata-only`; a local rejection is `rejected-local-metadata-only`. The next mutation gate remains explicit Clonners approval required before `MarketRegistry.addMarket`.

This route preserves `NO_WITHDRAW` and `NO_ADMIN`, and listing/admin metadata still cannot move `TradingVault` balances or grant withdrawal/admin authority.

## Prepare-only listing request API placeholder

`POST /v1/listings/requests` returns `501` as a precise approval-gated placeholder. It is not a runtime listing queue, it does not persist submitted token listings, and it does not mutate `MarketRegistry`.

Required placeholder response fields:

```text
source: listed-asset-marketregistry-policy
status: design-only-local-metadata
requestStatus: not-implemented-approval-required
approvalGate: listing-submission-approval-gate
marketRegistryMutation: false
realQuaiTransactions: false
walletRequired: false
permissions: NO_WITHDRAW, NO_ADMIN
```

The response preserves `source: listed-asset-marketregistry-policy`, `status: design-only-local-metadata`, `requestStatus: not-implemented-approval-required`, `marketRegistryMutation: false`, `realQuaiTransactions: false`, `walletRequired: false`, `NO_WITHDRAW`, and `NO_ADMIN`.

The placeholder keeps WQUAI/WQI/community-token framing: quote assets are `WQUAI` and `WQI`, and the only future user-created asset model described here is `community-created-erc20-style-token` / `erc20-style-vault-token` metadata.

This endpoint performs no wallet loading, RPC URL access, signing, broadcast, transaction submission, deploy, real token-address registration, listing-admin runtime behavior, or funds movement. A `501` response must state that listing/admin metadata cannot move `TradingVault` balances or grant withdrawal/admin authority.

## Explicitly out of scope

- Direct native Qi settlement inside `TradingVault`.
- Wallet/key loading or order/admin signing.
- RPC URL reads, broadcasts, deploys, or transaction submission.
- Any listing path that can sweep, rescue, withdraw, unlock, or settle user funds.

## Current approval gate

Existing safe listing surfaces: `GET /v1/listings/policy` and prepare-only `POST /v1/listings/requests`.

Approval required: runtime listing submission or MarketRegistry admin mutation.

The post-listing-policy MarketRegistry admin boundary is documented in [`docs/plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md`](./plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md). That approval gate preserves the current read-only policy endpoint and prepare-only request placeholder, and repeats that listing/admin metadata cannot move `TradingVault` balances, cannot grant withdrawal/admin authority, and cannot add wallets, RPC URLs, signing, broadcasts, deploys, transaction helpers, real token addresses, listing-admin runtime behavior, `MarketRegistry` mutation, or funds movement.
