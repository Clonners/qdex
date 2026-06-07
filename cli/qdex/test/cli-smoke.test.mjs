import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { QDexClient, createMockSignedOrder } from '../../../sdk/typescript/src/client.js';
import { runQdexCli } from '../src/cli.js';

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

const runCliJson = async (argv) => {
  let output = '';
  const exitCode = await runQdexCli(argv, {
    stdout: {
      write(chunk) {
        output += chunk;
      },
    },
    stderr: {
      write(chunk) {
        throw new Error(`unexpected stderr: ${chunk}`);
      },
    },
  });

  assert.equal(exitCode, 0);
  return JSON.parse(output);
};

test('qdex smoke command drives current mock API flow and prints mock-proof safety', async () => {
  await withServer(async (baseUrl) => {
    const result = await runCliJson(['--base-url', baseUrl, 'smoke']);

    assert.equal(result.command, 'smoke');
    assert.equal(result.marketId, 'QI-QUAI');
    assert.equal(result.fill.fillId, 'fill-000001');
    assert.equal(result.fill.projectionType, 'IndexedFillProjection');
    assert.equal(result.fill.sourceEventId, 'event-000001');
    assert.equal(result.fill.settlementMode, 'mock');
    assert.equal(result.proof.source, 'proof-service-indexer-projection');
    assert.equal(result.proof.settlementMode, 'mock');
    assert.equal(result.proof.settlementTx, null);
    assert.equal(result.proof.explorerUrl, null);
    assert.match(result.proof.safetyNotice, /no real Quai transaction, no explorer URL, no funds moved/);
    assert.ok(result.delegateSafety.defaultPermissions.includes('NO_WITHDRAW'));
    assert.ok(result.delegateSafety.defaultPermissions.includes('NO_ADMIN'));
  });
});

test('qdex stream fills command consumes local WebSocket snapshots with read-only private permissions', async () => {
  await withServer(async (baseUrl) => {
    const result = await runCliJson(['--base-url', baseUrl, 'stream', 'fills', '--limit', '1']);

    assert.equal(result.command, 'stream fills');
    assert.equal(result.channel, 'fills');
    assert.equal(result.transport, 'websocket');
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].type, 'snapshot');
    assert.equal(result.messages[0].snapshot.channel, 'fills');
    assert.equal(result.messages[0].snapshot.visibility, 'private');
    assert.deepEqual(result.messages[0].snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(result.messages[0].snapshot.safetyNotice, 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');
  });
});

test('qdex stream orders command exposes bounded read-only order snapshots for cancellation monitors', async () => {
  await withServer(async (baseUrl) => {
    const result = await runCliJson(['--base-url', baseUrl, 'stream', 'orders', '--limit', '1']);

    assert.equal(result.command, 'stream orders');
    assert.equal(result.channel, 'orders');
    assert.equal(result.transport, 'websocket');
    assert.equal(result.limit, 1);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].type, 'snapshot');
    assert.equal(result.messages[0].snapshot.channel, 'orders');
    assert.equal(result.messages[0].snapshot.visibility, 'private');
    assert.deepEqual(result.messages[0].snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(result.messages[0].snapshot.safetyNotice, 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');
    assert.deepEqual(result.messages[0].snapshot.data.orders, []);
  });
});

test('qdex contracts command prints local-only registry metadata without wallet or tx claims', async () => {
  await withServer(async (baseUrl) => {
    const result = await runCliJson(['--base-url', baseUrl, 'contracts']);

    assert.equal(result.command, 'contracts');
    assert.equal(result.deploymentStatus, 'local-only-not-deployed');
    assert.equal(result.realQuaiTransactions, false);
    assert.equal(result.walletRequired, false);
    assert.match(result.assetListingCaveat, /WQUAI, WQI/);
    assert.equal(result.listedAssetStatus.status, 'wrapped-token-listing');
    assert.deepEqual(result.listedAssetStatus.primaryQuoteAssets, ['WQUAI', 'WQI']);
    assert.equal(result.listedAssetStatus.supportedAssetModel, 'erc20-style-vault-token');
    assert.equal(result.listedAssetStatus.userListedTokens, true);
    assert.equal(result.listedAssetStatus.listingFlowStatus, 'design-required');
    assert.equal(result.listedAssetStatus.nativeQiTreatment, 'out-of-scope-direct-settlement-use-WQI');
    assert.equal(result.listedAssetStatus.nativeQiDirectSettlement, false);
    assert.equal(result.listedAssetStatus.realQuaiTransactions, false);
    assert.equal(result.listedAssetStatus.walletRequired, false);
    assert.match(result.listedAssetStatus.safetyNotice, /WQUAI, WQI, and approved community tokens/i);
    assert.equal(result.contracts.tradingVault.address, null);
    assert.equal(result.contracts.tradingVault.operatorWithdrawalAuthority, false);
    assert.equal(result.contracts.settlement.proofTrigger, 'TradeSettled');
    assert.deepEqual(result.contracts.settlement.dependencies, [
      'TradingVault',
      'NonceManager',
      'MarketRegistry',
      'FeeManager',
      'DelegateKeyRegistry',
    ]);
    assert.deepEqual(result.contracts.delegateKeyRegistry.requiredPermissions, [
      'PLACE_ORDER',
      'NO_WITHDRAW',
      'NO_ADMIN',
    ]);
    assert.equal(result.safety.approvalGate, 'explicit-approval-required-before-deploy-or-transaction');
  });
});

