# Matching Engine Events

The matching engine emits an append-only event log derived from sequenced commands. The event log drives API/WebSocket projections, relayer submission, mock settlement, and later Quai contract settlement.

Events describe matcher decisions only. Final fill truth comes from settlement confirmation; contract events are final truth once real Quai contracts replace mock settlement.

## Event envelope

```json
{
  "eventId": "evt-000001",
  "sequence": 1,
  "commandId": "cmd-000001",
  "type": "ORDER_ACCEPTED",
  "createdAt": 1780000001,
  "payload": {}
}
```

Rules:

- `sequence` is strictly increasing and deterministic.
- `eventId` is unique in the matcher event log.
- `commandId` links every event to the command that caused it.
- Events are append-only; corrections use new events.

## ORDER_ACCEPTED

Emitted after a `PLACE_ORDER` command passes signature, replay-domain, market, precision, expiry, and delegate-permission checks.

```json
{
  "type": "ORDER_ACCEPTED",
  "payload": {
    "orderHash": "0xaccepted",
    "marketId": "QI-QUAI",
    "owner": "0x1111111111111111111111111111111111111111",
    "delegate": "0x0000000000000000000000000000000000000000",
    "side": "buy",
    "type": "limit",
    "amount": "1000000000000000000",
    "price": "123000000000000000",
    "filledAmount": "0",
    "remainingAmount": "1000000000000000000",
    "status": "accepted"
  }
}
```

Projection use:

- private `orders` stream: show accepted/open intent
- `GET /v1/orders`: cache accepted order by owner/delegate
- audit log: prove the matcher did not mutate state before acceptance

## ORDER_REJECTED

Emitted when a command is valid JSON but violates matcher preconditions.

```json
{
  "type": "ORDER_REJECTED",
  "payload": {
    "clientOrderId": "bot-order-001",
    "marketId": "QI-QUAI",
    "reason": "market_ioc_requires_slippage_bound",
    "message": "market_ioc orders must include signed price/slippage protection"
  }
}
```

Common reasons:

- `market_disabled`
- `order_expired`
- `invalid_signature`
- `delegate_missing_place_order_permission`
- `delegate_must_be_NO_WITHDRAW`
- `missing_replay_domain`
- `market_ioc_requires_slippage_bound`
- `precision_or_min_amount_failed`

Rejected events do not move funds and do not create `FillPacket` objects.

## ORDER_MATCHED

Emitted for each deterministic cross before settlement handoff.

```json
{
  "type": "ORDER_MATCHED",
  "payload": {
    "matchId": "match-000001",
    "marketId": "QI-QUAI",
    "makerOrderHash": "0xmaker",
    "takerOrderHash": "0xtaker",
    "makerSide": "sell",
    "takerSide": "buy",
    "price": "123000000000000000",
    "amount": "1000000000000000000",
    "makerRemainingAmount": "0",
    "takerRemainingAmount": "0"
  }
}
```

Projection use:

- internal audit: reconstruct price-time priority decisions
- private order stream: update pending fill/remaining amount
- no public trade row yet; settlement has not confirmed

## FILL_PENDING_SETTLEMENT

Emitted immediately after `ORDER_MATCHED` with a `FillPacket` suitable for relayer submission.

```json
{
  "type": "FILL_PENDING_SETTLEMENT",
  "payload": {
    "fillPacket": {
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
    },
    "next": "relayer.submitFillPacket"
  }
}
```

Do not copy matcher-local timestamps into `payload.fillPacket`; `sourceEventId` comes from the settlement/indexer event once confirmation is projected.

Handoff:

```text
FILL_PENDING_SETTLEMENT
  -> relayer.submitFillPacket(FillPacket)
  -> mock settlement confirmed
  -> indexer projects fill/proof
  -> API returns GET /v1/fills and GET /v1/proofs/trades/{tradeId}
```

Every FillPacket must be traceable to a proof projection. In the MVP, the proof references a mock settlement confirmation. In Quai testnet/production, the proof references a settlement transaction, block number, event index, and explorer URL.

## ORDER_CANCELLED

Emitted when `CANCEL_ORDER`, `CANCEL_ALL`, expiry, or IOC residual removal closes remaining open quantity.

```json
{
  "type": "ORDER_CANCELLED",
  "payload": {
    "orderHash": "0xmaker",
    "marketId": "QI-QUAI",
    "reason": "cancel_order",
    "filledAmount": "400000000000000000",
    "cancelledAmount": "600000000000000000"
  }
}
```

Cancellation affects only matcher-open quantity. Nonce cancellation on-chain is a separate user-signed contract operation and is not implied by a matcher cancel event.

## Settlement/proof lifecycle

Matcher events stop at pending settlement. The next planes append their own events/projections:

```text
ORDER_MATCHED
FILL_PENDING_SETTLEMENT
relayer.received
relayer.validated
relayer.submitted
settlement.confirmed
indexer.fill_projected
proof.TradeProof.created
```

A `TradeProof` must include:

- trade ID
- maker/taker order hashes
- settlement transaction or mock settlement reference
- block number and event index when on-chain
- market
- price
- amount
- fees
- explorer URL when on-chain
- raw event/receipt payload

## Failure lifecycle

If mock settlement or later Quai settlement fails, the relayer/indexer must expose a terminal or retryable settlement status. The matcher should not pretend a failed settlement is a completed public trade.

```text
FILL_PENDING_SETTLEMENT -> settlement.failed_retryable | settlement.failed_terminal
```

Private APIs can show pending/failed status. Public trade and proof APIs should only show confirmed settlement rows.

## Invariants

- Event ordering is deterministic for replay.
- `ORDER_MATCHED` never by itself means final settlement.
- `FILL_PENDING_SETTLEMENT` is the only MVP trigger for relayer submission.
- Every `FILL_PENDING_SETTLEMENT` contains one complete `FillPacket`.
- Every FillPacket must be traceable to a proof projection.
- Public fill/proof rows are settlement-derived projections.
- contract events are final truth once Quai settlement is live.
- Delegate/API key events never grant withdrawal authority.
