/**
 * Real vault adapter for TradingVault contract on Quai Network
 * 
 * Handles real approve/transfer operations for vault deposits and withdrawals
 * Uses quais SDK for signing and broadcasting transactions
 */

import { ethers } from 'ethers';

const VAULT_ABI = [
  // Deposit functions
  'function deposit(address token, uint256 amount)',
  'function withdraw(address token, uint256 amount, address to)',
  
  // Balance queries
  'function balanceOf(address owner, address token) view returns (uint256)',
  'function availableBalanceOf(address owner, address token) view returns (uint256)',
  'function lockedBalanceOf(address owner, address token) view returns (uint256)',
  
  // Settlement
  'function lockForSettlement(address token, uint256 amount)',
  'function unlockFromSettlement(address token, uint256 amount)',
  'function settleLockedBalance(address token, uint256 amount)',
  'function settlementAuthority() view returns (address)',
  
  // Events
  'event Deposit(address indexed owner, address indexed token, uint256 amount)',
  'event Withdraw(address indexed owner, address indexed token, uint256 amount, address indexed to)',
  'event LockForSettlement(address indexed owner, address indexed token, uint256 amount)',
  'event UnlockFromSettlement(address indexed owner, address indexed token, uint256 amount)',
  'event Settlement(address indexed owner, address indexed token, uint256 amount, bytes32 indexed tradeId)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
];

/**
 * Create a vault adapter that interacts with the real TradingVault contract
 */
