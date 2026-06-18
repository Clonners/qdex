import assert from 'node:assert/strict';
import test from 'node:test';

// ── Module structure and exports ──────────────────────────────────────

test('testnet-contract-abi-completeness exports required interfaces', async () => {
  const mod = await import('../services/api/src/testnet-contract-abi-completeness.js');

  // Public API
  assert.equal(typeof mod.validateAbiCompleteness, 'function', 'validateAbiCompleteness should be exported');
  assert.equal(typeof mod.assertAbiComplete, 'function', 'assertAbiComplete should be exported');
  assert.equal(typeof mod.formatAbiCompletenessSummary, 'function', 'formatAbiCompletenessSummary should be exported');
  assert.equal(typeof mod.checkAbiCompleteness, 'function', 'checkAbiCompleteness should be exported');

  // Constants
  assert.ok(typeof mod.REQUIRED_ABI_MEMBERS === 'object', 'REQUIRED_ABI_MEMBERS should be object');
  assert.ok(Array.isArray(mod.ABI_COMPLETENESS_CONTRACTS), 'ABI_COMPLETENESS_CONTRACTS should be array');
  assert.equal(mod.ABI_COMPLETENESS_CONTRACTS.length, 6, 'should cover all 6 deployable contracts');

  // Internal helpers (for testing)
  assert.equal(typeof mod.resolveArtifactsPath, 'function', 'resolveArtifactsPath should be exported');
  assert.equal(typeof mod.readArtifact, 'function', 'readArtifact should be exported');
  assert.equal(typeof mod.extractFunctionNames, 'function', 'extractFunctionNames should be exported');
  assert.equal(typeof mod.extractEventNames, 'function', 'extractEventNames should be exported');
});

test('ABI_COMPLETENESS_CONTRACTS covers all deployable contracts in canonical order', async () => {
  const { ABI_COMPLETENESS_CONTRACTS } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const expected = ['TradingVault', 'Settlement', 'NonceManager', 'MarketRegistry', 'FeeManager', 'DelegateKeyRegistry'];
  assert.deepStrictEqual(ABI_COMPLETENESS_CONTRACTS, expected, 'should list all 6 contracts in deploy order');
});

test('REQUIRED_ABI_MEMBERS defines completeness for all 6 contracts', async () => {
  const { REQUIRED_ABI_MEMBERS } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const contracts = Object.keys(REQUIRED_ABI_MEMBERS);
  assert.equal(contracts.length, 6, 'should define requirements for 6 contracts');

  for (const name of ['TradingVault', 'Settlement', 'NonceManager', 'MarketRegistry', 'FeeManager', 'DelegateKeyRegistry']) {
    assert.ok(REQUIRED_ABI_MEMBERS[name], `${name} should have completeness definition`);
    assert.ok(Array.isArray(REQUIRED_ABI_MEMBERS[name].functions), `${name} should have functions array`);
    assert.ok(Array.isArray(REQUIRED_ABI_MEMBERS[name].events), `${name} should have events array`);
    assert.ok(REQUIRED_ABI_MEMBERS[name].functions.length > 0, `${name} should require at least one function`);
    assert.ok(REQUIRED_ABI_MEMBERS[name].events.length > 0, `${name} should require at least one event`);
  }
});

test('REQUIRED_ABI_MEMBERS matches cutover plan event list (Task 5)', async () => {
  const { REQUIRED_ABI_MEMBERS } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  // Collect all required events across all contracts
  const allEvents = [];
  for (const contract of Object.values(REQUIRED_ABI_MEMBERS)) {
    allEvents.push(...contract.events);
  }

  // Cutover plan Task 5 event list
  const cutoverEvents = [
    'TradeSettled', 'Deposit', 'Withdraw',
    'NonceUsed', 'NonceCancelled', 'NonceRangeCancelled',
    'MarketAdded', 'MarketDisabled',
    'FeesUpdated',
    'DelegateKeyRegistered', 'DelegateKeyRevoked',
  ];

  for (const evt of cutoverEvents) {
    assert.ok(allEvents.includes(evt), `cutover plan event "${evt}" should be in ABI requirements`);
  }
});

// ── Unit tests: extract helpers ───────────────────────────────────────

test('extractFunctionNames returns empty array for null/undefined ABI', async () => {
  const { extractFunctionNames } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  assert.deepStrictEqual(extractFunctionNames(null), [], 'null ABI should return empty');
  assert.deepStrictEqual(extractFunctionNames(undefined), [], 'undefined ABI should return empty');
  assert.deepStrictEqual(extractFunctionNames([]), [], 'empty ABI should return empty');
});

