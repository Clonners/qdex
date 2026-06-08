import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const planPath = 'docs/plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md';

const forbiddenRuntimeDetails = new RegExp(
  [
    'process\\.env',
    'RPC_URL',
    'PRIVATE[_-]?KEY',
    'mnemo' + 'nic',
    'seed' + ' phrase',
    'signingKey',
    'walletPrivateKey',
    'listingAdminPrivateKey',
    'txHash:',
  ].join('|'),
  'i',
);

test('post-listing-policy plan pins approval-gated listing submission and MarketRegistry admin metadata only', async () => {
  const plan = await readText(planPath);

  for (const requiredText of [
    '# Post-Listing-Policy MarketRegistry Admin Boundary Implementation Plan',
    '> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.',
    '**Goal:** Pin the completed listing-policy/request surfaces, the approved local in-memory review queue, and the explicit MarketRegistry admin approval gate without adding live listing/admin behavior.',
    '**Architecture:** Existing safe listing surfaces are `GET /v1/listings/policy`, `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision`, and prepare-only fallback.',
    '**Tech Stack:** Markdown plan/spec ratchets, Node `node:test` doc guards, existing OpenAPI/API/SDK/CLI docs, and local-only Solidity `MarketRegistry` concepts.',
    '## Current completed boundary',
    '`GET /v1/listings/policy`',
    '`source: listed-asset-marketregistry-policy`',
    '`status: design-only-local-metadata`',
    '`realQuaiTransactions: false`',
    '`walletRequired: false`',
    'WQUAI',
    'WQI',
    'community-created ERC-20-style vault tokens',
    '## Approval-gated runtime listing submission boundary',
    'Runtime listing submission beyond local queue/decision state is approval-gated before implementation',
    'The prepare-only `POST /v1/listings/requests` fallback still returns a non-implemented response unless the caller explicitly uses approved local review queue mode',
    'Current local review request shape',
    'There is still no on-chain/runtime listing submission beyond metadata-only local queue/decision surfaces.',
    '## MarketRegistry admin metadata boundary',
    '`MarketRegistry.addMarket` is enabled-pair metadata only',
    '`MarketRegistry.disableMarket` retains metadata for indexer replay',
    'cannot move `TradingVault` balances',
    'cannot grant withdrawal/admin power',
    '## Approved local authority handoff',
    'Clonners approved a useful listing authority path that starts operator-managed and can later delegate to a DAO/multisig',
    'MarketRegistry.proposeMarketAuthority(nextAuthority) -> MarketRegistry.acceptMarketAuthority()',
    'MarketAuthorityHandoffProposed, MarketAuthorityHandoffAccepted',
    'old Clonners-managed authority loses `addMarket`/`disableMarket` power',
    '## Delegates and listing-admin separation',
    '`NO_WITHDRAW`',
    '`NO_ADMIN`',
    'Delegate/API keys cannot become listing-admin authority',
    '## Disallowed autonomous work',
    'no wallets, RPC URLs, signing, broadcasts, deploys, transaction helpers, real token addresses, listing-admin key behavior, MarketRegistry mutation, or funds movement',
    '## Completed prepare-only API placeholder',
    '`POST /v1/listings/requests`',
    'returns a precise `501` approval-gated placeholder',
    '`source: listed-asset-marketregistry-policy`',
    '`status: design-only-local-metadata`',
    '`requestStatus: not-implemented-approval-required`',
    '`marketRegistryMutation: false`',
    '## Completed prepare-only clients',
    'TypeScript SDK `listings.requests.prepareSubmit()`',
    'Python SDK `listings.requests.prepare_submit()`',
    '`qdex listings request --prepare`',
    'return the intentional `501` envelope as a prepare-only boundary response',
    'not as a successful listing submission',
    '## Completed local review queue boundary',
    'Clonners approved the local runtime listing review queue as an in-memory metadata-only intake surface',
    '`queueStatus: local-in-memory-review-queue`',
    '`persistence: in-memory-local-server-only`',
    '`requestStatus: queued-local-review`',
    '## Completed local review decision boundary',
    '`POST /v1/listings/requests/{requestId}/decision`',
    '`decisionMode: local_review_decision`',
    '`requestStatus: reviewed-local-metadata-only`',
    '`reviewDecision: approved-local-metadata-only`',
    '`reviewDecision: rejected-local-metadata-only`',
    '## Next approval-gated boundary',
    'Approval required: runtime listing submission beyond local queue/decision state or MarketRegistry admin mutation',
    'No further autonomous runtime listing submission or MarketRegistry admin behavior should start until Clonners explicitly approves the trust boundary.',
  ]) {
    assert.ok(plan.includes(requiredText), `${planPath} should include ${requiredText}`);
  }

  assert.doesNotMatch(plan, forbiddenRuntimeDetails, 'plan must not include runtime secrets, env/RPC/deploy mechanics, or real address/key claims');
  assert.doesNotMatch(plan, /adminWithdraw|withdrawFrom|rescue|sweep/i, 'plan must not introduce custody/admin withdrawal surfaces');
  assert.doesNotMatch(
    plan,
    /Future listing submission should be introduced first as a prepare-only\/docs\/OpenAPI boundary|Minimum future request fields, if approved for a placeholder:|source: listing-submission-approval-gate/,
    'plan must not keep stale pre-placeholder wording now that listing request clients are complete',
  );
  assert.doesNotMatch(
    plan,
    /The next safe bounded slice is read-only SDK\/CLI clients for the prepare-only listing request placeholder/,
    'plan must not keep completed listing-request client exposure as the next slice',
  );
});

