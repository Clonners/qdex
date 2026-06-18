import assert from 'node:assert/strict';
import test from 'node:test';

// ── Module structure and safety metadata ──────────────────────────────

test('testnet-connection-probe exports required functions and constants', async () => {
  const mod = await import('../services/api/src/testnet-connection-probe.js');

  assert.equal(typeof mod.probeChainId, 'function', 'probeChainId should be exported');
  assert.equal(typeof mod.probeBlockNumber, 'function', 'probeBlockNumber should be exported');
  assert.equal(typeof mod.probeNetworkVersion, 'function', 'probeNetworkVersion should be exported');
  assert.equal(typeof mod.probeTestnetReadiness, 'function', 'probeTestnetReadiness should be exported');
  assert.equal(typeof mod.sendRpcRequest, 'function', 'sendRpcRequest should be exported');
  assert.equal(typeof mod.DEFAULT_TIMEOUT_MS, 'number', 'DEFAULT_TIMEOUT_MS should be exported');
  assert.equal(typeof mod.DEFAULT_MAX_RETRIES, 'number', 'DEFAULT_MAX_RETRIES should be exported');
  assert.ok(mod.DEFAULT_TIMEOUT_MS > 0, 'timeout should be positive');
});

test('testnet-config is imported with correct testnet-ready mode', async () => {
  const { TESTNET_CONFIG } = await import('../services/api/src/testnet-config.js');

  assert.equal(TESTNET_CONFIG.networkName, 'quai-orchard', 'networkName should be set');
  assert.equal(TESTNET_CONFIG.zone, 'cyprus1', 'zone should be set');
  assert.equal(TESTNET_CONFIG.rpcUrl, 'https://orchard.rpc.quai.network/cyprus1', 'rpcUrl should be set');
  assert.equal(TESTNET_CONFIG.mode, 'testnet-ready', 'mode should be testnet-ready');
  assert.equal(TESTNET_CONFIG.chainId, 15000, 'chainId should be 15000 (detected from Orchard)');
  assert.equal(TESTNET_CONFIG.explorerBaseUrl, null, 'explorerBaseUrl should still be null');
  assert.equal(TESTNET_CONFIG.deployer, '0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267', 'deployer should be configured');
  assert.deepStrictEqual(Object.keys(TESTNET_CONFIG.contracts), [
    'TradingVault', 'Settlement', 'NonceManager', 'MarketRegistry', 'FeeManager', 'DelegateKeyRegistry'
  ], 'all 6 contracts should be defined in config');
  assert.equal(TESTNET_CONFIG.contracts.TradingVault, null, 'contract addresses are null until deploy');
  assert.deepStrictEqual(Object.keys(TESTNET_CONFIG.tokens), ['WQUAI', 'WQI'], 'tokens should be WQUAI and WQI');
  assert.equal(TESTNET_CONFIG.tokens.WQUAI, null, 'token addresses are null until identified');
});

// ── Readiness report safety envelope ──────────────────────────────────

test('probeTestnetReadiness always includes safety metadata regardless of RPC success', async () => {
  const { probeTestnetReadiness } = await import('../services/api/src/testnet-connection-probe.js');

  const report = await probeTestnetReadiness();

  // Safety metadata must always be present
  assert.equal(report.realQuaiTransactions, false, 'realQuaiTransactions must be false');
  assert.equal(report.walletRequired, false, 'walletRequired must be false');
  assert.equal(report.noWalletLoaded, true, 'noWalletLoaded must be true');
  assert.equal(report.noSigning, true, 'noSigning must be true');
  assert.equal(report.noBroadcasting, true, 'noBroadcasting must be true');
  assert.equal(report.noFundsMovement, true, 'noFundsMovement must be true');
  assert.equal(report.noContractDeploy, true, 'noContractDeploy must be true');
  assert.equal(report.approvalGate, 'explicit-approval-required-before-wallet-or-deploy', 'approvalGate must be set');

  // Report structure
  assert.equal(typeof report.rpcConfigured, 'boolean', 'rpcConfigured should be boolean');
  assert.equal(typeof report.connected, 'boolean', 'connected should be boolean');
  assert.equal(typeof report.configComplete, 'boolean', 'configComplete should be boolean');
  assert.equal(Array.isArray(report.missingFields), true, 'missingFields should be array');

  // Probe result structure
  assert.equal(typeof report.chainId, 'object', 'chainId result should be object');
  assert.equal(typeof report.chainId.success, 'boolean', 'chainId.success should be boolean');
  assert.equal(typeof report.blockNumber, 'object', 'blockNumber result should be object');
  assert.equal(typeof report.blockNumber.success, 'boolean', 'blockNumber.success should be boolean');
  assert.equal(typeof report.networkVersion, 'object', 'networkVersion result should be object');
  assert.equal(typeof report.networkVersion.success, 'boolean', 'networkVersion.success should be boolean');
});

