/**
 * Testnet RPC latency and block timing module.
 *
 * Measures read-only RPC response times and block cadence to help evaluate
 * whether the Orchard testnet RPC endpoint is suitable for relayer operations.
 *
 * This is a diagnostic tool only — it makes read-only RPC calls and never
 * loads wallets, signs transactions, broadcasts, or moves funds.
 *
 * Boundaries:
 * - Read-only JSON-RPC methods only: eth_chainId, eth_blockNumber, net_version
 * - No wallet loading, signing, or broadcasting
 * - No contract interaction
 * - Configurable sample count and poll interval
 * - Fail-closed when RPC URL is not configured
 */

import { TESTNET_CONFIG } from './testnet-config.js';

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Send a raw JSON-RPC request with timing instrumentation.
 *
 * @param {string} method - JSON-RPC method name
 * @param {unknown[]} [params] - JSON-RPC parameters
 * @param {number} [timeoutMs] - Request timeout in milliseconds
 * @returns {Promise<{success: boolean, latencyMs: number, data: unknown, error: string|null}>}
 */
async function sendTimedRpcRequest(method, params = [], timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!TESTNET_CONFIG.rpcUrl) {
    return {
      success: false,
      latencyMs: 0,
      data: null,
      error: 'rpcUrl not configured',
    };
  }

  const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const response = await fetch(TESTNET_CONFIG.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeoutHandle);

    const latencyMs = Math.round(performance.now() - start);
    const body = await response.json();

    if (body.error) {
      return {
        success: false,
        latencyMs,
        data: null,
        error: `RPC error ${body.error.code}: ${body.error.message}`,
      };
    }

    return {
      success: true,
      latencyMs,
      data: body.result,
      error: null,
    };
  } catch (err) {
    clearTimeout(timeoutHandle);
    const latencyMs = Math.round(performance.now() - start);
    return {
      success: false,
      latencyMs,
      data: null,
      error: err.name === 'AbortError' ? 'request timed out' : `network error: ${err.message}`,
    };
  }
}

/**
 * Calculate basic statistics for an array of latency values.
 *
 * @param {number[]} values - Array of latency values in milliseconds
 * @returns {object} - { min, max, avg, median, p90, p95, p99, count }
 */
function calcLatencyStats(values) {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, median: 0, p90: 0, p95: 0, p99: 0, count: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);

  const percentile = (p) => {
    const index = Math.ceil((p / 100) * count) - 1;
    return sorted[Math.max(0, index)];
  };

  return {
    min: sorted[0],
    max: sorted[count - 1],
    avg: Math.round(sum / count),
    median: percentile(50),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
    count,
  };
}

/**
 * Benchmark a single RPC method multiple times and return latency stats.
 *
 * @param {string} method - JSON-RPC method to benchmark
 * @param {unknown[]} [params] - Method parameters
 * @param {number} [samples] - Number of samples (default: 5)
 * @returns {Promise<object>} - Benchmark result with latency stats
 */
export async function benchmarkRpcMethod(method, params = [], samples = 5) {
  const latencies = [];
  let successCount = 0;

  for (let i = 0; i < samples; i++) {
    const result = await sendTimedRpcRequest(method, params);
    latencies.push(result.latencyMs);
    if (result.success) successCount++;
  }

  return {
    method,
    params: JSON.stringify(params),
    totalSamples: samples,
    successCount,
    successRate: Math.round((successCount / samples) * 100),
    latency: calcLatencyStats(latencies),
  };
}

/**
 * Measure block cadence by polling eth_blockNumber at regular intervals.
 *
 * This helps estimate the time between blocks on the testnet, which is
 * relevant for relayer settlement timing and finality estimation.
 *
 * @param {object} [options]
 * @param {number} [options.pollIntervalMs] - Interval between polls in ms (default: 3000)
 * @param {number} [options.samples] - Number of polls (default: 4, measuring 3 intervals)
 * @returns {Promise<object>} - Block cadence measurement
 */
