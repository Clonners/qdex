import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyContractArtifacts,
  assertArtifactsReady,
  resolveArtifactsPath,
  readArtifact,
  validateArtifactStructure,
  estimateDeploymentGas,
  extractConstructorInfo,
  countAbiInterfaces,
  DEPLOYABLE_CONTRACTS,
  GAS_PER_BYTE_DEPOSIT,
  GAS_PER_ZERO_BYTE,
  GAS_TX_BASE_COST,
  GAS_CONTRACT_CREATION_OVERHEAD,
  GAS_CONSTRUCTOR_AVERAGE,
} from '../services/api/src/contract-artifact-verification.js';

describe('contract artifact verification module', () => {
  it('exports all expected symbols', () => {
    assert.strictEqual(typeof verifyContractArtifacts, 'function');
    assert.strictEqual(typeof assertArtifactsReady, 'function');
    assert.strictEqual(typeof resolveArtifactsPath, 'function');
    assert.strictEqual(typeof readArtifact, 'function');
    assert.strictEqual(typeof validateArtifactStructure, 'function');
    assert.strictEqual(typeof estimateDeploymentGas, 'function');
    assert.strictEqual(typeof extractConstructorInfo, 'function');
    assert.strictEqual(typeof countAbiInterfaces, 'function');
    assert.strictEqual(Array.isArray(DEPLOYABLE_CONTRACTS), true);
    assert.strictEqual(typeof GAS_PER_BYTE_DEPOSIT, 'number');
  });

  it('DEPLOYABLE_CONTRACTS has 6 contracts in canonical deploy order', () => {
    assert.deepStrictEqual(DEPLOYABLE_CONTRACTS, [
      'TradingVault',
      'NonceManager',
      'MarketRegistry',
      'FeeManager',
      'DelegateKeyRegistry',
      'Settlement',
    ]);
  });

  it('gas cost constants are reasonable', () => {
    assert.strictEqual(GAS_PER_BYTE_DEPOSIT, 16);
    assert.strictEqual(GAS_PER_ZERO_BYTE, 4);
    assert.strictEqual(GAS_TX_BASE_COST, 21000);
    assert.ok(GAS_CONTRACT_CREATION_OVERHEAD > 0);
    assert.ok(GAS_CONSTRUCTOR_AVERAGE > 0);
  });

  describe('resolveArtifactsPath', () => {
    it('returns a path string or null', () => {
      const path = resolveArtifactsPath();
      assert.ok(path === null || typeof path === 'string');
    });
  });

  describe('readArtifact', () => {
    it('returns error when artifacts path does not exist', () => {
      const result = readArtifact('/nonexistent/path', 'TradingVault');
      assert.strictEqual(result.data, null);
      assert.strictEqual(result.path, null);
      assert.ok(result.error !== null);
    });

    it('returns error for missing contract artifact', () => {
      const path = resolveArtifactsPath();
      if (path) {
        const result = readArtifact(path, 'NonExistentContract');
        assert.strictEqual(result.data, null);
        assert.ok(result.error !== null);
      }
    });

    it('reads TradingVault artifact successfully', () => {
      const path = resolveArtifactsPath();
      if (path) {
        const result = readArtifact(path, 'TradingVault');
        assert.strictEqual(result.error, null);
        assert.ok(result.data !== null);
        assert.ok(result.path !== null);
        assert.ok(Array.isArray(result.data.abi));
        assert.ok(typeof result.data.bytecode === 'string');
      }
    });
  });

  describe('validateArtifactStructure', () => {
    it('rejects artifact with no ABI', () => {
      const result = validateArtifactStructure({ bytecode: '0x1234' });
      assert.strictEqual(result.valid, false);
      assert.ok(result.blockers.some((b) => b.includes('ABI')));
    });

    it('rejects artifact with empty ABI', () => {
      const result = validateArtifactStructure({ abi: [], bytecode: '0x1234' });
      assert.strictEqual(result.valid, false);
      assert.ok(result.blockers.some((b) => b.includes('empty')));
    });

    it('rejects artifact with no bytecode', () => {
      const result = validateArtifactStructure({ abi: [{ type: 'function', name: 'test' }] });
      assert.strictEqual(result.valid, false);
      assert.ok(result.blockers.some((b) => b.includes('bytecode')));
    });

    it('rejects artifact with empty bytecode', () => {
      const result = validateArtifactStructure({ abi: [{ type: 'function', name: 'test' }], bytecode: '0x' });
      assert.strictEqual(result.valid, false);
      assert.ok(result.blockers.some((b) => b.includes('empty')));
    });

    it('rejects artifact with non-hex bytecode prefix', () => {
      const result = validateArtifactStructure({ abi: [{ type: 'function', name: 'test' }], bytecode: 'not-hex' });
      assert.strictEqual(result.valid, false);
      assert.ok(result.blockers.some((b) => b.includes('0x')));
    });

    it('accepts valid artifact with ABI and bytecode', () => {
      const result = validateArtifactStructure({
        abi: [{ type: 'function', name: 'deposit', stateMutability: 'nonpayable' }],
        bytecode: '0x6080604052',
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.blockers.length, 0);
    });

    it('accepts artifact with only constructor (warns)', () => {
      const result = validateArtifactStructure({
        abi: [{ type: 'constructor', stateMutability: 'nonpayable' }],
        bytecode: '0x6080604052',
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.warnings.length, 1);
      assert.ok(result.warnings[0].includes('constructor'));
    });

    it('ABI is not array is rejected', () => {
      const result = validateArtifactStructure({ abi: 'not-array', bytecode: '0x1234' });
      assert.strictEqual(result.valid, false);
    });
  });

  describe('estimateDeploymentGas', () => {
    it('returns 0 for empty bytecode', () => {
      assert.strictEqual(estimateDeploymentGas(''), 0);
      assert.strictEqual(estimateDeploymentGas('0x'), 0);
      assert.strictEqual(estimateDeploymentGas(null), 0);
      assert.strictEqual(estimateDeploymentGas(undefined), 0);
    });

    it('estimates gas for minimal bytecode', () => {
      // 2 bytes = 4 hex chars
      const estimate = estimateDeploymentGas('0x6080');
      const expectedMin = GAS_TX_BASE_COST + GAS_CONTRACT_CREATION_OVERHEAD + GAS_CONSTRUCTOR_AVERAGE;
      assert.ok(estimate >= expectedMin);
      assert.ok(estimate < expectedMin + 100);
    });

    it('zero bytes cost less than non-zero bytes', () => {
      // 2 bytes, both zero
      const zeroEstimate = estimateDeploymentGas('0x0000');
      // 2 bytes, both non-zero
      const nonZeroEstimate = estimateDeploymentGas('0x6080');
      assert.ok(zeroEstimate < nonZeroEstimate);
    });

    it('larger bytecode costs more gas', () => {
      const small = estimateDeploymentGas('0x' + '60'.repeat(10));
      const large = estimateDeploymentGas('0x' + '60'.repeat(100));
      assert.ok(large > small);
    });

    it('gas estimate is positive for non-empty bytecode', () => {
      const estimate = estimateDeploymentGas('0x' + 'ab'.repeat(50));
      assert.ok(estimate > 0);
      assert.ok(typeof estimate === 'number');
    });
  });

  describe('extractConstructorInfo', () => {
    it('returns false when no ABI', () => {
      const result = extractConstructorInfo({});
      assert.strictEqual(result.hasConstructor, false);
      assert.strictEqual(result.inputCount, 0);
      assert.strictEqual(result.inputTypes.length, 0);
    });

    it('returns false when ABI has no constructor', () => {
      const result = extractConstructorInfo({
        abi: [{ type: 'function', name: 'deposit' }],
      });
      assert.strictEqual(result.hasConstructor, false);
    });

    it('detects constructor with no inputs', () => {
      const result = extractConstructorInfo({
        abi: [{ type: 'constructor', stateMutability: 'nonpayable' }],
      });
      assert.strictEqual(result.hasConstructor, true);
      assert.strictEqual(result.inputCount, 0);
    });

    it('detects constructor with inputs', () => {
      const result = extractConstructorInfo({
        abi: [
          {
            type: 'constructor',
            inputs: [
              { name: '_vault', type: 'address' },
              { name: '_nonceManager', type: 'address' },
            ],
          },
        ],
      });
      assert.strictEqual(result.hasConstructor, true);
      assert.strictEqual(result.inputCount, 2);
      assert.deepStrictEqual(result.inputTypes, ['address', 'address']);
    });
  });

  describe('countAbiInterfaces', () => {
    it('returns zeros for no ABI', () => {
      const result = countAbiInterfaces({});
      assert.strictEqual(result.functions, 0);
      assert.strictEqual(result.events, 0);
    });

    it('counts functions and events separately', () => {
      const result = countAbiInterfaces({
        abi: [
          { type: 'function', name: 'deposit' },
          { type: 'function', name: 'withdraw' },
          { type: 'event', name: 'Deposited' },
          { type: 'event', name: 'Withdrawn' },
          { type: 'constructor' },
          { type: 'fallback' },
        ],
      });
      assert.strictEqual(result.functions, 2);
      assert.strictEqual(result.events, 2);
      assert.deepStrictEqual(result.publicFunctions, ['deposit', 'withdraw']);
      assert.deepStrictEqual(result.eventsList, ['Deposited', 'Withdrawn']);
    });

    it('skips anonymous functions/events without names', () => {
      const result = countAbiInterfaces({
        abi: [
          { type: 'function' },
          { type: 'event' },
          { type: 'function', name: 'named' },
        ],
      });
      assert.strictEqual(result.functions, 1);
      assert.strictEqual(result.events, 0);
    });
  });

  describe('verifyContractArtifacts — full verification', () => {
    it('returns structured report with expected shape', () => {
      const report = verifyContractArtifacts();
      assert.strictEqual(typeof report.ready, 'boolean');
      assert.strictEqual(typeof report.artifactsPath, 'string') || report.artifactsPath === null;
      assert.ok(typeof report.contracts === 'object');
      assert.strictEqual(typeof report.contractsPresent, 'number');
      assert.strictEqual(typeof report.contractsValid, 'number');
      assert.strictEqual(typeof report.contractsInvalid, 'number');
      assert.strictEqual(typeof report.totalEstimatedGas, 'number');
      assert.strictEqual(typeof report.totalEstimatedGasFormatted, 'string');
      assert.ok(Array.isArray(report.blockers));
      assert.ok(Array.isArray(report.warnings));
    });

    it('reports 6 deployable contracts', () => {
      const report = verifyContractArtifacts();
      assert.strictEqual(report.contractsPresent, 6);
    });

    it('all 6 contracts have valid artifacts (when artifacts exist)', () => {
      const report = verifyContractArtifacts();
      if (report.artifactsPath) {
        assert.strictEqual(report.contractsValid, 6, `Expected 6 valid, got ${report.contractsValid}: ${report.blockers.join('; ')}`);
        assert.strictEqual(report.ready, true);
        assert.strictEqual(report.blockers.length, 0);
      }
    });

    it('total estimated gas is positive', () => {
      const report = verifyContractArtifacts();
      if (report.artifactsPath && report.ready) {
        assert.ok(report.totalEstimatedGas > 0);
        // Settlement is the largest contract (~49K bytecode chars = ~24K bytes)
        // All contracts together should estimate > 2M gas
        assert.ok(report.totalEstimatedGas > 1_000_000, `Total gas estimate too low: ${report.totalEstimatedGas}`);
      }
    });

    it('per-contract results include gas estimate and constructor info', () => {
      const report = verifyContractArtifacts();
      if (report.artifactsPath && report.ready) {
        for (const contractName of DEPLOYABLE_CONTRACTS) {
          const contract = report.contracts[contractName];
          assert.ok(contract, `Missing result for ${contractName}`);
          assert.strictEqual(typeof contract.gasEstimate, 'number');
          assert.ok(contract.gasEstimate > 0, `${contractName} gas estimate should be positive`);
          assert.ok(typeof contract.constructor === 'object');
          assert.ok(typeof contract.interfaces === 'object');
          assert.ok(contract.bytecodeBytes > 0);
        }
      }
    });

    it('safety metadata is always present', () => {
      const report = verifyContractArtifacts();
      assert.strictEqual(report.realQuaiTransactions, false);
      assert.strictEqual(report.walletRequired, false);
      assert.strictEqual(report.noWalletLoaded, true);
      assert.strictEqual(report.noRpcCallMade, true);
      assert.strictEqual(report.noSigning, true);
      assert.strictEqual(report.noBroadcasting, true);
      assert.strictEqual(report.noFundsMovement, true);
      assert.strictEqual(report.noContractDeploy, true);
      assert.strictEqual(report.approvalGate, 'explicit-approval-required-before-deploy');
    });

    it('reports ready=false when artifacts path missing', () => {
      const report = verifyContractArtifacts({ artifactsPath: '/nonexistent' });
      assert.strictEqual(report.ready, false);
      assert.strictEqual(report.contractsInvalid, 6);
      assert.ok(report.blockers.length > 0);
    });

    it('formatted gas string shows million-scale', () => {
      const report = verifyContractArtifacts();
      if (report.artifactsPath && report.ready) {
        assert.ok(report.totalEstimatedGasFormatted.includes('M'));
        assert.ok(report.totalEstimatedGasFormatted.includes('.'));
      }
    });
  });

  describe('assertArtifactsReady', () => {
    it('returns report when all artifacts valid', () => {
      const report = assertArtifactsReady();
      assert.strictEqual(report.ready, true);
    });

    it('throws when artifacts path does not exist', () => {
      assert.throws(
        () => assertArtifactsReady({ artifactsPath: '/nonexistent' }),
        /Contract artifact verification FAILED/
      );
    });

    it('error message includes blocker count', () => {
      try {
        assertArtifactsReady({ artifactsPath: '/nonexistent' });
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('/6'));
        assert.ok(err.message.includes('invalid'));
      }
    });
  });

  describe('source safety scan', () => {
    it('module source contains no wallet/signing/writing methods', async () => {
      const fsMod = await import('node:fs');
      const pathMod = await import('node:path');
      const urlMod = await import('node:url');
      const _filename = urlMod.fileURLToPath(import.meta.url);
      const _dirname = _filename.replace(/\/[^/]+$/, '');

      const sourcePath = pathMod.resolve(_dirname, '../services/api/src/contract-artifact-verification.js');
      const source = fsMod.readFileSync(sourcePath, 'utf8');

      const forbiddenPatterns = [
        'signTransaction',
        'sendTransaction',
        'eth_sendRawTransaction',
        'eth_sign',
        'personal_sign',
        'privateKey',
        'private_key',
        'mnemonic',
        'keystore',
        'wallet.load',
        'deployContract',
        'getBalance',
        'eth_getBalance',
        'fetch(',
        'provider.',
        'signer.',
      ];

      for (const pattern of forbiddenPatterns) {
        assert.ok(
          !source.includes(pattern),
          `Source should not contain "${pattern}" — found in contract-artifact-verification.js`
        );
      }
    });
  });
});
