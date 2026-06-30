import { ethers } from 'ethers';

const VAULT_ABI = [
  'function deposit(address token, uint256 amount)',
  'function withdraw(address token, uint256 amount)',
  'function balanceOf(address user, address token) view returns (uint256)',
  'function availableBalanceOf(address user, address token) view returns (uint256)',
  'function lockedBalanceOf(address user, address token) view returns (uint256)',
  'function lockForSettlement(address user, address token, uint256 amount, bytes32 orderHash)',
  'function unlockFromSettlement(address user, address token, uint256 amount, bytes32 orderHash)',
  'function settleLockedBalance(address debitUser, address creditUser, address token, uint256 amount, bytes32 fillId)',
  'function settlementAuthority() view returns (address)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function rpcCall(rpcUrl, method, params = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
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

// For Quai RPC calls — addresses need 00 prefix (42-char format)
function encodeQuaiAddress(addr) {
  let a = addr.toLowerCase();
  if (a.startsWith('0x')) a = a.slice(2);
  if (a.length === 42 && a.startsWith('00')) {
    return '0x' + a;
  }
  if (a.length === 40) {
    return '0x00' + a;
  }
  a = a.padStart(40, '0');
  return '0x00' + a;
}

// For ethers.js Interface encoding — addresses need standard 40-char format
function toEthAddress(addr) {
  let a = addr.toLowerCase();
  if (a.startsWith('0x')) a = a.slice(2);
  // Strip Quai 00 prefix if present
  if (a.length === 42 && a.startsWith('00')) {
    a = a.slice(2);
  }
  if (a.length !== 40) {
    a = a.padStart(40, '0');
  }
  return '0x' + a;
}

const VAULT_SELECTORS = {
  balanceOf: '0xf7888aec',
  availableBalanceOf: '0x2a7575ee',
  lockedBalanceOf: '0x1fad6d6e',
};

function buildTxData(contractAddress, abi, functionName, params, overrides = {}) {
  const iface = new ethers.Interface(abi);
  const data = iface.encodeFunctionData(functionName, params);
  return {
    to: contractAddress,
    data,
    value: overrides.value || '0x0',
    gasLimit: overrides.gasLimit || '0x186a0',
  };
}

export const createVaultAdapter = ({ rpcUrl, privateKey, vaultAddress, tokens = {} }) => {
  if (!rpcUrl || !vaultAddress) {
    return createReadOnlyVaultAdapter();
  }

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
    try {
      return await callView(rpcUrl, vaultAddress, selector, params);
    } catch (error) {
      if (error.message.includes('execution reverted') || error.message.includes('reverted')) {
        return '0x' + '0'.repeat(64);
      }
      throw error;
    }
  };

  return {
    isReal: true,
    vaultAddress,
    tokens,
    rpcUrl,

    async getBalance(owner, tokenAddress) {
      try {
        const quaiOwner = encodeQuaiAddress(owner);
        const quaiToken = encodeQuaiAddress(tokenAddress);
        const result = await callVault(VAULT_SELECTORS.balanceOf, [quaiOwner, quaiToken]);
        return { balance: BigInt(result).toString(), token: tokenAddress, owner, source: 'real-vault-adapter' };
      } catch (error) {
        return { balance: '0', token: tokenAddress, owner, source: 'real-vault-adapter' };
      }
    },

    async getAvailableBalance(owner, tokenAddress) {
      try {
        const quaiOwner = encodeQuaiAddress(owner);
        const quaiToken = encodeQuaiAddress(tokenAddress);
        const result = await callVault(VAULT_SELECTORS.availableBalanceOf, [quaiOwner, quaiToken]);
        return { available: BigInt(result).toString(), token: tokenAddress, owner, source: 'real-vault-adapter' };
      } catch (error) {
        return { available: '0', token: tokenAddress, owner, source: 'real-vault-adapter' };
      }
    },

    async getLockedBalance(owner, tokenAddress) {
      try {
        const quaiOwner = encodeQuaiAddress(owner);
        const quaiToken = encodeQuaiAddress(tokenAddress);
        const result = await callVault(VAULT_SELECTORS.lockedBalanceOf, [quaiOwner, quaiToken]);
        return { locked: BigInt(result).toString(), token: tokenAddress, owner, source: 'real-vault-adapter' };
      } catch (error) {
        return { locked: '0', token: tokenAddress, owner, source: 'real-vault-adapter' };
      }
    },

    async getAllowance(owner, tokenAddress) {
      try {
        const ethOwner = toEthAddress(owner);
        const ethVault = toEthAddress(vaultAddress);
        const result = await callView(rpcUrl, tokenAddress, TOKEN_SELECTORS.allowance, [ethOwner, ethVault]);
        return { allowance: BigInt(result).toString(), token: tokenAddress, owner, spender: vaultAddress, source: 'vault-adapter' };
      } catch (error) {
        return { allowance: '0', token: tokenAddress, owner, source: 'vault-adapter' };
      }
    },

    async approveToken(tokenAddress, amount) {
      // Build approve tx data (non-custodial - returns tx for user to sign)
      return this.buildApproveTx(tokenAddress, amount);
    },

    buildApproveTx(tokenAddress, amount) {
      const ethVault = toEthAddress(vaultAddress);
      const quaiVault = encodeQuaiAddress(vaultAddress);
      return {
        tx: buildTxData(tokenAddress, ERC20_ABI, 'approve', [ethVault, ethers.parseUnits(amount.toString(), 18).toString()], { gasLimit: '0xc350' }),
        token: tokenAddress, spender: vaultAddress,
        amount: ethers.parseUnits(amount.toString(), 18).toString(),
        source: 'vault-adapter',
      };
    },

    buildDepositTx(tokenAddress, amount) {
      const ethToken = toEthAddress(tokenAddress);
      return {
        tx: buildTxData(vaultAddress, VAULT_ABI, 'deposit', [ethToken, ethers.parseUnits(amount.toString(), 18).toString()], { gasLimit: '0x222e0' }),
        token: tokenAddress, amount: ethers.parseUnits(amount.toString(), 18).toString(),
        source: 'vault-adapter',
      };
    },

    buildWithdrawTx(tokenAddress, amount) {
      const ethToken = toEthAddress(tokenAddress);
      return {
        tx: buildTxData(vaultAddress, VAULT_ABI, 'withdraw', [ethToken, ethers.parseUnits(amount.toString(), 18).toString()], { gasLimit: '0x222e0' }),
        token: tokenAddress, amount: ethers.parseUnits(amount.toString(), 18).toString(),
        source: 'vault-adapter',
      };
    },

    async lockForSettlement(user, tokenAddress, amount, orderHash) {
      if (!wallet) throw new Error('Vault adapter not configured for signing');
      const vaultContract = new ethers.Contract(vaultAddress, VAULT_ABI, wallet);
      const tx = await vaultContract.lockForSettlement(
        encodeQuaiAddress(user), encodeQuaiAddress(tokenAddress),
        ethers.parseUnits(amount.toString(), 18), orderHash
      );
      return { txHash: tx.hash, source: 'vault-adapter' };
    },
  };
};

const createReadOnlyVaultAdapter = () => ({
  isReal: false,
  getBalance: async () => ({ error: 'read_only_mode', source: 'vault-adapter' }),
  getAvailableBalance: async () => ({ error: 'read_only_mode', source: 'vault-adapter' }),
  getLockedBalance: async () => ({ error: 'read_only_mode', source: 'vault-adapter' }),
  buildApproveTx: () => ({ error: 'read_only_mode', source: 'vault-adapter' }),
  buildDepositTx: () => ({ error: 'read_only_mode', source: 'vault-adapter' }),
  buildWithdrawTx: () => ({ error: 'read_only_mode', source: 'vault-adapter' }),
  getAllowance: async () => ({ error: 'read_only_mode', source: 'vault-adapter' }),
});
