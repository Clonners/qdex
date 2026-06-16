import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  createMockNonceCancellationHistoryFixture,
  normalizeNonceCancellationHistoryPanelFixture,
} from '../src/nonce-cancellation-history-panel.js';
import { renderTradeProofPanel } from '../src/render.js';

const repoRoot = new URL('../../../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const requiredSafetyFields = Object.freeze({
  source: 'nonce-manager-event-projection',
  custody: 'non-custodial',
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
  nonceManagerMutation: false,
});

test('mock terminal UI fixture carries empty read-only NonceManager cancellation history envelopes', () => {
  assert.ok(mockVerticalSliceFixture.nonceCancellationHistory, 'static fixture should carry nonce cancellation history panel metadata');

  const normalized = normalizeNonceCancellationHistoryPanelFixture(mockVerticalSliceFixture.nonceCancellationHistory);

  assert.deepEqual(normalized.cancellations.cancellations, []);
  assert.deepEqual(normalized.rangeCancellations.rangeCancellations, []);
  assert.equal(normalized.cancellations.projectionType, 'NonceCancelledProjection');
  assert.equal(normalized.cancellations.eventName, 'NonceCancelled');
  assert.equal(normalized.rangeCancellations.projectionType, 'NonceRangeCancelledProjection');
  assert.equal(normalized.rangeCancellations.eventName, 'NonceRangeCancelled');

  for (const envelope of [normalized.cancellations, normalized.rangeCancellations]) {
    for (const [key, expected] of Object.entries(requiredSafetyFields)) {
      assert.deepEqual(envelope[key], expected, `${key} should preserve the read-only nonce cancellation history safety envelope`);
    }
    assert.match(envelope.safetyNotice, /Read-only NonceManager (NonceCancelled|NonceRangeCancelled) history projection/);
    assert.match(envelope.safetyNotice, /no real Quai transaction/i);
    assert.match(envelope.safetyNotice, /no wallet loaded/i);
    assert.match(envelope.safetyNotice, /no funds moved/i);
    assert.match(envelope.safetyNotice, /no delegate withdrawal\/admin authority/i);
  }
});

test('renderTradeProofPanel renders read-only nonce cancellation history without implying wallet, tx, or funds behavior', () => {
  const fixture = {
    ...mockVerticalSliceFixture,
    nonceCancellationHistory: createMockNonceCancellationHistoryFixture(),
  };
  const html = renderTradeProofPanel(fixture);

  for (const requiredText of [
    /read-only nonce cancellation history/i,
    /NonceCancelled history/i,
    /NonceRangeCancelled history/i,
    /nonce-manager-event-projection/,
    /NonceCancelledProjection/,
    /NonceRangeCancelledProjection/,
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
    /NonceManager mutation[\s\S]*false/i,
    /no nonce cancellation history rows yet/i,
    /no nonce range cancellation history rows yet/i,
    /no wallet loaded, no funds moved/i,
    /no delegate withdrawal\/admin authority/i,
  ]) {
    assert.match(html, requiredText);
  }

  assert.doesNotMatch(html, /wallet connected for nonce cancellation/i);
  assert.doesNotMatch(html, /owner-wallet-nonce-cancel-placeholder/);
  assert.doesNotMatch(html, /WITHDRAW, ADMIN/);
});

test('terminal UI docs and campaign status mark nonce cancellation history panel complete and keep next slice local-only', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/nonce-cancellation-history-panel.js',
    'read-only NonceManager nonce cancellation history panel',
    'GET /v1/nonces/cancellations',
    'source: nonce-manager-event-projection',
    'NonceCancelledProjection',
    'NonceRangeCancelledProjection',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'settlementMode: mock',
    'realQuaiTransactions: false',
    'walletRequired: false',
    'fundsMoved: false',
    'tradingVaultMutation: false',
    'nonceManagerMutation: false',
    'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
  ]) {
    assert.ok(readme.includes(requiredText), `terminal UI README should include ${requiredText}`);
  }

  assert.ok(
    status.includes('Completed this run: terminal UI read-only nonce cancellations history panel'),
    'campaign status should retain the terminal UI nonce cancellation history panel checkpoint',
  );
  assert.doesNotMatch(
    `${readme}\n${status}`,
    /walletPrivateKey|rpcUrl\s*:|signing key|broadcast transaction|funds moved by UI/i,
    'terminal UI nonce cancellation history docs/status must not claim wallet/RPC/signing/broadcast/funds behavior',
  );
});
