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

test('OpenAPI exposes read-only DelegateKeyRegistry registration and revocation history endpoints', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const historyRoutes = sectionBetween(spec, '  /v1/delegate-keys/registrations:', '  /v1/delegate-keys:');
  const historyComponents = sectionBetween(spec, '    DelegateKeyRegistrationHistoryResponse:', '    DelegateKeyListResponse:');

  for (const requiredText of [
    'summary: List read-only DelegateKeyRegistry registration history',
    'summary: List read-only DelegateKeyRegistry revocation history',
    'source: delegatekeyregistry-event-projection',
    'settlementMode: mock',
    'mock rows keep settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl null',
    'real Quai rows require settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl',
    '$ref: "#/components/schemas/DelegateKeyRegistrationHistoryResponse"',
    '$ref: "#/components/schemas/DelegateKeyRevocationHistoryResponse"',
    '"200":',
  ]) {
    assert.ok(historyRoutes.includes(requiredText), `delegate-key history routes should include ${requiredText}`);
  }

  for (const requiredText of [
    'DelegateKeyRegistrationHistoryResponse:',
    'DelegateKeyRevocationHistoryResponse:',
    'required: [registrations, source, projectionType, eventName, custody, permissions, settlementMode, settlementTx, blockNumber, blockHash, eventIndex, explorerUrl, delegateCanWithdraw, delegateCanAdmin, realQuaiTransactions, walletRequired, fundsMoved, tradingVaultMutation, delegateKeyRegistryMutation, safetyNotice]',
    'required: [revocations, source, projectionType, eventName, custody, permissions, settlementMode, settlementTx, blockNumber, blockHash, eventIndex, explorerUrl, delegateCanWithdraw, delegateCanAdmin, realQuaiTransactions, walletRequired, fundsMoved, tradingVaultMutation, delegateKeyRegistryMutation, safetyNotice]',
    '$ref: "#/components/schemas/DelegateKeyRegisteredProjection"',
    '$ref: "#/components/schemas/DelegateKeyRevokedProjection"',
    'enum: [delegatekeyregistry-event-projection]',
    'enum: [DelegateKeyRegisteredProjection]',
    'enum: [DelegateKeyRevokedProjection]',
    'enum: [DelegateKeyRegistered]',
    'enum: [DelegateKeyRevoked]',
    'enum: [mock]',
    'enum: [READ_ONLY, NO_WITHDRAW, NO_ADMIN]',
    'enum: [non-custodial-no-withdrawal-authority]',
    'delegateCanWithdraw:',
    'delegateCanAdmin:',
    'delegateKeyRegistryMutation:',
    'Read-only DelegateKeyRegistry DelegateKeyRegistered history projection: mock rows have no real Quai transaction, no wallet loaded, no live DelegateKeyRegistry mutation, no funds moved, and no delegate withdrawal/admin authority.',
    'Read-only DelegateKeyRegistry DelegateKeyRevoked history projection: mock rows have no real Quai transaction, no wallet loaded, no live DelegateKeyRegistry mutation, no funds moved, and no delegate withdrawal/admin authority.',
  ]) {
    assert.ok(historyComponents.includes(requiredText), `delegate-key history components should include ${requiredText}`);
  }
});

test('delegate docs, readiness plan, contracts, architecture, and campaign status mark history API visibility without wallet behavior', async () => {
  const delegateDoc = await readText('docs/delegate-keys.md');
  const plan = await readText('docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md');
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'Read-only DelegateKeyRegistry history API',
    'GET /v1/delegate-keys/registrations',
    'GET /v1/delegate-keys/revocations',
    'source: delegatekeyregistry-event-projection',
    'projectionType: DelegateKeyRegisteredProjection | DelegateKeyRevokedProjection',
    'settlementMode: mock',
    'settlementTx: null',
    'blockNumber: null',
    'blockHash: null',
    'eventIndex: null',
    'explorerUrl: null',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'delegateCanWithdraw: false',
    'delegateCanAdmin: false',
    'delegateKeyRegistryMutation: false',
    'no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement',
  ]) {
    assert.ok(delegateDoc.includes(requiredText), `docs/delegate-keys.md should include ${requiredText}`);
  }

  assert.ok(
    plan.includes('Completed: read-only delegate-key registration/revocation history API envelopes'),
    'post-delegate readiness plan should mark the history API envelope slice complete',
  );
  assert.ok(
    contracts.includes('read-only DelegateKeyRegistry history API envelopes, the terminal UI read-only delegate-key history panel, and the local API + terminal UI delegate-key history smoke now expose `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`'),
    'contracts docs should point to completed delegate-key history API envelopes, terminal UI panel, and REST smoke',
  );
  assert.ok(
    architecture.includes('Read-only DelegateKeyRegistry history API surfaces, the terminal UI read-only delegate-key history panel, and the local API + terminal UI delegate-key history smoke now expose `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`'),
    'architecture docs should point to completed delegate-key history API envelopes, terminal UI panel, and REST smoke',
  );
  assert.ok(
    status.includes('Completed previous run: read-only DelegateKeyRegistry registration/revocation projection schema ratchet'),
    'campaign status should retain the DelegateKeyRegistry projection schema ratchet as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: read-only delegate-key registration/revocation history API envelopes'),
    'campaign status should retain the delegate-key history API slice as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: read-only TypeScript/Python/qdex delegate-key history clients'),
    'campaign status should move to delegate-key history client exposure after API visibility',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI read-only delegate-key history panel'),
    'campaign status should retain the terminal UI delegate-key history panel after client exposure',
  );
  assert.ok(
    status.includes('Completed this run: local API + terminal UI delegate-key history integration smoke'),
    'campaign status should checkpoint the delegate-key history REST smoke after the static panel',
  );
  assert.ok(
    status.includes('Next autonomous slice: private DelegateKeyRegistry registration/revocation WebSocket snapshot alignment'),
    'campaign status should point beyond the REST smoke to the stream alignment boundary',
  );

  const staleNextSlice = /Next local\/source-only step: read-only delegate-key registration\/revocation history API envelopes|Next bounded local\/source-only slice: read-only delegate-key registration\/revocation history API envelopes|Next safe local\/source-only surface: read-only delegate-key registration\/revocation history API envelopes/;
  assert.doesNotMatch(
    `${delegateDoc}\n${plan}\n${contracts}\n${architecture}`,
    staleNextSlice,
    'docs should not keep completed delegate-key history API envelopes as the next autonomous slice',
  );
});
