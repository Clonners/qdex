# Matching Engine Command Boundary

This document defines the MVP boundary between `POST /v1/orders`, the off-chain matcher, the relayer, mock settlement, and the indexer/proof projection.

The matcher is an execution-intent router, not a custodian. It stores signed order intent, applies deterministic price-time priority, emits fill candidates, and hands `FillPacket` objects to settlement. Contract events or mock settlement confirmations remain the source of final balances/fills; API state is projection/cache, and matching-engine balances are not final truth.

## Scope

MVP scope:

- single market: `QI-QUAI`
- spot only
- signed/mock orders using the canonical `SignedOrder` shape from `docs/order-schema.md`
- deterministic matching with price-time priority
- partial fills
- market orders modeled as `market_ioc` limit orders with slippage/price bounds
- mock settlement first, Quai contract settlement later

Out of scope for this boundary:

- withdrawals
- margin/leverage/perps
- cross-zone/cross-chain settlement
- treating native Qi as an ERC-20 vault asset without an adapter design
- any admin/operator path that can move user funds

## Command envelope

Every command is append-only and sequenced by the API gateway before it reaches the matcher.

```json
{
  "commandId": "cmd-000001",
  "sequence": 1,
  "type": "PLACE_ORDER",
  "receivedAt": 1780000000,
  "source": "api",
  "payload": {}
}
```

Rules:

- `sequence` is strictly increasing inside one matching-engine instance.
- Replaying the same command log from the same snapshot must produce the same event log.
- `commandId` is idempotency metadata; `orderHash` is the canonical identity for order intent.
- The matcher may reject commands but must not mutate state silently.

## Commands

### PLACE_ORDER

Accepts one canonical `SignedOrder` payload.

```json
{
  "commandId": "cmd-000001",
  "sequence": 1,
  "type": "PLACE_ORDER",
  "payload": {
    "order": {
      "marketId": "QI-QUAI",
      "side": "buy",
      "type": "limit",
      "amount": "1000000000000000000",
      "price": "123000000000000000",
      "timeInForce": "GTC",
      "maxSlippageBps": 0,
      "owner": "0x1111111111111111111111111111111111111111",
      "delegate": "0x0000000000000000000000000000000000000000",
      "nonce": "1",
      "expiresAt": 1780003600,
      "chainId": 0,
      "settlementContract": "0x2222222222222222222222222222222222222222",
      "signature": { "scheme": "mock", "signer": "0x1111111111111111111111111111111111111111", "value": "0xmock-signature" }
    }
  }
}
```

Validation before book mutation:

1. `marketId` exists and is enabled in the registry projection.
2. `amount`, `price`, `nonce`, `chainId`, and `settlementContract` are present.
3. `expiresAt` is in the future relative to matcher time.
4. `signature.signer` is either `owner` or an approved delegate projection.
5. Delegate/API key permissions are trade/cancel only and include `NO_WITHDRAW`.
6. `market_ioc` orders use `timeInForce = IOC` and carry signed price/slippage protection.
7. No cumulative fill can exceed the signed order `amount`.

On success, the matcher emits `ORDER_ACCEPTED`, then tries to cross the order. Resting residual quantity emits/open state only when time-in-force permits it.

### CANCEL_ORDER

Cancels one open order by `orderHash`.

```json
{
  "type": "CANCEL_ORDER",
  "payload": {
    "orderHash": "0xmaker",
    "requestedBy": "0x1111111111111111111111111111111111111111"
  }
}
```

Rules:

- `requestedBy` must be the owner or an approved cancel delegate.
- Cancellation is matcher-local until the nonce is cancelled on-chain by a later contract flow.
- Filled quantity remains immutable; only remaining open quantity can be cancelled.

### CANCEL_ALL

Cancels all open orders for one owner/delegate and optional market.

```json
{
  "type": "CANCEL_ALL",
  "payload": {
    "owner": "0x1111111111111111111111111111111111111111",
    "marketId": "QI-QUAI"
  }
}
```

Rules:

- The command never withdraws or moves funds.
- It emits one `ORDER_CANCELLED` event per affected order plus a command-level summary.

### SNAPSHOT

Requests a deterministic snapshot of current open order state.

```json
{
  "type": "SNAPSHOT",
  "payload": {
    "reason": "cron-checkpoint"
  }
}
```

Snapshot contains:

- last applied command sequence
- market IDs
- open order queue state
- cumulative filled amounts by `orderHash`
- pending settlement fill IDs
- deterministic state hash

Snapshot does not contain private keys, wallet secrets, or withdrawal authority.

### RESTORE

Restores from a snapshot and resumes command replay after `lastAppliedSequence`.

```json
{
  "type": "RESTORE",
  "payload": {
    "snapshotId": "snapshot-000001",
    "lastAppliedSequence": 123
  }
}
```

Rules:

- Restore must verify the snapshot state hash before accepting new commands.
- A restored matcher must reproduce the same `ORDER_MATCHED` and `FILL_PENDING_SETTLEMENT` events for replayed commands.
- Pending settlement state is recovered as pending, never assumed confirmed.

## Deterministic matching rules

1. Sort bids by highest price, then oldest accepted sequence.
2. Sort asks by lowest price, then oldest accepted sequence.
3. A buy crosses when `buy.price >= sell.price`.
4. The maker price determines execution price unless the later engine adapter documents another deterministic rule.
5. Fill amount is `min(buy.remainingAmount, sell.remainingAmount)`.
6. Update cumulative filled amount for both `orderHash` values.
7. Remove a resting order when remaining amount is zero, expired, cancelled, or IOC residual.
8. Emit events in this order: `ORDER_ACCEPTED` -> zero or more `ORDER_MATCHED` -> zero or more `FILL_PENDING_SETTLEMENT` -> optional residual/cancel events.

The matcher may maintain pre-trade available-balance projections to reduce invalid orders, but settlement remains authoritative. A projected balance cannot create custody, cannot withdraw, and cannot be used as final truth.

## FillPacket handoff

Every deterministic match creates a settlement candidate:

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

`createdAt` belongs only to matcher event envelopes or private audit logs, not to the `FillPacket` handoff. `sourceEventId` is added only after settlement confirmation, when the indexer projects a mock or contract settlement event into public fill/proof rows.

Handoff contract:

```text
matching engine -> FILL_PENDING_SETTLEMENT -> relayer.submitFillPacket(FillPacket)
relayer -> mock settlement confirmed -> indexer/proof projection
```

A pending fill can be visible in private API streams as `pending_settlement`, but public trade/proof projection should wait for settlement confirmation. Later, real Quai contract events replace mock settlement confirmations.

## Failure behavior

Reject with `ORDER_REJECTED` when:

- market is unknown/disabled
- order expired
- signature/delegate projection is invalid
- delegate lacks trade/cancel scope or is not `NO_WITHDRAW`
- replay domain fields are missing
- `market_ioc` has no slippage/price bounds
- precision/min amount constraints fail
- command is duplicate with conflicting payload

Never reject by silently dropping the command.

## Invariants

- Matching is deterministic from command log + snapshot.
- `SignedOrder` is the only accepted order-intent shape.
- `orderHash` is stable and excludes projection fields.
- API/delegate keys default to `NO_WITHDRAW` and cannot withdraw funds.
- `market_ioc` orders are IOC limit orders with signed slippage/price bounds.
- `FillPacket` is the only handoff from matcher to relayer in the MVP.
- Every pending fill must reach either confirmed or failed settlement status.
- Contract events are final truth; API state is projection/cache.
- matching-engine balances are not final truth.
