import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bindMockCancelTrigger,
  buildOrderCancelUrl,
  createMockCancelableOrder,
  submitAndCancelMockOrder,
} from '../src/mock-cancel-trigger.js';

const CUSTODY_NOTE = 'non-custodial-no-withdrawal-authority';
const NONCE_MANAGER_NOTE = 'matcher-local-cancel-only-on-chain-nonce-unchanged';
const CANCELLATION_MESSAGE = 'Mock cancellation removes only matcher-open quantity and does not cancel the on-chain nonce; user nonce cancellation must be signed through NonceManager later.';
const ORDER_HASH = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

const makeJsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() {
    return body;
  },
});

const acceptedRestingOrder = Object.freeze({
  orderHash: ORDER_HASH,
  marketId: 'QI-QUAI',
  owner: '0x4444444444444444444444444444444444444444',
  delegate: '0x0000000000000000000000000000000000000000',
  side: 'sell',
  type: 'limit',
  amount: '125',
  price: '5',
  filledAmount: '0',
  remainingAmount: '125',
  status: 'open',
  custody: CUSTODY_NOTE,
  fills: [],
  source: 'mock-matching-engine',
  settlement: 'awaiting-cross',
});

const cancellationResponse = Object.freeze({
  cancelled: true,
  cancelledCount: 1,
  orderHash: ORDER_HASH,
  cancelledOrders: Object.freeze([
    Object.freeze({
      orderHash: ORDER_HASH,
      marketId: 'QI-QUAI',
      owner: '0x4444444444444444444444444444444444444444',
      delegate: '0x0000000000000000000000000000000000000000',
      side: 'sell',
      type: 'limit',
      amount: '125',
      price: '5',
      filledAmount: '0',
      remainingAmount: '0',
      status: 'cancelled',
      custody: CUSTODY_NOTE,
      cancelledAmount: '125',
      cancelReason: 'cancel_order',
      nonceCancellation: 'not-implied-matcher-local-only',
    }),
  ]),
  source: 'mock-matching-engine',
  custody: CUSTODY_NOTE,
  nonceManager: NONCE_MANAGER_NOTE,
  permissions: Object.freeze(['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']),
  message: CANCELLATION_MESSAGE,
});

test('createMockCancelableOrder builds a resting-only signed mock order with no withdrawal authority', () => {
  const order = createMockCancelableOrder();

  assert.equal(order.marketId, 'QI-QUAI');
  assert.equal(order.side, 'sell');
  assert.equal(order.type, 'limit');
  assert.equal(order.timeInForce, 'GTC');
  assert.equal(order.maxSlippageBps, 0);
  assert.equal(order.delegate, '0x0000000000000000000000000000000000000000');
  assert.equal(order.signature.scheme, 'mock');
  assert.equal(order.signature.signer, order.owner);
  assert.equal(order.chainId, 0);
  assert.equal(order.settlementContract, '0x2222222222222222222222222222222222222222');
  assert.equal(Object.hasOwn(order, 'withdrawalAuthority'), false);
  assert.equal(Object.hasOwn(order, 'admin'), false);
});

test('submitAndCancelMockOrder posts one resting order then deletes matcher-local quantity only', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });

    if (calls.length === 1) {
      return makeJsonResponse(201, acceptedRestingOrder);
    }

    return makeJsonResponse(200, cancellationResponse);
  };

  const result = await submitAndCancelMockOrder({
    baseUrl: 'http://127.0.0.1:8787',
    fetchImpl,
    order: createMockCancelableOrder({ amount: '125', nonce: '950' }),
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://127.0.0.1:8787/v1/orders');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(JSON.parse(calls[0].options.body).order.timeInForce, 'GTC');
  assert.equal(JSON.parse(calls[0].options.body).order.type, 'limit');
  assert.equal(calls[1].url, `http://127.0.0.1:8787/v1/orders/${ORDER_HASH}`);
  assert.equal(calls[1].options.method, 'DELETE');

  assert.equal(result.order.orderHash, ORDER_HASH);
  assert.deepEqual(result.order.fills, []);
  assert.equal(result.cancel.cancelled, true);
  assert.equal(result.cancel.source, 'mock-matching-engine');
  assert.equal(result.cancel.custody, CUSTODY_NOTE);
  assert.equal(result.cancel.nonceManager, NONCE_MANAGER_NOTE);
  assert.deepEqual(result.cancel.permissions, ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.match(result.cancel.message, /does not cancel the on-chain nonce/i);
  assert.equal(result.cancel.cancelledOrders[0].status, 'cancelled');
  assert.equal(result.cancel.cancelledOrders[0].remainingAmount, '0');
  assert.equal(result.cancel.cancelledOrders[0].nonceCancellation, 'not-implied-matcher-local-only');
  assert.equal(Object.hasOwn(result.cancel.cancelledOrders[0], 'createdAt'), false);
  assert.deepEqual(result.fills, []);
  assert.equal(result.custody, CUSTODY_NOTE);
  assert.match(result.safetyNotice, /no real Quai tx\/explorer\/funds moved/i);
});

test('bindMockCancelTrigger delegates browser clicks and reports matcher-local nonce safety', async () => {
  const listeners = new Map();
  const statusNode = { textContent: '', dataset: {} };
  const button = {
    disabled: false,
    dataset: { qdxTriggerCancel: '' },
    matches(selector) {
      return selector === '[data-qdx-trigger-cancel]';
    },
    closest(selector) {
      return this.matches(selector) ? this : null;
    },
  };
  const mount = {
    dataset: {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    querySelector(selector) {
      if (selector === '[data-qdx-cancel-status]') return statusNode;
      return null;
    },
  };
  const completed = [];
  const fetchImpl = async (_url, _options = {}) => {
    if (completed.length === 0 && statusNode.dataset.qdxCancelStatus !== 'cancelling') {
      return makeJsonResponse(201, acceptedRestingOrder);
    }

    return makeJsonResponse(200, cancellationResponse);
  };
  let fetchCount = 0;
  const countedFetch = async (url, options) => {
    fetchCount += 1;
    return fetchCount === 1
      ? makeJsonResponse(201, acceptedRestingOrder)
      : fetchImpl(url, options);
  };

  const binding = bindMockCancelTrigger({
    mount,
    baseUrl: 'http://127.0.0.1:8787',
    fetchImpl: countedFetch,
    onCancel: (result) => completed.push(result),
  });

  const clickPromise = listeners.get('click')({ target: button, preventDefault() {} });
  await clickPromise;

  assert.equal(button.disabled, false);
  assert.equal(mount.dataset.qdxMockCancelTrigger, 'cancelled');
  assert.match(statusNode.textContent, /matcher-local cancelled/i);
  assert.match(statusNode.textContent, /does not cancel on-chain nonce/i);
  assert.match(statusNode.textContent, /no real Quai tx\/explorer\/funds/i);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].cancel.cancelledOrders[0].nonceCancellation, 'not-implied-matcher-local-only');
  assert.deepEqual(completed[0].cancel.permissions, ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);

  binding.close();
  assert.equal(listeners.has('click'), false);
});

test('buildOrderCancelUrl normalizes any local API base URL to DELETE /v1/orders/:orderHash', () => {
  assert.equal(
    buildOrderCancelUrl({ baseUrl: 'http://127.0.0.1:8787/app', orderHash: ORDER_HASH }),
    `http://127.0.0.1:8787/v1/orders/${ORDER_HASH}`,
  );
  assert.equal(
    buildOrderCancelUrl({ baseUrl: 'https://dex.local:9443', orderHash: '0xabc' }),
    'https://dex.local:9443/v1/orders/0xabc',
  );
});
