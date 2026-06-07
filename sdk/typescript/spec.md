# TypeScript SDK Bot Contract

The TypeScript SDK is the first-class bot and market-maker client for QDex. It wraps the public/private REST API without changing custody semantics: API state is projection/cache, and final fill/proof truth comes from settlement/indexer projections.

## Client surface

```ts
const dex = new QDexClient({ baseUrl, wallet, delegateKey });

await dex.markets.list();
await dex.orderbook.get(marketId);
await dex.contracts.get(); // GET /v1/contracts
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
const proof: TradeProof = await dex.proofs.trade(tradeId); // GET /v1/proofs/trades/:tradeId
await dex.orders.cancelAll({ marketId: 'QI-QUAI' });
```

`fills.openStream()` and `fills.stream()`/`fills.stream({ limit })` consume WebSocket snapshots only; they never grant withdrawal/admin authority and private snapshots must preserve `READ_ONLY`, `NO_WITHDRAW`, and `NO_ADMIN` permissions.

`orders.openStream()` and `orders.stream()`/`orders.stream({ limit })` consume `/v1/ws?channel=orders` snapshots and live matcher-local order updates. Cancellation events must keep `matcher-local-cancel-only-on-chain-nonce-unchanged`, `CANCEL_ORDER`/`CANCEL_ALL`, `NO_WITHDRAW`, and `NO_ADMIN` visible so bots do not mistake off-chain removal for on-chain `NonceManager` mutation.

`contracts.get()` is read-only contract-registry metadata from `GET /v1/contracts`. In local MVP mode it must preserve `local-only-not-deployed`, null contract addresses, `realQuaiTransactions: false`, `walletRequired: false`, and `NO_WITHDRAW`/`NO_ADMIN` delegate safety; it must not load wallets, send transactions, or imply deployment authority.

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
