import assert from 'node:assert/strict';
import test from 'node:test';

import { createReorgSafeEventLog } from '../src/reorg-safe-event-log.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

const MOCK_HASH = (n) => `0x${n.toString(16).padStart(64, '0')}`;

const mockEvent = ({ eventId = 'evt-001', eventType = 'TradeSettled', blockNumber = 100, blockHash = MOCK_HASH(100), eventIndex = 0, contractAddress = '0xSettlement', data = null } = {}) => ({
  eventId,
  eventType,
  blockNumber,
  blockHash,
  eventIndex,
  contractAddress,
  data,
});

// ─── RED / GREEN Tests ───────────────────────────────────────────────────

test('createReorgSafeEventLog returns all required methods and safety envelope', () => {
  const log = createReorgSafeEventLog();

  // Safety envelope
  assert.equal(log.source, 'reorg-safe-event-log');
  assert.equal(log.settlementMode, 'mock');
  assert.equal(log.realQuaiTransactions, false);
  assert.equal(log.walletRequired, false);
  assert.equal(log.fundsMoved, false);
  assert.equal(log.tradingVaultMutation, false);
  assert.equal(log.marketRegistryMutation, false);
  assert.ok(log.permissions.includes('NO_WITHDRAW'));
  assert.ok(log.permissions.includes('NO_ADMIN'));

  // Required methods
  const methods = [
    'appendBlock',
    'appendEvent',
    'checkReorg',
    'replayFrom',
    'getCanonicalEvents',
    'getReorgedEvents',
    'getReorgHistory',
    'getHeadBlockNumber',
    'getCanonicalHash',
    'getStatus',
    'clear',
  ];

  for (const name of methods) {
    assert.equal(typeof log[name], 'function', `should have method ${name}`);
  }
});

test('log starts empty with null head and zero counts', () => {
  const log = createReorgSafeEventLog();
  const status = log.getStatus();

  assert.equal(status.headBlock, null);
  assert.equal(status.canonicalHeadsTracked, 0);
  assert.equal(status.totalEventsIngested, 0);
  assert.equal(status.canonicalEvents, 0);
  assert.equal(status.invalidatedEvents, 0);
  assert.equal(status.reorgedEventsPool, 0);
  assert.equal(status.reorgIncidents, 0);
});

test('appendBlock records a new canonical block head', () => {
  const log = createReorgSafeEventLog();

  const result = log.appendBlock(100, MOCK_HASH(100));
  assert.equal(result.reorg, false);
  assert.equal(result.blockNumber, 100);
  assert.equal(result.invalidatedCount, 0);
  assert.equal(log.getHeadBlockNumber(), 100);
  assert.equal(log.getCanonicalHash(100), MOCK_HASH(100));
});

test('appendBlock rejects invalid block numbers', () => {
  const log = createReorgSafeEventLog();

  assert.equal(log.appendBlock(-1, MOCK_HASH(1)).error, 'invalid_block_number');
  assert.equal(log.appendBlock('abc', MOCK_HASH(1)).error, 'invalid_block_number');
  assert.equal(log.appendBlock(1.5, MOCK_HASH(1)).error, 'invalid_block_number');
});

test('appendBlock rejects invalid block hashes', () => {
  const log = createReorgSafeEventLog();

  assert.equal(log.appendBlock(1, 'not-a-hash').error, 'invalid_block_hash');
  assert.equal(log.appendBlock(1, '').error, 'invalid_block_hash');
  assert.equal(log.appendBlock(1, null).error, 'invalid_block_hash');
});

test('appendEvent ingests valid event and returns success', () => {
  const log = createReorgSafeEventLog();

  log.appendBlock(100, MOCK_HASH(100));

  const result = log.appendEvent(mockEvent({ blockHash: MOCK_HASH(100) }));
  assert.equal(result.ingested, true);
  assert.equal(result.eventId, 'evt-001');
});

test('appendEvent rejects missing eventId', () => {
  const log = createReorgSafeEventLog();

  const event = mockEvent({ eventId: null });
  delete event.eventId;
  const result = log.appendEvent(event);
  assert.equal(result.ingested, false);
  assert.equal(result.error, 'missing_event_id');
});

