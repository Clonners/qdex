import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bindVaultPrepareTrigger,
  buildVaultPrepareUrl,
  createDefaultVaultPrepareRequest,
  prepareVaultOperation,
} from '../src/vault-prepare-trigger.js';

const makeJsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() {
    return body;
  },
});

const vaultPrepareEnvelope = (operation) => Object.freeze({
  error: `owner_wallet_vault_${operation}_not_implemented`,
  source: 'owner-wallet-vault-operation-placeholder',
  custody: 'non-custodial-contract-vault',
  vaultOperation: operation,
  operationStatus: 'prepare-only-not-implemented',
  ownerAuthorization: 'owner-wallet-required',
  permissions: Object.freeze(['NO_WITHDRAW', 'NO_ADMIN']),
  delegateAuthority: 'delegates-cannot-deposit-or-withdraw',
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  approvalGate: 'explicit-approval-required-before-wallet-signing-or-quai-broadcast',
  safety: Object.freeze({
    noWalletLoading: true,
    noRpcUrlAccess: true,
    noSigning: true,
    noBroadcast: true,
    noDeploys: true,
    noTransactionSubmission: true,
    noFundsMovement: true,
    noDelegateWithdrawalAuthority: true,
    noAdminWithdrawalAuthority: true,
    notice: 'Prepare-only owner-wallet TradingVault boundary: no wallet is loaded, no signature is created, no RPC URL is read, no transaction is submitted, and no funds move.',
  }),
  message: `TradingVault ${operation} is owner-wallet-only and not implemented in local mock mode; this prepare-only endpoint does not load wallets, sign, broadcast, submit transactions, mutate TradingVault, or move funds.`,
});

test('buildVaultPrepareUrl targets prepare-only owner-wallet vault endpoints', () => {
  assert.equal(
    buildVaultPrepareUrl({ baseUrl: 'http://127.0.0.1:8787/app', operation: 'deposit' }),
    'http://127.0.0.1:8787/v1/vault/deposits/prepare',
  );
  assert.equal(
    buildVaultPrepareUrl({ baseUrl: 'https://dex.local:9443', operation: 'withdrawal' }),
    'https://dex.local:9443/v1/vault/withdrawals/prepare',
  );
});

test('createDefaultVaultPrepareRequest builds local-only deterministic prepare payloads without wallet authority', () => {
  const deposit = createDefaultVaultPrepareRequest('deposit');
  const withdrawal = createDefaultVaultPrepareRequest('withdrawal');

  assert.deepEqual(deposit, {
    owner: '0x1111111111111111111111111111111111111111',
    assetSymbol: 'WQI',
    amount: '10',
    chainId: 0,
    vaultContractRef: 'local-only-not-deployed',
    requestMode: 'prepare-only-owner-wallet-boundary',
  });
  assert.equal(withdrawal.assetSymbol, 'WQUAI');
  assert.equal(withdrawal.amount, '1');
  assert.equal(Object.hasOwn(deposit, 'privateKey'), false);
  assert.equal(Object.hasOwn(deposit, 'rpcUrl'), false);
  assert.equal(Object.hasOwn(deposit, 'signature'), false);
});

test('prepareVaultOperation treats the intentional HTTP 501 as a prepare-only boundary response', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return makeJsonResponse(501, vaultPrepareEnvelope('deposit'));
  };

  const result = await prepareVaultOperation({
    baseUrl: 'http://127.0.0.1:8787',
    operation: 'deposit',
    request: createDefaultVaultPrepareRequest('deposit'),
    fetchImpl,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:8787/v1/vault/deposits/prepare');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['content-type'], 'application/json');
  assert.equal(calls[0].options.headers.accept, 'application/json');
  assert.equal(JSON.parse(calls[0].options.body).requestMode, 'prepare-only-owner-wallet-boundary');

  assert.equal(result.httpStatus, 501);
  assert.equal(result.body.vaultOperation, 'deposit');
  assert.equal(result.body.operationStatus, 'prepare-only-not-implemented');
  assert.equal(result.body.ownerAuthorization, 'owner-wallet-required');
  assert.equal(result.body.delegateAuthority, 'delegates-cannot-deposit-or-withdraw');
  assert.deepEqual(result.body.permissions, ['NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(result.body.realQuaiTransactions, false);
  assert.equal(result.body.walletRequired, false);
  assert.equal(result.body.fundsMoved, false);
  assert.equal(result.body.tradingVaultMutation, false);
  assert.equal(result.body.safety.noWalletLoading, true);
  assert.equal(result.body.safety.noRpcUrlAccess, true);
  assert.equal(result.body.safety.noSigning, true);
  assert.equal(result.body.safety.noBroadcast, true);
  assert.equal(result.body.safety.noDeploys, true);
  assert.equal(result.body.safety.noTransactionSubmission, true);
  assert.equal(result.body.safety.noFundsMovement, true);
  assert.equal(result.body.safety.noDelegateWithdrawalAuthority, true);
  assert.equal(result.body.safety.noAdminWithdrawalAuthority, true);
  assert.match(result.body.safety.notice, /no wallet is loaded/i);
});

test('bindVaultPrepareTrigger renders deposit prepare boundary without wallet or funds behavior', async () => {
  const listeners = new Map();
  const statusNode = { textContent: '', dataset: {} };
  const button = {
    disabled: false,
    dataset: { qdxVaultPrepareDeposit: '' },
    matches(selector) {
      return selector === '[data-qdx-vault-prepare-deposit]';
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
      if (selector === '[data-qdx-vault-deposit-status]') return statusNode;
      return null;
    },
  };
  const fetchImpl = async () => makeJsonResponse(501, vaultPrepareEnvelope('deposit'));
  const rendered = [];
  const completed = [];

  const binding = bindVaultPrepareTrigger({
    mount,
    baseUrl: 'http://127.0.0.1:8787',
    fetchImpl,
    render: (fixture) => {
      rendered.push(fixture);
      return `${fixture.vaultOperation.vaultOperation} ${fixture.vaultOperation.httpStatus} ${fixture.vaultOperation.safety.notice}`;
    },
    onPrepare: (result) => completed.push(result),
  });

  const clickPromise = listeners.get('click')({ target: button, preventDefault() {} });
  await clickPromise;

  assert.equal(button.disabled, false);
  assert.equal(mount.dataset.qdxVaultPrepareTrigger, 'deposit-prepare-only');
  assert.match(statusNode.textContent, /deposit prepare-only boundary/i);
  assert.match(statusNode.textContent, /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds/i);
  assert.equal(statusNode.dataset.qdxVaultDepositStatus, 'prepare-only');
  assert.equal(completed.length, 1);
  assert.equal(completed[0].httpStatus, 501);
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].vaultOperation.vaultOperation, 'deposit');
  assert.equal(rendered[0].vaultOperation.walletRequired, false);
  assert.equal(rendered[0].vaultOperation.fundsMoved, false);
  assert.equal(rendered[0].vaultOperation.tradingVaultMutation, false);
  assert.match(mount.innerHTML, /no wallet is loaded/i);

  binding.close();
  assert.equal(listeners.has('click'), false);
});
