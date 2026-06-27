# QDEX — Quai Non-Custodial Orderbook DEX

Open-source non-custodial DEX built on Quai Network. Terminal-style exchange UI with real on-chain settlement.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Frontend       │────▶│  API Server      │────▶│  Quai Network   │
│  (bitquai.live) │     │  :8787           │     │  (Orchard)      │
│  React-free     │     │                  │     │                 │
│  Vanilla JS     │◀────│  Matching Engine │◀────│  Settlement     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                            │                          │
                            ▼                          ▼
                       SQLite Store              TradingVault
                       (Persistent)              (On-chain)
```

## Components

| Service | Path | Description |
|---|---|---|
| API Server | `services/api/` | REST + WebSocket endpoints |
| Matching Engine | `matching-engine/` | Price-time priority order matching |
| Relayer | `relayer/` | Fill settlement state machine |
| Indexer | `services/indexer/` | In-memory fill/trade projection |
| Proof Service | `services/proof-service/` | Settlement proof generation |
| Frontend | See bitquai.live | Terminal-style DEX UI |

## API Endpoints

### Public
- `GET /v1/health` — Service health check
- `GET /v1/markets` — Available markets
- `GET /v1/orderbook/{marketId}` — Order book depth
- `GET /v1/trades/{marketId}` — Trade history
- `GET /v1/proofs` — Settlement proofs list
- `GET /v1/proofs/trades/{tradeId}` — Individual proof
- `GET /v1/contracts` — Deployed contract addresses
- `GET /v1/fees` — Fee schedule
- `GET /v1/stats` — Persistent storage statistics

### Private (Authenticated)
- `POST /v1/orders` — Submit signed order
- `GET /v1/orders` — List orders
- `DELETE /v1/orders/{hash}` — Cancel order
- `POST /v1/vault/approve` — Approve token for vault
- `POST /v1/vault/deposits/prepare` — Deposit to vault
- `POST /v1/vault/withdrawals/prepare` — Withdraw from vault
- `GET /v1/vault/balances/real` — Real vault balances

### Real Network
- `GET /v1/real/network` — Quai network status
- `GET /v1/real/balances/{address}` — Real balances
- `GET /v1/real/events/trades` — On-chain trade events
- `GET /v1/real/events/deposits` — On-chain deposit events

## Wallet Integration

Supports Quai Network wallets only (Pelagus, MetaMask with Quai network).

Chain IDs supported:
- 15000 (Orchard Cyprus-1)
- 15001 (Orchard Cyprus-2)
- 15002 (Orchard Cyprus-3)
- 100-102 (Mainnet)

## Setup

```bash
cp .env.example .env
npm install
node services/api/src/server.js
```

## License

MIT
