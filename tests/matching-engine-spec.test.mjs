import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);

const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

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
