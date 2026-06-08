# Signed Order Schema

This document defines the canonical payload shared by the API gateway, matching engine, relayer, mock settlement, indexer, SDKs and CLI. The MVP may accept mock signatures, but the payload must already carry the replay-protection fields needed by Quai settlement contracts.

The schema is intentionally spot-only and single-zone for the MVP. It does not introduce custody: users keep withdrawal authority in the vault/settlement design, and delegate/API keys are trade-only by default with `NO_WITHDRAW`.

## Canonical payload

```json
{
  "marketId": "QI-QUAI",
  "side": "buy",
  "type": "limit",
  "baseToken": "mock:QI",
  "quoteToken": "mock:QUAI",
  "amount": "1000000000000000000",
  "price": "123000000000000000",
  "timeInForce": "GTC",
  "maxSlippageBps": 0,
  "owner": "0x1111111111111111111111111111111111111111",
  "delegate": "0x0000000000000000000000000000000000000000",
  "nonce": "1",
  "expiresAt": 1780000000,
  "chainId": 0,
  "settlementContract": "0x2222222222222222222222222222222222222222",
  "clientOrderId": "optional-bot-id-001",
  "signature": {
    "scheme": "mock",
    "signer": "0x1111111111111111111111111111111111111111",
    "value": "0xmock-signature",
    "signedAt": 1780000000
  }
}
```

## Field rules

| Field | Rule |
| --- | --- |
| `marketId` | Canonical market pair string, e.g. `QI-QUAI`. Must exist in `MarketRegistry` before real settlement. |
| `side` | `buy` or `sell`. |
| `type` | `limit` or `market_ioc`. Market orders are IOC limit orders with slippage bounds, never unbounded market execution. |
| `baseToken`, `quoteToken` | Mock token IDs for the MVP, later canonical token/adapter addresses. Native Qi is not assumed to be ERC-20 vault collateral until a wrapper/adapter is designed. |
| `amount` | Base quantity in atomic units as a decimal string. |
| `price` | Quote-per-base limit price in atomic units as a decimal string. |
| `timeInForce` | `GTC`, `IOC`, `FOK`, or `POST_ONLY`; `market_ioc` must use `IOC`. |
| `maxSlippageBps` | Required for `market_ioc`; zero for normal limit orders unless the client wants stricter execution guards. |
| `owner` | Main wallet address that owns funds and can withdraw. |
| `delegate` | Optional delegate signer. Delegates can place/cancel orders only within permission caps and must be `NO_WITHDRAW`. |
| `nonce` | Owner/delegate nonce consumed by settlement; cancelled or used nonces cannot be replayed. |
| `expiresAt` | Unix seconds. Expired orders are rejected by matching and settlement. |
| `chainId` | Quai chain/zone replay domain. Mock/dev may use `0`; real deployments must pin the actual chain ID. |
| `settlementContract` | Settlement contract address in the replay domain. Prevents signatures intended for one venue from filling elsewhere. |
| `signature` | Signature over the canonical order hash. MVP supports `mock`; production should use typed structured data once Quai signing details are pinned. |

## Hashing and replay domain

The order hash is computed over the normalized order fields excluding mutable projection fields such as `filledAmount`, `remainingAmount`, `status`, and indexer metadata.

Replay protection is mandatory:

```text
orderHash = hash(
  marketId,
  side,
  type,
  baseToken,
  quoteToken,
  amount,
  price,
  timeInForce,
  maxSlippageBps,
  owner,
  delegate,
  nonce,
  expiresAt,
  chainId,
  settlementContract
)
```

The settlement plane must reject a fill when the nonce is used/cancelled, the order is expired, the chain ID or settlement contract differs, the market is disabled, or the fee/slippage constraints are violated.

## Partial fills

Limit orders support partial fills. The indexer/API projection tracks:

```json
{
  "orderHash": "0x...",
  "status": "partially_filled",
  "filledAmount": "400000000000000000",
  "remainingAmount": "600000000000000000"
}
```

A fill is valid only if cumulative `filledAmount <= amount`. The settlement contract or mock settlement ledger is the source of truth; API state is a projection.