test('qdex relayer gate command prints read-only settlement-mode approval gate metadata', async () => {
  await withServer(async (baseUrl) => {
    const result = await runCliJson(['--base-url', baseUrl, 'relayer', 'gate']);

    assert.equal(result.command, 'relayer gate');
    assert.equal(result.source, 'relayer-approval-gate');
    assert.equal(result.currentSettlementMode, 'mock');
    assert.equal(result.custody, 'non-custodial-relayer-gate');
    assert.equal(result.realQuaiTransactions, false);
    assert.equal(result.walletRequired, false);
    assert.deepEqual(result.requiredEventTruthFields, [
      'settlementTx',
      'blockNumber',
      'blockHash',
      'eventIndex',
      'explorerUrl',
    ]);
    assert.equal(result.modes.mock.allowed, true);
    assert.equal(result.modes.mock.reason, 'mock_mode_local_only');
    assert.equal(result.modes.quai_contract.allowed, false);
    assert.equal(result.modes.quai_contract.reason, 'real_quai_approval_gate_blocked');
    assert.ok(result.modes.quai_contract.missingFields.includes('approval.explicitApproval'));
    assert.ok(result.modes.quai_contract.missingFields.includes('eventTruth.requiredFields.settlementTx'));
    assert.equal(result.safety.noWalletLoading, true);
    assert.equal(result.safety.noSigning, true);
    assert.equal(result.safety.noBroadcast, true);
    assert.equal(result.safety.noRpcUrlAccess, true);
    assert.equal(result.safety.noTransactionSubmission, true);
    assert.equal(result.safety.proofTrigger, 'TradeSettled');
  });
});

