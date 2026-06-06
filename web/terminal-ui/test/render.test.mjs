import assert from 'node:assert/strict';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

test('renderTradeProofPanel shows the confirmed mock trade and proof without implying real settlement', () => {
  const html = renderTradeProofPanel(mockVerticalSliceFixture);

  assert.match(html, /trade-000001/);
  assert.match(html, /fill-000001/);
  assert.match(html, /QI-QUAI/);
  assert.match(html, /price[^<]*5/i);
  assert.match(html, /amount[^<]*100/i);
  assert.match(html, /\/v1\/proofs\/trades\/trade-000001/);
  assert.match(html, /settlementMode[^<]*mock/i);
  assert.match(html, /mock settlement confirmed/i);
  assert.match(html, /mock reference/i);
  assert.match(html, /mock-settlement-fill-000001/);
  assert.match(html, /settlement tx[\s\S]*null \(mock\)/i);
  assert.doesNotMatch(html, /settlement tx<\/dt><dd><code>mock-settlement-fill-000001<\/code>/i);
  assert.equal(Object.hasOwn(mockVerticalSliceFixture.fill, 'createdAt'), false);
  assert.equal(mockVerticalSliceFixture.fill.sourceEventId, 'event-000001');
  assert.equal(mockVerticalSliceFixture.sources.fills, 'in-memory-indexer-projection');
  assert.equal(mockVerticalSliceFixture.sources.trades, 'in-memory-indexer-projection');
  assert.equal(mockVerticalSliceFixture.sources.proof, 'proof-service-indexer-projection');
  assert.match(html, /fill source[\s\S]*in-memory-indexer-projection/i);
  assert.match(html, /source event[\s\S]*event-000001/i);
  assert.match(html, /proof source[\s\S]*proof-service-indexer-projection/i);
  assert.doesNotMatch(html, /createdAt/i);
  assert.match(html, /no real Quai transaction/i);
  assert.match(html, /non-custodial-no-withdrawal-authority/);
  assert.doesNotMatch(html, /explorer\.quai/i);
});

test('renderTradeProofPanel exposes keyboard and command-palette hints for terminal flow', () => {
  const html = renderTradeProofPanel(mockVerticalSliceFixture);

  assert.match(html, /<kbd>\/<\/kbd> search market/);
  assert.match(html, /<kbd>b<\/kbd> buy/);
  assert.match(html, /<kbd>s<\/kbd> sell/);
  assert.match(html, /:buy QI-QUAI 100 @ 5/);
  assert.match(html, /:proof trade-000001/);
  assert.match(html, /&gt; order signed locally/);
  assert.match(html, /&gt; mock settlement reference: mock-settlement-fill-000001/);
});