## Market orders

Market orders are represented as `type = "market_ioc"` plus a limit price and `maxSlippageBps`. The matcher may cross immediately, but the FillPacket must still prove the executed price satisfies the signed maximum paid/minimum received.

For example, a buy-side market IOC signs a maximum quote paid. A sell-side market IOC signs a minimum quote received. Any residual amount is cancelled instead of resting on the book.

## FillPacket

A deterministic match produces a `FillPacket` for relayer/mock settlement. `FillPacket` remains the internal matcher/relayer handoff, not a public API/SDK order response type. It proves the matched maker/taker orders, replay domain, price/amount constraints, fees, and cumulative fill accounting before settlement can be marked final.

The relayer marks the packet `confirmed` only after mock or contract settlement. The indexer then projects the source settlement event into public fills and trade proofs. Later, the same settlement truth boundary should map to real Quai settlement events.

## IndexedFillProjection

Public API and WebSocket rows use `IndexedFillProjection`. FillPacket remains the internal matcher/relayer handoff; the public projection below is adapter-shaped indexer truth after confirmed settlement. This public fill is not matcher-local truth; `sourceEventId` points back to the source settlement event that the indexer accepted.

```json
{
  "projectionType": "IndexedFillProjection",
  "fillId": "fill-000001",
  "tradeId": "trade-000001",
  "marketId": "QI-QUAI",
  "makerOrderHash": "0xmaker",
  "takerOrderHash": "0xtaker",
  "maker": "0x1111111111111111111111111111111111111111",
  "taker": "0x3333333333333333333333333333333333333333",
  "price": "123000000000000000",
  "amount": "1000000000000000000",
  "makerFee": "0",
  "takerFee": "0",
  "settlementMode": "mock",
  "settlementStatus": "confirmed",
  "sourceEventId": "event-000001"
}
```

## Order cancellation

`DELETE /v1/orders/{orderHash}` and `POST /v1/orders/cancel-all` return `CancellationResult` payloads in the local mock loop. They remove matcher-open quantity only: a successful mock cancellation does not cancel on-chain NonceManager nonces, does not mutate vault balances, and does not grant withdrawal authority.

A cancelled order row uses `nonceCancellation: "not-implied-matcher-local-only"` so bot/SDK consumers cannot confuse matcher-local book cleanup with an owner-signed NonceManager cancellation. The cancellation permission surface is trade-only:

```json
{
  "cancelled": true,
  "cancelledCount": 1,
  "cancelledOrders": [
    {
      "orderHash": "0xorder",
      "status": "cancelled",
      "remainingAmount": "0",
      "cancelledAmount": "100",
      "cancelReason": "cancel_order",
      "nonceCancellation": "not-implied-matcher-local-only"
    }
  ],
  "source": "mock-matching-engine",
  "custody": "non-custodial-no-withdrawal-authority",
  "nonceManager": "matcher-local-cancel-only-on-chain-nonce-unchanged",
  "permissions": ["CANCEL_ORDER", "NO_WITHDRAW", "NO_ADMIN"],
  "message": "Mock cancellation removes only matcher-open quantity and does not cancel the on-chain nonce; user nonce cancellation must be signed through NonceManager later."
}
```

`POST /v1/orders/cancel-all` may add `CANCEL_ALL` to the permissions list and may echo `filters.marketId`/`filters.owner`, but it still cancels matcher-open quantity only and does not cancel on-chain NonceManager nonces. `CancellationError` payloads such as `order_not_found` and `order_not_open` carry the same custody, `nonceManager`, `NO_WITHDRAW`, and `NO_ADMIN` safety fields.

## Owner-signed nonce cancellation

`POST /v1/nonces/cancel` is a prepare-only `501` placeholder for the separate owner-signed NonceManager cancellation flow. Matcher-local cancellation does not mutate on-chain NonceManager nonces; it only removes open matcher quantity from the local orderbook.