test('qdex listings policy command prints read-only token listing and MarketRegistry metadata', async () => {
  await withServer(async (baseUrl) => {
    const result = await runCliJson(['--base-url', baseUrl, 'listings', 'policy']);

    assert.equal(result.command, 'listings policy');
    assert.equal(result.source, 'listed-asset-marketregistry-policy');
    assert.equal(result.status, 'design-only-local-metadata');
    assert.equal(result.assetModel, 'erc20-style-vault-token');
    assert.deepEqual(result.primaryQuoteAssets, ['WQUAI', 'WQI']);
    assert.deepEqual(result.supportedAssets.map((asset) => asset.symbol), [
      'WQUAI',
      'WQI',
      'community-created-erc20-style-token',
    ]);
    assert.equal(result.supportedAssets[0].address, null);
    assert.equal(result.supportedAssets[1].address, null);
    assert.equal(result.supportedAssets[2].listingStatus, 'listable-after-review');
    assert.equal(result.exampleMarkets[0].marketId, 'WQI-WQUAI');
    assert.equal(result.exampleMarkets[0].custodyAuthority, false);
    assert.equal(result.marketRegistry.truthSource, 'MarketRegistry-enabled-pair-metadata');
    assert.equal(result.marketRegistry.balanceMovement, false);
    assert.equal(result.marketRegistry.operatorWithdrawalAuthority, false);
    assert.deepEqual(result.safety.delegatePermissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(result.safety.realQuaiTransactions, false);
    assert.equal(result.safety.walletRequired, false);
    assert.equal(result.safety.noWalletLoading, true);
    assert.equal(result.safety.noSigning, true);
    assert.equal(result.safety.noBroadcast, true);
    assert.equal(result.safety.noRpcUrlAccess, true);
    assert.equal(result.safety.noTransactionSubmission, true);
    assert.match(result.safety.notice, /no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds/i);
    assert.match(result.marketRegistry.notes, /cannot move TradingVault balances or grant withdrawal\/admin power/i);
  });
});

test('qdex listings request --prepare prints prepare-only placeholder without treating 501 as submission success', async () => {
  await withServer(async (baseUrl) => {
    const result = await runCliJson([
      '--base-url',
      baseUrl,
      'listings',
      'request',
      '--prepare',
      '--base-symbol',
      'COMMUNITY',
      '--quote-symbol',
      'WQUAI',
      '--token-model',
      'erc20-style-vault-token',
      '--market-id',
      'COMMUNITY-WQUAI',
      '--price-precision',
      '8',
      '--amount-precision',
      '8',
      '--min-amount',
      '1',
      '--review-notes',
      'metadata-only local request',
    ]);

    assert.equal(result.command, 'listings request prepare');
    assert.equal(result.status, 501);
    assert.equal(result.error, 'listing_request_not_implemented');
    assert.equal(result.source, 'listed-asset-marketregistry-policy');
    assert.equal(result.requestStatus, 'not-implemented-approval-required');
    assert.equal(result.approvalGate, 'listing-submission-approval-gate');
    assert.deepEqual(result.primaryQuoteAssets, ['WQUAI', 'WQI']);
    assert.equal(result.supportedAsset, 'community-created-erc20-style-token');
    assert.deepEqual(result.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(result.realQuaiTransactions, false);
    assert.equal(result.walletRequired, false);
    assert.equal(result.marketRegistry.marketRegistryMutation, false);
    assert.equal(result.marketRegistry.canMoveTradingVaultBalances, false);
    assert.equal(result.safety.noRuntimeListingQueue, true);
    assert.equal(result.safety.noListingAdminKeys, true);
    assert.equal(result.safety.noRealTokenAddresses, true);
    assert.equal(result.safety.noFundsMovement, true);
    assert.match(result.safety.notice, /no listing request was submitted/i);
    assert.match(result.message, /does not submit listings, mutate MarketRegistry, move TradingVault balances, or grant withdrawal\/admin authority/i);
  });
});

test('qdex nonces cancel --prepare prints owner-signed placeholder without wallet or tx authority', async () => {
  await withServer(async (baseUrl) => {
    const result = await runCliJson([
      '--base-url',
      baseUrl,
      'nonces',
      'cancel',
      '--prepare',
      '--owner',
      '0x1111111111111111111111111111111111111111',
      '--nonce',
      '77',
      '--chain-id',
      '0',
      '--nonce-manager-contract',
      '0x0000000000000000000000000000000000000000',
      '--expires-at',
      '1780003600',
      '--signature',
      '0xowner-signed-placeholder',
    ]);

    assert.equal(result.command, 'nonces cancel prepare');
    assert.equal(result.status, 501);
    assert.equal(result.error, 'owner_signed_nonce_cancel_not_implemented');
    assert.equal(result.source, 'owner-signed-nonce-cancel-placeholder');
    assert.equal(result.custody, 'non-custodial');
    assert.equal(result.nonceManager, 'owner-signed-required');
    assert.deepEqual(result.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(result.permissions.includes('CANCEL_ORDER'), false);
    assert.match(result.message, /Matcher-local cancellation does not mutate on-chain NonceManager nonces/);
    assert.equal(result.realQuaiTransactions, false);
    assert.equal(result.walletRequired, false);
    assert.equal(result.approvalGate, 'explicit-approval-required-before-wallet-signing-or-quai-broadcast');
  });
});

test('qdex cancel --all removes mock resting orders without nonce or withdrawal authority', async () => {
  await withServer(async (baseUrl) => {
    const client = new QDexClient({ baseUrl });
    const acceptedOrder = await client.orders.submitSignedOrder(createMockSignedOrder({
      side: 'sell',
      amount: '100',
      price: '5',
      nonce: '1201',
      owner: '0x1111111111111111111111111111111111111111',
    }));
    assert.equal(acceptedOrder.status, 'open');

    const result = await runCliJson(['--base-url', baseUrl, 'cancel', '--all']);

    assert.equal(result.command, 'cancel all');
    assert.equal(result.cancelled, true);
    assert.equal(result.cancelledCount, 1);
    assert.equal(result.cancelledOrders[0].orderHash, acceptedOrder.orderHash);
    assert.equal(result.cancelledOrders[0].status, 'cancelled');
    assert.deepEqual(result.permissions, ['CANCEL_ALL', 'CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(result.nonceManager, 'matcher-local-cancel-only-on-chain-nonce-unchanged');
    assert.match(result.message, /does not cancel the on-chain nonce/i);

    const bookAfterCancel = await client.orderbook.get('QI-QUAI');
    assert.deepEqual(bookAfterCancel.asks, []);
  });
});

test('qdex read-only commands return market and book JSON from the API', async () => {
  await withServer(async (baseUrl) => {
    const markets = await runCliJson(['--base-url', baseUrl, 'markets']);
    assert.equal(markets.command, 'markets');
    assert.equal(markets.markets[0].id, 'QI-QUAI');

    const book = await runCliJson(['--base-url', baseUrl, 'book', 'QI-QUAI']);
    assert.equal(book.command, 'book');
    assert.equal(book.marketId, 'QI-QUAI');
    assert.equal(book.source, 'mock-orderbook');
  });
});
