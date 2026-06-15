import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createIndexerPersistence } from '../src/persistence.js';

// Helpers
const makeTempDir = async () => mkdtemp(join(tmpdir(), 'qdex-indexer-persist-test-'));
const cleanup = async (dir) => rm(dir, { recursive: true, force: true });

const MOCK_FILL = {
  projectionType: 'IndexedFillProjection',
  fillId: 'fill-000001',
  tradeId: 'trade-000001',
  marketId: 'WQUAI-WQI',
  makerOrderHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  takerOrderHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  maker: '0x1111111111111111111111111111111111111111',
  taker: '0x3333333333333333333333333333333333333333',
  price: '100',
  amount: '500',
  makerFee: '0',
  takerFee: '5',
  settlementMode: 'mock',
  settlementStatus: 'confirmed',
  sourceEventId: 'event-mock-001',
};

const MOCK_TRADE = {
  tradeId: 'trade-000001',
  fillId: 'fill-000001',
  marketId: 'WQUAI-WQI',
  price: '100',
  amount: '500',
  settlementStatus: 'confirmed',
  proofUrl: '/v1/proofs/trades/trade-000001',
};

const MOCK_PROOF = {
  tradeId: 'trade-000001',
  fillId: 'fill-000001',
  orderHashes: [
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ],
  settlementMode: 'mock',
  mockSettlementReference: 'mock-settlement-fill-000001',
  settlementTx: null,
  blockNumber: null,
  blockHash: null,
  eventIndex: 0,
  maker: '0x1111111111111111111111111111111111111111',
  taker: '0x3333333333333333333333333333333333333333',
  market: 'WQUAI-WQI',
  price: '100',
  amount: '500',
  fees: { maker: '0', taker: '5' },
  explorerUrl: null,
  safetyNotice: 'Mock proof only: no real Quai transaction, no explorer URL, no funds moved.',
  rawEvent: {
    eventId: 'event-mock-001',
    type: 'SETTLEMENT_CONFIRMED',
    source: 'mock-settlement',
    fillId: 'fill-000001',
    settlementMode: 'mock',
    mockSettlementReference: 'mock-settlement-fill-000001',
    settlementTx: null,
    blockNumber: null,
    blockHash: null,
    eventIndex: 0,
  },
  createdFromEventId: 'event-mock-001',
};

// ─── RED tests ────────────────────────────────────────────────────────────────

test('createIndexerPersistence returns store with all required methods', async () => {
  const dir = await makeTempDir();
  try {
    const store = createIndexerPersistence(dir);
    assert.equal(typeof store.load, 'function');
    assert.equal(typeof store.saveFills, 'function');
    assert.equal(typeof store.saveTrades, 'function');
    assert.equal(typeof store.saveProofs, 'function');
    assert.equal(typeof store.getFill, 'function');
    assert.equal(typeof store.getTrade, 'function');
    assert.equal(typeof store.getProof, 'function');
    assert.equal(typeof store.listFills, 'function');
    assert.equal(typeof store.listTrades, 'function');
    assert.equal(typeof store.listProofs, 'function');
    assert.equal(typeof store.count, 'function');
    assert.equal(typeof store.clear, 'function');
  } finally {
    await cleanup(dir);
  }
});

test('persistence returns empty state for fresh directory', async () => {
  const dir = await makeTempDir();
  try {
    const store = createIndexerPersistence(dir);
    const snapshot = await store.load();

    assert.equal(snapshot.fills.length, 0);
    assert.equal(snapshot.trades.length, 0);
    assert.equal(snapshot.proofs.length, 0);
    assert.equal(snapshot.meta.source, 'persistence-store');
    assert.equal(snapshot.meta.settlementMode, 'mock');
    assert.equal(snapshot.meta.realQuaiTransactions, false);
    assert.equal(snapshot.meta.walletRequired, false);
    assert.equal(snapshot.meta.fundsMoved, false);
  } finally {
    await cleanup(dir);
  }
});

test('saveFills persists and reloads fills from disk', async () => {
  const dir = await makeTempDir();
  try {
    const store = createIndexerPersistence(dir);

    await store.saveFills([MOCK_FILL]);

    const snapshot = await store.load();
    assert.equal(snapshot.fills.length, 1);
    assert.equal(snapshot.fills[0].fillId, 'fill-000001');
    assert.equal(snapshot.fills[0].projectionType, 'IndexedFillProjection');
    assert.equal(snapshot.fills[0].settlementMode, 'mock');

    // Verify individual lookup
    const fill = store.getFill('fill-000001');
    assert.equal(fill.fillId, 'fill-000001');
    assert.equal(fill.marketId, 'WQUAI-WQI');

    const fills = store.listFills();
    assert.equal(fills.length, 1);
    assert.equal(fills[0].fillId, 'fill-000001');
  } finally {
    await cleanup(dir);
  }
});

test('saveTrades persists and reloads trades from disk', async () => {
  const dir = await makeTempDir();
  try {
    const store = createIndexerPersistence(dir);

    await store.saveTrades([MOCK_TRADE]);

    const snapshot = await store.load();
    assert.equal(snapshot.trades.length, 1);
    assert.equal(snapshot.trades[0].tradeId, 'trade-000001');
    assert.equal(snapshot.trades[0].marketId, 'WQUAI-WQI');

    const trade = store.getTrade('trade-000001');
    assert.equal(trade.tradeId, 'trade-000001');

    const trades = store.listTrades('WQUAI-WQI');
    assert.equal(trades.length, 1);
  } finally {
    await cleanup(dir);
  }
});

