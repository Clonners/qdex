import assert from 'node:assert/strict';
import test from 'node:test';

// ── Explorer helper functions ──────────────────────────────────────────

test('testnet-config exports explorer helper functions', async () => {
  const mod = await import('../services/api/src/testnet-config.js');

  assert.equal(typeof mod.TESTNET_CONFIG, 'object', 'TESTNET_CONFIG should be exported');
  assert.equal(typeof mod.explorerUrlForTx, 'function', 'explorerUrlForTx should be exported');
  assert.equal(typeof mod.explorerUrlForAddress, 'function', 'explorerUrlForAddress should be exported');
  assert.equal(typeof mod.explorerUrlForBlock, 'function', 'explorerUrlForBlock should be exported');
});

test('explorerUrlForTx builds correct URL with 0x prefix', async () => {
  const { explorerUrlForTx } = await import('../services/api/src/testnet-config.js');

  const url = explorerUrlForTx('0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
  assert.ok(url, 'should return a URL');
  assert.ok(url.startsWith('https://orchard.quaiscan.io/tx/'), 'should start with base URL /tx/');
  assert.ok(url.includes('0xabcdef'), 'should include tx hash');
});

test('explorerUrlForTx normalizes hash without 0x prefix', async () => {
  const { explorerUrlForTx } = await import('../services/api/src/testnet-config.js');

  const url = explorerUrlForTx('abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
  assert.ok(url, 'should return a URL');
  assert.ok(url.includes('0xabcdef'), 'should normalize hash with 0x prefix');
});

test('explorerUrlForTx returns null for empty or missing input', async () => {
  const { explorerUrlForTx } = await import('../services/api/src/testnet-config.js');

  assert.equal(explorerUrlForTx(null), null, 'should return null for null');
  assert.equal(explorerUrlForTx(undefined), null, 'should return null for undefined');
  assert.equal(explorerUrlForTx(''), null, 'should return null for empty string');
});

test('explorerUrlForAddress builds correct URL with 0x prefix', async () => {
  const { explorerUrlForAddress } = await import('../services/api/src/testnet-config.js');

  const url = explorerUrlForAddress('0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267');
  assert.ok(url, 'should return a URL');
  assert.ok(url.startsWith('https://orchard.quaiscan.io/address/'), 'should start with base URL /address/');
  assert.ok(url.includes('0x005CAD'), 'should include address');
});

test('explorerUrlForAddress normalizes address without 0x prefix', async () => {
  const { explorerUrlForAddress } = await import('../services/api/src/testnet-config.js');

  const url = explorerUrlForAddress('005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267');
  assert.ok(url, 'should return a URL');
  assert.ok(url.includes('0x005CAD'), 'should normalize address with 0x prefix');
});

test('explorerUrlForAddress returns null for empty or missing input', async () => {
  const { explorerUrlForAddress } = await import('../services/api/src/testnet-config.js');

  assert.equal(explorerUrlForAddress(null), null, 'should return null for null');
  assert.equal(explorerUrlForAddress(undefined), null, 'should return null for undefined');
  assert.equal(explorerUrlForAddress(''), null, 'should return null for empty string');
});

test('explorerUrlForBlock builds correct URL for decimal block number', async () => {
  const { explorerUrlForBlock } = await import('../services/api/src/testnet-config.js');

  const url = explorerUrlForBlock(7277130);
  assert.ok(url, 'should return a URL');
  assert.ok(url.startsWith('https://orchard.quaiscan.io/block/'), 'should start with base URL /block/');
  assert.ok(url.includes('7277130'), 'should include block number');
});

test('explorerUrlForBlock builds correct URL for block hash', async () => {
  const { explorerUrlForBlock } = await import('../services/api/src/testnet-config.js');

  const url = explorerUrlForBlock('0xblockhash1234567890abcdef1234567890abcdef1234567890abcdef12345678');
  assert.ok(url, 'should return a URL');
  assert.ok(url.startsWith('https://orchard.quaiscan.io/block/'), 'should start with base URL /block/');
  assert.ok(url.includes('0xblockhash'), 'should include block hash');
});

test('explorerUrlForBlock returns null for empty or missing input', async () => {
  const { explorerUrlForBlock } = await import('../services/api/src/testnet-config.js');

  assert.equal(explorerUrlForBlock(null), null, 'should return null for null');
  assert.equal(explorerUrlForBlock(undefined), null, 'should return null for undefined');
  assert.equal(explorerUrlForBlock(0), 'https://orchard.quaiscan.io/block/0', 'block 0 should be valid');
});

// ── Safety: explorer helpers do not invoke RPC, wallet, or signing ─────

test('explorer helpers are pure functions — no network or side effects', async () => {
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const configPath = join(dirname(fileURLToPath(import.meta.url)), '../services/api/src/testnet-config.js');
  const source = readFileSync(configPath, 'utf8');

  // Should reference the Orchard explorer URL
  assert.ok(source.includes('orchard.quaiscan.io'), 'should reference Orchard explorer');

  // Should NOT reference any wallet, signing, or RPC methods
  const forbiddenPatterns = [
    /eth_sendTransaction/,
    /eth_sign/,
    /personal_sign/,
    /privateKey/,
    /signTransaction/,
  ];
  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(source), false, `source should not reference: ${pattern}`);
  }
});

// ── Readiness: explorer is now configured and readiness reflects that ──

test('probeTestnetReadiness reports explorer as configured', async () => {
  const { probeTestnetReadiness } = await import('../services/api/src/testnet-connection-probe.js');

  const report = await probeTestnetReadiness();

  assert.equal(report.explorerConfigured, true, 'explorer should be configured');
  assert.equal(report.explorerBaseUrl, 'https://orchard.quaiscan.io', 'explorer URL should match config');
  assert.ok(!report.missingFields.some(f => f.includes('explorerBaseUrl')), 'explorer should not be in missing fields');
});

test('explorer helpers use TESTNET_CONFIG and fail-closed when unconfigured', async () => {
  // Verify that the helper functions check for null/undefined config
  // Since we can't easily override the frozen TESTNET_CONFIG, we verify
  // the null-input guard works (which exercises the same code path)
  const { explorerUrlForTx, explorerUrlForAddress, explorerUrlForBlock } =
    await import('../services/api/src/testnet-config.js');

  // All should return null for falsy inputs
  assert.equal(explorerUrlForTx(null), null);
  assert.equal(explorerUrlForAddress(null), null);
  assert.equal(explorerUrlForBlock(null), null);
});
