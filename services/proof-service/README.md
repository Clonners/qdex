# Proof Service

Turns indexed settlement events into human/API-readable proofs.

The route contract is pinned in [`spec.md`](./spec.md). Key MVP rules:

- `GET /v1/proofs/trades/:tradeId` reads indexed proof rows only.
- Mock proofs use `settlementMode: mock` and `mockSettlementReference`.
- Mock proofs keep `settlementTx`, `blockNumber`, `blockHash`, and `explorerUrl` as `null` and must say no real Quai transaction or funds moved.
- Real Quai proofs later require contract-event truth: `settlementTx`, `blockNumber`, `eventIndex`, and `explorerUrl`.
- The proof service has no custody, withdrawal, wallet, or delegate-admin authority.
