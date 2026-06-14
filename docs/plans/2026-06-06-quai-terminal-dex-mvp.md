# Quai Terminal DEX MVP Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build the first working MVP loop for a terminal-native, API-first, non-custodial orderbook DEX on Quai.

**Architecture:** Start with a clean monorepo. Implement contracts, API, matching, relayer, indexer and proof service as separate planes. The matching engine may be powered by `exchange-core` or a compatible adapter, but final balance/fill truth must come from on-chain settlement events.

**Tech Stack:** TypeScript services, Solidity-compatible contracts for Quai/EVM, terminal-native web UI, TypeScript/Python SDKs, CLI. Exact Quai contract toolchain must be confirmed before production contract implementation.

---

## Phase 0: Ground rules

Non-negotiable invariants:

1. No operator withdrawal path for user funds.
2. API/delegate keys default to `NO_WITHDRAW`.
3. Market orders are IOC limit orders with slippage bounds.
4. Contract events are final truth for balances/fills.
5. Every fill exposes proof data.
6. Single Quai zone/shard first.
7. Spot only. No leverage, perps, bridges or cross-zone settlement in MVP.
8. **ERC-20 only — no native QUAI/QI handling.** All listed assets are ERC-20 tokens. Quote assets: `USDT` and `WQI` (wrapped QI). Native QUAI/QI is never transferred, locked, or settled by DEX contracts — denomination only. Pairs: `<token>/USDT`, `<token>/WQI`.

---

### Task 1: Confirm Quai contract toolchain

**Objective:** Decide the exact deploy/test stack for Quai contracts before writing production Solidity.

**Files:**
- Modify: `docs/contracts.md`
- Create: `docs/quai-tooling.md`

**Step 1: Research/verify**

Check Quai docs for:

```text
RPC endpoints
testnet/mainnet chain IDs
Solidity compiler compatibility
Foundry/Hardhat support
explorer verification flow
token standards
native QUAI/QI handling from contracts
single-zone deployment details
```

**Step 2: Record decisions**

Create `docs/quai-tooling.md` with:

```text
Toolchain:
RPC:
Chain IDs:
Explorer:
Contract verification:
Token assumptions:
Open risks:
```

**Step 3: Verification**

Expected result: production contract tasks are not blocked by unknown Quai/EVM assumptions.

---

### Task 2: Define signed order schema

**Objective:** Create the canonical order payload used by API, matching engine and settlement.

**Files:**
- Create: `docs/order-schema.md`
- Modify: `docs/api-openapi.yaml`

**Schema fields:**

```json
{
  "marketId": "QI-QUAI",
  "side": "buy",
  "type": "limit",
  "baseToken": "0x...",
  "quoteToken": "0x...",
  "amount": "1000000000000000000",
  "price": "123000000000000000",
  "timeInForce": "GTC",
  "maxSlippageBps": 0,
  "owner": "0x...",
  "delegate": "0x0000000000000000000000000000000000000000",
  "nonce": "1",
  "expiresAt": 1780000000,
  "chainId": 0,
  "settlementContract": "0x..."
}
```

**Verification:**

- Limit order schema supports partial fills.
- IOC market order can be represented as limit with slippage bounds.
- Schema includes chain ID and settlement contract to prevent replay.

---

### Task 3: Implement contract interfaces and tests

**Objective:** Turn placeholder interfaces into tested contract specs.

**Files:**
- Modify: `contracts/src/ITradingVault.sol`
- Modify: `contracts/src/ISettlement.sol`
- Create: `contracts/src/INonceManager.sol`
- Create: `contracts/src/IMarketRegistry.sol`
- Create: `contracts/src/IFeeManager.sol`
- Create: `contracts/src/IDelegateKeyRegistry.sol`
- Create: contract tests once toolchain is confirmed

**Test cases:**

```text
user can deposit
user can withdraw available balance
admin cannot withdraw user funds
settlement can move balances only through valid fill
used nonce cannot be replayed
cancelled nonce cannot be filled
fee cap cannot be exceeded
expired order cannot be filled
delegate without withdraw permission cannot withdraw
```

**Verification:**

Run contract test command from `docs/quai-tooling.md` and require all tests passing.

---

### Task 4: Build API route skeleton with typed responses

