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

Recommended next slice: start the `TV-04` locked-balance withdrawal ratchet locally, without adding RPC URLs, deploy scripts, real wallets, or any admin/operator withdrawal surface.

Native Qi remains out of real vault tests until a wrapper/adapter/conversion design is proven.
