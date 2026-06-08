# Terminal UI

Browser UI with terminal/TUI aesthetics.

Palette:

```text
background #000000
text       #e5e5e5
muted      #666666
green      #00ff66
red        #ff3355
yellow     #ffd166
border     #222222
font       monospace
```

Current slice:

- `index.html` renders a static terminal-native trade/proof panel, then attempts local `fills`, `orders`, `balances`, `deposits`, `withdrawals`, `delegate-key-registrations`, and `delegate-key-revocations` WebSocket bindings at `http://127.0.0.1:8787`, plus prepare-only vault and delegate/API key operation triggers, read-only FeeManager fee schedule metadata, read-only vault history REST smoke, read-only delegate-key history REST smoke, a REST-confirmed vault history stream smoke, and a REST-confirmed delegate-key history stream smoke.
- `src/mock-order-trigger.js` wires the browser button to post a deterministic local/dev resting sell plus `market_ioc` crossing buy, then verifies the proof-service response remains mock-only (`null` tx/block/explorer, no funds moved).
- `src/mock-cancel-trigger.js` wires a browser smoke button that creates one resting local/dev order and immediately sends matcher-local `DELETE /v1/orders/:orderHash`; it displays that this does not cancel on-chain `NonceManager` nonces and never creates fills/proofs/fund movement.
- `src/cancel-stream-binding.js` composes the cancel trigger with the private `orders` WebSocket stream so local/dev smoke runs subscribe-before-click against the same API base URL.
- `src/vault-prepare-trigger.js` wires prepare-only TradingVault deposit/withdrawal buttons to `POST /v1/vault/deposits/prepare` and `POST /v1/vault/withdrawals/prepare`; it treats the intentional HTTP `501` owner-wallet boundary as displayable metadata, never as wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- `src/vault-prepare-binding.js` performs the local browser/API vault prepare smoke: it composes the deposit/withdrawal buttons with local API-bound callbacks, and the smoke test starts `createApiServer()` before clicking both buttons so the rendered `501` owner-wallet envelope stays local/source-only.
- `src/delegate-key-prepare-trigger.js` wires prepare-only delegate/API key registration and revocation buttons to `POST /v1/delegate-keys` and `DELETE /v1/delegate-keys/{keyId}`; it treats intentional HTTP `501` owner-signed envelopes as displayable metadata and preserves `owner-wallet-signature-required`, `NO_WITHDRAW`, `NO_ADMIN`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- `src/delegate-key-prepare-binding.js` performs the local browser/API delegate-key prepare smoke: it composes the register/revoke buttons with local API-bound callbacks, and the smoke test starts `createApiServer()` before clicking both buttons so the rendered owner-signed `501` envelope stays local/source-only with no live `DelegateKeyRegistry` mutation.
- `src/delegate-key-history-panel.js` provides the dependency-light fixture/normalizer for the read-only DelegateKeyRegistry registration/revocation history panel; it renders `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations` style envelopes with `source: delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior visible even when the local/mock history arrays are empty.
- `src/delegate-key-history-binding.js` performs the local API + terminal UI delegate-key history smoke: it reads `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`, requires both REST envelopes to stay on the same read-only `delegatekeyregistry-event-projection` safety envelope, then renders the terminal delegate/API key history panel with `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, mock-null event evidence, empty arrays as valid local state, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- `src/live-delegate-key-history.js` consumes private `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations` snapshots, validates the same `delegatekeyregistry-event-projection` DelegateKeyRegistry event envelopes, and renders the terminal delegate/API key history panel with `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, no wallet loaded, no live DelegateKeyRegistry mutation, no funds moved, and no delegate withdrawal/admin authority.
- `src/delegate-key-history-stream-binding.js` performs the local API + terminal UI DelegateKeyRegistry history stream integration smoke: first reads `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`, then subscribes to `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations`, rendering only on REST + WebSocket agreement for `source: delegatekeyregistry-event-projection`, `DelegateKeyRegisteredProjection`, `DelegateKeyRevokedProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, mock-null event evidence, `delegateCanWithdraw: false`, `delegateCanAdmin: false`, `delegateKeyRegistryMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- `src/fee-policy-panel.js` provides the dependency-light fixture/normalizer for the read-only FeeManager fee schedule panel; it renders `GET /v1/fees` style metadata with `source: feemanager-policy-projection`, `FeeScheduleProjection`, `eventName: FeesUpdated`, `hardMaxFeeBps: 1000`, `feeRecipient: null`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `feeManagerMutation: false`, `tradingVaultMutation: false`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior visible from the static terminal UI fixture.
- `src/live-fills.js` consumes `/v1/ws?channel=fills`, validates private stream safety (`READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`), fetches the proof-service envelope, and re-renders the panel from adapter-shaped fill/proof rows.
- `src/live-orders.js` consumes `/v1/ws?channel=orders`, validates private order/cancel stream safety, renders matcher-local cancellation updates, and keeps `NO_WITHDRAW`/`NO_ADMIN` plus on-chain nonce-unchanged wording visible.
- `src/live-balances.js` consumes `/v1/ws?channel=balances`, validates the read-only `mock-vault-projection`, and renders the private balance panel with `settlementMode: mock`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, no wallet loaded, and no funds moved.
- `src/balance-stream-binding.js` performs the local browser/API balance smoke: first checks `GET /v1/account/balances`, then binds the private `balances` WebSocket and requires both surfaces to stay on the same read-only `mock-vault-projection` safety envelope.
- `src/vault-history-panel.js` provides the dependency-light fixture/normalizer for the read-only TradingVault deposit/withdrawal history panel; it keeps `source: tradingvault-event-projection`, `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior visible even when the local/mock history arrays are empty.
- `src/vault-history-binding.js` performs the local API + terminal UI vault history smoke: it reads `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals`, requires both REST envelopes to stay on the same read-only `tradingvault-event-projection` safety envelope, then renders the terminal vault history panel with mock-null tx/block/event/explorer evidence and empty arrays as valid local state.
- `src/live-vault-history.js` consumes private `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals` snapshots, validates the same `tradingvault-event-projection` TradingVault event envelopes, and renders the terminal vault history panel with `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.
- `src/vault-history-stream-binding.js` performs the local API + terminal UI vault history stream smoke: first reads `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals`, then subscribes to `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals`, rendering only when REST and WebSocket envelopes agree on `source: tradingvault-event-projection`, `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, mock-null event evidence, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`.
- `src/mock-vertical-fixture.js` mirrors the deterministic adapter-shaped mock API slice: crossed `QI-QUAI` orders -> `fill-000001` with `projectionType: IndexedFillProjection` and `sourceEventId` -> `trade-000001` -> proof-service/indexer projection; the fill is not a matcher-local FillPacket.
- `src/render.js` surfaces projection sources and live stream safety while keeping the mock settlement/balance boundaries explicit: `settlementMode: mock`, no real Quai transaction, no explorer URL, no wallet loaded, and no funds moved.

Run locally:

```bash
pnpm --filter @qdex/api dev
pnpm --filter @qdex/terminal-ui check
python3 -m http.server 8080 -d web/terminal-ui
```

With the API running, the browser keeps the static fixture as fallback and updates after confirmed mock fills, matcher-local order cancellation updates, read-only mock vault balance snapshots, private read-only vault history stream snapshots, prepare-only vault operation responses, prepare-only delegate/API key owner-signed `501` envelopes, or read-only vault history REST envelopes arrive from local surfaces. The static fixture also renders a read-only TradingVault deposit/withdrawal history panel from `tradingvault-event-projection` envelopes; empty local/mock history arrays are valid and stay visibly `READ_ONLY` with `NO_WITHDRAW`/`NO_ADMIN`, `settlementMode: mock`, mock-null tx/block/event/explorer evidence, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior. The vault history smoke starts local `createApiServer()`, reads `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals`, feeds those envelopes through `src/vault-history-binding.js`, and renders only if REST + panel agree on `source: tradingvault-event-projection`, `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, null event evidence, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, and `tradingVaultMutation: false`. The REST-confirmed live vault history stream smoke uses `src/vault-history-stream-binding.js` to read `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals` before subscribing to `/v1/ws?channel=deposits` and `/v1/ws?channel=withdrawals`, and renders only when REST + WebSocket agree on `source: tradingvault-event-projection`, `TradingVaultDepositProjection`, `TradingVaultWithdrawalProjection`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `settlementMode: mock`, mock-null event evidence, `realQuaiTransactions: false`, `walletRequired: false`, `fundsMoved: false`, `tradingVaultMutation: false`, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority. The balance smoke first reads `GET /v1/account/balances` and then consumes `/v1/ws?channel=balances`, requiring both to agree on `mock-vault-projection`, `settlementMode: mock`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, no wallet loaded, and no funds moved. The cancel smoke button creates a resting mock order and cancels only matcher-open quantity; it does not mutate on-chain `NonceManager` nonces, create fills/proofs, or move funds. Order cancellation stream panels are off-chain matcher state only: they do not imply on-chain `NonceManager` nonce cancellation and never grant withdrawal/admin authority. The vault prepare smoke starts local `createApiServer()`, clicks both prepare buttons, and renders the intentional HTTP `501` owner-wallet boundary envelope only as local/source-only metadata with `NO_WITHDRAW`, `NO_ADMIN`, `owner-wallet-required`, `delegates-cannot-deposit-or-withdraw`, `fundsMoved: false`, `tradingVaultMutation: false`, and no wallet/RPC/signing/broadcast/deploy/tx/funds behavior.

Core screens:

- markets
- exchange view
- orderbook
- chart/depth
- limit/IOC-market form
- balances
- open orders
- fills/trade history
- proof links
- API/delegate key manager

Command palette ideas:

```text
:buy QI-QUAI 1000 @ 0.123
:sell QI-QUAI 500 market slippage=0.5%
:cancel all
:withdraw QUAI 10  # future owner-wallet-only flow, never delegate/API-key default
:api create-key bot-mm-1 --prepare  # owner-wallet-signature-required; NO_WITHDRAW/NO_ADMIN
:api revoke-key bot-mm-1 --prepare  # prepare-only; no live DelegateKeyRegistry mutation
```