test('campaign status records completion-mode continuation plus local listing, balance, and vault prepare checkpoints', async () => {
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    '- Status: active; Clonners asked the autonomous campaign to keep advancing toward a completed DEX via bounded local/source-only slices; external side effects remain approval-gated',
    '- Current phase: local API + terminal UI keyboard-shortcut help smoke for read-only/local mock actions is complete;',
    'Completed previous run: local API + terminal UI command-palette smoke for read-only/local mock actions',
    'Completed previous run: terminal UI keyboard-shortcut help panel for read-only/local mock actions',
    'Completed this run: local API + terminal UI keyboard-shortcut help smoke for read-only/local mock actions',
    'Next autonomous slice: another bounded local/source-only MVP surface',
    'Approval received: Clonners approved building a useful listing path initially managed by Clonners and later delegable to a DAO.',
    'Existing safe listing surfaces are `GET /v1/listings/policy`, read-only `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision`, TypeScript/Python/qdex review-flow clients, TypeScript/Python/qdex queue clients, TypeScript/Python/qdex decision clients, and prepare-only listing-request fallback; contract-level authority handoff remains local-only.',
    'Approval received: Clonners wants the campaign to continue autonomously until the DEX is complete, limited to bounded local/source-only development, local tests, local in-memory runtime behavior, and local contract-harness logic inside this repo.',
    'Completed previous run: post-decision status/approval-boundary cleanup aligned listing review-flow metadata and docs with the existing local queue/decision API plus TypeScript/Python/qdex clients.',
    'Completed previous run: reconciled interrupted read-only mock vault balance projection across `GET /v1/account/balances`, private `balances` stream, TypeScript/Python SDKs, `qdex balance`, OpenAPI, docs, and ratchets.',
    'Completed previous run: terminal UI balance projection binding added a private `balances` WebSocket consumer, mock-vault renderer panel, browser app binding, README docs, and ratchets while preserving `mock-vault-projection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, and no wallet/funds behavior.',
    'Completed previous run: local API + terminal UI balances stream integration smoke added a REST precheck for `GET /v1/account/balances` before binding `/v1/ws?channel=balances`, keeping the browser panel on the same read-only `mock-vault-projection` safety envelope.',
    'Completed previous run: prepare-only owner-wallet TradingVault deposit/withdrawal API boundary added `POST /v1/vault/deposits/prepare` and `POST /v1/vault/withdrawals/prepare` with `501` placeholder envelopes, OpenAPI schemas, `docs/vault-operations.md`, core docs links, and API/doc ratchets; it preserves `owner-wallet-required`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`.',
    'Completed previous run: prepare-only owner-wallet TradingVault deposit/withdrawal clients added TypeScript SDK `vault.deposits.prepare()` / `vault.withdrawals.prepare()`, Python SDK `vault.deposits.prepare()` / `vault.withdrawals.prepare()`, and `qdex vault deposit --prepare` / `qdex vault withdraw --prepare`; they return intentional `501` boundary envelopes and preserve `owner-wallet-required`, `delegates-cannot-deposit-or-withdraw`, `NO_WITHDRAW`, `NO_ADMIN`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: terminal UI prepare-only vault operation panel added browser deposit/withdrawal buttons, `src/vault-prepare-trigger.js`, renderer panel, and README coverage; it treats intentional HTTP `501` owner-wallet envelopes as display-only metadata and preserves `NO_WITHDRAW`, `NO_ADMIN`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: local API + terminal UI vault prepare smoke added `src/vault-prepare-binding.js` and a focused browser/API smoke that starts local `createApiServer()`, clicks deposit and withdrawal buttons, validates the intentional HTTP `501` owner-wallet boundary envelopes, and renders only no-wallet/no-RPC/no-signing/no-broadcast/no-deploy/no-tx/no-funds metadata.',
    'Completed previous run: post-vault owner-wallet readiness docs added `docs/plans/2026-06-08-post-vault-owner-wallet-readiness.md` plus vault/core doc links, mapping mock-vault balance state and prepare-only deposit/withdrawal surfaces to the explicit owner-wallet approval gate before any wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: read-only TradingVault `Deposit`/`Withdraw` projection schema ratchet added `TradingVaultDepositProjection` and `TradingVaultWithdrawalProjection` to the indexer schema, OpenAPI, and vault docs; mock rows keep null tx/block/explorer evidence, real rows require event truth, and every row preserves `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: read-only vault deposit/withdrawal history API envelopes added `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals`, backed by `TradingVaultDepositProjection` / `TradingVaultWithdrawalProjection`, `source: tradingvault-event-projection`, `settlementMode: mock`, null `settlementTx`/`blockNumber`/`blockHash`/`eventIndex`/`explorerUrl`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`.',
    'Completed previous run: read-only TypeScript/Python/qdex vault history clients added SDK `dex.vault.deposits.list()` / `dex.vault.withdrawals.list()` and CLI `qdex vault deposits` / `qdex vault withdrawals` for `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals`, preserving `source: tradingvault-event-projection`, `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: terminal UI read-only vault history panel added `src/vault-history-panel.js`, `mockVerticalSliceFixture.vaultHistory`, renderer coverage, and README docs for `GET /v1/vault/deposits` / `GET /v1/vault/withdrawals` style `tradingvault-event-projection` envelopes, preserving `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, empty mock arrays as valid state, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, mock-null tx/block/event/explorer evidence, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: local API + terminal UI vault history integration smoke added `src/vault-history-binding.js` and `local-api-vault-history-smoke.test.mjs`; it starts local `createApiServer()`, reads `GET /v1/vault/deposits` plus `GET /v1/vault/withdrawals`, feeds both `tradingvault-event-projection` envelopes through the terminal UI normalizer/renderer, treats empty mock arrays as valid state, and preserves `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, mock-null tx/block/event/explorer evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: private `deposits`/`withdrawals` WebSocket snapshot alignment added `tradingvault-event-projection` stream contracts and snapshots for `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals`, reusing `createVaultHistoryProjectionEnvelope()` for `TradingVaultDepositProjection` / `TradingVaultWithdrawalProjection`, empty mock arrays, null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`.',
    'Completed previous run: terminal UI private vault history stream binding added `src/live-vault-history.js`, renderer/app/README/package coverage, and optional `/v1/ws?channel=deposits` plus `/v1/ws?channel=withdrawals` consumers that validate `tradingvault-event-projection` envelopes before rendering the read-only vault history panel with `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`.',
    'Completed previous run: local API + terminal UI vault history stream integration smoke added `src/vault-history-stream-binding.js` and `local-api-vault-history-stream-smoke.test.mjs`; it starts local `createApiServer()`, reads `GET /v1/vault/deposits` plus `GET /v1/vault/withdrawals`, subscribes to private `deposits`/`withdrawals` WebSocket snapshots, and renders only when REST + WebSocket agree on `tradingvault-event-projection`, `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, mock-null evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`.',
    'Completed previous run: read-only TypeScript SDK and `qdex` CLI vault history stream consumers added `dex.vault.deposits.openStream()` / `dex.vault.withdrawals.openStream()`, bounded `vault.deposits.stream({ limit })` / `vault.withdrawals.stream({ limit })`, and `qdex stream deposits` / `qdex stream withdrawals`; they consume private `tradingvault-event-projection` snapshots from `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals` while preserving `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: Python SDK vault history stream consumers added `dex.vault.deposits.open_stream()` / `dex.vault.withdrawals.open_stream()` plus bounded `vault.deposits.stream(limit=...)` / `vault.withdrawals.stream(limit=...)`; they use dependency-light WebSocket snapshots from `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals` while preserving `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: prepare-only delegate/API key registration and revocation API boundary added `delegate-key-registry-projection` list metadata plus intentional `501` owner-signed placeholders for `POST /v1/delegate-keys` and `DELETE /v1/delegate-keys/{keyId}`; responses preserve `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: TypeScript/Python/qdex prepare-only delegate/API key registration and revocation clients added SDK `delegateKeys.prepareRegister()` / `delegateKeys.prepareRevoke()`, Python `delegate_keys.prepare_register()` / `delegate_keys.prepare_revoke()`, and CLI `qdex api create-key --prepare` / `qdex api revoke-key --prepare`; they return intentional `501` owner-signed envelopes with `delegate-key-owner-signed-prepare-boundary`, `prepare-only-owner-signed-required`, `owner-wallet-signature-required`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: terminal UI prepare-only delegate/API key panel/binding added `src/delegate-key-prepare-trigger.js`, browser buttons, renderer panel, app wiring, README coverage, and ratchets for `POST /v1/delegate-keys` plus `DELETE /v1/delegate-keys/{keyId}` owner-signed `501` envelopes; it renders `delegate-key-owner-signed-prepare-boundary`, `prepare-only-owner-signed-required`, `owner-wallet-signature-required`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, no live `DelegateKeyRegistry` mutation, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: local API + terminal UI delegate/API key prepare smoke added `src/delegate-key-prepare-binding.js` and `local-api-delegate-key-prepare-smoke.test.mjs`; it starts local `createApiServer()`, clicks register and revoke buttons, validates intentional HTTP `501` owner-signed envelopes, renders only `delegate-key-owner-signed-prepare-boundary` metadata, preserves `owner-wallet-signature-required`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `fundsMoved: false`, `tradingVaultMutation: false`, no live `DelegateKeyRegistry` mutation, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: post-delegate-key owner-signed readiness docs added `docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md` plus delegate/core doc links, mapping read-only `GET /v1/delegate-keys`, prepare-only `POST /v1/delegate-keys` / `DELETE /v1/delegate-keys/{keyId}`, SDK/Python/qdex clients, terminal UI panel, and local UI smoke to the explicit approval gate before wallet/RPC/signing/broadcast/deploy/tx/funds behavior or live `DelegateKeyRegistry` mutation.',
    'Completed previous run: read-only DelegateKeyRegistry registration/revocation projection schema ratchet added `DelegateKeyRegisteredProjection` and `DelegateKeyRevokedProjection` to the indexer schema, OpenAPI, delegate docs, and readiness plan; mock rows keep null tx/block/explorer evidence, real rows require event truth, and every row preserves `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, no live `DelegateKeyRegistry` mutation by projection, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: read-only delegate-key registration/revocation history API envelopes added `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`, backed by `DelegateKeyRegisteredProjection` / `DelegateKeyRevokedProjection`, `source: delegatekeyregistry-event-projection`, `settlementMode: mock`, null `settlementTx`/`blockNumber`/`blockHash`/`eventIndex`/`explorerUrl`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: read-only TypeScript/Python/qdex delegate-key history clients added SDK `delegateKeys.listRegistrations()` / `delegateKeys.listRevocations()`, Python `delegate_keys.list_registrations()` / `delegate_keys.list_revocations()`, and CLI `qdex api registrations` / `qdex api revocations` for `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`, preserving `delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, mock-null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: terminal UI read-only delegate-key history panel added `src/delegate-key-history-panel.js`, `mockVerticalSliceFixture.delegateKeyHistory`, renderer coverage, README docs, package syntax checks, and ratchets for `GET /v1/delegate-keys/registrations` / `GET /v1/delegate-keys/revocations` style `delegatekeyregistry-event-projection` envelopes, preserving `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, empty mock arrays as valid state, mock-null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: local API + terminal UI delegate-key history integration smoke added `src/delegate-key-history-binding.js` and `local-api-delegate-key-history-smoke.test.mjs`; it starts local `createApiServer()`, reads `GET /v1/delegate-keys/registrations` plus `GET /v1/delegate-keys/revocations`, feeds both `delegatekeyregistry-event-projection` envelopes through the terminal UI normalizer/renderer, treats empty mock arrays as valid state, and preserves `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, mock-null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: private DelegateKeyRegistry registration/revocation WebSocket snapshot alignment added `delegatekeyregistry-event-projection` stream contracts and snapshots for `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations`, reusing `createDelegateKeyHistoryProjectionEnvelope()` for `DelegateKeyRegisteredProjection` / `DelegateKeyRevokedProjection`, empty mock arrays, null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateKeyRegistryMutation: false`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: terminal UI private DelegateKeyRegistry history stream binding added `src/live-delegate-key-history.js`, renderer/app/README/package coverage, and optional `/v1/ws?channel=delegate-key-registrations` plus `/v1/ws?channel=delegate-key-revocations` consumers that validate `delegatekeyregistry-event-projection` envelopes before rendering the read-only delegate/API key history panel with `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, mock-null event evidence, no live `DelegateKeyRegistry` mutation, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: local API + terminal UI DelegateKeyRegistry history stream integration smoke added `src/delegate-key-history-stream-binding.js` and `local-api-delegate-key-history-stream-smoke.test.mjs`; it starts local `createApiServer()`, reads `GET /v1/delegate-keys/registrations` plus `GET /v1/delegate-keys/revocations`, subscribes to private `delegate-key-registrations`/`delegate-key-revocations` WebSocket snapshots, and renders only when REST + WebSocket agree on `delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, mock-null event evidence, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: read-only TypeScript SDK and `qdex` CLI DelegateKeyRegistry history stream consumers added `delegateKeys.registrations.openStream()` / `delegateKeys.revocations.openStream()`, bounded `delegateKeys.registrations.stream({ limit })` / `delegateKeys.revocations.stream({ limit })`, and `qdex stream delegate-key-registrations` / `qdex stream delegate-key-revocations`; they consume private `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations` snapshots with `delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: Python SDK DelegateKeyRegistry history stream consumers added `dex.delegate_keys.registrations.open_stream()` / `dex.delegate_keys.revocations.open_stream()` plus bounded `delegate_keys.registrations.stream(limit=...)` / `delegate_keys.revocations.stream(limit=...)`; they consume private `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations` snapshots with `delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: read-only FeeManager fee schedule API envelope added `GET /v1/fees`, `docs/fees.md`, OpenAPI `FeeScheduleResponse` / `FeeScheduleProjection`, and core docs with `source: feemanager-policy-projection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: read-only FeeManager fee schedule clients added TypeScript SDK `fees.get()`, Python SDK `fees.get()`, and `qdex fees` for `GET /v1/fees`, preserving `feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, `tradingVaultMutation: false`, no fee-authority runtime keys, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: terminal UI read-only FeeManager fee schedule exposure added `web/terminal-ui/src/fee-policy-panel.js`, fixture/renderer/package/README/docs/status ratchets, and the static terminal panel for `GET /v1/fees` style `feemanager-policy-projection` metadata with `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, `tradingVaultMutation: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, no fee-authority runtime keys, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.',
    'Completed previous run: local API + terminal UI FeeManager fee schedule integration smoke added `web/terminal-ui/src/fee-policy-binding.js` and `local-api-fee-policy-smoke.test.mjs`',
    'Completed previous run: read-only FeeManager fee schedule WebSocket snapshot alignment added public `fees` stream contract and `/v1/ws?channel=fees` snapshots',
    'Completed previous run: terminal UI binding for the FeeManager fee schedule stream',
    'Completed previous run: local API + terminal UI FeeManager fee schedule stream integration smoke',
    'Completed previous run: read-only TypeScript SDK and `qdex` CLI FeeManager fee schedule stream consumers',
    'Completed previous run: Python SDK FeeManager fee schedule stream consumers',
    'Still not approved: wallets, RPC URLs, signing, broadcasts, deploys, real token addresses, transaction helpers, live `DelegateKeyRegistry` mutation, live `FeeManager` mutation, real network `MarketRegistry` mutation, public servers, remote pushes, or funds movement.',
    'Added read-only TypeScript/Python SDK and `qdex` CLI clients for `/v1/listings/review-flow`;',
    'Clonners approved the next local-only runtime listing review queue slice.',
    'Implemented the approved local in-memory listing review queue:',
    'Added TypeScript/Python SDK and `qdex` CLI clients for the local in-memory listing review queue',
    'Clonners asked the campaign to keep going until the DEX is completed.',
    'Added local-only listing review decision workflow: `POST /v1/listings/requests/{requestId}/decision` records immutable in-memory approve/reject metadata for queued requests',
    'Added TypeScript/Python SDK and `qdex` CLI clients for local in-memory listing review decisions',
    'Completed post-decision status/approval-boundary cleanup: `GET /v1/listings/review-flow`, OpenAPI, docs, TypeScript/Python SDK tests, and `qdex` tests now name the existing local queue/decision API plus TypeScript/Python/qdex clients instead of stale queue-only wording.',
    'Reconciled interrupted read-only mock vault balance projection slice: `GET /v1/account/balances`, private `balances` WebSocket snapshots, TypeScript/Python SDK `account.balances()`, `qdex balance`, OpenAPI `AccountBalances`, specs, README docs, and ratchets now share explicit `mock-vault-projection`',
    'Added read-only TradingVault `Deposit`/`Withdraw` projection schema ratchet: `TradingVaultDepositProjection` and `TradingVaultWithdrawalProjection` now exist in `services/indexer/schema.md`, `docs/api-openapi.yaml`, and `docs/vault-operations.md`',
  ]) {
    assert.ok(status.includes(requiredText), `CAMPAIGN_STATUS.md should include ${requiredText}`);
  }
});

