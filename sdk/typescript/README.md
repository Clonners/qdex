# TypeScript SDK

First-class client for bots, market makers and frontend code.

Planned surface:

```ts
const dex = new QDexClient({ baseUrl, wallet });
await dex.markets.list();
await dex.orderbook.get('QI-QUAI');
await dex.orders.placeLimit({ market: 'QI-QUAI', side: 'buy', amount, price });
await dex.orders.cancelAll({ market: 'QI-QUAI' });
await dex.proofs.trade(tradeId);
```
