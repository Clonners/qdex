import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindVaultPrepareTriggerWithLocalApiSmoke } from '../src/vault-prepare-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const VAULT_SOURCE = 'owner-wallet-vault-operation-placeholder';
const VAULT_CUSTODY = 'non-custodial-contract-vault';
const OWNER_AUTHORIZATION = 'owner-wallet-required';
const DELEGATE_AUTHORITY = 'delegates-cannot-deposit-or-withdraw';
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
  const depositStatusNode = { textContent: '', dataset: {} };
  const withdrawalStatusNode = { textContent: '', dataset: {} };
  const depositButton = createButton('[data-qdx-vault-prepare-deposit]');
  const withdrawalButton = createButton('[data-qdx-vault-prepare-withdraw]');

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
      if (selector === '[data-qdx-vault-deposit-status]') return depositStatusNode;
      if (selector === '[data-qdx-vault-withdraw-status]') return withdrawalStatusNode;
      return null;
    },
  };

  return { mount, listeners, depositStatusNode, withdrawalStatusNode, depositButton, withdrawalButton };
};

test('local API + terminal UI vault prepare smoke clicks deposit and withdrawal buttons against createApiServer', async () => {
  await withApiServer(async (baseUrl) => {
    const {
      mount,
      listeners,
      depositStatusNode,
      withdrawalStatusNode,
      depositButton,
      withdrawalButton,
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

    const binding = bindVaultPrepareTriggerWithLocalApiSmoke({
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

      await listeners.get('click')({ target: depositButton, preventDefault() {} });
      await listeners.get('click')({ target: withdrawalButton, preventDefault() {} });

      assert.deepEqual(prepareErrors, []);
      assert.equal(fetchCalls.length, 2);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['POST', '/v1/vault/deposits/prepare'],
          ['POST', '/v1/vault/withdrawals/prepare'],
        ],
      );

      for (const call of fetchCalls) {
        assert.equal(call.body.owner, '0x1111111111111111111111111111111111111111');
        assert.equal(call.body.chainId, 0);
        assert.equal(call.body.vaultContractRef, 'local-only-not-deployed');
        assert.equal(call.body.requestMode, 'prepare-only-owner-wallet-boundary');
        assert.equal(Object.hasOwn(call.body, 'privateKey'), false);
        assert.equal(Object.hasOwn(call.body, 'rpcUrl'), false);
        assert.equal(Object.hasOwn(call.body, 'signature'), false);
        assert.equal(Object.hasOwn(call.body, 'txHash'), false);
      }

      assert.equal(prepareResults.length, 2);
      assert.equal(renderedFixtures.length, 2);
      assert.deepEqual(
        prepareResults.map((result) => [result.httpStatus, result.body.vaultOperation]),
        [
          [501, 'deposit'],
          [501, 'withdrawal'],
        ],
      );

      for (const { body } of prepareResults) {
        assert.equal(body.source, VAULT_SOURCE);
        assert.equal(body.custody, VAULT_CUSTODY);
        assert.equal(body.ownerAuthorization, OWNER_AUTHORIZATION);
        assert.equal(body.delegateAuthority, DELEGATE_AUTHORITY);
        assert.deepEqual(body.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
        assert.equal(body.realQuaiTransactions, false);
        assert.equal(body.walletRequired, false);
        assert.equal(body.fundsMoved, false);
        assert.equal(body.tradingVaultMutation, false);
        assert.equal(body.approvalGate, APPROVAL_GATE);
        assert.equal(body.safety.noWalletLoading, true);
        assert.equal(body.safety.noRpcUrlAccess, true);
        assert.equal(body.safety.noSigning, true);
        assert.equal(body.safety.noBroadcast, true);
        assert.equal(body.safety.noDeploys, true);
        assert.equal(body.safety.noTransactionSubmission, true);
        assert.equal(body.safety.noFundsMovement, true);
        assert.equal(body.safety.noDelegateWithdrawalAuthority, true);
        assert.equal(body.safety.noAdminWithdrawalAuthority, true);
        assert.match(body.safety.notice, /no wallet is loaded/i);
        assert.match(body.message, /does not load wallets, sign, broadcast, submit transactions, mutate TradingVault, or move funds/i);
      }

      assert.equal(mount.dataset.qdxVaultPrepareSmoke, 'prepare-only');
      assert.equal(mount.dataset.qdxVaultPrepareSmokeOperation, 'withdrawal');
      assert.equal(mount.dataset.qdxVaultPrepareSmokeHttpStatus, '501');
      assert.equal(mount.dataset.qdxVaultPrepareTrigger, 'withdrawal-prepare-only');
      assert.equal(depositStatusNode.dataset.qdxVaultDepositStatus, 'prepare-only');
      assert.equal(withdrawalStatusNode.dataset.qdxVaultWithdrawStatus, 'prepare-only');
      assert.match(depositStatusNode.textContent, /deposit prepare-only boundary returned HTTP 501/i);
      assert.match(withdrawalStatusNode.textContent, /withdrawal prepare-only boundary returned HTTP 501/i);

      const latestFixture = renderedFixtures.at(-1);
      assert.equal(latestFixture.vaultOperation.httpStatus, 501);
      assert.equal(latestFixture.vaultOperation.vaultOperation, 'withdrawal');
      assert.equal(latestFixture.vaultOperation.source, VAULT_SOURCE);
      assert.equal(latestFixture.vaultOperation.fundsMoved, false);
      assert.equal(latestFixture.vaultOperation.tradingVaultMutation, false);
      assert.match(mount.innerHTML, /prepare-only vault operation/i);
      assert.match(mount.innerHTML, /owner-wallet-vault-operation-placeholder/i);
      assert.match(mount.innerHTML, /delegates-cannot-deposit-or-withdraw/i);
      assert.match(mount.innerHTML, /NO_WITHDRAW, NO_ADMIN/i);
      assert.match(mount.innerHTML, /no wallet is loaded/i);
      assert.match(mount.innerHTML, /does not load wallets, sign, broadcast, submit transactions, mutate TradingVault, or move funds/i);
    } finally {
      binding.close();
    }

    assert.equal(listeners.has('click'), false);
  });
});