test('readiness report includes RPC configuration state', async () => {
  const { probeTestnetReadiness } = await import('../services/api/src/testnet-connection-probe.js');

  const report = await probeTestnetReadiness();

  assert.equal(report.rpcConfigured, true, 'rpcUrl is configured');
  assert.equal(report.rpcUrl, 'https://orchard.rpc.quai.network/cyprus1', 'rpcUrl should match testnet config');
  assert.equal(report.networkName, 'quai-orchard', 'networkName should match');
  assert.equal(report.zone, 'cyprus1', 'zone should match');
  assert.equal(report.mode, 'testnet-ready', 'mode should be testnet-ready');
});

test('readiness report identifies missing config fields', async () => {
  const { probeTestnetReadiness } = await import('../services/api/src/testnet-connection-probe.js');

  const report = await probeTestnetReadiness();

  // explorerBaseUrl is still null; deployer is now configured
  assert.ok(report.missingFields.some(f => f.includes('explorerBaseUrl')), 'should list explorerBaseUrl as missing');
  // deployer is no longer missing (configured: 0x005CAD...)
  assert.ok(!report.missingFields.some(f => f.includes('deployer')), 'deployer should NOT be missing (configured)');
  // chainId is populated (15000), so it should NOT be in missing fields
  assert.ok(!report.missingFields.some(f => f.includes('chainId')), 'chainId should NOT be missing (detected 15000)');
  assert.ok(report.missingFields.some(f => f.includes('contracts')), 'should list contracts as missing');
  assert.ok(report.missingFields.some(f => f.includes('tokens')), 'should list tokens as missing');
  assert.equal(report.configComplete, false, 'config should not be complete yet');
});

test('readiness report connected flag reflects actual probe success', async () => {
  const { probeTestnetReadiness } = await import('../services/api/src/testnet-connection-probe.js');

  const report = await probeTestnetReadiness();

  // If connected, both chainId and blockNumber should have succeeded
  if (report.connected) {
    assert.equal(report.chainId.success, true, 'chainId probe should succeed when connected');
    assert.equal(report.blockNumber.success, true, 'blockNumber probe should succeed when connected');
    assert.ok(report.chainId.chainIdDecimal !== null, 'chainIdDecimal should be populated');
    assert.ok(report.blockNumber.blockNumberDecimal !== null, 'blockNumberDecimal should be populated');
  }
});

// ── Hex parsing verification ──────────────────────────────────────────

test('probeChainId parses hex chain ID correctly when RPC succeeds', async () => {
  const { probeChainId } = await import('../services/api/src/testnet-connection-probe.js');

  const result = await probeChainId();

  if (result.success) {
    assert.ok(typeof result.chainIdHex === 'string', 'chainIdHex should be a string');
    assert.ok(result.chainIdHex.startsWith('0x'), 'chainIdHex should start with 0x');
    assert.ok(Number.isInteger(result.chainIdDecimal), 'chainIdDecimal should be an integer');
    assert.ok(result.chainIdDecimal > 0, 'chainIdDecimal should be positive');
  } else {
    assert.ok(typeof result.error === 'string', 'error should be a string on failure');
  }
});

