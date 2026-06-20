# @qdex/approval-batcher

Batch ERC-20 approvals for QDEX — **1 click, N approvals**.

## Problem

Without batching, a user needs to click "Approve" 3 separate times for WQUAI, WQI, and USDT before they can deposit and trade:

```
❌ User flow without batching:
1. Click "Approve WQUAI" → Confirm → Wait
2. Click "Approve WQI"   → Confirm → Wait
3. Click "Approve USDT"  → Confirm → Wait
4. Click "Deposit WQUAI" → Confirm → Trade
```

## Solution

With batching, the user clicks **once** and the wallet executes all approvals in a single confirmation:

```
✅ User flow with batching:
1. Click "Approve All Tokens" → Confirm (1 time) → All approved
2. Click "Deposit WQUAI" → Trade
```

## How it works

1. **Check allowances**: Frontend checks `allowance(user, vault)` for each token
2. **Filter**: Only tokens with `allowance === 0` need approval
3. **Build transactions**: Creates N `approve()` transactions
4. **Send batch**: Wallet executes all N transactions in 1 confirmation
5. **Fallback**: If wallet doesn't support batching, falls back to sequential approvals

## Installation

```bash
npm install @qdex/approval-batcher
# or
pnpm add @qdex/approval-batcher
```

## Usage

### Basic usage

```typescript
import { approveAll, getTokenAddresses } from '@qdex/approval-batcher';

// Get Orchard token addresses
const tokens = getTokenAddresses('orchard'); // [WQUAI, WQI]

// Execute batch approval
const result = await approveAll(
  wallet,           // WalletProvider
  userAddress,      // User's wallet address
  vaultAddress,     // TradingVault contract address
  tokens,           // [WQUAI, WQI, USDT]
  MAX_UINT256       // Infinite approval (optional, default: MAX)
);

console.log(result);
// {
//   success: true,
//   count: 2,
//   failed: [],
//   receipts: [
//     { hash: '0x...', token: 'WQUAI' },
//     { hash: '0x...', token: 'WQI' }
//   ]
// }
```

### React hook example

```tsx
import { useState } from 'react';
import { approveAll, getTokenAddresses } from '@qdex/approval-batcher';

function UseApprovalBatcher(wallet, vaultAddress) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApprovalResult | null>(null);

  const approveAllTokens = async () => {
    setLoading(true);
    try {
      const tokens = getTokenAddresses('orchard');
      const res = await approveAll(wallet, wallet.address, vaultAddress, tokens);
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  return { approveAllTokens, loading, result };
}

// Component
function ApproveAllButton() {
  const { approveAllTokens, loading, result } = useApprovalBatcher(wallet, VAULT_ADDR);

  return (
    <div>
      <button onClick={approveAllTokens} disabled={loading}>
        {loading ? 'Approving...' : 'Approve All Tokens'}
      </button>
      
      {result?.success && (
        <div className="success">
          ✅ {result.count} tokens approved!
        </div>
      )}
      
      {result?.failed?.length > 0 && (
        <div className="error">
          ❌ Failed to approve: {result.failed.join(', ')}
        </div>
      )}
    </div>
  );
}
```

### Progress UI

```tsx
function ApprovalProgress(tokens: string[], approved: Set<string>) {
  return (
    <div className="approval-progress">
      {tokens.map(token => (
        <div key={token} className={approved.has(token) ? 'approved' : 'pending'}>
          {approved.has(token) ? '✅' : '⏳'} {getTokenSymbol(token)}
        </div>
      ))}
    </div>
  );
}
```

## Supported wallets

| Wallet | Support | Notes |
|--------|---------|-------|
| **MetaMask** | ✅ | Uses `eth_sendTransactionBatch` |
| **Rainbow** | ✅ | Native batch support |
| **WalletConnect** | ✅ | Uses `wc_sendTransactionBatch` |
| **Coinbase Wallet** | ✅ | Batch transactions |
| **Phantom** | ⚠️ | May need fallback |
| **Trust Wallet** | ⚠️ | May need fallback |

## API

### `approveAll(provider, userAddress, vaultAddress, tokens, amount)`

Execute batch approvals.

**Params:**
- `provider` - WalletProvider (MetaMask, Rainbow, etc.)
- `userAddress` - User's wallet address
- `vaultAddress` - TradingVault contract address
- `tokens` - Array of token addresses to approve
- `amount` - Approval amount (default: MaxUint256)

**Returns:** `ApprovalResult`

```typescript
interface ApprovalResult {
  success: boolean;      // All approvals succeeded
  count: number;         // Total tokens approved
  failed: string[];      // Tokens that failed approval
  receipts?: Array<{     // Transaction receipts
    hash: string;
    token: string;
  }>;
  fallback?: boolean;    // True if fallback was used
}
```

### `getTokensNeedingApproval(provider, userAddress, vaultAddress, tokens)`

Check which tokens need approval.

**Returns:** `string[]` - Array of tokens that need approval

### `buildApprovalTransactions(tokens, vaultAddress, amount)`

Build approval transactions for batch sending.

**Returns:** `Array<{ to: string; data: string }>`

### `encodeApprove(spender, amount)`

Encode ERC-20 approve() calldata.

**Returns:** `string` - Hex-encoded calldata

### `encodeAllowance(owner, spender)`

Encode ERC-20 allowance() view calldata.

**Returns:** `string` - Hex-encoded calldata

### `getTokenAddresses(network)`

Get token addresses for a network.

**Returns:** `string[]` - Array of token addresses

**Networks:**
- `'orchard'` - Quai Orchard testnet

## Configuration

Update `QDEX_TOKENS` in `src/index.ts` when deploying to new networks:

```typescript
export const QDEX_TOKENS = {
  orchard: {
    WQUAI: '0x...',
    WQI: '0x...',
    USDT: '0x...',
  },
  mainnet: {
    // TBD
  },
} as const;
```

## Testing

```bash
npm test
# or
pnpm test
```

## License

MIT
