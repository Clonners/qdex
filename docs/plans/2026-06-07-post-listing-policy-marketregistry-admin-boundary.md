# Post-Listing-Policy MarketRegistry Admin Boundary Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Pin the completed listing-policy/request surfaces, the approved local in-memory review queue, and the explicit MarketRegistry admin approval gate without adding live listing/admin behavior.

**Architecture:** Existing safe listing surfaces are `GET /v1/listings/policy`, `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision`, and prepare-only fallback. Runtime listing submission beyond local queue/decision state or MarketRegistry admin mutation remains blocked until separate explicit Clonners approval and local contract/admin ratchets. `MarketRegistry` remains enabled-pair metadata truth; `TradingVault` remains custody/balance truth.

**Tech Stack:** Markdown plan/spec ratchets, Node `node:test` doc guards, existing OpenAPI/API/SDK/CLI docs, and local-only Solidity `MarketRegistry` concepts. No wallets, RPC URLs, signing, broadcasts, deploys, transaction helpers, real token addresses, listing-admin keys, `MarketRegistry` mutation, or funds movement are introduced by this plan.

---

## Current completed boundary

The current listing surface is read-only local metadata:

It preserves `source: listed-asset-marketregistry-policy`, `status: design-only-local-metadata`, `realQuaiTransactions: false`, and `walletRequired: false`.

```text
GET /v1/listings/policy
source: listed-asset-marketregistry-policy
status: design-only-local-metadata
assetModel: erc20-style-vault-token
primaryQuoteAssets: WQUAI, WQI
realQuaiTransactions: false
walletRequired: false
```

This boundary describes WQUAI, WQI, and community-created ERC-20-style vault tokens. It does not accept listing requests, mutate `MarketRegistry`, load wallets, load RPC URLs, sign messages, submit transactions, deploy contracts, publish token addresses, or move real funds.

## Approval-gated runtime listing submission boundary

Runtime listing submission beyond local queue/decision state is approval-gated before implementation. The prepare-only `POST /v1/listings/requests` fallback still returns a non-implemented response unless the caller explicitly uses approved local review queue mode.

Current local review request shape (metadata-only; queued locally only with `requestMode: local_review_queue`):
```json
{
  "baseSymbol": "COMMUNITY",
  "quoteSymbol": "WQUAI",
  "tokenModel": "erc20-style-vault-token",
  "requestedMarketId": "COMMUNITY-WQUAI",
  "pricePrecision": 8,
  "amountPrecision": 8,
  "minAmount": "1",
  "reviewNotes": "metadata-only local request",
  "requestMode": "local_review_queue"
}
```

Prepare-only response invariants:

```text
source: listed-asset-marketregistry-policy
status: design-only-local-metadata
requestStatus: not-implemented-approval-required
custody: non-custodial
realQuaiTransactions: false
walletRequired: false
marketRegistryMutation: false
tradingVaultBalanceMovement: false
```

There is still no on-chain/runtime listing submission beyond metadata-only local queue/decision surfaces. Do not add a persistent production queue, listing admin account, wallet/signing path, RPC path, contract call, deploy helper, address registry, or token verification claim until separate approval and external evidence exist.

## MarketRegistry admin metadata boundary

`MarketRegistry.addMarket` is enabled-pair metadata only. It can only mark an approved base/quote token pair as available for matching/settlement policy after all review gates pass.

`MarketRegistry.disableMarket` retains metadata for indexer replay. Disable must not erase market history or hide prior event/proof truth.

MarketRegistry admin metadata:

```text
can create market metadata: yes, after approval
can disable market metadata: yes, after approval
can move TradingVault balances: no
can unlock locked balances: no
can settle fills: no
can grant delegate withdrawal/admin power: no
```

`MarketRegistry` cannot move `TradingVault` balances and cannot grant withdrawal/admin power. `TradingVault` remains the only balance surface, and `Settlement`/`TradeSettled` remains the public fill/proof truth.

## Approved local authority handoff

Clonners approved a useful listing authority path that starts operator-managed and can later delegate to a DAO/multisig. The local-only contract ratchet is:

```text
current authority: Clonners-managed MarketRegistry authority
future authority: DAO/multisig governance
handoff: MarketRegistry.proposeMarketAuthority(nextAuthority) -> MarketRegistry.acceptMarketAuthority()
events: MarketAuthorityHandoffProposed, MarketAuthorityHandoffAccepted
```

Only the current authority can propose the next authority. Only the proposed DAO/multisig can accept. Once accepted, the old Clonners-managed authority loses `addMarket`/`disableMarket` power. This is metadata authority only: no custody, no withdrawal, no delegate-admin power, no wallet loading, no RPC URL, no signing, no broadcast, no deploy, no real token-address claims, and no funds movement.

The approved bounded runtime-facing slice stays local/metadata-first: expose an in-memory review queue for listing requests that Clonners can inspect before DAO governance wiring. Real network mutations still require a separate approval/evidence gate.

