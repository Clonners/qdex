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

test('OpenAPI exposes read-only open orders endpoint', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const routeSection = sectionBetween(spec, '  /v1/account/orders:', '  /v1/vault/deposits:');
  const schemaSection = sectionBetween(spec, '    AccountOpenOrders:', '    TradingVaultDepositProjection:');

  for (const requiredText of [
    'summary: Read-only mock open orders projection',
    'source: mock-order-projection',
    'mock rows keep settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl null',
    'real Quai rows require settlementTx, blockNumber, blockHash, eventIndex, and explorerUrl',
    'settlementMode: mock',
    'no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, TradingVault mutation, or funds movement',
    '$ref: "#/components/schemas/AccountOpenOrders"',
    '"200":',
  ]) {
    assert.ok(routeSection.includes(requiredText), `open orders route should include ${requiredText}`);
  }

  for (const requiredText of [
    'AccountOpenOrders:',
    'required: [orders, source, projectionType, custody, permissions, matcherLocalOnly, settlementMode, settlementTx, blockNumber, blockHash, eventIndex, explorerUrl, realQuaiTransactions, walletRequired, fundsMoved, tradingVaultMutation, safetyNotice]',
    'enum: [mock-order-projection]',
    'enum: [LocalOrderProjection]',
    'enum: [non-custodial-no-withdrawal-authority]',
    'enum: [READ_ONLY, NO_WITHDRAW, NO_ADMIN]',
    'enum: [true]',
    'enum: [mock]',
    'nullable: true',
    'enum: [false]',
    'Mock open orders only; no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.',
  ]) {
    assert.ok(schemaSection.includes(requiredText), `AccountOpenOrders schema should include ${requiredText}`);
  }
});

test('open orders docs and campaign status mark read-only API visibility without wallet behavior', async () => {
  const accountDoc = await readText('docs/account.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'Read-only open orders REST API',
    'GET /v1/account/orders',
    'source: mock-order-projection',
    'projectionType: LocalOrderProjection',
    'settlementMode: mock',
    'settlementTx: null',
    'blockNumber: null',
    'blockHash: null',
    'eventIndex: null',
    'explorerUrl: null',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'matcherLocalOnly: true',
    'no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, TradingVault mutation, or funds movement',
  ]) {
    assert.ok(accountDoc.includes(requiredText), `docs/account.md should include ${requiredText}`);
  }

  assert.ok(
    status.includes('Completed this run: read-only open orders REST API envelope'),
    'campaign status should retain the open orders API checkpoint',
  );
});
