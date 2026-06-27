import assert from 'node:assert/strict';
import test from 'node:test';

import { createMockDexState } from '../src/mock-dex.js';
import { createStreamSnapshot, listStreamContracts } from '../src/streams.js';

const ZERO_DELEGATE = '0x0000000000000000000000000000000000000000';
const SETTLEMENT_CONTRACT = '0x2222222222222222222222222222222222222222';

const mockOrder = (overrides = {}) => {
  const owner = overrides.owner ?? '0x1111111111111111111111111111111111111111';
  const nonce = overrides.nonce ?? '1';

  return {
    marketId: 'WQUAI-WQI',
    side: 'sell',
    type: 'limit',
    baseToken: 'mock:WQUAI',
    quoteToken: 'mock:WQI',
    amount: '100',
    price: '5',
    timeInForce: 'GTC',
    maxSlippageBps: 0,
    owner,
    delegate: ZERO_DELEGATE,
    nonce,
    expiresAt: 1780003600,
    chainId: 0,
    settlementContract: SETTLEMENT_CONTRACT,
    clientOrderId: `ws-contract-order-${nonce}`,
    signature: {
      scheme: 'mock',
      signer: owner,
      value: `0xmock-${nonce}`,
      signedAt: 1780000000,
    },
    ...overrides,
    signature: {
      scheme: 'mock',
      signer: owner,
      value: `0xmock-${nonce}`,
      signedAt: 1780000000,
      ...(overrides.signature ?? {}),
    },
  };
};

test('stream channel registry pins public market data and custody-safe private scopes', () => {
  const contracts = listStreamContracts({ marketId: 'WQUAI-WQI' });

  assert.deepEqual(contracts.public.map((contract) => contract.channel), [
    'global.tickers',
    'fees',
    'market.WQUAI-WQI.depth',
    'market.WQUAI-WQI.trades',
    'market.WQUAI-WQI.klines.1m',
    'market.WQUAI-WQI.klines.15m',
  ]);

  const privateChannels = contracts.private.map((contract) => contract.channel);
  assert.deepEqual(privateChannels, [
    'orders',
    'fills',
    'balances',
    'settlements',
    'deposits',
    'withdrawals',
    'delegate-key-registrations',
    'delegate-key-revocations',
    'nonce-cancellations',
    'open-orders',
  ]);

  const fillsContract = contracts.private.find((contract) => contract.channel === 'fills');
  assert.deepEqual(fillsContract.requiredPermissions, ['READ_ONLY']);
  assert.deepEqual(fillsContract.delegateDefaults, ['NO_WITHDRAW', 'NO_ADMIN']);
  assert.deepEqual(fillsContract.forbiddenPermissions, ['WITHDRAW', 'ADMIN']);
  assert.equal(fillsContract.source, 'in-memory-indexer-projection');
  assert.equal(fillsContract.finality, 'confirmed-settlement-only');

  const feesContract = contracts.public.find((contract) => contract.channel === 'fees');
  assert.equal(feesContract.visibility, 'public');
  assert.equal(feesContract.payload, 'fee_schedule_projection');
  assert.equal(feesContract.source, 'feemanager-policy-projection');

  const depositsContract = contracts.private.find((contract) => contract.channel === 'deposits');
  assert.equal(depositsContract.payload, 'deposit_projection');
  assert.equal(depositsContract.source, 'tradingvault-event-projection');
  assert.deepEqual(depositsContract.requiredPermissions, ['READ_ONLY']);
  assert.deepEqual(depositsContract.delegateDefaults, ['NO_WITHDRAW', 'NO_ADMIN']);
  assert.deepEqual(depositsContract.forbiddenPermissions, ['WITHDRAW', 'ADMIN']);

  const withdrawalsContract = contracts.private.find((contract) => contract.channel === 'withdrawals');
  assert.equal(withdrawalsContract.payload, 'withdrawal_projection');
  assert.equal(withdrawalsContract.source, 'tradingvault-event-projection');
  assert.deepEqual(withdrawalsContract.requiredPermissions, ['READ_ONLY']);
  assert.deepEqual(withdrawalsContract.delegateDefaults, ['NO_WITHDRAW', 'NO_ADMIN']);
  assert.deepEqual(withdrawalsContract.forbiddenPermissions, ['WITHDRAW', 'ADMIN']);

  const delegateKeyRegistrationsContract = contracts.private.find(
    (contract) => contract.channel === 'delegate-key-registrations',
  );
  assert.equal(delegateKeyRegistrationsContract.payload, 'delegate_key_registration_projection');
  assert.equal(delegateKeyRegistrationsContract.source, 'delegatekeyregistry-event-projection');
  assert.deepEqual(delegateKeyRegistrationsContract.requiredPermissions, ['READ_ONLY']);
  assert.deepEqual(delegateKeyRegistrationsContract.delegateDefaults, ['NO_WITHDRAW', 'NO_ADMIN']);
  assert.deepEqual(delegateKeyRegistrationsContract.forbiddenPermissions, ['WITHDRAW', 'ADMIN']);

  const delegateKeyRevocationsContract = contracts.private.find(
    (contract) => contract.channel === 'delegate-key-revocations',
  );
  assert.equal(delegateKeyRevocationsContract.payload, 'delegate_key_revocation_projection');
  assert.equal(delegateKeyRevocationsContract.source, 'delegatekeyregistry-event-projection');
  assert.deepEqual(delegateKeyRevocationsContract.requiredPermissions, ['READ_ONLY']);
  assert.deepEqual(delegateKeyRevocationsContract.delegateDefaults, ['NO_WITHDRAW', 'NO_ADMIN']);
  assert.deepEqual(delegateKeyRevocationsContract.forbiddenPermissions, ['WITHDRAW', 'ADMIN']);

  const nonceCancellationsContract = contracts.private.find(
    (contract) => contract.channel === 'nonce-cancellations',
  );
  assert.equal(nonceCancellationsContract.payload, 'nonce_cancellation_projection');
  assert.equal(nonceCancellationsContract.source, 'nonce-manager-event-projection');
  assert.deepEqual(nonceCancellationsContract.requiredPermissions, ['READ_ONLY']);
  assert.deepEqual(nonceCancellationsContract.delegateDefaults, ['NO_WITHDRAW', 'NO_ADMIN']);
  assert.deepEqual(nonceCancellationsContract.forbiddenPermissions, ['WITHDRAW', 'ADMIN']);

  const openOrdersContract = contracts.private.find(
    (contract) => contract.channel === 'open-orders',
  );
  assert.equal(openOrdersContract.payload, 'open_orders_projection');
  assert.equal(openOrdersContract.source, 'mock-order-projection');
  assert.deepEqual(openOrdersContract.requiredPermissions, ['READ_ONLY']);
  assert.deepEqual(openOrdersContract.delegateDefaults, ['NO_WITHDRAW', 'NO_ADMIN']);
  assert.deepEqual(openOrdersContract.forbiddenPermissions, ['WITHDRAW', 'ADMIN']);
});

