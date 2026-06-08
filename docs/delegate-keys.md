# Delegate/API Key Boundary

Delegate/API keys are the bot-safe automation surface for QDEX. They can read state and, once owner-approved, may place or cancel orders within market, notional, expiry, and permission constraints. They are not custody keys and are not admin keys.

## Current local surfaces

Current safe delegate/API key surfaces are local/source-only:

```text
GET /v1/delegate-keys
POST /v1/delegate-keys
DELETE /v1/delegate-keys/{keyId}
```

`GET /v1/delegate-keys` returns read-only `delegate-key-registry-projection` metadata with empty local rows until event evidence exists. `POST /v1/delegate-keys` and `DELETE /v1/delegate-keys/{keyId}` intentionally return owner-signed `501` prepare placeholders with `source: delegate-key-owner-signed-prepare-boundary`, `operationStatus: prepare-only-owner-signed-required`, and `ownerAuthorization: owner-wallet-signature-required`.

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

## Next local/source-only projection boundary

The next safe local/source-only slice is a read-only DelegateKeyRegistry `DelegateKeyRegistered`/`DelegateKeyRevoked` projection schema ratchet.

That schema should define event-shaped rows such as:

```text
DelegateKeyRegisteredProjection
DelegateKeyRevokedProjection
source: delegatekeyregistry-event-projection
eventName: DelegateKeyRegistered | DelegateKeyRevoked
settlementMode: mock | quai_contract
mock rows set settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl to null
real rows require settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl
permissions: READ_ONLY, NO_WITHDRAW, NO_ADMIN
```

The projection schema is read-only metadata. It must not load wallets, read RPC URLs, sign, broadcast, deploy, submit transactions, mutate a live registry, mutate TradingVault balances, or move funds.
