import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../src/server.js';

const withServer = async (callback) => {
  const server = createApiServer();

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const requestJson = async (baseUrl, path) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      'content-type': 'application/json',
    },
  });

  return {
    status: response.status,
    body: await response.json(),
  };
};

test('GET /v1/account exposes a read-only local account overview without wallet or custody authority', async () => {
  await withServer(async (baseUrl) => {
    const response = await requestJson(baseUrl, '/v1/account');

    assert.equal(response.status, 200);
    assert.equal(response.body.account, null);
    assert.equal(response.body.source, 'mock-account-overview');
    assert.equal(response.body.projectionType, 'LocalAccountOverviewProjection');
    assert.equal(response.body.custody, 'non-custodial-contract-vault');
    assert.deepEqual(response.body.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.deepEqual(response.body.session, {
      mode: 'mock-local-no-wallet-session',
      authenticated: false,
      walletRequired: false,
    });

    assert.equal(response.body.balances.source, 'mock-vault-projection');
    assert.deepEqual(response.body.balances.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(response.body.balances.withdrawalAuthority, 'owner-wallet-only');
    assert.equal(response.body.balances.realQuaiTransactions, false);
    assert.equal(response.body.balances.walletRequired, false);

    assert.deepEqual(response.body.orders, {
      open: [],
      source: 'mock-order-projection',
      matcherLocalOnly: true,
    });
    assert.deepEqual(response.body.fills, {
      items: [],
      source: 'in-memory-indexer-projection',
      projectionType: 'IndexedFillProjection',
      confirmedOnly: true,
    });

    assert.equal(response.body.settlementMode, 'mock');
    assert.equal(response.body.realQuaiTransactions, false);
    assert.equal(response.body.walletRequired, false);
    assert.equal(response.body.fundsMoved, false);
    assert.equal(response.body.tradingVaultMutation, false);
    assert.deepEqual(response.body.safety, {
      noWalletLoading: true,
      noRpcUrlAccess: true,
      noSigning: true,
      noBroadcast: true,
      noDeploys: true,
      noTransactionSubmission: true,
      noFundsMovement: true,
      delegateCanWithdraw: false,
      delegateCanAdmin: false,
      notice:
        'Mock account overview only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.',
    });
  });
});
