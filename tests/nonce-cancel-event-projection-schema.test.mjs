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

test('indexer schema pins read-only NonceManager NonceCancelled/NonceRangeCancelled event projections', async () => {
  const schema = await readText('services/indexer/schema.md');
  const nonceProjectionSection = sectionBetween(
    schema,
    "### NonceManager `NonceCancelled`/`NonceRangeCancelled` event projections",
    '## Projection flow',
  );

  for (const requiredText of [
    'NonceCancelledProjection',
    'NonceRangeCancelledProjection',
    'source: nonce-manager-event-projection',
    'eventName: NonceCancelled | NonceRangeCancelled',
    'owner',
    'action: cancelNonce | cancelNonceRange',
    'nonce',
    'nonceRange',
    'nonceManagerContract',
    'nonceManager: contract-event-truth',
    'settlementMode: mock | quai_contract',
    'mock rows keep settlementTx = null, blockNumber = null, blockHash = null, eventIndex = null, and explorerUrl = null',
    'real rows require settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl',
    'permissions: NO_WITHDRAW | NO_ADMIN',
    'fundsMovedByProjection: false',
    'nonceManagerMutationByProjection: false',
    'tradingVaultMutationByProjection: false',
    'walletRequired: false',
    'The projection is read-only event truth, not owner-signed mutation authority',
    'matcher_local_order_cancelled',
    'matcher_local_orders_cancelled',
    'matcher-local-cancel-only-on-chain-nonce-unchanged',
  ]) {
    assert.ok(
      nonceProjectionSection.includes(requiredText),
      `NonceManager projection schema should include ${requiredText}`,
    );
  }
});

test('OpenAPI defines event-shaped NonceManager NonceCancelled and NonceRangeCancelled projection components', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const projectionComponents = sectionBetween(spec, '    NonceCancelledProjection:', '    DelegateKeyRegistrationHistoryResponse:');

  for (const requiredText of [
    'NonceCancelledProjection:',
    'description: Read-only NonceManager NonceCancelled event projection',
    'NonceRangeCancelledProjection:',
    'description: Read-only NonceManager NonceRangeCancelled event projection',
    'required: [projectionType, sourceEventId, eventName, owner, action, nonce, nonceRange, nonceManagerContract, nonceManager, permissions, settlementMode, settlementTx, blockNumber, blockHash, eventIndex, explorerUrl, custody, realQuaiTransactions, walletRequired, fundsMoved, nonceManagerMutation, tradingVaultMutation, safetyNotice]',
    'enum: [NonceCancelledProjection]',
    'enum: [NonceRangeCancelledProjection]',
    'enum: [NonceCancelled]',
    'enum: [NonceRangeCancelled]',
    'enum: [cancelNonce]',
    'enum: [cancelNonceRange]',
    'enum: [mock, quai_contract]',
    'mock rows set settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl to null',
    'real Quai rows require settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl',
    'enum: [NO_WITHDRAW, NO_ADMIN]',
    'enum: [non-custodial-no-withdrawal-authority]',
    'enum: [contract-event-truth]',
    'nonceManagerMutation:',
    'tradingVaultMutation:',
    'no wallet loaded, no live NonceManager mutation, no funds moved, and no delegate withdrawal/admin authority',
  ]) {
    assert.ok(
      projectionComponents.includes(requiredText),
      `OpenAPI NonceManager projection components should include ${requiredText}`,
    );
  }

  assert.doesNotMatch(
    projectionComponents,
    /rpcUrl\s*:|broadcast|transaction submission|fundsMoved:\s*\n\s*type:\s*boolean\s*\n\s*enum:\s*\[true\]/i,
    'projection schemas must not introduce signing/RPC/broadcast/funds-moved behavior',
  );
});

test('nonce-cancel docs, readiness plan, and campaign status mark projection schema complete without wallet behavior', async () => {
  const plan = await readText('docs/plans/2026-06-08-post-nonce-cancel-owner-signed-readiness.md');
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  assert.ok(
    plan.includes('Completed: read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` projection schema ratchet'),
    'post-nonce-cancel plan should mark the schema ratchet complete',
  );
  assert.ok(
    contracts.includes('read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` projection schema is now pinned'),
    'contracts docs should point to completed nonce-cancel event-projection schema',
  );
  assert.ok(
    architecture.includes('read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` projection schema is pinned'),
    'architecture docs should point to completed nonce-cancel event-projection schema',
  );
  assert.ok(
    status.includes('Completed this run: post-nonce-cancel owner-signed readiness docs'),
    'campaign status should retain the post-nonce-cancel readiness docs checkpoint',
  );
  assert.ok(
    status.includes('Completed this run: read-only NonceManager `NonceCancelled`/`NonceRangeCancelled` projection schema ratchet'),
    'campaign status should checkpoint the nonce-cancel projection schema slice',
  );

  const staleNextSlice = /Next autonomous slice: read-only NonceManager `NonceCancelled`\/`NonceRangeCancelled` projection schema ratchet/;
  assert.doesNotMatch(
    `${plan}\n${contracts}\n${architecture}`,
    staleNextSlice,
    'docs should not keep completed nonce-cancel projection schema as the next autonomous slice',
  );
});
