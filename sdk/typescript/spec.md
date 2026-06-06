# TypeScript SDK Bot Contract

The TypeScript SDK is the first-class bot and market-maker client for QDex. It wraps the public/private REST API without changing custody semantics: API state is projection/cache, and final fill/proof truth comes from settlement/indexer projections.

## Client surface

```ts
const dex = new QDexClient({ baseUrl, wallet, delegateKey });

await dex.markets.list();
await dex.orderbook.get(marketId);

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

const fillPacket: FillPacket = await dex.orders.submitSignedOrder(limitOrder); // POST /v1/orders
await dex.fills.stream();
const proof: TradeProof = await dex.proofs.trade(tradeId); // GET /v1/proofs/trades/:tradeId
await dex.orders.cancelAll({ marketId: 'QI-QUAI' });
```

## Order semantics

- `createLimitOrder` signs a replay-safe `SignedOrder` for a normal limit order.
- `createMarketIocOrder` creates a `market_ioc` IOC limit order, not an unbounded market order.
- Every `market_ioc` order carries signed price/slippage bounds through `maxSlippageBps`.
- `submitSignedOrder` sends the exact signed payload to `POST /v1/orders`; the SDK must not rewrite price, amount, nonce, owner, delegate, chain, or settlement contract fields after signing.

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

- `FillPacket` is a matcher/relayer handoff object.
- `TradeProof` is final only when backed by confirmed settlement/indexer truth.
- In local mock mode, proof responses keep `settlementMode: mock`, include a mock reference, and must not claim a real Quai transaction or moved funds.
