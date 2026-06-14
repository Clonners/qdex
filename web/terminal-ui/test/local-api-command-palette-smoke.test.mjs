import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindCommandPaletteLocalApiSmoke } from '../src/command-palette-smoke-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const SMOKE_SOURCE = 'terminal-command-palette-local-api-smoke';
const PALETTE_SOURCE = 'terminal-command-palette-skeleton';
const SAFE_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];
const EXPECTED_PREFLIGHT_CALLS = [
  ['GET', '/v1/markets'],
  ['GET', '/v1/tickers/WQUAI-WQI'],
  ['GET', '/v1/orderbook/WQUAI-WQI'],
  ['GET', '/v1/proofs/trades/trade-000001'],
  ['GET', '/v1/account/balances'],
  ['GET', '/v1/account'],
  ['GET', '/v1/fees'],
  ['POST', '/v1/vault/deposits/prepare'],
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

const createCommandPaletteMount = () => {
  const listeners = new Map();
  const statusNode = { textContent: '', dataset: {} };
  const inputNode = { value: ':fees' };
  const formNode = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  const mount = {
    dataset: {},
    innerHTML: renderTradeProofPanel(mockVerticalSliceFixture),
    querySelector(selector) {
      if (selector === '[data-qdx-command-palette-form]') return formNode;
      if (selector === '[data-qdx-command-palette-input]') return inputNode;
      if (selector === '[data-qdx-command-palette-status]') return statusNode;
      return null;
    },
  };

  return { formNode, inputNode, listeners, mount, statusNode };
};

const assertSafeSmokeEnvelope = (envelope) => {
  assert.equal(envelope.source, SMOKE_SOURCE);
  assert.equal(envelope.commandPaletteSource, PALETTE_SOURCE);
  assert.equal(envelope.mode, 'local-api-precheck-preview-only');
  assert.equal(envelope.dispatchMode, 'preview-only-no-dispatch');
  assert.deepEqual(envelope.permissions, SAFE_PERMISSIONS);
  assert.equal(envelope.realQuaiTransactions, false);
  assert.equal(envelope.walletRequired, false);
  assert.equal(envelope.fundsMoved, false);
  assert.equal(envelope.tradingVaultMutation, false);
  assert.equal(envelope.marketRegistryMutation, false);
  assert.equal(envelope.delegateKeyRegistryMutation, false);
  assert.equal(envelope.delegateCanWithdraw, false);
  assert.equal(envelope.delegateCanAdmin, false);
  assert.match(envelope.safetyNotice, /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds behavior/i);
};

test('local API + terminal UI command-palette smoke prechecks safe surfaces without dispatching commands', async () => {
  await withApiServer(async (baseUrl) => {
    const { inputNode, listeners, mount, statusNode } = createCommandPaletteMount();
    const fetchCalls = [];
    const smokeSnapshots = [];
    const previews = [];
    const errors = [];

    const countedFetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), method: options.method ?? 'GET' });
      return fetch(url, options);
    };

    const binding = await bindCommandPaletteLocalApiSmoke({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      palette: mockVerticalSliceFixture.commandPalette,
      onSmoke: (snapshot) => smokeSnapshots.push(snapshot),
      onPreview: (preview, snapshot) => previews.push({ preview, snapshot }),
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
      assert.equal(fetchCalls.some((call) => new URL(call.url).pathname === '/v1/orders'), false);
      assert.equal(fetchCalls.some((call) => new URL(call.url).pathname === '/v1/orders/cancel-all'), false);

      assert.equal(mount.dataset.qdxCommandPaletteLocalApiSmoke, SMOKE_SOURCE);
      assert.equal(mount.dataset.qdxCommandPaletteDispatchMode, 'preview-only-no-dispatch');
      assert.equal(mount.dataset.qdxCommandPalettePermissions, 'READ_ONLY,NO_WITHDRAW,NO_ADMIN');
      assert.equal(mount.dataset.qdxCommandPaletteLocalApiSurfaces, EXPECTED_PREFLIGHT_CALLS.map(([method, path]) => `${method} ${path}`).join(','));

      const snapshot = binding.apiSnapshot;
      assertSafeSmokeEnvelope(snapshot);
      assert.equal(snapshot.precheckedCommands[':markets'].httpStatus, 200);
      assert.equal(snapshot.precheckedCommands[':markets'].source, 'market-list');
      assert.equal(snapshot.precheckedCommands[':ticker WQUAI-WQI'].source, 'mock-market-data');
      assert.equal(snapshot.precheckedCommands[':book WQUAI-WQI'].source, 'mock-orderbook');
      assert.equal(snapshot.precheckedCommands[':proof trade-000001'].httpStatus, 404);
      assert.equal(snapshot.precheckedCommands[':proof trade-000001'].error, 'proof_not_found');
      assert.equal(snapshot.precheckedCommands[':proof trade-000001'].source, 'proof-service-indexer-projection');
      assert.equal(snapshot.precheckedCommands[':balance'].source, 'mock-vault-projection');
      assert.equal(snapshot.precheckedCommands[':account'].source, 'mock-account-overview');
      assert.equal(snapshot.precheckedCommands[':fees'].source, 'feemanager-policy-projection');
      assert.equal(snapshot.precheckedCommands[':deposit WQI 10 prepare owner-wallet-only'].httpStatus, 501);
      assert.equal(snapshot.precheckedCommands[':deposit WQI 10 prepare owner-wallet-only'].source, 'owner-wallet-vault-operation-placeholder');
      assert.equal(snapshot.precheckedCommands[':api create-key bot-mm-1 prepare NO_WITHDRAW NO_ADMIN'].httpStatus, 501);
      assert.equal(snapshot.precheckedCommands[':api create-key bot-mm-1 prepare NO_WITHDRAW NO_ADMIN'].source, 'delegate-key-owner-signed-prepare-boundary');
      assert.equal(snapshot.previewOnlyCommands[':stream tickers'].dispatchMode, 'preview-only-no-dispatch');
      assert.equal(snapshot.previewOnlyCommands[':mock cross'].dispatchMode, 'preview-only-no-dispatch');
      assert.equal(snapshot.previewOnlyCommands[':cancel all matcher-local'].nonceManagerMutation, false);

      listeners.get('submit')({ preventDefault() {} });
      assert.equal(previews.length, 1);
      assert.equal(previews[0].preview.command, ':fees');
      assert.equal(previews[0].preview.dispatchMode, 'preview-only-no-dispatch');
      assert.equal(previews[0].snapshot.source, SMOKE_SOURCE);
      assert.equal(mount.dataset.qdxCommandPaletteLocalApiPreview, 'GET /v1/fees');
      assert.equal(statusNode.dataset.qdxCommandPaletteLocalApiSmoke, 'verified-preview-only');
      assert.match(statusNode.textContent, /terminal-command-palette-local-api-smoke/);
      assert.match(statusNode.textContent, /GET \/v1\/fees/);
      assert.match(statusNode.textContent, /READ_ONLY\/NO_WITHDRAW\/NO_ADMIN/);
      assert.match(statusNode.textContent, /preview-only-no-dispatch/);
      assert.match(statusNode.textContent, /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds behavior/i);

      inputNode.value = ':deposit WQI 10 prepare owner-wallet-only';
      listeners.get('submit')({ preventDefault() {} });
      assert.equal(previews.length, 2);
      assert.equal(mount.dataset.qdxCommandPaletteLocalApiPreview, 'POST /v1/vault/deposits/prepare');
      assert.match(statusNode.textContent, /HTTP 501/);
      assert.match(statusNode.textContent, /owner-wallet-vault-operation-placeholder/);
      assert.match(statusNode.textContent, /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds behavior/i);

      inputNode.value = ':withdraw WQI 10 live-wallet';
      listeners.get('submit')({ preventDefault() {} });
      assert.equal(previews.length, 3);
      assert.equal(mount.dataset.qdxCommandPaletteLocalApiPreview, 'unsupported');
      assert.equal(statusNode.dataset.qdxCommandPaletteLocalApiSmoke, 'unsupported-preview-only');
      assert.match(statusNode.textContent, /unsupported/);
      assert.match(statusNode.textContent, /blocked-no-dispatch/);
    } finally {
      binding.close();
    }
  });
});