test('appendEvent rejects missing eventType', () => {
  const log = createReorgSafeEventLog();

  const result = log.appendEvent({ eventId: 'x' });
  assert.equal(result.ingested, false);
  assert.equal(result.error, 'missing_event_type');
});

test('appendEvent rejects invalid block hash', () => {
  const log = createReorgSafeEventLog();

  const result = log.appendEvent(mockEvent({ blockHash: 'bad-hash' }));
  assert.equal(result.ingested, false);
  assert.equal(result.error, 'invalid_block_hash');
});

test('appendEvent rejects negative event index', () => {
  const log = createReorgSafeEventLog();

  const result = log.appendEvent(mockEvent({ eventIndex: -1 }));
  assert.equal(result.ingested, false);
  assert.equal(result.error, 'invalid_event_index');
});

test('appendEvent rejects duplicate event IDs', () => {
  const log = createReorgSafeEventLog();
  const evt = mockEvent({ blockHash: MOCK_HASH(100) });

  log.appendBlock(100, MOCK_HASH(100));
  log.appendEvent(evt);
  const result = log.appendEvent(evt);

  assert.equal(result.ingested, false);
  assert.equal(result.error, 'duplicate_event_id');
});

test('checkReorg returns true when block hash differs from canonical', () => {
  const log = createReorgSafeEventLog();
  const originalHash = MOCK_HASH(100);

  log.appendBlock(100, originalHash);

  const differentHash = MOCK_HASH(999);
  const result = log.checkReorg(100, differentHash);

  assert.equal(result.matches, false);
  assert.equal(result.reorg, true);
});

test('checkReorg returns matches true when block hash is the same', () => {
  const log = createReorgSafeEventLog();
  const hash = MOCK_HASH(100);

  log.appendBlock(100, hash);
  const result = log.checkReorg(100, hash);

  assert.equal(result.matches, true);
  assert.equal(result.reorg, false);
});

test('checkReorg returns false for unknown block numbers', () => {
  const log = createReorgSafeEventLog();

  const result = log.checkReorg(999, MOCK_HASH(999));
  assert.equal(result.matches, false);
  assert.equal(result.reorg, false);
});

test('appendBlock detects reorg when same block number has different hash', () => {
  const log = createReorgSafeEventLog();
  const originalHash = MOCK_HASH(100);
  const newHash = MOCK_HASH(999);

  log.appendBlock(100, originalHash);
  log.appendEvent(mockEvent({ eventId: 'evt-001', blockHash: originalHash }));
  log.appendEvent(mockEvent({ eventId: 'evt-002', blockNumber: 101, blockHash: MOCK_HASH(101) }));

  // Feed the reorged hash for block 100
  const result = log.appendBlock(100, newHash);

  assert.equal(result.reorg, true);
  assert.equal(result.invalidatedCount, 2, 'both events at blocks 100 and 101 should be invalidated');
});

test('replayFrom invalidates all events at and after the reorg block', () => {
  const log = createReorgSafeEventLog();
  const hash100 = MOCK_HASH(100);
  const hash101 = MOCK_HASH(101);
  const hash102 = MOCK_HASH(102);

  log.appendBlock(100, hash100);
  log.appendBlock(101, hash101);
  log.appendBlock(102, hash102);

  log.appendEvent(mockEvent({ eventId: 'evt-001', blockNumber: 100, blockHash: hash100 }));
  log.appendEvent(mockEvent({ eventId: 'evt-002', blockNumber: 101, blockHash: hash101 }));
  log.appendEvent(mockEvent({ eventId: 'evt-003', blockNumber: 102, blockHash: hash102 }));

  const invalidated = log.replayFrom(101);

  assert.equal(invalidated.length, 2, 'events at blocks 101 and 102 should be invalidated');
  assert.ok(invalidated.some((e) => e.eventId === 'evt-002'));
  assert.ok(invalidated.some((e) => e.eventId === 'evt-003'));

  // Event at block 100 should remain canonical
  const canonical = log.getCanonicalEvents();
  assert.equal(canonical.length, 1, 'only evt-001 should remain canonical');
  assert.equal(canonical[0].eventId, 'evt-001');
});

