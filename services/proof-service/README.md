# Proof Service

Turns indexed settlement events into human/API-readable proofs.

Trade proof fields:

```text
tradeId
orderHashes
settlementTx
blockNumber
eventIndex
maker/taker or privacy-preserving identifiers
market
price
amount
fees
explorerUrl
```

Endpoint:

```http
GET /v1/proofs/trades/:tradeId
```