test('extractFunctionNames returns function names from ABI', async () => {
  const { extractFunctionNames } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const abi = [
    { type: 'function', name: 'deposit', inputs: [] },
    { type: 'function', name: 'withdraw', inputs: [] },
    { type: 'event', name: 'Deposit', inputs: [] },
    { type: 'constructor', inputs: [] },
    { type: 'fallback', stateMutability: 'payable' },
  ];

  const names = extractFunctionNames(abi);
  assert.deepStrictEqual(names, ['deposit', 'withdraw'], 'should extract only function names');
});

test('extractEventNames returns event names from ABI', async () => {
  const { extractEventNames } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const abi = [
    { type: 'function', name: 'deposit', inputs: [] },
    { type: 'event', name: 'Deposit', inputs: [] },
    { type: 'event', name: 'Withdraw', inputs: [] },
  ];

  const names = extractEventNames(abi);
  assert.deepStrictEqual(names, ['Deposit', 'Withdraw'], 'should extract only event names');
});

test('extractFunctionNames skips items without name', async () => {
  const { extractFunctionNames } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const abi = [
    { type: 'function', name: 'deposit', inputs: [] },
    { type: 'function', inputs: [] }, // no name
  ];

  const names = extractFunctionNames(abi);
  assert.deepStrictEqual(names, ['deposit'], 'should skip unnamed items');
});

// ── Unit tests: checkAbiCompleteness ──────────────────────────────────

test('checkAbiCompleteness returns complete=true when all required members present', async () => {
  const { checkAbiCompleteness } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const mockArtifact = {
    abi: [
      { type: 'function', name: 'deposit' },
      { type: 'function', name: 'withdraw' },
      { type: 'function', name: 'balanceOf' },
      { type: 'function', name: 'owner' },
      { type: 'function', name: 'setSettlementAuthority' },
      { type: 'event', name: 'Deposit' },
      { type: 'event', name: 'Withdraw' },
    ],
  };

  const result = checkAbiCompleteness(mockArtifact, 'TradingVault');

  assert.equal(result.complete, true, 'should be complete');
  assert.equal(result.missingFunctions.length, 0, 'no missing functions');
  assert.equal(result.missingEvents.length, 0, 'no missing events');
  assert.equal(result.error, null, 'no error');
});

test('checkAbiCompleteness returns missing functions', async () => {
  const { checkAbiCompleteness } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const mockArtifact = {
    abi: [
      { type: 'function', name: 'deposit' },
      { type: 'event', name: 'Deposit' },
      { type: 'event', name: 'Withdraw' },
    ],
  };

  const result = checkAbiCompleteness(mockArtifact, 'TradingVault');

  assert.equal(result.complete, false, 'should not be complete');
  assert.ok(result.missingFunctions.includes('withdraw'), 'withdraw should be missing');
  assert.ok(result.missingFunctions.includes('balanceOf'), 'balanceOf should be missing');
});

test('checkAbiCompleteness returns missing events', async () => {
  const { checkAbiCompleteness } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const mockArtifact = {
    abi: [
      { type: 'function', name: 'deposit' },
      { type: 'function', name: 'withdraw' },
      { type: 'function', name: 'balanceOf' },
      { type: 'function', name: 'owner' },
      { type: 'function', name: 'setSettlementAuthority' },
      // Missing Withdraw event
    ],
  };

  const result = checkAbiCompleteness(mockArtifact, 'TradingVault');

  assert.equal(result.complete, false, 'should not be complete');
  assert.ok(result.missingEvents.includes('Withdraw'), 'Withdraw event should be missing');
});

test('checkAbiCompleteness handles unknown contract', async () => {
  const { checkAbiCompleteness } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const mockArtifact = { abi: [] };
  const result = checkAbiCompleteness(mockArtifact, 'UnknownContract');

  assert.equal(result.complete, false, 'unknown contract should be incomplete');
  assert.ok(result.error, 'should have error for unknown contract');
});

// ── Unit tests: Settlement completeness ───────────────────────────────

test('checkAbiCompleteness validates Settlement contract requirements', async () => {
  const { checkAbiCompleteness, REQUIRED_ABI_MEMBERS } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const settlement = REQUIRED_ABI_MEMBERS.Settlement;
  assert.ok(settlement.functions.includes('settleTrade'), 'Settlement should require settleTrade function');
  assert.ok(settlement.events.includes('TradeSettled'), 'Settlement should require TradeSettled event');

  const mockArtifact = {
    abi: [
      { type: 'function', name: 'settleTrade' },
      { type: 'function', name: 'settlementStatus' },
      { type: 'event', name: 'TradeSettled' },
    ],
  };

  const result = checkAbiCompleteness(mockArtifact, 'Settlement');
  assert.equal(result.complete, true, 'Settlement should be complete with required members');
});

// ── Unit tests: NonceManager completeness ─────────────────────────────

