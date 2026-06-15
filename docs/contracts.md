# Contracts

MVP contract set for a non-custodial orderbook DEX.

## Tooling baseline

Contract implementation should start from the single-zone Hardhat + Quais SDK decision in [`docs/quai-tooling.md`](./quai-tooling.md): Cyprus-1 first, Orchard testnet only for approved live testing, regular Solidity before SolidityX, and no autonomous cron deploys or transaction sends.

Important current risk: Quai docs/examples disagree on the exact maximum Solidity compiler (`0.8.19` reference page vs `0.8.20` deployment guide/example). The current local interface ratchet pins Solidity `0.8.20` as the Hardhat candidate from `docs/quai-tooling.md`; verify locally/testnet before value-bearing deployment.

Token assumption: **ERC-20 only, no native QUAI/QI handling.** All listed assets are ERC-20 tokens. Trading pairs use `USDT` and `WQI` (wrapped QI) as quote assets — e.g., `WQUAI/USDT`, `WQUAI/WQI`, `WQI/USDT`. Native QUAI/QI is never transferred, locked, or settled by the DEX contracts. It exists only for external denomination and naming convention. The active token listing and MarketRegistry metadata flow is pinned in [`docs/listing-policy.md`](./listing-policy.md).

Static ratchet: `tests/contract-interface-invariants.test.mjs` must stay green before adding implementation code. It guards compiler drift, no admin/operator withdrawal selectors, replay-domain fields, fee-cap fields, and `NO_WITHDRAW`/`NO_ADMIN` delegate semantics.

Implementation matrix: [`docs/contract-implementation-test-matrix.md`](./contract-implementation-test-matrix.md) pins the local-only TradingVault, Settlement, and dependency-contract tests to write before any Hardhat implementation or approved Orchard/testnet activity.

Local harness: [`contracts/hardhat.config.cjs`](../contracts/hardhat.config.cjs) and [`contracts/scripts/guard-local-only-hardhat-config.mjs`](../contracts/scripts/guard-local-only-hardhat-config.mjs) define a dependency-light Hardhat scaffold that only exposes the in-memory `hardhat` network during autonomous runs. It intentionally has no external network entries, no deploy scripts, and no account loading.

## Contract address/API metadata alignment

`GET /v1/contracts` is the public metadata surface for the current contract plane. During autonomous local work every contract entry must stay `local-only-not-deployed` with `address: null`; the endpoint is documentation/projection metadata, not deployment truth.

No autonomous deployment, transaction, wallet, external RPC, or real-funds activity is implied by `/v1/contracts`. Real Quai addresses can only replace `null` after explicit approval, deployment evidence, verified source links, and event-truth indexing are available.

TradingVault owner-wallet prepare boundary: [`docs/vault-operations.md`](./vault-operations.md) pins `POST /v1/vault/deposits/prepare` and `POST /v1/vault/withdrawals/prepare` as prepare-only owner-wallet-required API surfaces. They return local `501` placeholder envelopes with `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`; no wallet loading, RPC URL access, signing, broadcast, transaction submission, deploy, real contract address, or funds movement is introduced until explicit approval.

The post-vault owner-wallet readiness plan is pinned in `docs/plans/2026-06-08-post-vault-owner-wallet-readiness.md` and maps the completed mock balance and prepare-only vault surfaces to the approval gate. The read-only TradingVault `Deposit`/`Withdraw` projection schema is now pinned in `services/indexer/schema.md`, `docs/api-openapi.yaml`, and `docs/vault-operations.md`: `TradingVaultDepositProjection` and `TradingVaultWithdrawalProjection` are event-shaped read models with `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, null mock tx/block/explorer fields, and real event evidence required before confirmed history display. Read-only vault history REST and private stream envelopes now exist for `GET /v1/vault/deposits`, `GET /v1/vault/withdrawals`, `/v1/ws?channel=deposits`, and `/v1/ws?channel=withdrawals` without wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Delegate/API key owner-signed prepare boundary: [`docs/delegate-keys.md`](./delegate-keys.md) pins the current `GET /v1/delegate-keys`, `GET /v1/delegate-keys/registrations`, `GET /v1/delegate-keys/revocations`, `POST /v1/delegate-keys`, and `DELETE /v1/delegate-keys/{keyId}` surfaces. The post-delegate-key owner-signed readiness plan is pinned in `docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md` and maps the completed prepare-only delegate/API key surfaces to the approval gate before live `DelegateKeyRegistry` mutation. The read-only DelegateKeyRegistry `DelegateKeyRegistered`/`DelegateKeyRevoked` projection schema is now pinned in `services/indexer/schema.md`, `docs/api-openapi.yaml`, and `docs/delegate-keys.md`: `DelegateKeyRegisteredProjection` and `DelegateKeyRevokedProjection` are event-shaped read models with `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, mock-null tx/block/explorer fields, and real event evidence required before confirmed registry display; read-only DelegateKeyRegistry history API envelopes, the terminal UI read-only delegate-key history panel, the local API + terminal UI delegate-key history smoke, and private WebSocket snapshots now expose `GET /v1/delegate-keys/registrations`, `GET /v1/delegate-keys/revocations`, `/v1/ws?channel=delegate-key-registrations`, and `/v1/ws?channel=delegate-key-revocations` style `source: delegatekeyregistry-event-projection` views with `settlementMode: mock`, null evidence, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Post-mock readiness / owner-signed nonce-cancel plan: [`docs/plans/2026-06-06-post-mock-mvp-readiness-owner-signed-nonce-cancel.md`](./plans/2026-06-06-post-mock-mvp-readiness-owner-signed-nonce-cancel.md) separates matcher-local cancellation from contract-facing `NonceManager` cancellation and keeps real Quai replacement work approval-gated.

