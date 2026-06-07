import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindMockCancelTriggerWithOrderStream } from '../src/cancel-stream-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const NONCE_MANAGER_NOTE = 'matcher-local-cancel-only-on-chain-nonce-unchanged';
const CUSTODY_NOTE = 'non-custodial-no-withdrawal-authority';

const withApiServer = async (callback) => {
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

const waitFor = async (predicate, label) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`timed out waiting for ${label}`);
};

const createMountFixture = () => {
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
    innerHTML: '',
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    querySelector(selector) {
      if (selector === '[data-qdx-cancel-status]') {
        return statusNode;
      }
      return null;
    },
  };

  return { mount, listeners, statusNode, button };
};

test('local API + terminal UI cancel stream smoke wires button click to rendered matcher-local order cancellation', async () => {
  await withApiServer(async (baseUrl) => {
    const { mount, listeners, statusNode, button } = createMountFixture();
    const fetchCalls = [];
    const streamFixtures = [];
    const cancelResults = [];
    const streamErrors = [];
    const cancelErrors = [];

    const countedFetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), method: options.method ?? 'GET' });
      return fetch(url, options);
    };

    const binding = bindMockCancelTriggerWithOrderStream({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      WebSocketImpl: WebSocket,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onCancel: (result) => cancelResults.push(result),
      onCancelError: (error) => cancelErrors.push(error),
      onStreamError: (error) => streamErrors.push(error),
      onStreamUpdate: (fixture) => streamFixtures.push(fixture),
    });

    try {
      await waitFor(
        () => streamFixtures.some((fixture) => fixture.orderStream?.streamEvent?.reason === undefined),
        'initial private orders stream snapshot before cancellation',
      );

      assert.equal(listeners.has('click'), true);
      assert.deepEqual(streamErrors, []);
      assert.deepEqual(cancelErrors, []);
      assert.equal(mount.dataset.qdxLiveOrdersStream, 'orders');

      const clickResult = listeners.get('click')({
        target: button,
        preventDefault() {},
      });
      await clickResult;

      await waitFor(
        () => streamFixtures.some((fixture) => fixture.orderStream?.streamEvent?.reason === 'matcher_local_order_cancelled'),
        'rendered matcher-local cancellation stream update',
      );

      const postCalls = fetchCalls.filter((call) => call.method === 'POST' && new URL(call.url).pathname === '/v1/orders');
      const deleteCalls = fetchCalls.filter((call) => call.method === 'DELETE' && new URL(call.url).pathname.startsWith('/v1/orders/'));

      assert.equal(postCalls.length, 1);
      assert.equal(deleteCalls.length, 1);
      assert.equal(cancelResults.length, 1);
      assert.equal(cancelResults[0].order.orderHash, cancelResults[0].cancel.orderHash);
      assert.deepEqual(cancelResults[0].fills, []);
      assert.equal(cancelResults[0].cancel.cancelledCount, 1);
      assert.equal(cancelResults[0].cancel.nonceManager, NONCE_MANAGER_NOTE);
      assert.deepEqual(cancelResults[0].cancel.permissions, ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.match(cancelResults[0].safetyNotice, /no real Quai tx\/explorer\/funds moved/i);

      const renderedCancelFixture = streamFixtures.find(
        (fixture) => fixture.orderStream?.streamEvent?.reason === 'matcher_local_order_cancelled',
      );

      assert.ok(renderedCancelFixture);
      assert.equal(renderedCancelFixture.orderStream.custody, CUSTODY_NOTE);
      assert.deepEqual(renderedCancelFixture.orderStream.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.deepEqual(renderedCancelFixture.orderStream.cancellationPermissions, ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.equal(renderedCancelFixture.orderStream.nonceManager, NONCE_MANAGER_NOTE);
      assert.deepEqual(renderedCancelFixture.orderStream.cancelledOrderHashes, [cancelResults[0].cancel.orderHash]);
      assert.equal(renderedCancelFixture.orders[0].orderHash, cancelResults[0].cancel.orderHash);
      assert.equal(renderedCancelFixture.orders[0].status, 'cancelled');
      assert.equal(renderedCancelFixture.orders[0].remainingAmount, '0');
      assert.equal(renderedCancelFixture.orders[0].nonceCancellation, 'not-implied-matcher-local-only');
      assert.equal(Object.hasOwn(renderedCancelFixture.orders[0], 'createdAt'), false);

      const streamEvent = renderedCancelFixture.orderStream.streamEvent;
      assert.equal(Object.hasOwn(streamEvent, 'fills'), false);
      assert.equal(Object.hasOwn(streamEvent, 'proofs'), false);
      assert.equal(Object.hasOwn(streamEvent, 'settlements'), false);
      assert.match(renderedCancelFixture.orderStream.message, /does not cancel the on-chain nonce/i);
      assert.match(renderedCancelFixture.orderStream.safetyNotice, /no real Quai transaction, no explorer URL, no funds moved/i);

      assert.equal(mount.dataset.qdxMockCancelTrigger, 'cancelled');
      assert.equal(mount.dataset.qdxLiveOrdersStream, 'orders');
      assert.match(statusNode.textContent, /matcher-local cancelled/i);
      assert.match(statusNode.textContent, /does not cancel on-chain nonce/i);
      assert.match(mount.innerHTML, /live orders stream/i);
      assert.match(mount.innerHTML, /matcher_local_order_cancelled/i);
      assert.match(mount.innerHTML, /NO_WITHDRAW, NO_ADMIN/i);
      assert.match(mount.innerHTML, /matcher-local-cancel-only-on-chain-nonce-unchanged/i);
    } finally {
      binding.close();
    }
  });
});