test('checkAbiCompleteness validates NonceManager contract requirements', async () => {
  const { checkAbiCompleteness, REQUIRED_ABI_MEMBERS } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const nonceManager = REQUIRED_ABI_MEMBERS.NonceManager;
  assert.ok(nonceManager.functions.includes('incrementNonce'), 'should require incrementNonce');
  assert.ok(nonceManager.functions.includes('cancelNonce'), 'should require cancelNonce');
  assert.ok(nonceManager.functions.includes('cancelNonceRange'), 'should require cancelNonceRange');
  assert.ok(nonceManager.events.includes('NonceUsed'), 'should require NonceUsed');
  assert.ok(nonceManager.events.includes('NonceCancelled'), 'should require NonceCancelled');
  assert.ok(nonceManager.events.includes('NonceRangeCancelled'), 'should require NonceRangeCancelled');
});

// ── Live integration: validate against real artifacts ─────────────────

test('validateAbiCompleteness resolves artifacts path and reads all contracts', async () => {
  const { validateAbiCompleteness, resolveArtifactsPath } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const artifactsPath = resolveArtifactsPath();
  assert.ok(artifactsPath !== null, 'artifacts path should be resolved');

  const report = validateAbiCompleteness({ artifactsPath });

  assert.equal(report.artifactsPath, artifactsPath, 'should use resolved path');
  assert.equal(report.contractsChecked, 6, 'should check all 6 contracts');
  assert.ok(typeof report.ready === 'boolean', 'ready should be boolean');
  assert.ok(Array.isArray(report.blockers), 'blockers should be array');
});

test('validateAbiCompleteness report includes per-contract results', async () => {
  const { validateAbiCompleteness } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const report = validateAbiCompleteness();

  for (const name of ['TradingVault', 'Settlement', 'NonceManager', 'MarketRegistry', 'FeeManager', 'DelegateKeyRegistry']) {
    assert.ok(report.contracts[name], `report should include ${name}`);
    assert.equal(report.contracts[name].contract, name, `${name} should have correct contract name`);
  }
});

test('validateAbiCompleteness report counts complete vs incomplete contracts', async () => {
  const { validateAbiCompleteness } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const report = validateAbiCompleteness();

  assert.equal(
    report.contractsComplete + report.contractsIncomplete,
    report.contractsChecked,
    'complete + incomplete should equal checked',
  );
});

test('validateAbiCompleteness readiness reflects all contracts complete', async () => {
  const { validateAbiCompleteness } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const report = validateAbiCompleteness();

  if (report.ready) {
    assert.equal(report.contractsComplete, 6, 'ready=true means all 6 contracts complete');
    assert.equal(report.contractsIncomplete, 0, 'ready=true means 0 incomplete');
    assert.equal(report.blockers.length, 0, 'ready=true means no blockers');
  }
});

test('validateAbiCompleteness report includes safety metadata', async () => {
  const { validateAbiCompleteness } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const report = validateAbiCompleteness();

  assert.equal(report.realQuaiTransactions, false, 'realQuaiTransactions must be false');
  assert.equal(report.walletRequired, false, 'walletRequired must be false');
  assert.equal(report.noWalletLoaded, true, 'noWalletLoaded must be true');
  assert.equal(report.noRpcCallMade, true, 'noRpcCallMade must be true');
  assert.equal(report.noSigning, true, 'noSigning must be true');
  assert.equal(report.noBroadcasting, true, 'noBroadcasting must be true');
  assert.equal(report.noFundsMovement, true, 'noFundsMovement must be true');
  assert.equal(report.noContractDeploy, true, 'noContractDeploy must be true');
  assert.equal(report.approvalGate, 'explicit-approval-required-before-deploy', 'approvalGate must be set');
});

test('validateAbiCompleteness with missing artifacts path fails gracefully', async () => {
  const { validateAbiCompleteness } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const report = validateAbiCompleteness({ artifactsPath: '/nonexistent/path' });

  assert.equal(report.ready, false, 'should not be ready when artifacts missing');
  // When explicit path is given but doesn't exist, it passes through and all contracts fail
  assert.ok(report.contractsIncomplete > 0, 'should have incomplete contracts');
  assert.ok(report.blockers.length > 0, 'should have blockers when artifacts missing');
});

// ── assertAbiComplete throws on incomplete ABI ────────────────────────

test('assertAbiComplete throws when artifacts path missing', async () => {
  const { assertAbiComplete } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  assert.throws(
    () => assertAbiComplete({ artifactsPath: '/nonexistent/path' }),
    /ABI completeness validation FAILED/,
    'should throw with descriptive error',
  );
});

test('assertAbiComplete returns report when artifacts are complete', async () => {
  const { assertAbiComplete, validateAbiCompleteness } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  // Check if artifacts are actually available
  const liveReport = validateAbiCompleteness();
  if (liveReport.ready) {
    const report = assertAbiComplete();
    assert.equal(report.ready, true, 'should return complete report');
  }
  // If artifacts are not complete (expected before deployment), we skip the positive case
});

