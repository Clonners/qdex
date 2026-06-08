# TypeScript SDK

First-class client for bots, market makers and frontend code.

Smoke stub available now:

```ts
import { QDexClient, createMockSignedOrder, runMockCrossSmoke } from '@qdex/sdk-typescript';

const dex = new QDexClient({ baseUrl: 'http://127.0.0.1:8787' });
const contractRegistry = await dex.contracts.get();
const fees = await dex.fees.get();
const accountOverview = await dex.account.get();
const accountBalances = await dex.account.balances();
const tickerStream = dex.tickers.openStream({ timeoutMs: 2000 });
const initialTickerSnapshot = await tickerStream.next();
await tickerStream.close();
const boundedTickerSnapshots = await dex.tickers.stream({ limit: 1 });
const depthStream = dex.orderbook.openStream('QI-QUAI', { timeoutMs: 2000 });
const initialDepthSnapshot = await depthStream.next();
await depthStream.close();
const boundedDepthSnapshots = await dex.orderbook.stream('QI-QUAI', { limit: 1 });
const oneMinuteKlines = await dex.klines.get('QI-QUAI', { interval: '1m' }); // /v1/klines/<MARKET>?interval=1m
const klineStream = dex.klines.openStream('QI-QUAI', { interval: '1m', timeoutMs: 2000 }); // /v1/ws?channel=market.<MARKET>.klines.1m
const initialKlineSnapshot = await klineStream.next();
await klineStream.close();
const boundedKlineSnapshots = await dex.klines.stream('QI-QUAI', { interval: '1m', limit: 1 });
const tradeStream = dex.trades.openStream('QI-QUAI', { timeoutMs: 2000 });
const initialTradeSnapshot = await tradeStream.next();
await tradeStream.close();
const boundedTradeSnapshots = await dex.trades.stream('QI-QUAI', { limit: 1 });
const vaultDeposits = await dex.vault.deposits.list();
const vaultWithdrawals = await dex.vault.withdrawals.list();
const vaultDepositPrepare = await dex.vault.deposits.prepare({
  owner: '0x1111111111111111111111111111111111111111',
  assetSymbol: 'WQI',
  amount: '10',
  chainId: 0,
  vaultContractRef: 'local-only-not-deployed',
});
const vaultWithdrawalPrepare = await dex.vault.withdrawals.prepare({
  owner: '0x1111111111111111111111111111111111111111',
  assetSymbol: 'WQUAI',
  amount: '1',
  chainId: 0,
  vaultContractRef: 'local-only-not-deployed',
});
const listingPolicy = await dex.listings.policy.get();
const listingReviewFlow = await dex.listings.reviewFlow.get();
const listingRequestPrepare = await dex.listings.requests.prepareSubmit({
  baseSymbol: 'COMMUNITY',
  quoteSymbol: 'WQUAI',
  tokenModel: 'erc20-style-vault-token',
  requestedMarketId: 'COMMUNITY-WQUAI',
  pricePrecision: 8,
  amountPrecision: 8,
  minAmount: '1',
  reviewNotes: 'metadata-only local request',
});
const listingReviewQueue = await dex.listings.requests.listLocalReviewQueue();
const queuedListingRequest = await dex.listings.requests.enqueueLocalReview({
  baseSymbol: 'COMMUNITY',
  quoteSymbol: 'WQI',
  tokenModel: 'erc20-style-vault-token',
  requestedMarketId: 'COMMUNITY-WQI',
  pricePrecision: 8,
  amountPrecision: 8,
  minAmount: '1',
  reviewNotes: 'metadata-only local review queue request',
});
const listingReviewDecision = await dex.listings.requests.decideLocalReview(queuedListingRequest.body.requestId, {
  decision: 'approve',
  reviewStage: 'clonners_local_approval',
  decisionNotes: 'metadata-only local approval',
});
const relayerGate = await dex.relayer.settlementModeGate.get();
const nonceCancelPrepare = await dex.nonces.prepareCancel({
  action: 'cancelNonce',
  owner: '0x1111111111111111111111111111111111111111',
  nonce: '77',
  chainId: 0,
  nonceManagerContract: '0x0000000000000000000000000000000000000000',
  expiresAt: 1780003600,
  signature: '0xowner-signed-placeholder',
});
const delegateKeyPrepare = await dex.delegateKeys.prepareRegister({
  owner: '0x1111111111111111111111111111111111111111',
  delegate: '0x3333333333333333333333333333333333333333',
  allowedMarkets: ['QI-QUAI'],
  maxNotional: '1000',
  permissions: ['PLACE_ORDER', 'CANCEL_ORDER', 'CANCEL_ALL', 'NO_WITHDRAW', 'NO_ADMIN'],
  expiresAt: 1780003600,
  signature: '0xowner-signed-placeholder',
});
const delegateKeyRevocationPrepare = await dex.delegateKeys.prepareRevoke('bot-mm-1', {
  owner: '0x1111111111111111111111111111111111111111',
  signature: '0xowner-signed-placeholder',
});
const delegateKeyRegistrations = await dex.delegateKeys.listRegistrations();
const delegateKeyRevocations = await dex.delegateKeys.listRevocations();
const fillsStream = dex.fills.openStream({ timeoutMs: 2000 });
const initialFillsSnapshot = await fillsStream.next();
await fillsStream.close();
const ordersStream = dex.orders.openStream({ timeoutMs: 2000 });
const initialOrdersSnapshot = await ordersStream.next();
await ordersStream.close();
const depositHistoryStream = dex.vault.deposits.openStream({ timeoutMs: 2000 });
const initialDepositHistorySnapshot = await depositHistoryStream.next();
await depositHistoryStream.close();
const withdrawalHistoryStream = dex.vault.withdrawals.openStream({ timeoutMs: 2000 });
const initialWithdrawalHistorySnapshot = await withdrawalHistoryStream.next();
await withdrawalHistoryStream.close();
const delegateKeyRegistrationStream = dex.delegateKeys.registrations.openStream({ timeoutMs: 2000 });
const initialDelegateKeyRegistrationSnapshot = await delegateKeyRegistrationStream.next();
await delegateKeyRegistrationStream.close();
const delegateKeyRevocationStream = dex.delegateKeys.revocations.openStream({ timeoutMs: 2000 });
const initialDelegateKeyRevocationSnapshot = await delegateKeyRevocationStream.next();
await delegateKeyRevocationStream.close();
const feeScheduleStream = dex.fees.openStream({ timeoutMs: 2000 });
const initialFeeScheduleSnapshot = await feeScheduleStream.next();
await feeScheduleStream.close();
const boundedFeeScheduleSnapshots = await dex.fees.stream({ limit: 1 });

const result = await runMockCrossSmoke(dex, {
  restingSell: createMockSignedOrder({ side: 'sell', amount: '100', price: '5', nonce: '1' }),
  crossingBuy: createMockSignedOrder({ side: 'buy', amount: '100', price: '6', nonce: '2' }),
});

console.log(contractRegistry.deploymentStatus); // local-only-not-deployed
console.log(accountBalances.source); // mock-vault-projection
console.log(accountBalances.permissions); // READ_ONLY, NO_WITHDRAW, NO_ADMIN
console.log(accountBalances.settlementMode); // mock
console.log(vaultDeposits.source); // source: tradingvault-event-projection
console.log(vaultDeposits.projectionType); // TradingVaultDepositProjection
console.log(vaultDeposits.permissions); // READ_ONLY, NO_WITHDRAW, NO_ADMIN
console.log(vaultDeposits.settlementMode); // settlementMode: mock
console.log(vaultDeposits.realQuaiTransactions); // realQuaiTransactions: false
console.log(vaultDeposits.walletRequired); // walletRequired: false
console.log(vaultDeposits.fundsMoved); // fundsMoved: false
console.log(vaultDeposits.tradingVaultMutation); // tradingVaultMutation: false
console.log(vaultWithdrawals.source); // GET /v1/vault/withdrawals, source: tradingvault-event-projection
console.log(vaultWithdrawals.projectionType); // TradingVaultWithdrawalProjection
console.log(vaultDepositPrepare.status); // 501
console.log(vaultDepositPrepare.body.error); // owner_wallet_vault_deposit_not_implemented
console.log(vaultDepositPrepare.body.source); // owner-wallet-vault-operation-placeholder
console.log(vaultDepositPrepare.body.custody); // non-custodial-contract-vault
console.log(vaultDepositPrepare.body.operationStatus); // prepare-only-not-implemented
console.log(vaultDepositPrepare.body.ownerAuthorization); // owner-wallet-required
console.log(vaultDepositPrepare.body.delegateAuthority); // delegates-cannot-deposit-or-withdraw
console.log(vaultDepositPrepare.body.permissions); // NO_WITHDRAW, NO_ADMIN
console.log(vaultDepositPrepare.body.fundsMoved); // fundsMoved: false
console.log(vaultDepositPrepare.body.tradingVaultMutation); // tradingVaultMutation: false
console.log(vaultWithdrawalPrepare.body.error); // owner_wallet_vault_withdrawal_not_implemented
console.log(contractRegistry.listedAssetStatus.status); // wrapped-token-listing
console.log(contractRegistry.listedAssetStatus.primaryQuoteAssets); // WQUAI, WQI
console.log(contractRegistry.listedAssetStatus.supportedAssetModel); // erc20-style-vault-token
console.log(contractRegistry.listedAssetStatus.nativeQiTreatment); // out-of-scope-direct-settlement-use-WQI
console.log(fees.source); // GET /v1/fees, feemanager-policy-projection
console.log(fees.feeSchedules[0].projectionType); // FeeScheduleProjection
console.log(fees.feeSchedules[0].eventName); // eventName: FeesUpdated
console.log(fees.hardMaxFeeBps); // hardMaxFeeBps: 1000
console.log(fees.feeRecipient); // feeRecipient: null
console.log(fees.permissions); // READ_ONLY, NO_WITHDRAW, NO_ADMIN
console.log(fees.feeManagerMutation); // feeManagerMutation: false
console.log(fees.tradingVaultMutation); // tradingVaultMutation: false
console.log(fees.safety.notice); // read-only FeeManager metadata
console.log(accountOverview.source); // mock-account-overview
console.log(accountOverview.session.mode); // mock-local-no-wallet-session
console.log(accountOverview.balances.source); // mock-vault-projection
console.log(accountOverview.orders.source); // mock-order-projection
console.log(accountOverview.fills.projectionType); // IndexedFillProjection
console.log(accountOverview.permissions); // READ_ONLY, NO_WITHDRAW, NO_ADMIN
console.log(accountOverview.settlementMode); // settlementMode: mock
console.log(accountOverview.realQuaiTransactions); // realQuaiTransactions: false
console.log(accountOverview.walletRequired); // walletRequired: false
console.log(accountOverview.fundsMoved); // fundsMoved: false
console.log(accountOverview.tradingVaultMutation); // tradingVaultMutation: false
console.log(accountBalances.source); // mock-vault-projection
console.log(initialTickerSnapshot.snapshot.channel); // /v1/ws?channel=global.tickers
console.log(initialTickerSnapshot.snapshot.payload); // ticker_snapshot
console.log(initialTickerSnapshot.snapshot.custody); // public-read-only-no-custody
console.log(initialTickerSnapshot.snapshot.source); // mock-market-data
console.log(boundedTickerSnapshots[0].snapshot.data.tickers[0].source); // mock-market-data
console.log(initialDepthSnapshot.snapshot.channel); // /v1/ws?channel=market.<MARKET>.depth
console.log(initialDepthSnapshot.snapshot.payload); // orderbook_depth
console.log(initialDepthSnapshot.snapshot.source); // mock-orderbook
console.log(boundedDepthSnapshots[0].snapshot.custody); // public-read-only-no-custody
console.log(oneMinuteKlines.source); // mock-candle-projection
console.log(initialKlineSnapshot.snapshot.channel); // /v1/ws?channel=market.<MARKET>.klines.1m
console.log(initialKlineSnapshot.snapshot.payload); // kline_snapshot
console.log(initialKlineSnapshot.snapshot.source); // mock-candle-projection
console.log(boundedKlineSnapshots[0].snapshot.data.interval); // 1m
console.log(initialTradeSnapshot.snapshot.channel); // /v1/ws?channel=market.<MARKET>.trades
console.log(initialTradeSnapshot.snapshot.payload); // trade_projection
console.log(initialTradeSnapshot.snapshot.source); // in-memory-indexer-projection
console.log(boundedTradeSnapshots[0].snapshot.data.source); // in-memory-indexer-projection
console.log(listingPolicy.status); // design-only-local-metadata
console.log(listingPolicy.primaryQuoteAssets); // WQUAI, WQI
console.log(listingPolicy.supportedAssets[2].symbol); // community-created-erc20-style-token
console.log(listingPolicy.marketRegistry.truthSource); // MarketRegistry-enabled-pair-metadata
console.log(listingPolicy.safety.delegatePermissions); // NO_WITHDRAW, NO_ADMIN
console.log(listingReviewFlow.source); // listed-asset-marketregistry-review-flow
console.log(listingReviewFlow.status); // design-only-local-metadata
console.log(listingReviewFlow.phase); // clonners-managed-local-review-before-dao
console.log(listingReviewFlow.approvalOutcome.approvedStatus); // approved-local-metadata-only
console.log(listingReviewFlow.approvalOutcome.rejectedStatus); // rejected-local-metadata-only
console.log(listingReviewFlow.safety.permissions); // NO_WITHDRAW, NO_ADMIN
console.log(listingRequestPrepare.status); // 501
console.log(listingRequestPrepare.body.error); // listing_request_not_implemented
console.log(listingRequestPrepare.body.requestStatus); // not-implemented-approval-required
console.log(listingRequestPrepare.body.source); // listed-asset-marketregistry-policy
console.log(listingRequestPrepare.body.status); // design-only-local-metadata
console.log(listingRequestPrepare.body.primaryQuoteAssets); // WQUAI, WQI
console.log(listingRequestPrepare.body.supportedAsset); // community-created-erc20-style-token
console.log(listingRequestPrepare.body.permissions); // NO_WITHDRAW, NO_ADMIN
console.log(listingRequestPrepare.body.marketRegistry.marketRegistryMutation); // false
console.log(listingReviewQueue.queueStatus); // local-in-memory-review-queue
console.log(listingReviewQueue.persistence); // in-memory-local-server-only
console.log(queuedListingRequest.status); // 202
console.log(queuedListingRequest.body.requestStatus); // queued-local-review
console.log(queuedListingRequest.body.reviewDecision); // pending-local-review
console.log(queuedListingRequest.body.permissions); // NO_WITHDRAW, NO_ADMIN
console.log(listingReviewDecision.status); // 200
console.log(listingReviewDecision.body.decisionMode); // decisionMode: local_review_decision
console.log(listingReviewDecision.body.requestStatus); // reviewed-local-metadata-only
console.log(listingReviewDecision.body.reviewDecision); // approved-local-metadata-only
console.log(listingReviewDecision.body.nextMutationGate); // explicit Clonners approval required before MarketRegistry.addMarket
console.log(listingReviewDecision.body.permissions); // NO_WITHDRAW, NO_ADMIN
console.log(relayerGate.source); // relayer-approval-gate
console.log(relayerGate.currentSettlementMode); // currentSettlementMode: mock
console.log(relayerGate.modes.quai_contract.reason); // real_quai_approval_gate_blocked
console.log(nonceCancelPrepare.status); // 501
console.log(nonceCancelPrepare.body.error); // owner_signed_nonce_cancel_not_implemented
console.log(nonceCancelPrepare.body.nonceManager); // owner-signed-required
console.log(nonceCancelPrepare.body.permissions); // NO_WITHDRAW, NO_ADMIN
console.log(delegateKeyPrepare.status); // 501
console.log(delegateKeyPrepare.body.error); // delegate_key_registration_not_implemented
console.log(delegateKeyPrepare.body.source); // delegate-key-owner-signed-prepare-boundary
console.log(delegateKeyPrepare.body.operationStatus); // prepare-only-owner-signed-required
console.log(delegateKeyPrepare.body.ownerAuthorization); // owner-wallet-signature-required
console.log(delegateKeyPrepare.body.delegateCanWithdraw); // delegateCanWithdraw: false
console.log(delegateKeyRegistrations.source); // GET /v1/delegate-keys/registrations, delegatekeyregistry-event-projection
console.log(delegateKeyRegistrations.projectionType); // DelegateKeyRegisteredProjection
console.log(delegateKeyRegistrations.delegateKeyRegistryMutation); // delegateKeyRegistryMutation: false
console.log(delegateKeyRevocations.projectionType); // GET /v1/delegate-keys/revocations, DelegateKeyRevokedProjection
console.log(delegateKeyPrepare.body.delegateCanAdmin); // delegateCanAdmin: false
console.log(delegateKeyRevocationPrepare.body.error); // delegate_key_revocation_not_implemented
console.log(initialFillsSnapshot.snapshot.permissions); // READ_ONLY, NO_WITHDRAW, NO_ADMIN
console.log(initialOrdersSnapshot.snapshot.channel); // orders
console.log(initialDepositHistorySnapshot.snapshot.channel); // /v1/ws?channel=deposits
console.log(initialDepositHistorySnapshot.snapshot.source); // tradingvault-event-projection
console.log(initialDepositHistorySnapshot.snapshot.projectionType); // TradingVaultDepositProjection
console.log(initialWithdrawalHistorySnapshot.snapshot.channel); // /v1/ws?channel=withdrawals
console.log(initialWithdrawalHistorySnapshot.snapshot.projectionType); // TradingVaultWithdrawalProjection
console.log(initialWithdrawalHistorySnapshot.snapshot.permissions); // READ_ONLY, NO_WITHDRAW, NO_ADMIN
console.log(initialDelegateKeyRegistrationSnapshot.snapshot.channel); // /v1/ws?channel=delegate-key-registrations
console.log(initialDelegateKeyRegistrationSnapshot.snapshot.source); // delegatekeyregistry-event-projection
console.log(initialDelegateKeyRegistrationSnapshot.snapshot.projectionType); // DelegateKeyRegisteredProjection
console.log(initialDelegateKeyRegistrationSnapshot.snapshot.delegateCanWithdraw); // delegateCanWithdraw: false
console.log(initialDelegateKeyRevocationSnapshot.snapshot.channel); // /v1/ws?channel=delegate-key-revocations
console.log(initialDelegateKeyRevocationSnapshot.snapshot.projectionType); // DelegateKeyRevokedProjection
console.log(initialDelegateKeyRevocationSnapshot.snapshot.delegateCanAdmin); // delegateCanAdmin: false
console.log(initialDelegateKeyRevocationSnapshot.snapshot.delegateKeyRegistryMutation); // delegateKeyRegistryMutation: false
console.log(initialFeeScheduleSnapshot.snapshot.channel); // /v1/ws?channel=fees
console.log(initialFeeScheduleSnapshot.snapshot.payload); // fee_schedule_projection
console.log(initialFeeScheduleSnapshot.snapshot.custody); // public-read-only-no-custody
console.log(initialFeeScheduleSnapshot.snapshot.data.source); // feemanager-policy-projection
console.log(initialFeeScheduleSnapshot.snapshot.data.feeSchedules[0].projectionType); // FeeScheduleProjection
console.log(initialFeeScheduleSnapshot.snapshot.data.permissions); // READ_ONLY, NO_WITHDRAW, NO_ADMIN
console.log(boundedFeeScheduleSnapshots[0].snapshot.data.feeManagerMutation); // feeManagerMutation: false
console.log(boundedFeeScheduleSnapshots[0].snapshot.data.tradingVaultMutation); // tradingVaultMutation: false
console.log(result.fill.projectionType); // IndexedFillProjection
console.log(result.fill.sourceEventId);
console.log(result.proof.settlementMode); // mock
```

