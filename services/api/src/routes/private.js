import {
  createDelegateKeyHistoryProjectionEnvelope,
  createDelegateKeyListResponse,
  createDelegateKeyPreparePlaceholder,
} from '../delegate-keys.js';
import { createMockAccountOverview, createMockOpenOrdersEnvelope, createMockVaultBalanceProjection } from '../mock-dex.js';
import {
  createVaultHistoryProjectionEnvelope,
  createVaultOperationPreparePlaceholder,
} from '../vault-operations.js';
import { createNonceCancellationHistoryProjectionEnvelope } from '../nonce-operations.js';
import { jsonResult, notImplemented } from '../http.js';

const pathValue = (pathname, prefix) => {
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const rawValue = pathname.slice(prefix.length);
  return rawValue.length > 0 ? decodeURIComponent(rawValue) : null;
};

const pathValueWithSuffix = (pathname, prefix, suffix) => {
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return null;
  }

  const rawValue = pathname.slice(prefix.length, pathname.length - suffix.length);
  return rawValue.length > 0 && !rawValue.includes('/') ? decodeURIComponent(rawValue) : null;
};

const VAULT_TOKEN_LIST = ['WQUAI', 'WQI', 'USDT'];

const ownerSignedNonceCancelPlaceholder = () => jsonResult(501, {
  error: 'owner_signed_nonce_cancel_not_implemented',
  source: 'owner-signed-nonce-cancel-placeholder',
  custody: 'non-custodial',
  nonceManager: 'owner-signed-required',
  permissions: ['NO_WITHDRAW', 'NO_ADMIN'],
  message: 'Matcher-local cancellation does not mutate on-chain NonceManager nonces.',
  realQuaiTransactions: false,
  walletRequired: false,
  approvalGate: 'explicit-approval-required-before-wallet-signing-or-quai-broadcast',
});

