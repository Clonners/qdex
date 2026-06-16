# NonceManager Cancellation Prepare Boundary

This document pins the first owner-signed prepare boundary for cancelling nonces in the future `NonceManager`. It is intentionally not a live transaction flow.

## API surface

```text
POST /v1/nonces/cancel
```

The endpoint is an owner-signed prepare-only boundary. It returns HTTP `501` with `source: owner-signed-nonce-cancel-placeholder` until an explicitly approved wallet/signing/broadcast design exists.

Required safety fields in the placeholder envelope:

```text
ownerAuthorization: owner-signed-required
permissions: NO_WITHDRAW, NO_ADMIN
realQuaiTransactions: false
walletRequired: false
fundsMoved: false
tradingVaultMutation: false
nonceManagerMutation: false
approvalGate: explicit-approval-required-before-wallet-signing-or-quai-broadcast
```

## Custody rules

- Nonce cancellation is a main-owner-wallet action in the real system.
- Delegate/API keys cannot cancel nonces by default.
- Delegate/API keys keep `NO_WITHDRAW` and `NO_ADMIN` in every related response.
- The placeholder never creates a signature, transaction, relayer job, or NonceManager mutation.
- No admin/operator nonce-cancel path is introduced by this surface.

## Explicit non-goals for this slice

This boundary performs no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds movement.

It also does not:

- read or store wallet material,
- load a relayer key,
- infer real token addresses,
- claim a real Quai transaction,
- mutate `NonceManager`,
- move user funds,
- grant delegate nonce-cancel authority.

## Future approval gate

A later real Quai nonce cancellation flow needs explicit Clonners approval plus:

1. owner-wallet signing design,
2. NonceManager contract address evidence,
3. verified source/interface evidence for `NonceCancelled` and `NonceRangeCancelled`,
4. event-truth indexing for `NonceCancelled` and `NonceRangeCancelled`,
5. UI/API proof copy that separates prepare state from confirmed contract event truth.

Until then, the API is documentation/discovery only and stays `prepare-only-not-implemented`.

## Post-nonce-cancel readiness

The post-nonce-cancel owner-signed readiness plan is pinned in `docs/plans/2026-06-08-post-nonce-cancel-owner-signed-readiness.md`. It maps the completed prepare-only nonce cancellation surfaces to the explicit owner-signed approval gate without adding wallet behavior.

## Read-only NonceManager event projections

The read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` projection schema ratchet is now pinned in `services/indexer/schema.md` and `docs/api-openapi.yaml` before any owner-signed transaction behavior exists.

Projection row names:

```text
NonceCancelledProjection
NonceRangeCancelledProjection
```

Required projection rules:

- event-truth rows only: `NonceCancelled` creates `NonceCancelledProjection`; `NonceRangeCancelled` creates `NonceRangeCancelledProjection`.
- mock rows keep settlementTx/blockNumber/blockHash/eventIndex/explorerUrl null and must remain visibly mock/local-only.
- real rows require settlementTx, blockNumber, blockHash, eventIndex, explorerUrl before any future confirmed nonce cancellation history display.
- every row carries `READ_ONLY`, `NO_WITHDRAW`, and `NO_ADMIN`.
- projection rows are read models only; they do not create wallet requests, submit transactions, mutate `NonceManager`, or move funds.

This projection schema preserves no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, NonceManager mutation, or funds movement.

## Read-only nonce cancellation history API

The read-only nonce cancellation history API now exposes event-shaped history envelopes without owner-signed behavior:

```text
GET /v1/nonces/cancellations
```

Every response is a local/source-only projection envelope backed by the projection schemas:

```text
source: nonce-manager-event-projection
projectionType: NonceCancelledProjection | NonceRangeCancelledProjection
settlementMode: mock
settlementTx: null
blockNumber: null
blockHash: null
eventIndex: null
explorerUrl: null
permissions: READ_ONLY, NO_WITHDRAW, NO_ADMIN
realQuaiTransactions: false
walletRequired: false
fundsMoved: false
nonceManagerMutation: false
tradingVaultMutation: false
```

The history endpoint may return empty local/mock arrays until real event evidence exists. It is a read-only projection/cache surface and preserves no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, NonceManager mutation, or funds movement.

no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, NonceManager mutation, or funds movement.