test('getReorgedEvents returns invalidated events from replay', () => {
  const log = createReorgSafeEventLog();
  const hash100 = MOCK_HASH(100);
  const hash101 = MOCK_HASH(101);

  log.appendBlock(100, hash100);
  log.appendBlock(101, hash101);
  log.appendEvent(mockEvent({ eventId: 'evt-001', blockNumber: 100, blockHash: hash100 }));
  log.appendEvent(mockEvent({ eventId: 'evt-002', blockNumber: 101, blockHash: hash101 }));

  log.replayFrom(101);

  const reorged = log.getReorgedEvents();
  assert.equal(reorged.length, 1);
  assert.equal(reorged[0].eventId, 'evt-002');
});

test('getReorgHistory records reorg incidents', () => {
  const log = createReorgSafeEventLog();
  const originalHash = MOCK_HASH(100);
  const newHash = MOCK_HASH(999);

  log.appendBlock(100, originalHash);
  log.appendEvent(mockEvent({ eventId: 'evt-001', blockHash: originalHash }));

  log.appendBlock(100, newHash);

  const history = log.getReorgHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].reorgBlockNumber, 100);
  assert.equal(history[0].oldHash, originalHash);
  assert.equal(history[0].newHash, newHash);
  assert.equal(history[0].invalidatedCount, 1);
});

test('getCanonicalEvents excludes invalidated events even without withinSafetyDepth', () => {
  const log = createReorgSafeEventLog();
  const hash100 = MOCK_HASH(100);
  const hash101 = MOCK_HASH(101);

  log.appendBlock(100, hash100);
  log.appendBlock(101, hash101);
  log.appendEvent(mockEvent({ eventId: 'evt-001', blockNumber: 100, blockHash: hash100 }));
  log.appendEvent(mockEvent({ eventId: 'evt-002', blockNumber: 101, blockHash: hash101 }));

  log.replayFrom(101);

  const canonical = log.getCanonicalEvents();
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].eventId, 'evt-001');
});

test('getCanonicalEvents with withinSafetyDepth excludes recent events', () => {
  const log = createReorgSafeEventLog({ reorgSafetyDepth: 3 });

  // Blocks 100-105, head is 105
  for (let i = 100; i <= 105; i++) {
    const hash = MOCK_HASH(i);
    log.appendBlock(i, hash);
    log.appendEvent(mockEvent({ eventId: `evt-${i}`, blockNumber: i, blockHash: hash }));
  }

  // Head is 105, safety depth 3 → events at 100-102 are safe (105-100=5>=3, 105-102=3>=3)
  // Events at 103-105 are within safety depth
  const canonical = log.getCanonicalEvents({ withinSafetyDepth: true });
  const safeBlocks = canonical.map((e) => e.blockNumber);

  assert.ok(safeBlocks.includes(100), 'block 100 should be safe');
  assert.ok(safeBlocks.includes(101), 'block 101 should be safe');
  assert.ok(safeBlocks.includes(102), 'block 102 should be safe');
  assert.ok(!safeBlocks.includes(105), 'block 105 should be within safety depth');
});

test('getCanonicalEvents returns events sorted by block then event index', () => {
  const log = createReorgSafeEventLog();
  const hash100 = MOCK_HASH(100);

  log.appendBlock(100, hash100);
  log.appendEvent(mockEvent({ eventId: 'evt-b', blockNumber: 100, blockHash: hash100, eventIndex: 1 }));
  log.appendEvent(mockEvent({ eventId: 'evt-a', blockNumber: 100, blockHash: hash100, eventIndex: 0 }));

  const canonical = log.getCanonicalEvents();
  assert.equal(canonical[0].eventId, 'evt-a');
  assert.equal(canonical[1].eventId, 'evt-b');
});

test('getCanonicalEvents verifies block hash matches canonical head', () => {
  const log = createReorgSafeEventLog();
  const hash100 = MOCK_HASH(100);
  const wrongHash = MOCK_HASH(999);

  // Record canonical block with one hash
  log.appendBlock(100, hash100);
  // Ingest event with a different block hash (simulates stale ingestion)
  log.appendEvent(mockEvent({ eventId: 'evt-001', blockNumber: 100, blockHash: wrongHash }));

  // Event should not appear in canonical because its hash doesn't match
  const canonical = log.getCanonicalEvents();
  assert.equal(canonical.length, 0, 'event with wrong hash should be excluded from canonical');
});

