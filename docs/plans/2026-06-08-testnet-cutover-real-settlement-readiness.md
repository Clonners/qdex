# Testnet Cutover and Real Settlement Readiness Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Move QDEX from the source-only/local MVP to an approval-gated Quai testnet MVP where settlement truth comes from real contract events instead of mock settlement.

**Architecture:** Freeze the local MVP as feature-complete, then build only readiness surfaces until Clonners explicitly approves real RPC, wallets, deploys, signing, broadcasts, test funds, or remote pushes. The cutover keeps clear planes: config/deploy manifests, contracts, relayer, event-truth indexer, owner-wallet flows, API/SDK/CLI/UI projections, and operations. No component may treat matcher-local `ORDER_MATCHED` or local API state as final settlement in real mode; `TradeSettled` and related contract events are the source of truth.

**Tech Stack:** Node `node:test` ratchets, pnpm workspace checks, Solidity `0.8.20` local Hardhat contracts, TypeScript API/SDK/CLI/UI, Python SDK, future Quais/Orchard testnet tooling only after explicit approval.

---

## Non-negotiable gates

Do **not** cross these gates autonomously:

- No real/testnet RPC use.
- No wallet import or wallet generation.
- No private keys, wallet recovery words, or signing material.
- No contract deploys.
- No transaction signing or broadcasts.
- No test funds movement.
- No public server exposure.
- No remote Git push.

Allowed before approval:

- Source-only docs, tests, schemas, dry-run manifests, and explicit placeholders.
- Local Hardhat tests.
- Prepare-only endpoint envelopes that return clear `not-implemented-approval-required` / `501` boundaries.
- Readiness checks that fail closed when required real-network inputs are absent.

## Current frozen local MVP boundary

The local MVP is feature-complete for demo/source purposes:

```text
API + matcher-local order flow + mock settlement/proofs + local contract harness + SDKs + CLI + terminal UI + WebSocket streams
```

It remains intentionally mock-backed:

- `settlementMode: mock`
- `realQuaiTransactions: false`
- `walletRequired: false`
- `fundsMoved: false`
- contract addresses are `null` / `local-only-not-deployed`
- proof tx/block/explorer fields are mock/null until real event evidence exists

## Cutover target

The first real testnet loop is:

```text
deploy contracts -> configure market WQI/WQUAI -> deposit test funds -> sign maker/taker orders -> matcher crosses -> relayer submits Settlement tx -> TradeSettled emitted -> indexer ingests event -> API/SDK/CLI/UI show proof -> owner withdraws test funds
```

This loop must remain impossible until Clonners approves the exact testnet inputs.

## Task 1: Freeze local MVP status and stop UI/local polish

**Objective:** Prevent the autonomous runner from continuing low-impact local feature polish.

**Files:**
- Modify: `CAMPAIGN_STATUS.md`
- Modify: cron prompt/job metadata if needed

**Steps:**
1. Mark local MVP as `feature-complete for source-only/demo`.
2. Keep the latest completed slice visible: `local API + terminal UI keyboard-shortcut help smoke`.
3. Set next work to this testnet cutover plan.
4. Keep historical status ratchet strings that older tests expect.
5. Verify with `pnpm check` and `git diff --check`.

**Acceptance:** The repo says the next autonomous work is testnet readiness, not another terminal UI panel.

## Task 2: Define real-network config schema without real values

**Objective:** Add a typed manifest shape for future testnet configuration while storing no live network values.

**Files:**
- Create: `docs/testnet-cutover.md`
- Create or modify: `services/api/src/real-network-config.*` if a source ratchet is needed
- Test: `tests/testnet-cutover-readiness-plan.test.mjs`

**Config fields, all placeholder-only before approval:**

```json
{
  "networkName": "approval-required",
  "zone": "approval-required",
  "chainId": null,
  "rpcUrl": null,
  "explorerBaseUrl": null,
  "deployer": null,
  "contracts": {
    "TradingVault": null,
    "Settlement": null,
    "NonceManager": null,
    "MarketRegistry": null,
    "FeeManager": null,
    "DelegateKeyRegistry": null
  },
  "tokens": {
    "WQUAI": null,
    "WQI": null
  },
  "mode": "prepare-only-approval-required"
}
```

**Acceptance:** Missing real values must keep the app in local/mock or prepare-only mode.

## Task 3: Prepare deploy manifest and dry-run checks

**Objective:** Define deployment order and validation without deploying.

**Deployment order:**
1. Mock/test ERC-20 tokens if needed for testnet assets.
2. `TradingVault`.
3. `NonceManager`.
4. `MarketRegistry`.
5. `FeeManager`.
6. `DelegateKeyRegistry`.
7. `Settlement` wired to vault/nonce/market/fee/delegate dependencies.
8. Vault settlement-authority wiring.
9. Initial market WQI/WQUAI enablement.
10. Fee policy initialization.

