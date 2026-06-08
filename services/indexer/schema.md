# Indexer Projection Schema

The indexer turns settlement truth into API/UI projections. Its rule is:

```text
contract events are final truth; DB is cache/projection
```

The matching engine and relayer may emit useful local events, but public fills and proofs are settlement-derived. `ORDER_MATCHED is not final settlement`; it only proves that the off-chain matcher crossed two signed intents. `Public trade/proof projection waits for confirmed settlement`.

## Scope

MVP scope:

- single Quai execution context first
- mock settlement events for the local vertical slice
- later Quai contract events from TradingVault/Settlement/NonceManager/MarketRegistry/FeeManager
- projections for `GET /v1/fills`, `GET /v1/trades/:market`, and `GET /v1/proofs/trades/:tradeId`
- future owner-signed nonce-cancel proof rows from `NonceCancelled` / `NonceRangeCancelled` contract events
- private settlement visibility for pending/failed relayer states

Out of scope:

- holding custody or private keys
- withdrawals controlled by the indexer
- replacing contract balance truth with local accounting
- cross-zone replay logic before single-zone settlement is stable

The indexer does not hold custody, cannot withdraw user funds, and never grants API/delegate keys withdrawal authority. Delegate-derived rows must preserve `NO_WITHDRAW` in the indexed permission snapshot.

## Source event envelope

Every event ingested by the indexer is normalized before projection:

```json
{
  "eventId": "event-000001",
  "source": "mock-settlement",
  "chainId": 0,
  "zone": "cyprus-1-placeholder",
  "contractAddress": null,
  "eventType": "SETTLEMENT_CONFIRMED",
  "txHash": null,
  "blockNumber": null,
  "blockHash": null,
  "eventIndex": 0,
  "observedAt": 1780000001,
  "payload": {}
}
```

Identity rules:

- Real Quai events are deduplicated by `chainId + contractAddress + txHash + eventIndex` and also retain `blockHash` for reorg detection.
- Mock settlement events are deduplicated by `settlementMode: mock + mockSettlementReference + eventIndex`.
- Projection jobs are idempotent: replaying the same event does not duplicate balances, fills, trades, settlements, or proofs.
- Corrections are appended as new events; projection state may be rebuilt from the event log.

## Tables and projections

### blocks

Tracks chain progress and reorg safety.

Required fields:

```text
chainId
zone
blockNumber
blockHash
parentHash
timestamp
finalityDepth
status: observed | finalized | orphaned
```

Use `finalityDepth` to decide when real Quai events are reorg-safe enough for public proof display. Mock events use `blockNumber = null` and are always labeled mock-only.

### events

Append-only normalized event log.

Required fields:

```text
eventId
source
eventType
chainId
zone
contractAddress
txHash
eventIndex
blockNumber
blockHash
observedAt
payloadHash
payloadJson
projectionStatus: pending | projected | superseded | failed
```

The `events` table is the replay source for every downstream projection.

### deposits

Projection of vault deposit events.

Required fields:

```text
depositId
user
token
amount
txHash
eventIndex
blockNumber
blockHash
status
```

Deposits affect `vault_balances` only after the source event is accepted by the replay/finality policy.

### withdrawals

Projection of user-initiated withdrawal events.

Required fields:

```text
withdrawalId
user
token
amount
txHash
eventIndex
blockNumber
blockHash
status
```

Withdrawals must always be user-authorized contract events. No operator/admin or indexer path can create a withdrawal row without a source event.

### vault_balances

Query projection for balances shown by API/UI.

Required fields:

```text
user
token
available
locked
lastEventId
lastBlockNumber
lastBlockHash
source: contract_event | mock_event
```

`vault_balances` is not a custody ledger. It is a read model rebuilt from deposit, withdrawal, lock, unlock, and settlement events. If a reorg invalidates events, balances are rewound and replayed.

### TradingVault Deposit/Withdraw event projections

Purpose: define event-shaped rows for future read-only deposit/withdrawal history surfaces before any owner-wallet transaction behavior exists.

Projection types:

