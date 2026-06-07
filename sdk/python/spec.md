# Python SDK Bot Contract

The Python SDK is for agents, research scripts, and market makers. It mirrors the TypeScript bot flow while preserving the same custody boundary: API state is projection/cache, and settlement/indexer events remain final truth.

## Client surface

```python
dex = QDexClient(base_url=base_url, wallet=wallet, delegate_key=delegate_key)

markets = dex.markets.list()
book = dex.orderbook.get(market_id)
contracts = dex.contracts.get()  # GET /v1/contracts
relayer_gate = dex.relayer.settlement_mode_gate.get()  # GET /v1/relayer/settlement-mode-gate
nonce_cancel_prepare = dex.nonces.prepare_cancel({
    'action': 'cancelNonce',
    'owner': '0xowner',
    'nonce': '42',
    'chainId': 0,
    'nonceManagerContract': '0xnonce-manager',
    'expiresAt': 1780003600,
    'signature': '0xowner-signature',
})  # POST /v1/nonces/cancel -> owner_signed_nonce_cancel_not_implemented while prepare-only

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

order_result: OrderSubmissionResult = dex.orders.submit_signed_order(limit_order)  # POST /v1/orders
fill_projection: IndexedFillProjection | None = (order_result.get('fills') or [None])[0]
if fill_projection is not None:
    assert fill_projection['projectionType'] == 'IndexedFillProjection'
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
- `OrderSubmissionResult` is the API response shape: it contains order state plus zero or more `IndexedFillProjection` rows projected from confirmed/mock-confirmed settlement.
- OrderSubmissionResult fills are public IndexedFillProjection rows and each row must carry `projectionType: 'IndexedFillProjection'` plus `sourceEventId`.
- `submit_signed_order` must not expose the matcher/relayer `FillPacket` handoff object as its public return type.
- `orders.cancel_all(market_id=...)` calls `POST /v1/orders/cancel-all`; in local mock mode it cancels only matcher-open quantity, carries `CANCEL_ALL`, `CANCEL_ORDER`, `NO_WITHDRAW`, and `NO_ADMIN`, and does not cancel on-chain NonceManager nonces without a separate owner-signed flow.

## Contract registry

`contracts.get()` is a read-only contract-registry call to `GET /v1/contracts`. In local MVP mode it must preserve `local-only-not-deployed`, null contract addresses, `realQuaiTransactions: false`, `walletRequired: false`, and `NO_WITHDRAW`/`NO_ADMIN` delegate safety.

The registry includes `nativeQiStatus` for `QI-QUAI`: `status: design-required`, `currentTreatment: mock-only`, and `nativeQiModel: UTXO-model`. Accepted future paths are limited to `wrapped_qi_receipt_token`, `contract_native_qi_adapter`, or `conversion_settlement_flow`; no selected path exists before explicit approval and evidence. The status is read-only metadata and its safety notice must say there is no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real Qi settlement claim.

The Python SDK must not load wallets, send transactions, read RPC URLs, infer real contract addresses, or imply deploy authority from this metadata. Native Qi remains UTXO-model and requires a wrapper/adapter/conversion design before any real `QI-QUAI` vault settlement claim.

## Relayer settlement-mode gate

`relayer.settlement_mode_gate.get()` is read-only relayer approval-gate metadata from `GET /v1/relayer/settlement-mode-gate`. It exposes `source: relayer-approval-gate`, `currentSettlementMode: mock`, and the blocked `quai_contract` result `real_quai_approval_gate_blocked` so Python bots/operators can inspect readiness without wallet loading, signing, broadcast, RPC URL access, or transaction submission.

## Owner-signed nonce cancellation

`nonces.prepare_cancel()` is a prepare-only client for `POST /v1/nonces/cancel`. It intentionally surfaces the API placeholder response `owner_signed_nonce_cancel_not_implemented` with `owner-signed-required`, `NO_WITHDRAW`, and `NO_ADMIN`; it performs no wallet loading, signing, broadcast, or relayer submission and must not be confused with matcher-local `orders.cancel_all`.

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

- `FillPacket` is an internal matcher/relayer handoff object, not a public SDK/API order response.
- `IndexedFillProjection` rows are public only after confirmed settlement/indexer truth and must carry `sourceEventId`.
- `TradeProof` is final only when backed by confirmed settlement/indexer truth.
- In local mock mode, proof responses keep `settlementMode: mock`, include a mock reference, and must not claim a real Quai transaction or moved funds.
