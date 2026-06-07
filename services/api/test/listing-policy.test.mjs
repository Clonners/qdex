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

test('GET /v1/listings/policy returns read-only token listing and MarketRegistry metadata policy', async () => {
  await withServer(async (baseUrl) => {
    const response = await requestJson(baseUrl, '/v1/listings/policy');

    assert.equal(response.status, 200);
    assert.equal(response.body.source, 'listed-asset-marketregistry-policy');
    assert.equal(response.body.status, 'design-only-local-metadata');
    assert.equal(response.body.assetModel, 'erc20-style-vault-token');
    assert.deepEqual(response.body.primaryQuoteAssets, ['WQUAI', 'WQI']);

    assert.deepEqual(response.body.supportedAssets, [
      {
        symbol: 'WQUAI',
        role: 'quote-and-base-vault-token',
        assetModel: 'erc20-style-vault-token',
        address: null,
        listingStatus: 'listed',
        nativeQiDirectSettlement: false,
      },
      {
        symbol: 'WQI',
        role: 'qi-facing-vault-token',
        assetModel: 'erc20-style-vault-token',
        address: null,
        listingStatus: 'listed',
        nativeQiDirectSettlement: false,
      },
      {
        symbol: 'community-created-erc20-style-token',
        role: 'user-created-listable-asset',
        assetModel: 'erc20-style-vault-token',
        address: null,
        listingStatus: 'listable-after-review',
        nativeQiDirectSettlement: false,
      },
    ]);

    assert.deepEqual(response.body.exampleMarkets, [
      {
        marketId: 'WQI-WQUAI',
        baseAsset: 'WQI',
        quoteAsset: 'WQUAI',
        marketRegistryStatus: 'listable-after-review',
        custodyAuthority: false,
      },
    ]);

    assert.deepEqual(response.body.listingLifecycle, [
      'submit-token-metadata',
      'review-token-safety',
      'define-precision-and-minimums',
      'marketRegistry.addMarket-after-approval',
      'marketRegistry.disableMarket-if-needed',
    ]);

    assert.deepEqual(response.body.marketRegistry, {
      truthSource: 'MarketRegistry-enabled-pair-metadata',
      canEnableMarkets: true,
      canDisableMarkets: true,
      custodyAuthority: false,
      balanceMovement: false,
      operatorWithdrawalAuthority: false,
      notes: 'MarketRegistry listing metadata can enable or disable token pairs, but it cannot move TradingVault balances or grant withdrawal/admin power.',
    });

    assert.deepEqual(response.body.safety, {
      realQuaiTransactions: false,
      walletRequired: false,
      noWalletLoading: true,
      noSigning: true,
      noBroadcast: true,
      noRpcUrlAccess: true,
      noTransactionSubmission: true,
      delegatePermissions: ['NO_WITHDRAW', 'NO_ADMIN'],
      notice: 'Read-only listing metadata only; no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds.',
    });
  });
});
