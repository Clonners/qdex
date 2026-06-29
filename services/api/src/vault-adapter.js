import { ethers } from 'ethers';

const VAULT_ABI = [
  'function deposit(address token, uint256 amount)',
  'function withdraw(address token, uint256 amount, address to)',
  'function balanceOf(address owner, address token) view returns (uint256)',
  'function availableBalanceOf(address owner, address token) view returns (uint256)',
  'function lockedBalanceOf(address owner, address token) view returns (uint256)',
  'function lockForSettlement(address token, uint256 amount)',
  'function unlockFromSettlement(address token, uint256 amount)',
  'function settleLockedBalance(address token, uint256 amount)',
  'function settlementAuthority() view returns (address)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
];

async function rpcCall(rpcUrl, method, params = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: 1,
    }),
  });
  
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  return data.result;
}

async function callView(rpcUrl, contractAddress, selector, params = []) {
  const encoded = params.map(p => p.slice(2).padStart(64, '0')).join('');
  const result = await rpcCall(rpcUrl, 'eth_call', [{
    to: contractAddress,
    data: selector + encoded,
  }, 'latest']);
  
  if (!result || result === '0x' || result === '0x0') {
    return '0x' + '0'.repeat(64);
  }
  return result;
}

const VAULT_SELECTORS = {
  balanceOf: '0xf7888aec',
  availableBalanceOf: '0x2a7575ee',
  lockedBalanceOf: '0x1fad6d6e',
};

export const createVaultAdapter = ({
  rpcUrl,
  privateKey,
  vaultAddress,
  tokens = {},
}) => {
  if (!rpcUrl || !vaultAddress) {
    console.warn('[vault-adapter] Missing config - vault operations will be read-only');
    return createReadOnlyVaultAdapter();
  }

  const isReal = !!privateKey;
  let wallet = null;
  let provider = null;

  if (privateKey) {
    try {
      provider = new ethers.JsonRpcProvider(rpcUrl, { name: 'quai-orchard', chainId: 15000 });
      wallet = new ethers.Wallet(privateKey, provider);
    } catch (e) {
      console.warn('[vault-adapter] Failed to create wallet:', e.message);
    }
  }

  const callVault = async (selector, params = []) => {
    return callView(rpcUrl, vaultAddress, selector, params);
  };

  return {
    isReal,
    vaultAddress,
    tokens,
    rpcUrl,

    async getBalance(owner, tokenAddress) {
      try {
        const result = await callVault(VAULT_SELECTORS.balanceOf, [owner, tokenAddress]);
        return {
          balance: BigInt(result).toString(),
          token: tokenAddress,
          owner,
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] getBalance error:', error.message);
        throw error;
      }
    },

    async getAvailableBalance(owner, tokenAddress) {
      try {
        const result = await callVault(VAULT_SELECTORS.availableBalanceOf, [owner, tokenAddress]);
        return {
          available: BigInt(result).toString(),
          token: tokenAddress,
          owner,
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] getAvailableBalance error:', error.message);
        throw error;
      }
    },

    async getLockedBalance(owner, tokenAddress) {
      try {
        const result = await callVault(VAULT_SELECTORS.lockedBalanceOf, [owner, tokenAddress]);
        return {
          locked: BigInt(result).toString(),
          token: tokenAddress,
          owner,
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] getLockedBalance error:', error.message);
        throw error;
      }
    },

    async approveToken(owner, tokenAddress, amount) {
      if (!wallet) {
        throw new Error('Vault adapter not configured for signing');
      }
      try {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
        const tx = await contract.approve(vaultAddress, ethers.parseUnits(amount, 18));
        return {
          txHash: tx.hash,
          owner,
          token: tokenAddress,
          amount,
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] approveToken error:', error.message);
        throw error;
      }
    },

    async deposit(owner, tokenAddress, amount) {
      if (!wallet) {
        throw new Error('Vault adapter not configured for signing');
      }
      try {
        await this.approveToken(owner, tokenAddress, amount);
        const vaultContract = new ethers.Contract(vaultAddress, VAULT_ABI, wallet);
        const tx = await vaultContract.deposit(tokenAddress, ethers.parseUnits(amount, 18));
        return {
          txHash: tx.hash,
          owner,
          token: tokenAddress,
          amount,
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] deposit error:', error.message);
        throw error;
      }
    },

    async withdraw(owner, tokenAddress, amount, toAddress) {
      if (!wallet) {
        throw new Error('Vault adapter not configured for signing');
      }
      try {
        const vaultContract = new ethers.Contract(vaultAddress, VAULT_ABI, wallet);
        const tx = await vaultContract.withdraw(tokenAddress, ethers.parseUnits(amount, 18), toAddress);
        return {
          txHash: tx.hash,
          owner,
          token: tokenAddress,
          amount,
          to: toAddress,
          source: 'real-vault-adapter',
        };
      } catch (error) {
        console.error('[vault-adapter] withdraw error:', error.message);
        throw error;
      }
    },
  };
};

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
});
