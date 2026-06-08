import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  createMockDelegateKeyHistoryFixture,
  normalizeDelegateKeyHistoryPanelFixture,
} from '../src/delegate-key-history-panel.js';
import { renderTradeProofPanel } from '../src/render.js';

const repoRoot = new URL('../../../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const requiredSafetyFields = Object.freeze({
  source: 'delegatekeyregistry-event-projection',
  custody: 'non-custodial-no-withdrawal-authority',
  permissions: Object.freeze(['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']),
  settlementMode: 'mock',
  settlementTx: null,
  blockNumber: null,
  blockHash: null,
  eventIndex: null,
  explorerUrl: null,
  delegateCanWithdraw: false,
  delegateCanAdmin: false,
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  delegateKeyRegistryMutation: false,
});

test('mock terminal UI fixture carries empty read-only DelegateKeyRegistry registration and revocation history envelopes', () => {
  assert.ok(
    mockVerticalSliceFixture.delegateKeyHistory,
    'static fixture should carry delegate-key history panel metadata',
  );

  const normalized = normalizeDelegateKeyHistoryPanelFixture(mockVerticalSliceFixture.delegateKeyHistory);

  assert.deepEqual(normalized.registrations.registrations, []);
  assert.deepEqual(normalized.revocations.revocations, []);
  assert.equal(normalized.registrations.projectionType, 'DelegateKeyRegisteredProjection');
  assert.equal(normalized.registrations.eventName, 'DelegateKeyRegistered');
  assert.equal(normalized.revocations.projectionType, 'DelegateKeyRevokedProjection');
  assert.equal(normalized.revocations.eventName, 'DelegateKeyRevoked');

  for (const envelope of [normalized.registrations, normalized.revocations]) {
    for (const [key, expected] of Object.entries(requiredSafetyFields)) {
      assert.deepEqual(
        envelope[key],
        expected,
        `${key} should preserve the read-only DelegateKeyRegistry safety envelope`,
      );
    }
    assert.match(envelope.safetyNotice, /Read-only DelegateKeyRegistry DelegateKey(?:Registered|Revoked) history projection/);
    assert.match(envelope.safetyNotice, /no real Quai transaction, no wallet loaded/i);
    assert.match(envelope.safetyNotice, /no live DelegateKeyRegistry mutation, no funds moved/i);
    assert.match(envelope.safetyNotice, /no delegate withdrawal\/admin authority/i);
  }
});

test('renderTradeProofPanel renders read-only delegate-key history without implying wallet, tx, registry mutation, or funds behavior', () => {
  const fixture = {
    ...mockVerticalSliceFixture,
    delegateKeyHistory: createMockDelegateKeyHistoryFixture(),
  };
  const html = renderTradeProofPanel(fixture);

  for (const requiredText of [
    /read-only delegate\/API key history/i,
    /DelegateKeyRegistered history/i,
    /DelegateKeyRevoked history/i,
    /delegatekeyregistry-event-projection/,
    /DelegateKeyRegisteredProjection/,
    /DelegateKeyRevokedProjection/,
    /READ_ONLY, NO_WITHDRAW, NO_ADMIN/,
    /settlementMode[\s\S]*mock/i,
    /settlement tx[\s\S]*null \(mock\)/i,
    /block[\s\S]*null \(mock\)/i,
    /event index[\s\S]*null \(mock\)/i,
    /explorer[\s\S]*null \(mock\)/i,
    /delegate can withdraw[\s\S]*false/i,
    /delegate can admin[\s\S]*false/i,
    /real Quai tx[\s\S]*false/i,
    /wallet required[\s\S]*false/i,
    /funds moved[\s\S]*false/i,
    /TradingVault mutation[\s\S]*false/i,
    /DelegateKeyRegistry mutation[\s\S]*false/i,
    /no delegate-key registration history rows yet/i,
    /no delegate-key revocation history rows yet/i,
    /no wallet loaded/i,
    /no live DelegateKeyRegistry mutation, no funds moved/i,
    /no delegate withdrawal\/admin authority/i,
  ]) {
    assert.match(html, requiredText);
  }

  assert.doesNotMatch(html, /wallet connected for delegate-key history/i);
  assert.doesNotMatch(html, /delegate-key-owner-signed-prepare-boundary/);
  assert.doesNotMatch(html, /WITHDRAW, ADMIN/);
});

test('terminal UI docs, package check, and campaign status mark delegate-key history panel complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/delegate-key-history-panel.js',
    'read-only DelegateKeyRegistry registration/revocation history panel',
    'GET /v1/delegate-keys/registrations',
    'GET /v1/delegate-keys/revocations',
    'source: delegatekeyregistry-event-projection',
    'DelegateKeyRegisteredProjection',
    'DelegateKeyRevokedProjection',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'settlementMode: mock',
    'delegateCanWithdraw: false',
    'delegateCanAdmin: false',
    'realQuaiTransactions: false',
    'walletRequired: false',
    'fundsMoved: false',
    'tradingVaultMutation: false',
    'delegateKeyRegistryMutation: false',
    'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
  ]) {
    assert.ok(readme.includes(requiredText), `terminal UI README should include ${requiredText}`);
  }

  assert.ok(
    packageJson.includes('node --check src/delegate-key-history-panel.js'),
    'terminal UI package check should syntax-check the delegate-key history panel module',
  );
  assert.ok(
    status.includes('Completed previous run: read-only TypeScript/Python/qdex delegate-key history clients'),
    'campaign status should retain the delegate-key history client checkpoint as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI read-only delegate-key history panel'),
    'campaign status should retain the terminal UI delegate-key history panel as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI delegate-key history integration smoke'),
    'campaign status should retain the delegate-key history REST smoke as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: private DelegateKeyRegistry registration/revocation WebSocket snapshot alignment'),
    'campaign status should retain the delegate-key history stream alignment as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI private DelegateKeyRegistry history stream binding'),
    'campaign status should retain the terminal UI delegate-key stream binding as previous work',
  );
  assert.ok(
    status.includes('Completed this run: local API + terminal UI DelegateKeyRegistry history stream integration smoke'),
    'campaign status should record the local API + terminal UI delegate-key stream smoke as this run',
  );
  assert.doesNotMatch(
    `${readme}\n${status}`,
    /walletPrivateKey|rpcUrl\s*:|signing key|broadcast transaction|funds moved by UI/i,
    'terminal UI delegate-key history docs/status must not claim wallet/RPC/signing/broadcast/funds behavior',
  );
});
