# Quai Terminal DEX Campaign Status

## State

- Status: ready for autonomous builder cron
- Workdir: `/home/clonners/.hermes/hermes-agent/quai-terminal-dex`
- Primary plan: `docs/plans/2026-06-06-quai-terminal-dex-mvp.md`
- Runner contract: `docs/campaign/RUNNER_CONTRACT.md`
- Current phase: indexer projection model complete -> proof-service/indexer route contract refinements

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

1. Add proof-service/indexer route contract refinements.
2. Add SDK/CLI bot contract specs.
3. Start minimal indexer/proof-service in-memory adapter after route contracts are pinned.

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
