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

## Terminal UI surface

Terminal UI exposure complete: `web/terminal-ui/src/fee-policy-panel.js` mirrors `GET /v1/fees` as read-only FeeManager metadata in the static terminal fixture. It renders `source: feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, `tradingVaultMutation: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Local API + terminal UI FeeManager fee schedule integration smoke complete (`local API + terminal UI FeeManager fee schedule integration smoke`): `web/terminal-ui/src/fee-policy-binding.js` reads `GET /v1/fees`, requires `source: feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, `tradingVaultMutation: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, no fee-authority runtime keys, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior before rendering the terminal FeeManager panel.

## Public WebSocket snapshot surface

Read-only FeeManager fee schedule WebSocket snapshot alignment complete: `/v1/ws?channel=fees` publishes public `fee_schedule_projection` snapshots with `source: feemanager-policy-projection`, `custody: public-read-only-no-custody`, and the same `FeeScheduleResponse` envelope as `GET /v1/fees`.

The stream snapshot remains metadata-only: `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, `tradingVaultMutation: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, no fee-authority runtime keys, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Terminal UI FeeManager fee schedule stream binding complete: `web/terminal-ui/src/live-fee-policy.js` consumes public `/v1/ws?channel=fees` snapshots, validates `source: feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, `tradingVaultMutation: false`, no fee-authority runtime keys, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior before rendering the live FeeManager fee schedule stream panel.

Local API + terminal UI FeeManager fee schedule stream integration smoke complete: `web/terminal-ui/src/fee-policy-stream-binding.js` reads `GET /v1/fees`, subscribes to `/v1/ws?channel=fees`, and renders only on REST + WebSocket agreement for `source: feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, `tradingVaultMutation: false`, no fee-authority runtime keys, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

TypeScript SDK and `qdex` CLI FeeManager fee schedule stream consumers complete: `dex.fees.openStream()` / `dex.fees.stream({ limit })` and `qdex stream fees` consume public `/v1/ws?channel=fees` snapshots with `fee_schedule_projection`, `public-read-only-no-custody`, `source: feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, `tradingVaultMutation: false`, no fee-authority runtime keys, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

## Next local/source-only surface

After the TypeScript SDK and `qdex` CLI FeeManager fee schedule stream consumer slice, the next bounded local/source-only slice is Python SDK FeeManager fee schedule stream consumers. Runtime fee updates, live fee authority keys, wallets, RPC URLs, signing, broadcasts, deploys, transaction helpers, real token addresses, and funds movement remain approval-gated.
