# Quai Terminal DEX Campaign Status

## State
- Status: active; Clonners asked the autonomous campaign to keep advancing toward a completed DEX via bounded local/source-only slices; external side effects remain approval-gated
- Current phase: local MVP feature-complete for source-only/demo; testnet cutover readiness plan is active
- Workdir: `/home/clonners/.hermes/hermes-agent/quai-terminal-dex`
- Model: Qwen3.6-27B local (3090 via Tailscale)
- Executor: oh-my-pi (omp) via no-agent cronjob

## Current git baseline
- 3ccfafd feat: testnet cutover Task 4 — relayer real-mode gate expansion
- 234f0f5 status: update phase + checkpoint for persistent indexer slice
- c33ebef slice: persistent indexer — JSON-file-backed persistence store with 12 RED/GREEN tests
- d43de42 feat: testnet cutover Task 3 — deploy manifest and dry-run checks
- 9a2547f ratchet: fix 8 failing status ratchet tests
- 4710d91 feat: testnet cutover Task 2 — real-network config schema
- 364ab98 slice: relayer state machine — full FillPacket lifecycle, 23 tests

## Campaign history

Completed previous run: prepare-only delegate/API key registration and revocation API boundary added `delegate-key-registry-projection` list metadata plus intentional `501` owner-signed placeholders for `POST /v1/delegate-keys` and `DELETE /v1/delegate-keys/{keyId}`; responses preserve `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: TypeScript/Python/qdex prepare-only delegate/API key registration and revocation clients added SDK `delegateKeys.prepareRegister()` / `delegateKeys.prepareRevoke()`, Python `delegate_keys.prepare_register()` / `delegate_keys.prepare_revoke()`, and CLI `qdex api create-key --prepare` / `qdex api revoke-key --prepare`; they return intentional `501` owner-signed envelopes with `delegate-key-owner-signed-prepare-boundary`, `prepare-only-owner-signed-required`, `owner-wallet-signature-required`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: terminal UI prepare-only delegate/API key panel/binding added `src/delegate-key-prepare-trigger.js`, browser buttons, renderer panel, app wiring, README coverage, and ratchets for `POST /v1/delegate-keys` plus `DELETE /v1/delegate-keys/{keyId}` owner-signed `501` envelopes; it renders `delegate-key-owner-signed-prepare-boundary`, `prepare-only-owner-signed-required`, `owner-wallet-signature-required`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, no live `DelegateKeyRegistry` mutation, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: local API + terminal UI delegate/API key prepare smoke added `src/delegate-key-prepare-binding.js` and `local-api-delegate-key-prepare-smoke.test.mjs`; it starts local `createApiServer()`, clicks register and revoke buttons, validates intentional HTTP `501` owner-signed envelopes, renders only `delegate-key-owner-signed-prepare-boundary` metadata, preserves `owner-wallet-signature-required`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `fundsMoved: false`, `tradingVaultMutation: false`, no live `DelegateKeyRegistry` mutation, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: post-delegate-key owner-signed readiness docs added `docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md` plus delegate/core doc links, mapping read-only `GET /v1/delegate-keys`, prepare-only `POST /v1/delegate-keys` / `DELETE /v1/delegate-keys/{keyId}`, SDK/Python/qdex clients, terminal UI panel, and local UI smoke to the explicit approval gate before wallet/RPC/signing/broadcast/deploy/tx/funds behavior or live `DelegateKeyRegistry` mutation.

Completed previous run: post-delegate-key owner-signed readiness docs added `docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md` plus delegate/core doc links

Completed previous run: read-only DelegateKeyRegistry registration/revocation projection schema ratchet added `DelegateKeyRegisteredProjection` and `DelegateKeyRevokedProjection` to the indexer schema, OpenAPI, delegate docs, and readiness plan; mock rows keep null tx/block/explorer evidence, real rows require event truth, and every row preserves `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, no live `DelegateKeyRegistry` mutation by projection, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: read-only delegate-key registration/revocation history API envelopes added `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`, backed by `DelegateKeyRegisteredProjection` / `DelegateKeyRevokedProjection`, `source: delegatekeyregistry-event-projection`, `settlementMode: mock`, null `settlementTx`/`blockNumber`/`blockHash`/`eventIndex`/`explorerUrl`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: read-only TypeScript/Python/qdex delegate-key history clients added SDK `delegateKeys.listRegistrations()` / `delegateKeys.listRevocations()`, Python `delegate_keys.list_registrations()` / `delegate_keys.list_revocations()`, and CLI `qdex api registrations` / `qdex api revocations` for `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`, preserving `delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, mock-null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: terminal UI read-only delegate-key history panel added `src/delegate-key-history-panel.js`, `mockVerticalSliceFixture.delegateKeyHistory`, renderer coverage, README docs, package syntax checks, and ratchets for `GET /v1/delegate-keys/registrations` / `GET /v1/delegate-keys/revocations` style `delegatekeyregistry-event-projection` envelopes, preserving `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, empty mock arrays as valid state, mock-null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: local API + terminal UI delegate-key history integration smoke added `src/delegate-key-history-binding.js` and `local-api-delegate-key-history-smoke.test.mjs`; it starts local `createApiServer()`, reads `GET /v1/delegate-keys/registrations` plus `GET /v1/delegate-keys/revocations`, feeds both `delegatekeyregistry-event-projection` envelopes through the terminal UI normalizer/renderer, treats empty mock arrays as valid state, and preserves `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, mock-null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: private DelegateKeyRegistry registration/revocation WebSocket snapshot alignment added `delegatekeyregistry-event-projection` stream contracts and snapshots for `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations`, reusing `createDelegateKeyHistoryProjectionEnvelope()` for `DelegateKeyRegisteredProjection` / `DelegateKeyRevokedProjection`, empty mock arrays, null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateKeyRegistryMutation: false`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: terminal UI private DelegateKeyRegistry history stream binding added `src/live-delegate-key-history.js`, renderer/app/README/package coverage, and optional `/v1/ws?channel=delegate-key-registrations` plus `/v1/ws?channel=delegate-key-revocations` consumers that validate `delegatekeyregistry-event-projection` envelopes before rendering the read-only delegate/API key history panel with `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, mock-null event evidence, no live `DelegateKeyRegistry` mutation, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: local API + terminal UI DelegateKeyRegistry history stream integration smoke added `src/delegate-key-history-stream-binding.js` and `local-api-delegate-key-history-stream-smoke.test.mjs`; it starts local `createApiServer()`, reads `GET /v1/delegate-keys/registrations` plus `GET /v1/delegate-keys/revocations`, subscribes to private `delegate-key-registrations`/`delegate-key-revocations` WebSocket snapshots, and renders only when REST + WebSocket agree on `delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, mock-null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: read-only TypeScript SDK and `qdex` CLI DelegateKeyRegistry history stream consumers added `delegateKeys.registrations.openStream()` / `delegateKeys.revocations.openStream()`, bounded `delegateKeys.registrations.stream({ limit })` / `delegateKeys.revocations.stream({ limit })`, and `qdex stream delegate-key-registrations` / `qdex stream delegate-key-revocations`; they consume private `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations` snapshots with `delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: Python SDK DelegateKeyRegistry history stream consumers added `dex.delegate_keys.registrations.open_stream()` / `dex.delegate_keys.revocations.open_stream()` plus bounded `delegate_keys.registrations.stream(limit=...)` / `delegate_keys.revocations.stream(limit=...)`; they consume private `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations` snapshots with `delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: read-only FeeManager fee schedule API envelope added `GET /v1/fees`, `docs/fees.md`, OpenAPI `FeeScheduleResponse` / `FeeScheduleProjection`, and core docs with `source: feemanager-policy-projection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: read-only FeeManager fee schedule clients added TypeScript SDK `fees.get()`, Python SDK `fees.get()`, and `qdex fees` for `GET /v1/fees`, preserving `feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, `tradingVaultMutation: false`, no fee-authority runtime keys, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: terminal UI read-only FeeManager fee schedule exposure added `web/terminal-ui/src/fee-policy-panel.js`, fixture/renderer/package/README/docs/status ratchets, and the static terminal panel for `GET /v1/fees` style `feemanager-policy-projection` metadata with `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, `tradingVaultMutation: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, no fee-authority runtime keys, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: local API + terminal UI FeeManager fee schedule integration smoke added `web/terminal-ui/src/fee-policy-binding.js` and `local-api-fee-policy-smoke.test.mjs`

