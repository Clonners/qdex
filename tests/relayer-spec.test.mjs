import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);

const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

test('relayer spec defines non-custodial fill settlement state machine', async () => {
  const spec = await readText('services/relayer/spec.md');

  for (const requiredText of [
    '# Relayer State Machine',
    'submitFillPacket(FillPacket)',
    'received',
    'validated',
    'submitted',
    'confirmed',
    'failed_retryable',
    'failed_terminal',
    'settlementMode: mock',
    'mockSettlementReference',
    'private WebSocket/API',
    'indexer.fill_projected',
    'TradeProof.created',
    'contract events are final truth',
    'does not hold custody',
    'cannot withdraw user funds',
  ]) {
    assert.ok(spec.includes(requiredText), `services/relayer/spec.md should include ${requiredText}`);
  }
});

test('relayer spec preserves deterministic handoff and failure visibility', async () => {
  const spec = await readText('services/relayer/spec.md');

  for (const requiredText of [
    'FillPacket is idempotent by fillId',
    'ORDER_MATCHED is not final settlement',
    'FILL_PENDING_SETTLEMENT',
    'RELAYER_RECEIVED',
    'RELAYER_VALIDATED',
    'RELAYER_SUBMITTED',
    'SETTLEMENT_CONFIRMED',
    'SETTLEMENT_FAILED_RETRYABLE',
    'SETTLEMENT_FAILED_TERMINAL',
    'Public trade/proof projection waits for confirmed settlement',
    'Real Quai mode must reference settlementTx, blockNumber, eventIndex, and explorerUrl',
  ]) {
    assert.ok(spec.includes(requiredText), `services/relayer/spec.md should include ${requiredText}`);
  }
});