test('terminal UI docs, package check, app wiring, and campaign status mark command-palette smoke complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const appSource = await readText('web/terminal-ui/src/app.js');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/command-palette-smoke-binding.js',
    'local API + terminal UI command-palette smoke',
    'terminal-command-palette-local-api-smoke',
    'local-api-precheck-preview-only',
    'preview-only-no-dispatch',
    'GET /v1/markets',
    'GET /v1/tickers/WQUAI-WQI',
    'GET /v1/orderbook/WQUAI-WQI',
    'GET /v1/proofs/trades/trade-000001',
    'GET /v1/account/balances',
    'GET /v1/account',
    'GET /v1/fees',
    'POST /v1/vault/deposits/prepare',
    'POST /v1/delegate-keys',
    'owner-wallet-vault-operation-placeholder',
    'delegate-key-owner-signed-prepare-boundary',
    'proof_not_found until a local mock cross exists',
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
    assert.ok(readme.includes(requiredText), `terminal UI command-palette smoke docs should include ${requiredText}`);
  }

  assert.ok(
    packageJson.includes('node --check src/command-palette-smoke-binding.js'),
    'terminal UI package check should syntax-check the command-palette smoke binding',
  );
  assert.ok(
    appSource.includes('bindCommandPaletteLocalApiSmoke'),
    'browser app should bind the local API command-palette smoke wrapper',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI command-palette skeleton for read-only/local mock actions'),
    'campaign status should move the command-palette skeleton to previous work',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI command-palette smoke for read-only/local mock actions'),
    'campaign status should retain the command-palette smoke slice as previous work',
  );
  assert.ok(
    status.includes('Next autonomous slice: another bounded local/source-only MVP surface'),
    'campaign status should move next work to another bounded local/source-only UI surface',
  );

  assert.doesNotMatch(
    `${readme}\n${status}`,
    /wallet key|rpcUrl\s*:|signing key|broadcast transaction|command palette tx submitted|funds moved by command palette/i,
    'command-palette smoke docs/status must not claim wallet/RPC/signing/broadcast/tx/funds behavior',
  );
});
