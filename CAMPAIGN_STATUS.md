# Quai Terminal DEX Campaign Status

## State

- Status: ready for autonomous builder cron
- Workdir: `/home/clonners/.hermes/hermes-agent/quai-terminal-dex`
- Primary plan: `docs/plans/2026-06-06-quai-terminal-dex-mvp.md`
- Runner contract: `docs/campaign/RUNNER_CONTRACT.md`
- Current phase: matching-engine command/event boundary -> first mock vertical slice

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

1. Implement first mock vertical slice: order -> match -> mock settlement -> proof.
2. Specify relayer state machine.
3. Define indexer projection model for fills/proofs.

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
