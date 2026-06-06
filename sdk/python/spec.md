# Python SDK Bot Contract

The Python SDK is for agents, research scripts, and market makers. It mirrors the TypeScript bot flow while preserving the same custody boundary: API state is projection/cache, and settlement/indexer events remain final truth.

## Client surface

```python
dex = QDexClient(base_url=base_url, wallet=wallet, delegate_key=delegate_key)

markets = dex.markets.list()
book = dex.orderbook.get(market_id)

limit_order: SignedOrder = dex.orders.create_limit_order(
    market_id='QI-QUAI',
    side='buy',
    amount='1000',
    price='0.123',
)

market_order: SignedOrder = dex.orders.create_market_ioc_order(
    market_id='QI-QUAI',
    side='sell',
    quote_amount='100',
    max_slippage_bps=50,
)

fill_packet: FillPacket = dex.orders.submit_signed_order(limit_order)  # POST /v1/orders
for fill in dex.fills.stream():
    handle_fill(fill)
proof: TradeProof = dex.proofs.trade(trade_id)  # GET /v1/proofs/trades/:tradeId
dex.orders.cancel_all(market_id='QI-QUAI')
```

## Order semantics

- `create_limit_order` signs a replay-safe `SignedOrder` for normal limit flow.
- `create_market_ioc_order` creates a `market_ioc` IOC limit order, never an unbounded market order.
- Every `market_ioc` order carries signed price/slippage bounds through `max_slippage_bps`.
- `submit_signed_order` posts the exact signed payload to `POST /v1/orders`; the SDK must not mutate amount, price, nonce, owner, delegate, chain, or settlement contract fields after signing.

## Delegate/API key safety

Delegate keys default to NO_WITHDRAW and NO_ADMIN.

A delegate key may include:

```text
allowed_markets
max_notional
expires_at
READ_ONLY
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
NO_WITHDRAW
NO_ADMIN
```

Delegate keys cannot withdraw funds. Withdrawals require the main wallet or a separate future high-trust flow outside this bot SDK contract. The SDK must not expose a delegate-key withdrawal helper.

## Proof contract

The SDK consumes `TradeProof` as read-only projection data:

- `FillPacket` is a matcher/relayer handoff object.
- `TradeProof` is final only when backed by confirmed settlement/indexer truth.
- In local mock mode, proof responses keep `settlementMode: mock`, include a mock reference, and must not claim a real Quai transaction or moved funds.
