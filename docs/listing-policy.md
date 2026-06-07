# Token Listing and MarketRegistry Metadata Policy

## Goal

Define the token listing and MarketRegistry metadata flow for QDEX without adding runtime listing behavior, wallets, RPCs, deployments, transactions, or custody authority.

The MVP asset plane is WQUAI, WQI, and community-created ERC-20-style vault tokens. The first real listed market shape is expected to be `WQI-WQUAI`, while the old `QI-QUAI` fixture can remain a mock-only demo label until all UI/SDK fixtures are migrated.

## Asset model

- `WQUAI` is the QUAI-facing wrapped/tokenized vault asset.
- `WQI` is the Qi-facing vault asset; raw native Qi direct settlement is out of scope for this campaign.
- Community-created ERC-20-style vault tokens can become listable after review.
- All listed assets must behave as ERC-20-style vault tokens before `TradingVault.deposit(token, amount)` is treated as real.

## MarketRegistry boundary

`MarketRegistry` is market metadata/enabled-pair truth, not custody truth.

`TradingVault` remains the only vault-balance surface. Listing a token pair can make a market visible or disabled, but it cannot move user balances, unlock funds, withdraw funds, change settlement balances, or grant delegate/admin authority.

Allowed metadata transitions:

```text
submit-token-metadata
review-token-safety
define-precision-and-minimums
MarketRegistry.addMarket after approval
MarketRegistry.disableMarket if needed
```

Contract surfaces:

- `addMarket` records approved base/quote metadata, precision, and minimum amount.
- `disableMarket` disables an existing market without erasing metadata required for indexer replay.
- `marketInfo` is read-only market metadata for API, SDK, CLI, and indexer projections.

## Non-custodial invariants

- Listing/admin metadata cannot move user balances.
- Listing/admin metadata cannot grant withdrawal authority.
- Delegate/API keys stay trading-only and must preserve `NO_WITHDRAW` and `NO_ADMIN`.
- `MarketRegistry` may enable/disable metadata only; `Settlement` and `TradingVault` enforce actual fill and balance rules.
- `TradeSettled` remains the public trade-proof trigger.

## Read-only API status

`GET /v1/listings/policy` is a read-only metadata endpoint for the current autonomous slice. It is intentionally not a listing submission endpoint.

Required safety metadata:

```text
source: listed-asset-marketregistry-policy
status: design-only-local-metadata
assetModel: erc20-style-vault-token
primaryQuoteAssets: WQUAI, WQI
realQuaiTransactions: false
walletRequired: false
```

This surface performs no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds movement.

## Explicitly out of scope

- Direct native Qi settlement inside `TradingVault`.
- Wallet/key loading or order/admin signing.
- RPC URL reads, broadcasts, deploys, or transaction submission.
- Any listing path that can sweep, rescue, withdraw, unlock, or settle user funds.
