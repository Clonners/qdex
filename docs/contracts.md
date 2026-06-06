# Contracts

MVP contract set for a non-custodial orderbook DEX.

## Tooling baseline

Contract implementation should start from the single-zone Hardhat + Quais SDK decision in [`docs/quai-tooling.md`](./quai-tooling.md): Cyprus-1 first, Orchard testnet only for approved live testing, regular Solidity before SolidityX, and no autonomous cron deploys or transaction sends.

Important current risk: Quai docs/examples disagree on the exact maximum Solidity compiler (`0.8.19` reference page vs `0.8.20` deployment guide/example). The current local interface ratchet pins Solidity `0.8.20` as the Hardhat candidate from `docs/quai-tooling.md`; verify locally/testnet before value-bearing deployment.

Token assumption: native QUAI is account-model and contract-friendly; native Qi is UTXO-model and must not be treated as an ERC-20-style vault token until a wrapper/adapter/conversion primitive is confirmed.

Static ratchet: `tests/contract-interface-invariants.test.mjs` must stay green before adding implementation code. It guards compiler drift, no admin/operator withdrawal selectors, replay-domain fields, fee-cap fields, and `NO_WITHDRAW`/`NO_ADMIN` delegate semantics.

## TradingVault

Responsible for non-custodial user balances.

Required invariant:

```text
admin/operator cannot withdraw user funds
```

Suggested surface:

```solidity
deposit(address token, uint256 amount)
withdraw(address token, uint256 amount)
balanceOf(address user, address token)
availableBalanceOf(address user, address token)
lockedBalanceOf(address user, address token)
lockForSettlement(address user, address token, uint256 amount, bytes32 orderHash)
unlockFromSettlement(address user, address token, uint256 amount, bytes32 orderHash)
settleLockedBalance(address debitUser, address creditUser, address token, uint256 amount, bytes32 fillId)
```

The settlement hooks must be restricted in implementation to the authorized settlement/order manager. They are not operator withdrawal powers.

Events:

```solidity
event Deposit(address indexed user, address indexed token, uint256 amount);
event Withdraw(address indexed user, address indexed token, uint256 amount);
event BalanceLocked(address indexed user, address indexed token, uint256 amount);
event BalanceUnlocked(address indexed user, address indexed token, uint256 amount);
event SettlementBalanceMoved(address indexed debitUser, address indexed creditUser, address indexed token, uint256 amount, bytes32 fillId);
```

## Settlement

Executes matched trades.

Must verify:

- maker/taker or delegate signatures
- chain ID
- settlement contract address
- market enabled
- expiration
- nonce not used/cancelled
- price/amount constraints
- partial fill accounting
- available vault balances
- fee cap and fee recipient

The local `ISettlement.FillPacket` surface already carries `fillId`, order hashes, maker/taker, tokens, price, amounts, fees, maker/taker nonces, expiration, `chainId`, `settlementContract`, `feeRecipient`, `maxFeeBps`, and cumulative fill accounting fields. `TradeSettled` exposes `fillId`, `marketId`, price, amounts, fees and fee recipient so the indexer/proof service can project final event truth.

## NonceManager

Replay protection and cancellation.

```solidity
cancelNonce(uint256 nonce)
cancelNonceRange(uint256 from, uint256 to)
isNonceUsed(address user, uint256 nonce)
markNonceUsed(address user, uint256 nonce, bytes32 orderHash)
```

`markNonceUsed` is a settlement-only hook in implementation; users cancel, settlement consumes.

## MarketRegistry

On-chain market metadata.

```solidity
addMarket(base, quote, pricePrecision, amountPrecision, minAmount)
disableMarket(marketId)
marketInfo(marketId)
```

Admin functions should use timelock/multisig before production.

## FeeManager

Transparent maker/taker fees.

Rules:

- fees emit events on changes
- hard max fee cap exposed by `maxFeeBps()`
- no instant arbitrary admin fee increase
- timelock before production
- fee recipient is explicit in settlement events/proofs

## DelegateKeyRegistry

Safe API/bot access.

Permissions:

```text
READ_ONLY
PLACE_ORDER
CANCEL_ORDER
CANCEL_ALL
NO_WITHDRAW
NO_ADMIN
```

There is intentionally no positive `WITHDRAW` or `ADMIN` delegate permission in the MVP interface.

Delegate fields:

```text
delegate address
expiresAt
allowedMarkets
maxNotional
permissions
revoked
```