`contracts.get()` calls `GET /v1/contracts` and returns local-only contract metadata with null addresses, `realQuaiTransactions: false`, `walletRequired: false`, and no deploy/transaction side effects. `contractRegistry.listedAssetStatus.status` is `wrapped-token-listing`; primary quote assets are `WQUAI` and `WQI`. Listing policy metadata is already exposed through GET /v1/listings/policy; listing requests remain prepare-only through POST /v1/listings/requests; runtime listing submission or MarketRegistry admin mutation requires explicit Clonners approval. Approved community-created tokens are listable only through those approval-gated metadata surfaces, and raw native Qi direct settlement is out of scope. The safety notice preserves: no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real native Qi settlement claim.

`dex.fees.get()` calls `GET /v1/fees` and returns read-only FeeManager fee schedule metadata with `source: feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, and `tradingVaultMutation: false`. It has no wallet/RPC/signing/broadcast/deploy/tx/funds behavior, no fee-authority runtime keys, and no live FeeManager or TradingVault mutation authority.

`dex.fees.openStream` and `dex.fees.stream` consume public `/v1/ws?channel=fees` snapshots for bounded bot/operator FeeManager policy monitoring. Messages carry `payload: fee_schedule_projection`, `custody: public-read-only-no-custody`, `source: feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, and `tradingVaultMutation: false`; the stream helpers do not load wallets, read RPC URLs, sign, broadcast, deploy, submit transactions, move funds, or expose fee-authority runtime keys.

