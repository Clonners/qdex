# Contracts

MVP contract set for a non-custodial orderbook DEX.

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
```

Events:

```solidity
event Deposit(address indexed user, address indexed token, uint256 amount);
event Withdraw(address indexed user, address indexed token, uint256 amount);
event BalanceLocked(address indexed user, address indexed token, uint256 amount);
event BalanceUnlocked(address indexed user, address indexed token, uint256 amount);
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
- fee cap

## NonceManager

Replay protection and cancellation.

```solidity
cancelNonce(uint256 nonce)
cancelNonceRange(uint256 from, uint256 to)
isNonceUsed(address user, uint256 nonce)
```

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
- hard max fee cap
- no instant arbitrary admin fee increase
- timelock before production

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

Delegate fields:

```text
delegate address
expiresAt
allowedMarkets
maxNotional
permissions
revoked
```
