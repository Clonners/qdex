import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);

const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const sectionBetween = (text, start, end) => {
  const startIndex = text.indexOf(start);
  assert.notEqual(startIndex, -1, `expected to find section start ${start}`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `expected to find section end ${end}`);
  return text.slice(startIndex, endIndex);
};

test('matching engine spec defines deterministic non-custodial command boundary', async () => {
  const spec = await readText('services/matching-engine/spec.md');

  for (const requiredText of [
    '# Matching Engine Command Boundary',
    'PLACE_ORDER',
    'CANCEL_ORDER',
    'CANCEL_ALL',
    'SNAPSHOT',
    'RESTORE',
    'price-time priority',
    'orderHash',
    'SignedOrder',
    'market_ioc',
    'FillPacket',
    'API state is projection/cache',
    'matching-engine balances are not final truth',
    'NO_WITHDRAW',
  ]) {
    assert.ok(spec.includes(requiredText), `services/matching-engine/spec.md should include ${requiredText}`);
  }
});

test('matching engine event spec carries fills to relayer and proof projection', async () => {
  const events = await readText('services/matching-engine/events.md');

  for (const requiredText of [
    '# Matching Engine Events',
    'ORDER_ACCEPTED',
    'ORDER_REJECTED',
    'ORDER_MATCHED',
    'ORDER_CANCELLED',
    'FILL_PENDING_SETTLEMENT',
    'relayer.submitFillPacket',
    'mock settlement confirmed',
    'TradeProof',
    'contract events are final truth',
    'Every FillPacket must be traceable to a proof projection',
  ]) {
    assert.ok(events.includes(requiredText), `services/matching-engine/events.md should include ${requiredText}`);
  }
});

test('matching engine FillPacket handoff examples do not expose matcher-local createdAt', async () => {
  const spec = await readText('services/matching-engine/spec.md');
  const events = await readText('services/matching-engine/events.md');

  const handoffSection = sectionBetween(spec, '## FillPacket handoff', '## Failure behavior');
  const pendingSettlementSection = sectionBetween(events, '## FILL_PENDING_SETTLEMENT', '## ORDER_CANCELLED');

  assert.equal(
    handoffSection.includes('"createdAt"'),
    false,
    'matching FillPacket handoff example must not carry matcher-local createdAt',
  );
  assert.equal(
    pendingSettlementSection.includes('"createdAt"'),
    false,
    'FILL_PENDING_SETTLEMENT fillPacket example must not carry matcher-local createdAt',
  );

  for (const requiredText of [
    '`createdAt` belongs only to matcher event envelopes or private audit logs',
    '`sourceEventId` is added only after settlement confirmation',
    '`sourceEventId` comes from the settlement/indexer event',
  ]) {
    assert.ok(
      `${handoffSection}\n${pendingSettlementSection}`.includes(requiredText),
      `matching handoff docs should include ${requiredText}`,
    );
  }
});