Future real behavior must target `cancelNonce(uint256 nonce)` or `cancelNonceRange(uint256 from, uint256 to)` on `NonceManager` only after an explicit owner wallet signing and approved Quai broadcast design exists. Delegate/API keys cannot submit this flow by default. `CANCEL_ORDER` and `CANCEL_ALL` remain matcher-local permissions only; nonce cancellation responses keep `NO_WITHDRAW` and `NO_ADMIN` visible.

The current placeholder response is intentionally non-executable and has no wallet loading, no transaction signing, no RPC broadcast, and no relayer submission:

```json
{
  "error": "owner_signed_nonce_cancel_not_implemented",
  "source": "owner-signed-nonce-cancel-placeholder",
  "custody": "non-custodial",
  "nonceManager": "owner-signed-required",
  "permissions": ["NO_WITHDRAW", "NO_ADMIN"],
  "message": "Matcher-local cancellation does not mutate on-chain NonceManager nonces.",
  "realQuaiTransactions": false,
  "walletRequired": false,
  "approvalGate": "explicit-approval-required-before-wallet-signing-or-quai-broadcast"
}
```

A future request shape may carry `action`, `owner`, `nonce` or `nonceRange`, `chainId`, `nonceManagerContract`, `expiresAt`, and an owner wallet `signature`, but the local MVP route must stay placeholder-only until the approval gates in the post-mock readiness plan are satisfied.

## Delegate/API key prepare-only boundary

`GET /v1/delegate-keys` is a read-only local registry projection for bot/operator metadata. It returns an empty local list plus required future fields (`delegate`, `expiresAt`, `allowedMarkets`, `maxNotional`, and `permissions`) so bots can validate the shape before live owner-signed registration exists.

`POST /v1/delegate-keys` and `DELETE /v1/delegate-keys/{keyId}` are prepare-only `501` owner-signed boundaries under `source: "delegate-key-owner-signed-prepare-boundary"`. The current registration placeholder returns `delegate_key_registration_not_implemented`; the revocation placeholder returns `delegate_key_revocation_not_implemented`. Both preserve `operationStatus: "prepare-only-owner-signed-required"` and `ownerAuthorization: "owner-wallet-signature-required"` without loading a wallet.

No delegate key is registered or revoked in local prepare-only mode. Delegate/API keys remain trade-only: `PLACE_ORDER`, `CANCEL_ORDER`, and `CANCEL_ALL` may be listed as future trade permissions, but every response must keep `NO_WITHDRAW` and `NO_ADMIN` visible and must say there is no wallet loading, signing, broadcast, deploy, transaction helper, real registry mutation, TradingVault mutation, or funds movement.

```json
{
  "error": "delegate_key_registration_not_implemented",
  "source": "delegate-key-owner-signed-prepare-boundary",
  "operation": "register_delegate_key",
  "operationStatus": "prepare-only-owner-signed-required",
  "ownerAuthorization": "owner-wallet-signature-required",
  "requiredFields": ["delegate", "expiresAt", "allowedMarkets", "maxNotional", "permissions"],
  "permissions": ["PLACE_ORDER", "CANCEL_ORDER", "CANCEL_ALL", "NO_WITHDRAW", "NO_ADMIN"],
  "delegateCanWithdraw": false,
  "delegateCanAdmin": false,
  "realQuaiTransactions": false,
  "walletRequired": false,
  "fundsMoved": false,
  "tradingVaultMutation": false,
  "message": "No delegate key is registered or revoked in local prepare-only mode."
}
```

## API usage

`POST /v1/orders` accepts an `OrderRequest` containing the `SignedOrder`. Successful acceptance returns an `OrderAccepted` payload with `orderHash`, `status`, and projection fields. A confirmed `IndexedFillProjection` must be retrievable through `GET /v1/fills` and `GET /v1/proofs/trades/{tradeId}`.

## Invariants

- No order schema field grants withdrawal authority.
- Delegate/API keys default to `NO_WITHDRAW` and cannot withdraw funds.
- Contract events or mock settlement confirmations are final truth; API state is cache/projection.
- `chainId`, `settlementContract`, `nonce`, and `expiresAt` are required for replay-safe orders.
- Every FillPacket must be traceable to a proof projection.
