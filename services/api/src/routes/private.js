import {
  createDelegateKeyListResponse,
  createDelegateKeyPreparePlaceholder,
} from '../delegate-keys.js';
import { createMockVaultBalanceProjection } from '../mock-dex.js';
import {
  createVaultHistoryProjectionEnvelope,
  createVaultOperationPreparePlaceholder,
} from '../vault-operations.js';
import { jsonResult, notImplemented } from '../http.js';

const pathValue = (pathname, prefix) => {
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const rawValue = pathname.slice(prefix.length);
  return rawValue.length > 0 ? decodeURIComponent(rawValue) : null;
};

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

export const handlePrivateRoute = (context) => {
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
    return jsonResult(200, {
      account: null,
      source: 'mock-session',
      permissions: ['READ_ONLY'],
    });
  }

  if (method === 'GET' && pathname === '/v1/account/balances') {
    return jsonResult(200, createMockVaultBalanceProjection());
  }

  if (method === 'GET' && pathname === '/v1/vault/deposits') {
    return jsonResult(200, createVaultHistoryProjectionEnvelope('deposit'));
  }

  if (method === 'GET' && pathname === '/v1/vault/withdrawals') {
    return jsonResult(200, createVaultHistoryProjectionEnvelope('withdrawal'));
  }

  if (method === 'POST' && pathname === '/v1/vault/deposits/prepare') {
    return jsonResult(501, createVaultOperationPreparePlaceholder('deposit'));
  }

  if (method === 'POST' && pathname === '/v1/vault/withdrawals/prepare') {
    return jsonResult(501, createVaultOperationPreparePlaceholder('withdrawal'));
  }

  if (method === 'GET' && pathname === '/v1/orders') {
    return jsonResult(200, {
      orders: context.state.listOrders(),
      source: 'mock-order-projection',
    });
  }

  if (method === 'POST' && pathname === '/v1/orders') {
    const result = context.state.submitOrder(context.body?.order);
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
