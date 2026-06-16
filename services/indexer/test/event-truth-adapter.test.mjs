import assert from 'node:assert/strict';
import test from 'node:test';

// ─── Event-truth adapter tests ────────────────────────────────────────────────

test('event-truth-adapter.js exports all required symbols', async () => {
  const mod = await import('../src/event-truth-adapter.js');

  const requiredExports = [
    'EVENT_TRUTH_EVENT_TYPES',
    'EVENT_TRUTH_SOURCE',
    'createEventTruthAdapter',
    'validateEventEvidence',
    'isFinalityMet',
    'listEventTruthContracts',
    'listEventsForContract',
  ];

  for (const name of requiredExports) {
    assert.ok(name in mod, `should export ${name}`);
  }
});

test('EVENT_TRUTH_EVENT_TYPES lists all 11 contract events from the cutover plan', async () => {
  const { EVENT_TRUTH_EVENT_TYPES } = await import('../src/event-truth-adapter.js');

  assert.equal(EVENT_TRUTH_EVENT_TYPES.length, 11, 'should have exactly 11 event types');

  const expectedEvents = [
    'TradeSettled',
    'Deposit',
    'Withdraw',
    'NonceUsed',
    'NonceCancelled',
    'NonceRangeCancelled',
    'MarketAdded',
    'MarketDisabled',
    'FeesUpdated',
    'DelegateKeyRegistered',
    'DelegateKeyRevoked',
  ];

  for (const evt of expectedEvents) {
    assert.ok(EVENT_TRUTH_EVENT_TYPES.includes(evt), `should include ${evt}`);
  }
});

test('listEventTruthContracts returns the 6 contracts indexed by the event-truth adapter', async () => {
  const { listEventTruthContracts } = await import('../src/event-truth-adapter.js');

  const contracts = listEventTruthContracts();

  assert.equal(contracts.length, 6, 'should list 6 contracts');

  const contractNames = contracts.map((c) => c.name);
  for (const name of [
    'Settlement',
    'TradingVault',
    'NonceManager',
    'MarketRegistry',
    'FeeManager',
    'DelegateKeyRegistry',
  ]) {
    assert.ok(contractNames.includes(name), `should include ${name}`);
  }
});

test('listEventsForContract returns the correct events per contract', async () => {
  const { listEventsForContract } = await import('../src/event-truth-adapter.js');

  assert.deepEqual(
    listEventsForContract('Settlement'),
    ['TradeSettled'],
    'Settlement should emit TradeSettled',
  );

  assert.deepEqual(
    listEventsForContract('TradingVault'),
    ['Deposit', 'Withdraw'],
    'TradingVault should emit Deposit and Withdraw',
  );

  assert.deepEqual(
    listEventsForContract('NonceManager'),
    ['NonceUsed', 'NonceCancelled', 'NonceRangeCancelled'],
    'NonceManager should emit NonceUsed, NonceCancelled, NonceRangeCancelled',
  );

  assert.deepEqual(
    listEventsForContract('MarketRegistry'),
    ['MarketAdded', 'MarketDisabled'],
    'MarketRegistry should emit MarketAdded and MarketDisabled',
  );

  assert.deepEqual(
    listEventsForContract('FeeManager'),
    ['FeesUpdated'],
    'FeeManager should emit FeesUpdated',
  );

  assert.deepEqual(
    listEventsForContract('DelegateKeyRegistry'),
    ['DelegateKeyRegistered', 'DelegateKeyRevoked'],
    'DelegateKeyRegistry should emit DelegateKeyRegistered and DelegateKeyRevoked',
  );
});

test('validateEventEvidence rejects missing required fields', async () => {
  const { validateEventEvidence } = await import('../src/event-truth-adapter.js');

  const empty = validateEventEvidence({});
  assert.equal(empty.valid, false, 'empty evidence should be invalid');
  assert.ok(empty.missingFields.length > 0, 'should report missing fields');

  const complete = validateEventEvidence({
    contractAddress: '0xABC',
    settlementTx: '0xTX',
    blockNumber: 42,
    blockHash: '0xBLOCK',
    eventIndex: 0,
  });
  assert.equal(complete.valid, true, 'complete evidence should be valid');
  assert.equal(complete.missingFields.length, 0, 'should have no missing fields');
});
