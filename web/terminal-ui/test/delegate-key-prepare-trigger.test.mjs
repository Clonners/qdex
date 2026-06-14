import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bindDelegateKeyPrepareTrigger,
  buildDelegateKeyPrepareUrl,
  createDefaultDelegateKeyPrepareRequest,
  prepareDelegateKeyOperation,
} from '../src/delegate-key-prepare-trigger.js';

const makeJsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() {
    return body;
  },
});

const delegateKeyPrepareEnvelope = (operation, keyId = null) => Object.freeze({
  error: operation === 'revoke_delegate_key'
    ? 'delegate_key_revocation_not_implemented'
    : 'delegate_key_registration_not_implemented',
  operation,
  ...(keyId === null ? {} : { keyId }),
  source: 'delegate-key-owner-signed-prepare-boundary',
  custody: 'non-custodial-no-withdrawal-authority',
  operationStatus: 'prepare-only-owner-signed-required',
  ownerAuthorization: 'owner-wallet-signature-required',
  delegateAuthority: 'trade-only-no-withdraw-no-admin',
  requiredFields: Object.freeze(['delegate', 'expiresAt', 'allowedMarkets', 'maxNotional', 'permissions']),
  delegateCanWithdraw: false,
  delegateCanAdmin: false,
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  approvalGate: 'explicit-approval-required-before-owner-wallet-signing-or-live-registry-mutation',
  permissions: operation === 'revoke_delegate_key'
    ? Object.freeze(['NO_WITHDRAW', 'NO_ADMIN'])
    : Object.freeze(['PLACE_ORDER', 'CANCEL_ORDER', 'CANCEL_ALL', 'NO_WITHDRAW', 'NO_ADMIN']),
  message: operation === 'revoke_delegate_key'
    ? 'No delegate key is revoked in local prepare-only mode; owner-signed revocation is not wired to wallet loading, signing, broadcast, deploy, transaction helpers, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement.'
    : 'No delegate key is registered in local prepare-only mode; owner-signed registration is not wired to wallet loading, signing, broadcast, deploy, transaction helpers, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement.',
});

test('buildDelegateKeyPrepareUrl targets owner-signed delegate/API key prepare endpoints', () => {
  assert.equal(
    buildDelegateKeyPrepareUrl({ baseUrl: 'http://127.0.0.1:8787/app', operation: 'register' }),
    'http://127.0.0.1:8787/v1/delegate-keys',
  );
  assert.equal(
    buildDelegateKeyPrepareUrl({ baseUrl: 'https://dex.local:9443/ui', operation: 'revoke', keyId: 'bot-mm-1' }),
    'https://dex.local:9443/v1/delegate-keys/bot-mm-1',
  );
});

test('createDefaultDelegateKeyPrepareRequest builds redacted owner-signed placeholders without wallet or RPC material', () => {
  const register = createDefaultDelegateKeyPrepareRequest('register');
  const revoke = createDefaultDelegateKeyPrepareRequest('revoke', { keyId: 'bot-mm-1' });

  assert.deepEqual(register, {
    keyId: 'bot-mm-1',
    owner: '0x1111111111111111111111111111111111111111',
    delegate: '0x3333333333333333333333333333333333333333',
    allowedMarkets: ['WQUAI-WQI'],
    maxNotional: '1000',
    permissions: ['PLACE_ORDER', 'CANCEL_ORDER', 'CANCEL_ALL', 'NO_WITHDRAW', 'NO_ADMIN'],
    expiresAt: 1780003600,
    requestMode: 'prepare-only-owner-signed-delegate-key-boundary',
    ownerAuthorizationRef: 'owner-wallet-signature-required-not-created',
  });
  assert.deepEqual(revoke, {
    keyId: 'bot-mm-1',
    owner: '0x1111111111111111111111111111111111111111',
    requestMode: 'prepare-only-owner-signed-delegate-key-boundary',
    ownerAuthorizationRef: 'owner-wallet-signature-required-not-created',
  });

  for (const payload of [register, revoke]) {
    assert.equal(Object.hasOwn(payload, 'walletPrivateKey'), false);
    assert.equal(Object.hasOwn(payload, 'rpcUrl'), false);
    assert.equal(Object.hasOwn(payload, 'signature'), false);
  }
});

