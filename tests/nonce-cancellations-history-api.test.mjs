import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const sectionBetween = (text, startMarker, endMarker) => {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker ${endMarker}`);
  return text.slice(start, end);
};

test('OpenAPI exposes read-only NonceManager cancellation history endpoint', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const nonceHistoryRoute = sectionBetween(spec, '  /v1/nonces/cancellations:', '  /v1/fills:');
  const historyComponents = sectionBetween(spec, '    NonceCancellationHistoryResponse:', '    DelegateKeyRegistrationHistoryResponse:');

  for (const requiredText of [
    'summary: List read-only NonceManager cancellation history',
    'source: nonce-manager-event-projection',
    'settlementMode: mock',
    'mock rows keep settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl null',
    'real Quai rows require settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl',
    '$ref: "#/components/schemas/NonceCancellationHistoryResponse"',
    '"200":',
  ]) {
    assert.ok(nonceHistoryRoute.includes(requiredText), `nonce cancellation history route should include ${requiredText}`);
  }

  for (const requiredText of [
    'NonceCancellationHistoryResponse:',
    'required: [cancellations, source, projectionType, eventName, custody, permissions, settlementMode, settlementTx, blockNumber, blockHash, eventIndex, explorerUrl, realQuaiTransactions, walletRequired, fundsMoved, nonceManagerMutation, tradingVaultMutation, safetyNotice]',
    '$ref: "#/components/schemas/NonceCancelledProjection"',
    '$ref: "#/components/schemas/NonceRangeCancelledProjection"',
    'enum: [nonce-manager-event-projection]',
    'enum: [NonceCancelledProjection, NonceRangeCancelledProjection]',
    'enum: [NonceCancelled, NonceRangeCancelled]',
    'enum: [mock]',
    'enum: [READ_ONLY, NO_WITHDRAW, NO_ADMIN]',
    'enum: [non-custodial-no-withdrawal-authority]',
    'fundsMoved:',
    'nonceManagerMutation:',
    'tradingVaultMutation:',
    'Read-only NonceManager cancellation history projection: mock rows have no real Quai transaction, no wallet loaded, no funds moved, no NonceManager mutation, and no delegate withdrawal/admin authority.',
  ]) {
    assert.ok(historyComponents.includes(requiredText), `nonce cancellation history components should include ${requiredText}`);
  }

  assert.doesNotMatch(
    historyComponents,
    /rpcUrl\s*:|broadcast|transaction submission|fundsMoved:\s*\n\s*type:\s*boolean\s*\n\s*enum:\s*\[true\]/i,
    'history schemas must not introduce signing/RPC/broadcast/funds-moved behavior',
  );
});

test('nonce docs and campaign status mark read-only history API visibility without wallet behavior', async () => {
  const nonceDoc = await readText('docs/nonce-operations.md');
  const plan = await readText('docs/plans/2026-06-08-post-nonce-cancel-owner-signed-readiness.md');
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'Read-only nonce cancellation history API',
    'GET /v1/nonces/cancellations',
    'source: nonce-manager-event-projection',
    'projectionType: NonceCancelledProjection | NonceRangeCancelledProjection',
    'settlementMode: mock',
    'settlementTx: null',
    'blockNumber: null',
    'blockHash: null',
    'eventIndex: null',
    'explorerUrl: null',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, NonceManager mutation, or funds movement',
  ]) {
    assert.ok(nonceDoc.includes(requiredText), `docs/nonce-operations.md should include ${requiredText}`);
  }

  assert.ok(
    plan.includes('Completed: read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` history API envelopes'),
    'post-nonce-cancel plan should mark the history API envelope slice complete',
  );
  assert.ok(
    contracts.includes('Read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` history REST envelope now exposes `GET /v1/nonces/cancellations`'),
    'contracts docs should point to completed nonce cancellation history REST envelope',
  );
  assert.ok(
    architecture.includes('read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` history REST surface now exposes `GET /v1/nonces/cancellations`'),
    'architecture docs should point to completed nonce cancellation history REST surface',
  );
  assert.ok(
    status.includes('Completed this run: read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` history API envelopes'),
    'campaign status should retain the nonce cancellation history API checkpoint',
  );
});

test('nonce cancellation history API preserves non-custodial invariants', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const route = sectionBetween(spec, '  /v1/nonces/cancellations:', '  /v1/fills:');
  const components = sectionBetween(spec, '    NonceCancellationHistoryResponse:', '    DelegateKeyRegistrationHistoryResponse:');

  // Must reference existing projection schemas, not create new wallet/RPC paths
  assert.ok(route.includes('$ref: "#/components/schemas/NonceCancellationHistoryResponse"'));
  assert.ok(components.includes('$ref: "#/components/schemas/NonceCancelledProjection"'));
  assert.ok(components.includes('$ref: "#/components/schemas/NonceRangeCancelledProjection"'));

  // Must preserve mock-only settlement mode
  assert.ok(components.includes('enum: [mock]'));

  // Must preserve read-only permissions
  assert.ok(components.includes('enum: [READ_ONLY, NO_WITHDRAW, NO_ADMIN]'));

  // Must preserve false flags for funds/mutation
  assert.ok(components.includes('enum: [false]'));

  // Must not introduce positive wallet/RPC/broadcast behavior (only "no" negations allowed)
  assert.doesNotMatch(route, /\brpcUrl\s*:|broadcast.*:|signing\s*:|transaction submission\s*:/i);
  assert.doesNotMatch(components, /enum:\s*\[true\]/, 'no true flags in safety fields');
});