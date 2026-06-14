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

const expectedFeeSchedule = Object.freeze({
  marketId: 'WQUAI-WQI',
  projectionType: 'FeeScheduleProjection',
  eventName: 'FeesUpdated',
  makerFeeBps: 0,
  takerFeeBps: 0,
  maxFeeBps: 1000,
  feeRecipient: null,
  settlementMode: 'mock',
  settlementTx: null,
  blockNumber: null,
  blockHash: null,
  eventIndex: null,
  explorerUrl: null,
});

test('fees endpoint exposes read-only FeeManager policy metadata only', async () => {
  await withServer(async (baseUrl) => {
    const response = await requestJson(baseUrl, '/v1/fees');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      feeSchedules: [expectedFeeSchedule],
      source: 'feemanager-policy-projection',
      status: 'local-only-not-deployed',
      custody: 'non-custodial-fee-policy',
      permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
      hardMaxFeeBps: 1000,
      feeRecipient: null,
      feeManagerMutation: false,
      realQuaiTransactions: false,
      walletRequired: false,
      fundsMoved: false,
      tradingVaultMutation: false,
      safety: {
        noWalletLoading: true,
        noRpcUrlAccess: true,
        noSigning: true,
        noBroadcast: true,
        noDeploys: true,
        noTransactionSubmission: true,
        noFundsMovement: true,
        noFeeAuthorityRuntimeKeys: true,
        notice:
          'Read-only FeeManager schedule metadata: local/mock rows have no real Quai transaction, no wallet loaded, no fee-authority key, no TradingVault mutation, and no funds moved.',
      },
    });
  });
});