`dex.tickers.openStream` and `dex.tickers.stream` consume public ticker snapshots from `/v1/ws?channel=global.tickers`; messages carry `ticker_snapshot`, `public-read-only-no-custody`, and `mock-market-data`. `dex.orderbook.openStream` and `dex.orderbook.stream` consume `/v1/ws?channel=market.<MARKET>.depth`; messages carry `orderbook_depth`, `public-read-only-no-custody`, and `mock-orderbook`. `dex.trades.openStream` and `dex.trades.stream` consume `/v1/ws?channel=market.<MARKET>.trades`; messages carry `trade_projection`, `public-read-only-no-custody`, and `in-memory-indexer-projection` / `confirmed-settlement-only` trade projection semantics. These public market-data helpers preserve no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`dex.account.get()` calls `GET /v1/account` and returns the read-only `mock-account-overview` envelope with `mock-local-no-wallet-session`, nested `mock-vault-projection` balances, matcher-local `mock-order-projection` open orders, confirmed-only `IndexedFillProjection` rows, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`. It has no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and cannot grant delegate withdrawal/admin authority.

`dex.account.balances()` calls `GET /v1/account/balances` and returns the read-only `mock-vault-projection` envelope with `settlementMode: mock`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, and `walletRequired: false`. It has no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.

`dex.vault.deposits.list()` and `dex.vault.withdrawals.list()` call `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals` and return read-only `source: tradingvault-event-projection` history envelopes. They expose `TradingVaultDepositProjection` / `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false` with mock-null event evidence and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`dex.vault.deposits.openStream` and `dex.vault.withdrawals.openStream` consume private vault history snapshots from `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals`. Bounded `stream({ limit })` helpers expose the same `tradingvault-event-projection` snapshots with `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `fundsMoved: false`, and `tradingVaultMutation: false`; there is no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`dex.vault.deposits.prepare()` and `dex.vault.withdrawals.prepare()` call `POST /v1/vault/deposits/prepare` and `POST /v1/vault/withdrawals/prepare` and return the intentional 501 owner-wallet placeholders (`owner_wallet_vault_deposit_not_implemented` / `owner_wallet_vault_withdrawal_not_implemented`). The envelope preserves `source: owner-wallet-vault-operation-placeholder`, `custody: non-custodial-contract-vault`, `operationStatus: prepare-only-not-implemented`, `ownerAuthorization: owner-wallet-required`, `delegateAuthority: delegates-cannot-deposit-or-withdraw`, `NO_WITHDRAW`, `NO_ADMIN`, `fundsMoved: false`, and `tradingVaultMutation: false`; the SDK treats the placeholder as a boundary response with no wallet/RPC/sign/broadcast/deploy/tx/funds behavior.

