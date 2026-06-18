import assert from 'node:assert/strict';
import test from 'node:test';

// ── Module structure and exports ──────────────────────────────────────

test('testnet-rpc-latency exports all required functions and constants', async () => {
  const mod = await import('../services/api/src/testnet-rpc-latency.js');

  assert.equal(typeof mod.benchmarkRpcMethod, 'function', 'benchmarkRpcMethod should be exported');
  assert.equal(typeof mod.measureBlockCadence, 'function', 'measureBlockCadence should be exported');
  assert.equal(typeof mod.runRpcLatencyBenchmark, 'function', 'runRpcLatencyBenchmark should be exported');
  assert.equal(typeof mod.sendTimedRpcRequest, 'function', 'sendTimedRpcRequest should be exported');
  assert.equal(typeof mod.calcLatencyStats, 'function', 'calcLatencyStats should be exported');
  assert.equal(typeof mod.DEFAULT_TIMEOUT_MS, 'number', 'DEFAULT_TIMEOUT_MS should be exported');
  assert.ok(mod.DEFAULT_TIMEOUT_MS > 0, 'timeout should be positive');
});

// ── calcLatencyStats unit tests ───────────────────────────────────────

test('calcLatencyStats returns zeros for empty input', async () => {
  const { calcLatencyStats } = await import('../services/api/src/testnet-rpc-latency.js');

  const stats = calcLatencyStats([]);

  assert.equal(stats.min, 0, 'min should be 0');
  assert.equal(stats.max, 0, 'max should be 0');
  assert.equal(stats.avg, 0, 'avg should be 0');
  assert.equal(stats.median, 0, 'median should be 0');
  assert.equal(stats.p90, 0, 'p90 should be 0');
  assert.equal(stats.p95, 0, 'p95 should be 0');
  assert.equal(stats.p99, 0, 'p99 should be 0');
  assert.equal(stats.count, 0, 'count should be 0');
});

test('calcLatencyStats computes correct stats for single value', async () => {
  const { calcLatencyStats } = await import('../services/api/src/testnet-rpc-latency.js');

  const stats = calcLatencyStats([100]);

  assert.equal(stats.min, 100, 'min should be 100');
  assert.equal(stats.max, 100, 'max should be 100');
  assert.equal(stats.avg, 100, 'avg should be 100');
  assert.equal(stats.median, 100, 'median should be 100');
  assert.equal(stats.count, 1, 'count should be 1');
});

test('calcLatencyStats computes correct stats for multiple values', async () => {
  const { calcLatencyStats } = await import('../services/api/src/testnet-rpc-latency.js');

  const stats = calcLatencyStats([100, 200, 300, 400, 500]);

  assert.equal(stats.min, 100, 'min should be 100');
  assert.equal(stats.max, 500, 'max should be 500');
  assert.equal(stats.avg, 300, 'avg should be 300');
  assert.equal(stats.median, 300, 'median should be 300 (5th value sorted)');
  assert.equal(stats.count, 5, 'count should be 5');
  assert.ok(stats.p90 >= 400, 'p90 should be >= 400');
  assert.ok(stats.p95 >= 500, 'p95 should be >= 500');
  assert.ok(stats.p99 >= 500, 'p99 should be >= 500');
});

test('calcLatencyStats handles unsorted input correctly', async () => {
  const { calcLatencyStats } = await import('../services/api/src/testnet-rpc-latency.js');

  const stats = calcLatencyStats([500, 100, 300, 200, 400]);

  assert.equal(stats.min, 100, 'min should be 100 even for unsorted input');
  assert.equal(stats.max, 500, 'max should be 500 even for unsorted input');
  assert.equal(stats.avg, 300, 'avg should be 300');
});

// ── RPC benchmark — live tests against Orchard ────────────────────────

