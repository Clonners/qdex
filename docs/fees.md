# FeeManager Fee Policy

`GET /v1/fees` exposes the local/source-only FeeManager policy projection used by API, SDK, CLI, and terminal surfaces before any real Quai contract deployment.

## Read-only API envelope

The current response is metadata only:

```text
source: feemanager-policy-projection
status: local-only-not-deployed
custody: non-custodial-fee-policy
permissions: READ_ONLY, NO_WITHDRAW, NO_ADMIN
hardMaxFeeBps: 1000
feeRecipient: null
feeManagerMutation: false
tradingVaultMutation: false
realQuaiTransactions: false
walletRequired: false
fundsMoved: false
```

The `feeSchedules` array currently contains a mock/local `QI-QUAI` row shaped as `FeeScheduleProjection`:

```text
marketId: QI-QUAI
projectionType: FeeScheduleProjection
eventName: FeesUpdated
makerFeeBps: 0
takerFeeBps: 0
maxFeeBps: 1000
feeRecipient: null
settlementMode: mock
settlementTx: null
blockNumber: null
blockHash: null
eventIndex: null
explorerUrl: null
```

Empty or zero-fee mock/local schedules are valid until real event evidence exists. Real Quai fee rows must be backed by `FeeManager` event truth such as `FeesUpdated` and `FeeRecipientUpdated`, with `settlementTx`, `blockNumber`, `blockHash`, `eventIndex`, and `explorerUrl` populated by the indexer/proof plane.

## Safety boundary

This surface is read-only. It performs no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, fee-authority runtime keys, TradingVault mutation, or funds movement.

The fee metadata cannot grant withdrawal/admin power. Delegate/API keys remain `NO_WITHDRAW` and `NO_ADMIN`, and fee policy visibility does not create a `FeeManager.updateFees` runtime path.

## Next local/source-only surface

After this API envelope, the bounded client slice is TypeScript/Python SDK plus `qdex` CLI read-only consumers for `GET /v1/fees`. Runtime fee updates, live fee authority keys, wallets, RPC URLs, signing, broadcasts, deploys, transaction helpers, real token addresses, and funds movement remain approval-gated.
