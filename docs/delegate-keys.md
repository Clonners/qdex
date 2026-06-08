# Delegate/API Key Boundary

Delegate/API keys are the bot-safe automation surface for QDEX. They can read state and, once owner-approved, may place or cancel orders within market, notional, expiry, and permission constraints. They are not custody keys and are not admin keys.

## Current local surfaces

Current safe delegate/API key surfaces are local/source-only:

```text
GET /v1/delegate-keys
GET /v1/delegate-keys/registrations
GET /v1/delegate-keys/revocations
POST /v1/delegate-keys
DELETE /v1/delegate-keys/{keyId}
```

`GET /v1/delegate-keys` returns read-only `delegate-key-registry-projection` metadata with empty local rows until event evidence exists. `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations` return read-only `delegatekeyregistry-event-projection` history envelopes backed by the event projection schema. `POST /v1/delegate-keys` and `DELETE /v1/delegate-keys/{keyId}` intentionally return owner-signed `501` prepare placeholders with `source: delegate-key-owner-signed-prepare-boundary`, `operationStatus: prepare-only-owner-signed-required`, and `ownerAuthorization: owner-wallet-signature-required`.

Bot/operator clients already expose the prepare boundary without claiming a live registry mutation:

- TypeScript SDK `delegateKeys.prepareRegister()` / `delegateKeys.prepareRevoke()`
- Python SDK `delegate_keys.prepare_register()` / `delegate_keys.prepare_revoke()`
- `qdex api create-key --prepare` / `qdex api revoke-key --prepare`
- terminal UI prepare-only delegate/API key panel
- local API + terminal UI delegate/API key prepare smoke

## Permission invariants

Every delegate/API key surface must preserve:

```text
READ_ONLY
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
NO_WITHDRAW
NO_ADMIN
delegateCanWithdraw: false
delegateCanAdmin: false
```

There is intentionally no positive `WITHDRAW` or `ADMIN` delegate permission in the MVP interface.

Delegate/API keys must not deposit, withdraw, mutate TradingVault balances, change MarketRegistry authority, change FeeManager policy, or run owner-only nonce/registry flows unless a separate explicit high-trust owner path is approved.

## Owner-signed approval gate

The post-delegate-key owner-signed readiness plan is pinned in `docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md`. It maps the completed read-only and prepare-only delegate/API key surfaces to the approval gate before any wallet/RPC/signing/broadcast/deploy/tx/funds behavior or live `DelegateKeyRegistry` mutation.

A future executable owner-signed delegate-key registration/revocation path requires explicit Clonners approval plus:

1. verified `DelegateKeyRegistry` contract address evidence,
2. verified `DelegateKeyRegistered` and `DelegateKeyRevoked` event evidence,
3. owner-wallet signing UX that does not expose key material to bots or local config,
4. event-truth indexing before confirmed UI/API state,
5. proof/UI copy that separates prepare-only state from confirmed registry event truth,
6. contract tests proving `NO_WITHDRAW` and `NO_ADMIN` remain mandatory.

## Read-only DelegateKeyRegistry event projections

The read-only DelegateKeyRegistry `DelegateKeyRegistered`/`DelegateKeyRevoked` projection schema is now pinned in `services/indexer/schema.md` and `docs/api-openapi.yaml`.

Those event-truth rows only define how future registry evidence is displayed; they are not owner-signed mutation authority:

```text
DelegateKeyRegisteredProjection
DelegateKeyRevokedProjection
source: delegatekeyregistry-event-projection
eventName: DelegateKeyRegistered | DelegateKeyRevoked
settlementMode: mock | quai_contract
mock rows keep settlementTx/blockNumber/blockHash/eventIndex/explorerUrl null
real rows require settlementTx, blockNumber, blockHash, eventIndex, explorerUrl
permissions: READ_ONLY, PLACE_ORDER, CANCEL_ORDER, CANCEL_ALL, NO_WITHDRAW, NO_ADMIN
delegateCanWithdraw: false
delegateCanAdmin: false
fundsMovedByProjection: false
tradingVaultMutationByProjection: false
delegateKeyRegistryMutationByProjection: false
```

`DelegateKeyRegisteredProjection` carries `owner`, `delegate`, `expiresAt`, `allowedMarketsHash`, `maxNotional`, and the indexed permission snapshot. `DelegateKeyRevokedProjection` carries `owner`, `delegate`, `revoked: true`, and the same safety/evidence envelope.

The projection schema is local/source-only and read-only. It preserves event-truth rows only and must not load wallets, read RPC URLs, sign, broadcast, deploy, submit transactions, mutate a live `DelegateKeyRegistry`, mutate TradingVault balances, or move funds. In short: no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement.

## Read-only DelegateKeyRegistry history API

The read-only history API envelopes are now wired for the projection schema:

```text
GET /v1/delegate-keys/registrations
GET /v1/delegate-keys/revocations
source: delegatekeyregistry-event-projection
projectionType: DelegateKeyRegisteredProjection | DelegateKeyRevokedProjection
eventName: DelegateKeyRegistered | DelegateKeyRevoked
settlementMode: mock
settlementTx: null
blockNumber: null
blockHash: null
eventIndex: null
explorerUrl: null
permissions: READ_ONLY, NO_WITHDRAW, NO_ADMIN
delegateCanWithdraw: false
delegateCanAdmin: false
fundsMoved: false
tradingVaultMutation: false
delegateKeyRegistryMutation: false
```

Empty registration/revocation arrays are valid local/mock state until real `DelegateKeyRegistry` event evidence exists. These envelopes are projection/cache surfaces only: no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement.

Completed local/source-only clients: TypeScript SDK `delegateKeys.listRegistrations()` / `delegateKeys.listRevocations()`, Python SDK `delegate_keys.list_registrations()` / `delegate_keys.list_revocations()`, and `qdex api registrations` / `qdex api revocations` now consume these read-only history endpoints, still treating empty mock rows as valid state and without wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed terminal UI panel: `web/terminal-ui/src/delegate-key-history-panel.js` and the static renderer now display the same read-only `delegatekeyregistry-event-projection` envelopes for `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`, preserving `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, mock-null evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Next local/source-only step: local API + terminal UI delegate-key history integration smoke for those registration/revocation envelopes, with no live `DelegateKeyRegistry` mutation and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