```text
TradingVaultDepositProjection
TradingVaultWithdrawalProjection
```

Shared required fields:

```text
projectionType: TradingVaultDepositProjection | TradingVaultWithdrawalProjection
sourceEventId
eventName: Deposit | Withdraw
owner
token
amount
settlementMode: mock | quai_contract
settlementTx
blockNumber
blockHash
eventIndex
explorerUrl
permissions: READ_ONLY | NO_WITHDRAW | NO_ADMIN
custody: non-custodial-contract-vault
realQuaiTransactions
walletRequired: false
fundsMovedByProjection: false
tradingVaultMutationByProjection: false
safetyNotice
```

Rules:

- `TradingVaultDepositProjection` rows are projected only from normalized `Deposit` source events.
- `TradingVaultWithdrawalProjection` rows are projected only from normalized `Withdraw` source events.
- mock rows keep settlementTx = null, blockNumber = null, blockHash = null, eventIndex = null, and explorerUrl = null; mock safety copy must say no real Quai transaction and no funds moved.
- real rows require settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl before any history/proof UI treats them as confirmed contract event truth.
- The projection is read-only event truth, not custody authority; it cannot create wallet requests, sign, submit, relay, mutate `TradingVault`, or move funds.
- Every row preserves `permissions: READ_ONLY | NO_WITHDRAW | NO_ADMIN`; delegate/API keys still have no withdrawal/admin authority.

### orders

Projection of order intent and lifecycle metadata.

Required fields:

```text
orderHash
marketId
owner
delegate
side
type
amount
price
timeInForce
maxSlippageBps
nonce
chainId
settlementContract
status: accepted | open | partially_filled | filled | cancelled | expired | rejected
filledAmount
remainingAmount
permissionsSnapshot
```

Rules:

- `market_ioc` orders remain IOC limit orders with signed price/slippage bounds.
- Delegate rows must include a permission snapshot with `NO_WITHDRAW`.
- Order projection can reflect matcher acceptance, but public trade/proof rows still wait for settlement confirmation.

### fills

Projection of confirmed fills.

Required fields:

```text
fillId
tradeId
marketId
makerOrderHash
takerOrderHash
maker
taker
price
amount
makerFee
takerFee
settlementStatus: confirmed
settlementMode
sourceEventId
```

Rules:

- Only `SETTLEMENT_CONFIRMED` creates public fill rows.
- `indexer.fill_projected` is emitted after the fill row is written.
- Failed or pending relayer states are private settlement rows, not public fills.

### settlements

Projection of relayer/settlement lifecycle.

Required fields:

```text
fillId
fillPacketHash
state: received | validated | submitted | confirmed | failed_retryable | failed_terminal
settlementMode: mock | quai
mockSettlementReference
settlementTx
blockNumber
eventIndex
explorerUrl
reason
lastEventId
```

Rules:

- Mock rows must include `settlementMode: mock` and `mockSettlementReference`.
- Mock rows use `settlementTx = null`, `blockNumber = null`, and `explorerUrl = null`.
- Real Quai rows must reference `settlementTx, blockNumber, eventIndex, and explorerUrl` before public proof projection.
- Private API/WebSocket may expose pending and failed states; public trade/proof projection waits for confirmed settlement.

### proofs

Projection consumed by the proof service.

Required fields:

```text
tradeId
fillId
orderHashes
settlementMode
mockSettlementReference
settlementTx
blockNumber
blockHash
eventIndex
maker
taker
market
price
amount
fees
explorerUrl
rawEvent
createdFromEventId
```

Rules:

- After a confirmed fill is projected, emit `proof.TradeProof.created`.
- `GET /v1/proofs/trades/:tradeId` reads from `proofs`.
- Mock proof rows must keep `explorerUrl = null` and explain no real Quai transaction or funds moved.
- Real proof rows must be traceable to verified contract source/event data.

### nonce_cancellation_proofs

Projection consumed by future owner-signed nonce-cancel proof UX. These rows are not trade proofs and do not create public fills, trades, settlements, or TradeProof rows.

A nonce-cancel projection does not create public fills, trades, settlements, or TradeProof rows.

