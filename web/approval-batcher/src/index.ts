/**
 * @module @qdex/approval-batcher
 * @description Batch ERC-20 approvals for QDEX - 1 click, N approvals
 *
 * ## How it works
 *
 * 1. User clicks "Approve All Tokens"
 * 2. Frontend checks which tokens need approval (allowance === 0)
 * 3. Builds N approval transactions
 * 4. Sends batch to wallet (MetaMask, Rainbow, etc.)
 * 5. Wallet executes all approvals in 1 confirmation
 *
 * ## Supported wallets
 *
 * - MetaMask (eth_sendTransactionBatch)
 * - Rainbow (native batch support)
 * - WalletConnect (wc_sendTransactionBatch)
 * - Coinbase Wallet (batch transactions)
 *
 * ## Fallback
 *
 * If wallet doesn't support batching, falls back to sequential approvals
 * with a loading state that shows progress.
 */

import { BigNumberish, MaxUint256, ethers } from 'ethers';

// ─── Types ──────────────────────────────────────────────

export interface TokenApproval {
  tokenAddress: string;
  spenderAddress: string;
  amount?: BigNumberish;
}

export interface ApprovalResult {
  success: boolean;
  count: number;
  failed: string[];
  receipts?: Array<{ hash: string; token: string }>;
  fallback?: boolean;
}

export interface WalletProvider {
  request: (method: string, params: unknown[]) => Promise<unknown>;
  sendTransactionBatch?: (txs: Array<{ to: string; data: string }>) => Promise<string[]>;
}

// ─── ERC-20 ABI fragment ───────────────────────────────

const ERC20_APPROVE_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
];

// ─── Core approval batcher ──────────────────────────────

/**
 * Check which tokens need approval and execute batch approvals.
 *
 * @param provider - Ethers provider or wallet
 * @param userAddress - User's wallet address
 * @param vaultAddress - TradingVault contract address
 * @param tokens - Array of token addresses to approve
 * @param amount - Approval amount (default: MaxUint256)
 * @returns Result with success status and transaction receipts
 */
export async function approveAll(
  provider: WalletProvider,
  userAddress: string,
  vaultAddress: string,
  tokens: string[],
  amount: BigNumberish = MaxUint256
): Promise<ApprovalResult> {
  if (tokens.length === 0) {
    return { success: true, count: 0, failed: [] };
  }

  // Check which tokens actually need approval
  const needsApproval = await getTokensNeedingApproval(
    provider,
    userAddress,
    vaultAddress,
    tokens,
    amount
  );

  if (needsApproval.length === 0) {
    return { success: true, count: 0, failed: [] };
  }

  try {
    // Try batch first
    if (provider.sendTransactionBatch) {
      const txs = buildApprovalTransactions(needsApproval, vaultAddress, amount);
      const hashes = await provider.sendTransactionBatch(txs);
      
      return {
        success: true,
        count: needsApproval.length,
        failed: [],
        receipts: needsApproval.map((token, i) => ({
          hash: hashes[i],
          token,
        })),
      };
    }

    // Fallback: sequential approvals
    const receipts: Array<{ hash: string; token: string }> = [];
    const failed: string[] = [];

    for (const token of needsApproval) {
      try {
        const tx = await provider.request('eth_sendTransaction', [
          {
            from: userAddress,
            to: token,
            data: encodeApprove(vaultAddress, amount),
          },
        ]);
        
        receipts.push({
          hash: tx as string,
          token,
        });
      } catch (err) {
        failed.push(token);
      }
    }

    return {
      success: failed.length === 0,
      count: needsApproval.length,
      failed,
      receipts,
      fallback: true,
    };
  } catch (err) {
    return {
      success: false,
      count: needsApproval.length,
      failed: needsApproval,
    };
  }
}

/**
 * Get tokens that need approval (allowance === 0 or < amount).
 */
export async function getTokensNeedingApproval(
  provider: WalletProvider,
  userAddress: string,
  spenderAddress: string,
  tokens: string[],
  amount: BigNumberish = MaxUint256
): Promise<string[]> {
  const needsApproval: string[] = [];
  const amountBN = typeof amount === 'bigint' ? amount : BigInt(amount as string);

  for (const token of tokens) {
    try {
      const allowance = await provider.request('eth_call', [
        {
          to: token,
          data: encodeAllowance(userAddress, spenderAddress),
        },
        'latest',
      ]);

      const currentAllowance = BigInt(allowance as string);
      if (currentAllowance < amountBN) {
        needsApproval.push(token);
      }
    } catch {
      // If we can't check, assume it needs approval
      needsApproval.push(token);
    }
  }

  return needsApproval;
}

/**
 * Build approval transactions for batch sending.
 */
export function buildApprovalTransactions(
  tokens: string[],
  spenderAddress: string,
  amount: BigNumberish = MaxUint256
): Array<{ to: string; data: string }> {
  return tokens.map(token => ({
    to: token,
    data: encodeApprove(spenderAddress, amount),
  }));
}

// ─── Encoding helpers ───────────────────────────────────

/**
 * Encode ERC-20 approve() call.
 */
export function encodeApprove(spender: string, amount: BigNumberish): string {
  const iface = new ethers.Interface(ERC20_APPROVE_ABI);
  return iface.encodeFunctionData('approve', [spender, amount]);
}

/**
 * Encode ERC-20 allowance() view call.
 */
export function encodeAllowance(owner: string, spender: string): string {
  const iface = new ethers.Interface(ERC20_APPROVE_ABI);
  return iface.encodeFunctionData('allowance', [owner, spender]);
}

// ─── Token configs for QDEX ─────────────────────────────

/**
 * QDEX token addresses on Orchard testnet.
 * Update these when mainnet deploys.
 */
export const QDEX_TOKENS = {
  orchard: {
    WQUAI: '0x005c46f661Baef20671943f2b4c087Df3E7CEb13',
    WQI: '0x002b2596EcF05C93a31ff916E8b456DF6C77c750',
    USDT: '0x0000000000000000000000000000000000000000', // TBD
  },
} as const;

/**
 * Get token addresses for a network.
 */
export function getTokenAddresses(network: 'orchard'): string[] {
  const config = QDEX_TOKENS[network];
  // Filter out zero addresses (tokens not yet deployed)
  return Object.values(config).filter(addr => addr !== '0x0000000000000000000000000000000000000000');
}

export default {
  approveAll,
  getTokensNeedingApproval,
  buildApprovalTransactions,
  encodeApprove,
  encodeAllowance,
  getTokenAddresses,
  QDEX_TOKENS,
};
