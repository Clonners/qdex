# qdex CLI Bot Contract

`qdex` is the terminal-native control surface for humans, bots, and ops. It mirrors the SDK bot flow while making custody and mock-settlement boundaries visible in every command output.

## Core commands

```bash
qdex markets
qdex ticker QI-QUAI
qdex book QI-QUAI
qdex balance
qdex order buy QI-QUAI --amount 1000 --price 0.123
qdex order sell QI-QUAI --quote-amount 100 --market --slippage-bps 50
qdex cancel --all
qdex stream fills
qdex proof trade <trade-id>
qdex api create-key bot-mm-1 --scope trade --expires 7d
```

## Order semantics

- Limit commands create signed `SignedOrder` payloads and submit them to `POST /v1/orders`.
- CLI market orders are market_ioc IOC limit orders with signed price/slippage bounds.
- `--slippage-bps` maps to signed slippage protection, not unlimited market execution.
- Fills stream from confirmed/mock-confirmed projections; proofs use `GET /v1/proofs/trades/:tradeId`.

## API/delegate key scopes

Supported bot-safe permissions:

```text
READ_ONLY
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
NO_WITHDRAW
NO_ADMIN
```

`qdex api create-key bot-mm-1 --scope trade --expires 7d` creates a trade-scoped delegate/API key. It can place and cancel orders within its configured market/notional/expiry policy, but no withdraw command is available for delegate/API keys.

Withdrawal remains a main-wallet action only. Future withdrawal support must be a separate explicit user-wallet flow and must never be silently granted to bot API keys.

## Proof and mock safety

`qdex proof trade <trade-id>` must show whether the proof is mock or real.

In local mock mode:

```text
settlementMode: mock
mockSettlementReference: <mock id>
settlementTx: null
explorerUrl: null
```

The CLI must say there is no real Quai transaction and no funds moved. Once real Quai settlement is enabled later, proof output must come from confirmed indexer/contract-event truth, not matcher memory.