export const createVaultAdapter = ({
  rpcUrl,
  privateKey,
  vaultAddress,
  tokens = {}, // { WQUAI: '0x...', WQI: '0x...' }
}) => {
  if (!rpcUrl || !privateKey || !vaultAddress) {
    console.warn('[vault-adapter] Missing config - vault operations will be read-only');
    return createReadOnlyVaultAdapter();
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, wallet);

  return {
    // Check if adapter is initialized with real signing capability
    isReal: true,

    // Get vault balance for an owner
    async getBalance(owner, tokenAddress) {
      try {
        const balance = await vault.balanceOf(owner, tokenAddress);
        return {
          balance: balance.toString(),
          token: tokenAddress,
          owner,
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] getBalance error:', error.message);
        throw error;
      }
    },

    // Get available (unlocked) balance
    async getAvailableBalance(owner, tokenAddress) {
      try {
        const balance = await vault.availableBalanceOf(owner, tokenAddress);
        return {
          available: balance.toString(),
          token: tokenAddress,
          owner,
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] getAvailableBalance error:', error.message);
        throw error;
      }
    },

    // Get locked balance (reserved for settlement)
    async getLockedBalance(owner, tokenAddress) {
      try {
        const balance = await vault.lockedBalanceOf(owner, tokenAddress);
        return {
          locked: balance.toString(),
          token: tokenAddress,
          owner,
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] getLockedBalance error:', error.message);
        throw error;
      }
    },

    // Approve token for vault deposit
    async approveToken(tokenAddress, amount) {
      try {
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
        
        // Check current allowance
        const currentAllowance = await token.allowance(wallet.address, vaultAddress);
        
        if (currentAllowance >= BigInt(amount)) {
          return {
            approved: false,
            reason: 'already_approved',
            currentAllowance: currentAllowance.toString(),
            requestedAmount: amount.toString(),
            source: 'real-vault-adapter',
          };
        }

        // Approve the token
        const tx = await token.approve(vaultAddress, amount);
        console.log(`[vault-adapter] Approval tx sent: ${tx.hash}`);
        
        const receipt = await tx.wait();
        
        return {
          approved: true,
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          token: tokenAddress,
          amount: amount.toString(),
          spender: vaultAddress,
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] approveToken error:', error.message);
        throw error;
      }
    },

    // Deposit tokens to vault
    async deposit(tokenAddress, amount) {
      try {
        // Ensure approval first
        const approval = await this.approveToken(tokenAddress, amount);
        if (!approval.approved && approval.reason !== 'already_approved') {
          throw new Error(`Approval failed: ${approval.reason}`);
        }

        // Execute deposit
        const tx = await vault.deposit(tokenAddress, amount);
        console.log(`[vault-adapter] Deposit tx sent: ${tx.hash}`);
        
        const receipt = await tx.wait();
        
        return {
          deposited: true,
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          token: tokenAddress,
          amount: amount.toString(),
          owner: wallet.address,
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] deposit error:', error.message);
        throw error;
      }
    },

    // Withdraw tokens from vault
    async withdraw(tokenAddress, amount, to) {
      try {
        const tx = await vault.withdraw(tokenAddress, amount, to || wallet.address);
        console.log(`[vault-adapter] Withdraw tx sent: ${tx.hash}`);
        
        const receipt = await tx.wait();
        
        return {
          withdrawn: true,
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          token: tokenAddress,
          amount: amount.toString(),
          to: to || wallet.address,
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] withdraw error:', error.message);
        throw error;
      }
    },

    // Lock tokens for settlement (prepare for trade)
    async lockForSettlement(tokenAddress, amount) {
      try {
        const tx = await vault.lockForSettlement(tokenAddress, amount);
        console.log(`[vault-adapter] Lock tx sent: ${tx.hash}`);
        
        const receipt = await tx.wait();
        
        return {
          locked: true,
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          token: tokenAddress,
          amount: amount.toString(),
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] lockForSettlement error:', error.message);
        throw error;
      }
    },

    // Unlock tokens from settlement (cancel trade preparation)
    async unlockFromSettlement(tokenAddress, amount) {
      try {
        const tx = await vault.unlockFromSettlement(tokenAddress, amount);
        console.log(`[vault-adapter] Unlock tx sent: ${tx.hash}`);
        
        const receipt = await tx.wait();
        
        return {
          unlocked: true,
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          token: tokenAddress,
          amount: amount.toString(),
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] unlockFromSettlement error:', error.message);
        throw error;
      }
    },

    // Settle locked balance (execute trade)
    async settleLockedBalance(tokenAddress, amount) {
      try {
        const tx = await vault.settleLockedBalance(tokenAddress, amount);
        console.log(`[vault-adapter] Settlement tx sent: ${tx.hash}`);
        
        const receipt = await tx.wait();
        
        return {
          settled: true,
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          token: tokenAddress,
          amount: amount.toString(),
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] settleLockedBalance error:', error.message);
        throw error;
      }
    },

    // Get settlement authority address
    async getSettlementAuthority() {
      try {
        const authority = await vault.settlementAuthority();
        return {
          authority,
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] getSettlementAuthority error:', error.message);
        throw error;
      }
    },
  };
};

/**
 * Read-only vault adapter for when signing is not available
 */
const createReadOnlyVaultAdapter = () => ({
  isReal: false,
  
  getBalance: async () => ({
    error: 'read_only_mode',
    source: 'vault-adapter',
    message: 'Vault adapter is in read-only mode. Missing RPC URL, private key, or vault address.',
  }),
  
  getAvailableBalance: async () => ({
    error: 'read_only_mode',
    source: 'vault-adapter',
  }),
  
  getLockedBalance: async () => ({
    error: 'read_only_mode',
    source: 'vault-adapter',
  }),
  
  approveToken: async () => ({
    error: 'read_only_mode',
    source: 'vault-adapter',
  }),
  
  deposit: async () => ({
    error: 'read_only_mode',
    source: 'vault-adapter',
  }),
  
  withdraw: async () => ({
    error: 'read_only_mode',
    source: 'vault-adapter',
  }),
  
  lockForSettlement: async () => ({
    error: 'read_only_mode',
    source: 'vault-adapter',
  }),
  
  unlockFromSettlement: async () => ({
    error: 'read_only_mode',
    source: 'vault-adapter',
  }),
  
  settleLockedBalance: async () => ({
    error: 'read_only_mode',
    source: 'vault-adapter',
  }),
  
  getSettlementAuthority: async () => ({
    error: 'read_only_mode',
    source: 'vault-adapter',
  }),
});
