import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  createMockFeePolicyFixture,
  normalizeFeePolicyPanelFixture,
} from '../src/fee-policy-panel.js';
import { renderTradeProofPanel } from '../src/render.js';

const repoRoot = new URL('../../../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const requiredSafetyFields = Object.freeze({
  source: 'feemanager-policy-projection',
  status: 'local-only-not-deployed',
  custody: 'non-custodial-fee-policy',
  permissions: Object.freeze(['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']),
  hardMaxFeeBps: 1000,
  feeRecipient: null,
  feeManagerMutation: false,
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
});

const requiredScheduleFields = Object.freeze({
  marketId: 'WQUAI-WQI',
  projectionType: 'FeeScheduleProjection',
  eventName: 'FeesUpdated',
  makerFeeBps: 0,
  takerFeeBps: 0,
  maxFeeBps: 1000,
  feeRecipient: null,
  settlementMode: 'mock',
  settlementTx: null,
  blockNumber: null,
  blockHash: null,
  eventIndex: null,
  explorerUrl: null,
});

test('mock terminal UI fixture carries read-only FeeManager fee schedule metadata', () => {
  assert.ok(mockVerticalSliceFixture.feePolicy, 'static fixture should carry FeeManager fee policy metadata');

  const normalized = normalizeFeePolicyPanelFixture(mockVerticalSliceFixture.feePolicy);

  for (const [key, expected] of Object.entries(requiredSafetyFields)) {
    assert.deepEqual(normalized[key], expected, `${key} should preserve the FeeManager read-only safety envelope`);
  }

  assert.equal(normalized.feeSchedules.length, 1);
  for (const [key, expected] of Object.entries(requiredScheduleFields)) {
    assert.deepEqual(
      normalized.feeSchedules[0][key],
      expected,
      `${key} should preserve the local/mock FeeScheduleProjection row`,
    );
  }
  assert.equal(normalized.safety.noWalletLoading, true);
  assert.equal(normalized.safety.noRpcUrlAccess, true);
  assert.equal(normalized.safety.noSigning, true);
  assert.equal(normalized.safety.noBroadcast, true);
  assert.equal(normalized.safety.noDeploys, true);
  assert.equal(normalized.safety.noTransactionSubmission, true);
  assert.equal(normalized.safety.noFundsMovement, true);
  assert.equal(normalized.safety.noFeeAuthorityRuntimeKeys, true);
  assert.match(normalized.safety.notice, /Read-only FeeManager schedule metadata/i);
  assert.match(normalized.safety.notice, /no fee-authority key/i);
});

test('renderTradeProofPanel renders read-only FeeManager policy without implying mutation, wallet, tx, or funds behavior', () => {
  const fixture = {
    ...mockVerticalSliceFixture,
    feePolicy: createMockFeePolicyFixture(),
  };
  const html = renderTradeProofPanel(fixture);

  for (const requiredText of [
    /read-only FeeManager fee schedule/i,
    /feemanager-policy-projection/,
    /FeeScheduleProjection/,
    /FeesUpdated/,
    /WQUAI-WQI/,
    /maker fee bps[\s\S]*0/i,
    /taker fee bps[\s\S]*0/i,
    /hard max fee bps[\s\S]*1000/i,
    /fee recipient[\s\S]*null \(local\/mock\)/i,
    /READ_ONLY, NO_WITHDRAW, NO_ADMIN/,
    /settlementMode[\s\S]*mock/i,
    /settlement tx[\s\S]*null \(local\/mock\)/i,
    /block[\s\S]*null \(local\/mock\)/i,
    /event index[\s\S]*null \(local\/mock\)/i,
    /explorer[\s\S]*null \(local\/mock\)/i,
    /feeManagerMutation[\s\S]*false/i,
    /TradingVault mutation[\s\S]*false/i,
    /real Quai tx[\s\S]*false/i,
    /wallet required[\s\S]*false/i,
    /funds moved[\s\S]*false/i,
    /no wallet loaded/i,
    /no fee-authority key/i,
    /no TradingVault mutation/i,
  ]) {
    assert.match(html, requiredText);
  }

  assert.doesNotMatch(html, /FeeManager\.updateFees submitted/i);
  assert.doesNotMatch(html, /fee authority key loaded/i);
  assert.doesNotMatch(html, /wallet connected for fees/i);
  assert.doesNotMatch(html, /WITHDRAW, ADMIN/);
});

test('terminal UI docs, package check, and campaign status mark fee policy panel complete', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const packageJson = await readText('web/terminal-ui/package.json');
  const status = await readText('CAMPAIGN_STATUS.md');
  const feesDoc = await readText('docs/fees.md');

  for (const requiredText of [
    'src/fee-policy-panel.js',
    'read-only FeeManager fee schedule panel',
    'GET /v1/fees',
    'source: feemanager-policy-projection',
    'FeeScheduleProjection',
    'eventName: FeesUpdated',
    'hardMaxFeeBps: 1000',
    'feeRecipient: null',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'feeManagerMutation: false',
    'tradingVaultMutation: false',
    'realQuaiTransactions: false',
    'walletRequired: false',
    'fundsMoved: false',
    'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
  ]) {
    assert.ok(readme.includes(requiredText), `terminal UI README should include ${requiredText}`);
  }

  assert.ok(
    packageJson.includes('node --check src/fee-policy-panel.js'),
    'terminal UI package check should syntax-check the FeeManager fee policy panel module',
  );
  assert.ok(
    feesDoc.includes('Terminal UI exposure complete: `web/terminal-ui/src/fee-policy-panel.js`'),
    'fees docs should mark the terminal UI FeeManager panel complete',
  );
  assert.ok(
    status.includes('Completed previous run: read-only FeeManager fee schedule clients'),
    'campaign status should retain the FeeManager client exposure checkpoint as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI read-only FeeManager fee schedule exposure'),
    'campaign status should retain this terminal UI FeeManager panel slice as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: read-only FeeManager fee schedule WebSocket snapshot alignment'),
    'campaign status should checkpoint the FeeManager WebSocket snapshot alignment',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI binding for the FeeManager fee schedule stream'),
    'campaign status should retain the terminal UI FeeManager stream binding as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI FeeManager fee schedule stream integration smoke'),
    'campaign status should mark the FeeManager stream smoke complete',
  );
  assert.ok(
    status.includes('Completed previous run: Python SDK FeeManager fee schedule stream consumers'),
    'campaign status should advance past FeeManager stream smoke to SDK/CLI consumers',
  );

  assert.doesNotMatch(
    `${readme}\n${feesDoc}\n${status}`,
    /feeAuthorityKey|rpcUrl\s*:|signing key|broadcast transaction|FeeManager mutation submitted|funds moved by UI/i,
    'terminal UI fee policy docs/status must not claim wallet/RPC/signing/broadcast/mutation/funds behavior',
  );
});