test('saveProofs persists and reloads proofs from disk', async () => {
  const dir = await makeTempDir();
  try {
    const store = createIndexerPersistence(dir);

    await store.saveProofs([{ tradeId: 'trade-000001', proof: MOCK_PROOF }]);

    const snapshot = await store.load();
    assert.equal(snapshot.proofs.length, 1);
    assert.equal(snapshot.proofs[0].tradeId, 'trade-000001');

    const proof = store.getProof('trade-000001');
    assert.equal(proof.tradeId, 'trade-000001');
    assert.equal(proof.fillId, 'fill-000001');

    const proofs = store.listProofs();
    assert.equal(proofs.length, 1);
  } finally {
    await cleanup(dir);
  }
});

test('persistence survives reload (new store instance reads from disk)', async () => {
  const dir = await makeTempDir();
  try {
    // First instance: write data
    const storeA = createIndexerPersistence(dir);
    await storeA.saveFills([MOCK_FILL]);
    await storeA.saveTrades([MOCK_TRADE]);
    await storeA.saveProofs([{ tradeId: 'trade-000001', proof: MOCK_PROOF }]);

    // Second instance: read from disk
    const storeB = createIndexerPersistence(dir);
    const snapshot = await storeB.load();

    assert.equal(snapshot.fills.length, 1);
    assert.equal(snapshot.trades.length, 1);
    assert.equal(snapshot.proofs.length, 1);
    assert.equal(snapshot.fills[0].fillId, 'fill-000001');
    assert.equal(snapshot.trades[0].tradeId, 'trade-000001');
    assert.equal(snapshot.proofs[0].tradeId, 'trade-000001');
  } finally {
    await cleanup(dir);
  }
});

test('persistence rejects quai_contract settlement mode without approval', async () => {
  const dir = await makeTempDir();
  try {
    const store = createIndexerPersistence(dir);

    const quaiFill = { ...MOCK_FILL, settlementMode: 'quai_contract' };
    const result = await store.saveFills([quaiFill]);

    assert.equal(result.rejected, 1);
    assert.equal(result.saved, 0);
  } finally {
    await cleanup(dir);
  }
});

test('persistence count returns correct totals', async () => {
  const dir = await makeTempDir();
  try {
    const store = createIndexerPersistence(dir);
    const mockFill2 = { ...MOCK_FILL, fillId: 'fill-000002', tradeId: 'trade-000002' };

    await store.saveFills([MOCK_FILL, mockFill2]);
    await store.saveTrades([MOCK_TRADE]);
    await store.saveProofs([{ tradeId: 'trade-000001', proof: MOCK_PROOF }]);

    const counts = store.count();
    assert.equal(counts.fills, 2);
    assert.equal(counts.trades, 1);
    assert.equal(counts.proofs, 1);
  } finally {
    await cleanup(dir);
  }
});

test('persistence clear removes all data from disk', async () => {
  const dir = await makeTempDir();
  try {
    const store = createIndexerPersistence(dir);

    await store.saveFills([MOCK_FILL]);
    await store.saveTrades([MOCK_TRADE]);
    await store.saveProofs([{ tradeId: 'trade-000001', proof: MOCK_PROOF }]);

    assert.equal(store.count().fills, 1);

    await store.clear();

    const snapshot = await store.load();
    assert.equal(snapshot.fills.length, 0);
    assert.equal(snapshot.trades.length, 0);
    assert.equal(snapshot.proofs.length, 0);
  } finally {
    await cleanup(dir);
  }
});

test('persistence preserves safety envelope metadata on every snapshot', async () => {
  const dir = await makeTempDir();
  try {
    const store = createIndexerPersistence(dir);
    await store.saveFills([MOCK_FILL]);

    const snapshot = await store.load();

    assert.equal(snapshot.meta.source, 'persistence-store');
    assert.equal(snapshot.meta.settlementMode, 'mock');
    assert.equal(snapshot.meta.realQuaiTransactions, false);
    assert.equal(snapshot.meta.walletRequired, false);
    assert.equal(snapshot.meta.fundsMoved, false);
    assert.equal(snapshot.meta.tradingVaultMutation, false);
    assert.equal(snapshot.meta.marketRegistryMutation, false);
    assert.equal(snapshot.meta.permissions.includes('NO_WITHDRAW'), true);
    assert.equal(snapshot.meta.permissions.includes('NO_ADMIN'), true);
  } finally {
    await cleanup(dir);
  }
});

test('persistence getFill returns null for unknown fillId', async () => {
  const dir = await makeTempDir();
  try {
    const store = createIndexerPersistence(dir);
    const result = store.getFill('nonexistent-fill');
    assert.equal(result, null);
  } finally {
    await cleanup(dir);
  }
});

test('persistence getProof returns null for unknown tradeId', async () => {
  const dir = await makeTempDir();
  try {
    const store = createIndexerPersistence(dir);
    const result = store.getProof('nonexistent-trade');
    assert.equal(result, null);
  } finally {
    await cleanup(dir);
  }
});
