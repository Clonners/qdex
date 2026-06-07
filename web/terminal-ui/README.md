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

- `index.html` renders a static terminal-native trade/proof panel, then attempts a local `fills` WebSocket binding at `http://127.0.0.1:8787`.
- `src/mock-order-trigger.js` wires the browser button to post a deterministic local/dev resting sell plus `market_ioc` crossing buy, then verifies the proof-service response remains mock-only (`null` tx/block/explorer, no funds moved).
- `src/live-fills.js` consumes `/v1/ws?channel=fills`, validates private stream safety (`READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`), fetches the proof-service envelope, and re-renders the panel from adapter-shaped fill/proof rows.
- `src/live-orders.js` consumes `/v1/ws?channel=orders`, validates private order/cancel stream safety, renders matcher-local cancellation updates, and keeps `NO_WITHDRAW`/`NO_ADMIN` plus on-chain nonce-unchanged wording visible.
- `src/mock-vertical-fixture.js` mirrors the deterministic adapter-shaped mock API slice: crossed `QI-QUAI` orders -> `fill-000001` with `projectionType: IndexedFillProjection` and `sourceEventId` -> `trade-000001` -> proof-service/indexer projection; the fill is not a matcher-local FillPacket.
- `src/render.js` surfaces projection sources and live stream safety while keeping the mock settlement boundary explicit: `settlementMode: mock`, no real Quai transaction, no explorer URL, no funds moved.

Run locally:

```bash
pnpm --filter @qdex/api dev
pnpm --filter @qdex/terminal-ui check
python3 -m http.server 8080 -d web/terminal-ui
```

With the API running, the browser keeps the static fixture as fallback and updates after confirmed mock fills or matcher-local order cancellation updates arrive over local WebSocket streams. Order cancellation stream panels are off-chain matcher state only: they do not imply on-chain `NonceManager` nonce cancellation and never grant withdrawal/admin authority.

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
