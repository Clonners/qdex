# TypeScript SDK Bot Contract

The TypeScript SDK is the first-class bot and market-maker client for QDex. It wraps the public/private REST API without changing custody semantics: API state is projection/cache, and final fill/proof truth comes from settlement/indexer projections.

## Client surface

```ts
const dex = new QDexClient({ baseUrl, wallet, delegateKey });

await dex.markets.list();
await dex.orderbook.get(marketId);
await dex.contracts.get(); // GET /v1/contracts
await dex.account.balances(); // GET /v1/account/balances -> mock-vault-projection, read-only, no wallet loaded, no funds moved
await dex.vault.deposits.list(); // GET /v1/vault/deposits -> source: tradingvault-event-projection, TradingVaultDepositProjection, READ_ONLY
await dex.vault.withdrawals.list(); // GET /v1/vault/withdrawals -> source: tradingvault-event-projection, TradingVaultWithdrawalProjection, READ_ONLY
await dex.vault.deposits.prepare({
  owner: '0xowner',
  assetSymbol: 'WQI',
  amount: '10',
  chainId: 0,
  vaultContractRef: 'local-only-not-deployed',
}); // POST /v1/vault/deposits/prepare -> owner_wallet_vault_deposit_not_implemented while prepare-only
await dex.vault.withdrawals.prepare({
  owner: '0xowner',
  assetSymbol: 'WQUAI',
  amount: '1',
  chainId: 0,
  vaultContractRef: 'local-only-not-deployed',
}); // POST /v1/vault/withdrawals/prepare -> owner_wallet_vault_withdrawal_not_implemented while prepare-only
await dex.listings.policy.get(); // GET /v1/listings/policy
await dex.listings.reviewFlow.get(); // GET /v1/listings/review-flow
await dex.listings.requests.prepareSubmit({
  baseSymbol: 'COMMUNITY',
  quoteSymbol: 'WQUAI',
  tokenModel: 'erc20-style-vault-token',
  requestedMarketId: 'COMMUNITY-WQUAI',
  pricePrecision: 8,
  amountPrecision: 8,
  minAmount: '1',
}); // POST /v1/listings/requests -> listing_request_not_implemented / not-implemented-approval-required while prepare-only
await dex.listings.requests.listLocalReviewQueue(); // GET /v1/listings/requests
await dex.listings.requests.enqueueLocalReview({
  baseSymbol: 'COMMUNITY',
  quoteSymbol: 'WQI',
  tokenModel: 'erc20-style-vault-token',
  requestedMarketId: 'COMMUNITY-WQI',
  pricePrecision: 8,
  amountPrecision: 8,
  minAmount: '1',
}); // POST /v1/listings/requests with requestMode: local_review_queue -> queued-local-review / pending-local-review
await dex.listings.requests.decideLocalReview('listing-request-000001', {
  decision: 'approve',
  reviewStage: 'clonners_local_approval',
  decisionNotes: 'metadata-only local approval',
}); // POST /v1/listings/requests/{requestId}/decision with decisionMode: local_review_decision -> reviewed-local-metadata-only / approved-local-metadata-only
await dex.relayer.settlementModeGate.get(); // GET /v1/relayer/settlement-mode-gate
await dex.nonces.prepareCancel({
  action: 'cancelNonce',
  owner: '0xowner',
  nonce: '42',
  chainId: 0,
  nonceManagerContract: '0xnonce-manager',
  expiresAt: 1780003600,
  signature: '0xowner-signature',
}); // POST /v1/nonces/cancel -> owner_signed_nonce_cancel_not_implemented while prepare-only

const limitOrder: SignedOrder = await dex.orders.createLimitOrder({
  marketId: 'QI-QUAI',
  side: 'buy',
  amount: '1000',
  price: '0.123',
});

const marketOrder: SignedOrder = await dex.orders.createMarketIocOrder({
  marketId: 'QI-QUAI',
  side: 'sell',
  quoteAmount: '100',
  maxSlippageBps: 50,
});

const orderResult: OrderSubmissionResult = await dex.orders.submitSignedOrder(limitOrder); // POST /v1/orders
const fillProjection: IndexedFillProjection | undefined = orderResult.fills[0];
type IndexedFillProjection = { projectionType: 'IndexedFillProjection'; sourceEventId: string };
const fillsStream = dex.fills.openStream({ timeoutMs: 2000 }); // /v1/ws?channel=fills
const fillsSnapshot = await fillsStream.next();
await fillsStream.close();
const ordersStream = dex.orders.openStream({ timeoutMs: 2000 }); // /v1/ws?channel=orders
const ordersSnapshot = await ordersStream.next();
await ordersStream.close();
const depositHistoryStream = dex.vault.deposits.openStream(); // /v1/ws?channel=deposits
const depositHistorySnapshot = await depositHistoryStream.next();
await depositHistoryStream.close();
const withdrawalHistoryStream = dex.vault.withdrawals.openStream(); // /v1/ws?channel=withdrawals
const withdrawalHistorySnapshot = await withdrawalHistoryStream.next();
await withdrawalHistoryStream.close();
await dex.vault.deposits.stream({ limit });
await dex.vault.withdrawals.stream({ limit });
const proof: TradeProof = await dex.proofs.trade(tradeId); // GET /v1/proofs/trades/:tradeId
await dex.orders.cancelAll({ marketId: 'QI-QUAI' });
```

