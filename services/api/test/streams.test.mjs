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
    marketId: 'QI-QUAI',
    side: 'sell',
    type: 'limit',
    baseToken: 'mock:QI',
    quoteToken: 'mock:QUAI',
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
  const contracts = listStreamContracts({ marketId: 'QI-QUAI' });

  assert.deepEqual(contracts.public.map((contract) => contract.channel), [
    'global.tickers',
    'market.QI-QUAI.depth',
    'market.QI-QUAI.trades',
    'market.QI-QUAI.klines.1m',
    'market.QI-QUAI.klines.15m',
  ]);

  const privateChannels = contracts.private.map((contract) => contract.channel);
  assert.deepEqual(privateChannels, [
    'orders',
    'fills',
    'balances',
    'settlements',
    'deposits',
    'withdrawals',
  ]);

  const fillsContract = contracts.private.find((contract) => contract.channel === 'fills');
  assert.deepEqual(fillsContract.requiredPermissions, ['READ_ONLY']);
  assert.deepEqual(fillsContract.delegateDefaults, ['NO_WITHDRAW', 'NO_ADMIN']);
  assert.deepEqual(fillsContract.forbiddenPermissions, ['WITHDRAW', 'ADMIN']);
  assert.equal(fillsContract.source, 'in-memory-indexer-projection');
  assert.equal(fillsContract.finality, 'confirmed-settlement-only');
});

test('stream snapshots expose public depth/trades and private fills from indexed mock projections', () => {
  const state = createMockDexState();

  const emptyDepth = createStreamSnapshot({ channel: 'market.QI-QUAI.depth', state });
  assert.deepEqual(emptyDepth, {
    channel: 'market.QI-QUAI.depth',
    visibility: 'public',
    payload: 'orderbook_depth',
    source: 'mock-orderbook',
    custody: 'public-read-only-no-custody',
    data: {
      marketId: 'QI-QUAI',
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

  const publicTrades = createStreamSnapshot({ channel: 'market.QI-QUAI.trades', state });
  assert.equal(publicTrades.visibility, 'public');
  assert.equal(publicTrades.source, 'in-memory-indexer-projection');
  assert.deepEqual(publicTrades.data.trades, [
    {
      tradeId: 'trade-000001',
      fillId: 'fill-000001',
      marketId: 'QI-QUAI',
      price: '5',
      amount: '100',
      settlementStatus: 'confirmed',
      proofUrl: '/v1/proofs/trades/trade-000001',
    },
  ]);

  const privateFills = createStreamSnapshot({ channel: 'fills', state });
  assert.equal(privateFills.visibility, 'private');
  assert.equal(privateFills.custody, 'non-custodial-no-withdrawal-authority');
  assert.deepEqual(privateFills.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(privateFills.source, 'in-memory-indexer-projection');
  assert.equal(privateFills.safetyNotice, 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');
  assert.deepEqual(privateFills.data.fills, [buy.body.fills[0]]);
  assert.equal(privateFills.data.fills[0].projectionType, 'IndexedFillProjection');
  assert.equal(privateFills.data.fills[0].sourceEventId, 'event-000001');
  assert.equal(privateFills.data.fills[0].settlementMode, 'mock');
  assert.equal(privateFills.data.fills[0].settlementStatus, 'confirmed');
  assert.equal(Object.hasOwn(privateFills.data.fills[0], 'createdAt'), false);
});
