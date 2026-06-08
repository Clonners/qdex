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
  source: 'delegatekeyregistry-event-projection',
  projectionType,
  eventName,
  custody: 'non-custodial-no-withdrawal-authority',
  permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
  settlementMode: 'mock',
  settlementTx: null,
  blockNumber: null,
  blockHash: null,
  eventIndex: null,
  explorerUrl: null,
  delegateCanWithdraw: false,
  delegateCanAdmin: false,
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  delegateKeyRegistryMutation: false,
  safetyNotice: `Read-only DelegateKeyRegistry ${eventName} history projection: mock rows have no real Quai transaction, no wallet loaded, no live DelegateKeyRegistry mutation, no funds moved, and no delegate withdrawal/admin authority.`,
});

test('delegate key registration and revocation history endpoints expose read-only event projection envelopes only', async () => {
  await withServer(async (baseUrl) => {
    const cases = [
      {
        path: '/v1/delegate-keys/registrations',
        collection: 'registrations',
        projectionType: 'DelegateKeyRegisteredProjection',
        eventName: 'DelegateKeyRegistered',
      },
      {
        path: '/v1/delegate-keys/revocations',
        collection: 'revocations',
        projectionType: 'DelegateKeyRevokedProjection',
        eventName: 'DelegateKeyRevoked',
      },
    ];

    for (const { path, collection, projectionType, eventName } of cases) {
      const response = await requestJson(baseUrl, path);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, expectedHistoryEnvelope({ collection, projectionType, eventName }));
    }
  });
});