test('replayFrom trims canonical heads from reorg block onward', () => {
  const log = createReorgSafeEventLog();
  const hash100 = MOCK_HASH(100);
  const hash101 = MOCK_HASH(101);
  const hash102 = MOCK_HASH(102);

  log.appendBlock(100, hash100);
  log.appendBlock(101, hash101);
  log.appendBlock(102, hash102);

  assert.equal(log.getCanonicalHash(101), hash101);
  assert.equal(log.getCanonicalHash(102), hash102);

  log.replayFrom(101);

  assert.equal(log.getCanonicalHash(100), hash100, 'block 100 should remain');
  assert.equal(log.getCanonicalHash(101), null, 'block 101 should be removed');
  assert.equal(log.getCanonicalHash(102), null, 'block 102 should be removed');
});

test('clear resets all state to empty', () => {
  const log = createReorgSafeEventLog();

  log.appendBlock(100, MOCK_HASH(100));
  log.appendEvent(mockEvent({ blockHash: MOCK_HASH(100) }));
  log.replayFrom(100);

  log.clear();

  const status = log.getStatus();
  assert.equal(status.headBlock, null);
  assert.equal(status.canonicalHeadsTracked, 0);
  assert.equal(status.totalEventsIngested, 0);
  assert.equal(status.reorgedEventsPool, 0);
  assert.equal(status.reorgIncidents, 0);
});

test('full reorg cycle: ingest, detect reorg via appendBlock, replay, re-ingest', () => {
  const log = createReorgSafeEventLog();
  const original100 = MOCK_HASH(100);
  const new100 = MOCK_HASH(1000);
  const new101 = MOCK_HASH(101);

  // Phase 1: Ingest blocks 100-101 with events
  log.appendBlock(100, original100);
  log.appendBlock(101, MOCK_HASH(101));
  log.appendEvent(mockEvent({ eventId: 'evt-old-001', blockNumber: 100, blockHash: original100 }));
  log.appendEvent(mockEvent({ eventId: 'evt-old-002', blockNumber: 101, blockHash: MOCK_HASH(101) }));

  assert.equal(log.getCanonicalEvents().length, 2);

  // Phase 2: Detect reorg at block 100
  const reorgResult = log.appendBlock(100, new100);
  assert.equal(reorgResult.reorg, true);
  assert.equal(reorgResult.invalidatedCount, 2);

  // Phase 3: Verify events are reorged
  assert.equal(log.getCanonicalEvents().length, 0);
  assert.equal(log.getReorgedEvents().length, 2);

  // Phase 4: Re-ingest new events on the new chain
  log.appendBlock(101, new101);
  log.appendEvent(mockEvent({ eventId: 'evt-new-001', blockNumber: 100, blockHash: new100 }));
  log.appendEvent(mockEvent({ eventId: 'evt-new-002', blockNumber: 101, blockHash: new101 }));

  const canonical = log.getCanonicalEvents();
  assert.equal(canonical.length, 2);
  assert.ok(canonical.some((e) => e.eventId === 'evt-new-001'));
  assert.ok(canonical.some((e) => e.eventId === 'evt-new-002'));

  // Old events should still be in reorg pool
  const reorged = log.getReorgedEvents();
  assert.equal(reorged.length, 2);
  assert.ok(reorged.some((e) => e.eventId === 'evt-old-001'));
});

test('status report preserves safety envelope and tracks counts accurately', () => {
  const log = createReorgSafeEventLog({ reorgSafetyDepth: 5 });

  log.appendBlock(100, MOCK_HASH(100));
  log.appendEvent(mockEvent({ eventId: 'evt-001', blockHash: MOCK_HASH(100) }));

  const status = log.getStatus();

  assert.equal(status.source, 'reorg-safe-event-log');
  assert.equal(status.settlementMode, 'mock');
  assert.equal(status.realQuaiTransactions, false);
  assert.equal(status.walletRequired, false);
  assert.equal(status.fundsMoved, false);
  assert.equal(status.tradingVaultMutation, false);
  assert.equal(status.marketRegistryMutation, false);
  assert.equal(status.headBlock, 100);
  assert.equal(status.totalEventsIngested, 1);
  assert.equal(status.canonicalEvents, 1);
  assert.equal(status.invalidatedEvents, 0);
  assert.equal(status.reorgSafetyDepth, 5);
});