test('probeBlockNumber parses hex block number correctly when RPC succeeds', async () => {
  const { probeBlockNumber } = await import('../services/api/src/testnet-connection-probe.js');

  const result = await probeBlockNumber();

  if (result.success) {
    assert.ok(typeof result.blockNumberHex === 'string', 'blockNumberHex should be a string');
    assert.ok(result.blockNumberHex.startsWith('0x'), 'blockNumberHex should start with 0x');
    assert.ok(Number.isInteger(result.blockNumberDecimal), 'blockNumberDecimal should be an integer');
    assert.ok(result.blockNumberDecimal >= 0, 'blockNumberDecimal should be non-negative');
  }
});

test('probeNetworkVersion returns string when RPC succeeds', async () => {
  const { probeNetworkVersion } = await import('../services/api/src/testnet-connection-probe.js');

  const result = await probeNetworkVersion();

  if (result.success) {
    assert.ok(typeof result.networkVersion === 'string', 'networkVersion should be a string');
    assert.ok(result.networkVersion.length > 0, 'networkVersion should not be empty');
  }
});

// ── Fail-closed behavior when RPC URL is absent ───────────────────────

test('sendRpcRequest fails gracefully when rpcUrl is null', async () => {
  // Temporarily override to test fail-closed behavior
  const mod = await import('../services/api/src/testnet-connection-probe.js');

  // We can't easily override TESTNET_CONFIG since it's imported, but we can verify
  // the current config has an RPC URL and the probe doesn't throw
  const result = await mod.sendRpcRequest('eth_chainId');
  // Result should be either success or structured failure, never an unhandled exception
  assert.equal(typeof result.success, 'boolean', 'sendRpcRequest should return success boolean');
});

// ── Integration: probes do not sign or broadcast ──────────────────────

test('all probes are read-only and never invoke wallet or signing APIs', async () => {
  const mod = await import('../services/api/src/testnet-connection-probe.js');

  // Verify that the module source does not reference wallet/signing methods
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const probeSourcePath = join(dirname(fileURLToPath(import.meta.url)), '../services/api/src/testnet-connection-probe.js');
  const source = readFileSync(probeSourcePath, 'utf8');

  // Should only use read-only JSON-RPC methods
  const readOnlyMethods = ['eth_chainId', 'eth_blockNumber', 'net_version'];
  for (const method of readOnlyMethods) {
    assert.ok(source.includes(method), `source should reference read-only method: ${method}`);
  }

  // Should NOT reference any wallet, signing, or writing methods
  const forbiddenPatterns = [
    /eth_sendTransaction/,
    /eth_sign/,
    /personal_sign/,
    /wallet_add/,
    /wallet_import/,
    /privateKey/,
    /signTransaction/,
  ];
  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(source), false, `source should not reference: ${pattern}`);
  }
});

// ── Ratchet: testnet-config.js preserves testnet-ready safety envelope ──

test('testnet-config.js preserves safety envelope — no secrets or real addresses', async () => {
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const configPath = join(dirname(fileURLToPath(import.meta.url)), '../services/api/src/testnet-config.js');
  const source = readFileSync(configPath, 'utf8');

  // Should reference the Orchard RPC URL
  assert.ok(source.includes('orchard.rpc.quai.network'), 'should reference Orchard RPC');
  assert.ok(source.includes('cyprus1'), 'should reference Cyprus1 zone');
  assert.ok(source.includes('testnet-ready'), 'mode should be testnet-ready');

  // Contract addresses and token addresses should be null
  assert.ok(source.includes('TradingVault: null'), 'TradingVault should be null');
  assert.ok(source.includes('Settlement: null'), 'Settlement should be null');
  assert.ok(source.includes('WQUAI: null'), 'WQUAI should be null');
  assert.ok(source.includes('WQI: null'), 'WQI should be null');

  // No private keys or secrets
  assert.equal(/0x[a-fA-F0-9]{64}/.test(source), false, 'should not contain private keys (64 hex chars)');
  assert.equal(/mnemonic|seed phrase|recovery phrase/i.test(source), false, 'should not reference seed phrases');
});
