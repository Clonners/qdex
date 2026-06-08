import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindDelegateKeyPrepareTriggerWithLocalApiSmoke } from '../src/delegate-key-prepare-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const DELEGATE_KEY_SOURCE = 'delegate-key-owner-signed-prepare-boundary';
const DELEGATE_KEY_CUSTODY = 'non-custodial-no-withdrawal-authority';
const OWNER_AUTHORIZATION = 'owner-wallet-signature-required';
const DELEGATE_AUTHORITY = 'trade-only-no-withdraw-no-admin';
const APPROVAL_GATE = 'explicit-approval-required-before-owner-wallet-signing-or-live-registry-mutation';

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
  const registerStatusNode = { textContent: '', dataset: {} };
  const revokeStatusNode = { textContent: '', dataset: {} };
  const registerButton = createButton('[data-qdx-delegate-key-prepare-register]');
  const revokeButton = createButton('[data-qdx-delegate-key-prepare-revoke]');

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
      if (selector === '[data-qdx-delegate-key-register-status]') return registerStatusNode;
      if (selector === '[data-qdx-delegate-key-revoke-status]') return revokeStatusNode;
      return null;
    },
  };

  return { mount, listeners, registerStatusNode, revokeStatusNode, registerButton, revokeButton };
};

test('local API + terminal UI delegate/API key prepare smoke clicks register and revoke buttons against createApiServer', async () => {
  await withApiServer(async (baseUrl) => {
    const {
      mount,
      listeners,
      registerStatusNode,
      revokeStatusNode,
      registerButton,
      revokeButton,
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

    const binding = bindDelegateKeyPrepareTriggerWithLocalApiSmoke({
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

      await listeners.get('click')({ target: registerButton, preventDefault() {} });
      await listeners.get('click')({ target: revokeButton, preventDefault() {} });

      assert.deepEqual(prepareErrors, []);
      assert.equal(fetchCalls.length, 2);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['POST', '/v1/delegate-keys'],
          ['DELETE', '/v1/delegate-keys/bot-mm-1'],
        ],
      );

      const [registerCall, revokeCall] = fetchCalls;
      assert.equal(registerCall.body.owner, '0x1111111111111111111111111111111111111111');
      assert.equal(registerCall.body.delegate, '0x3333333333333333333333333333333333333333');
      assert.deepEqual(registerCall.body.allowedMarkets, ['QI-QUAI']);
      assert.equal(registerCall.body.maxNotional, '1000');
      assert.deepEqual(registerCall.body.permissions, ['PLACE_ORDER', 'CANCEL_ORDER', 'CANCEL_ALL', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.equal(registerCall.body.requestMode, 'prepare-only-owner-signed-delegate-key-boundary');
      assert.equal(registerCall.body.ownerAuthorizationRef, 'owner-wallet-signature-required-not-created');
      assert.equal(revokeCall.body.keyId, 'bot-mm-1');
      assert.equal(revokeCall.body.ownerAuthorizationRef, 'owner-wallet-signature-required-not-created');

      for (const call of fetchCalls) {
        assert.equal(Object.hasOwn(call.body, 'walletPrivateKey'), false);
        assert.equal(Object.hasOwn(call.body, 'rpcUrl'), false);
        assert.equal(Object.hasOwn(call.body, 'signature'), false);
        assert.equal(Object.hasOwn(call.body, 'txHash'), false);
      }

      assert.equal(prepareResults.length, 2);
      assert.equal(renderedFixtures.length, 2);
      assert.deepEqual(
        prepareResults.map((result) => [result.httpStatus, result.body.operation]),
        [
          [501, 'register_delegate_key'],
          [501, 'revoke_delegate_key'],
        ],
      );

      for (const { body } of prepareResults) {
        assert.equal(body.source, DELEGATE_KEY_SOURCE);
        assert.equal(body.custody, DELEGATE_KEY_CUSTODY);
        assert.equal(body.operationStatus, 'prepare-only-owner-signed-required');
        assert.equal(body.ownerAuthorization, OWNER_AUTHORIZATION);
        assert.equal(body.delegateAuthority, DELEGATE_AUTHORITY);
        assert.deepEqual(body.requiredFields, ['delegate', 'expiresAt', 'allowedMarkets', 'maxNotional', 'permissions']);
        assert.equal(body.delegateCanWithdraw, false);
        assert.equal(body.delegateCanAdmin, false);
        assert.equal(body.realQuaiTransactions, false);
        assert.equal(body.walletRequired, false);
        assert.equal(body.fundsMoved, false);
        assert.equal(body.tradingVaultMutation, false);
        assert.equal(body.approvalGate, APPROVAL_GATE);
        assert.ok(body.permissions.includes('NO_WITHDRAW'));
        assert.ok(body.permissions.includes('NO_ADMIN'));
        assert.doesNotMatch(body.message, /wallet loaded|signature created|transaction submitted|funds moved/i);
        assert.match(body.message, /not wired to wallet loading, signing, broadcast, deploy, transaction helpers, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement/i);
      }

      assert.equal(mount.dataset.qdxDelegateKeyPrepareSmoke, 'prepare-only');
      assert.equal(mount.dataset.qdxDelegateKeyPrepareSmokeOperation, 'revoke_delegate_key');
      assert.equal(mount.dataset.qdxDelegateKeyPrepareSmokeHttpStatus, '501');
      assert.equal(mount.dataset.qdxDelegateKeyPrepareTrigger, 'revoke-prepare-only');
      assert.equal(registerStatusNode.dataset.qdxDelegateKeyRegisterStatus, 'prepare-only');
      assert.equal(revokeStatusNode.dataset.qdxDelegateKeyRevokeStatus, 'prepare-only');
      assert.match(registerStatusNode.textContent, /register delegate\/API key prepare-only boundary returned HTTP 501/i);
      assert.match(revokeStatusNode.textContent, /revoke delegate\/API key prepare-only boundary returned HTTP 501/i);

      const latestFixture = renderedFixtures.at(-1);
      assert.equal(latestFixture.delegateKeyOperation.httpStatus, 501);
      assert.equal(latestFixture.delegateKeyOperation.operation, 'revoke_delegate_key');
      assert.equal(latestFixture.delegateKeyOperation.source, DELEGATE_KEY_SOURCE);
      assert.equal(latestFixture.delegateKeyOperation.delegateCanWithdraw, false);
      assert.equal(latestFixture.delegateKeyOperation.delegateCanAdmin, false);
      assert.equal(latestFixture.delegateKeyOperation.fundsMoved, false);
      assert.equal(latestFixture.delegateKeyOperation.tradingVaultMutation, false);
      assert.match(mount.innerHTML, /prepare-only delegate\/API key/i);
      assert.match(mount.innerHTML, /delegate-key-owner-signed-prepare-boundary/i);
      assert.match(mount.innerHTML, /owner-wallet-signature-required/i);
      assert.match(mount.innerHTML, /NO_WITHDRAW, NO_ADMIN/i);
      assert.match(mount.innerHTML, /no wallet is loaded/i);
      assert.match(mount.innerHTML, /not wired to wallet loading, signing, broadcast, deploy, transaction helpers, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement/i);
    } finally {
      binding.close();
    }

    assert.equal(listeners.has('click'), false);
  });
});