test('multiple reorgs are tracked independently in reorg history', () => {
  const log = createReorgSafeEventLog();

  // First chain
  log.appendBlock(100, MOCK_HASH(100));
  log.appendEvent(mockEvent({ eventId: 'evt-1a', blockHash: MOCK_HASH(100) }));

  // First reorg at block 100
  log.appendBlock(100, MOCK_HASH(200));

  // Build new chain
  log.appendBlock(101, MOCK_HASH(101));
  log.appendEvent(mockEvent({ eventId: 'evt-1b', blockNumber: 101, blockHash: MOCK_HASH(101) }));

  // Second reorg at block 101
  log.appendBlock(101, MOCK_HASH(301));

  const history = log.getReorgHistory();
  assert.equal(history.length, 2, 'should have 2 reorg incidents');
  assert.equal(history[0].reorgBlockNumber, 100);
  assert.equal(history[1].reorgBlockNumber, 101);
});

test('non-consecutive block numbers are handled correctly', () => {
  const log = createReorgSafeEventLog();

  log.appendBlock(100, MOCK_HASH(100));
  log.appendBlock(105, MOCK_HASH(105));
  log.appendBlock(200, MOCK_HASH(200));

  log.appendEvent(mockEvent({ eventId: 'evt-100', blockNumber: 100, blockHash: MOCK_HASH(100) }));
  log.appendEvent(mockEvent({ eventId: 'evt-105', blockNumber: 105, blockHash: MOCK_HASH(105) }));
  log.appendEvent(mockEvent({ eventId: 'evt-200', blockNumber: 200, blockHash: MOCK_HASH(200) }));

  assert.equal(log.getHeadBlockNumber(), 200);
  assert.equal(log.getCanonicalEvents().length, 3);

  // Reorg at block 105 invalidates events at 105 and 200
  log.appendBlock(105, MOCK_HASH(999));

  const canonical = log.getCanonicalEvents();
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].eventId, 'evt-100');
});

test('getReorgedEvents returns events marked as invalidated across multiple replays', () => {
  const log = createReorgSafeEventLog();

  log.appendBlock(100, MOCK_HASH(100));
  log.appendBlock(101, MOCK_HASH(101));
  log.appendBlock(102, MOCK_HASH(102));

  log.appendEvent(mockEvent({ eventId: 'evt-001', blockNumber: 100, blockHash: MOCK_HASH(100) }));
  log.appendEvent(mockEvent({ eventId: 'evt-002', blockNumber: 101, blockHash: MOCK_HASH(101) }));
  log.appendEvent(mockEvent({ eventId: 'evt-003', blockNumber: 102, blockHash: MOCK_HASH(102) }));

  // First replay: invalidate from 101
  log.replayFrom(101);
  assert.equal(log.getReorgedEvents().length, 2);

  // Second replay: invalidate from 100 (now invalidates evt-001 too)
  log.replayFrom(100);
  assert.equal(log.getReorgedEvents().length, 3, 'all events should be in reorg pool');
});

test('safety envelope is never mutable — no wallet/RPC/funds fields exist', () => {
  const log = createReorgSafeEventLog();

  log.appendBlock(100, MOCK_HASH(100));
  log.appendEvent(mockEvent({ blockHash: MOCK_HASH(100) }));

  // Verify no wallet, RPC, signing, or funds behavior anywhere
  assert.equal(log.walletRequired, false);
  assert.equal(log.realQuaiTransactions, false);
  assert.equal(log.fundsMoved, false);
  assert.equal(log.tradingVaultMutation, false);

  const status = log.getStatus();
  assert.equal(status.walletRequired, false);
  assert.equal(status.realQuaiTransactions, false);
  assert.equal(status.fundsMoved, false);
});
