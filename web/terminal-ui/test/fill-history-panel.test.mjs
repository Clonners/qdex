import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import {
  createMockFillHistoryFixture,
  normalizeFillHistoryPanelFixture,
} from '../src/fill-history-panel.js';
import { renderTradeProofPanel } from '../src/render.js';

const repoRoot = new URL('../../../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const requiredSafetyFields = Object.freeze({
  source: 'in-memory-indexer-projection',
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
});

test('createMockFillHistoryFixture returns frozen mock fixture with no fills', () => {
  const fixture = createMockFillHistoryFixture();

  assert.equal(fixture.source, 'in-memory-indexer-projection');
  assert.equal(fixture.custody, 'non-custodial');
  assert.deepEqual(fixture.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(fixture.projectionType, 'IndexedFillProjection');
  assert.equal(fixture.eventName, 'Fill');
  assert.equal(fixture.settlementMode, 'mock');
  assert.equal(fixture.realQuaiTransactions, false);
  assert.equal(fixture.walletRequired, false);
  assert.equal(fixture.fundsMoved, false);
  assert.equal(fixture.tradingVaultMutation, false);
  assert.match(fixture.safetyNotice, /Read-only IndexedFillProjection fill history/);
  assert.deepEqual(fixture.fills, []);
  assert.throws(() => { fixture.fills.push({}); }, /not extensible|frozen/);
  assert.throws(() => { fixture.fills = []; }, /read only|not extensible|frozen/);
});

test('normalizeFillHistoryPanelFixture normalizes empty fixture from mock', () => {
  const normalized = normalizeFillHistoryPanelFixture(createMockFillHistoryFixture());

  assert.equal(normalized.source, 'in-memory-indexer-projection');
  assert.equal(normalized.custody, 'non-custodial');
  assert.deepEqual(normalized.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(normalized.projectionType, 'IndexedFillProjection');
  assert.equal(normalized.eventName, 'Fill');
  assert.equal(normalized.settlementMode, 'mock');
  assert.equal(normalized.realQuaiTransactions, false);
  assert.equal(normalized.walletRequired, false);
  assert.equal(normalized.fundsMoved, false);
  assert.equal(normalized.tradingVaultMutation, false);
  assert.deepEqual(normalized.fills, []);
});

test('normalizeFillHistoryPanelFixture normalizes fills array', () => {
  const mockFill = Object.freeze({
    fillId: 'fill-000001',
    tradeId: 'trade-000001',
    marketId: 'WQUAI-WQI',
    side: 'buy',
    price: '5',
    amount: '100',
    makerFee: '0',
    takerFee: '0',
  });

  const normalized = normalizeFillHistoryPanelFixture({
    ...createMockFillHistoryFixture(),
    fills: [mockFill],
  });

  assert.equal(normalized.fills.length, 1);
  assert.equal(normalized.fills[0].fillId, mockFill.fillId);
  assert.equal(normalized.fills[0].side, 'buy');
  assert.equal(normalized.fills[0].price, '5');
  assert.equal(normalized.fills[0].amount, '100');
  assert.equal(normalized.projectionType, 'IndexedFillProjection');
  assert.equal(normalized.realQuaiTransactions, false);
  assert.equal(normalized.fundsMoved, false);
  assert.throws(() => { normalized.fills.push({}); }, /not extensible|frozen/);
});

test('normalizeFillHistoryPanelFixture defaults to safety values for missing fields', () => {
  const normalized = normalizeFillHistoryPanelFixture({});

  assert.equal(normalized.source, 'in-memory-indexer-projection');
  assert.equal(normalized.custody, 'non-custodial');
  assert.deepEqual(normalized.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
  assert.equal(normalized.projectionType, 'IndexedFillProjection');
  assert.equal(normalized.eventName, 'Fill');
  assert.equal(normalized.settlementMode, 'mock');
  assert.equal(normalized.realQuaiTransactions, false);
  assert.equal(normalized.walletRequired, false);
  assert.equal(normalized.fundsMoved, false);
  assert.equal(normalized.tradingVaultMutation, false);
  assert.deepEqual(normalized.fills, []);
});

test('normalizeFillHistoryPanelFixture rejects unsafe permission overrides', () => {
  const mockFill = Object.freeze({
    fillId: 'fill-000002',
    tradeId: 'trade-000002',
    marketId: 'WQUAI-WQI',
    side: 'sell',
    price: '5.01',
    amount: '200',
  });

  const normalized = normalizeFillHistoryPanelFixture({
    fills: [mockFill],
    permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
    fundsMoved: false,
    realQuaiTransactions: false,
  });

  assert.equal(normalized.fills.length, 1);
  assert.equal(normalized.fills[0].side, 'sell');
  assert.equal(normalized.fundsMoved, false);
  assert.equal(normalized.realQuaiTransactions, false);
  assert.deepEqual(normalized.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
});

test('mock terminal UI fixture carries empty read-only fill history envelope', () => {
  assert.ok(mockVerticalSliceFixture.fillHistory, 'static fixture should carry fill history panel metadata');

  const normalized = normalizeFillHistoryPanelFixture(mockVerticalSliceFixture.fillHistory);

  assert.deepEqual(normalized.fills, []);
  assert.equal(normalized.projectionType, 'IndexedFillProjection');
  assert.equal(normalized.eventName, 'Fill');

  for (const [key, expected] of Object.entries(requiredSafetyFields)) {
    assert.deepEqual(normalized[key], expected, `${key} should preserve the read-only fill history safety envelope`);
  }
  assert.match(normalized.safetyNotice, /Read-only IndexedFillProjection fill history/);
  assert.match(normalized.safetyNotice, /no real Quai transaction/i);
  assert.match(normalized.safetyNotice, /no wallet loaded/i);
  assert.match(normalized.safetyNotice, /no funds moved/i);
});

test('renderTradeProofPanel renders read-only fill history without implying wallet, tx, or funds behavior', () => {
  const fixture = {
    ...mockVerticalSliceFixture,
    fillHistory: createMockFillHistoryFixture(),
  };
  const html = renderTradeProofPanel(fixture);

  for (const requiredText of [
    /read-only fill history/i,
    /in-memory-indexer-projection/,
    /IndexedFillProjection/,
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
    /no fill history rows yet/i,
    /no wallet loaded, no funds moved/i,
  ]) {
    assert.match(html, requiredText);
  }

  assert.doesNotMatch(html, /wallet connected for fill history/i);
  assert.doesNotMatch(html, /WITHDRAW, ADMIN/);
});

test('terminal UI docs and campaign status mark fill history panel complete and keep next slice local-only', async () => {
  const readme = await readText('web/terminal-ui/README.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'src/fill-history-panel.js',
    'read-only IndexedFillProjection fill history',
    'IndexedFillProjection',
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
    status.includes('Completed this run: terminal UI read-only trade/fill history panel'),
    'campaign status should retain the terminal UI fill history panel checkpoint',
  );
  assert.doesNotMatch(
    `${readme}\n${status}`,
    /walletPrivateKey|rpcUrl\s*:|signing key|broadcast transaction|funds moved by UI/i,
    'terminal UI fill history docs/status must not claim wallet/RPC/signing/broadcast/funds behavior',
  );
});
