# QDEX Contracts Local Harness

Local in-memory Hardhat network only.

This package is a guard-railed scaffold for the future TradingVault/Settlement implementation tests. It exists so the contract plane can become executable without accidentally adding RPC endpoints, external account loading, deployment scripts, or Orchard activity during autonomous campaign runs.

## Commands

- `pnpm --filter @qdex/contracts check` validates the local-only harness guard without compiling or sending anything.
- `pnpm --filter @qdex/contracts test` currently aliases the guard, keeping repo-wide `pnpm check` dependency-light.
- `pnpm --filter @qdex/contracts test:local` is reserved for future local implementation tests after the contract package dependencies are installed.

## Boundaries

No RPC URLs, external accounts, deploy scripts, or Orchard/testnet activity belong in autonomous runs.

The current Hardhat config only defines the in-memory `hardhat` network with compiler `0.8.20`, optimizer settings, and Quaiscan-compatible metadata. Do not add Cyprus/Orchard/mainnet/testnet network entries until Clonners explicitly approves real network work.

## First local tests to add

Start with `TV-01` from `docs/contract-implementation-test-matrix.md`.

Recommended next slice:

1. Add a local mock ERC-20 asset used only by Hardhat tests.
2. Write the RED `TV-01` TradingVault deposit test.
3. Implement the smallest `TradingVault` behavior needed to emit `Deposit` and update caller-owned balances.
4. Keep admin/operator withdrawal selectors absent.

Native Qi remains out of real vault tests until a wrapper/adapter/conversion design is proven.
