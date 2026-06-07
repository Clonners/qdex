import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);

const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

test('proof service spec pins indexer projection route contract', async () => {
  const spec = await readText('services/proof-service/spec.md');

  for (const requiredText of [
    '# Proof Service Contract',
    'GET /v1/proofs/trades/:tradeId',
    'proof-service-indexer-projection',
    'contract events are final truth; DB is cache/projection',
    'Public trade/proof projection waits for confirmed settlement',
    'SETTLEMENT_CONFIRMED',
    'source event',
    'settlementMode: mock',
    'mockSettlementReference',
    'settlementTx = null',
    'blockNumber = null',
    'blockHash = null',
    'explorerUrl = null',
    'no real Quai transaction',
    'no funds moved',
    'quai_contract',
    'settlementTx, blockNumber, eventIndex, and explorerUrl',
    'NO_WITHDRAW',
  ]) {
    assert.ok(spec.includes(requiredText), `services/proof-service/spec.md should include ${requiredText}`);
  }
});

test('OpenAPI trade proof schema distinguishes mock proofs from real Quai evidence', async () => {
  const openapi = await readText('docs/api-openapi.yaml');

  for (const requiredText of [
    'TradeProofResponse:',
    'TradeProofNotFound:',
    'TradeProof:',
    'proof-service-indexer-projection',
    'settlementMode:',
    'mockSettlementReference:',
    'blockHash:',
    'safetyNotice:',
    'rawEvent:',
    'createdFromEventId:',
    'Mock proofs must keep settlementTx, blockNumber, blockHash, and explorerUrl null',
    'Real Quai proofs require settlementTx, blockNumber, eventIndex, and explorerUrl',
  ]) {
    assert.ok(openapi.includes(requiredText), `docs/api-openapi.yaml should include ${requiredText}`);
  }
});

test('proof service spec pins owner-signed nonce-cancel proof rows without matcher-local proof claims', async () => {
  const spec = await readText('services/proof-service/spec.md');

  for (const requiredText of [
    'NonceCancellationProof',
    'getNonceCancellationProof(proofId)',
    'NonceCancelled',
    'NonceRangeCancelled',
    'NONCE_CANCEL_CONFIRMED',
    'NONCE_RANGE_CANCEL_CONFIRMED',
    'matcher_local_order_cancelled',
    'matcher_local_orders_cancelled',
    'matcher-local-cancel-only-on-chain-nonce-unchanged',
    'owner-signed NonceManager cancellation proof',
    'txHash, blockNumber, blockHash, eventIndex, and explorerUrl',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'does not create a trade proof',
  ]) {
    assert.ok(spec.includes(requiredText), `services/proof-service/spec.md should include ${requiredText}`);
  }
});