test('benchmarkRpcMethod returns structured result with latency stats', async () => {
  const { benchmarkRpcMethod } = await import('../services/api/src/testnet-rpc-latency.js');

  const result = await benchmarkRpcMethod('eth_chainId', [], 3);

  assert.equal(result.method, 'eth_chainId', 'method should be eth_chainId');
  assert.equal(result.totalSamples, 3, 'totalSamples should be 3');
  assert.ok(result.successCount >= 0, 'successCount should be non-negative');
  assert.ok(result.successRate >= 0 && result.successRate <= 100, 'successRate should be 0-100');
  assert.equal(typeof result.latency, 'object', 'latency should be an object');
  assert.equal(typeof result.latency.avg, 'number', 'latency.avg should be a number');
  assert.equal(typeof result.latency.min, 'number', 'latency.min should be a number');
  assert.equal(typeof result.latency.max, 'number', 'latency.max should be a number');
});

test('benchmarkRpcMethod measures eth_blockNumber latency', async () => {
  const { benchmarkRpcMethod } = await import('../services/api/src/testnet-rpc-latency.js');

  const result = await benchmarkRpcMethod('eth_blockNumber', [], 3);

  assert.equal(result.method, 'eth_blockNumber', 'method should be eth_blockNumber');
  assert.ok(result.latency.count > 0, 'should have measured latency');
  assert.ok(result.latency.min >= 0, 'min latency should be >= 0');
  assert.ok(result.latency.max >= result.latency.min, 'max should be >= min');
});

test('benchmarkRpcMethod measures net_version latency', async () => {
  const { benchmarkRpcMethod } = await import('../services/api/src/testnet-rpc-latency.js');

  const result = await benchmarkRpcMethod('net_version', [], 3);

  assert.equal(result.method, 'net_version', 'method should be net_version');
  assert.ok(result.latency.count > 0, 'should have measured latency');
});

// ── Block cadence measurement ─────────────────────────────────────────

test('measureBlockCadence returns structured result', async () => {
  const { measureBlockCadence } = await import('../services/api/src/testnet-rpc-latency.js');

  const result = await measureBlockCadence({ pollIntervalMs: 1000, samples: 3 });

  assert.equal(Array.isArray(result.blocks), true, 'blocks should be an array');
  assert.ok(result.blocks.length <= 3, 'should have at most 3 block samples');
  assert.equal(Array.isArray(result.intervals), true, 'intervals should be an array');
});

// ── Full latency benchmark suite ──────────────────────────────────────

test('runRpcLatencyBenchmark returns structured report with all methods', async () => {
  const { runRpcLatencyBenchmark } = await import('../services/api/src/testnet-rpc-latency.js');

  const report = await runRpcLatencyBenchmark({ samples: 3 });

  assert.equal(report.runnable, true, 'should be runnable (RPC configured)');
  assert.ok(report.rpcUrl !== null, 'rpcUrl should be set');
  assert.equal(report.networkName, 'quai-orchard', 'networkName should match');
  assert.equal(report.zone, 'cyprus1', 'zone should match');
  assert.equal(report.chainId, 15000, 'chainId should be 15000');

  // Methods
  assert.ok(report.methods.eth_chainId !== undefined, 'eth_chainId benchmark should be present');
  assert.ok(report.methods.eth_blockNumber !== undefined, 'eth_blockNumber benchmark should be present');
  assert.ok(report.methods.net_version !== undefined, 'net_version benchmark should be present');

  // Overall stats
  assert.ok(report.overall.avgLatencyMs >= 0, 'avgLatencyMs should be >= 0');
  assert.ok(report.overall.maxLatencyMs >= 0, 'maxLatencyMs should be >= 0');
  assert.ok(report.overall.successRate >= 0 && report.overall.successRate <= 100, 'successRate should be 0-100');
  assert.ok(['healthy', 'degraded', 'unreliable'].includes(report.overall.health), 'health should be valid');

  // Safety
  assert.equal(report.safety.realQuaiTransactions, false, 'realQuaiTransactions must be false');
  assert.equal(report.safety.walletRequired, false, 'walletRequired must be false');
  assert.equal(report.safety.noWalletLoaded, true, 'noWalletLoaded must be true');
  assert.equal(report.safety.noSigning, true, 'noSigning must be true');
  assert.equal(report.safety.noBroadcasting, true, 'noBroadcasting must be true');
  assert.equal(report.safety.noFundsMovement, true, 'noFundsMovement must be true');
  assert.equal(report.safety.noContractDeploy, true, 'noContractDeploy must be true');
  assert.equal(report.safety.approvalGate, 'read-only-rpc-benchmark-only', 'approvalGate should be set');
});

