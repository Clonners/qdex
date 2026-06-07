# qdex CLI Bot Contract

`qdex` is the terminal-native control surface for humans, bots, and ops. It mirrors the SDK bot flow while making custody and mock-settlement boundaries visible in every command output.

## Core commands

```bash
qdex markets
qdex ticker QI-QUAI
qdex book QI-QUAI
qdex contracts
qdex relayer gate
qdex nonces cancel --prepare --owner 0xowner --nonce 42 --chain-id 0 --nonce-manager-contract 0xnonce-manager --expires-at 1780003600 --signature 0xowner-signature
qdex balance
qdex order buy QI-QUAI --amount 1000 --price 0.123
qdex order sell QI-QUAI --quote-amount 100 --market --slippage-bps 50
qdex cancel --all
qdex stream fills
qdex stream orders
qdex proof trade <trade-id>
qdex api create-key bot-mm-1 --scope trade --expires 7d
```

## Order semantics

- Limit commands create signed `SignedOrder` payloads and submit them to `POST /v1/orders`.
- CLI order responses contain order state plus IndexedFillProjection rows (`projectionType: IndexedFillProjection`), not matcher/relayer FillPacket handoffs.
- CLI market orders are market_ioc IOC limit orders with signed price/slippage bounds.
- `--slippage-bps` maps to signed slippage protection, not unlimited market execution.
- `stream fills --limit N` consumes local WebSocket snapshots from `/v1/ws?channel=fills` and keeps private stream permissions read-only: `READ_ONLY`, `NO_WITHDRAW`, `NO_ADMIN`.
- `stream orders --limit N` consumes local WebSocket snapshots from `/v1/ws?channel=orders` and surfaces live matcher-local order/cancel updates for bots without withdrawal/admin authority.
- Order cancellation stream events must preserve `matcher-local-cancel-only-on-chain-nonce-unchanged`, `CANCEL_ORDER`/`CANCEL_ALL`, `NO_WITHDRAW`, and `NO_ADMIN` wording so operators do not confuse off-chain removal with on-chain `NonceManager` mutation.
- Fills stream from confirmed/mock-confirmed projections; proofs use `GET /v1/proofs/trades/:tradeId`.
- `qdex cancel --all` calls `POST /v1/orders/cancel-all`; in local mock mode it cancels only matcher-open quantity, keeps `CANCEL_ALL`, `CANCEL_ORDER`, `NO_WITHDRAW`, and `NO_ADMIN` visible, and does not cancel on-chain NonceManager nonces without a separate owner-signed flow.
- `qdex nonces cancel --prepare` calls `POST /v1/nonces/cancel` and prints the prepare-only placeholder `owner_signed_nonce_cancel_not_implemented` with `owner-signed-required`, `NO_WITHDRAW`, and `NO_ADMIN`; it performs no wallet loading, signing, broadcast, or relayer submission and must not be confused with matcher-local order cancellation.
- `qdex contracts` calls `GET /v1/contracts` and prints `local-only-not-deployed` metadata with null addresses, `realQuaiTransactions: false`, `walletRequired: false`, and no wallet/deploy/transaction authority. It also prints `listedAssetStatus` with `status: wrapped-token-listing`, primary quote assets `WQUAI` and `WQI`, `supportedAssetModel: erc20-style-vault-token`, user-listed token support, plus `NO_WITHDRAW`/`NO_ADMIN` safety. The command output must not imply real native Qi direct settlement, wallet loading, RPC URL reads, signing, broadcast, transaction submission, deploy, or real contract addresses.
- `qdex relayer gate` calls `GET /v1/relayer/settlement-mode-gate` and prints read-only `relayer-approval-gate` metadata for `currentSettlementMode: mock` plus the blocked `quai_contract` reason `real_quai_approval_gate_blocked`; it performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.

## API/delegate key scopes

Supported bot-safe permissions:

```text
READ_ONLY
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
NO_WITHDRAW
NO_ADMIN
```

`qdex api create-key bot-mm-1 --scope trade --expires 7d` creates a trade-scoped delegate/API key. It can place and cancel orders within its configured market/notional/expiry policy, but no withdraw command is available for delegate/API keys.

Withdrawal remains a main-wallet action only. Future withdrawal support must be a separate explicit user-wallet flow and must never be silently granted to bot API keys.

## Proof and mock safety

`qdex proof trade <trade-id>` must show whether the proof is mock or real.

In local mock mode:

```text
settlementMode: mock
mockSettlementReference: <mock id>
settlementTx: null
explorerUrl: null
```

The CLI must say there is no real Quai transaction and no funds moved. Once real Quai settlement is enabled later, proof output must come from confirmed indexer/contract-event truth, not matcher memory.
