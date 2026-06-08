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

test('OpenAPI exposes read-only TradingVault deposit and withdrawal history endpoints', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const vaultHistoryRoutes = sectionBetween(spec, '  /v1/vault/deposits:', '  /v1/vault/deposits/prepare:');
  const historyComponents = sectionBetween(spec, '    TradingVaultDepositHistoryResponse:', '    VaultOperationPrepareRequest:');

  for (const requiredText of [
    'summary: List read-only TradingVault deposit history',
    'summary: List read-only TradingVault withdrawal history',
    'source: tradingvault-event-projection',
    'settlementMode: mock',
    'mock rows keep settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl null',
    'real Quai rows require settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl',
    '$ref: "#/components/schemas/TradingVaultDepositHistoryResponse"',
    '$ref: "#/components/schemas/TradingVaultWithdrawalHistoryResponse"',
    '"200":',
  ]) {
    assert.ok(vaultHistoryRoutes.includes(requiredText), `vault history routes should include ${requiredText}`);
  }

  for (const requiredText of [
    'TradingVaultDepositHistoryResponse:',
    'TradingVaultWithdrawalHistoryResponse:',
    'required: [deposits, source, projectionType, eventName, custody, permissions, settlementMode, settlementTx, blockNumber, blockHash, eventIndex, explorerUrl, realQuaiTransactions, walletRequired, fundsMoved, tradingVaultMutation, safetyNotice]',
    'required: [withdrawals, source, projectionType, eventName, custody, permissions, settlementMode, settlementTx, blockNumber, blockHash, eventIndex, explorerUrl, realQuaiTransactions, walletRequired, fundsMoved, tradingVaultMutation, safetyNotice]',
    '$ref: "#/components/schemas/TradingVaultDepositProjection"',
    '$ref: "#/components/schemas/TradingVaultWithdrawalProjection"',
    'enum: [tradingvault-event-projection]',
    'enum: [TradingVaultDepositProjection]',
    'enum: [TradingVaultWithdrawalProjection]',
    'enum: [Deposit]',
    'enum: [Withdraw]',
    'enum: [mock]',
    'enum: [READ_ONLY, NO_WITHDRAW, NO_ADMIN]',
    'enum: [non-custodial-contract-vault]',
    'fundsMoved:',
    'tradingVaultMutation:',
    'Read-only TradingVault Deposit history projection: mock rows have no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.',
    'Read-only TradingVault Withdraw history projection: mock rows have no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.',
  ]) {
    assert.ok(historyComponents.includes(requiredText), `vault history components should include ${requiredText}`);
  }
});

test('vault docs and campaign status mark read-only history API visibility without wallet behavior', async () => {
  const vaultDoc = await readText('docs/vault-operations.md');
  const plan = await readText('docs/plans/2026-06-08-post-vault-owner-wallet-readiness.md');
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'Read-only vault history API',
    'GET /v1/vault/deposits',
    'GET /v1/vault/withdrawals',
    'source: tradingvault-event-projection',
    'projectionType: TradingVaultDepositProjection | TradingVaultWithdrawalProjection',
    'settlementMode: mock',
    'settlementTx: null',
    'blockNumber: null',
    'blockHash: null',
    'eventIndex: null',
    'explorerUrl: null',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, TradingVault mutation, or funds movement',
  ]) {
    assert.ok(vaultDoc.includes(requiredText), `docs/vault-operations.md should include ${requiredText}`);
  }

  assert.ok(
    plan.includes('Completed: read-only vault deposit/withdrawal history API envelopes'),
    'post-vault readiness plan should mark the history API envelope slice complete',
  );
  assert.ok(
    contracts.includes('read-only vault history API envelopes now expose `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals`'),
    'contracts docs should point to completed history API envelopes',
  );
  assert.ok(
    architecture.includes('read-only vault history API envelopes now expose `GET /v1/vault/deposits` and `GET /v1/vault/withdrawals`'),
    'architecture docs should point to completed history API envelopes',
  );
  assert.ok(
    status.includes('Completed this run: read-only vault deposit/withdrawal history API envelopes'),
    'campaign status should checkpoint this slice',
  );
  assert.ok(
    status.includes('Next autonomous slice: read-only TypeScript/Python/qdex clients for vault deposit/withdrawal history'),
    'campaign status should name the next bounded local/source-only vault client slice',
  );
});