test('listing docs point future work to the post-listing policy approval gate', async () => {
  const listingPolicy = await readText('docs/listing-policy.md');
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');
  const contractsReadme = await readText('contracts/README.md');
  const wrappedPlan = await readText('docs/plans/2026-06-07-native-qi-wrapper-adapter-boundary.md');
  const postMockPlan = await readText('docs/plans/2026-06-06-post-mock-mvp-readiness-owner-signed-nonce-cancel.md');

  for (const text of [listingPolicy, contracts, architecture, contractsReadme, wrappedPlan]) {
    assert.ok(text.includes(planPath), 'docs should link the post-listing-policy admin boundary plan');
    assert.ok(
      text.includes('post-listing-policy MarketRegistry admin boundary'),
      'docs should name the post-listing-policy MarketRegistry admin boundary',
    );
  }

  const staleApprovalGateCopy = /Future listing submission and MarketRegistry admin metadata are pinned as an approval-gated, design-only next boundary|That plan keeps future listing submission and MarketRegistry admin metadata design-only|The next (?:safe|design-only) planning boundary is/;

  for (const [label, text] of [
    ['docs/listing-policy.md', listingPolicy],
    ['docs/contracts.md', contracts],
    ['docs/architecture.md', architecture],
  ]) {
    assert.ok(
      text.includes('Existing safe listing surfaces: `GET /v1/listings/policy`, `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision`, and prepare-only fallback.'),
      `${label} should point to the existing policy/request surfaces instead of a future planning slice`,
    );
    assert.ok(
      text.includes('Approval required: runtime listing submission beyond local queue/decision state or MarketRegistry admin mutation'),
      `${label} should pin the runtime listing/admin approval gate`,
    );
    assert.doesNotMatch(
      text,
      staleApprovalGateCopy,
      `${label} must not describe completed listing surfaces as a future/next autonomous planning boundary`,
    );
  }

  assert.ok(
    contracts.includes('local in-memory listing review queue/decision workflow preserves the approval gate without MarketRegistry mutation'),
    'contracts docs should describe both local queue and decision state as completed approval-boundary surfaces',
  );
  assert.ok(
    architecture.includes('current local authority/local queue/decision surfaces'),
    'architecture docs should not stop at the pre-decision local queue surface',
  );
  assert.doesNotMatch(
    `${contracts}\n${architecture}\n${postMockPlan}`,
    /local in-memory listing review queue preserves the approval gate|current local authority\/local queue surfaces|queue clients remain a separate local-only slice/,
    'post-decision docs must not keep stale queue-only or pre-decision-client wording',
  );
  assert.ok(
    postMockPlan.includes('queue and decision clients are complete local-only slices'),
    'post-mock readiness plan should mark queue/decision clients complete instead of future separate work',
  );
  assert.ok(
    contractsReadme.includes('Approval required: runtime listing submission beyond local queue/decision state or MarketRegistry admin mutation'),
    'contracts README should point to the approval gate instead of a completed listing-policy slice',
  );
  assert.doesNotMatch(
    contractsReadme,
    /Recommended next slice: token listing and MarketRegistry metadata flow/,
    'contracts README must not keep the completed token-listing metadata flow as the next slice',
  );
  assert.ok(
    wrappedPlan.includes('Completed: TypeScript SDK, Python SDK, and `qdex` CLI clients expose the read-only listing policy'),
    'wrapped token plan should mark listing-policy clients complete',
  );
  assert.doesNotMatch(
    wrappedPlan,
    /Next implementation slice\n\nToken listing and MarketRegistry metadata flow clients/,
    'wrapped token plan should not keep completed listing-policy client exposure as the next slice',
  );
});