## Delegates and listing-admin separation

Delegate/API keys remain trading-only. Delegate/API keys cannot become listing-admin authority, cannot mutate `MarketRegistry`, and cannot call owner/admin listing flows.

Required delegate safety copy stays explicit:

```text
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
NO_WITHDRAW
NO_ADMIN
```

Future listing-admin approval, if any, must be a separate high-trust operator/governance plane and must still have no custody over user balances.

## Disallowed autonomous work

Autonomous cron slices must not add:

```text
no wallets, RPC URLs, signing, broadcasts, deploys, transaction helpers, real token addresses, listing-admin key behavior, MarketRegistry mutation, or funds movement
```

Also do not add listing submission persistence beyond local in-memory queue state, listing-admin keys, generated deployment manifests, address claims, token verification claims, fee/economics policy, or any claim that `MarketRegistry` metadata can move `TradingVault` balances.

## Completed prepare-only API placeholder

`POST /v1/listings/requests` now returns a precise `501` approval-gated placeholder. It preserves `source: listed-asset-marketregistry-policy`, `status: design-only-local-metadata`, `requestStatus: not-implemented-approval-required`, `marketRegistryMutation: false`, `realQuaiTransactions: false`, `walletRequired: false`, `NO_WITHDRAW`, and `NO_ADMIN`.

The placeholder does not persist listing submissions, mutate `MarketRegistry`, load wallets, read RPC URLs, sign, broadcast, deploy, create real token addresses, add listing-admin runtime behavior, move funds, or claim a listing was submitted on-chain.

## Completed prepare-only clients

TypeScript SDK `listings.requests.prepareSubmit()`, Python SDK `listings.requests.prepare_submit()`, and `qdex listings request --prepare` now expose the prepare-only placeholder. These clients return the intentional `501` envelope as a prepare-only boundary response, not as a successful listing submission, and preserve `NO_WITHDRAW`, `NO_ADMIN`, no wallet/RPC/sign/broadcast/deploy/tx/funds behavior, and no `MarketRegistry` mutation.

## Completed local review queue boundary

Clonners approved the local runtime listing review queue as an in-memory metadata-only intake surface. `POST /v1/listings/requests` with `requestMode: local_review_queue` can queue a local review record, and `GET /v1/listings/requests` can inspect those local records.

This local queue preserves `source: listed-asset-marketregistry-review-flow`, `status: design-only-local-metadata`, `phase: clonners-managed-local-review-before-dao`, `queueStatus: local-in-memory-review-queue`, `persistence: in-memory-local-server-only`, `requestStatus: queued-local-review`, `reviewStage: metadata_intake`, `reviewDecision: pending-local-review`, `marketRegistryMutation: false`, `realQuaiTransactions: false`, `walletRequired: false`, `NO_WITHDRAW`, and `NO_ADMIN`.

The queue is server-local and in-memory only. It cannot move `TradingVault` balances, mutate `MarketRegistry`, load wallets, read RPC URLs, sign, broadcast, deploy, submit transactions, register real token addresses, create listing-admin keys, or claim that a listing request was submitted on-chain.

## Completed local review decision boundary

`POST /v1/listings/requests/{requestId}/decision` now records immutable local-only approval/rejection metadata for an existing in-memory request when the caller provides `decisionMode: local_review_decision`. The response preserves `source: listed-asset-marketregistry-review-flow`, `status: design-only-local-metadata`, `requestStatus: reviewed-local-metadata-only`, `reviewDecision: approved-local-metadata-only` or `reviewDecision: rejected-local-metadata-only`, `nextMutationGate: explicit Clonners approval required before MarketRegistry.addMarket`, `marketRegistryMutation: false`, `realQuaiTransactions: false`, `walletRequired: false`, `NO_WITHDRAW`, and `NO_ADMIN`.

Local decisions are server-memory metadata only and immutable once recorded. They cannot move `TradingVault` balances, mutate `MarketRegistry`, register real token addresses, load wallets, read RPC URLs, sign, broadcast, deploy, submit transactions, create listing-admin keys, grant withdrawal/admin authority, or claim that a listing request was submitted on-chain.

## Next approval-gated boundary

Approval required: runtime listing submission beyond local queue/decision state or MarketRegistry admin mutation.

No further autonomous runtime listing submission or MarketRegistry admin behavior should start until Clonners explicitly approves the trust boundary. Any future approved slice must still begin with RED API/OpenAPI/docs/contract ratchets, remain metadata-only until local admin safety tests pass, and must not add listing-admin keys, real token addresses, wallets, RPC URLs, signing, broadcasts, deploys, transaction helpers, `MarketRegistry` mutation, or funds movement without a separate explicit approval.

---

This plan is design-only and approval-gated. It preserves `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, WQUAI/WQI/community-token framing, and the invariant that MarketRegistry metadata cannot move TradingVault balances or grant withdrawal/admin authority.
