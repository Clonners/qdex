# qdex CLI

Terminal client for humans, bots and ops.

Implemented smoke/read-only stubs:

```bash
qdex --base-url http://127.0.0.1:8787 markets
qdex --base-url http://127.0.0.1:8787 book QI-QUAI
qdex --base-url http://127.0.0.1:8787 stream fills --limit 1
qdex --base-url http://127.0.0.1:8787 smoke
```

`qdex stream fills` consumes `/v1/ws?channel=fills` and prints bounded WebSocket snapshot messages. Private stream output is read-only and preserves `READ_ONLY`, `NO_WITHDRAW`, and `NO_ADMIN` permission metadata.

`qdex smoke` submits two deterministic mock signed orders, verifies the indexed fill/proof loop, and prints explicit mock-settlement safety fields (`settlementMode: mock`, `settlementTx: null`, `explorerUrl: null`, no real Quai tx/no funds moved). Delegate/API-key safety remains `NO_WITHDRAW`/`NO_ADMIN` by default.
