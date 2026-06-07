# qdex CLI

Terminal client for humans, bots and ops.

Implemented smoke/read-only stubs:

```bash
qdex --base-url http://127.0.0.1:8787 markets
qdex --base-url http://127.0.0.1:8787 book QI-QUAI
qdex --base-url http://127.0.0.1:8787 contracts
qdex --base-url http://127.0.0.1:8787 relayer gate
qdex --base-url http://127.0.0.1:8787 nonces cancel --prepare --owner 0xowner --nonce 42 --chain-id 0 --nonce-manager-contract 0xnonce-manager --expires-at 1780003600 --signature 0xowner-signature
qdex --base-url http://127.0.0.1:8787 stream fills --limit 1
qdex --base-url http://127.0.0.1:8787 stream orders --limit 1
qdex --base-url http://127.0.0.1:8787 smoke
```

`qdex contracts` prints the `GET /v1/contracts` registry as local-only metadata: `local-only-not-deployed`, null addresses, no real Quai tx, no wallet required, and no deploy authority. It includes read-only `nativeQiStatus` metadata for `QI-QUAI`: `design-required`, `mock-only`, `UTXO-model`, accepted paths `wrapped_qi_receipt_token`, `contract_native_qi_adapter`, and `conversion_settlement_flow`, and the safety notice that there is no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real Qi settlement claim.

`qdex relayer gate` prints `GET /v1/relayer/settlement-mode-gate` read-only `relayer-approval-gate` metadata for `currentSettlementMode: mock` plus `real_quai_approval_gate_blocked` for `quai_contract`; it performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.

`qdex nonces cancel --prepare` calls `POST /v1/nonces/cancel` and prints the prepare-only 501 placeholder (`owner_signed_nonce_cancel_not_implemented`, `owner-signed-required`, `NO_WITHDRAW`, `NO_ADMIN`) with no wallet loading, signing, broadcast, or relayer submission.

`qdex stream fills` consumes `/v1/ws?channel=fills` and prints bounded WebSocket snapshot messages. Private stream output is read-only and preserves `READ_ONLY`, `NO_WITHDRAW`, and `NO_ADMIN` permission metadata.

`qdex stream orders` consumes `/v1/ws?channel=orders` for bounded order/cancel monitors. Matcher-local cancellation stream events keep `matcher-local-cancel-only-on-chain-nonce-unchanged` wording visible and never imply withdrawal/admin authority.

`qdex smoke` submits two deterministic mock signed orders, verifies the indexed fill/proof loop, and prints explicit public fill projection fields (`projectionType: IndexedFillProjection`, `sourceEventId`) plus mock-settlement safety fields (`settlementMode: mock`, `settlementTx: null`, `explorerUrl: null`, no real Quai tx/no funds moved). The fill rows are not matcher/relayer FillPacket handoffs. Delegate/API-key safety remains `NO_WITHDRAW`/`NO_ADMIN` by default.