**Objective:** Replace raw Node scaffold with a real API service structure.

**Files:**
- Modify: `services/api/package.json`
- Create: `services/api/src/routes/public.js`
- Create: `services/api/src/routes/private.js`
- Create: `services/api/src/routes/proofs.js`
- Modify: `services/api/src/server.js`

**Routes for MVP:**

```text
GET /v1/health
GET /v1/markets
GET /v1/tickers
GET /v1/orderbook/:market
GET /v1/trades/:market
GET /v1/contracts
POST /v1/auth/challenge
POST /v1/auth/session
GET /v1/account/balances
POST /v1/orders
DELETE /v1/orders/:orderHash
GET /v1/fills
GET /v1/proofs/trades/:tradeId
```

**Verification:**

```bash
pnpm --filter @qdex/api check
PORT=8787 pnpm --filter @qdex/api dev
curl -fsS http://127.0.0.1:8787/v1/health
```

Expected: JSON with `ok: true`.

---

### Task 5: Matching engine adapter contract

**Objective:** Define the boundary between API and matching engine before integrating `exchange-core`.

**Files:**
- Create: `services/matching-engine/spec.md`
- Create: `services/matching-engine/events.md`

**Commands:**

```text
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
SNAPSHOT
RESTORE
```

**Events:**

```text
ORDER_ACCEPTED
ORDER_REJECTED
ORDER_MATCHED
ORDER_CANCELLED
FILL_PENDING_SETTLEMENT
```

**Verification:**

Spec must show how a matched fill becomes a relayer `FillPacket` and later a proof-service trade proof.

---

### Task 6: Relayer state machine

**Objective:** Specify and then implement relayer lifecycle.

**Files:**
- Create: `services/relayer/spec.md`

**States:**

```text
received
validated
submitted
confirmed
failed_retryable
failed_terminal
```

**Verification:**

Every relayer result must be visible to private WebSocket/API as settlement status.

---

### Task 7: Indexer projection model

**Objective:** Define how contract events become API balances, fills and proofs.

**Files:**
- Create: `services/indexer/schema.md`

**Tables/projections:**

```text
blocks
events
deposits
withdrawals
vault_balances
orders
fills
settlements
proofs
```

**Verification:**

Document reorg behavior and replay-from-block behavior.

---

### Task 8: Proof endpoint shape

**Objective:** Make every final trade externally inspectable.

**Files:**
- Modify: `docs/api-openapi.yaml`
- Create: `services/proof-service/spec.md`

**Trade proof fields:**

```text
tradeId
orderHashes
settlementTx
blockNumber
eventIndex
maker/taker or anonymized addresses
market
price
amount
fees
explorerUrl
rawEvent
```

**Verification:**

A human should be able to open a trade row, click proof, and verify it on the Quai explorer.

---

### Task 9: Terminal UI static prototype

**Objective:** Create a first visual prototype before connecting live data.

**Files:**
- Create: `web/terminal-ui/index.html`
- Create: `web/terminal-ui/styles.css`

**Screens:**

```text
market header
orderbook
chart placeholder
trade form
open orders
log/proof panel
```

**Verification:**

Open the file locally and visually confirm black/green/red terminal aesthetic.

---

### Task 10: SDK and CLI API contract

**Objective:** Ensure bots/agents are first-class.

**Files:**
- Create: `sdk/typescript/spec.md`
- Create: `sdk/python/spec.md`
- Create: `cli/qdex/spec.md`

**Minimum bot flow:**

```text
list markets
get book
create signed limit order
submit order
stream fills
get trade proof
cancel all
```

**Verification:**

Specs must make clear that delegate keys cannot withdraw by default.

---

## First vertical slice target

The first actual working loop should be:

```text
mock market
-> submit signed/mock order
-> match against another order
-> generate FillPacket
-> mock relayer marks settlement confirmed
-> indexer creates fill/proof projection
-> API returns order/fill/proof
-> UI shows the trade and proof link
```

Then replace mock settlement with real Quai testnet contracts.

## Commit strategy

Commit after each task:

```bash
git add <files>
git commit -m "docs: add qdex architecture scaffold"
git commit -m "feat: add api route skeleton"
git commit -m "docs: define signed order schema"
```