Accepted source events:

```text
NonceCancelled -> NONCE_CANCEL_CONFIRMED
NonceRangeCancelled -> NONCE_RANGE_CANCEL_CONFIRMED
```

Required fields:

```text
proofType: NonceCancellationProof
proofId
owner
action: cancelNonce | cancelNonceRange
nonce
nonceRange
nonceManagerContract
nonceManager: contract-event-truth
custody: non-custodial-no-withdrawal-authority
permissions: NO_WITHDRAW | NO_ADMIN
txHash
blockNumber
blockHash
eventIndex
explorerUrl
sourceEventId
safetyNotice
```

Rules:

- Owner-signed NonceManager cancellation proof rows require real contract evidence: `txHash, blockNumber, blockHash, eventIndex, and explorerUrl`.
- `NonceCancelled` and `NonceRangeCancelled` are the only contract events that can project nonce-cancel proof rows.
- `matcher_local_order_cancelled` and `matcher_local_orders_cancelled` matcher-local cancellation events are suppressed; their nonce marker remains `matcher-local-cancel-only-on-chain-nonce-unchanged`.
- Matcher-local cancellation events are suppressed because they remove only matcher-open quantity and do not mutate on-chain `NonceManager` nonce truth.
- Rows preserve `NO_WITHDRAW` and `NO_ADMIN`; neither the indexer nor proof service gains wallet, withdrawal, signing, broadcast, relayer, admin, or custody authority.

## Projection flow

```text
FILL_PENDING_SETTLEMENT
  -> relayer.submitFillPacket(FillPacket)
  -> SETTLEMENT_CONFIRMED
  -> indexer.ingestEvent(...)
  -> indexer.fill_projected
  -> proof.TradeProof.created
  -> GET /v1/fills
  -> GET /v1/proofs/trades/:tradeId
```

For real Quai settlement, `SETTLEMENT_CONFIRMED` means the indexed contract event exists and is accepted by the finality/reorg policy. For mock settlement, it means the local mock event exists and remains visibly mock-only.

## Reorg behavior

The indexer must be reorg-safe.

Rules:

1. Keep `blockHash` and `parentHash` for every observed real Quai block.
2. If a later block disagrees with stored ancestry, mark affected `blocks` and `events` as `orphaned` or `superseded`.
3. Rewind projections to the last canonical block before the fork.
4. Re-run `replayFromBlock(startBlock)` from that canonical point.
5. Suppress public proof projection for real Quai events until their block satisfies `finalityDepth`.
6. Keep mock settlement rows explicit; mock rows are not Quai finality evidence.

A reorg can remove or replace a previously projected real fill/proof. The API should mark the old proof superseded instead of silently deleting historical evidence.

## Replay behavior

`replayFromBlock(startBlock)` rebuilds projections from normalized `events`.

Replay steps:

1. Select canonical events ordered by `(blockNumber, eventIndex)` for real Quai events and by deterministic observed sequence for mock events.
2. Clear projections at or after `startBlock` for the affected chain/zone.
3. Recompute `deposits`, `withdrawals`, `vault_balances`, `orders`, `fills`, `settlements`, and `proofs`.
4. Emit projection events only after idempotent writes complete.
5. Verify no fill exceeds signed order amount and no balance projection creates withdrawable funds without contract events.

Replay must be deterministic: the same event log produces the same query projections.

## Invariants

- `contract events are final truth; DB is cache/projection`.
- The indexer does not hold custody.
- The indexer cannot withdraw user funds.
- API/delegate rows preserve `NO_WITHDRAW`.
- `ORDER_MATCHED is not final settlement`.
- `Public trade/proof projection waits for confirmed settlement`.
- Public fills are only created from `SETTLEMENT_CONFIRMED`.
- Mock proof language always includes `settlementMode: mock` and `mockSettlementReference`.
- Real Quai proofs require `settlementTx, blockNumber, eventIndex, and explorerUrl`.
- Reorg recovery uses `blockHash`, `finalityDepth`, and `replayFromBlock(startBlock)`.