test('stream snapshots expose public depth/trades and private fills from indexed mock projections', () => {
  const state = createMockDexState();

  const emptyDepth = createStreamSnapshot({ channel: 'market.WQUAI-WQI.depth', state });
  assert.deepEqual(emptyDepth, {
    channel: 'market.WQUAI-WQI.depth',
    visibility: 'public',
    payload: 'orderbook_depth',
    source: 'mock-orderbook',
    custody: 'public-read-only-no-custody',
    data: {
      marketId: 'WQUAI-WQI',
      sequence: 0,
      bids: [],
      asks: [],
      source: 'mock-orderbook',
    },
  });

  const sell = state.submitOrder(mockOrder({
    side: 'sell',
    amount: '100',
    price: '5',
    nonce: '301',
    owner: '0x1111111111111111111111111111111111111111',
  }));
  assert.equal(sell.statusCode, 201);

  const buy = state.submitOrder(mockOrder({
    side: 'buy',
    amount: '100',
    price: '6',
    nonce: '302',
    owner: '0x3333333333333333333333333333333333333333',
  }));
  assert.equal(buy.statusCode, 201);
  assert.equal(buy.body.fills.length, 1);

  const publicTrades = createStreamSnapshot({ channel: 'market.WQUAI-WQI.trades', state });
  assert.equal(publicTrades.visibility, 'public');
  assert.equal(publicTrades.source, 'in-memory-indexer-projection');
  // Matching engine uses orderSequence for fill IDs — sell is sequence 1, buy is sequence 2
  assert.equal(publicTrades.data.trades.length, 1);
  assert.equal(publicTrades.data.trades[0].tradeId, 'trade-000001');
  assert.match(publicTrades.data.trades[0].fillId, /^fill-00000[12]$/);
  assert.equal(publicTrades.data.trades[0].marketId, 'WQUAI-WQI');
  assert.equal(publicTrades.data.trades[0].price, '5');
  assert.equal(publicTrades.data.trades[0].amount, '100');
  assert.equal(publicTrades.data.trades[0].settlementStatus, 'confirmed');

  const privateFills = createStreamSnapshot({ channel: 'fills', state });
  assert.equal(privateFills.visibility, 'private');
  assert.equal(privateFills.custody, 'non-custodial-no-withdrawal-authority');
  assert.deepEqual(privateFills.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(privateFills.source, 'in-memory-indexer-projection');
  assert.equal(privateFills.safetyNotice, 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');
  assert.deepEqual(privateFills.data.fills, [buy.body.fills[0]]);
  assert.equal(privateFills.data.fills[0].projectionType, 'IndexedFillProjection');
  assert.ok(privateFills.data.fills[0].sourceEventId);
  assert.equal(privateFills.data.fills[0].settlementMode, 'mock');
  assert.equal(privateFills.data.fills[0].settlementStatus, 'confirmed');
  assert.equal(Object.hasOwn(privateFills.data.fills[0], 'createdAt'), false);

  const privateBalances = createStreamSnapshot({ channel: 'balances', state });
  assert.equal(privateBalances.visibility, 'private');
  assert.equal(privateBalances.source, 'mock-vault-projection');
  assert.deepEqual(privateBalances.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.deepEqual(privateBalances.data, {
    balances: [],
    source: 'mock-vault-projection',
    custody: 'non-custodial-contract-vault',
    permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
    withdrawalAuthority: 'owner-wallet-only',
    settlementMode: 'mock',
    realQuaiTransactions: false,
    walletRequired: false,
    safetyNotice: 'Mock vault projection only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.',
  });
});

test('public FeeManager fee schedule stream snapshot reuses the read-only policy envelope', () => {
  const state = createMockDexState();
  const snapshot = createStreamSnapshot({ channel: 'fees', state });

  assert.equal(snapshot.channel, 'fees');
  assert.equal(snapshot.visibility, 'public');
  assert.equal(snapshot.payload, 'fee_schedule_projection');
  assert.equal(snapshot.source, 'feemanager-policy-projection');
  assert.equal(snapshot.custody, 'public-read-only-no-custody');

  assert.equal(snapshot.data.source, 'feemanager-policy-projection');
  assert.equal(snapshot.data.status, 'local-only-not-deployed');
  assert.equal(snapshot.data.custody, 'non-custodial-fee-policy');
  assert.deepEqual(snapshot.data.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(snapshot.data.hardMaxFeeBps, 1000);
  assert.equal(snapshot.data.feeRecipient, null);
  assert.equal(snapshot.data.feeManagerMutation, false);
  assert.equal(snapshot.data.tradingVaultMutation, false);
  assert.equal(snapshot.data.realQuaiTransactions, false);
  assert.equal(snapshot.data.walletRequired, false);
  assert.equal(snapshot.data.fundsMoved, false);
  assert.equal(snapshot.data.safety.noFeeAuthorityRuntimeKeys, true);
  assert.equal(snapshot.data.safety.noWalletLoading, true);
  assert.equal(snapshot.data.safety.noRpcUrlAccess, true);
  assert.equal(snapshot.data.safety.noSigning, true);
  assert.equal(snapshot.data.safety.noBroadcast, true);
  assert.equal(snapshot.data.safety.noDeploys, true);
  assert.equal(snapshot.data.safety.noTransactionSubmission, true);
  assert.equal(snapshot.data.safety.noFundsMovement, true);

  assert.deepEqual(snapshot.data.feeSchedules, [
     {
       marketId: 'WQUAI-WQI',
       projectionType: 'FeeScheduleProjection',
       eventName: 'FeesUpdated',
       makerFeeBps: 0,
       takerFeeBps: 100,
       maxFeeBps: 1000,
       feeRecipient: null,
       settlementMode: 'mock',
       settlementTx: null,
       blockNumber: null,
       blockHash: null,
       eventIndex: null,
       explorerUrl: null,
     },
   ]);
});

test('private deposit and withdrawal stream snapshots reuse TradingVault event-projection envelopes', () => {
  const state = createMockDexState();

  const expectations = [
    {
      channel: 'deposits',
      payload: 'deposit_projection',
      collection: 'deposits',
      projectionType: 'TradingVaultDepositProjection',
      eventName: 'Deposit',
    },
    {
      channel: 'withdrawals',
      payload: 'withdrawal_projection',
      collection: 'withdrawals',
      projectionType: 'TradingVaultWithdrawalProjection',
      eventName: 'Withdraw',
    },
  ];

  for (const expectation of expectations) {
    const snapshot = createStreamSnapshot({ channel: expectation.channel, state });

    assert.equal(snapshot.channel, expectation.channel);
    assert.equal(snapshot.visibility, 'private');
    assert.equal(snapshot.payload, expectation.payload);
    assert.equal(snapshot.source, 'tradingvault-event-projection');
    assert.equal(snapshot.custody, 'non-custodial-no-withdrawal-authority');
    assert.deepEqual(snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(snapshot.safetyNotice, 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');

    assert.deepEqual(snapshot.data[expectation.collection], []);
    assert.equal(snapshot.data.source, 'tradingvault-event-projection');
    assert.equal(snapshot.data.projectionType, expectation.projectionType);
    assert.equal(snapshot.data.eventName, expectation.eventName);
    assert.equal(snapshot.data.custody, 'non-custodial-contract-vault');
    assert.deepEqual(snapshot.data.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(snapshot.data.settlementMode, 'mock');
    assert.equal(snapshot.data.settlementTx, null);
    assert.equal(snapshot.data.blockNumber, null);
    assert.equal(snapshot.data.blockHash, null);
    assert.equal(snapshot.data.eventIndex, null);
    assert.equal(snapshot.data.explorerUrl, null);
    assert.equal(snapshot.data.realQuaiTransactions, false);
    assert.equal(snapshot.data.walletRequired, false);
    assert.equal(snapshot.data.fundsMoved, false);
    assert.equal(snapshot.data.tradingVaultMutation, false);
    assert.match(snapshot.data.safetyNotice, /mock rows have no real Quai transaction/);
    assert.match(snapshot.data.safetyNotice, /no wallet loaded/);
    assert.match(snapshot.data.safetyNotice, /no funds moved/);
    assert.match(snapshot.data.safetyNotice, /no delegate withdrawal\/admin authority/);
  }
});

test('private DelegateKeyRegistry history stream snapshots reuse read-only event-projection envelopes', () => {
  const state = createMockDexState();

  const expectations = [
    {
      channel: 'delegate-key-registrations',
      payload: 'delegate_key_registration_projection',
      collection: 'registrations',
      projectionType: 'DelegateKeyRegisteredProjection',
      eventName: 'DelegateKeyRegistered',
    },
    {
      channel: 'delegate-key-revocations',
      payload: 'delegate_key_revocation_projection',
      collection: 'revocations',
      projectionType: 'DelegateKeyRevokedProjection',
      eventName: 'DelegateKeyRevoked',
    },
  ];

  for (const expectation of expectations) {
    const snapshot = createStreamSnapshot({ channel: expectation.channel, state });

    assert.equal(snapshot.channel, expectation.channel);
    assert.equal(snapshot.visibility, 'private');
    assert.equal(snapshot.payload, expectation.payload);
    assert.equal(snapshot.source, 'delegatekeyregistry-event-projection');
    assert.equal(snapshot.custody, 'non-custodial-no-withdrawal-authority');
    assert.deepEqual(snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(snapshot.safetyNotice, 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');

    assert.deepEqual(snapshot.data[expectation.collection], []);
    assert.equal(snapshot.data.source, 'delegatekeyregistry-event-projection');
    assert.equal(snapshot.data.projectionType, expectation.projectionType);
    assert.equal(snapshot.data.eventName, expectation.eventName);
    assert.equal(snapshot.data.custody, 'non-custodial-no-withdrawal-authority');
    assert.deepEqual(snapshot.data.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(snapshot.data.settlementMode, 'mock');
    assert.equal(snapshot.data.settlementTx, null);
    assert.equal(snapshot.data.blockNumber, null);
    assert.equal(snapshot.data.blockHash, null);
    assert.equal(snapshot.data.eventIndex, null);
    assert.equal(snapshot.data.explorerUrl, null);
    assert.equal(snapshot.data.delegateCanWithdraw, false);
    assert.equal(snapshot.data.delegateCanAdmin, false);
    assert.equal(snapshot.data.realQuaiTransactions, false);
    assert.equal(snapshot.data.walletRequired, false);
    assert.equal(snapshot.data.fundsMoved, false);
    assert.equal(snapshot.data.tradingVaultMutation, false);
    assert.equal(snapshot.data.delegateKeyRegistryMutation, false);
    assert.match(snapshot.data.safetyNotice, /mock rows have no real Quai transaction/);
    assert.match(snapshot.data.safetyNotice, /no wallet loaded/);
    assert.match(snapshot.data.safetyNotice, /no live DelegateKeyRegistry mutation/);
    assert.match(snapshot.data.safetyNotice, /no funds moved/);
    assert.match(snapshot.data.safetyNotice, /no delegate withdrawal\/admin authority/);
  }
});

test('private NonceManager cancellation stream snapshot reuses read-only event-projection envelope', () => {
  const state = createMockDexState();

  const snapshot = createStreamSnapshot({ channel: 'nonce-cancellations', state });

  assert.equal(snapshot.channel, 'nonce-cancellations');
  assert.equal(snapshot.visibility, 'private');
  assert.equal(snapshot.payload, 'nonce_cancellation_projection');
  assert.equal(snapshot.source, 'nonce-manager-event-projection');
  assert.equal(snapshot.custody, 'non-custodial-no-withdrawal-authority');
  assert.deepEqual(snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(snapshot.safetyNotice, 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');

  assert.deepEqual(snapshot.data.cancellations, []);
  assert.equal(snapshot.data.source, 'nonce-manager-event-projection');
  assert.equal(snapshot.data.projectionType, 'NonceCancelledProjection');
  assert.equal(snapshot.data.eventName, 'NonceCancelled');
  assert.equal(snapshot.data.custody, 'non-custodial-no-withdrawal-authority');
  assert.deepEqual(snapshot.data.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(snapshot.data.settlementMode, 'mock');
  assert.equal(snapshot.data.settlementTx, null);
  assert.equal(snapshot.data.blockNumber, null);
  assert.equal(snapshot.data.blockHash, null);
  assert.equal(snapshot.data.eventIndex, null);
  assert.equal(snapshot.data.explorerUrl, null);
  assert.equal(snapshot.data.realQuaiTransactions, false);
  assert.equal(snapshot.data.walletRequired, false);
  assert.equal(snapshot.data.fundsMoved, false);
  assert.equal(snapshot.data.nonceManagerMutation, false);
  assert.equal(snapshot.data.tradingVaultMutation, false);
  assert.match(snapshot.data.safetyNotice, /Read-only NonceManager NonceCancelled/);
  assert.match(snapshot.data.safetyNotice, /mock evidence fields stay null/);
});

test('private open-orders stream snapshot reuses mock-order-projection envelope', () => {
  const state = createMockDexState();

  const snapshot = createStreamSnapshot({ channel: 'open-orders', state });

  assert.equal(snapshot.channel, 'open-orders');
  assert.equal(snapshot.visibility, 'private');
  assert.equal(snapshot.payload, 'open_orders_projection');
  assert.equal(snapshot.source, 'mock-order-projection');
  assert.equal(snapshot.custody, 'non-custodial-no-withdrawal-authority');
  assert.deepEqual(snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(snapshot.safetyNotice, 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');

  assert.deepEqual(snapshot.data.orders, []);
  assert.equal(snapshot.data.source, 'mock-order-projection');
  assert.equal(snapshot.data.projectionType, 'LocalOrderProjection');
  assert.equal(snapshot.data.custody, 'non-custodial-no-withdrawal-authority');
  assert.deepEqual(snapshot.data.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(snapshot.data.matcherLocalOnly, true);
  assert.equal(snapshot.data.settlementMode, 'mock');
  assert.equal(snapshot.data.settlementTx, null);
  assert.equal(snapshot.data.blockNumber, null);
  assert.equal(snapshot.data.blockHash, null);
  assert.equal(snapshot.data.eventIndex, null);
  assert.equal(snapshot.data.explorerUrl, null);
  assert.equal(snapshot.data.realQuaiTransactions, false);
  assert.equal(snapshot.data.walletRequired, false);
  assert.equal(snapshot.data.fundsMoved, false);
  assert.equal(snapshot.data.tradingVaultMutation, false);
  assert.match(snapshot.data.safetyNotice, /Mock open orders only/);
});
