# Python SDK

Python client for agents, research scripts and market makers.

Current status: dependency-light mock smoke stub. It mirrors the TypeScript SDK/`qdex smoke` bot loop against the local mock API without adding wallet, transaction, withdrawal, or custody authority.

Executable mock surface:

```python
from qdex_client import QDexClient, create_mock_signed_order, run_mock_cross_smoke

dex = QDexClient(base_url=base_url)
markets = dex.markets.list()
book = dex.orderbook.get("QI-QUAI")
contracts = dex.contracts.get()

resting_sell = create_mock_signed_order(side="sell", amount="100", price="5", nonce="1")
crossing_buy = create_mock_signed_order(side="buy", amount="100", price="6", nonce="2")
smoke = run_mock_cross_smoke(dex, resting_sell=resting_sell, crossing_buy=crossing_buy)
proof = smoke["proof"]
```

`contracts.get()` calls `GET /v1/contracts` and returns local-only contract metadata with null addresses, `local-only-not-deployed`, `realQuaiTransactions: False`, `walletRequired: False`, `TradeSettled` as the proof trigger, and delegate safety requiring `PLACE_ORDER`, `NO_WITHDRAW`, and `NO_ADMIN`. It does not load wallets, send transactions, read RPC URLs, deploy contracts, or claim real Quai contract addresses.

Mock proofs intentionally keep `settlementMode: mock`, `settlementTx: None`, no explorer URL, and explicit no-funds-moved safety copy.