`fills.openStream()` and `fills.stream()`/`fills.stream({ limit })` consume WebSocket snapshots only; they never grant withdrawal/admin authority and private snapshots must preserve `READ_ONLY`, `NO_WITHDRAW`, and `NO_ADMIN` permissions.

`orders.openStream()` and `orders.stream()`/`orders.stream({ limit })` consume `/v1/ws?channel=orders` snapshots and live matcher-local order updates. Cancellation events must keep `matcher-local-cancel-only-on-chain-nonce-unchanged`, `CANCEL_ORDER`/`CANCEL_ALL`, `NO_WITHDRAW`, and `NO_ADMIN` visible so bots do not mistake off-chain removal for on-chain `NonceManager` mutation.

`contracts.get()` is read-only contract-registry metadata from `GET /v1/contracts`. In local MVP mode it must preserve `local-only-not-deployed`, null contract addresses, `realQuaiTransactions: false`, `walletRequired: false`, and `NO_WITHDRAW`/`NO_ADMIN` delegate safety; it must not load wallets, send transactions, or imply deployment authority.

`account.balances()` is a read-only mock vault projection from `GET /v1/account/balances`. It returns `source: mock-vault-projection`, `settlementMode: mock`, `permissions: [READ_ONLY, NO_WITHDRAW, NO_ADMIN]`, `realQuaiTransactions: false`, and `walletRequired: false`; it has no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.

`vault.deposits.list()` and `vault.withdrawals.list()` expose read-only TradingVault event history from `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals`. The envelopes return `source: tradingvault-event-projection`, `projectionType: TradingVaultDepositProjection` / `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false` with mock-null tx/block/event/explorer evidence. These clients preserve no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and do not mutate TradingVault.