The local dependency shape is now:

```text
Settlement -> TradingVault, NonceManager, MarketRegistry, FeeManager, and DelegateKeyRegistry
```

The endpoint should list `TradingVault`, `NonceManager`, `MarketRegistry`, `FeeManager`, and `DelegateKeyRegistry` as local-only dependencies.

`TradeSettled` remains the only public proof trigger for contract-backed trade proofs. `NonceManager` is external nonce truth, `MarketRegistry` is external market truth, and `FeeManager` is external fee truth for local Settlement wiring. Delegate metadata must keep `NO_WITHDRAW` and `NO_ADMIN` explicit, with no positive withdrawal/admin permission. The listed asset model is WQUAI, WQI, and community-created tokens, all treated as ERC-20-style vault tokens once listed.

Structured listed-asset metadata in `/v1/contracts`:

```text
listedAssetStatus.status: erc20-only-listing
primaryQuoteAssets: USDT, WQI
supportedAssetModel: erc20
quoteAssetModel: erc20
nativeQiTreatment: denomination-only
nativeQiDirectSettlement: false
nativeQiVaultSupport: false
```

Native Qi direct settlement is not an MVP blocker anymore; the Qi-facing DEX surface is `WQI`. The corrected wrapped-token listing direction supersedes the native-Qi-adapter decision plateau and is pinned in [`docs/plans/2026-06-07-native-qi-wrapper-adapter-boundary.md`](./plans/2026-06-07-native-qi-wrapper-adapter-boundary.md). QDEX MVP uses WQUAI, WQI, and community-created tokens — all ERC-20-style vault tokens. The token listing and MarketRegistry metadata flow can enable/disable listed token pairs without introducing custody, wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds. `GET /v1/listings/policy` and [`docs/listing-policy.md`](./listing-policy.md) expose that flow as read-only local metadata; the local in-memory listing review queue/decision workflow preserves the approval gate without MarketRegistry mutation. Existing safe listing surfaces: `GET /v1/listings/policy`, `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision`, and prepare-only fallback. The local authority model starts Clonners-managed and can later transfer to DAO/multisig governance through `MarketRegistry.proposeMarketAuthority` and `MarketRegistry.acceptMarketAuthority`, without custody power. Approval required: runtime listing submission beyond local queue/decision state or MarketRegistry admin mutation. The post-listing-policy MarketRegistry admin boundary is documented in [`docs/plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md`](./plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md); no wallets, RPC URLs, signing, broadcasts, deploys, real token addresses, real network mutations, or funds movement are approved.

## TradingVault

Responsible for non-custodial user balances.

Required invariant:

```text
admin/operator cannot withdraw user funds
```

Suggested surface:

```solidity
deposit(address token, uint256 amount)
withdraw(address token, uint256 amount)
balanceOf(address user, address token)
availableBalanceOf(address user, address token)
lockedBalanceOf(address user, address token)
lockForSettlement(address user, address token, uint256 amount, bytes32 orderHash)
unlockFromSettlement(address user, address token, uint256 amount, bytes32 orderHash)
settleLockedBalance(address debitUser, address creditUser, address token, uint256 amount, bytes32 fillId)
```

The settlement hooks must be restricted in implementation to the authorized settlement/order manager. They are not operator withdrawal powers.

Events:

```solidity
event Deposit(address indexed user, address indexed token, uint256 amount);
event Withdraw(address indexed user, address indexed token, uint256 amount);
event BalanceLocked(address indexed user, address indexed token, uint256 amount);
event BalanceUnlocked(address indexed user, address indexed token, uint256 amount);
event SettlementBalanceMoved(address indexed debitUser, address indexed creditUser, address indexed token, uint256 amount, bytes32 fillId);
```