`dex.listings.policy.get()` calls `GET /v1/listings/policy` and returns read-only `listed-asset-marketregistry-policy` / `design-only-local-metadata` for WQUAI, WQI, and `community-created-erc20-style-token` assets. It exposes `MarketRegistry-enabled-pair-metadata`, `NO_WITHDRAW`, and `NO_ADMIN` safety only; there is no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds, and the metadata cannot move TradingVault balances or grant withdrawal/admin power.

`dex.listings.reviewFlow.get()` calls `GET /v1/listings/review-flow` and returns read-only `listed-asset-marketregistry-review-flow` / `design-only-local-metadata` for `phase: clonners-managed-local-review-before-dao`. It exposes local-only review statuses like `approved-local-metadata-only` and `rejected-local-metadata-only`, keeps `NO_WITHDRAW` and `NO_ADMIN`, has no wallets/RPC/signing/broadcast/deploy/tx/funds behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`dex.listings.requests.prepareSubmit()` calls `POST /v1/listings/requests` and returns the prepare-only 501 placeholder body (`listing_request_not_implemented`, `not-implemented-approval-required`, `listed-asset-marketregistry-policy`, `design-only-local-metadata`) for WQUAI/WQI `community-created-erc20-style-token` metadata. This client treats the intentional 501 as a boundary response, not as a generic transport failure and not as proof of submission: it preserves `NO_WITHDRAW`/`NO_ADMIN`, no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and does not prove a listing request was submitted on-chain.

