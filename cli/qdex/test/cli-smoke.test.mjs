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

test('qdex stream deposits and withdrawals commands expose bounded read-only vault history snapshots', async () => {
  await withServer(async (baseUrl) => {
    const deposits = await runCliJson(['--base-url', baseUrl, 'stream', 'deposits', '--limit', '1']);

    assert.equal(deposits.command, 'stream deposits');
    assert.equal(deposits.channel, 'deposits');
    assert.equal(deposits.transport, 'websocket');
    assert.equal(deposits.limit, 1);
    assert.equal(deposits.messages.length, 1);
    assert.equal(deposits.messages[0].type, 'snapshot');
    assert.equal(deposits.messages[0].snapshot.channel, 'deposits');
    assert.equal(deposits.messages[0].snapshot.visibility, 'private');
    assert.equal(deposits.messages[0].snapshot.payload, 'deposit_projection');
    assert.equal(deposits.messages[0].snapshot.source, 'tradingvault-event-projection');
    assert.equal(deposits.messages[0].snapshot.custody, 'non-custodial-no-withdrawal-authority');
    assert.deepEqual(deposits.messages[0].snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(deposits.messages[0].snapshot.safetyNotice, 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');
    assert.deepEqual(deposits.messages[0].snapshot.data.deposits, []);
    assert.equal(deposits.messages[0].snapshot.data.projectionType, 'TradingVaultDepositProjection');
    assert.equal(deposits.messages[0].snapshot.data.settlementMode, 'mock');
    assert.equal(deposits.messages[0].snapshot.data.settlementTx, null);
    assert.equal(deposits.messages[0].snapshot.data.explorerUrl, null);
    assert.equal(deposits.messages[0].snapshot.data.realQuaiTransactions, false);
    assert.equal(deposits.messages[0].snapshot.data.walletRequired, false);
    assert.equal(deposits.messages[0].snapshot.data.fundsMoved, false);
    assert.equal(deposits.messages[0].snapshot.data.tradingVaultMutation, false);

    const withdrawals = await runCliJson(['--base-url', baseUrl, 'stream', 'withdrawals', '--limit', '1']);

    assert.equal(withdrawals.command, 'stream withdrawals');
    assert.equal(withdrawals.channel, 'withdrawals');
    assert.equal(withdrawals.transport, 'websocket');
    assert.equal(withdrawals.messages.length, 1);
    assert.equal(withdrawals.messages[0].snapshot.channel, 'withdrawals');
    assert.equal(withdrawals.messages[0].snapshot.visibility, 'private');
    assert.equal(withdrawals.messages[0].snapshot.payload, 'withdrawal_projection');
    assert.equal(withdrawals.messages[0].snapshot.source, 'tradingvault-event-projection');
    assert.deepEqual(withdrawals.messages[0].snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.deepEqual(withdrawals.messages[0].snapshot.data.withdrawals, []);
    assert.equal(withdrawals.messages[0].snapshot.data.projectionType, 'TradingVaultWithdrawalProjection');
    assert.equal(withdrawals.messages[0].snapshot.data.settlementMode, 'mock');
    assert.equal(withdrawals.messages[0].snapshot.data.settlementTx, null);
    assert.equal(withdrawals.messages[0].snapshot.data.explorerUrl, null);
    assert.equal(withdrawals.messages[0].snapshot.data.realQuaiTransactions, false);
    assert.equal(withdrawals.messages[0].snapshot.data.walletRequired, false);
    assert.equal(withdrawals.messages[0].snapshot.data.fundsMoved, false);
    assert.equal(withdrawals.messages[0].snapshot.data.tradingVaultMutation, false);
  });
});

test('qdex stream delegate-key registrations and revocations commands expose bounded read-only history snapshots', async () => {
  await withServer(async (baseUrl) => {
    const registrations = await runCliJson(['--base-url', baseUrl, 'stream', 'delegate-key-registrations', '--limit', '1']);

    assert.equal(registrations.command, 'stream delegate-key-registrations');
    assert.equal(registrations.channel, 'delegate-key-registrations');
    assert.equal(registrations.transport, 'websocket');
    assert.equal(registrations.limit, 1);
    assert.equal(registrations.messages.length, 1);
    assert.equal(registrations.messages[0].type, 'snapshot');
    assert.equal(registrations.messages[0].snapshot.channel, 'delegate-key-registrations');
    assert.equal(registrations.messages[0].snapshot.visibility, 'private');
    assert.equal(registrations.messages[0].snapshot.payload, 'delegate_key_registration_projection');
    assert.equal(registrations.messages[0].snapshot.source, 'delegatekeyregistry-event-projection');
    assert.equal(registrations.messages[0].snapshot.custody, 'non-custodial-no-withdrawal-authority');
    assert.deepEqual(registrations.messages[0].snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.deepEqual(registrations.messages[0].snapshot.data.registrations, []);
    assert.equal(registrations.messages[0].snapshot.data.projectionType, 'DelegateKeyRegisteredProjection');
    assert.equal(registrations.messages[0].snapshot.data.eventName, 'DelegateKeyRegistered');
    assert.equal(registrations.messages[0].snapshot.data.settlementMode, 'mock');
    assert.equal(registrations.messages[0].snapshot.data.settlementTx, null);
    assert.equal(registrations.messages[0].snapshot.data.explorerUrl, null);
    assert.equal(registrations.messages[0].snapshot.data.delegateCanWithdraw, false);
    assert.equal(registrations.messages[0].snapshot.data.delegateCanAdmin, false);
    assert.equal(registrations.messages[0].snapshot.data.realQuaiTransactions, false);
    assert.equal(registrations.messages[0].snapshot.data.walletRequired, false);
    assert.equal(registrations.messages[0].snapshot.data.fundsMoved, false);
    assert.equal(registrations.messages[0].snapshot.data.delegateKeyRegistryMutation, false);

    const revocations = await runCliJson(['--base-url', baseUrl, 'stream', 'delegate-key-revocations', '--limit', '1']);

    assert.equal(revocations.command, 'stream delegate-key-revocations');
    assert.equal(revocations.channel, 'delegate-key-revocations');
    assert.equal(revocations.transport, 'websocket');
    assert.equal(revocations.messages.length, 1);
    assert.equal(revocations.messages[0].snapshot.channel, 'delegate-key-revocations');
    assert.equal(revocations.messages[0].snapshot.visibility, 'private');
    assert.equal(revocations.messages[0].snapshot.payload, 'delegate_key_revocation_projection');
    assert.equal(revocations.messages[0].snapshot.source, 'delegatekeyregistry-event-projection');
    assert.deepEqual(revocations.messages[0].snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.deepEqual(revocations.messages[0].snapshot.data.revocations, []);
    assert.equal(revocations.messages[0].snapshot.data.projectionType, 'DelegateKeyRevokedProjection');
    assert.equal(revocations.messages[0].snapshot.data.eventName, 'DelegateKeyRevoked');
    assert.equal(revocations.messages[0].snapshot.data.settlementMode, 'mock');
    assert.equal(revocations.messages[0].snapshot.data.settlementTx, null);
    assert.equal(revocations.messages[0].snapshot.data.explorerUrl, null);
    assert.equal(revocations.messages[0].snapshot.data.delegateCanWithdraw, false);
    assert.equal(revocations.messages[0].snapshot.data.delegateCanAdmin, false);
    assert.equal(revocations.messages[0].snapshot.data.realQuaiTransactions, false);
    assert.equal(revocations.messages[0].snapshot.data.walletRequired, false);
    assert.equal(revocations.messages[0].snapshot.data.fundsMoved, false);
    assert.equal(revocations.messages[0].snapshot.data.delegateKeyRegistryMutation, false);
  });
});

test('qdex balance command prints read-only mock vault balances without wallet or withdrawal authority', async () => {
  await withServer(async (baseUrl) => {
    const result = await runCliJson(['--base-url', baseUrl, 'balance']);

    assert.equal(result.command, 'balance');
    assert.equal(result.baseUrl, baseUrl);
    assert.deepEqual(result.balances, []);
    assert.equal(result.source, 'mock-vault-projection');
    assert.equal(result.custody, 'non-custodial-contract-vault');
    assert.deepEqual(result.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(result.withdrawalAuthority, 'owner-wallet-only');
    assert.equal(result.settlementMode, 'mock');
    assert.equal(result.realQuaiTransactions, false);
    assert.equal(result.walletRequired, false);
    assert.match(result.safetyNotice, /no wallet loaded, no funds moved/);
  });
});

test('qdex vault prepare commands print owner-wallet placeholders without wallet or tx authority', async () => {
  await withServer(async (baseUrl) => {
    const deposit = await runCliJson([
      '--base-url',
      baseUrl,
      'vault',
      'deposit',
      '--prepare',
      '--owner',
      '0x1111111111111111111111111111111111111111',
      '--asset-symbol',
      'WQI',
      '--amount',
      '10',
      '--chain-id',
      '0',
      '--vault-contract-ref',
      'local-only-not-deployed',
    ]);

    assert.equal(deposit.command, 'vault deposit prepare');
    assert.equal(deposit.status, 501);
    assert.equal(deposit.httpStatus, 501);
    assert.equal(deposit.error, 'owner_wallet_vault_deposit_not_implemented');
    assert.equal(deposit.source, 'owner-wallet-vault-operation-placeholder');
    assert.equal(deposit.custody, 'non-custodial-contract-vault');
    assert.equal(deposit.vaultOperation, 'deposit');
    assert.equal(deposit.operationStatus, 'prepare-only-not-implemented');
    assert.equal(deposit.ownerAuthorization, 'owner-wallet-required');
    assert.deepEqual(deposit.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(deposit.delegateAuthority, 'delegates-cannot-deposit-or-withdraw');
    assert.equal(deposit.realQuaiTransactions, false);
    assert.equal(deposit.walletRequired, false);
    assert.equal(deposit.fundsMoved, false);
    assert.equal(deposit.tradingVaultMutation, false);
    assert.equal(deposit.safety.noWalletLoading, true);
    assert.equal(deposit.safety.noRpcUrlAccess, true);
    assert.equal(deposit.safety.noSigning, true);
    assert.equal(deposit.safety.noBroadcast, true);
    assert.equal(deposit.safety.noTransactionSubmission, true);
    assert.equal(deposit.safety.noFundsMovement, true);
    assert.equal(deposit.safety.noDelegateWithdrawalAuthority, true);
    assert.equal(deposit.safety.noAdminWithdrawalAuthority, true);
    assert.match(deposit.message, /owner-wallet-only/);
    assert.match(deposit.message, /does not load wallets, sign, broadcast, submit transactions, mutate TradingVault, or move funds/);

    const withdrawal = await runCliJson([
      '--base-url',
      baseUrl,
      'vault',
      'withdraw',
      '--prepare',
      '--owner',
      '0x1111111111111111111111111111111111111111',
      '--asset-symbol',
      'WQUAI',
      '--amount',
      '1.5',
      '--chain-id',
      '0',
      '--vault-contract-ref',
      'local-only-not-deployed',
    ]);

    assert.equal(withdrawal.command, 'vault withdraw prepare');
    assert.equal(withdrawal.status, 501);
    assert.equal(withdrawal.httpStatus, 501);
    assert.equal(withdrawal.error, 'owner_wallet_vault_withdrawal_not_implemented');
    assert.equal(withdrawal.vaultOperation, 'withdrawal');
    assert.equal(withdrawal.ownerAuthorization, 'owner-wallet-required');
    assert.deepEqual(withdrawal.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(withdrawal.delegateAuthority, 'delegates-cannot-deposit-or-withdraw');
    assert.equal(withdrawal.realQuaiTransactions, false);
    assert.equal(withdrawal.walletRequired, false);
    assert.equal(withdrawal.fundsMoved, false);
    assert.equal(withdrawal.tradingVaultMutation, false);
    assert.match(withdrawal.safety.notice, /no wallet is loaded, no signature is created, no RPC URL is read, no transaction is submitted, and no funds move/);
  });
});

test('qdex vault history commands print read-only event projections without wallet or mutation authority', async () => {
  await withServer(async (baseUrl) => {
    const deposits = await runCliJson(['--base-url', baseUrl, 'vault', 'deposits']);

    assert.equal(deposits.command, 'vault deposits');
    assert.deepEqual(deposits.deposits, []);
    assert.equal(deposits.source, 'tradingvault-event-projection');
    assert.equal(deposits.projectionType, 'TradingVaultDepositProjection');
    assert.equal(deposits.eventName, 'Deposit');
    assert.equal(deposits.custody, 'non-custodial-contract-vault');
    assert.deepEqual(deposits.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(deposits.settlementMode, 'mock');
    assert.equal(deposits.settlementTx, null);
    assert.equal(deposits.blockNumber, null);
    assert.equal(deposits.blockHash, null);
    assert.equal(deposits.eventIndex, null);
    assert.equal(deposits.explorerUrl, null);
    assert.equal(deposits.realQuaiTransactions, false);
    assert.equal(deposits.walletRequired, false);
    assert.equal(deposits.fundsMoved, false);
    assert.equal(deposits.tradingVaultMutation, false);
    assert.match(deposits.safetyNotice, /no real Quai transaction, no wallet loaded, no funds moved/);

    const withdrawals = await runCliJson(['--base-url', baseUrl, 'vault', 'withdrawals']);

    assert.equal(withdrawals.command, 'vault withdrawals');
    assert.deepEqual(withdrawals.withdrawals, []);
    assert.equal(withdrawals.source, 'tradingvault-event-projection');
    assert.equal(withdrawals.projectionType, 'TradingVaultWithdrawalProjection');
    assert.equal(withdrawals.eventName, 'Withdraw');
    assert.deepEqual(withdrawals.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(withdrawals.settlementMode, 'mock');
    assert.equal(withdrawals.settlementTx, null);
    assert.equal(withdrawals.blockNumber, null);
    assert.equal(withdrawals.blockHash, null);
    assert.equal(withdrawals.eventIndex, null);
    assert.equal(withdrawals.explorerUrl, null);
    assert.equal(withdrawals.realQuaiTransactions, false);
    assert.equal(withdrawals.walletRequired, false);
    assert.equal(withdrawals.fundsMoved, false);
    assert.equal(withdrawals.tradingVaultMutation, false);
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

test('qdex listings review-flow command prints read-only local review metadata without mutation authority', async () => {
  await withServer(async (baseUrl) => {
    const result = await runCliJson(['--base-url', baseUrl, 'listings', 'review-flow']);

    assert.equal(result.command, 'listings review-flow');
    assert.equal(result.source, 'listed-asset-marketregistry-review-flow');
    assert.equal(result.status, 'design-only-local-metadata');
    assert.equal(result.phase, 'clonners-managed-local-review-before-dao');
    assert.equal(
      result.requestSurface,
      'prepare-only POST /v1/listings/requests; POST /v1/listings/requests with requestMode=local_review_queue; GET /v1/listings/requests inspection; POST /v1/listings/requests/{requestId}/decision with decisionMode=local_review_decision',
    );
    assert.equal(
      result.clientSurface,
      'TypeScript/Python/qdex listing policy, review-flow, local queue, and local decision clients',
    );
    assert.deepEqual(result.stages.map((stage) => stage.id), [
      'metadata_intake',
      'token_safety_review',
      'market_parameter_review',
      'clonners_local_approval',
      'marketregistry_admin_gate',
    ]);
    assert.equal(result.approvalOutcome.approvedStatus, 'approved-local-metadata-only');
    assert.equal(result.approvalOutcome.rejectedStatus, 'rejected-local-metadata-only');
    assert.equal(result.approvalOutcome.marketRegistryMutation, false);
    assert.equal(result.approvalOutcome.realQuaiTransactions, false);
    assert.deepEqual(result.safety.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(result.safety.marketRegistryMutation, false);
    assert.equal(result.safety.realQuaiTransactions, false);
    assert.equal(result.safety.walletRequired, false);
    assert.equal(result.safety.noWalletLoading, true);
    assert.equal(result.safety.noRpcUrlAccess, true);
    assert.equal(result.safety.noSigning, true);
    assert.equal(result.safety.noBroadcast, true);
    assert.equal(result.safety.noDeploys, true);
    assert.equal(result.safety.noTransactionSubmission, true);
    assert.equal(result.safety.noListingAdminKeys, true);
    assert.equal(result.safety.noRealTokenAddresses, true);
    assert.equal(result.safety.noFundsMovement, true);
    assert.match(
      result.safety.notice,
      /approved in-memory queue\/decision state only; it does not mutate MarketRegistry, move TradingVault balances, grant withdrawal\/admin authority/i,
    );
  });
});

test('qdex listings queue commands inspect and enqueue local review metadata without mutation authority', async () => {
  await withServer(async (baseUrl) => {
    const emptyQueue = await runCliJson(['--base-url', baseUrl, 'listings', 'requests']);
    assert.equal(emptyQueue.command, 'listings requests');
    assert.equal(emptyQueue.source, 'listed-asset-marketregistry-review-flow');
    assert.equal(emptyQueue.status, 'design-only-local-metadata');
    assert.equal(emptyQueue.phase, 'clonners-managed-local-review-before-dao');
    assert.equal(emptyQueue.queueStatus, 'local-in-memory-review-queue');
    assert.equal(emptyQueue.persistence, 'in-memory-local-server-only');
    assert.equal(emptyQueue.count, 0);
    assert.deepEqual(emptyQueue.requests, []);
    assert.deepEqual(emptyQueue.safety.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(emptyQueue.safety.marketRegistryMutation, false);
    assert.equal(emptyQueue.safety.realQuaiTransactions, false);
    assert.equal(emptyQueue.safety.walletRequired, false);

    const queued = await runCliJson([
      '--base-url',
      baseUrl,
      'listings',
      'request',
      '--local-review-queue',
      '--base-symbol',
      'COMMUNITY',
      '--quote-symbol',
      'WQI',
      '--token-model',
      'erc20-style-vault-token',
      '--market-id',
      'COMMUNITY-WQI',
      '--price-precision',
      '8',
      '--amount-precision',
      '8',
      '--min-amount',
      '1',
      '--review-notes',
      'metadata-only local queue request from qdex CLI',
    ]);

    assert.equal(queued.command, 'listings request local-review-queue');
    assert.equal(queued.status, 202);
    assert.equal(queued.httpStatus, 202);
    assert.equal(queued.metadataStatus, 'design-only-local-metadata');
    assert.equal(queued.source, 'listed-asset-marketregistry-review-flow');
    assert.equal(queued.requestStatus, 'queued-local-review');
    assert.equal(queued.phase, 'clonners-managed-local-review-before-dao');
    assert.equal(queued.requestMode, 'local_review_queue');
    assert.equal(queued.reviewStage, 'metadata_intake');
    assert.equal(queued.reviewDecision, 'pending-local-review');
    assert.equal(queued.marketRegistry.marketRegistryMutation, false);
    assert.equal(queued.marketRegistry.canMoveTradingVaultBalances, false);
    assert.deepEqual(queued.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(queued.realQuaiTransactions, false);
    assert.equal(queued.walletRequired, false);
    assert.equal(queued.safety.noWalletLoading, true);
    assert.equal(queued.safety.noRpcUrlAccess, true);
    assert.equal(queued.safety.noSigning, true);
    assert.equal(queued.safety.noBroadcast, true);
    assert.equal(queued.safety.noDeploys, true);
    assert.equal(queued.safety.noTransactionSubmission, true);
    assert.equal(queued.safety.noListingAdminKeys, true);
    assert.equal(queued.safety.noRealTokenAddresses, true);
    assert.equal(queued.safety.noFundsMovement, true);
    assert.match(queued.message, /in-memory local review queue/i);
    assert.match(queued.message, /does not mutate MarketRegistry/i);

    const queue = await runCliJson(['--base-url', baseUrl, 'listings', 'requests']);
    assert.equal(queue.count, 1);
    assert.equal(queue.requests[0].requestId, queued.requestId);
    assert.equal(queue.requests[0].requestStatus, 'queued-local-review');
  });
});

test('qdex listings request decision records local review metadata without mutation authority', async () => {
  await withServer(async (baseUrl) => {
    const queued = await runCliJson([
      '--base-url',
      baseUrl,
      'listings',
      'request',
      '--local-review-queue',
      '--base-symbol',
      'COMMUNITY',
      '--quote-symbol',
      'WQI',
      '--token-model',
      'erc20-style-vault-token',
      '--market-id',
      'COMMUNITY-WQI',
      '--price-precision',
      '8',
      '--amount-precision',
      '8',
      '--min-amount',
      '1',
      '--review-notes',
      'metadata-only local decision request from qdex CLI',
    ]);

    const decision = await runCliJson([
      '--base-url',
      baseUrl,
      'listings',
      'request',
      'decision',
      queued.requestId,
      '--decision',
      'approve',
      '--review-stage',
      'clonners_local_approval',
      '--decision-notes',
      'approved locally for metadata-only qdex CLI smoke coverage',
    ]);

    assert.equal(decision.command, 'listings request decision');
    assert.equal(decision.status, 200);
    assert.equal(decision.httpStatus, 200);
    assert.equal(decision.metadataStatus, 'design-only-local-metadata');
    assert.equal(decision.requestId, queued.requestId);
    assert.equal(decision.source, 'listed-asset-marketregistry-review-flow');
    assert.equal(decision.requestStatus, 'reviewed-local-metadata-only');
    assert.equal(decision.phase, 'clonners-managed-local-review-before-dao');
    assert.equal(decision.decisionMode, 'local_review_decision');
    assert.equal(decision.reviewStage, 'clonners_local_approval');
    assert.equal(decision.reviewDecision, 'approved-local-metadata-only');
    assert.equal(decision.nextMutationGate, 'explicit Clonners approval required before MarketRegistry.addMarket');
    assert.deepEqual(decision.decision, {
      decision: 'approve',
      decisionNotes: 'approved locally for metadata-only qdex CLI smoke coverage',
    });
    assert.deepEqual(decision.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(decision.realQuaiTransactions, false);
    assert.equal(decision.walletRequired, false);
    assert.equal(decision.marketRegistry.marketRegistryMutation, false);
    assert.equal(decision.marketRegistry.canMoveTradingVaultBalances, false);
    assert.equal(decision.safety.noWalletLoading, true);
    assert.equal(decision.safety.noRpcUrlAccess, true);
    assert.equal(decision.safety.noSigning, true);
    assert.equal(decision.safety.noBroadcast, true);
    assert.equal(decision.safety.noDeploys, true);
    assert.equal(decision.safety.noTransactionSubmission, true);
    assert.equal(decision.safety.noListingAdminKeys, true);
    assert.equal(decision.safety.noRealTokenAddresses, true);
    assert.equal(decision.safety.noFundsMovement, true);
    assert.match(decision.message, /Recorded local approval metadata only/i);
    assert.match(decision.message, /does not mutate MarketRegistry/i);

    const queue = await runCliJson(['--base-url', baseUrl, 'listings', 'requests']);
    assert.equal(queue.requests[0].requestId, queued.requestId);
    assert.equal(queue.requests[0].reviewDecision, 'approved-local-metadata-only');
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

test('qdex api create-key/revoke-key --prepare prints owner-signed delegate-key placeholders without wallet or admin authority', async () => {
  await withServer(async (baseUrl) => {
    const registration = await runCliJson([
      '--base-url',
      baseUrl,
      'api',
      'create-key',
      'bot-mm-1',
      '--prepare',
      '--owner',
      '0x1111111111111111111111111111111111111111',
      '--delegate',
      '0x3333333333333333333333333333333333333333',
      '--allowed-market',
      'QI-QUAI',
      '--max-notional',
      '1000',
      '--expires-at',
      '1780003600',
      '--permission',
      'PLACE_ORDER',
      '--permission',
      'CANCEL_ORDER',
      '--permission',
      'CANCEL_ALL',
      '--signature',
      '0xowner-signed-placeholder',
    ]);

    assert.equal(registration.command, 'api create-key prepare');
    assert.equal(registration.keyId, 'bot-mm-1');
    assert.equal(registration.status, 501);
    assert.equal(registration.httpStatus, 501);
    assert.equal(registration.error, 'delegate_key_registration_not_implemented');
    assert.equal(registration.source, 'delegate-key-owner-signed-prepare-boundary');
    assert.equal(registration.operation, 'register_delegate_key');
    assert.equal(registration.operationStatus, 'prepare-only-owner-signed-required');
    assert.equal(registration.ownerAuthorization, 'owner-wallet-signature-required');
    assert.deepEqual(registration.permissions, ['PLACE_ORDER', 'CANCEL_ORDER', 'CANCEL_ALL', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(registration.delegateCanWithdraw, false);
    assert.equal(registration.delegateCanAdmin, false);
    assert.equal(registration.realQuaiTransactions, false);
    assert.equal(registration.walletRequired, false);
    assert.equal(registration.fundsMoved, false);
    assert.equal(registration.tradingVaultMutation, false);
    assert.match(registration.message, /No delegate key is registered/i);

    const revocation = await runCliJson([
      '--base-url',
      baseUrl,
      'api',
      'revoke-key',
      'bot-mm-1',
      '--prepare',
      '--owner',
      '0x1111111111111111111111111111111111111111',
      '--signature',
      '0xowner-signed-placeholder',
    ]);

    assert.equal(revocation.command, 'api revoke-key prepare');
    assert.equal(revocation.keyId, 'bot-mm-1');
    assert.equal(revocation.status, 501);
    assert.equal(revocation.httpStatus, 501);
    assert.equal(revocation.error, 'delegate_key_revocation_not_implemented');
    assert.equal(revocation.source, 'delegate-key-owner-signed-prepare-boundary');
    assert.equal(revocation.operation, 'revoke_delegate_key');
    assert.deepEqual(revocation.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(revocation.delegateCanWithdraw, false);
    assert.equal(revocation.delegateCanAdmin, false);
    assert.equal(revocation.realQuaiTransactions, false);
    assert.equal(revocation.walletRequired, false);
    assert.equal(revocation.fundsMoved, false);
    assert.equal(revocation.tradingVaultMutation, false);
    assert.match(revocation.message, /No delegate key is revoked/i);
  });
});

test('qdex api registrations/revocations print read-only DelegateKeyRegistry history envelopes without wallet or mutation authority', async () => {
  await withServer(async (baseUrl) => {
    const registrations = await runCliJson(['--base-url', baseUrl, 'api', 'registrations']);
    assert.equal(registrations.command, 'api registrations');
    assert.deepEqual(registrations.registrations, []);
    assert.equal(registrations.source, 'delegatekeyregistry-event-projection');
    assert.equal(registrations.projectionType, 'DelegateKeyRegisteredProjection');
    assert.equal(registrations.eventName, 'DelegateKeyRegistered');
    assert.equal(registrations.custody, 'non-custodial-no-withdrawal-authority');
    assert.deepEqual(registrations.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(registrations.settlementMode, 'mock');
    assert.equal(registrations.settlementTx, null);
    assert.equal(registrations.blockNumber, null);
    assert.equal(registrations.blockHash, null);
    assert.equal(registrations.eventIndex, null);
    assert.equal(registrations.explorerUrl, null);
    assert.equal(registrations.realQuaiTransactions, false);
    assert.equal(registrations.walletRequired, false);
    assert.equal(registrations.fundsMoved, false);
    assert.equal(registrations.tradingVaultMutation, false);
    assert.equal(registrations.delegateKeyRegistryMutation, false);
    assert.equal(registrations.delegateCanWithdraw, false);
    assert.equal(registrations.delegateCanAdmin, false);
    assert.match(registrations.safetyNotice, /read-only DelegateKeyRegistry DelegateKeyRegistered history projection/i);

    const revocations = await runCliJson(['--base-url', baseUrl, 'api', 'revocations']);
    assert.equal(revocations.command, 'api revocations');
    assert.deepEqual(revocations.revocations, []);
    assert.equal(revocations.source, 'delegatekeyregistry-event-projection');
    assert.equal(revocations.projectionType, 'DelegateKeyRevokedProjection');
    assert.equal(revocations.eventName, 'DelegateKeyRevoked');
    assert.equal(revocations.custody, 'non-custodial-no-withdrawal-authority');
    assert.deepEqual(revocations.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(revocations.settlementMode, 'mock');
    assert.equal(revocations.settlementTx, null);
    assert.equal(revocations.blockNumber, null);
    assert.equal(revocations.blockHash, null);
    assert.equal(revocations.eventIndex, null);
    assert.equal(revocations.explorerUrl, null);
    assert.equal(revocations.realQuaiTransactions, false);
    assert.equal(revocations.walletRequired, false);
    assert.equal(revocations.fundsMoved, false);
    assert.equal(revocations.tradingVaultMutation, false);
    assert.equal(revocations.delegateKeyRegistryMutation, false);
    assert.equal(revocations.delegateCanWithdraw, false);
    assert.equal(revocations.delegateCanAdmin, false);
    assert.match(revocations.safetyNotice, /read-only DelegateKeyRegistry DelegateKeyRevoked history projection/i);
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
