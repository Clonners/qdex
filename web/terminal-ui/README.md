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

- `index.html` renders a static terminal-native trade/proof panel.
- `src/mock-vertical-fixture.js` mirrors the deterministic adapter-shaped mock API slice: crossed `QI-QUAI` orders -> `fill-000001` with `sourceEventId` -> `trade-000001` -> proof-service/indexer projection.
- `src/render.js` surfaces projection sources while keeping the mock settlement boundary explicit: `settlementMode: mock`, no real Quai transaction, no explorer URL, no funds moved.

Run locally:

```bash
pnpm --filter @qdex/terminal-ui check
python3 -m http.server 8080 -d web/terminal-ui
```

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