Completed previous run: read-only FeeManager fee schedule WebSocket snapshot alignment added public `fees` stream contract and `/v1/ws?channel=fees` snapshots

Completed previous run: terminal UI binding for the FeeManager fee schedule stream

Completed previous run: local API + terminal UI FeeManager fee schedule stream integration smoke

Completed previous run: read-only TypeScript SDK and `qdex` CLI FeeManager fee schedule stream consumers

Completed previous run: Python SDK FeeManager fee schedule stream consumers

Completed previous run: read-only account overview API envelope added `GET /v1/account` with `mock-account-overview` / `LocalAccountOverviewProjection` metadata, `mock-local-no-wallet-session`, nested `mock-vault-projection` balances, matcher-local `mock-order-projection` open orders, confirmed-only `IndexedFillProjection` rows, `READ_ONLY`/`NO_WITHDRAW`/`NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: TypeScript/Python/qdex read-only account overview clients added SDK `account.get()`, Python SDK `account.get()`, and `qdex account` calling `GET /v1/account`.

Completed previous run: terminal UI read-only account overview panel added `web/terminal-ui/src/account-overview-panel.js`.

Completed previous run: local API + terminal UI account overview integration smoke added `web/terminal-ui/src/account-overview-binding.js`.

Completed previous run: read-only TypeScript SDK and `qdex` CLI public market-data stream consumers added `dex.tickers.openStream()` / `dex.orderbook.openStream(marketId)` / `dex.trades.openStream(marketId)` and bounded `tickers.stream({ limit })` / `orderbook.stream(marketId, { limit })` / `trades.stream(marketId, { limit })`; CLI `qdex stream tickers` / `qdex stream depth QI-QUAI` / `qdex stream trades QI-QUAI` consume public WebSocket snapshots.

Completed previous run: Python SDK public market-data stream consumers added `dex.tickers.open_stream()` / `dex.orderbook.open_stream(market_id)` / `dex.trades.open_stream(market_id)` plus bounded stream methods.

Completed previous run: TypeScript SDK and `qdex` CLI public kline/candle consumers
Completed previous run: Python SDK public kline/candle consumers added `dex.klines.get(market_id, interval="1m")`, `dex.klines.open_stream(market_id, interval="1m")`, and bounded `dex.klines.stream(market_id, interval="1m", limit=...)`.

Completed previous run: terminal UI public kline/candle panel binding added `src/kline-panel.js` and `src/live-klines.js`.

Completed previous run: local API + terminal UI public kline/candle stream integration smoke added `src/kline-stream-binding.js`.

Completed previous run: terminal UI public market-data stream binding

Completed previous run: local API + terminal UI public market-data stream integration smoke added `src/market-data-stream-binding.js`.

Completed previous run: terminal UI command-palette skeleton for read-only/local mock actions

Completed previous run: local API + terminal UI command-palette smoke for read-only/local mock actions

Completed previous run: terminal UI keyboard-shortcut help panel for read-only/local mock actions

Completed this run: local API + terminal UI keyboard-shortcut help smoke for read-only/local mock actions

Existing safe listing surfaces are `GET /v1/listings/policy`, read-only `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision`, TypeScript/Python/qdex review-flow clients, TypeScript/Python/qdex queue clients, TypeScript/Python/qdex decision clients, and prepare-only listing-request fallback; contract-level authority handoff remains local-only.
Approval received: Clonners approved building a useful listing path initially managed by Clonners and later delegable to a DAO.
Approval received: Clonners wants the campaign to continue autonomously until the DEX is complete, limited to bounded local/source-only development, local tests, local in-memory runtime behavior, and local contract-harness logic inside this repo.
Completed previous run: read-only TypeScript/Python SDK and `qdex` CLI clients for `/v1/listings/review-flow`
Added read-only TypeScript/Python SDK and `qdex` CLI clients for `/v1/listings/review-flow`;

Completed previous run: local in-memory listing review queue
Clonners approved the next local-only runtime listing review queue slice.
Implemented the approved local in-memory listing review queue:

Completed previous run: TypeScript/Python SDK and `qdex` CLI clients for the local in-memory listing review queue
Added TypeScript/Python SDK and `qdex` CLI clients for the local in-memory listing review queue
Clonners asked the campaign to keep going until the DEX is completed.

Completed previous run: local-only listing review decision workflow
Added local-only listing review decision workflow: `POST /v1/listings/requests/{requestId}/decision` records immutable in-memory approve/reject metadata for queued requests

Completed previous run: TypeScript/Python SDK and `qdex` CLI clients for local in-memory listing review decisions
Added TypeScript/Python SDK and `qdex` CLI clients for local in-memory listing review decisions

Completed previous run: post-decision status/approval-boundary cleanup aligned listing review-flow metadata and docs with the existing local queue/decision API plus TypeScript/Python/qdex clients.
Completed post-decision status/approval-boundary cleanup: `GET /v1/listings/review-flow`, OpenAPI, docs, TypeScript/Python SDK tests, and `qdex` tests now name the existing local queue/decision API plus TypeScript/Python/qdex clients instead of stale queue-only wording.

Completed previous run: reconciled interrupted read-only mock vault balance projection across `GET /v1/account/balances`, private `balances` stream, TypeScript/Python SDKs, `qdex balance`, OpenAPI, docs, and ratchets.
Reconciled interrupted read-only mock vault balance projection slice: `GET /v1/account/balances`, private `balances` WebSocket snapshots, TypeScript/Python SDK `account.balances()`, `qdex balance`, OpenAPI `AccountBalances`, specs, README docs, and ratchets now share explicit `mock-vault-projection`

Completed previous run: terminal UI balance projection binding added a private `balances` WebSocket consumer, mock-vault renderer panel, browser app binding, README docs, and ratchets while preserving `mock-vault-projection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, and no wallet/funds behavior.

