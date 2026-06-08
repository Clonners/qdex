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

const requestJson = async (baseUrl, path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  return {
    status: response.status,
    body: await response.json(),
  };
};

const expectedPlaceholder = (operation) => ({
  error: `owner_wallet_vault_${operation}_not_implemented`,
  source: 'owner-wallet-vault-operation-placeholder',
  custody: 'non-custodial-contract-vault',
  vaultOperation: operation,
  operationStatus: 'prepare-only-not-implemented',
  ownerAuthorization: 'owner-wallet-required',
  permissions: ['NO_WITHDRAW', 'NO_ADMIN'],
  delegateAuthority: 'delegates-cannot-deposit-or-withdraw',
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  approvalGate: 'explicit-approval-required-before-wallet-signing-or-quai-broadcast',
  safety: {
    noWalletLoading: true,
    noRpcUrlAccess: true,
    noSigning: true,
    noBroadcast: true,
    noDeploys: true,
    noTransactionSubmission: true,
    noFundsMovement: true,
    noDelegateWithdrawalAuthority: true,
    noAdminWithdrawalAuthority: true,
    notice:
      'Prepare-only owner-wallet TradingVault boundary: no wallet is loaded, no signature is created, no RPC URL is read, no transaction is submitted, and no funds move.',
  },
  message:
    `TradingVault ${operation} is owner-wallet-only and not implemented in local mock mode; this prepare-only endpoint does not load wallets, sign, broadcast, submit transactions, mutate TradingVault, or move funds.`,
});

test('vault deposit and withdrawal prepare endpoints are owner-wallet-only placeholders without funds movement', async () => {
  await withServer(async (baseUrl) => {
    const cases = [
      {
        operation: 'deposit',
        path: '/v1/vault/deposits/prepare',
      },
      {
        operation: 'withdrawal',
        path: '/v1/vault/withdrawals/prepare',
      },
    ];

    for (const { operation, path } of cases) {
      const response = await requestJson(baseUrl, path, {
        method: 'POST',
        body: JSON.stringify({
          operation,
          owner: '0x1111111111111111111111111111111111111111',
          assetSymbol: operation === 'deposit' ? 'WQUAI' : 'WQI',
          amount: '10',
          chainId: 0,
          vaultContractRef: 'local-only-not-deployed',
        }),
      });

      assert.equal(response.status, 501);
      assert.deepEqual(response.body, expectedPlaceholder(operation));
    }
  });
});