export async function measureBlockCadence(options = {}) {
  const { pollIntervalMs = 3000, samples = 4 } = options;
  const blocks = [];

  for (let i = 0; i < samples; i++) {
    const result = await sendTimedRpcRequest('eth_blockNumber');
    if (result.success) {
      const blockNum = result.data.startsWith('0x')
        ? parseInt(result.data, 16)
        : parseInt(result.data, 10);
      blocks.push({
        number: blockNum,
        latencyMs: result.latencyMs,
        timestamp: Date.now(),
      });
    }
    if (i < samples - 1) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  if (blocks.length < 2) {
    return {
      measured: false,
      blocks,
      error: blocks.length === 0 ? 'no successful polls' : 'need at least 2 samples',
    };
  }

  const intervals = [];
  for (let i = 1; i < blocks.length; i++) {
    const timeDelta = blocks[i].timestamp - blocks[i - 1].timestamp;
    const blockDelta = blocks[i].number - blocks[i - 1].number;
    if (blockDelta > 0) {
      intervals.push({
        blocks: blockDelta,
        timeMs: timeDelta,
        avgMsPerBlock: Math.round(timeDelta / blockDelta),
      });
    } else {
      intervals.push({
        blocks: 0,
        timeMs: timeDelta,
        avgMsPerBlock: null,
      });
    }
  }

  const blocksWithProgress = intervals.filter((i) => i.avgMsPerBlock !== null);
  const avgMsPerBlock = blocksWithProgress.length > 0
    ? Math.round(
        blocksWithProgress.reduce((sum, i) => sum + i.avgMsPerBlock, 0) / blocksWithProgress.length
      )
    : null;

  return {
    measured: true,
    blocks,
    intervals,
    totalBlocksObserved: blocks.length > 0 ? blocks[blocks.length - 1].number - blocks[0].number : 0,
    totalObservationMs: blocks.length > 0 ? blocks[blocks.length - 1].timestamp - blocks[0].timestamp : 0,
    avgMsPerBlock,
    estimatedBlockTimeSec: avgMsPerBlock ? Math.round(avgMsPerBlock / 1000) : null,
  };
}

/**
 * Run full RPC latency benchmark suite.
 *
 * Benchmarks eth_chainId, eth_blockNumber, and net_version, then produces
 * a consolidated report with per-method stats and overall latency assessment.
 *
 * @param {object} [options]
 * @param {number} [options.samples] - Samples per method (default: 5)
 * @param {number} [options.timeoutMs] - Per-request timeout (default: 8000)
 * @returns {Promise<object>} - Full latency benchmark report
 */
export async function runRpcLatencyBenchmark(options = {}) {
  const { samples = 5, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  if (!TESTNET_CONFIG.rpcUrl) {
    return {
      runnable: false,
      rpcUrl: null,
      reason: 'rpcUrl not configured',
      safety: {
        realQuaiTransactions: false,
        walletRequired: false,
        noWalletLoaded: true,
        noSigning: true,
        noBroadcasting: true,
        noFundsMovement: true,
      },
    };
  }

  const [chainIdBench, blockNumberBench, netVersionBench] = await Promise.all([
    benchmarkRpcMethod('eth_chainId', [], samples),
    benchmarkRpcMethod('eth_blockNumber', [], samples),
    benchmarkRpcMethod('net_version', [], samples),
  ]);

  // Collect all latencies for overall stats
  const allLatencies = [
    ...chainIdBench.latency.count > 0
      ? Array.from({ length: chainIdBench.totalSamples }, (_, i) => chainIdBench.latency)
      : [],
  ];

  // We need raw latencies, so re-collect from individual calls
  // For simplicity, compute combined stats from the per-method results
  const allAvgLatencies = [
    chainIdBench.latency.avg,
    blockNumberBench.latency.avg,
    netVersionBench.latency.avg,
  ];
  const overallAvg = Math.round(
    allAvgLatencies.reduce((a, b) => a + b, 0) / allAvgLatencies.length
  );

  const allMaxLatencies = [
    chainIdBench.latency.max,
    blockNumberBench.latency.max,
    netVersionBench.latency.max,
  ];
  const overallMax = Math.max(...allMaxLatencies);

  const totalSuccesses =
    chainIdBench.successCount + blockNumberBench.successCount + netVersionBench.successCount;
  const totalSamples = samples * 3;
  const overallSuccessRate = Math.round((totalSuccesses / totalSamples) * 100);

  // Health assessment
  let health = 'unknown';
  if (overallSuccessRate === 100 && overallMax < 3000) {
    health = 'healthy';
  } else if (overallSuccessRate >= 80) {
    health = 'degraded';
  } else {
    health = 'unreliable';
  }

  return {
    runnable: true,
    rpcUrl: TESTNET_CONFIG.rpcUrl,
    networkName: TESTNET_CONFIG.networkName,
    zone: TESTNET_CONFIG.zone,
    chainId: TESTNET_CONFIG.chainId,

    // Per-method benchmarks
    methods: {
      eth_chainId: chainIdBench,
      eth_blockNumber: blockNumberBench,
      net_version: netVersionBench,
    },

    // Overall stats
    overall: {
      avgLatencyMs: overallAvg,
      maxLatencyMs: overallMax,
      totalSuccesses,
      totalSamples,
      successRate: overallSuccessRate,
      health,
    },

    // Safety metadata
    safety: {
      realQuaiTransactions: false,
      walletRequired: false,
      noWalletLoaded: true,
      noSigning: true,
      noBroadcasting: true,
      noFundsMovement: true,
      noContractDeploy: true,
      approvalGate: 'read-only-rpc-benchmark-only',
    },
  };
}

export { sendTimedRpcRequest, calcLatencyStats, DEFAULT_TIMEOUT_MS };
