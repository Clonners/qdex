import { jsonResult, notImplemented } from '../http.js';

const pathValue = (pathname, prefix) => {
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const rawValue = pathname.slice(prefix.length);
  return rawValue.length > 0 ? decodeURIComponent(rawValue) : null;
};

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
    return jsonResult(200, {
      balances: [],
      source: 'mock-vault-projection',
      custody: 'non-custodial-contract-vault',
      withdrawalAuthority: 'owner-wallet-only',
    });
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
    return notImplemented(context, 'wire_order_cancellation_to_nonce_manager_and_matching_engine');
  }

  if (method === 'POST' && pathname === '/v1/orders/cancel-all') {
    return notImplemented(context, 'wire_cancel_all_to_delegate_safe_nonce_flow');
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
    return jsonResult(200, {
      delegateKeys: [],
      defaultPermissions: ['READ_ONLY', 'PLACE_ORDER', 'CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN'],
      source: 'mock-delegate-key-registry',
    });
  }

  if (method === 'POST' && pathname === '/v1/delegate-keys') {
    return notImplemented(context, 'wire_delegate_key_registry_with_no_withdraw_default');
  }

  const keyId = pathValue(pathname, '/v1/delegate-keys/');
  if (method === 'DELETE' && keyId !== null) {
    return notImplemented(context, 'wire_delegate_key_revocation');
  }

  return null;
};
