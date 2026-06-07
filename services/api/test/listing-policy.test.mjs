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

    assert.deepEqual(response.body.listingAuthority, {
      currentPhase: 'clonners-operator-managed',
      initialAuthority: 'Clonners-controlled MarketRegistry authority',
      futureAuthority: 'dao-governance',
      handoffPattern: 'MarketRegistry.proposeMarketAuthority -> MarketRegistry.acceptMarketAuthority',
      authorityCan: ['addMarket', 'disableMarket', 'proposeMarketAuthority'],
      authorityCannot: ['moveTradingVaultBalances', 'withdrawUserFunds', 'grantDelegateAdmin', 'loadWallets', 'broadcastTransactions'],
      daoMigration: {
        status: 'supported-by-two-step-handoff',
        acceptanceRequired: true,
        eventTruth: ['MarketAuthorityHandoffProposed', 'MarketAuthorityHandoffAccepted'],
      },
      safety: {
        custodyAuthority: false,
        balanceMovement: false,
        delegateWithdrawalAuthority: false,
        delegateAdminAuthority: false,
      },
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

test('GET /v1/listings/review-flow exposes local Clonners-managed review approval metadata without MarketRegistry mutation', async () => {
  await withServer(async (baseUrl) => {
    const response = await requestJson(baseUrl, '/v1/listings/review-flow');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      source: 'listed-asset-marketregistry-review-flow',
      status: 'design-only-local-metadata',
      phase: 'clonners-managed-local-review-before-dao',
      requestSurface: 'prepare-only POST /v1/listings/requests',
      reviewAuthority: {
        currentAuthority: 'Clonners-managed MarketRegistry authority',
        futureAuthority: 'dao-governance',
        handoffPattern: 'MarketRegistry.proposeMarketAuthority -> MarketRegistry.acceptMarketAuthority',
      },
      stages: [
        {
          id: 'metadata_intake',
          label: 'Metadata intake',
          requiredEvidence: ['baseSymbol', 'quoteSymbol', 'tokenModel', 'requestedMarketId', 'pricePrecision', 'amountPrecision', 'minAmount'],
          effect: 'local-review-record-only',
          marketRegistryMutation: false,
        },
        {
          id: 'token_safety_review',
          label: 'Token safety review',
          requiredEvidence: ['erc20-style-vault-token-behavior', 'no-native-qi-direct-settlement', 'no-custody-or-admin-withdrawal-path'],
          effect: 'local-review-record-only',
          marketRegistryMutation: false,
        },
        {
          id: 'market_parameter_review',
          label: 'Market parameter review',
          requiredEvidence: ['WQUAI-or-WQI-quote', 'pricePrecision', 'amountPrecision', 'minAmount'],
          effect: 'local-review-record-only',
          marketRegistryMutation: false,
        },
        {
          id: 'clonners_local_approval',
          label: 'Clonners local approval',
          requiredEvidence: ['operator-approval-note', 'NO_WITHDRAW', 'NO_ADMIN'],
          effect: 'approved-local-metadata-only',
          marketRegistryMutation: false,
        },
        {
          id: 'marketregistry_admin_gate',
          label: 'MarketRegistry admin gate',
          requiredEvidence: ['separate-explicit-approval-before-addMarket', 'local-contract-ratchets-green'],
          effect: 'future-approved-addMarket-only-after-separate-slice',
          marketRegistryMutation: false,
        },
      ],
      approvalOutcome: {
        approvedStatus: 'approved-local-metadata-only',
        rejectedStatus: 'rejected-local-metadata-only',
        nextMutationGate: 'explicit Clonners approval required before MarketRegistry.addMarket',
        marketRegistryMutation: false,
        realQuaiTransactions: false,
      },
      safety: {
        custody: 'non-custodial',
        permissions: ['NO_WITHDRAW', 'NO_ADMIN'],
        marketRegistryMutation: false,
        realQuaiTransactions: false,
        walletRequired: false,
        noWalletLoading: true,
        noRpcUrlAccess: true,
        noSigning: true,
        noBroadcast: true,
        noDeploys: true,
        noTransactionSubmission: true,
        noListingAdminKeys: true,
        noRealTokenAddresses: true,
        noFundsMovement: true,
        notice:
          'Local review/approval metadata only; it does not persist a runtime listing queue, mutate MarketRegistry, move TradingVault balances, or grant withdrawal/admin authority.',
      },
    });
  });
});

test('POST /v1/listings/requests returns prepare-only approval-gated placeholder without runtime listing behavior', async () => {
  await withServer(async (baseUrl) => {
    const response = await requestJson(baseUrl, '/v1/listings/requests', {
      method: 'POST',
      body: JSON.stringify({
        baseSymbol: 'COMMUNITY',
        quoteSymbol: 'WQUAI',
        tokenModel: 'erc20-style-vault-token',
        requestedMarketId: 'COMMUNITY-WQUAI',
        pricePrecision: 8,
        amountPrecision: 8,
        minAmount: '1',
        reviewNotes: 'metadata-only local request',
      }),
    });

    assert.equal(response.status, 501);
    assert.deepEqual(response.body, {
      error: 'listing_request_not_implemented',
      source: 'listed-asset-marketregistry-policy',
      status: 'design-only-local-metadata',
      requestStatus: 'not-implemented-approval-required',
      approvalGate: 'listing-submission-approval-gate',
      custody: 'non-custodial',
      assetModel: 'erc20-style-vault-token',
      primaryQuoteAssets: ['WQUAI', 'WQI'],
      supportedAsset: 'community-created-erc20-style-token',
      marketRegistry: {
        truthSource: 'MarketRegistry-enabled-pair-metadata',
        marketRegistryMutation: false,
        canMoveTradingVaultBalances: false,
        canGrantWithdrawalAuthority: false,
        canGrantAdminAuthority: false,
      },
      permissions: ['NO_WITHDRAW', 'NO_ADMIN'],
      realQuaiTransactions: false,
      walletRequired: false,
      safety: {
        noWalletLoading: true,
        noRpcUrlAccess: true,
        noSigning: true,
        noBroadcast: true,
        noDeploys: true,
        noTransactionSubmission: true,
        noRuntimeListingQueue: true,
        noListingAdminKeys: true,
        noRealTokenAddresses: true,
        noFundsMovement: true,
        notice:
          'Prepare-only listing request placeholder: no listing request was submitted, no MarketRegistry mutation occurred, and listing/admin metadata cannot move TradingVault balances or grant withdrawal/admin authority.',
      },
      message:
        'Listing requests are approval-gated and not implemented; this placeholder does not submit listings, mutate MarketRegistry, move TradingVault balances, or grant withdrawal/admin authority.',
    });
  });
});
