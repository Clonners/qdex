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

- `index.html` renders a static terminal-native trade/proof panel, then attempts local `fills`, `orders`, and `balances` WebSocket bindings at `http://127.0.0.1:8787`, plus prepare-only vault operation triggers.
- `src/mock-order-trigger.js` wires the browser button to post a deterministic local/dev resting sell plus `market_ioc` crossing buy, then verifies the proof-service response remains mock-only (`null` tx/block/explorer, no funds moved).
- `src/mock-cancel-trigger.js` wires a browser smoke button that creates one resting local/dev order and immediately sends matcher-local `DELETE /v1/orders/:orderHash`; it displays that this does not cancel on-chain `NonceManager` nonces and never creates fills/proofs/fund movement.
- `src/cancel-stream-binding.js` composes the cancel trigger with the private `orders` WebSocket stream so local/dev smoke runs subscribe-before-click against the same API base URL.
- `src/vault-prepare-trigger.js` wires prepare-only TradingVault deposit/withdrawal buttons to `POST /v1/vault/deposits/prepare` and `POST /v1/vault/withdrawals/prepare`; it treats the intentional HTTP `501` owner-wallet boundary as displayable metadata, never as wallet/RPC/signing/broadcast/deploy/tx/funds behavior.
- `src/vault-prepare-binding.js` performs the local browser/API vault prepare smoke: it composes the deposit/withdrawal buttons with local API-bound callbacks, and the smoke test starts `createApiServer()` before clicking both buttons so the rendered `501` owner-wallet envelope stays local/source-only.
- `src/live-fills.js` consumes `/v1/ws?channel=fills`, validates private stream safety (`READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`), fetches the proof-service envelope, and re-renders the panel from adapter-shaped fill/proof rows.
- `src/live-orders.js` consumes `/v1/ws?channel=orders`, validates private order/cancel stream safety, renders matcher-local cancellation updates, and keeps `NO_WITHDRAW`/`NO_ADMIN` plus on-chain nonce-unchanged wording visible.
- `src/live-balances.js` consumes `/v1/ws?channel=balances`, validates the read-only `mock-vault-projection`, and renders the private balance panel with `settlementMode: mock`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, no wallet loaded, and no funds moved.
- `src/balance-stream-binding.js` performs the local browser/API balance smoke: first checks `GET /v1/account/balances`, then binds the private `balances` WebSocket and requires both surfaces to stay on the same read-only `mock-vault-projection` safety envelope.
- `src/mock-vertical-fixture.js` mirrors the deterministic adapter-shaped mock API slice: crossed `QI-QUAI` orders -> `fill-000001` with `projectionType: IndexedFillProjection` and `sourceEventId` -> `trade-000001` -> proof-service/indexer projection; the fill is not a matcher-local FillPacket.
- `src/render.js` surfaces projection sources and live stream safety while keeping the mock settlement/balance boundaries explicit: `settlementMode: mock`, no real Quai transaction, no explorer URL, no wallet loaded, and no funds moved.

Run locally:

```bash
pnpm --filter @qdex/api dev
pnpm --filter @qdex/terminal-ui check
python3 -m http.server 8080 -d web/terminal-ui
```

With the API running, the browser keeps the static fixture as fallback and updates after confirmed mock fills, matcher-local order cancellation updates, read-only mock vault balance snapshots, or prepare-only vault operation responses arrive from local surfaces. The balance smoke first reads `GET /v1/account/balances` and then consumes `/v1/ws?channel=balances`, requiring both to agree on `mock-vault-projection`, `settlementMode: mock`, `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`, `realQuaiTransactions: false`, `walletRequired: false`, no wallet loaded, and no funds moved. The cancel smoke button creates a resting mock order and cancels only matcher-open quantity; it does not mutate on-chain `NonceManager` nonces, create fills/proofs, or move funds. Order cancellation stream panels are off-chain matcher state only: they do not imply on-chain `NonceManager` nonce cancellation and never grant withdrawal/admin authority. The vault prepare smoke starts local `createApiServer()`, clicks deposit and withdrawal buttons, accepts the intentional HTTP `501` owner-wallet boundary envelopes for display, and keeps `fundsMoved: false`, `tradingVaultMutation: false`, `walletRequired: false`, `NO_WITHDRAW`, `NO_ADMIN`, and no wallet/RPC/signing/broadcast/deploy/tx behavior visible.

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
:api create-key bot-mm-1 scope=trade expires=7d
```