`dex.listings.requests.listLocalReviewQueue()` calls `GET /v1/listings/requests`, and `dex.listings.requests.enqueueLocalReview()` calls `POST /v1/listings/requests with requestMode: local_review_queue`. The local queue surface returns `listed-asset-marketregistry-review-flow`, `local-in-memory-review-queue`, `in-memory-local-server-only`, `queued-local-review`, and `pending-local-review` metadata only. It preserves `NO_WITHDRAW`/`NO_ADMIN`, has no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior, and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`dex.listings.requests.decideLocalReview()` calls `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision` and records immutable local review metadata only. The response carries `reviewed-local-metadata-only`, `approved-local-metadata-only` / `rejected-local-metadata-only`, `explicit Clonners approval required before MarketRegistry.addMarket`, `NO_WITHDRAW`, and `NO_ADMIN`; it has no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior and cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power.

`dex.relayer.settlementModeGate.get()` calls `GET /v1/relayer/settlement-mode-gate` and returns read-only `relayer-approval-gate` metadata for `currentSettlementMode: mock` plus the blocked `quai_contract` reason `real_quai_approval_gate_blocked`; it performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.

`dex.nonces.prepareCancel()` calls `POST /v1/nonces/cancel` and returns the prepare-only 501 placeholder body (`owner_signed_nonce_cancel_not_implemented`, `owner-signed-required`, `NO_WITHDRAW`, `NO_ADMIN`) with no wallet loading, signing, broadcast, or relayer submission.