test('prepareDelegateKeyOperation treats intentional HTTP 501 as a displayable owner-signed boundary response', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return makeJsonResponse(501, delegateKeyPrepareEnvelope('register_delegate_key'));
  };

  const result = await prepareDelegateKeyOperation({
    baseUrl: 'http://127.0.0.1:8787',
    operation: 'register',
    request: createDefaultDelegateKeyPrepareRequest('register'),
    fetchImpl,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:8787/v1/delegate-keys');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['content-type'], 'application/json');
  assert.equal(calls[0].options.headers.accept, 'application/json');
  assert.equal(JSON.parse(calls[0].options.body).requestMode, 'prepare-only-owner-signed-delegate-key-boundary');

  assert.equal(result.httpStatus, 501);
  assert.equal(result.body.error, 'delegate_key_registration_not_implemented');
  assert.equal(result.body.source, 'delegate-key-owner-signed-prepare-boundary');
  assert.equal(result.body.operationStatus, 'prepare-only-owner-signed-required');
  assert.equal(result.body.ownerAuthorization, 'owner-wallet-signature-required');
  assert.deepEqual(result.body.permissions, ['PLACE_ORDER', 'CANCEL_ORDER', 'CANCEL_ALL', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(result.body.delegateCanWithdraw, false);
  assert.equal(result.body.delegateCanAdmin, false);
  assert.equal(result.body.realQuaiTransactions, false);
  assert.equal(result.body.walletRequired, false);
  assert.equal(result.body.fundsMoved, false);
  assert.equal(result.body.tradingVaultMutation, false);
  assert.match(result.body.message, /not wired to wallet loading, signing, broadcast, deploy, transaction helpers, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement/i);
});

test('prepareDelegateKeyOperation validates revoke placeholders as non-withdrawal owner-signed boundaries', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return makeJsonResponse(501, delegateKeyPrepareEnvelope('revoke_delegate_key', 'bot-mm-1'));
  };

  const result = await prepareDelegateKeyOperation({
    baseUrl: 'http://127.0.0.1:8787',
    operation: 'revoke',
    keyId: 'bot-mm-1',
    fetchImpl,
  });

  assert.equal(calls[0].url, 'http://127.0.0.1:8787/v1/delegate-keys/bot-mm-1');
  assert.equal(calls[0].options.method, 'DELETE');
  assert.equal(JSON.parse(calls[0].options.body).ownerAuthorizationRef, 'owner-wallet-signature-required-not-created');
  assert.equal(result.httpStatus, 501);
  assert.equal(result.body.error, 'delegate_key_revocation_not_implemented');
  assert.equal(result.body.operation, 'revoke_delegate_key');
  assert.equal(result.body.keyId, 'bot-mm-1');
  assert.deepEqual(result.body.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(result.body.delegateCanWithdraw, false);
  assert.equal(result.body.delegateCanAdmin, false);
  assert.equal(result.body.fundsMoved, false);
  assert.equal(result.body.tradingVaultMutation, false);
});

test('bindDelegateKeyPrepareTrigger renders register prepare boundary without wallet, registry mutation, or funds behavior', async () => {
  const listeners = new Map();
  const statusNode = { textContent: '', dataset: {} };
  const button = {
    disabled: false,
    matches(selector) {
      return selector === '[data-qdx-delegate-key-prepare-register]';
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
      if (selector === '[data-qdx-delegate-key-register-status]') return statusNode;
      return null;
    },
  };
  const fetchImpl = async () => makeJsonResponse(501, delegateKeyPrepareEnvelope('register_delegate_key'));
  const rendered = [];
  const completed = [];

  const binding = bindDelegateKeyPrepareTrigger({
    mount,
    baseUrl: 'http://127.0.0.1:8787',
    fetchImpl,
    render: (fixture) => {
      rendered.push(fixture);
      return `${fixture.delegateKeyOperation.operation} ${fixture.delegateKeyOperation.httpStatus} ${fixture.delegateKeyOperation.ownerAuthorization}`;
    },
    onPrepare: (result) => completed.push(result),
  });

  await listeners.get('click')({ target: button, preventDefault() {} });

  assert.equal(button.disabled, false);
  assert.equal(mount.dataset.qdxDelegateKeyPrepareTrigger, 'register-prepare-only');
  assert.match(statusNode.textContent, /register delegate\/API key prepare-only boundary returned HTTP 501/i);
  assert.match(statusNode.textContent, /owner-wallet-signature-required/i);
  assert.match(statusNode.textContent, /NO_WITHDRAW\/NO_ADMIN/i);
  assert.match(statusNode.textContent, /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds/i);
  assert.equal(statusNode.dataset.qdxDelegateKeyRegisterStatus, 'prepare-only');
  assert.equal(completed.length, 1);
  assert.equal(completed[0].httpStatus, 501);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].delegateKeyOperation.operation, 'register_delegate_key');
  assert.equal(rendered[0].delegateKeyOperation.delegateCanWithdraw, false);
  assert.equal(rendered[0].delegateKeyOperation.delegateCanAdmin, false);
  assert.equal(rendered[0].delegateKeyOperation.walletRequired, false);
  assert.equal(rendered[0].delegateKeyOperation.fundsMoved, false);
  assert.equal(rendered[0].delegateKeyOperation.tradingVaultMutation, false);
  assert.match(mount.innerHTML, /owner-wallet-signature-required/i);

  binding.close();
  assert.equal(listeners.has('click'), false);
});
