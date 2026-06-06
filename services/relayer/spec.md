# Relayer State Machine

The relayer is the boundary between deterministic off-chain matching and settlement truth. It consumes `FILL_PENDING_SETTLEMENT` events, accepts `submitFillPacket(FillPacket)`, validates that the fill is still settlement-safe, and records a lifecycle that can be projected to private WebSocket/API and later to public proof surfaces after confirmation.

The relayer does not hold custody, cannot withdraw user funds, and never creates final balances by itself. In mock mode it creates explicit mock settlement confirmations for the MVP. In real Quai mode, contract events are final truth and indexed settlement events replace mock confirmations.

## Scope

MVP scope:

- one market first: `QI-QUAI`
- spot fills produced by the matching engine
- one `FillPacket` per deterministic cross
- mock settlement first, real Quai contract submission later
- private settlement status for pending/failed/confirmed fills
- public fill/proof projection only after confirmed settlement

Out of scope:

- using real wallets, keys, seeds, recovery phrases, or funds in autonomous runs
- testnet/mainnet deployment without explicit approval
- withdrawals or any relayer-controlled fund movement outside valid settlement rules
- treating native Qi as an ERC-20 vault asset before a wrapper/adapter design exists
- cross-zone or bridge-dependent settlement for MVP

## Input contract

The matching engine emits:

```text
ORDER_MATCHED
FILL_PENDING_SETTLEMENT
```

`ORDER_MATCHED is not final settlement`; it only proves the matcher crossed two signed intents under deterministic priority rules. `FILL_PENDING_SETTLEMENT` is the only MVP trigger for relayer work.

Relayer API boundary:

```text
relayer.submitFillPacket(FillPacket)
```

`FillPacket is idempotent by fillId`. Re-submitting the same `fillId` with the same hash returns the existing lifecycle state. Re-submitting the same `fillId` with different payload bytes is a terminal conflict and must not create a second settlement attempt.

Minimum `FillPacket` fields:

```json
{
  "fillId": "fill-000001",
  "marketId": "QI-QUAI",
  "makerOrderHash": "0xmaker",
  "takerOrderHash": "0xtaker",
  "maker": "0x1111111111111111111111111111111111111111",
  "taker": "0x3333333333333333333333333333333333333333",
  "price": "123000000000000000",
  "amount": "1000000000000000000",
  "makerFee": "0",
  "takerFee": "0",
  "settlementMode": "mock"
}
```

Relayer lifecycle rows may keep private receive/validation timestamps for operations. `createdAt` can exist on private lifecycle rows, but `createdAt` is not a `FillPacket` field. `sourceEventId` is not a relayer input; the indexer adds it after `SETTLEMENT_CONFIRMED` when a mock or contract settlement event becomes public projection truth.

## State model

Each fill has exactly one relayer lifecycle row keyed by `fillId`.

| State | Meaning | Public proof visible? |
| --- | --- | --- |
| `received` | Relayer accepted a syntactically complete `FillPacket` and assigned a lifecycle row. | No |
| `validated` | Relayer verified market, replay-domain, fee cap, amount, price, order hashes, and settlement-mode preconditions. | No |
| `submitted` | Relayer submitted the fill to mock settlement or later broadcast a Quai settlement tx. | No |
| `confirmed` | Settlement succeeded; indexer/proof-service can project final fill/proof rows. | Yes |
| `failed_retryable` | Submission or confirmation failed due to a transient reason; retry policy may resubmit safely. | No |
| `failed_terminal` | Settlement is impossible or unsafe; no automatic retry. | No |

Allowed transitions:

```text
received -> validated
received -> failed_terminal
validated -> submitted
validated -> failed_retryable
validated -> failed_terminal
submitted -> confirmed
submitted -> failed_retryable
submitted -> failed_terminal
failed_retryable -> validated
failed_retryable -> submitted
```

Disallowed transitions:

- `confirmed` back to any mutable state
- `failed_terminal` back to retry without an explicit operator/admin repair flow
- any state that bypasses `validated` before submission
- any path that marks public trade/proof complete before `confirmed`

## Validation gates

Before `validated`, the relayer must check:

1. `fillId`, `marketId`, maker/taker order hashes, maker/taker addresses, price, amount, and fees are present.
2. `amount`, `price`, `makerFee`, and `takerFee` are decimal integer strings and non-negative where applicable.
3. The market exists and is enabled in the registry projection.
4. Both order hashes map to signed orders that are still valid for chain ID and settlement contract domain.
5. Cumulative filled amount cannot exceed either signed order amount.
6. Fees do not exceed the signed fee cap or configured hard cap.
7. Delegate/API-key permissions used to place the orders are trade/cancel scoped and include `NO_WITHDRAW`.
8. `market_ioc` orders retain signed IOC/slippage/price bounds.
9. `settlementMode` is explicitly `mock` or `quai`; no implicit default that could be mistaken for real settlement.

Validation may use API/indexer projections to reject obviously bad fills, but final success comes only from settlement confirmation. The relayer must not invent balance truth.

## Settlement modes

### Mock mode

Mock mode is for local MVP tests only. The lifecycle still uses settlement language, but every proof must say it is mock-only.

Submitted mock result shape:

```json
{
  "settlementMode": "mock",
  "mockSettlementReference": "mock-settlement-000001",
  "settlementTx": null,
  "blockNumber": null,
  "eventIndex": null,
  "explorerUrl": null,
  "status": "confirmed"
}
```

