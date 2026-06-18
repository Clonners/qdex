/**
 * Tests for testnet-token-discovery.js — read-only WQUAI/WQI discovery on Orchard.
 *
 * All tests are RED/Green: assertions before implementation.
 * Safety: no wallet, no signing, no broadcasting, no funds movement.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  KNOWN_WQUAI_CANDIDATES,
  KNOWN_WQI_CANDIDATES,
  NAME_SELECTOR,
  SYMBOL_SELECTOR,
  DECIMALS_SELECTOR,
  TOTAL_SUPPLY_SELECTOR,
  DEFAULT_TIMEOUT_MS,
  probeAddress,
  discoverToken,
  runTokenDiscovery,
  checkTokenMatch,
  verifySourceSafety,
  formatDiscoveryReport,
  __testExports,
} from '../services/api/src/testnet-token-discovery.js';

import { TESTNET_CONFIG } from '../services/api/src/testnet-config.js';

// ── Module exports ────────────────────────────────────────────────────

describe('testnet-token-discovery: module exports', () => {
  it('exports KNOWN_WQUAI_CANDIDATES array', () => {
    assert.ok(Array.isArray(KNOWN_WQUAI_CANDIDATES));
    assert.equal(Object.isFrozen(KNOWN_WQUAI_CANDIDATES), true);
  });

  it('exports KNOWN_WQI_CANDIDATES array', () => {
    assert.ok(Array.isArray(KNOWN_WQI_CANDIDATES));
    assert.equal(Object.isFrozen(KNOWN_WQI_CANDIDATES), true);
  });

  it('exports ERC-20 selectors', () => {
    assert.equal(NAME_SELECTOR, '0x06fdde03');
    assert.equal(SYMBOL_SELECTOR, '0x95d89b41');
    assert.equal(DECIMALS_SELECTOR, '0x313ce567');
    assert.equal(TOTAL_SUPPLY_SELECTOR, '0x18160ddd');
  });

  it('exports DEFAULT_TIMEOUT_MS', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 10000);
  });

  it('exports probeAddress function', () => {
    assert.equal(typeof probeAddress, 'function');
  });

  it('exports discoverToken function', () => {
    assert.equal(typeof discoverToken, 'function');
  });

  it('exports runTokenDiscovery function', () => {
    assert.equal(typeof runTokenDiscovery, 'function');
  });

  it('exports checkTokenMatch function', () => {
    assert.equal(typeof checkTokenMatch, 'function');
  });

  it('exports verifySourceSafety function', () => {
    assert.equal(typeof verifySourceSafety, 'function');
  });

  it('exports formatDiscoveryReport function', () => {
    assert.equal(typeof formatDiscoveryReport, 'function');
  });

  it('exports __testExports with internal functions', () => {
    assert.ok(__testExports);
    assert.equal(typeof __testExports.checkBytecode, 'function');
    assert.equal(typeof __testExports.readErc20String, 'function');
    assert.equal(typeof __testExports.readErc20Uint256, 'function');
    assert.equal(typeof __testExports.decodeAbiString, 'function');
    assert.equal(typeof __testExports.rpcCall, 'function');
  });
});

// ── decodeAbiString ───────────────────────────────────────────────────

describe('decodeAbiString', () => {
  const { decodeAbiString } = __testExports;

  it('returns null for empty hex', () => {
    assert.equal(decodeAbiString(''), null);
    assert.equal(decodeAbiString('0x'), null);
    assert.equal(decodeAbiString('0x0'), null);
  });

  it('returns null for too-short hex', () => {
    assert.equal(decodeAbiString('0x00'), null);
  });
});

// ── Safety metadata on results ────────────────────────────────────────

describe('safety metadata', () => {
  it('probeAddress result carries safety envelope', async () => {
    // Probe a zero address (no contract) — should return with safety
    const result = await probeAddress('0x0000000000000000000000000000000000000000');
    assert.equal(result.safety.realQuaiTransactions, false);
    assert.equal(result.safety.walletRequired, false);
    assert.equal(result.safety.noWalletLoaded, true);
    assert.equal(result.safety.noSigning, true);
    assert.equal(result.safety.noBroadcasting, true);
    assert.equal(result.safety.noFundsMovement, true);
    assert.equal(result.safety.noContractDeploy, true);
    assert.equal(result.safety.approvalGate, 'explicit-approval-required-before-deploy');
    assert.equal(result.safety.readOnlyRpcOnly, true);
  });
});

// ── probeAddress: zero address ────────────────────────────────────────

describe('probeAddress: zero address', () => {
  it('normalizes address without 0x prefix', async () => {
    const result = await probeAddress('0000000000000000000000000000000000000000');
    assert.equal(result.address, '0x0000000000000000000000000000000000000000');
  });

  it('zero address has no code', async () => {
    const result = await probeAddress('0x0000000000000000000000000000000000000000');
    assert.equal(result.hasCode, false);
    assert.equal(result.isErc20, false);
  });
});

// ── discoverToken: empty candidates ───────────────────────────────────

describe('discoverToken with empty candidates', () => {
  it('returns no-candidates status when no candidates', async () => {
    const result = await discoverToken('WQUAI', []);
    assert.equal(result.tokenType, 'WQUAI');
    assert.equal(result.candidatesProbed, 0);
    assert.equal(result.candidatesFound, 0);
    assert.equal(result.discovered, null);
    assert.equal(result.status, 'no-candidates');
    assert.equal(result.statusEmoji, '⚪');
    assert.ok(result.note.includes('No candidate addresses'));
  });

  it('returns no-candidates status for null candidates', async () => {
    const result = await discoverToken('WQI', null);
    assert.equal(result.status, 'no-candidates');
  });
});

// ── discoverToken: safety on result ───────────────────────────────────

describe('discoverToken safety envelope', () => {
  it('empty candidates result carries safety', async () => {
    const result = await discoverToken('WQUAI', []);
    assert.equal(result.safety.realQuaiTransactions, false);
    assert.equal(result.safety.walletRequired, false);
    assert.equal(result.safety.noSigning, true);
    assert.equal(result.safety.noBroadcasting, true);
    assert.equal(result.safety.noFundsMovement, true);
    assert.equal(result.safety.approvalGate, 'explicit-approval-required-before-deploy');
  });
});

// ── runTokenDiscovery: RPC configured ─────────────────────────────────

describe('runTokenDiscovery: RPC configured', () => {
  it('returns rpcConfigured true when RPC is set', async () => {
    const result = await runTokenDiscovery();
    assert.equal(result.rpcConfigured, TESTNET_CONFIG.rpcUrl !== null);
  });

  it('returns network info from config', async () => {
    const result = await runTokenDiscovery();
    assert.equal(result.networkName, TESTNET_CONFIG.networkName);
    assert.equal(result.zone, TESTNET_CONFIG.zone);
    assert.equal(result.chainId, TESTNET_CONFIG.chainId);
  });

  it('returns both wquai and wqi results', async () => {
    const result = await runTokenDiscovery();
    assert.ok(result.wquai);
    assert.ok(result.wqi);
    assert.equal(result.wquai.tokenType, 'WQUAI');
    assert.equal(result.wqi.tokenType, 'WQI');
  });

  it('overallStatus reflects discovery state', async () => {
    const result = await runTokenDiscovery();
    assert.ok(
      ['all-discovered', 'partial', 'none-discovered', 'rpc-not-configured'].includes(
        result.overallStatus
      )
    );
  });

  it('overallEmoji matches status', async () => {
    const result = await runTokenDiscovery();
    assert.ok(['🟢', '🟡', '⚪', '🔴'].includes(result.overallEmoji));
  });

  it('carries top-level safety envelope', async () => {
    const result = await runTokenDiscovery();
    assert.equal(result.safety.realQuaiTransactions, false);
    assert.equal(result.safety.walletRequired, false);
    assert.equal(result.safety.noWalletLoaded, true);
    assert.equal(result.safety.approvalGate, 'explicit-approval-required-before-deploy');
    assert.equal(result.safety.readOnlyRpcOnly, true);
  });
});

// ── checkTokenMatch ──────────────────────────────────────────────────

describe('checkTokenMatch', () => {
  it('returns no match for null discovery', () => {
    const { match, reasons } = checkTokenMatch(null, 'WQUAI', ['Wrapped QUAI']);
    assert.equal(match, false);
    assert.ok(reasons.some((r) => r.includes('no discovery')));
  });

  it('returns no match for discovery with null discovered', () => {
    const { match, reasons } = checkTokenMatch({ discovered: null }, 'WQUAI', []);
    assert.equal(match, false);
  });

  it('matches when symbol and name align', () => {
    const discovery = {
      discovered: {
        symbol: 'WQUAI',
        name: 'Wrapped QUAI',
        decimals: '18',
        totalSupply: '1000000000000000000000000',
      },
    };
    const { match, reasons } = checkTokenMatch(discovery, 'WQUAI', ['Wrapped QUAI']);
    assert.equal(match, true);
    assert.equal(reasons.length, 0);
  });

  it('mismatches when symbol is wrong', () => {
    const discovery = {
      discovered: {
        symbol: 'USDT',
        name: 'Wrapped QUAI',
      },
    };
    const { match, reasons } = checkTokenMatch(discovery, 'WQUAI', ['Wrapped QUAI']);
    assert.equal(match, false);
    assert.ok(reasons.some((r) => r.includes('symbol mismatch')));
  });

  it('mismatches when name does not match patterns', () => {
    const discovery = {
      discovered: {
        symbol: 'WQUAI',
        name: 'Totally Different Token',
      },
    };
    const { match, reasons } = checkTokenMatch(discovery, 'WQUAI', ['Wrapped QUAI']);
    assert.equal(match, false);
    assert.ok(reasons.some((r) => r.includes('does not match patterns')));
  });
});

// ── formatDiscoveryReport ────────────────────────────────────────────

describe('formatDiscoveryReport', () => {
  it('includes network info', () => {
    const report = {
      networkName: 'quai-orchard',
      zone: 'cyprus1',
      chainId: 15000,
      rpcUrl: 'https://test.example',
      overallStatus: 'none-discovered',
      overallEmoji: '⚪',
      wquai: { statusEmoji: '⚪', status: 'no-candidates', candidatesProbed: 0, discovered: null },
      wqi: { statusEmoji: '⚪', status: 'no-candidates', candidatesProbed: 0, discovered: null },
    };
    const text = formatDiscoveryReport(report);
    assert.ok(text.includes('quai-orchard'));
    assert.ok(text.includes('cyprus1'));
    assert.ok(text.includes('15000'));
    assert.ok(text.includes('none-discovered'));
  });

  it('includes discovered token details', () => {
    const report = {
      networkName: 'quai-orchard',
      zone: 'cyprus1',
      chainId: 15000,
      rpcUrl: 'https://test.example',
      overallStatus: 'all-discovered',
      overallEmoji: '🟢',
      wquai: {
        statusEmoji: '🟢',
        status: 'discovered',
        candidatesProbed: 3,
        discovered: {
          address: '0x1234',
          name: 'Wrapped QUAI',
          symbol: 'WQUAI',
          decimals: '18',
          totalSupply: '1000000',
          score: 5,
        },
      },
      wqi: {
        statusEmoji: '🟢',
        status: 'discovered',
        candidatesProbed: 2,
        discovered: {
          address: '0x5678',
          name: 'Wrapped QI',
          symbol: 'WQI',
          decimals: '18',
          totalSupply: '500000',
          score: 5,
        },
      },
    };
    const text = formatDiscoveryReport(report);
    assert.ok(text.includes('0x1234'));
    assert.ok(text.includes('Wrapped QUAI'));
    assert.ok(text.includes('WQUAI'));
    assert.ok(text.includes('0x5678'));
    assert.ok(text.includes('Wrapped QI'));
    assert.ok(text.includes('WQI'));
  });

  it('includes safety and advisory notice', () => {
    const report = {
      networkName: 'quai-orchard',
      zone: 'cyprus1',
      chainId: 15000,
      rpcUrl: 'https://test.example',
      overallStatus: 'none-discovered',
      overallEmoji: '⚪',
      wquai: { statusEmoji: '⚪', status: 'no-candidates', candidatesProbed: 0, discovered: null },
      wqi: { statusEmoji: '⚪', status: 'no-candidates', candidatesProbed: 0, discovered: null },
    };
    const text = formatDiscoveryReport(report);
    assert.ok(text.includes('read-only RPC'));
    assert.ok(text.includes('advisory only'));
    assert.ok(text.includes('NOT auto-updated'));
  });
});

// ── verifySourceSafety ────────────────────────────────────────────────

describe('verifySourceSafety', () => {
  it('returns true', () => {
    assert.equal(verifySourceSafety(), true);
  });
});

// ── Source safety scan ────────────────────────────────────────────────

describe('source safety scan', () => {
  it('module source contains no wallet/signing/broadcast patterns', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const sourcePath = resolve(__dirname, '../services/api/src/testnet-token-discovery.js');
    const source = readFileSync(sourcePath, 'utf-8');

    // Strip comments and strings to avoid false positives on boundary declarations
    const stripped = source
      .replace(/\/\*\*[\s\S]*?\*\//g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '')
      .replace(/'[^']*'/g, '""')
      .replace(/"[^']*"/g, '""')
      .replace(/`[^`]*`/g, '""');

    const prohibitedPatterns = [
      /\beth_sendTransaction\b/,
      /\beth_sign\b/,
      /\bpersonal_sign\b/,
      /\bbroadcast\b/,
      /\bgetSigner\b/,
      /\bgetWallet\b/,
      /\bprivateKey\b/,
      /\bsignTransaction\b/,
      /\bsendTransaction\b/,
    ];

    for (const pattern of prohibitedPatterns) {
      const match = stripped.match(pattern);
      assert.equal(
        match,
        null,
        `Source contains prohibited pattern: ${pattern}`
      );
    }

    // Allowed RPC methods only
    const allowedMethods = ['eth_getCode', 'eth_call', 'eth_chainId', 'eth_blockNumber'];
    const rpcMethods = source.match(/'(eth_\w+|net_\w+)'/g) || [];
    for (const method of rpcMethods) {
      const methodName = method.replace(/'/g, '');
      assert.ok(
        allowedMethods.includes(methodName) || methodName.startsWith('eth_get') || methodName.startsWith('eth_call'),
        `Source uses disallowed RPC method: ${methodName}`
      );
    }
  });
});

// ── Live RPC integration (resilient) ──────────────────────────────────

describe('live RPC token discovery integration', () => {
  it('runTokenDiscovery returns structured result with RPC configured', async () => {
    const result = await runTokenDiscovery();
    assert.ok(result.rpcConfigured !== undefined);
    assert.ok(result.wquai);
    assert.ok(result.wqi);
    assert.ok(result.overallStatus);
    assert.ok(result.overallEmoji);
    assert.ok(result.safety);

    // Both token results have expected shape
    for (const token of ['wquai', 'wqi']) {
      const t = result[token];
      assert.ok(t.tokenType !== undefined);
      assert.ok(t.candidatesProbed !== undefined);
      assert.ok(t.candidatesFound !== undefined);
      assert.ok(t.status !== undefined);
      assert.ok(t.statusEmoji !== undefined);
      assert.ok(t.safety);
    }
  });

  it('formatDiscoveryReport produces readable output from live run', async () => {
    const result = await runTokenDiscovery();
    const report = formatDiscoveryReport(result);
    assert.ok(typeof report === 'string');
    assert.ok(report.length > 0);
    assert.ok(report.includes('Discovery Report'));
    assert.ok(report.includes('Safety'));
    assert.ok(report.includes('WQUAI'));
    assert.ok(report.includes('WQI'));
  });

  it('live probe of zero address returns no-code result', async () => {
    const result = await probeAddress('0x0000000000000000000000000000000000000000');
    assert.equal(result.address, '0x0000000000000000000000000000000000000000');
    assert.equal(result.hasCode, false);
    assert.equal(result.isErc20, false);
    // Safety envelope
    assert.equal(result.safety.realQuaiTransactions, false);
    assert.equal(result.safety.noSigning, true);
    assert.equal(result.safety.noBroadcasting, true);
  });
});

// ── Readiness integration ────────────────────────────────────────────

describe('readiness integration', () => {
  it('discovery uses testnet-config RPC URL', async () => {
    const result = await runTokenDiscovery();
    if (result.rpcConfigured) {
      assert.equal(result.rpcUrl, TESTNET_CONFIG.rpcUrl);
    }
  });

  it('discovery uses testnet-config chainId', async () => {
    const result = await runTokenDiscovery();
    assert.equal(result.chainId, TESTNET_CONFIG.chainId);
  });

  it('discovery uses testnet-config networkName and zone', async () => {
    const result = await runTokenDiscovery();
    assert.equal(result.networkName, TESTNET_CONFIG.networkName);
    assert.equal(result.zone, TESTNET_CONFIG.zone);
  });
});