`vault.deposits.openStream()` / `vault.withdrawals.openStream()` and `vault.deposits.stream({ limit })` / `vault.withdrawals.stream({ limit })` consume private vault history snapshots from `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals`. Stream snapshots preserve `source: tradingvault-event-projection`, `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `fundsMoved: false`, and `tradingVaultMutation: false` with no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`vault.deposits.prepare()` and `vault.withdrawals.prepare()` expose the owner-wallet TradingVault prepare-only boundary through `POST /v1/vault/deposits/prepare` and `POST /v1/vault/withdrawals/prepare`. They intentionally return the API placeholder envelopes `owner_wallet_vault_deposit_not_implemented` / `owner_wallet_vault_withdrawal_not_implemented` with `source: owner-wallet-vault-operation-placeholder`, `custody: non-custodial-contract-vault`, `operationStatus: prepare-only-not-implemented`, `ownerAuthorization: owner-wallet-required`, `delegateAuthority: delegates-cannot-deposit-or-withdraw`, `NO_WITHDRAW`, `NO_ADMIN`, `fundsMoved: false`, and `tradingVaultMutation: false`. The clients treat HTTP 501 as a boundary response and preserve no wallet/RPC/sign/broadcast/deploy/tx/funds behavior.

The contract registry also exposes `listedAssetStatus`: `status: wrapped-token-listing`, `primaryQuoteAssets: [WQUAI, WQI]`, `supportedAssetModel: erc20-style-vault-token`, and `userListedTokens: true`. Listing policy metadata is already exposed through GET /v1/listings/policy; listing requests remain prepare-only through POST /v1/listings/requests; runtime listing submission or MarketRegistry admin mutation requires explicit Clonners approval; native Qi direct settlement is out of scope and the Qi-facing token surface is WQI. The `listedAssetStatus.safetyNotice` must say the MVP settles listed vault tokens such as WQUAI, WQI, and approved community tokens, with no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real native Qi settlement claim.

`listings.policy.get()` is a read-only listing-policy client for `GET /v1/listings/policy`. It returns `source: listed-asset-marketregistry-policy`, `status: design-only-local-metadata`, WQUAI/WQI primary quote assets, `community-created-erc20-style-token` metadata, and `MarketRegistry-enabled-pair-metadata` truth labels. The policy client must preserve `NO_WITHDRAW`/`NO_ADMIN` delegate safety, must not expose listing submission or listing-admin runtime helpers, and must say there is no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds. MarketRegistry metadata can enable/disable approved pairs only; it cannot move TradingVault balances or grant withdrawal/admin power.

`listings.reviewFlow.get()` is a read-only local review state-machine client for `GET /v1/listings/review-flow`. It returns `source: listed-asset-marketregistry-review-flow`, `status: design-only-local-metadata`, `phase: clonners-managed-local-review-before-dao`, local statuses such as `approved-local-metadata-only` / `rejected-local-metadata-only`, and `marketRegistryMutation: false`. It preserves `NO_WITHDRAW`/`NO_ADMIN`, has no wallets/RPC/signing/broadcast/deploy/tx/funds behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`listings.requests.prepareSubmit()` is a prepare-only client for `POST /v1/listings/requests`. It intentionally returns the API placeholder response `listing_request_not_implemented` with `requestStatus: not-implemented-approval-required`, `source: listed-asset-marketregistry-policy`, `status: design-only-local-metadata`, WQUAI/WQI quote framing, `community-created-erc20-style-token`, `NO_WITHDRAW`, and `NO_ADMIN`. The client must treat the intentional 501 as a boundary response, not a generic transport failure and not proof of submission; it preserves no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior and does not prove a listing request was submitted on-chain.

`listings.requests.listLocalReviewQueue()` and `listings.requests.enqueueLocalReview()` expose the approved local listing review queue only. `listLocalReviewQueue()` calls `GET /v1/listings/requests`; `enqueueLocalReview()` calls `POST /v1/listings/requests with requestMode: local_review_queue` and returns `local-in-memory-review-queue`, `in-memory-local-server-only`, `queued-local-review`, and `pending-local-review` metadata from `listed-asset-marketregistry-review-flow`. These clients preserve `NO_WITHDRAW`/`NO_ADMIN`, have no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`listings.requests.decideLocalReview()` records immutable local review decision metadata for an existing in-memory queued request through `POST /v1/listings/requests/{requestId}/decision`. The client supplies `decisionMode: local_review_decision` and surfaces `reviewed-local-metadata-only`, `approved-local-metadata-only` / `rejected-local-metadata-only`, and `nextMutationGate: explicit Clonners approval required before MarketRegistry.addMarket`; it preserves `NO_WITHDRAW`/`NO_ADMIN`, has no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`relayer.settlementModeGate.get()` is read-only relayer gate metadata from `GET /v1/relayer/settlement-mode-gate`. It exposes `source: relayer-approval-gate`, `currentSettlementMode: mock`, and the blocked `quai_contract` result `real_quai_approval_gate_blocked` so bots/operators can inspect readiness without wallet loading, signing, broadcast, RPC URL access, or transaction submission.

`nonces.prepareCancel()` is a prepare-only client for `POST /v1/nonces/cancel`. It intentionally surfaces the API placeholder response `owner_signed_nonce_cancel_not_implemented` with `owner-signed-required`, `NO_WITHDRAW`, and `NO_ADMIN`; it performs no wallet loading, signing, broadcast, or relayer submission and must not be confused with matcher-local `orders.cancelAll`.

## Order semantics

- `createLimitOrder` signs a replay-safe `SignedOrder` for a normal limit order.
- `createMarketIocOrder` creates a `market_ioc` IOC limit order, not an unbounded market order.
- Every `market_ioc` order carries signed price/slippage bounds through `maxSlippageBps`.
- `submitSignedOrder` sends the exact signed payload to `POST /v1/orders`; the SDK must not rewrite price, amount, nonce, owner, delegate, chain, or settlement contract fields after signing.
- `OrderSubmissionResult` is the API response shape: it contains order state plus zero or more `IndexedFillProjection` rows projected from confirmed/mock-confirmed settlement.
- OrderSubmissionResult.fills are public IndexedFillProjection rows and each row must carry `projectionType: 'IndexedFillProjection'` plus `sourceEventId`.
- `submitSignedOrder` must not expose the matcher/relayer `FillPacket` handoff object as its public return type.
- `orders.cancelAll({ marketId })` calls `POST /v1/orders/cancel-all`; in local mock mode it cancels only matcher-open quantity, carries `CANCEL_ALL`, `CANCEL_ORDER`, `NO_WITHDRAW`, and `NO_ADMIN`, and does not cancel on-chain NonceManager nonces without a separate owner-signed flow.

## Delegate/API key safety

Delegate keys default to NO_WITHDRAW and NO_ADMIN.

A delegate key may include:

```text
allowedMarkets
maxNotional
expiresAt
READ_ONLY
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
NO_WITHDRAW
NO_ADMIN
```

Delegate keys cannot withdraw funds. Withdrawals require the main wallet or a separate future high-trust flow outside the bot SDK contract. The SDK must not expose a delegate-key withdrawal helper.

## Proof contract

The SDK consumes `TradeProof` as a read-only projection:

- `FillPacket` is an internal matcher/relayer handoff object, not a public SDK/API order response.
- `IndexedFillProjection` rows are public only after confirmed settlement/indexer truth and must carry `sourceEventId`.
- `TradeProof` is final only when backed by confirmed settlement/indexer truth.
- In local mock mode, proof responses keep `settlementMode: mock`, include a mock reference, and must not claim a real Quai transaction or moved funds.
