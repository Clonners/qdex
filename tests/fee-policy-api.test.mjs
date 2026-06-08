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

test('OpenAPI exposes read-only FeeManager fee schedule metadata', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const feeRoute = sectionBetween(spec, '  /v1/fees:', '  /v1/contracts:');
  const feeComponents = sectionBetween(spec, '    FeeScheduleResponse:', '    ContractMetadata:');

  for (const requiredText of [
    'summary: Read-only FeeManager fee schedule',
    'description: FeeManager policy metadata only; no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, fee-authority runtime keys, TradingVault mutation, or real funds are introduced by this route.',
    '$ref: "#/components/schemas/FeeScheduleResponse"',
    '"200":',
  ]) {
    assert.ok(feeRoute.includes(requiredText), `/v1/fees route should include ${requiredText}`);
  }

  for (const requiredText of [
    'FeeScheduleResponse:',
    'FeeScheduleProjection:',
    'required: [feeSchedules, source, status, custody, permissions, hardMaxFeeBps, feeRecipient, feeManagerMutation, realQuaiTransactions, walletRequired, fundsMoved, tradingVaultMutation, safety]',
    'required: [marketId, projectionType, eventName, makerFeeBps, takerFeeBps, maxFeeBps, feeRecipient, settlementMode, settlementTx, blockNumber, blockHash, eventIndex, explorerUrl]',
    '$ref: "#/components/schemas/FeeScheduleProjection"',
    'enum: [feemanager-policy-projection]',
    'enum: [local-only-not-deployed]',
    'enum: [non-custodial-fee-policy]',
    'enum: [READ_ONLY, NO_WITHDRAW, NO_ADMIN]',
    'enum: [FeeScheduleProjection]',
    'enum: [FeesUpdated]',
    'enum: [mock]',
    'hardMaxFeeBps:',
    'feeManagerMutation:',
    'tradingVaultMutation:',
    'noFeeAuthorityRuntimeKeys:',
    'Read-only FeeManager schedule metadata: local/mock rows have no real Quai transaction, no wallet loaded, no fee-authority key, no TradingVault mutation, and no funds moved.',
  ]) {
    assert.ok(feeComponents.includes(requiredText), `FeeSchedule components should include ${requiredText}`);
  }
});

test('FeeManager docs and campaign status pin read-only fee policy without runtime authority', async () => {
  const feesDoc = await readText('docs/fees.md');
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    '# FeeManager Fee Policy',
    'GET /v1/fees',
    'source: feemanager-policy-projection',
    'FeeScheduleProjection',
    'eventName: FeesUpdated',
    'hardMaxFeeBps: 1000',
    'feeRecipient: null',
    'feeManagerMutation: false',
    'tradingVaultMutation: false',
    'READ_ONLY',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, fee-authority runtime keys, TradingVault mutation, or funds movement',
  ]) {
    assert.ok(feesDoc.includes(requiredText), `docs/fees.md should include ${requiredText}`);
  }

  assert.ok(
    contracts.includes('read-only FeeManager fee schedule API envelope now exposes `GET /v1/fees`'),
    'contracts docs should point to completed FeeManager fee schedule API visibility',
  );
  assert.ok(
    architecture.includes('Read-only FeeManager fee policy metadata now exposes `GET /v1/fees`'),
    'architecture docs should point to completed FeeManager fee policy API visibility',
  );
  assert.ok(
    status.includes('Completed previous run: read-only FeeManager fee schedule API envelope'),
    'campaign status should retain the FeeManager fee policy API slice as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: read-only FeeManager fee schedule clients'),
    'campaign status should retain the FeeManager SDK/Python/qdex client exposure slice as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI read-only FeeManager fee schedule exposure'),
    'campaign status should retain the terminal UI FeeManager fee schedule panel slice as previous work',
  );
  assert.ok(
    status.includes('Next autonomous slice: read-only FeeManager fee schedule WebSocket snapshot alignment'),
    'campaign status should move past the local API + terminal UI FeeManager fee schedule smoke after terminal UI visibility',
  );

  assert.doesNotMatch(
    `${feesDoc}\n${contracts}\n${architecture}`,
    /feeAuthorityKey|rpcUrl\s*:|signature\s*:|txHash|deployed address|FeeManager mutation submitted/i,
    'FeeManager policy docs must not introduce wallet/RPC/signing/deploy/tx mechanics or mutation claims',
  );
});
