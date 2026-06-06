# Python SDK

Python client for agents, research scripts and market makers.

Current status: contract/spec only. The TypeScript SDK and `qdex smoke` now pin the first executable mock API bot loop; the Python implementation should mirror that surface next without adding wallet, transaction, withdrawal, or custody authority.

Planned surface:

```python
dex = QDexClient(base_url=base_url, wallet=wallet)
markets = dex.markets.list()
book = dex.orderbook.get("QI-QUAI")
order = dex.orders.place_limit(market="QI-QUAI", side="buy", amount="1000", price="0.123")
proof = dex.proofs.trade(order.trade_id)
```