// ── formatAbiCompletenessSummary ──────────────────────────────────────

test('formatAbiCompletenessSummary produces readable output', async () => {
  const { formatAbiCompletenessSummary, validateAbiCompleteness } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const report = validateAbiCompleteness();
  const summary = formatAbiCompletenessSummary(report);

  assert.ok(typeof summary === 'string', 'summary should be a string');
  assert.ok(summary.includes('ABI Completeness Report'), 'should include title');
  assert.ok(summary.includes('Contracts checked'), 'should include check count');
  assert.ok(summary.includes('Ready for deployment'), 'should include readiness');
  assert.ok(summary.includes('Safety:'), 'should include safety notice');
  assert.ok(summary.includes('Approval:'), 'should include approval notice');
});

test('formatAbiCompletenessSummary includes per-contract status', async () => {
  const { formatAbiCompletenessSummary, validateAbiCompleteness } = await import('../services/api/src/testnet-contract-abi-completeness.js');

  const report = validateAbiCompleteness();
  const summary = formatAbiCompletenessSummary(report);

  for (const name of ['TradingVault', 'Settlement', 'NonceManager', 'MarketRegistry', 'FeeManager', 'DelegateKeyRegistry']) {
    assert.ok(summary.includes(name), `summary should include ${name}`);
  }
});

// ── Source safety scan ────────────────────────────────────────────────

test('testnet-contract-abi-completeness.js source contains no wallet/signing patterns', async () => {
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const sourcePath = join(dirname(fileURLToPath(import.meta.url)), '../services/api/src/testnet-contract-abi-completeness.js');
  const source = readFileSync(sourcePath, 'utf8');

  // Should use only read-only file system operations
  assert.ok(source.includes('readFileSync'), 'should use readFileSync');
  assert.ok(source.includes('existsSync'), 'should use existsSync');

  // Should NOT reference any wallet, signing, or writing methods
  const forbiddenPatterns = [
    /eth_sendTransaction/,
    /eth_sign/,
    /personal_sign/,
    /wallet_add/,
    /wallet_import/,
    /privateKey/,
    /signTransaction/,
    /fetch\(/,
    /sendTransaction/,
  ];
  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(source), false, `source should not reference: ${pattern}`);
  }
});

test('testnet-contract-abi-completeness.js defines safety metadata in all results', async () => {
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const sourcePath = join(dirname(fileURLToPath(import.meta.url)), '../services/api/src/testnet-contract-abi-completeness.js');
  const source = readFileSync(sourcePath, 'utf8');

  // Should include safety metadata fields
  assert.ok(source.includes('realQuaiTransactions: false'), 'should include realQuaiTransactions');
  assert.ok(source.includes('walletRequired: false'), 'should include walletRequired');
  assert.ok(source.includes('noWalletLoaded: true'), 'should include noWalletLoaded');
  assert.ok(source.includes('noSigning: true'), 'should include noSigning');
  assert.ok(source.includes('noContractDeploy: true'), 'should include noContractDeploy');
  assert.ok(source.includes('approvalGate'), 'should include approvalGate');
});

// ── Readiness integration: ties back to testnet-config.js ─────────────

test('ABI completeness contracts match testnet-config contract keys', async () => {
  const { ABI_COMPLETENESS_CONTRACTS } = await import('../services/api/src/testnet-contract-abi-completeness.js');
  const { TESTNET_CONFIG } = await import('../services/api/src/testnet-config.js');

  const configContractKeys = Object.keys(TESTNET_CONFIG.contracts);
  const completenessContracts = [...ABI_COMPLETENESS_CONTRACTS];

  assert.equal(completenessContracts.length, configContractKeys.length, 'should have same contract count');

  for (const name of completenessContracts) {
    assert.ok(configContractKeys.includes(name), `testnet-config should include ${name}`);
  }
});

test('ABI completeness events align with event-truth adapter event types', async () => {
  const { REQUIRED_ABI_MEMBERS } = await import('../services/api/src/testnet-contract-abi-completeness.js');
  const { EVENT_TRUTH_EVENT_TYPES } = await import('../services/indexer/src/event-truth-adapter.js');

  // Collect all required events from ABI completeness
  const abiEvents = [];
  for (const contract of Object.values(REQUIRED_ABI_MEMBERS)) {
    abiEvents.push(...contract.events);
  }

  // Every ABI completeness event should be in the event-truth adapter
  for (const evt of abiEvents) {
    assert.ok(EVENT_TRUTH_EVENT_TYPES.includes(evt), `ABI event "${evt}" should be in EVENT_TRUTH_EVENT_TYPES`);
  }
});