export const handlePrivateRoute = async (context) => {
  const { method, pathname } = context;

  if (method === 'POST' && pathname === '/v1/auth/challenge') {
    return jsonResult(200, {
      challengeId: 'mock-challenge-0001',
      message: 'Sign this mock challenge only in local/dev mode. Production must use wallet-domain auth.',
      expiresInSeconds: 300,
      mode: 'mock',
    });
  }

  if (method === 'POST' && pathname === '/v1/auth/session') {
    return notImplemented(context, 'wire_wallet_signature_verification');
  }

  if (method === 'GET' && pathname === '/v1/account') {
    const owner = context.searchParams.get('owner') ?? '0x1111111111111111111111111111111111111111';
    return jsonResult(200, createMockAccountOverview({
      orders: context.state.listOrders(),
      fills: context.state.listFills(),
      balances: context.state.listVaultBalances(owner),
      projectionSource: context.state.projectionSource ?? 'in-memory-indexer-projection',
    }));
  }

  if (method === 'GET' && pathname === '/v1/account/balances') {
    const owner = context.searchParams.get('owner') ?? '0x1111111111111111111111111111111111111111';
    return jsonResult(200, createMockVaultBalanceProjection(context.state.listVaultBalances(owner)));
  }

  // Real wallet balances from on-chain vault
  const walletAddress = pathValue(pathname, '/v1/wallet/');
  if (method === 'GET' && walletAddress !== null && pathname.endsWith('/balances')) {
    const address = walletAddress;

    // Try real vault adapter first if available
    if (context.state.vaultAdapter && context.state.vaultAdapter.isReal) {
      try {
        const tokenPromises = [];
        const tokenEntries = Object.entries(context.state.vaultAdapter.tokens ?? {});
        for (const [tokenSymbol, tokenAddress] of tokenEntries) {
          tokenPromises.push(
            Promise.all([
              context.state.vaultAdapter.getBalance(address, tokenAddress).then(r => r.balance ?? '0'),
              context.state.vaultAdapter.getAvailableBalance(address, tokenAddress).then(r => r.available ?? '0'),
              context.state.vaultAdapter.getLockedBalance(address, tokenAddress).then(r => r.locked ?? '0'),
            ]).then(([balance, available, locked]) => ({
              token: tokenSymbol,
              tokenAddress,
              balance,
              available,
              locked,
            }))
          );
        }
        const balances = await Promise.all(tokenPromises);
        return jsonResult(200, {
          address,
          balances,
          source: 'real-vault-adapter',
          realQuaiTransactions: true,
          custody: 'non-custodial-contract-vault',
          withdrawalAuthority: 'owner-wallet-only',
          permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
        });
      } catch (error) {
        return jsonResult(500, {
          error: 'vault_balance_failed',
          message: error.message,
          source: 'real-vault-adapter',
        });
      }
    }

    // Fallback to mock vault balances
    return jsonResult(200, {
      address,
      balances: context.state.listVaultBalances(address),
      source: 'mock-vault-projection',
      realQuaiTransactions: false,
      custody: 'non-custodial-contract-vault',
      withdrawalAuthority: 'owner-wallet-only',
      permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
      safetyNotice: 'Mock vault projection only: no real Quai transaction, no wallet loaded, no funds moved.',
    });
  }

  if (method === 'POST' && pathname === '/v1/deposits') {
    // If real vault adapter is available, use it for on-chain deposits
    if (context.state.vaultAdapter && context.state.vaultAdapter.isReal) {
      try {
        const { owner, token, amount } = context.body ?? {};
        const tokenAddress = context.state.vaultAdapter.tokens[token] || token;
        const result = await context.state.vaultAdapter.deposit(owner, tokenAddress, amount);
        return jsonResult(200, {
          ...result,
          owner,
          source: 'real-vault-adapter',
          realQuaiTransactions: true,
          custody: 'non-custodial-contract-vault',
        });
      } catch (error) {
        return jsonResult(500, {
          error: 'vault_deposit_failed',
          message: error.message,
          source: 'real-vault-adapter',
        });
      }
    }
    const { owner, token, amount } = context.body ?? {};
    const result = context.state.deposit({ owner, token, amount });
    return jsonResult(result.statusCode, result.body);
  }

  if (method === 'POST' && pathname === '/v1/withdrawals') {
    // If real vault adapter is available, use it for on-chain withdrawals
    if (context.state.vaultAdapter && context.state.vaultAdapter.isReal) {
      try {
        const { owner, token, amount } = context.body ?? {};
        const tokenAddress = context.state.vaultAdapter.tokens[token] || token;
        const result = await context.state.vaultAdapter.withdraw(owner, tokenAddress, amount, owner);
        return jsonResult(200, {
          ...result,
          source: 'real-vault-adapter',
          realQuaiTransactions: true,
          custody: 'non-custodial-contract-vault',
        });
      } catch (error) {
        return jsonResult(500, {
          error: 'vault_withdrawal_failed',
          message: error.message,
          source: 'real-vault-adapter',
        });
      }
    }
    const { owner, token, amount } = context.body ?? {};
    const result = context.state.withdraw({ owner, token, amount });
    return jsonResult(result.statusCode, result.body);
  }

  if (method === 'GET' && pathname === '/v1/account/orders') {
    return jsonResult(200, createMockOpenOrdersEnvelope(context.state.listOrders()));
  }

  if (method === 'GET' && pathname === '/v1/vault/deposits') {
    const owner = context.searchParams.get('owner') ?? null;
    return jsonResult(200, {
      deposits: context.state.listDeposits(owner),
      source: 'mock-vault-projection',
      custody: 'non-custodial-contract-vault',
      settlementMode: 'mock',
      realQuaiTransactions: false,
      walletRequired: false,
      fundsMoved: false,
      safetyNotice: 'Mock vault deposit history only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.',
    });
  }

  if (method === 'GET' && pathname === '/v1/vault/withdrawals') {
    const owner = context.searchParams.get('owner') ?? null;
    return jsonResult(200, {
      withdrawals: context.state.listWithdrawals(owner),
      source: 'mock-vault-projection',
      custody: 'non-custodial-contract-vault',
      settlementMode: 'mock',
      realQuaiTransactions: false,
      walletRequired: false,
      fundsMoved: false,
      safetyNotice: 'Mock vault withdrawal history only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.',
    });
  }

  if (method === 'POST' && pathname === '/v1/vault/deposits/prepare') {
    // Try real vault deposit if vault adapter is available
    if (context.state.vaultAdapter && context.state.vaultAdapter.isReal) {
      try {
        const { owner, token, amount } = context.body ?? {};
        const result = await context.state.vaultAdapter.deposit(token, amount);
        return jsonResult(200, {
          ...result,
          source: 'real-vault-adapter',
          realQuaiTransactions: true,
        });
      } catch (error) {
        return jsonResult(500, {
          error: 'vault_deposit_failed',
          message: error.message,
          source: 'real-vault-adapter',
        });
      }
    }
    return jsonResult(501, createVaultOperationPreparePlaceholder('deposit'));
  }

  if (method === 'POST' && pathname === '/v1/vault/withdrawals/prepare') {
    // Try real vault withdrawal if vault adapter is available
    if (context.state.vaultAdapter && context.state.vaultAdapter.isReal) {
      try {
        const { owner, token, amount } = context.body ?? {};
        const result = await context.state.vaultAdapter.withdraw(token, amount, owner);
        return jsonResult(200, {
          ...result,
          source: 'real-vault-adapter',
          realQuaiTransactions: true,
        });
      } catch (error) {
        return jsonResult(500, {
          error: 'vault_withdrawal_failed',
          message: error.message,
          source: 'real-vault-adapter',
        });
      }
    }
    return jsonResult(501, createVaultOperationPreparePlaceholder('withdrawal'));
  }

  // Real vault balance endpoint
  if (method === 'GET' && pathname === '/v1/vault/balances/real') {
    const owner = context.searchParams.get('owner');
    const token = context.searchParams.get('token');
    
    if (!context.state.vaultAdapter || !context.state.vaultAdapter.isReal) {
      return jsonResult(503, {
        error: 'vault_adapter_not_configured',
        source: 'vault-adapter',
        message: 'Real vault adapter not configured. Check RPC URL, private key, and vault address.',
      });
    }
    
    try {
      const [balance, available, locked] = await Promise.all([
        context.state.vaultAdapter.getBalance(owner, token),
        context.state.vaultAdapter.getAvailableBalance(owner, token),
        context.state.vaultAdapter.getLockedBalance(owner, token),
      ]);
      
      return jsonResult(200, {
        owner,
        token,
        ...balance,
        ...available,
        ...locked,
        source: 'real-vault-adapter',
        realQuaiTransactions: true,
      });
    } catch (error) {
      return jsonResult(500, {
        error: 'vault_balance_failed',
        message: error.message,
        source: 'real-vault-adapter',
      });
    }
  }

  // Token approval endpoint
  if (method === 'POST' && pathname === '/v1/vault/approve') {
    if (!context.state.vaultAdapter || !context.state.vaultAdapter.isReal) {
      return jsonResult(503, {
        error: 'vault_adapter_not_configured',
        source: 'vault-adapter',
      });
    }
    
    try {
      const { token, amount } = context.body ?? {};
      const result = await context.state.vaultAdapter.approveToken(token, amount);
      return jsonResult(200, {
        ...result,
        source: 'real-vault-adapter',
        realQuaiTransactions: true,
      });
    } catch (error) {
      return jsonResult(500, {
        error: 'vault_approval_failed',
        message: error.message,
        source: 'real-vault-adapter',
      });
    }
  }

  if (method === 'GET' && pathname === '/v1/orders') {
    return jsonResult(200, {
      orders: context.state.listOrders(),
      source: 'mock-order-projection',
    });
  }

  if (method === 'POST' && pathname === '/v1/orders') {
    const result = await context.state.submitOrder(context.body);
    return jsonResult(result.statusCode, result.body);
  }

  const orderCancelHash = pathValueWithSuffix(pathname, '/v1/orders/', '/cancel');
  if (method === 'POST' && orderCancelHash !== null) {
    const result = context.state.cancelOrder(orderCancelHash);
    return jsonResult(result.statusCode, result.body);
  }

  const orderHash = pathValue(pathname, '/v1/orders/');
  if (method === 'DELETE' && orderHash !== null) {
    const result = context.state.cancelOrder(orderHash);
    return jsonResult(result.statusCode, result.body);
  }

  if (method === 'POST' && pathname === '/v1/orders/cancel-all') {
    const result = context.state.cancelAll(context.body ?? {});
    return jsonResult(result.statusCode, result.body);
  }

  if (method === 'POST' && pathname === '/v1/nonces/cancel') {
    return ownerSignedNonceCancelPlaceholder();
  }

  if (method === 'GET' && pathname === '/v1/nonces/cancellations') {
    return jsonResult(200, createNonceCancellationHistoryProjectionEnvelope());
  }

  if (method === 'GET' && pathname === '/v1/fills') {
    return jsonResult(200, {
      fills: context.state.listFills(),
      source: context.state.projectionSource ?? 'in-memory-indexer-projection',
    });
  }

  if (method === 'GET' && pathname === '/v1/trades') {
    return jsonResult(200, {
      trades: [],
      source: 'mock-account-trade-projection',
    });
  }

  if (method === 'GET' && pathname === '/v1/delegate-keys/registrations') {
    return jsonResult(200, createDelegateKeyHistoryProjectionEnvelope('registration'));
  }

  if (method === 'GET' && pathname === '/v1/delegate-keys/revocations') {
    return jsonResult(200, createDelegateKeyHistoryProjectionEnvelope('revocation'));
  }

  if (method === 'GET' && pathname === '/v1/delegate-keys') {
    return jsonResult(200, createDelegateKeyListResponse());
  }

  if (method === 'POST' && pathname === '/v1/delegate-keys') {
    return jsonResult(501, createDelegateKeyPreparePlaceholder('register_delegate_key'));
  }

  const keyId = pathValue(pathname, '/v1/delegate-keys/');
  if (method === 'DELETE' && keyId !== null) {
    return jsonResult(501, createDelegateKeyPreparePlaceholder('revoke_delegate_key', keyId));
  }

  return null;
};
