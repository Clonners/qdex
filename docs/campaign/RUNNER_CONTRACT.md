# Quai Terminal DEX Autonomous Campaign Contract

## Objective

Build `quai-terminal-dex` into a working MVP for a terminal-native, API-first, non-custodial orderbook DEX on Quai.

The MVP target is:

```text
mock market
  -> signed/mock orders
  -> deterministic matching
  -> FillPacket
  -> mock settlement confirmed
  -> indexed fill/proof projection
  -> API returns order/fill/proof
  -> terminal UI shows trade/proof
  -> later replace mock settlement with Quai testnet contracts
```

## Workdir

```text
/home/clonners/.hermes/hermes-agent/quai-terminal-dex
```

## Primary plan

```text
docs/plans/2026-06-06-quai-terminal-dex-mvp.md
```

## Completion-mode direction

Clonners asked the autonomous campaign to keep advancing until the DEX is completed. Treat that as approval for bounded local/source-only development inside this repo, including local in-memory runtime behavior and local contract-harness logic, while preserving the external side-effect gates below.

The runner should keep choosing the next smallest safe slice from `CAMPAIGN_STATUS.md` instead of stopping at completed metadata/client surfaces. If the next useful step would require external wallets/RPC/deploys/txs/funds/public servers/remote pushes or real-network `MarketRegistry` mutation, stop and ask for the exact approval instead of treating this completion-mode direction as blanket permission.

## Autonomous boundaries

Allowed autonomously:

- edit files inside this repo only
- create tests/docs/specs/source code
- run local tests/checks/lints/builds
- research public docs for Quai/tooling
- implement local in-memory runtime behavior and local contract-harness logic
- commit local changes to this repo
- append compact checkpoints to `CAMPAIGN_STATUS.md`

Not allowed without explicit Clonners approval:

- deploy contracts
- send transactions on mainnet/testnet
- use real wallets, keys, seeds or funds
- push to GitHub/remote
- publish packages/images
- expose servers publicly
- change global Hermes config
- edit other project repos
- introduce custody/admin withdrawal paths
- add economics/fee/risk policy that can drain or trap users

## Slice contract

Each autonomous run must do exactly one bounded slice:

1. Read `CAMPAIGN_STATUS.md` and the MVP plan.
2. Inspect git status.
3. If repo is dirty from a previous partial run, reconcile or stop with a clear blocker.
4. Pick the next smallest useful task.
5. Implement tests/spec/docs/source for that task.
6. Run the narrowest meaningful verification.
7. Commit only if verification passes.
8. Update `CAMPAIGN_STATUS.md` with:
   - what changed
   - verification command/result
   - commit hash if committed
   - next recommended slice
   - blockers/approval needs
9. Deliver a short Spanish operator card.

## Reporting style

Telegram report format:

```text
🟢 OK / 🟡 OJO / 🔴 INTERVENCIÓN / ✋ DECISIÓN
qdex campaña: <slice name>
Hecho: <1-2 bullets>
Verificado: <command/result>
Commit: <short sha or none>
Siguiente: <next slice>
Intervención: no / exact approval needed
```

Keep normal OK/progress updates short: max ~8 lines.

## Quality rules

- Prefer DRY/YAGNI.
- Add tests before behavior-heavy code when possible.
- Keep contract custody invariants explicit.
- Market orders must be IOC limit orders with slippage bounds.
- Delegate/API keys default to `NO_WITHDRAW`.
- Contract events are final truth; DB/API state is projection/cache.
- Do not claim production readiness until real Quai tooling, contract tests, audits, and testnet evidence exist.