**Acceptance:** A dry-run can produce a manifest skeleton but cannot submit a transaction.

## Task 4: Relayer real-mode gate

**Objective:** Build a fail-closed path from `FillPacket` to future `Settlement` transaction submission.

**Required checks before any future submit:**
- Explicit `quai_contract` mode approval.
- Complete contract addresses.
- Complete chain ID and replay-domain match.
- Valid maker/taker signatures.
- Market enabled in `MarketRegistry`.
- Fee schedule within `FeeManager` caps.
- Nonces not used/cancelled in `NonceManager`.
- Delegate policies include `NO_WITHDRAW` and `NO_ADMIN`.
- Slippage/order amount constraints still valid.
- Receipt wait and failure classification.

**Acceptance:** Without approval, the relayer returns readiness metadata and never loads wallets or broadcasts.

## Task 5: Event-truth indexer

**Objective:** Replace mock proof truth with confirmed contract event truth in real mode.

**Events to index:**
- `TradeSettled`
- `Deposit`
- `Withdraw`
- `NonceUsed`
- `NonceCancelled`
- `NonceRangeCancelled`
- `MarketAdded`
- `MarketDisabled`
- `FeesUpdated`
- `DelegateKeyRegistered`
- `DelegateKeyRevoked`

**Rules:**
- `ORDER_MATCHED` is never final settlement.
- Real proof rows require tx hash, block number, block hash, event index, contract address, and finality status.
- Reorg handling must invalidate/replay projections.
- API/SDK/CLI/UI must name event evidence clearly.

## Task 6: Owner-wallet flows

**Objective:** Move owner-only operations from placeholder to approved prepare/execute boundaries.

**Flows:**
- Deposit to `TradingVault`.
- Withdraw from `TradingVault`.
- Register delegate/API key.
- Revoke delegate/API key.
- Cancel nonce / nonce range.
- Listing/admin market metadata, initially Clonners-managed and later DAO/multisig.

**Rules:**
- Delegate/API keys cannot withdraw.
- Delegate/API keys cannot admin markets/fees/listings.
- Owner-wallet operations may be prepare-only until approved.

## Task 7: Testnet end-to-end acceptance script

**Objective:** Create a single operator checklist for the first approved testnet loop.

**Checklist:**
1. Confirm network, zone, chain ID, RPC, explorer, and test token addresses.
2. Confirm test wallet funding and signing path.
3. Deploy contracts and record addresses.
4. Verify local contract invariants against deployed ABI/source.
5. Enable WQI/WQUAI market.
6. Deposit test WQI/WQUAI into `TradingVault`.
7. Sign maker and taker orders.
8. Let matcher cross.
9. Relayer submits one settlement transaction.
10. Wait for receipt/finality.
11. Index `TradeSettled`.
12. API/SDK/CLI/UI show proof with real tx/block/event evidence.
13. Owner withdraws test funds.
14. Archive manifest, logs, and verification output with secrets redacted.

## Task 8: Productization after first real loop

**Objective:** Only after real settlement works, harden production basics.

**Scope:**
- Persistent DB.
- Auth/session model.
- Rate limits.
- WebSocket auth boundaries.
- Health checks.
- Structured logs/metrics.
- Replay/reorg jobs.
- Backup/restore.
- Secret management.
- Public deployment plan.
- Security review.

## UI status

The terminal UI is complete enough for the local/source-only MVP. It shows markets, orderbook/depth/candles, trade/proof panels, balances, open orders, fills/history, vault/delegate/fee/listing surfaces, command palette, keyboard help, and live local WebSocket streams.

It is **not** final product UI yet because it still displays mock settlement and prepare-only owner-wallet boundaries. Product UI completion depends on real testnet contract addresses, event-truth proofs, owner-wallet connect/sign flows, persistent account state, and production deployment/auth decisions.

## Final acceptance criteria for “DEX complete”

QDEX is not complete merely because the local UI works. It is complete when:

- Contracts are deployed to the approved Quai testnet.
- Test funds can deposit and withdraw through `TradingVault`.
- A real maker/taker cross settles through `Settlement`.
- `TradeSettled` is indexed as event truth.
- API/SDK/CLI/UI show the same real proof evidence.
- Delegate/API keys remain unable to withdraw or admin.
- Owner-wallet/admin flows are explicit and approval-gated.
- Operations/security baseline is in place.

Until those are true, status is: **local MVP feature-complete; testnet real-settlement cutover pending approval and implementation.**
