# QDEX Contracts Local Harness

Local in-memory Hardhat network only.

This package is a guard-railed scaffold for the future TradingVault/Settlement implementation tests. It exists so the contract plane can become executable without accidentally adding RPC endpoints, external account loading, deployment scripts, or Orchard activity during autonomous campaign runs.

## Commands

- `pnpm --filter @qdex/contracts check` validates the local-only harness guard without compiling or sending anything.
- `pnpm --filter @qdex/contracts test` currently aliases the guard, keeping repo-wide `pnpm check` dependency-light.
- `pnpm --filter @qdex/contracts test:local` runs the local-only Hardhat implementation tests against the in-memory `hardhat` network.

## Boundaries

No RPC URLs, external accounts, deploy scripts, or Orchard/testnet activity belong in autonomous runs.

The current Hardhat config only defines the in-memory `hardhat` network with compiler `0.8.20`, optimizer settings, and Quaiscan-compatible metadata. Do not add Cyprus/Orchard/mainnet/testnet network entries until Clonners explicitly approves real network work.

## Current local TradingVault coverage

Implemented local-only Hardhat ratchets from `docs/contract-implementation-test-matrix.md`:

1. `TV-01`: caller deposits increase caller-owned available balance.
2. `TV-02`: callers can withdraw only their own available balance.
3. `TV-03`: deployer/operator-like accounts cannot withdraw or drain a user's deposited balance, and admin/operator withdrawal selectors remain absent.
4. `TV-04`: settlement-authority locks move funds from available to locked, and normal user withdrawals cannot move the locked portion.
5. `TV-05`: settlement-only lock/unlock/move hooks reject non-authority callers; authorized hook calls validate trace IDs and balance limits before emitting `BalanceLocked`, `BalanceUnlocked`, or `SettlementBalanceMoved`.
6. `TV-06`: future trading pause or emergency controls cannot become a broad freeze on caller-owned available withdrawals without a separately approved narrow emergency design.
7. `ST-01`: local Settlement validates signed fill replay fields, moves vault balances exactly once, marks nonces, and emits `TradeSettled` proof truth.
8. `ST-02`: local Settlement rejects reused or cancelled maker/taker nonces before vault movement, including single nonce and bounded range cancellation.
9. `ST-03`: local Settlement rejects expired fills and replay-domain mismatches before nonce consumption or vault movement.

Recommended next slice: add local `ST-04` invalid price/amount/fill-constraint rejection coverage before external MarketRegistry/FeeManager wiring.

Native Qi remains out of real vault tests until a wrapper/adapter/conversion design is proven.
