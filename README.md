# Quai Terminal DEX

Terminal-native, API-first, non-custodial orderbook DEX for Quai.

## Product thesis

This is not a CEX. It is a CEX-like interface with DEX custody and on-chain settlement:

```text
Terminal UI / SDK / Bots
  -> REST + WebSocket API
  -> Off-chain orderbook + matching engine
  -> Relayer
  -> Quai smart contracts
  -> Indexer + proof service
```

## MVP scope

- Single Quai zone/shard first.
- Spot markets only.
- No perps, leverage, margin, bridges, or cross-zone settlement in v0.
- Non-custodial vault contracts as source of funds.
- Off-chain matching for speed.
- On-chain settlement for finality and verifiability.
- API-first from day one for agents, bots, and market makers.
- Terminal/TUI-style web interface.

## Repository layout

```text
contracts/                 Quai/EVM smart contracts
services/api/              REST API and WebSocket gateway
services/matching-engine/  Matching engine integration/adaptor
services/relayer/          Settlement transaction submitter
services/indexer/          On-chain event indexer
services/proof-service/    Trade/order/fill proof endpoints
web/terminal-ui/           Browser TUI frontend
sdk/typescript/            TypeScript SDK
sdk/python/                Python SDK
cli/qdex/                  CLI client for bots/operators
docs/                      Architecture, API and implementation plans
```

## Design rules

1. Operator cannot withdraw user funds.
2. API/delegate keys cannot withdraw by default.
3. Market orders are IOC limit orders with slippage protection.
4. Contract events are the final balance/fill truth.
5. Every trade should have a proof link: order hash, settlement tx, block, event index, price, amount and fees.
6. Admin operations need caps, timelocks, multisig or explicit governance before production.

## Initial stack direction

- API/services: TypeScript first for fast iteration.
- Matching engine: `exchange-core` integration or compatible isolated engine service.
- Contracts: Solidity-compatible Quai contracts once target tooling is confirmed.
- UI: custom terminal-native web UI.
- SDKs: TypeScript + Python.

## Status

Early architecture scaffold. Not production code.
