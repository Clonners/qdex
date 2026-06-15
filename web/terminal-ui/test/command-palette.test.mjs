import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  bindCommandPaletteSkeleton,
  createMockCommandPaletteFixture,
  normalizeCommandPaletteFixture,
  previewCommandPaletteInput,
} from '../src/command-palette.js';
import { renderTradeProofPanel } from '../src/render.js';

const repoRoot = new URL('../../../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const REQUIRED_PERMISSIONS = Object.freeze(['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);

const assertNoExternalAuthority = (command) => {
  assert.equal(command.realQuaiTransactions, false, `${command.command} must not create real Quai transactions`);
  assert.equal(command.walletRequired, false, `${command.command} must not require a wallet in the skeleton`);
  assert.equal(command.fundsMoved, false, `${command.command} must not move funds`);
  assert.equal(command.tradingVaultMutation, false, `${command.command} must not mutate TradingVault`);
  assert.equal(command.marketRegistryMutation, false, `${command.command} must not mutate MarketRegistry`);
  assert.equal(command.delegateKeyRegistryMutation, false, `${command.command} must not mutate DelegateKeyRegistry`);
  assert.equal(command.dispatchMode, 'preview-only-no-dispatch', `${command.command} must stay preview-only`);
  assert.deepEqual(command.permissions, REQUIRED_PERMISSIONS, `${command.command} must preserve read-only/no-withdraw/no-admin permissions`);
};

test('mock terminal UI fixture carries a command-palette skeleton for read-only/local mock actions', () => {
  assert.ok(mockVerticalSliceFixture.commandPalette, 'static fixture should carry terminal command-palette metadata');

  const normalized = normalizeCommandPaletteFixture(mockVerticalSliceFixture.commandPalette);

  assert.equal(normalized.source, 'terminal-command-palette-skeleton');
  assert.equal(normalized.mode, 'local-ui-preview-only');
  assert.equal(normalized.dispatchMode, 'preview-only-no-dispatch');
  assert.equal(normalized.custody, 'non-custodial-no-withdrawal-authority');
  assert.deepEqual(normalized.permissions, REQUIRED_PERMISSIONS);
  assert.equal(normalized.realQuaiTransactions, false);
  assert.equal(normalized.walletRequired, false);
  assert.equal(normalized.fundsMoved, false);
  assert.equal(normalized.tradingVaultMutation, false);
  assert.equal(normalized.marketRegistryMutation, false);
  assert.equal(normalized.delegateKeyRegistryMutation, false);
  assert.match(normalized.safety.notice, /display-only command palette skeleton/i);
  assert.match(normalized.safety.notice, /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds/i);

  const commands = new Map(normalized.commands.map((command) => [command.command, command]));
  for (const requiredCommand of [
    ':markets',
    ':ticker WQUAI-WQI',
    ':book WQUAI-WQI',
    ':proof trade-000001',
    ':balance',
    ':account',
    ':fees',
    ':stream tickers',
    ':mock cross',
    ':cancel all matcher-local',
    ':deposit WQI 10 prepare owner-wallet-only',
    ':api create-key bot-mm-1 prepare NO_WITHDRAW NO_ADMIN',
  ]) {
    assert.ok(commands.has(requiredCommand), `command palette should include ${requiredCommand}`);
    assertNoExternalAuthority(commands.get(requiredCommand));
  }

  assert.equal(commands.get(':mock cross').actionType, 'local_mock');
  assert.equal(commands.get(':cancel all matcher-local').nonceManagerMutation, false);
  assert.match(commands.get(':cancel all matcher-local').safetyNotice, /matcher-local cancellation does not mutate on-chain NonceManager nonces/i);
  assert.equal(commands.get(':deposit WQI 10 prepare owner-wallet-only').actionType, 'prepare_only');
  assert.equal(commands.get(':api create-key bot-mm-1 prepare NO_WITHDRAW NO_ADMIN').delegateCanWithdraw, false);
  assert.equal(commands.get(':api create-key bot-mm-1 prepare NO_WITHDRAW NO_ADMIN').delegateCanAdmin, false);
});

test('previewCommandPaletteInput resolves only known commands without dispatching network or wallet behavior', () => {
  const palette = createMockCommandPaletteFixture();
  const proofPreview = previewCommandPaletteInput(':proof trade-000001', palette);

  assert.equal(proofPreview.status, 'matched');
  assert.equal(proofPreview.command, ':proof trade-000001');
  assert.equal(proofPreview.source, 'terminal-command-palette-skeleton');
  assert.equal(proofPreview.dispatchMode, 'preview-only-no-dispatch');
  assert.deepEqual(proofPreview.permissions, REQUIRED_PERMISSIONS);
  assert.equal(proofPreview.realQuaiTransactions, false);
  assert.equal(proofPreview.walletRequired, false);
  assert.equal(proofPreview.fundsMoved, false);
  assert.match(proofPreview.message, /preview-only/i);
  assert.match(proofPreview.message, /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds/i);

  const unsupported = previewCommandPaletteInput(':withdraw WQI 10 live-wallet', palette);
  assert.equal(unsupported.status, 'unsupported');
  assert.equal(unsupported.dispatchMode, 'blocked-no-dispatch');
  assert.deepEqual(unsupported.permissions, REQUIRED_PERMISSIONS);
  assert.equal(unsupported.realQuaiTransactions, false);
  assert.equal(unsupported.walletRequired, false);
  assert.equal(unsupported.fundsMoved, false);
  assert.match(unsupported.message, /not enabled in the local command-palette skeleton/i);
});