Rules:

- `settlementMode: mock` must be visible in API, proof, and terminal UI projections.
- `mockSettlementReference` is not a Quai transaction hash.
- `explorerUrl` is `null`; the UI must not link to a real explorer.
- No real funds move and no wallet is needed.
- Mock confirmation can emit `SETTLEMENT_CONFIRMED`, but the proof must remain labeled mock.

### Real Quai mode

Real Quai mode is approval-gated and not used by autonomous cron jobs.

Real Quai mode must reference settlementTx, blockNumber, eventIndex, and explorerUrl after confirmation. It also needs verified contract addresses, ABI/event signatures, chain ID, and a single-zone deployment decision from `docs/quai-tooling.md`.

Rules:

- A broadcast tx only moves a fill from `validated` to `submitted`; it is not final.
- A receipt alone is not enough if contract events are absent or reorg-unsafe.
- `confirmed` requires the indexed settlement event for the fill.
- Contract events are final truth; DB/API state is projection/cache.
- Reorg handling belongs to the indexer/projection layer, but the relayer must surface when confirmation is not final enough for public proof projection.

## Event log

The relayer emits append-only events. Corrections are new events, never mutation without trace.

### RELAYER_RECEIVED

```json
{
  "type": "RELAYER_RECEIVED",
  "payload": {
    "fillId": "fill-000001",
    "fillPacketHash": "0xhash",
    "sourceEvent": "FILL_PENDING_SETTLEMENT",
    "state": "received"
  }
}
```

### RELAYER_VALIDATED

```json
{
  "type": "RELAYER_VALIDATED",
  "payload": {
    "fillId": "fill-000001",
    "state": "validated",
    "checked": ["market", "replay_domain", "fees", "delegate_NO_WITHDRAW", "partial_fill_caps"]
  }
}
```

### RELAYER_SUBMITTED

```json
{
  "type": "RELAYER_SUBMITTED",
  "payload": {
    "fillId": "fill-000001",
    "state": "submitted",
    "settlementMode": "mock",
    "mockSettlementReference": "mock-settlement-000001",
    "settlementTx": null
  }
}
```

### SETTLEMENT_CONFIRMED

```json
{
  "type": "SETTLEMENT_CONFIRMED",
  "payload": {
    "fillId": "fill-000001",
    "state": "confirmed",
    "settlementMode": "mock",
    "mockSettlementReference": "mock-settlement-000001",
    "settlementTx": null,
    "blockNumber": null,
    "eventIndex": null,
    "explorerUrl": null
  }
}
```

### SETTLEMENT_FAILED_RETRYABLE

```json
{
  "type": "SETTLEMENT_FAILED_RETRYABLE",
  "payload": {
    "fillId": "fill-000001",
    "state": "failed_retryable",
    "reason": "rpc_timeout",
    "nextRetryAt": 1780000060
  }
}
```

### SETTLEMENT_FAILED_TERMINAL

```json
{
  "type": "SETTLEMENT_FAILED_TERMINAL",
  "payload": {
    "fillId": "fill-000001",
    "state": "failed_terminal",
    "reason": "fee_cap_exceeded"
  }
}
```

## Projection contract

Private WebSocket/API can show every state transition:

```text
private WebSocket/API settlements stream
  -> received
  -> validated
  -> submitted
  -> confirmed | failed_retryable | failed_terminal
```

Public trade/proof projection waits for confirmed settlement. After `SETTLEMENT_CONFIRMED`, the projection flow is:

```text
SETTLEMENT_CONFIRMED
  -> indexer.fill_projected
  -> proof.TradeProof.created
  -> GET /v1/fills includes confirmed fill
  -> GET /v1/proofs/trades/:tradeId returns proof
```

For compatibility with the matching spec, proof projection can also be described as `TradeProof.created` in event names. Public rows must not be built from `ORDER_MATCHED` alone.

## Retry policy

Retryable examples:

- RPC timeout before tx acceptance is known
- temporary fee-estimation failure
- temporary indexer lag before confirmation
- mock test harness timeout

Terminal examples:

- duplicate `fillId` with a conflicting payload hash
- fee cap exceeded
- invalid or expired signed order domain
- market disabled before validation
- cumulative partial fill would exceed signed amount
- delegate lacks `NO_WITHDRAW` trade/cancel-only permissions
- contract revert that proves the fill cannot settle as signed

Retry rules:

1. Retries reuse the same `fillId` and `fillPacketHash`.
2. Retries must not submit a mutated FillPacket.
3. Unknown tx outcome must be reconciled before resubmission in real Quai mode.
4. A terminal failure is visible to private APIs and cannot be hidden by deleting the row.

## Invariants

- The relayer is not custody and does not withdraw.
- The relayer cannot withdraw user funds.
- The relayer does not hold custody.
- `FillPacket is idempotent by fillId`.
- `ORDER_MATCHED is not final settlement`.
- Public fill/proof rows are settlement-derived projections.
- Public trade/proof projection waits for confirmed settlement.
- Every pending fill reaches `confirmed`, `failed_retryable`, or `failed_terminal`.
- Mock settlement is always labeled with `settlementMode: mock` and `mockSettlementReference`.
- Real Quai mode must reference settlementTx, blockNumber, eventIndex, and explorerUrl.
- Contract events are final truth once Quai settlement is live.
- No relayer event grants API/delegate keys withdrawal authority.