Completed previous run: local API + terminal UI balances stream integration smoke added a REST precheck for `GET /v1/account/balances` before binding `/v1/ws?channel=balances`, keeping the browser panel on the same read-only `mock-vault-projection` safety envelope.

Completed previous run: prepare-only owner-wallet TradingVault deposit/withdrawal API boundary added `POST /v1/vault/deposits/prepare` and `POST /v1/vault/withdrawals/prepare` with `501` placeholder envelopes, OpenAPI schemas, `docs/vault-operations.md`, core docs links, and API/doc ratchets; it preserves `owner-wallet-required`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`.

Completed previous run: prepare-only owner-wallet TradingVault deposit/withdrawal clients added TypeScript SDK `vault.deposits.prepare()` / `vault.withdrawals.prepare()`, Python SDK `vault.deposits.prepare()` / `vault.withdrawals.prepare()`, and `qdex vault deposit --prepare` / `qdex vault withdraw --prepare`; they return intentional `501` boundary envelopes and preserve `owner-wallet-required`, `delegates-cannot-deposit-or-withdraw`, `NO_WITHDRAW`, `NO_ADMIN`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: terminal UI prepare-only vault operation panel added browser deposit/withdrawal buttons, `src/vault-prepare-trigger.js`, renderer panel, and README coverage; it treats intentional HTTP `501` owner-wallet envelopes as display-only metadata and preserves `NO_WITHDRAW`, `NO_ADMIN`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: local API + terminal UI vault prepare smoke added `src/vault-prepare-binding.js` and a focused browser/API smoke that starts local `createApiServer()`, clicks deposit and withdrawal buttons, validates the intentional HTTP `501` owner-wallet boundary envelopes, and renders only no-wallet/no-RPC/no-signing/no-broadcast/no-deploy/no-tx/no-funds metadata.

Completed previous run: post-vault owner-wallet readiness docs added `docs/plans/2026-06-08-post-vault-owner-wallet-readiness.md` plus vault/core doc links, mapping mock-vault balance state and prepare-only deposit/withdrawal surfaces to the explicit owner-wallet approval gate before any wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: read-only TradingVault `Deposit`/`Withdraw` projection schema ratchet added `TradingVaultDepositProjection` and `TradingVaultWithdrawalProjection` to the indexer schema, OpenAPI, and vault docs; mock rows keep null tx/block/explorer evidence, real rows require event truth, and every row preserves `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
Added read-only TradingVault `Deposit`/`Withdraw` projection schema ratchet: `TradingVaultDepositProjection` and `TradingVaultWithdrawalProjection` now exist in `services/indexer/schema.md`, `docs/api-openapi.yaml`, and `docs/vault-operations.md`