The read-only TradingVault `Deposit`/`Withdraw` projection schema is now pinned, and read-only vault history REST/stream envelopes now expose `GET /v1/vault/deposits`, `GET /v1/vault/withdrawals`, `/v1/ws?channel=deposits`, and `/v1/ws?channel=withdrawals`. Those responses are projection/cache surfaces only: `source: tradingvault-event-projection`, `settlementMode: mock`, null mock tx/block/explorer evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`. They do not load wallets, read RPC URLs, sign, broadcast, deploy, mutate the vault, or move funds.

## Settlement

Executes matched trades.

Must verify:

- maker/taker or delegate signatures
- chain ID
- settlement contract address
- market enabled
- expiration
- nonce not used/cancelled
- price/amount constraints
- partial fill accounting
- available vault balances
- fee cap and fee recipient

The local `ISettlement.FillPacket` surface already carries `fillId`, order hashes, maker/taker, tokens, price, amounts, fees, maker/taker nonces, expiration, `chainId`, `settlementContract`, `feeRecipient`, `maxFeeBps`, signed maker/taker order amount caps, and cumulative fill accounting fields. `TradeSettled` exposes `fillId`, `marketId`, price, amounts, fees and fee recipient so the indexer/proof service can project final event truth.

Current local delegate-signing boundary: `Settlement` exposes a local `delegateKeyRegistry()` for tests and accepts a delegate signature only when the recovered signer is active for the fill owner, market, and quote notional and has `PLACE_ORDER`, `NO_WITHDRAW`, and `NO_ADMIN`. Delegate signatures consume the owner nonce namespace and cannot grant withdrawal or admin authority.

Current local market boundary: `Settlement` exposes a local `marketRegistry()` dependency whose market authority is the settlement deployer in the in-memory harness. A fill must reference an enabled MarketRegistry row whose base/quote token metadata matches the fill tokens and whose `minAmount` is satisfied; disabled, unknown, or token-mismatched markets reject before nonce consumption, cumulative fill accounting, vault movement, or `TradeSettled` proof emission.

Current local fee boundary: `Settlement` exposes a local `feeManager()` dependency whose fee authority and initial fee recipient are the settlement deployer in the in-memory harness. Nonzero fill fees must use the current `FeeManager.feeRecipient()`, respect the user-signed `maxFeeBps`, and stay under the market-specific `makerFeeBps`/`takerFeeBps` schedule before nonce consumption, cumulative fill accounting, vault movement, or `TradeSettled` proof emission.

## NonceManager

Replay protection and cancellation.

```solidity
cancelNonce(uint256 nonce)
cancelNonceRange(uint256 from, uint256 to)
isNonceUsed(address user, uint256 nonce)
markNonceUsed(address user, uint256 nonce, bytes32 orderHash)
```

`markNonceUsed` is a settlement-only hook in implementation; users cancel, settlement consumes.

## MarketRegistry

On-chain market metadata.

```solidity
addMarket(base, quote, pricePrecision, amountPrecision, minAmount)
disableMarket(marketId)
marketInfo(marketId)
proposeMarketAuthority(nextAuthority)
acceptMarketAuthority()
```

Current local listing authority starts Clonners-managed. `proposeMarketAuthority(nextAuthority)` plus `acceptMarketAuthority()` provide the future DAO/multisig handoff path, with `MarketAuthorityHandoffProposed` and `MarketAuthorityHandoffAccepted` as event truth. The old authority loses listing power after the proposed DAO/multisig accepts.

Admin functions should use timelock/multisig before production.

## FeeManager

Transparent maker/taker fees.

Rules:

- fees emit events on changes
- hard max fee cap exposed by `maxFeeBps()`
- no instant arbitrary admin fee increase
- timelock before production
- fee recipient is explicit in settlement events/proofs

Current read-only fee visibility: the read-only FeeManager fee schedule API envelope now exposes `GET /v1/fees` with `source: feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `feeManagerMutation: false`, `tradingVaultMutation: false`, `READ_ONLY`, `NO_WITHDRAW`, and `NO_ADMIN`. This is local/source-only metadata; it does no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, fee-authority runtime keys, TradingVault mutation, or funds movement. See [`docs/fees.md`](./fees.md).

## DelegateKeyRegistry

Safe API/bot access.

Permissions:

```text
READ_ONLY
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
NO_WITHDRAW
NO_ADMIN
```

There is intentionally no positive `WITHDRAW` or `ADMIN` delegate permission in the MVP interface.

Delegate fields:

```text
delegate address
expiresAt
allowedMarkets
maxNotional
permissions
revoked
```
