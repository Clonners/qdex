import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindKeyboardShortcutHelpLocalApiSmoke } from '../src/keyboard-shortcuts-smoke-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const SMOKE_SOURCE = 'terminal-keyboard-shortcut-help-local-api-smoke';
const HELP_SOURCE = 'terminal-keyboard-shortcut-help';
const SAFE_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];
const EXPECTED_PREFLIGHT_CALLS = [
  ['GET', '/v1/markets'],
  ['GET', '/v1/tickers/WQUAI-WQI'],
  ['GET', '/v1/orderbook/WQUAI-WQI'],
  ['GET', '/v1/orders'],
  ['GET', '/v1/account'],
  ['POST', '/v1/vault/deposits/prepare'],
  ['POST', '/v1/vault/withdrawals/prepare'],
  ['POST', '/v1/delegate-keys'],
];

const repoRoot = new URL('../../../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

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

const createKeyboardShortcutMount = () => {
  const listeners = new Map();
  const statusNode = { textContent: '', dataset: {} };
  const panelNode = { dataset: {} };
  const mount = {
    dataset: {},
    innerHTML: renderTradeProofPanel(mockVerticalSliceFixture),
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    querySelector(selector) {
      if (selector === '[data-qdx-keyboard-shortcuts-panel]') return panelNode;
      if (selector === '[data-qdx-keyboard-shortcuts-status]') return statusNode;
      return null;
    },
  };

  return { listeners, mount, panelNode, statusNode };
};

const assertSafeSmokeEnvelope = (envelope) => {
  assert.equal(envelope.source, SMOKE_SOURCE);
  assert.equal(envelope.keyboardShortcutHelpSource, HELP_SOURCE);
  assert.equal(envelope.mode, 'local-api-precheck-help-only');
  assert.equal(envelope.dispatchMode, 'help-only-no-dispatch');
  assert.deepEqual(envelope.permissions, SAFE_PERMISSIONS);
  assert.equal(envelope.realQuaiTransactions, false);
  assert.equal(envelope.walletRequired, false);
  assert.equal(envelope.fundsMoved, false);
  assert.equal(envelope.tradingVaultMutation, false);
  assert.equal(envelope.marketRegistryMutation, false);
  assert.equal(envelope.delegateKeyRegistryMutation, false);
  assert.equal(envelope.nonceManagerMutation, false);
  assert.equal(envelope.delegateCanWithdraw, false);
  assert.equal(envelope.delegateCanAdmin, false);
  assert.match(envelope.safetyNotice, /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds behavior/i);
};

const dispatchKey = (listeners, key) => {
  const listener = listeners.get('keydown');
  assert.equal(typeof listener, 'function', 'keyboard shortcut smoke should attach a help-only keydown listener');
  const event = {
    key,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  listener(event);
  return event;
};

test('local API + terminal UI keyboard-shortcut help smoke prechecks safe surfaces without dispatching shortcut actions', async () => {
  await withApiServer(async (baseUrl) => {
    const { listeners, mount, statusNode } = createKeyboardShortcutMount();
    const fetchCalls = [];
    const smokeSnapshots = [];
    const previews = [];
    const errors = [];

    const countedFetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), method: options.method ?? 'GET' });
      return fetch(url, options);
    };

    const binding = await bindKeyboardShortcutHelpLocalApiSmoke({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      keyboardShortcuts: mockVerticalSliceFixture.keyboardShortcuts,
      onSmoke: (snapshot) => smokeSnapshots.push(snapshot),
      onHelpPreview: (preview, snapshot) => previews.push({ preview, snapshot }),
      onError: (error) => errors.push(error),
    });

    try {
      assert.deepEqual(errors, []);
      assert.equal(smokeSnapshots.length, 1);
      assertSafeSmokeEnvelope(smokeSnapshots[0]);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        EXPECTED_PREFLIGHT_CALLS,
      );
      assert.equal(fetchCalls.some((call) => call.method === 'POST' && new URL(call.url).pathname === '/v1/orders'), false);
      assert.equal(fetchCalls.some((call) => new URL(call.url).pathname === '/v1/orders/cancel-all'), false);
      assert.equal(fetchCalls.some((call) => call.method === 'DELETE'), false);

      assert.equal(mount.dataset.qdxKeyboardShortcutLocalApiSmoke, SMOKE_SOURCE);
      assert.equal(mount.dataset.qdxKeyboardShortcutDispatchMode, 'help-only-no-dispatch');
      assert.equal(mount.dataset.qdxKeyboardShortcutPermissions, 'READ_ONLY,NO_WITHDRAW,NO_ADMIN');
      assert.equal(mount.dataset.qdxKeyboardShortcutLocalApiSurfaces, EXPECTED_PREFLIGHT_CALLS.map(([method, path]) => `${method} ${path}`).join(','));
      assert.equal(statusNode.dataset.qdxKeyboardShortcutLocalApiSmoke, 'verified-help-only');
      assert.match(statusNode.textContent, /terminal-keyboard-shortcut-help-local-api-smoke/);
      assert.match(statusNode.textContent, /READ_ONLY\/NO_WITHDRAW\/NO_ADMIN/);
      assert.match(statusNode.textContent, /help-only-no-dispatch/);
      assert.match(statusNode.textContent, /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds behavior/i);

      const snapshot = binding.apiSnapshot;
      assertSafeSmokeEnvelope(snapshot);
      assert.equal(snapshot.precheckedSurfaces['/ search market'].httpStatus, 200);
      assert.equal(snapshot.precheckedSurfaces['/ search market'].source, 'market-list');
      assert.equal(snapshot.precheckedSurfaces['b buy preview'].source, 'mock-market-data');
      assert.equal(snapshot.precheckedSurfaces['s sell preview'].source, 'mock-orderbook');
      assert.equal(snapshot.precheckedSurfaces['c matcher-local cancel'].source, 'mock-order-projection');
      assert.equal(snapshot.precheckedSurfaces['o open orders'].source, 'mock-account-overview');
      assert.equal(snapshot.precheckedSurfaces['w owner-wallet deposit prepare boundary'].httpStatus, 501);
      assert.equal(snapshot.precheckedSurfaces['w owner-wallet deposit prepare boundary'].source, 'owner-wallet-vault-operation-placeholder');
      assert.equal(snapshot.precheckedSurfaces['w owner-wallet withdrawal prepare boundary'].httpStatus, 501);
      assert.equal(snapshot.precheckedSurfaces['w owner-wallet withdrawal prepare boundary'].source, 'owner-wallet-vault-operation-placeholder');
      assert.equal(snapshot.precheckedSurfaces[':api create-key bot-mm-1 prepare NO_WITHDRAW NO_ADMIN'].httpStatus, 501);
      assert.equal(snapshot.precheckedSurfaces[':api create-key bot-mm-1 prepare NO_WITHDRAW NO_ADMIN'].source, 'delegate-key-owner-signed-prepare-boundary');
      assert.equal(snapshot.previewOnlyHints[':mock cross'].dispatchMode, 'help-only-no-dispatch');
      assert.equal(snapshot.previewOnlyHints[':cancel all matcher-local'].nonceManagerMutation, false);

      const fetchCountAfterPrecheck = fetchCalls.length;
      const keyEvent = dispatchKey(listeners, 'w');
      assert.equal(keyEvent.defaultPrevented, false, 'help-only shortcut preview should not hijack default browser behavior');
      assert.equal(fetchCalls.length, fetchCountAfterPrecheck, 'keyboard help preview must not dispatch API calls after precheck');
      assert.equal(previews.length, 1);
      assert.equal(previews[0].preview.key, 'w');
      assert.equal(previews[0].preview.label, 'owner-wallet prepare boundaries');
      assert.equal(previews[0].preview.dispatchMode, 'help-only-no-dispatch');
      assert.equal(previews[0].snapshot.source, SMOKE_SOURCE);
      assert.equal(mount.dataset.qdxKeyboardShortcutLocalApiPreview, 'w owner-wallet prepare boundaries');
      assert.equal(statusNode.dataset.qdxKeyboardShortcutLocalApiSmoke, 'shortcut-help-only-preview');
      assert.match(statusNode.textContent, /POST \/v1\/vault\/deposits\/prepare/);
      assert.match(statusNode.textContent, /POST \/v1\/vault\/withdrawals\/prepare/);
      assert.match(statusNode.textContent, /HTTP 501/);
      assert.match(statusNode.textContent, /owner-wallet-vault-operation-placeholder/);
      assert.match(statusNode.textContent, /help-only-no-dispatch/);
      assert.match(statusNode.textContent, /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds behavior/i);

      dispatchKey(listeners, 'x');
      assert.equal(previews.length, 2);
      assert.equal(previews[1].preview.status, 'unsupported');
      assert.equal(mount.dataset.qdxKeyboardShortcutLocalApiPreview, 'unsupported');
      assert.equal(statusNode.dataset.qdxKeyboardShortcutLocalApiSmoke, 'unsupported-help-only-preview');
      assert.match(statusNode.textContent, /unsupported/);
      assert.match(statusNode.textContent, /blocked-no-dispatch/);
      assert.equal(fetchCalls.length, fetchCountAfterPrecheck, 'unsupported shortcut help must not dispatch API calls');
    } finally {
      binding.close();
    }

    assert.equal(listeners.has('keydown'), false, 'keyboard shortcut smoke close should remove the keydown listener');
  });
});