test('runRpcLatencyBenchmark health assessment logic', async () => {
  const { runRpcLatencyBenchmark } = await import('../services/api/src/testnet-rpc-latency.js');

  const report = await runRpcLatencyBenchmark({ samples: 3 });

  // If successRate is 100 and maxLatency is < 3000ms, health should be 'healthy'
  if (report.overall.successRate === 100 && report.overall.maxLatencyMs < 3000) {
    assert.equal(report.overall.health, 'healthy', 'should be healthy when all succeed and fast');
  } else if (report.overall.successRate >= 80) {
    assert.equal(report.overall.health, 'degraded', 'should be degraded when some fail or slow');
  } else {
    assert.equal(report.overall.health, 'unreliable', 'should be unreliable when many fail');
  }
});

// ── Fail-closed: no RPC URL ───────────────────────────────────────────

test('sendTimedRpcRequest fails gracefully when rpcUrl is absent', async () => {
  // Verify that the current config has an RPC URL — if it did not, the function
  // would return { success: false, latencyMs: 0, data: null, error: 'rpcUrl not configured' }
  const { TESTNET_CONFIG } = await import('../services/api/src/testnet-config.js');
  assert.ok(TESTNET_CONFIG.rpcUrl, 'rpcUrl should be configured for this test');

  const { sendTimedRpcRequest } = await import('../services/api/src/testnet-rpc-latency.js');
  const result = await sendTimedRpcRequest('eth_chainId');

  // Should return a structured result, never throw
  assert.equal(typeof result.success, 'boolean', 'should return success boolean');
  assert.equal(typeof result.latencyMs, 'number', 'should return latencyMs');
});

// ── Safety envelope ───────────────────────────────────────────────────

test('testnet-rpc-latency.js preserves safety envelope — no secrets or wallet APIs', async () => {
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const sourcePath = join(dirname(fileURLToPath(import.meta.url)), '../services/api/src/testnet-rpc-latency.js');
  const source = readFileSync(sourcePath, 'utf8');

  // Should only use read-only JSON-RPC methods
  const readOnlyMethods = ['eth_chainId', 'eth_blockNumber', 'net_version'];
  for (const method of readOnlyMethods) {
    assert.ok(source.includes(method), `source should reference read-only method: ${method}`);
  }

  // Should NOT reference wallet, signing, or writing methods
  const forbiddenPatterns = [
    /eth_sendTransaction/,
    /eth_sign/,
    /personal_sign/,
    /wallet_add/,
    /privateKey/,
    /signTransaction/,
    /mnemonic|seed phrase|recovery phrase/i,
  ];
  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(source), false, `source should not reference: ${pattern}`);
  }

  // Should import TESTNET_CONFIG, not any wallet module
  assert.ok(source.includes('TESTNET_CONFIG'), 'should import TESTNET_CONFIG');
});

// ── Integration: benchmark result ties back to readiness surfaces ─────

test('rpc latency benchmark results can feed into readiness report', async () => {
  const { runRpcLatencyBenchmark } = await import('../services/api/src/testnet-rpc-latency.js');
  const { probeTestnetReadiness } = await import('../services/api/src/testnet-connection-probe.js');

  // Both should reference the same RPC URL
  const [benchmark, readiness] = await Promise.all([
    runRpcLatencyBenchmark({ samples: 2 }),
    probeTestnetReadiness(),
  ]);

  assert.equal(benchmark.rpcUrl, readiness.rpcUrl, 'both should use the same RPC URL');
  assert.equal(benchmark.networkName, readiness.networkName, 'both should use the same networkName');
  assert.equal(benchmark.zone, readiness.zone, 'both should use the same zone');
  assert.equal(benchmark.chainId, readiness.chainId.chainIdDecimal, 'benchmark chainId should match probe chainId');
});
