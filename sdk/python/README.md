# Python SDK

Python client for agents, research scripts and market makers.

Current status: dependency-light mock smoke stub. It mirrors the TypeScript SDK/`qdex smoke` bot loop against the local mock API without adding wallet, transaction, withdrawal, or custody authority.

Executable mock surface:

```python
from qdex_client import QDexClient, create_mock_signed_order, run_mock_cross_smoke

dex = QDexClient(base_url=base_url)
markets = dex.markets.list()
book = dex.orderbook.get("QI-QUAI")

resting_sell = create_mock_signed_order(side="sell", amount="100", price="5", nonce="1")
crossing_buy = create_mock_signed_order(side="buy", amount="100", price="6", nonce="2")
smoke = run_mock_cross_smoke(dex, resting_sell=resting_sell, crossing_buy=crossing_buy)
proof = smoke["proof"]
```

Mock proofs intentionally keep `settlementMode: mock`, `settlementTx: None`, no explorer URL, and explicit no-funds-moved safety copy.
