# Proof Service Contract

The proof service is the read-side boundary between the indexer projection model and public proof routes. It does not match orders, submit transactions, hold custody, sign messages, or grant delegate permissions.

Core truth:

```text
contract events are final truth; DB is cache/projection
Public trade/proof projection waits for confirmed settlement
```

## Route contract

```http
GET /v1/proofs/trades/:tradeId
```

Success response shape:

```json
{
  "tradeId": "trade-000001",
  "source": "proof-service-indexer-projection",
  "custody": "non-custodial-no-withdrawal-authority",
  "proof": {
    "tradeId": "trade-000001",
    "fillId": "fill-000001",
    "orderHashes": ["0xmaker", "0xtaker"],
    "settlementMode": "mock",
    "mockSettlementReference": "mock-settlement-fill-000001",
    "settlementTx": null,
    "blockNumber": null,
    "blockHash": null,
    "eventIndex": 0,
    "maker": "0x1111111111111111111111111111111111111111",
    "taker": "0x3333333333333333333333333333333333333333",
    "market": "QI-QUAI",
    "price": "5",
    "amount": "100",
    "fees": {
      "maker": "0",
      "taker": "0"
    },
    "explorerUrl": null,
    "safetyNotice": "Mock proof only: no real Quai transaction, no explorer URL, no funds moved.",
    "rawEvent": {
      "eventId": "event-000001",
      "type": "SETTLEMENT_CONFIRMED",
      "source": "mock-settlement",
      "fillId": "fill-000001",
      "settlementMode": "mock",
      "mockSettlementReference": "mock-settlement-fill-000001",
      "settlementTx": null,
      "blockNumber": null,
      "blockHash": null,
      "eventIndex": 0
    },
    "createdFromEventId": "event-000001"
  }
}
```

Not-found response shape:

```json
{
  "error": "proof_not_found",
  "tradeId": "trade-000001",
  "proof": null,
  "source": "proof-service-indexer-projection",
  "custody": "non-custodial-no-withdrawal-authority",
  "message": "No indexed settlement proof exists for this trade yet."
}
```

## Source event rules

The proof service reads only from indexed proof rows. It may include a raw source event snapshot for user inspection, but that snapshot is evidence, not mutable execution state.

A public proof may be created only after a confirmed `SETTLEMENT_CONFIRMED` source event has been accepted by the indexer projection policy.

- Mock settlement source event rows are allowed for local MVP loops only.
- Real Quai proof rows must be derived from settlement contract events after finality/reorg policy accepts the block.
- `ORDER_MATCHED` is never enough for a public proof.
- Pending, submitted, retryable, or failed relayer states may be private account status, not a public proof.

## Mock proof rules

Mock proofs are local development evidence only:

```text
settlementMode: mock
mockSettlementReference is present
settlementTx = null
blockNumber = null
blockHash = null
explorerUrl = null
```

Mock proof copy must explicitly say: no real Quai transaction, no explorer URL, no funds moved. `mockSettlementReference` is an internal deterministic reference, not a transaction hash.

## Real Quai proof rules

Real production/testnet proof mode is `quai_contract`. Real Quai proofs require `settlementTx, blockNumber, eventIndex, and explorerUrl` before public projection. They should also include `blockHash`, contract address inside the raw event, and enough ABI/event data for a human to verify the proof on Quaiscan or the selected Quai explorer.

Real proof rows are reorg-sensitive until the indexer's `finalityDepth` policy marks them displayable. If a reorg supersedes a proof, the API must mark the old proof superseded rather than silently pretending it never existed.

## Owner-signed nonce-cancel proof rows

The proof service also exposes an internal read contract for future owner-signed NonceManager cancellation proof rows:

```text
getNonceCancellationProof(proofId) -> NonceCancellationProof | nonce_cancellation_proof_not_found
```

Accepted source events and normalized event types:

```text
NonceCancelled -> NONCE_CANCEL_CONFIRMED
NonceRangeCancelled -> NONCE_RANGE_CANCEL_CONFIRMED
```

`NonceCancellationProof` rows prove that an owner-signed NonceManager cancellation event was indexed. They are separate from trade proofs and a nonce-cancel proof does not create a trade proof.

Required proof evidence:

```text
txHash, blockNumber, blockHash, eventIndex, and explorerUrl
```

Rules:

- `matcher_local_order_cancelled` and `matcher_local_orders_cancelled` are matcher-local cache/orderbook events only; they are suppressed by the proof-service/indexer projection and keep `matcher-local-cancel-only-on-chain-nonce-unchanged` wording.
- Matcher-local cancellation removes matcher-open quantity only and does not mutate on-chain `NonceManager` nonces.
- A nonce-cancel proof row requires `NonceCancelled` or `NonceRangeCancelled` contract event truth from the NonceManager surface.
- Rows preserve `NO_WITHDRAW` and `NO_ADMIN`; the proof service does not load wallets, sign messages, broadcast transactions, submit through relayers, move funds, withdraw, or grant admin authority.
- Safety copy must say this is an owner-signed NonceManager cancellation proof, not a trade settlement, withdrawal, or delegate/API-key capability.

## Custody and delegate invariants

- The proof service cannot withdraw user funds.
- It never writes vault balances.
- It never creates delegate/API keys.
- Delegate-derived proof/account rows must preserve `NO_WITHDRAW` permission snapshots.
- Proof responses must keep custody copy explicit so bots do not confuse API read access with wallet withdrawal authority.
