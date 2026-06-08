import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  createMockVaultHistoryFixture,
  normalizeVaultHistoryPanelFixture,
} from '../src/vault-history-panel.js';
import { renderTradeProofPanel } from '../src/render.js';

const repoRoot = new URL('../../../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const requiredSafetyFields = Object.freeze({
  source: 'tradingvault-event-projection',
  custody: 'non-custodial-contract-vault',
  permissions: Object.freeze(['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']),
  settlementMode: 'mock',
  settlementTx: null,
  blockNumber: null,
  blockHash: null,
  eventIndex: null,
  explorerUrl: null,
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
});

test('mock terminal UI fixture carries empty read-only TradingVault deposit and withdrawal history envelopes', () => {
  assert.ok(mockVerticalSliceFixture.vaultHistory, 'static fixture should carry vault history panel metadata');

  const normalized = normalizeVaultHistoryPanelFixture(mockVerticalSliceFixture.vaultHistory);

  assert.deepEqual(normalized.deposits.deposits, []);
  assert.deepEqual(normalized.withdrawals.withdrawals, []);
  assert.equal(normalized.deposits.projectionType, 'TradingVaultDepositProjection');
  assert.equal(normalized.deposits.eventName, 'Deposit');
  assert.equal(normalized.withdrawals.projectionType, 'TradingVaultWithdrawalProjection');
  assert.equal(normalized.withdrawals.eventName, 'Withdraw');

  for (const envelope of [normalized.deposits, normalized.withdrawals]) {
    for (const [key, expected] of Object.entries(requiredSafetyFields)) {
      assert.deepEqual(envelope[key], expected, `${key} should preserve the read-only vault history safety envelope`);
    }
    assert.match(envelope.safetyNotice, /Read-only TradingVault (Deposit|Withdraw) history projection/);
    assert.match(envelope.safetyNotice, /no real Quai transaction, no wallet loaded, no funds moved/i);
    assert.match(envelope.safetyNotice, /no delegate withdrawal\/admin authority/i);
  }
});

test('renderTradeProofPanel renders read-only vault history without implying wallet, tx, or funds behavior', () => {
  const fixture = {
    ...mockVerticalSliceFixture,
    vaultHistory: createMockVaultHistoryFixture(),
  };
  const html = renderTradeProofPanel(fixture);

  for (const requiredText of [
    /read-only vault history/i,
    /TradingVault Deposit history/i,
    /TradingVault Withdraw history/i,
    /tradingvault-event-projection/,
    /TradingVaultDepositProjection/,
    /TradingVaultWithdrawalProjection/,
    /READ_ONLY, NO_WITHDRAW, NO_ADMIN/,
    /settlementMode[\s\S]*mock/i,
    /settlement tx[\s\S]*null \(mock\)/i,
    /block[\s\S]*null \(mock\)/i,
    /event index[\s\S]*null \(mock\)/i,
    /explorer[\s\S]*null \(mock\)/i,
    /real Quai tx[\s\S]*false/i,
    /wallet required[\s\S]*false/i,
    /funds moved[\s\S]*false/i,
    /TradingVault mutation[\s\S]*false/i,
    /no vault deposit history rows yet/i,
    /no vault withdrawal history rows yet/i,
    /no wallet loaded, no funds moved/i,
    /no delegate withdrawal\/admin authority/i,
  ]) {
    assert.match(html, requiredText);
  }

  assert.doesNotMatch(html, /wallet connected for vault history/i);
  assert.doesNotMatch(html, /owner-wallet-vault-operation-placeholder/);
  assert.doesNotMatch(html, /WITHDRAW, ADMIN/);
});

test('terminal UI docs and campaign status mark vault history smoke complete and keep next slice local-only', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/vault-history-panel.js',
    'src/vault-history-binding.js',
    'read-only TradingVault deposit/withdrawal history panel',
    'local API + terminal UI vault history smoke',
    'GET /v1/vault/deposits',
    'GET /v1/vault/withdrawals',
    'source: tradingvault-event-projection',
    'TradingVaultDepositProjection',
    'TradingVaultWithdrawalProjection',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'settlementMode: mock',
    'realQuaiTransactions: false',
    'walletRequired: false',
    'fundsMoved: false',
    'tradingVaultMutation: false',
    'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
  ]) {
    assert.ok(readme.includes(requiredText), `terminal UI README should include ${requiredText}`);
  }

  assert.ok(
    status.includes('Completed previous run: terminal UI read-only vault history panel'),
    'campaign status should retain the terminal UI vault history panel checkpoint',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI vault history integration smoke'),
    'campaign status should retain the local API + terminal UI vault history smoke slice',
  );
  assert.ok(
    status.includes('Completed previous run: private `deposits`/`withdrawals` WebSocket snapshot alignment'),
    'campaign status should retain the bounded local/source-only vault history stream alignment slice',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI private vault history stream binding'),
    'campaign status should retain the bounded local/source-only terminal UI vault history stream binding slice',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI vault history stream integration smoke'),
    'campaign status should retain the bounded local/source-only vault history stream smoke slice',
  );
  assert.ok(
    status.includes('Completed previous run: read-only TypeScript SDK and `qdex` CLI vault history stream consumers'),
    'campaign status should retain the bounded local/source-only TypeScript/qdex vault history stream consumer slice',
  );
  assert.ok(
    status.includes('Completed previous run: Python SDK vault history stream consumers'),
    'campaign status should retain the bounded local/source-only Python vault history stream consumer slice',
  );
  assert.ok(
    status.includes('Completed previous run: prepare-only delegate/API key registration and revocation API boundary'),
    'campaign status should retain the bounded local/source-only delegate-key API boundary slice',
  );
  assert.ok(
    status.includes('Completed previous run: TypeScript/Python/qdex prepare-only delegate/API key registration and revocation clients'),
    'campaign status should retain the bounded local/source-only delegate-key client exposure slice',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI prepare-only delegate/API key panel/binding'),
    'campaign status should retain the bounded local/source-only terminal UI delegate-key exposure slice',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI delegate/API key prepare smoke'),
    'campaign status should retain the local API + terminal UI delegate-key smoke slice',
  );
  assert.ok(
    status.includes('Completed this run: post-delegate-key owner-signed readiness docs'),
    'campaign status should checkpoint the post-delegate-key owner-signed readiness docs slice',
  );
  assert.ok(
    status.includes('Next autonomous slice: read-only DelegateKeyRegistry registration/revocation projection schema ratchet'),
    'campaign status should move to the DelegateKeyRegistry projection schema ratchet after readiness docs',
  );
  assert.doesNotMatch(
    `${readme}\n${status}`,
    /walletPrivateKey|rpcUrl\s*:|signing key|broadcast transaction|funds moved by UI/i,
    'terminal UI vault history docs/status must not claim wallet/RPC/signing/broadcast/funds behavior',
  );
});
