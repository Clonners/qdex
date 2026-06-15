import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  createMockKeyboardShortcutHelpFixture,
  normalizeKeyboardShortcutHelpFixture,
} from '../src/keyboard-shortcuts.js';
import { renderTradeProofPanel } from '../src/render.js';

const repoRoot = new URL('../../../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const REQUIRED_PERMISSIONS = Object.freeze(['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);

const assertHelpOnlySafety = (entry) => {
  assert.equal(entry.dispatchMode, 'help-only-no-dispatch', `${entry.key} must stay help-only`);
  assert.deepEqual(entry.permissions, REQUIRED_PERMISSIONS, `${entry.key} must preserve read-only/no-withdraw/no-admin permissions`);
  assert.equal(entry.realQuaiTransactions, false, `${entry.key} must not create real Quai transactions`);
  assert.equal(entry.walletRequired, false, `${entry.key} must not require wallet loading`);
  assert.equal(entry.fundsMoved, false, `${entry.key} must not move funds`);
  assert.equal(entry.tradingVaultMutation, false, `${entry.key} must not mutate TradingVault`);
  assert.equal(entry.marketRegistryMutation, false, `${entry.key} must not mutate MarketRegistry`);
  assert.equal(entry.delegateKeyRegistryMutation, false, `${entry.key} must not mutate DelegateKeyRegistry`);
  assert.equal(entry.nonceManagerMutation, false, `${entry.key} must not mutate NonceManager`);
  assert.equal(entry.delegateCanWithdraw, false, `${entry.key} must not grant delegate withdrawal authority`);
  assert.equal(entry.delegateCanAdmin, false, `${entry.key} must not grant delegate admin authority`);
};

test('mock terminal UI fixture carries keyboard-shortcut help for read-only/local mock actions', () => {
  assert.ok(mockVerticalSliceFixture.keyboardShortcuts, 'static fixture should carry keyboard shortcut help metadata');

  const normalized = normalizeKeyboardShortcutHelpFixture(mockVerticalSliceFixture.keyboardShortcuts);

  assert.equal(normalized.source, 'terminal-keyboard-shortcut-help');
  assert.equal(normalized.mode, 'local-ui-help-only');
  assert.equal(normalized.dispatchMode, 'help-only-no-dispatch');
  assert.equal(normalized.panelTrigger, '?');
  assert.equal(normalized.custody, 'non-custodial-no-withdrawal-authority');
  assert.deepEqual(normalized.permissions, REQUIRED_PERMISSIONS);
  assert.equal(normalized.realQuaiTransactions, false);
  assert.equal(normalized.walletRequired, false);
  assert.equal(normalized.fundsMoved, false);
  assert.equal(normalized.tradingVaultMutation, false);
  assert.equal(normalized.marketRegistryMutation, false);
  assert.equal(normalized.delegateKeyRegistryMutation, false);
  assert.match(normalized.safety.notice, /keyboard-shortcut help/i);
  assert.match(normalized.safety.notice, /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds/i);

  const shortcuts = new Map(normalized.shortcuts.map((shortcut) => [shortcut.key, shortcut]));
  for (const requiredKey of ['/', 'b', 's', 'c', 'o', 'w', '?']) {
    assert.ok(shortcuts.has(requiredKey), `keyboard shortcut help should include ${requiredKey}`);
    assertHelpOnlySafety(shortcuts.get(requiredKey));
  }

  assert.match(shortcuts.get('/').label, /search market/i);
  assert.match(shortcuts.get('b').label, /buy preview/i);
  assert.match(shortcuts.get('s').label, /sell preview/i);
  assert.match(shortcuts.get('c').label, /matcher-local cancel/i);
  assert.match(shortcuts.get('o').label, /open orders/i);
  assert.match(shortcuts.get('w').label, /owner-wallet prepare boundaries/i);
  assert.match(shortcuts.get('?').label, /help/i);

  const commandHints = normalized.commandHints.map((hint) => hint.command);
  for (const requiredCommand of [
    ':markets',
    ':book WQUAI-WQI',
    ':mock cross',
    ':cancel all matcher-local',
    ':deposit WQI 10 prepare owner-wallet-only',
    ':api create-key bot-mm-1 prepare NO_WITHDRAW NO_ADMIN',
  ]) {
    assert.ok(commandHints.includes(requiredCommand), `keyboard help should include command hint ${requiredCommand}`);
  }
});

test('renderTradeProofPanel renders keyboard-shortcut help panel and safety copy', () => {
  const html = renderTradeProofPanel({
    ...mockVerticalSliceFixture,
    keyboardShortcuts: createMockKeyboardShortcutHelpFixture(),
  });

  for (const requiredText of [
    /terminal keyboard-shortcut help/i,
    /terminal-keyboard-shortcut-help/,
    /local-ui-help-only/,
    /help-only-no-dispatch/,
    /data-qdx-keyboard-shortcuts-panel/,
    /READ_ONLY, NO_WITHDRAW, NO_ADMIN/,
    /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds/i,
    /\/ search market/i,
    /b buy preview/i,
    /s sell preview/i,
    /c matcher-local cancel/i,
    /o open orders/i,
    /w owner-wallet prepare boundaries/i,
    /\? help/i,
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

  assert.doesNotMatch(html, /keyboard shortcut submitted a transaction/i);
  assert.doesNotMatch(html, /wallet shortcut dispatched/i);
  assert.doesNotMatch(html, /funds moved by keyboard shortcut/i);
});

test('terminal UI docs, package check, and campaign status mark keyboard-shortcut help complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/keyboard-shortcuts.js',
    'terminal keyboard-shortcut help',
    'terminal-keyboard-shortcut-help',
    'local-ui-help-only',
    'help-only-no-dispatch',
    '/ search market',
    'b buy preview',
    's sell preview',
    'c matcher-local cancel',
    'o open orders',
    'w owner-wallet prepare boundaries',
    '? help',
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
    packageJson.includes('node --check src/keyboard-shortcuts.js'),
    'terminal UI package check should syntax-check the keyboard-shortcut help module',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI command-palette smoke for read-only/local mock actions'),
    'campaign status should move the command-palette smoke slice to previous work',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI keyboard-shortcut help panel for read-only/local mock actions'),
    'campaign status should checkpoint the keyboard-shortcut help slice',
  );
  assert.ok(
    status.includes('Next autonomous slice: testnet cutover readiness Task 5'),
    'campaign status should move next work to the testnet cutover readiness plan',
  );

  assert.doesNotMatch(
    `${readme}\n${status}`,
    /wallet key|rpcUrl\s*:|signing key|broadcast transaction|keyboard shortcut tx submitted|funds moved by keyboard shortcut/i,
    'terminal UI keyboard-shortcut docs/status must not claim wallet/RPC/signing/broadcast/tx/funds behavior',
  );
});
