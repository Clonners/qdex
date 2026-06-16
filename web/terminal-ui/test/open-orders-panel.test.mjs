import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMockOpenOrdersFixture,
  normalizeOpenOrdersPanelFixture,
} from '../src/open-orders-panel.js';

test('createMockOpenOrdersFixture returns frozen mock fixture with no orders', () => {
  const fixture = createMockOpenOrdersFixture();

  assert.equal(fixture.source, 'mock-order-projection');
  assert.equal(fixture.custody, 'non-custodial-no-withdrawal-authority');
  assert.deepEqual(fixture.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(fixture.matcherLocalOnly, true);
  assert.equal(fixture.settlementMode, 'mock');
  assert.equal(fixture.realQuaiTransactions, false);
  assert.equal(fixture.walletRequired, false);
  assert.equal(fixture.fundsMoved, false);
  assert.equal(fixture.tradingVaultMutation, false);
  assert.equal(fixture.safetyNotice, 'Mock open orders only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.');
  assert.deepEqual(fixture.orders, []);
  assert.throws(() => { fixture.orders.push({}); }, /not extensible|frozen/);
  assert.throws(() => { fixture.orders = []; }, /read only|not extensible|frozen/);
});

test('normalizeOpenOrdersPanelFixture normalizes empty fixture from mock', () => {
  const normalized = normalizeOpenOrdersPanelFixture(createMockOpenOrdersFixture());

  assert.equal(normalized.source, 'mock-order-projection');
  assert.equal(normalized.custody, 'non-custodial-no-withdrawal-authority');
  assert.deepEqual(normalized.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(normalized.matcherLocalOnly, true);
  assert.equal(normalized.settlementMode, 'mock');
  assert.equal(normalized.realQuaiTransactions, false);
  assert.equal(normalized.walletRequired, false);
  assert.equal(normalized.fundsMoved, false);
  assert.equal(normalized.tradingVaultMutation, false);
  assert.equal(normalized.safetyNotice, 'Mock open orders only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.');
  assert.deepEqual(normalized.orders, []);
});

test('normalizeOpenOrdersPanelFixture normalizes orders array', () => {
  const mockOrder = Object.freeze({
    orderHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    marketId: 'WQUAI-WQI',
    side: 'buy',
    price: '5',
    amount: '100',
    remainingAmount: '50',
    status: 'open',
  });

  const normalized = normalizeOpenOrdersPanelFixture({
    ...createMockOpenOrdersFixture(),
    orders: [mockOrder],
  });

  assert.equal(normalized.orders.length, 1);
  assert.equal(normalized.orders[0].orderHash, mockOrder.orderHash);
  assert.equal(normalized.orders[0].side, 'buy');
  assert.equal(normalized.orders[0].status, 'open');
  assert.equal(normalized.orders[0].remainingAmount, '50');
  assert.equal(normalized.matcherLocalOnly, true);
  assert.equal(normalized.realQuaiTransactions, false);
  assert.equal(normalized.fundsMoved, false);
  assert.throws(() => { normalized.orders.push({}); }, /not extensible|frozen/);
});

test('normalizeOpenOrdersPanelFixture defaults to safety values for missing fields', () => {
  const normalized = normalizeOpenOrdersPanelFixture({});

  assert.equal(normalized.source, 'mock-order-projection');
  assert.equal(normalized.custody, 'non-custodial-no-withdrawal-authority');
  assert.deepEqual(normalized.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(normalized.matcherLocalOnly, true);
  assert.equal(normalized.settlementMode, 'mock');
  assert.equal(normalized.realQuaiTransactions, false);
  assert.equal(normalized.walletRequired, false);
  assert.equal(normalized.fundsMoved, false);
  assert.equal(normalized.tradingVaultMutation, false);
  assert.deepEqual(normalized.orders, []);
});

test('normalizeOpenOrdersPanelFixture rejects unsafe permission overrides', () => {
  const mockOrder = Object.freeze({
    orderHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    marketId: 'WQUAI-WQI',
    side: 'sell',
    price: '5.01',
    amount: '200',
    remainingAmount: '200',
    status: 'open',
  });

  const normalized = normalizeOpenOrdersPanelFixture({
    orders: [mockOrder],
    permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
    fundsMoved: false,
    realQuaiTransactions: false,
  });

  assert.equal(normalized.orders.length, 1);
  assert.equal(normalized.orders[0].side, 'sell');
  assert.equal(normalized.fundsMoved, false);
  assert.equal(normalized.realQuaiTransactions, false);
  assert.deepEqual(normalized.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
});