Completed previous run: read-only vault deposit/withdrawal history API envelopes added `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals`, backed by `TradingVaultDepositProjection` / `TradingVaultWithdrawalProjection`, `source: tradingvault-event-projection`, `settlementMode: mock`, null `settlementTx`/`blockNumber`/`blockHash`/`eventIndex`/`explorerUrl`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`.

Completed previous run: read-only TypeScript/Python/qdex vault history clients added SDK `dex.vault.deposits.list()` / `dex.vault.withdrawals.list()` and CLI `qdex vault deposits` / `qdex vault withdrawals` for `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals`, preserving `source: tradingvault-event-projection`, `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: terminal UI read-only vault history panel added `src/vault-history-panel.js`, `mockVerticalSliceFixture.vaultHistory`, renderer coverage, and README docs for `GET /v1/vault/deposits` / `GET /v1/vault/withdrawals` style `tradingvault-event-projection` envelopes, preserving `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, empty mock arrays as valid state, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, mock-null tx/block/event/explorer evidence, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: local API + terminal UI vault history integration smoke added `src/vault-history-binding.js` and `local-api-vault-history-smoke.test.mjs`; it starts local `createApiServer()`, reads `GET /v1/vault/deposits` plus `GET /v1/vault/withdrawals`, feeds both `tradingvault-event-projection` envelopes through the terminal UI normalizer/renderer, treats empty mock arrays as valid state, and preserves `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, mock-null tx/block/event/explorer evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: private `deposits`/`withdrawals` WebSocket snapshot alignment added `tradingvault-event-projection` stream contracts and snapshots for `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals`, reusing `createVaultHistoryProjectionEnvelope()` for `TradingVaultDepositProjection` / `TradingVaultWithdrawalProjection`, empty mock arrays, null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`.

Completed previous run: terminal UI private vault history stream binding added `src/live-vault-history.js`, renderer/app/README/package coverage, and optional `/v1/ws?channel=deposits` plus `/v1/ws?channel=withdrawals` consumers that validate `tradingvault-event-projection` envelopes before rendering the read-only vault history panel with `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`.

Completed previous run: local API + terminal UI vault history stream integration smoke added `src/vault-history-stream-binding.js` and `local-api-vault-history-stream-smoke.test.mjs`; it starts local `createApiServer()`, reads `GET /v1/vault/deposits` plus `GET /v1/vault/withdrawals`, subscribes to private `deposits`/`withdrawals` WebSocket snapshots, and renders only when REST + WebSocket agree on `tradingvault-event-projection`, `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, mock-null evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`.

Completed previous run: read-only TypeScript SDK and `qdex` CLI vault history stream consumers added `dex.vault.deposits.openStream()` / `dex.vault.withdrawals.openStream()`, bounded `vault.deposits.stream({ limit })` / `vault.withdrawals.stream({ limit })`, and `qdex stream deposits` / `qdex stream withdrawals`; they consume private `tradingvault-event-projection` snapshots from `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals` while preserving `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: Python SDK vault history stream consumers added `dex.vault.deposits.open_stream()` / `dex.vault.withdrawals.open_stream()` plus bounded `vault.deposits.stream(limit=...)` / `vault.withdrawals.stream(limit=...)`; they use dependency-light WebSocket snapshots from `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals` while preserving `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: relayer state machine workspace package `@qdex/relayer` with `createRelayerStateMachine()` — full FillPacket lifecycle, 23 tests.

Completed previous run: testnet cutover readiness Task 2 — real-network config schema

Completed previous run: testnet cutover readiness Task 3 — deploy manifest and dry-run checks

Completed previous run: persistent indexer — `@qdex/indexer` with JSON-file-backed persistence store, 12 tests.

Completed previous run: testnet cutover readiness Task 5b — reorg-safe event log with replay
Added `services/indexer/src/reorg-safe-event-log.js` with `createReorgSafeEventLog()` — deterministic event log with chain-state awareness: `appendBlock()` for canonical block heads, `appendEvent()` with block hash validation, `checkReorg()` for read-only reorg detection, `replayFrom()` to invalidate events at/after reorg point, `getCanonicalEvents()` with optional safety depth filtering, `getReorgedEvents()`, `getReorgHistory()`, `getHeadBlockNumber()`, `getCanonicalHash()`, `getStatus()`, `clear()`; 29 RED/GREEN tests cover safety envelope, input validation, reorg detection via block hash mismatch, replay invalidation, canonical filtering, safety depth gating, sorted output, hash verification, head trimming, full reorg cycle (ingest→detect→replay→re-ingest), multiple reorg incidents, non-consecutive blocks, and safety envelope immutability; also reconciled 2 stale status ratchet tests (`post-listing-policy-admin-boundary.test.mjs`, `relayer-real-mode-gate-api.test.mjs`); all 132/132 workspace tests pass.

Completed this run: terminal UI nonce cancel prepare render panel added `nonce-cancel-prepare-panel.js` with `createMockNonceCancelPrepareFixture()`, `normalizeNonceCancelPreparePanelFixture()`, mock fixture integration into `mockVerticalSliceFixture.nonceCancelPrepare`, package syntax check registration, and ratchet updates; preserves `owner-signed-nonce-cancel-placeholder`, `owner-signed-required`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, `nonceManagerMutation: false`, `approvalGate: explicit-approval-required-before-wallet-signing-or-quai-broadcast`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed this run: local API + terminal UI nonce cancel prepare render smoke added `src/nonce-cancel-prepare-binding.js` and `local-api-nonce-cancel-prepare-smoke.test.mjs`; it starts local `createApiServer()`, clicks cancel and cancel-range buttons, validates intentional HTTP `501` owner-signed nonce cancel boundary envelopes, and renders only no-wallet/no-RPC/no-signing/no-broadcast/no-deploy/no-tx/no-funds metadata.

Completed this run: post-nonce-cancel owner-signed readiness docs added `docs/plans/2026-06-08-post-nonce-cancel-owner-signed-readiness.md` plus contracts/architecture doc links, mapping read-only `POST /v1/nonces/cancel`, prepare-only SDK/CLI/terminal UI surfaces, and local API smoke to the explicit approval gate before owner-signed NonceManager cancellation, wallet signing, RPC URL access, broadcast, transaction submission, or funds movement.

Completed this run: read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` projection schema ratchet added `NonceCancelledProjection` and `NonceRangeCancelledProjection` to `services/indexer/schema.md`, `docs/api-openapi.yaml`, `docs/contracts.md`, `docs/architecture.md`, `docs/plans/2026-06-08-post-nonce-cancel-owner-signed-readiness.md`, and `tests/nonce-cancel-event-projection-schema.test.mjs`; preserves `nonce-manager-event-projection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, null mock tx/block/explorer evidence, real event evidence required before confirmed nonce cancellation display, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMovedByProjection: false`, `nonceManagerMutationByProjection: false`, `tradingVaultMutationByProjection: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed this run: read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` history API envelopes added `GET /v1/nonces/cancellations` route, `NonceCancellationHistoryResponse` schema in OpenAPI, `docs/nonce-operations.md`, and `tests/nonce-cancellations-history-api.test.mjs`; preserves `nonce-manager-event-projection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, null mock tx/block/explorer evidence, real event evidence required before confirmed nonce cancellation display, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `nonceManagerMutation: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed previous run: read-only TypeScript/Python/qdex nonce cancellation history clients added SDK `dex.nonces.cancellations.list()`, Python SDK `nonces.cancellations.list()`, and CLI `qdex nonces cancellations` for `GET /v1/nonces/cancellations`, preserving `source: nonce-manager-event-projection`, `NonceCancelledProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `nonceManagerMutation: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed this run: private nonce cancellations WebSocket snapshot alignment added `nonce-cancellations` private stream contract, `createStreamSnapshot()` handler for `/v1/ws?channel=nonce-cancellations` reusing `createNonceCancellationHistoryProjectionEnvelope()`, `nonce-manager-event-projection` source, `nonce_cancellation_projection` payload, and 6/6 streams tests pass; preserves `nonce-manager-event-projection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `NonceCancelledProjection`, null mock tx/block/explorer evidence, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `nonceManagerMutation: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed this run: read-only TypeScript SDK and `qdex` CLI nonce cancellations stream consumers added `nonces.cancellations.openStream()` / `nonces.cancellations.stream({ limit })` and `qdex stream nonce-cancellations`; they consume private `nonce-manager-event-projection` snapshots from `/v1/ws?channel=nonce-cancellations` with `NonceCancelledProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `nonceManagerMutation: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Completed this run: Python SDK nonce cancellations stream consumers added `nonces.cancellations.open_stream()` / `nonces.cancellations.stream(limit=...)`; they consume private `/v1/ws?channel=nonce-cancellations` snapshots with `nonce-manager-event-projection`, `nonce_cancellation_projection`, `NonceCancelledProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `nonceManagerMutation: False`, `tradingVaultMutation: False`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Next autonomous slice: terminal UI read-only nonce cancellations history panel

Still not approved: wallets, RPC URLs, signing, broadcasts, deploys, real token addresses, transaction helpers, live `DelegateKeyRegistry` mutation, live `FeeManager` mutation, real network `MarketRegistry` mutation, public servers, remote pushes, or funds movement.

## Testnet cutover readiness plan

Plan: `docs/plans/2026-06-08-testnet-cutover-real-settlement-readiness.md`

- Freeze the local MVP as feature-complete
- No real/testnet RPC use
- No wallet import or wallet generation
- No contract deploys
- No transaction signing or broadcasts
- No test funds movement
- No remote Git push