test('renderTradeProofPanel renders command-palette skeleton controls and safety copy', () => {
  const html = renderTradeProofPanel({
    ...mockVerticalSliceFixture,
    commandPalette: createMockCommandPaletteFixture(),
  });

  for (const requiredText of [
    /terminal command-palette skeleton/i,
    /terminal-command-palette-skeleton/,
    /local-ui-preview-only/,
    /preview-only-no-dispatch/,
    /READ_ONLY, NO_WITHDRAW, NO_ADMIN/,
    /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds/i,
    /data-qdx-command-palette-form/,
    /data-qdx-command-palette-input/,
    /data-qdx-command-palette-status/,
    /:markets/,
    /:ticker WQUAI-WQI/,
    /:book WQUAI-WQI/,
    /:proof trade-000001/,
    /:balance/,
    /:account/,
    /:fees/,
    /:stream tickers/,
    /:mock cross/,
    /:cancel all matcher-local/,
    /:deposit WQI 10 prepare owner-wallet-only/,
    /:api create-key bot-mm-1 prepare NO_WITHDRAW NO_ADMIN/,
    /matcher-local cancellation does not mutate on-chain NonceManager nonces/i,
    /delegate can withdraw[\s\S]*false/i,
    /delegate can admin[\s\S]*false/i,
    /real Quai tx[\s\S]*false/i,
    /wallet required[\s\S]*false/i,
    /funds moved[\s\S]*false/i,
    /TradingVault mutation[\s\S]*false/i,
    /MarketRegistry mutation[\s\S]*false/i,
    /DelegateKeyRegistry mutation[\s\S]*false/i,
  ]) {
    assert.match(html, requiredText);
  }

  assert.doesNotMatch(html, /wallet command dispatched/i);
  assert.doesNotMatch(html, /live transaction submitted/i);
  assert.doesNotMatch(html, /funds moved by command palette/i);
});

test('bindCommandPaletteSkeleton previews typed commands without fetch, wallet, or command dispatch', () => {
  const listeners = new Map();
  const statusNode = { textContent: '', dataset: {} };
  const inputNode = { value: ':proof trade-000001' };
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
    querySelector(selector) {
      if (selector === '[data-qdx-command-palette-form]') return formNode;
      if (selector === '[data-qdx-command-palette-input]') return inputNode;
      if (selector === '[data-qdx-command-palette-status]') return statusNode;
      return null;
    },
  };
  const previews = [];
  const errors = [];

  const binding = bindCommandPaletteSkeleton({
    mount,
    palette: createMockCommandPaletteFixture(),
    onPreview: (preview) => previews.push(preview),
    onError: (error) => errors.push(error),
  });

  listeners.get('submit')({ preventDefault() {} });

  assert.equal(errors.length, 0);
  assert.equal(previews.length, 1);
  assert.equal(previews[0].command, ':proof trade-000001');
  assert.equal(previews[0].dispatchMode, 'preview-only-no-dispatch');
  assert.equal(mount.dataset.qdxCommandPalette, 'preview-only');
  assert.equal(statusNode.dataset.qdxCommandPaletteStatus, 'preview-only');
  assert.match(statusNode.textContent, /:proof trade-000001/);
  assert.match(statusNode.textContent, /preview-only/i);
  assert.match(statusNode.textContent, /READ_ONLY\/NO_WITHDRAW\/NO_ADMIN/);
  assert.match(statusNode.textContent, /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds/i);

  inputNode.value = ':withdraw WQI 10 live-wallet';
  listeners.get('submit')({ preventDefault() {} });
  assert.equal(previews.length, 2);
  assert.equal(previews[1].status, 'unsupported');
  assert.equal(statusNode.dataset.qdxCommandPaletteStatus, 'unsupported');
  assert.match(statusNode.textContent, /not enabled/i);
  assert.match(statusNode.textContent, /blocked-no-dispatch/i);

  binding.close();
  assert.equal(listeners.has('submit'), false);
});

test('terminal UI docs, package check, and campaign status mark command-palette skeleton complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/command-palette.js',
    'bindCommandPaletteSkeleton',
    'terminal command-palette skeleton',
    'terminal-command-palette-skeleton',
    'local-ui-preview-only',
    'preview-only-no-dispatch',
    ':markets',
    ':ticker WQUAI-WQI',
    ':book WQUAI-WQI',
    ':proof trade-000001',
    ':balance',
    ':account',
    ':fees',
    ':stream tickers',
    ':mock cross',
    ':cancel all matcher-local',
    ':deposit WQI 10 prepare owner-wallet-only',
    ':api create-key bot-mm-1 prepare NO_WITHDRAW NO_ADMIN',
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
    assert.ok(readme.includes(requiredText), `terminal UI README should include ${requiredText}`);
  }

  assert.ok(
    packageJson.includes('node --check src/command-palette.js'),
    'terminal UI package check should syntax-check the command-palette skeleton module',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI public market-data stream integration smoke'),
    'campaign status should move public market-data smoke to previous work',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI command-palette skeleton for read-only/local mock actions'),
    'campaign status should retain the command-palette skeleton slice as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI command-palette smoke for read-only/local mock actions'),
    'campaign status should retain the command-palette local API smoke slice as previous work',
  );
  assert.ok(
    status.includes('Next autonomous slice: testnet cutover readiness Task 5'),
    'campaign status should move next work to the testnet cutover readiness plan',
  );

  assert.doesNotMatch(
    `${readme}\n${status}`,
    /wallet key|rpcUrl\s*:|signing key|broadcast transaction|command palette tx submitted|funds moved by command palette/i,
    'terminal UI command-palette docs/status must not claim wallet/RPC/signing/broadcast/tx/funds behavior',
  );
});
