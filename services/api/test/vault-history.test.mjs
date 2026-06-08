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

const expectedHistoryEnvelope = ({ collection, projectionType, eventName }) => ({
  [collection]: [],
  source: 'tradingvault-event-projection',
  projectionType,
  eventName,
  custody: 'non-custodial-contract-vault',
  permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
  settlementMode: 'mock',
  settlementTx: null,
  blockNumber: null,
  blockHash: null,
  eventIndex: null,
  explorerUrl: null,
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  safetyNotice: `Read-only TradingVault ${eventName} history projection: mock rows have no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.`,
});

test('vault deposit and withdrawal history endpoints expose read-only projection envelopes only', async () => {
  await withServer(async (baseUrl) => {
    const cases = [
      {
        path: '/v1/vault/deposits',
        collection: 'deposits',
        projectionType: 'TradingVaultDepositProjection',
        eventName: 'Deposit',
      },
      {
        path: '/v1/vault/withdrawals',
        collection: 'withdrawals',
        projectionType: 'TradingVaultWithdrawalProjection',
        eventName: 'Withdraw',
      },
    ];

    for (const { path, collection, projectionType, eventName } of cases) {
      const response = await requestJson(baseUrl, path);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, expectedHistoryEnvelope({ collection, projectionType, eventName }));
    }
  });
});
