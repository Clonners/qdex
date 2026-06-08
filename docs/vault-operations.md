# TradingVault Deposit/Withdrawal Prepare Boundary

This document pins the first owner-wallet-only prepare boundary for moving value into or out of the future `TradingVault`. It is intentionally not a live transaction flow.

## API surface

```text
POST /v1/vault/deposits/prepare
POST /v1/vault/withdrawals/prepare
```

Both endpoints are an owner-wallet-only prepare-only boundary. They return HTTP `501` with `source: owner-wallet-vault-operation-placeholder` until an explicitly approved wallet/signing/broadcast design exists.

Required safety fields in the placeholder envelope:

```text
ownerAuthorization: owner-wallet-required
permissions: NO_WITHDRAW, NO_ADMIN
realQuaiTransactions: false
walletRequired: false
fundsMoved: false
tradingVaultMutation: false
```

## Custody rules

- Deposits and withdrawals are main-owner-wallet actions in the real system.
- Delegate/API keys cannot deposit or withdraw by default.
- Delegate/API keys keep `NO_WITHDRAW` and `NO_ADMIN` in every related response.
- The placeholder never creates a signature, transaction, relayer job, or vault mutation.
- No admin/operator withdrawal path is introduced by this surface.

## Explicit non-goals for this slice

This boundary performs no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds movement.

It also does not:

- read or store wallet material,
- load a relayer key,
- infer real token addresses,
- claim a real Quai transaction,
- mutate `TradingVault`,
- move user funds,
- grant delegate withdrawal/admin authority.

## Future approval gate

A later real Quai deposit/withdrawal flow needs explicit Clonners approval plus:

1. owner-wallet signing design,
2. TradingVault contract address evidence,
3. token/listing evidence from the listed-asset flow,
4. event-truth indexing for `Deposit` and `Withdraw`,
5. UI/API proof copy that separates prepare state from confirmed contract event truth.

Until then, the API is documentation/discovery only and stays `prepare-only-not-implemented`.
