import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindNonceCancelPrepareTriggerWithLocalApiSmoke } from '../src/nonce-cancel-prepare-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const NONCE_CANCEL_SOURCE = 'owner-signed-nonce-cancel-placeholder';
const NONCE_CANCEL_CUSTODY = 'non-custodial';
const NONCE_MANAGER = 'owner-signed-required';
const APPROVAL_GATE = 'explicit-approval-required-before-wallet-signing-or-quai-broadcast';

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

const createButton = (selector) => ({
  disabled: false,
  matches(candidate) {
    return candidate === selector;
  },
  closest(candidate) {
    return this.matches(candidate) ? this : null;
  },
});

const createMountFixture = () => {
  const listeners = new Map();
  const cancelStatusNode = { textContent: '', dataset: {} };
  const cancelRangeStatusNode = { textContent: '', dataset: {} };
  const cancelButton = createButton('[data-qdx-nonce-cancel-prepare]');
  const cancelRangeButton = createButton('[data-qdx-nonce-cancel-range-prepare]');

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
      if (selector === '[data-qdx-nonce-cancel-status]') return cancelStatusNode;
      if (selector === '[data-qdx-nonce-cancel-range-status]') return cancelRangeStatusNode;
      return null;
    },
  };

  return { mount, listeners, cancelStatusNode, cancelRangeStatusNode, cancelButton, cancelRangeButton };
};

test('local API + terminal UI nonce cancel prepare smoke clicks cancel and cancel-range buttons against createApiServer', async () => {
  await withApiServer(async (baseUrl) => {
    const {
      mount,
      listeners,
      cancelStatusNode,
      cancelRangeStatusNode,
      cancelButton,
      cancelRangeButton,
    } = createMountFixture();
    const fetchCalls = [];
    const prepareResults = [];
    const renderedFixtures = [];
    const prepareErrors = [];

    const countedFetch = async (url, options = {}) => {
      fetchCalls.push({
        url: String(url),
        method: options.method ?? 'GET',
        body: options.body === undefined ? null : JSON.parse(options.body),
      });
      return fetch(url, options);
    };

    const binding = bindNonceCancelPrepareTriggerWithLocalApiSmoke({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      baseFixture: mockVerticalSliceFixture,
      render: (fixture) => {
        renderedFixtures.push(fixture);
        return renderTradeProofPanel(fixture);
      },
      onPrepare: (result) => prepareResults.push(result),
      onError: (error) => prepareErrors.push(error),
    });

    try {
      assert.equal(listeners.has('click'), true);

      await listeners.get('click')({ target: cancelButton, preventDefault() {} });
      await listeners.get('click')({ target: cancelRangeButton, preventDefault() {} });

      assert.deepEqual(prepareErrors, []);
      assert.equal(fetchCalls.length, 2);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['POST', '/v1/nonces/cancel'],
          ['POST', '/v1/nonces/cancel'],
        ],
      );

      for (const call of fetchCalls) {
        assert.equal(call.body.owner, '0x1111111111111111111111111111111111111111');
        assert.equal(call.body.chainId, 0);
        assert.equal(call.body.nonceManagerContract, 'local-only-not-deployed');
        assert.equal(call.body.requestMode, 'prepare-only-owner-signed-boundary');
        assert.equal(Object.hasOwn(call.body, 'privateKey'), false);
        assert.equal(Object.hasOwn(call.body, 'rpcUrl'), false);
        assert.equal(Object.hasOwn(call.body, 'txHash'), false);
        assert.equal(Object.hasOwn(call.body, 'fundsMoved'), false);
      }

      assert.equal(prepareResults.length, 2);
      assert.equal(renderedFixtures.length, 2);
      assert.deepEqual(
        prepareResults.map((result) => result.httpStatus),
        [501, 501],
      );

      for (const { body } of prepareResults) {
        assert.equal(body.error, 'owner_signed_nonce_cancel_not_implemented');
        assert.equal(body.source, NONCE_CANCEL_SOURCE);
        assert.equal(body.custody, NONCE_CANCEL_CUSTODY);
        assert.equal(body.nonceManager, NONCE_MANAGER);
        assert.deepEqual(body.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
        assert.equal(body.realQuaiTransactions, false);
        assert.equal(body.walletRequired, false);
        assert.equal(body.approvalGate, APPROVAL_GATE);
        assert.match(body.message, /does not mutate on-chain NonceManager nonces/i);
      }

      assert.equal(mount.dataset.qdxNonceCancelPrepareSmoke, 'prepare-only');
      assert.equal(mount.dataset.qdxNonceCancelPrepareSmokeHttpStatus, '501');
      assert.equal(cancelStatusNode.dataset.qdxNonceCancelStatus, 'prepare-only');
      assert.equal(cancelRangeStatusNode.dataset.qdxNonceCancelRangeStatus, 'prepare-only');
      assert.match(cancelStatusNode.textContent, /cancel nonce prepare-only boundary returned HTTP 501/i);
      assert.match(cancelRangeStatusNode.textContent, /cancel nonce range prepare-only boundary returned HTTP 501/i);

      const latestFixture = renderedFixtures.at(-1);
      assert.equal(latestFixture.nonceCancelOperation.httpStatus, 501);
      assert.equal(latestFixture.nonceCancelOperation.source, NONCE_CANCEL_SOURCE);
      assert.equal(latestFixture.nonceCancelOperation.realQuaiTransactions, false);
      assert.equal(latestFixture.nonceCancelOperation.walletRequired, false);
    } finally {
      binding.close();
    }

    assert.equal(listeners.has('click'), false);
  });
});
