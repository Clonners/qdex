# Quai Terminal DEX Campaign Status

## State

- Status: active autonomous builder cron; current repo checks green
- Workdir: `/home/clonners/.hermes/hermes-agent/quai-terminal-dex`
- Primary plan: `docs/plans/2026-06-06-quai-terminal-dex-mvp.md`
- Runner contract: `docs/campaign/RUNNER_CONTRACT.md`
- Current phase: contract custody interface ratchets complete -> contract implementation/test-harness planning without deploy/tx

## Current repo baseline

Created scaffold:

- monorepo package/workspace metadata
- API health/markets scaffold
- contract interfaces placeholders
- architecture docs
- OpenAPI draft
- service/SDK/CLI/UI placeholders
- MVP implementation plan

Verified:

```bash
pnpm check
PORT=8787 node services/api/src/server.js
curl -fsS http://127.0.0.1:8787/v1/health
curl -fsS http://127.0.0.1:8787/v1/markets
```

Result: API scaffold responded successfully.

## Autonomous boundaries

No deploys, txs, real wallets, GitHub pushes, public servers, or external side effects without explicit approval.

## Next recommended slices

1. Add an implementation-oriented contract spec/test matrix for TradingVault + Settlement access control, event truth, and fee/nonce/market dependencies without deploys or wallet use.
2. Prepare real Quai/Hardhat contract tests only after explicit tooling/deploy approval.
3. Keep native Qi wrapper/adapter risk explicit before any real `QI-QUAI` settlement claim.

## Cron runner

- Job ID: `bd3c1b71af75`
- Name: `qdex-autonomous-builder`
- Schedule: `*/20 * * * *` America/Buenos_Aires local time
- Repeat: forever
- Delivery: origin Telegram chat
- Profile: `intielsolcito`
- Workdir: this repo
- Boundaries: source/docs/tests only; no deploys, txs, wallets, pushes, public servers or external side effects without approval.

## Latest checkpoints

