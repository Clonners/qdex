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

test('indexer schema pins read-only DelegateKeyRegistry registration/revocation projections', async () => {
  const schema = await readText('services/indexer/schema.md');
  const delegateProjectionSection = sectionBetween(
    schema,
    '### DelegateKeyRegistry registration/revocation event projections',
    '### orders',
  );

  for (const requiredText of [
    'DelegateKeyRegisteredProjection',
    'DelegateKeyRevokedProjection',
    'source: delegatekeyregistry-event-projection',
    'eventName: DelegateKeyRegistered | DelegateKeyRevoked',
    'owner',
    'delegate',
    'expiresAt',
    'allowedMarketsHash',
    'maxNotional',
    'settlementMode: mock | quai_contract',
    'mock rows keep settlementTx = null, blockNumber = null, blockHash = null, eventIndex = null, and explorerUrl = null',
    'real rows require settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl',
    'permissions: READ_ONLY | PLACE_ORDER | CANCEL_ORDER | CANCEL_ALL | NO_WITHDRAW | NO_ADMIN',
    'delegateCanWithdraw: false',
    'delegateCanAdmin: false',
    'fundsMovedByProjection: false',
    'tradingVaultMutationByProjection: false',
    'delegateKeyRegistryMutationByProjection: false',
    'The projection is read-only event truth, not owner-signed mutation authority',
  ]) {
    assert.ok(
      delegateProjectionSection.includes(requiredText),
      `DelegateKeyRegistry projection schema should include ${requiredText}`,
    );
  }
});

test('OpenAPI defines event-shaped DelegateKeyRegistry projection components', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const projectionComponents = sectionBetween(spec, '    DelegateKeyRegisteredProjection:', '    DelegateKeyListResponse:');

  for (const requiredText of [
    'DelegateKeyRegisteredProjection:',
    'description: Read-only DelegateKeyRegistry DelegateKeyRegistered event projection',
    'DelegateKeyRevokedProjection:',
    'description: Read-only DelegateKeyRegistry DelegateKeyRevoked event projection',
    'required: [projectionType, sourceEventId, eventName, owner, delegate, expiresAt, allowedMarketsHash, maxNotional, permissions, settlementMode, settlementTx, blockNumber, blockHash, eventIndex, explorerUrl, custody, delegateCanWithdraw, delegateCanAdmin, realQuaiTransactions, walletRequired, fundsMoved, tradingVaultMutation, delegateKeyRegistryMutation, safetyNotice]',
    'required: [projectionType, sourceEventId, eventName, owner, delegate, revoked, permissions, settlementMode, settlementTx, blockNumber, blockHash, eventIndex, explorerUrl, custody, delegateCanWithdraw, delegateCanAdmin, realQuaiTransactions, walletRequired, fundsMoved, tradingVaultMutation, delegateKeyRegistryMutation, safetyNotice]',
    'enum: [DelegateKeyRegisteredProjection]',
    'enum: [DelegateKeyRevokedProjection]',
    'enum: [DelegateKeyRegistered]',
    'enum: [DelegateKeyRevoked]',
    'enum: [mock, quai_contract]',
    'mock rows set settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl to null',
    'real Quai rows require settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl',
    'enum: [READ_ONLY, PLACE_ORDER, CANCEL_ORDER, CANCEL_ALL, NO_WITHDRAW, NO_ADMIN]',
    'enum: [non-custodial-no-withdrawal-authority]',
    'delegateCanWithdraw:',
    'delegateCanAdmin:',
    'delegateKeyRegistryMutation:',
    'no wallet loaded, no live DelegateKeyRegistry mutation, no funds moved, and no delegate withdrawal/admin authority',
  ]) {
    assert.ok(
      projectionComponents.includes(requiredText),
      `OpenAPI DelegateKeyRegistry projection components should include ${requiredText}`,
    );
  }

  assert.doesNotMatch(
    projectionComponents,
    /rpcUrl\s*:|signature|broadcast|transaction submission|delegateCanWithdraw:\s*\n\s*type:\s*boolean\s*\n\s*enum:\s*\[true\]/i,
    'projection schemas must not introduce signing/RPC/broadcast/delegate-withdraw behavior',
  );
});

test('delegate docs, readiness plan, and campaign status mark projection schema complete without wallet behavior', async () => {
  const delegateDoc = await readText('docs/delegate-keys.md');
  const plan = await readText('docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md');
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'Read-only DelegateKeyRegistry event projections',
    'DelegateKeyRegisteredProjection',
    'DelegateKeyRevokedProjection',
    'source: delegatekeyregistry-event-projection',
    'event-truth rows only',
    'mock rows keep settlementTx/blockNumber/blockHash/eventIndex/explorerUrl null',
    'real rows require settlementTx, blockNumber, blockHash, eventIndex, explorerUrl',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement',
  ]) {
    assert.ok(delegateDoc.includes(requiredText), `docs/delegate-keys.md should include ${requiredText}`);
  }

  assert.ok(
    plan.includes('Completed: read-only DelegateKeyRegistry `DelegateKeyRegistered`/`DelegateKeyRevoked` projection schema ratchet'),
    'post-delegate plan should mark the schema ratchet complete',
  );
  assert.ok(
    contracts.includes('read-only DelegateKeyRegistry `DelegateKeyRegistered`/`DelegateKeyRevoked` projection schema is now pinned'),
    'contracts docs should point to completed delegate-key event-projection schema',
  );
  assert.ok(
    architecture.includes('read-only DelegateKeyRegistry `DelegateKeyRegistered`/`DelegateKeyRevoked` projection schema is pinned'),
    'architecture docs should point to completed delegate-key event-projection schema',
  );
  assert.ok(
    status.includes('Completed previous run: post-delegate-key owner-signed readiness docs'),
    'campaign status should retain the post-delegate-key readiness checkpoint as previous work',
  );
  assert.ok(
    status.includes('Completed this run: read-only DelegateKeyRegistry registration/revocation projection schema ratchet'),
    'campaign status should checkpoint the DelegateKeyRegistry projection schema slice',
  );
  assert.ok(
    status.includes('Next autonomous slice: read-only delegate-key registration/revocation history API envelopes'),
    'campaign status should move to delegate-key history API visibility after the schema ratchet',
  );

  const staleNextSlice = /Next bounded local\/source-only slice: read-only DelegateKeyRegistry `DelegateKeyRegistered`\/`DelegateKeyRevoked` projection schema ratchet|The next safe local\/source-only slice is a read-only DelegateKeyRegistry `DelegateKeyRegistered`\/`DelegateKeyRevoked` projection schema ratchet/;
  assert.doesNotMatch(
    `${delegateDoc}\n${plan}\n${contracts}\n${architecture}`,
    staleNextSlice,
    'docs should not keep completed DelegateKeyRegistry projection schema as the next autonomous slice',
  );
});
