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

## Current local contract coverage

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
10. `ST-04`: local Settlement rejects disabled local markets, invalid price/amount arithmetic, and fill-accounting mismatches before nonce consumption or vault movement.
11. `ST-05`: local Settlement tracks cumulative partial-fill amounts by order hash and rejects fills that would exceed signed maker/taker order amounts.
12. `ST-06`: local Settlement enforces signed/hard fee caps, configured fee recipient, and fee-split accounting before proof-event emission.
13. `ST-07`: contract proof adapter pins `TradeSettled` as the only public proof trigger, suppresses matcher/non-TradeSettled events, and requires real Quai event evidence before public projection.
14. `NM-01`: local NonceManager keeps cancellation user-owned, bounds range cancellation, and restricts `markNonceUsed` to the configured settlement authority.
15. `MR-01`: local MarketRegistry keeps market metadata stable, enabled/disabled status explicit, and market-authority changes dependency-scoped before Settlement wiring.
16. `FM-01`: local FeeManager keeps maker/taker fee updates fee-authority gated, hard-capped by `maxFeeBps()`, and evented for indexer replay.
17. `DK-01`: local DelegateKeyRegistry keeps delegate keys owner-registered, expiry/market/notional scoped, and explicitly `NO_WITHDRAW`/`NO_ADMIN` before bot signing integration.
18. `DK-02`: local Settlement accepts owner-scoped delegate signatures only when the delegate is active for the fill market/notional and has `PLACE_ORDER`, `NO_WITHDRAW`, and `NO_ADMIN`; invalid delegates reject before nonce/accounting/vault movement.
19. `NM-02`: local Settlement delegates nonce truth to a settlement-scoped `NonceManager`; user cancellations live on `NonceManager`, full fills emit `NonceUsed`, and DK-02 delegate safety remains intact.
20. `MR-02`: local Settlement delegates market truth to a market-authority-scoped `MarketRegistry`; fills require enabled base/quote metadata and disabled or token-mismatched markets reject before nonce/accounting/vault/proof mutation.
21. `FM-02`: local Settlement delegates fee truth to a fee-authority-scoped `FeeManager`; nonzero fees require manager recipient truth plus signed and manager schedule caps before vault/proof mutation.
22. `MR-03`: local MarketRegistry starts with Clonners-managed listing authority and supports a two-step DAO handoff via `proposeMarketAuthority` and `acceptMarketAuthority` without custody power.

Current metadata/listing slices expose read-only `listedAssetStatus` plus `GET /v1/listings/policy`, `POST /v1/listings/requests` prepare-only metadata, and SDK/CLI clients. They also expose `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, and `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision` so API/SDK/CLI surfaces state that the MVP uses WQUAI, WQI, and listed community-created tokens as ERC-20-style vault assets.

Next approval boundary: post-listing-policy MarketRegistry admin boundary in [`docs/plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md`](../docs/plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md). Approval required: runtime listing submission beyond local queue/decision state or MarketRegistry admin mutation. Clonners approved the local-only authority handoff and in-memory review queue slices; still do not add listing-admin keys, real token addresses, wallets, RPC URLs, signing, broadcasts, deploys, tx helpers, real network `MarketRegistry` mutation, or funds movement.

The listing plane may enable/disable token-pair metadata only after approval, but it must not move user balances or grant withdrawal/admin power.

The listing plane can enable/disable token-pair metadata through the Clonners-managed local authority and later DAO handoff, but it must not move user balances or grant withdrawal/admin power. Native Qi direct settlement remains out of scope for the MVP unless Clonners explicitly reopens it; WQI is the Qi-facing listed token surface.