- 2026-06-06: Campaign contract/status created by interactive session.
- 2026-06-06: Autonomous cron runner `bd3c1b71af75` created and scheduled for bounded builder slices.
- 2026-06-06: Cron cadence updated to every 20 minutes during active window (`*/20 8-22 * * *`), repeat budget raised to 180 runs.
- 2026-06-06: Cron cadence updated to every 20 minutes 24/7 (`*/20 * * * *`), repeat changed to forever.
- 2026-06-06: Documented Quai contract tooling in `docs/quai-tooling.md` and linked contract assumptions in `docs/contracts.md`; verified docs check, `pnpm check`, and secret scan; commit `db04a47`; next slice: signed order schema + OpenAPI components.
- 2026-06-06 03:04 -03: Defined canonical signed order schema in `docs/order-schema.md`, added OpenAPI order/fill components plus Node test coverage wired into `pnpm check`; verified RED `node --test tests/order-schema.test.mjs`, GREEN `pnpm check`, and secret scan; slice commit `9c10404`; next slice: API route modules + tests for health/markets/orders/proofs.
- 2026-06-06: Added API route modules for public/private/proof surfaces plus node:test coverage for health, markets, order/fill placeholders, balances, and proof-not-found projection; verified RED `pnpm --filter @qdex/api test`, GREEN `pnpm check`, and secret scan; slice commit `bb5ccc0`; next slice: matching-engine command/event boundary.
- 2026-06-06 03:43 -03: Defined matching-engine command/event boundary in `services/matching-engine/spec.md` and `events.md`, added doc ratchet test coverage wired into `pnpm check`; verified RED `node --test tests/matching-engine-spec.test.mjs`, GREEN `pnpm check`, and secret scan; slice commit `e6e71d4`; next slice: first mock vertical slice order -> match -> mock settlement -> proof.
- 2026-06-06 04:07 -03: Added in-memory mock vertical API slice for `POST /v1/orders` -> deterministic cross -> `FillPacket` -> mock settlement confirmation -> fill/trade/proof projection; verified RED `pnpm --filter @qdex/api test`, GREEN `pnpm check`, and secret scan; slice commit `a037e0a`; next slice: terminal UI trade/proof panel backed by the mock vertical fixture.
- 2026-06-06 04:24 -03: Added terminal-native mock trade/proof panel in `web/terminal-ui`, backed by deterministic `trade-000001`/`fill-000001` fixture with explicit `settlementMode: mock` and no real Quai tx/explorer claim; verified RED/GREEN `pnpm --filter @qdex/terminal-ui test`, `pnpm check`, and secret scan no matches; slice commit `26e3a51`; next slice: relayer state machine spec.
- 2026-06-06 04:43 -03: Defined relayer state machine in `services/relayer/spec.md` with `FillPacket` idempotency, mock-vs-Quai settlement states, private status visibility, and confirmed-only proof projection; verified RED `node --test tests/relayer-spec.test.mjs`, GREEN `pnpm check`, and secret scan no matches; slice commit `7e374b5`; next slice: indexer projection model for fills/proofs.
- 2026-06-06 05:03 -03: Defined indexer projection schema in `services/indexer/schema.md` with event tables, confirmed-only fill/proof projection, reorg-safe `blockHash`/`finalityDepth`, and `replayFromBlock(startBlock)` behavior; verified RED `node --test tests/indexer-schema.test.mjs`, GREEN `pnpm check`, and secret scan no matches; slice commit `566fa75`; next slice: proof-service/indexer route contract refinements.
- 2026-06-06 05:27 -03: Refined proof-service/indexer route contract in OpenAPI, API proof responses, proof-service spec, and terminal mock proof panel; mock proofs now use `mockSettlementReference` with null `settlementTx`/block/explorer and explicit no-funds safety copy; verified RED doc/API/UI tests, GREEN `pnpm check`, and secret scan no matches; slice commit `57b4cea`; next slice: SDK/CLI bot contract specs.
- 2026-06-06 05:42 -03: Completed SDK/CLI bot contract slice by adding TypeScript/Python/qdex specs plus ratchet test coverage for bot flow, `market_ioc` slippage bounds, and `NO_WITHDRAW`/`NO_ADMIN` delegate keys; verified RED `node --test tests/sdk-cli-contract.test.mjs` failed on missing specs, GREEN `pnpm check` pass, and secret-pattern scan no matches; slice commit `4a7538f`; next slice: proof-service/indexer in-memory adapter.
- 2026-06-06 06:04 -03: Added minimal in-memory indexer/proof-service adapter with ratchet tests for confirmed mock settlement projection, duplicate-event idempotency, non-final `ORDER_MATCHED` suppression, and unsafe real-Quai proof rejection; verified RED `node --test tests/in-memory-indexer-proof-adapter.test.mjs` missing adapter modules, GREEN `pnpm check` pass, and secret-pattern scan no matches; slice commit `2b7c4d7`; next slice: wire adapter into API mock vertical loop and proof routes.
- 2026-06-06 06:23 -03: Wired API mock vertical loop to the in-memory indexer/proof-service adapter; `/v1/fills`, `/v1/trades/:market`, and proof routes now consume adapter projections with `sourceEventId` and no mock `createdAt` fill shortcut; verified RED `pnpm --filter @qdex/api test` failed on missing `sourceEventId`, GREEN `pnpm --filter @qdex/api test` and `pnpm check` pass, secret-pattern scan no matches; slice commit `4365589`; next slice: terminal UI adapter-shaped fill/proof fixture alignment.
- 2026-06-06 06:43 -03: Aligned terminal UI fixture/rendering with adapter-shaped fill/proof rows: `sourceEventId`, projection source labels, no `createdAt`, and proof-service/indexer source visibility; verified RED/GREEN `pnpm --filter @qdex/terminal-ui test`, `pnpm --filter @qdex/terminal-ui check`, `pnpm check`, and secret-pattern scan no matches; slice commit `34c7b94`; next slice: SDK/CLI smoke stubs against the current mock API flow.
- 2026-06-06 07:06 -03: Added TypeScript SDK and `qdex` CLI mock smoke stubs for markets/book/order-cross/fill/proof flow with explicit mock-proof safety and delegate `NO_WITHDRAW`/`NO_ADMIN` checks; verified RED `pnpm --filter @qdex/sdk-typescript test` and `pnpm --filter @qdex/cli test` failed on missing modules, GREEN focused tests plus `pnpm check` pass, secret-pattern scan no matches; slice commit `30ff6a9`; next slice: Python SDK smoke stub mirroring the TypeScript mock API flow.
- 2026-06-06 07:24 -03: Added dependency-light Python SDK mock smoke stub against the local API loop, covering markets/book -> crossed mock orders -> indexed fill/proof and `market_ioc` slippage invariants; verified RED `pnpm --filter @qdex/sdk-python test` failed on missing module, GREEN focused test plus `pnpm check` pass, secret-pattern scan no matches; slice commit `4f96a84`; next slice: WebSocket stream contract tests for market data and private fills.
- 2026-06-06 07:44 -03: Added API stream contract registry and snapshot builder for public market data plus custody-safe private fill streams, preserving adapter-shaped indexed fills (`sourceEventId`, no `createdAt`) and `NO_WITHDRAW`/`NO_ADMIN` private permissions; verified RED `pnpm --filter @qdex/api test` failed on missing `streams.js`, GREEN `pnpm --filter @qdex/api test`, `pnpm --filter @qdex/api check`, `pnpm check`, and secret-pattern scan no matches; slice commit `887e980`; next slice: wire a minimal local WebSocket upgrade/transport to these stream contracts.
- 2026-06-06 08:06 -03: Wired minimal local `/v1/ws?channel=...` WebSocket snapshot transport to API stream contracts, including public orderbook snapshots and private indexed fill snapshots with `NO_WITHDRAW`/`NO_ADMIN` safety metadata; verified RED `pnpm --filter @qdex/api test` failed on missing upgrade transport, GREEN focused WebSocket test, `pnpm --filter @qdex/api test`, `pnpm --filter @qdex/api check`, `pnpm check`, and secret-pattern scan no matches; slice commit `1b30261`; next slice: live WebSocket fanout when mock orders mutate orderbook/fill projections.
- 2026-06-06 08:26 -03: Added live WebSocket fanout for open `/v1/ws` clients on mock orderbook/fill mutations, with stream-event metadata and private fill snapshots preserving `NO_WITHDRAW`/`NO_ADMIN` plus adapter-shaped `sourceEventId`; verified RED `pnpm --filter @qdex/api test` timed out waiting for fanout, GREEN `pnpm --filter @qdex/api test`, `pnpm --filter @qdex/api check`, `pnpm check`, and secret-pattern scan no matches; slice commit `edf2971`; next slice: SDK/CLI stream consumers against the local WebSocket transport.
- 2026-06-06 08:46 -03: Added TypeScript SDK `fills.openStream()`/`fills.stream()` and `qdex stream fills --limit N` consumers for local `/v1/ws?channel=fills`, preserving private `READ_ONLY` + `NO_WITHDRAW`/`NO_ADMIN` stream safety; verified RED/GREEN focused SDK/CLI tests, `pnpm check`, and secret-pattern scan no matches; next slice: terminal UI live stream consumer/binding against the local WebSocket transport.
- 2026-06-06 09:09 -03: Added terminal UI live `fills` WebSocket binding plus proof-service fetch/render path, live stream safety panel, and local API JSON CORS headers for browser proof fetches; verified RED/GREEN terminal UI/API tests, `pnpm check`, and secret-pattern scan no matches; slice commit `abf9d63`; next slice: terminal UI mock order trigger/browser smoke to create the crossed fill from the UI.
- 2026-06-06 09:26 -03: Added terminal UI mock order trigger/browser smoke: browser button posts deterministic local/dev GTC sell plus `market_ioc` IOC buy, verifies proof-service mock proof, and keeps no-real-Quai/no-funds safety copy; verified RED/GREEN `pnpm --filter @qdex/terminal-ui test`, `pnpm --filter @qdex/terminal-ui check`, `pnpm check`, and secret-pattern scan no matches; slice commit `9159357`; next slice: contract interface custody invariant ratchets (local/static, no deploy/tx).
- 2026-06-06 09:45 -03: Added static contract custody interface ratchets plus expanded Solidity interfaces for vault, settlement, nonce, market, fee, and delegate-key safety; pinned interfaces to Solidity `0.8.20`, forbade admin/operator withdrawal selectors, and preserved `NO_WITHDRAW`/`NO_ADMIN`; verified RED `node --test tests/contract-interface-invariants.test.mjs`, GREEN `pnpm check`, `git diff --check`, and secret-pattern scan no matches; slice commit `4a6de5d`; next slice: implementation-oriented contract spec/test matrix without deploys or wallet use.