`dex.delegateKeys.prepareRegister()` and `dex.delegateKeys.prepareRevoke()` call `POST /v1/delegate-keys` and `DELETE /v1/delegate-keys/{keyId}` and return intentional 501 owner-signed delegate/API key placeholder bodies (`delegate_key_registration_not_implemented` / `delegate_key_revocation_not_implemented`). The envelopes preserve `source: delegate-key-owner-signed-prepare-boundary`, `operationStatus: prepare-only-owner-signed-required`, `ownerAuthorization: owner-wallet-signature-required`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, and `delegateCanAdmin: false`; these clients have no wallet/RPC/signing/broadcast/deploy/tx/funds behavior and do not mutate a live DelegateKeyRegistry or TradingVault.

`dex.delegateKeys.listRegistrations()` and `dex.delegateKeys.listRevocations()` call `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations` and return read-only DelegateKeyRegistry event history envelopes. They expose `source: delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection` / `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateKeyRegistryMutation: false`, `delegateCanWithdraw: false`, and `delegateCanAdmin: false` with no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`dex.delegateKeys.registrations.openStream` / `dex.delegateKeys.revocations.openStream` and the bounded `stream({ limit })` helpers consume private DelegateKeyRegistry history snapshots from `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations`. The stream output preserves `delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, and `delegateKeyRegistryMutation: false` with no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

`fills.openStream()` consumes the local `/v1/ws?channel=fills` WebSocket transport. Private stream snapshots remain read-only and carry `NO_WITHDRAW`/`NO_ADMIN` permissions.

`orders.openStream()` consumes `/v1/ws?channel=orders` for order/cancel stream snapshots. Matcher-local cancellation updates keep on-chain nonce wording explicit and do not grant withdrawal/admin authority.

The smoke helper is deliberately mock-only: it proves the API/indexer/proof loop without wallets, transactions, real Quai settlement, or fund movement.
