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

test('indexer schema pins read-only TradingVault Deposit/Withdraw event projections', async () => {
  const schema = await readText('services/indexer/schema.md');
  const vaultProjectionSection = sectionBetween(schema, '### TradingVault Deposit/Withdraw event projections', '### orders');

  for (const requiredText of [
    'TradingVaultDepositProjection',
    'TradingVaultWithdrawalProjection',
    'sourceEventId',
    'eventName: Deposit | Withdraw',
    'settlementMode: mock | quai_contract',
    'mock rows keep settlementTx = null, blockNumber = null, blockHash = null, eventIndex = null, and explorerUrl = null',
    'real rows require settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl',
    'permissions: READ_ONLY | NO_WITHDRAW | NO_ADMIN',
    'fundsMovedByProjection: false',
    'tradingVaultMutationByProjection: false',
    'walletRequired: false',
    'The projection is read-only event truth, not custody authority',
  ]) {
    assert.ok(vaultProjectionSection.includes(requiredText), `vault projection schema should include ${requiredText}`);
  }
});

test('OpenAPI defines event-shaped TradingVault deposit and withdrawal projection components', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const projectionComponents = sectionBetween(spec, '    TradingVaultDepositProjection:', '    VaultOperationPrepareRequest:');

  for (const requiredText of [
    'TradingVaultDepositProjection:',
    'description: Read-only TradingVault Deposit event projection',
    'TradingVaultWithdrawalProjection:',
    'description: Read-only TradingVault Withdraw event projection',
    'required: [projectionType, sourceEventId, eventName, owner, token, amount, settlementMode, settlementTx, blockNumber, blockHash, eventIndex, explorerUrl, permissions, custody, realQuaiTransactions, walletRequired, fundsMoved, tradingVaultMutation, safetyNotice]',
    'enum: [TradingVaultDepositProjection]',
    'enum: [TradingVaultWithdrawalProjection]',
    'enum: [Deposit]',
    'enum: [Withdraw]',
    'enum: [mock, quai_contract]',
    'mock rows set settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl to null',
    'real Quai rows require settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl',
    'enum: [READ_ONLY, NO_WITHDRAW, NO_ADMIN]',
    'enum: [non-custodial-contract-vault]',
    'fundsMoved:',
    'tradingVaultMutation:',
    'no wallet loaded, no funds moved, and no delegate withdrawal/admin authority',
  ]) {
    assert.ok(projectionComponents.includes(requiredText), `OpenAPI vault projection components should include ${requiredText}`);
  }

  assert.doesNotMatch(
    projectionComponents,
    /privateKey|rpcUrl\s*:|signature|broadcast|transaction submission|fundsMoved:\s*\n\s*type:\s*boolean\s*\n\s*enum:\s*\[true\]/i,
    'projection schemas must not introduce signing/RPC/broadcast/funds-moved behavior',
  );
});

test('vault docs, post-vault plan, and campaign status mark projection schema complete without wallet behavior', async () => {
  const vaultDoc = await readText('docs/vault-operations.md');
  const plan = await readText('docs/plans/2026-06-08-post-vault-owner-wallet-readiness.md');
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'Read-only TradingVault event projections',
    'TradingVaultDepositProjection',
    'TradingVaultWithdrawalProjection',
    'event-truth rows only',
    'mock rows keep settlementTx/blockNumber/blockHash/eventIndex/explorerUrl null',
    'real rows require settlementTx, blockNumber, blockHash, eventIndex, explorerUrl',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, TradingVault mutation, or funds movement',
  ]) {
    assert.ok(vaultDoc.includes(requiredText), `docs/vault-operations.md should include ${requiredText}`);
  }

  assert.ok(
    plan.includes('Completed: read-only TradingVault `Deposit`/`Withdraw` projection schema ratchet'),
    'post-vault plan should mark the schema ratchet complete',
  );
  assert.ok(
    contracts.includes('read-only TradingVault `Deposit`/`Withdraw` projection schema is now pinned'),
    'contracts docs should point to completed event-projection schema',
  );
  assert.ok(
    architecture.includes('read-only TradingVault `Deposit`/`Withdraw` projection schema is pinned'),
    'architecture docs should point to completed event-projection schema',
  );
  assert.ok(
    status.includes('Added read-only TradingVault `Deposit`/`Withdraw` projection schema ratchet'),
    'campaign status should retain the projection schema checkpoint',
  );
  assert.ok(
    status.includes('Completed previous run: local API + terminal UI vault history integration smoke'),
    'campaign status should retain the completed local/source-only vault history smoke slice',
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

  const staleNextSlice = /Next local\/source-only step: read-only TradingVault `Deposit`\/`Withdraw` projection schema ratchet|Recommended next autonomous slice: read-only TradingVault `Deposit`\/`Withdraw` projection schema ratchet/;
  assert.doesNotMatch(
    `${vaultDoc}\n${plan}\n${contracts}\n${architecture}`,
    staleNextSlice,
    'docs should not keep completed projection schema as the next autonomous slice',
  );
});