test('terminal UI docs, package check, app wiring, and campaign status mark keyboard-shortcut help smoke complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const appSource = await readText('web/terminal-ui/src/app.js');
  const renderSource = await readText('web/terminal-ui/src/render.js');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/keyboard-shortcuts-smoke-binding.js',
    'local API + terminal UI keyboard-shortcut help smoke',
    'terminal-keyboard-shortcut-help-local-api-smoke',
    'local-api-precheck-help-only',
    'help-only-no-dispatch',
    'GET /v1/markets',
    'GET /v1/tickers/WQUAI-WQI',
    'GET /v1/orderbook/WQUAI-WQI',
    'GET /v1/orders',
    'GET /v1/account',
    'POST /v1/vault/deposits/prepare',
    'POST /v1/vault/withdrawals/prepare',
    'POST /v1/delegate-keys',
    'owner-wallet-vault-operation-placeholder',
    'delegate-key-owner-signed-prepare-boundary',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'realQuaiTransactions: false',
    'walletRequired: false',
    'fundsMoved: false',
    'tradingVaultMutation: false',
    'marketRegistryMutation: false',
    'delegateKeyRegistryMutation: false',
    'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
  ]) {
    assert.ok(readme.includes(requiredText), `terminal UI keyboard-shortcut smoke docs should include ${requiredText}`);
  }

  assert.ok(
    packageJson.includes('node --check src/keyboard-shortcuts-smoke-binding.js'),
    'terminal UI package check should syntax-check the keyboard-shortcut help smoke binding',
  );
  assert.ok(
    appSource.includes('bindKeyboardShortcutHelpLocalApiSmoke'),
    'browser app should bind the local API keyboard-shortcut help smoke wrapper',
  );
  assert.ok(
    renderSource.includes('data-qdx-keyboard-shortcuts-status'),
    'renderer should expose a keyboard-shortcut smoke status node',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI keyboard-shortcut help panel for read-only/local mock actions'),
    'campaign status should move the keyboard-shortcut help panel to previous work',
  );
  assert.ok(
    status.includes('Completed this run: local API + terminal UI keyboard-shortcut help smoke for read-only/local mock actions'),
    'campaign status should checkpoint the keyboard-shortcut help smoke slice',
  );
  assert.ok(
    status.includes('Next autonomous slice: another bounded local/source-only MVP surface'),
    'campaign status should move next work past the keyboard shortcut smoke',
  );

  assert.doesNotMatch(
    `${readme}\n${status}`,
    /wallet key|rpcUrl\s*:|signing key|broadcast transaction|keyboard shortcut tx submitted|funds moved by keyboard shortcut/i,
    'keyboard-shortcut smoke docs/status must not claim wallet/RPC/signing/broadcast/tx/funds behavior',
  );
});
