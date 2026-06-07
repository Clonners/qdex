import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);

const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

test('indexer schema defines settlement-derived projections and storage tables', async () => {
  const schema = await readText('services/indexer/schema.md');

  for (const requiredText of [
    '# Indexer Projection Schema',
    'contract events are final truth; DB is cache/projection',
    'blocks',
    'events',
    'deposits',
    'withdrawals',
    'vault_balances',
    'orders',
    'fills',
    'settlements',
    'proofs',
    'SETTLEMENT_CONFIRMED',
    'indexer.fill_projected',
    'proof.TradeProof.created',
    'GET /v1/fills',
    'GET /v1/proofs/trades/:tradeId',
  ]) {
    assert.ok(schema.includes(requiredText), `services/indexer/schema.md should include ${requiredText}`);
  }
});

test('indexer schema preserves reorg, replay, and custody invariants', async () => {
  const schema = await readText('services/indexer/schema.md');

  for (const requiredText of [
    'replayFromBlock(startBlock)',
    'reorg-safe',
    'finalityDepth',
    'txHash + eventIndex',
    'blockHash',
    'Public trade/proof projection waits for confirmed settlement',
    'ORDER_MATCHED is not final settlement',
    'settlementMode: mock',
    'mockSettlementReference',
    'settlementTx, blockNumber, eventIndex, and explorerUrl',
    'cannot withdraw user funds',
    'does not hold custody',
    'NO_WITHDRAW',
  ]) {
    assert.ok(schema.includes(requiredText), `services/indexer/schema.md should include ${requiredText}`);
  }
});

test('indexer schema defines owner-signed nonce-cancel proof projection without matcher-local nonce mutation', async () => {
  const schema = await readText('services/indexer/schema.md');

  for (const requiredText of [
    'nonce_cancellation_proofs',
    'NonceCancelled',
    'NonceRangeCancelled',
    'NONCE_CANCEL_CONFIRMED',
    'NONCE_RANGE_CANCEL_CONFIRMED',
    'matcher-local cancellation events are suppressed',
    'matcher-local-cancel-only-on-chain-nonce-unchanged',
    'Owner-signed NonceManager cancellation proof',
    'txHash, blockNumber, blockHash, eventIndex, and explorerUrl',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'does not create public fills, trades, settlements, or TradeProof rows',
  ]) {
    assert.ok(schema.includes(requiredText), `services/indexer/schema.md should include ${requiredText}`);
  }
});
