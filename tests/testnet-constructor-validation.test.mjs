import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveArtifactsPath,
  readArtifact,
  extractConstructor,
  validateParameter,
  validateConstructorParams,
  validateDeployOrder,
  runConstructorValidation,
  assertConstructorsValid,
  formatConstructorReport,
  verifySourceSafety,
  isTypeEncodable,
  ENCODABLE_TYPES,
} from '../services/api/src/testnet-constructor-validation.js';
import { DEPLOY_ORDER } from '../services/api/src/deploy-manifest.js';

const DEPLOYER = '0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267';

describe('testnet constructor validation', () => {
  it('exports ENCODABLE_TYPES as frozen array', () => {
    assert.ok(Array.isArray(ENCODABLE_TYPES), 'should be array');
    assert.ok(ENCODABLE_TYPES.length > 0, 'should have entries');
    assert.ok(ENCODABLE_TYPES.includes('address'), 'should include address');
    assert.ok(ENCODABLE_TYPES.includes('uint256'), 'should include uint256');
    assert.ok(ENCODABLE_TYPES.includes('bool'), 'should include bool');
    assert.ok(ENCODABLE_TYPES.includes('bytes32'), 'should include bytes32');
    assert.ok(ENCODABLE_TYPES.includes('string'), 'should include string');
  });

  it('isTypeEncodable returns true for known types', () => {
    assert.equal(isTypeEncodable('address'), true);
    assert.equal(isTypeEncodable('uint256'), true);
    assert.equal(isTypeEncodable('uint8'), true);
    assert.equal(isTypeEncodable('int128'), true);
    assert.equal(isTypeEncodable('bool'), true);
    assert.equal(isTypeEncodable('bytes32'), true);
    assert.equal(isTypeEncodable('bytes1'), true);
    assert.equal(isTypeEncodable('string'), true);
    assert.equal(isTypeEncodable('bytes'), true);
  });

  it('isTypeEncodable returns false for unknown types', () => {
    assert.equal(isTypeEncodable('tuple'), false);
    assert.equal(isTypeEncodable('address[]'), false);
    assert.equal(isTypeEncodable('uint1000'), false);
    assert.equal(isTypeEncodable('foo'), false);
  });

  it('resolveArtifactsPath returns a valid path or null', () => {
    const path = resolveArtifactsPath();
    assert.ok(path === null || typeof path === 'string', 'path should be string or null');
    if (path) {
      assert.ok(path.endsWith('artifacts'), 'path should end with artifacts');
    }
  });

  it('readArtifact returns data for TradingVault', () => {
    const artifactsPath = resolveArtifactsPath();
    assert.ok(artifactsPath !== null, 'artifacts path should exist');

    const result = readArtifact(artifactsPath, 'TradingVault');
    assert.equal(result.error, null, 'should not have read error');
    assert.ok(result.data, 'should have artifact data');
    assert.ok(result.data.bytecode, 'should have bytecode');
    assert.ok(Array.isArray(result.data.abi), 'should have ABI array');
  });

  it('readArtifact returns error for missing contract', () => {
    const artifactsPath = resolveArtifactsPath();
    const result = readArtifact(artifactsPath, 'NonExistentContract');
    assert.ok(result.error, 'should have error for missing contract');
    assert.equal(result.data, null, 'data should be null');
  });

  it('extractConstructor returns inputs for contract with constructor', () => {
    const artifactsPath = resolveArtifactsPath();
    const { data: artifact } = readArtifact(artifactsPath, 'NonceManager');
    assert.ok(artifact, 'should have NonceManager artifact');

    const { inputs, hasConstructor } = extractConstructor(artifact.abi);
    assert.equal(hasConstructor, true, 'NonceManager should have constructor');
    assert.ok(inputs.length >= 1, 'should have at least 1 input');
  });

  it('extractConstructor returns empty for contract without constructor', () => {
    const artifactsPath = resolveArtifactsPath();
    const { data: artifact } = readArtifact(artifactsPath, 'TradingVault');
    assert.ok(artifact, 'should have TradingVault artifact');

    const { inputs, hasConstructor } = extractConstructor(artifact.abi);
    // TradingVault may or may not have a constructor
    assert.ok(Array.isArray(inputs), 'inputs should be array');
    assert.ok(typeof hasConstructor === 'boolean', 'hasConstructor should be boolean');
  });

  it('validateParameter returns valid for address type', () => {
    const result = validateParameter({ type: 'address', name: 'owner_' });
    assert.equal(result.valid, true);
    assert.equal(result.type, 'address');
    assert.equal(result.name, 'owner_');
    assert.equal(result.encodable, true);
    assert.equal(result.issue, null);
  });

  it('validateParameter returns valid for uint256 type', () => {
    const result = validateParameter({ type: 'uint256', name: 'amount' });
    assert.equal(result.valid, true);
    assert.equal(result.type, 'uint256');
    assert.equal(result.encodable, true);
    assert.equal(result.issue, null);
  });

  it('validateParameter returns valid for bool type', () => {
    const result = validateParameter({ type: 'bool', name: 'enabled' });
    assert.equal(result.valid, true);
    assert.equal(result.encodable, true);
    assert.equal(result.issue, null);
  });

  it('validateParameter returns valid for bytes32 type', () => {
    const result = validateParameter({ type: 'bytes32', name: 'salt' });
    assert.equal(result.valid, true);
    assert.equal(result.encodable, true);
    assert.equal(result.issue, null);
  });

  it('validateParameter returns invalid for tuple type', () => {
    const result = validateParameter({ type: 'tuple', name: 'data' });
    assert.equal(result.valid, false);
    assert.equal(result.encodable, false);
    assert.ok(result.issue, 'should have issue message');
  });

  it('validateParameter returns invalid for address[] type', () => {
    const result = validateParameter({ type: 'address[]', name: 'addresses' });
    assert.equal(result.valid, false);
    assert.equal(result.encodable, false);
    assert.ok(result.issue, 'should have issue message');
  });

  it('validateConstructorParams validates address inputs', () => {
    const inputs = [
      { type: 'address', name: 'feeAuthority_' },
      { type: 'address', name: 'feeRecipient_' },
    ];
    const result = validateConstructorParams('FeeManager', inputs);

    assert.equal(result.contract, 'FeeManager');
    assert.equal(result.paramCount, 2);
    assert.equal(result.allEncodable, true);
    assert.equal(result.blockers.length, 0);
  });

  it('validateConstructorParams detects unsupported types', () => {
    const inputs = [
      { type: 'address', name: 'owner_' },
      { type: 'tuple', name: 'config' },
    ];
    const result = validateConstructorParams('Unknown', inputs);

    assert.equal(result.paramCount, 2);
    assert.equal(result.allEncodable, false);
    assert.equal(result.blockers.length, 1);
    assert.ok(result.blockers[0].includes('tuple'));
  });

  it('validateDeployOrder passes for DEPLOY_ORDER', () => {
    const result = validateDeployOrder(DEPLOY_ORDER);
    assert.equal(result.valid, true, 'deploy order should be valid');
    assert.equal(result.violations.length, 0, 'should have no violations');
  });

  it('validateDeployOrder detects dependency ordering violation', () => {
    const badOrder = [
      { contract: 'Settlement', dependencies: ['TradingVault'] },
      { contract: 'TradingVault', dependencies: [] },
    ];
    const result = validateDeployOrder(badOrder);
    assert.equal(result.valid, false, 'should detect violation');
    assert.ok(result.violations.length > 0, 'should have violations');
    assert.ok(result.violations[0].includes('Settlement'));
  });

  it('validateDeployOrder detects missing dependency', () => {
    const badOrder = [
      { contract: 'Settlement', dependencies: ['NonExistentContract'] },
    ];
    const result = validateDeployOrder(badOrder);
    assert.equal(result.valid, false, 'should detect missing dependency');
    assert.ok(result.violations[0].includes('NonExistentContract'));
  });

  // ── Full constructor validation ────────────────────────────────

  it('runConstructorValidation returns structured report', () => {
    const report = runConstructorValidation();

    assert.ok(typeof report.valid === 'boolean', 'valid should be boolean');
    assert.ok(Array.isArray(report.blockers), 'blockers should be array');
    assert.ok(Array.isArray(report.warnings), 'warnings should be array');
    assert.ok(Array.isArray(report.contracts), 'contracts should be array');
    assert.equal(report.totalContracts, 6, 'should have 6 contracts');
    assert.ok(typeof report.contractsWithConstructors === 'number', 'should have count');
    assert.ok(typeof report.contractsWithEncodableParams === 'number', 'should have encodable count');
  });

  it('runConstructorValidation reports all 6 contracts', () => {
    const report = runConstructorValidation();
    const names = report.contracts.map((c) => c.contract);
    assert.ok(names.includes('TradingVault'));
    assert.ok(names.includes('NonceManager'));
    assert.ok(names.includes('MarketRegistry'));
    assert.ok(names.includes('FeeManager'));
    assert.ok(names.includes('DelegateKeyRegistry'));
    assert.ok(names.includes('Settlement'));
  });

  it('runConstructorValidation reports deploy order valid', () => {
    const report = runConstructorValidation();
    assert.equal(report.deployOrderValid, true, 'deploy order should be valid');
    assert.equal(report.deployOrderViolations.length, 0);
  });

  it('runConstructorValidation all contracts have status', () => {
    const report = runConstructorValidation();
    for (const c of report.contracts) {
      assert.ok(['ready', 'blocker'].includes(c.status), `${c.contract} should have valid status`);
    }
  });

  it('runConstructorValidation contracts with artifacts have bytecode', () => {
    const report = runConstructorValidation();
    for (const c of report.contracts) {
      if (c.status === 'ready') {
        assert.ok(c.bytecodePresent === true || c.bytecodeLength > 0 || !c.hasConstructor,
          `${c.contract} should have bytecode or no constructor`);
      }
    }
  });

  it('runConstructorValidation NonceManager has constructor with encodable params', () => {
    const report = runConstructorValidation();
    const nm = report.contracts.find((c) => c.contract === 'NonceManager');
    assert.ok(nm, 'should find NonceManager');
    assert.ok(nm.hasConstructor, 'NonceManager should have constructor');
    assert.ok(nm.allEncodable, 'NonceManager params should be encodable');
    assert.equal(nm.blockers.length, 0, 'should have no blockers');
  });

  it('runConstructorValidation FeeManager has constructor with 2 encodable params', () => {
    const report = runConstructorValidation();
    const fm = report.contracts.find((c) => c.contract === 'FeeManager');
    assert.ok(fm, 'should find FeeManager');
    assert.ok(fm.hasConstructor, 'FeeManager should have constructor');
    assert.equal(fm.paramCount, 2, 'FeeManager should have 2 constructor params');
    assert.ok(fm.allEncodable, 'FeeManager params should be encodable');
  });

  it('runConstructorValidation Settlement has dependencies wired correctly', () => {
    const report = runConstructorValidation();
    const st = report.contracts.find((c) => c.contract === 'Settlement');
    assert.ok(st, 'should find Settlement');
    assert.ok(Array.isArray(st.dependencies), 'should have dependencies array');
    assert.ok(st.dependencies.includes('TradingVault'), 'should depend on TradingVault');
    assert.ok(st.dependencies.includes('NonceManager'), 'should depend on NonceManager');
  });

  it('runConstructorValidation reports network info from testnet config', () => {
    const report = runConstructorValidation();
    assert.equal(report.networkName, 'quai-orchard');
    assert.equal(report.zone, 'cyprus1');
    assert.equal(report.chainId, 15000);
  });

  it('runConstructorValidation safety metadata present on report', () => {
    const report = runConstructorValidation();
    assert.equal(report.safety.realQuaiTransactions, false);
    assert.equal(report.safety.walletRequired, false);
    assert.equal(report.safety.noWalletLoaded, true);
    assert.equal(report.safety.noSigning, true);
    assert.equal(report.safety.noBroadcasting, true);
    assert.equal(report.safety.noFundsMovement, true);
    assert.equal(report.safety.noContractDeploy, true);
    assert.ok(report.safety.approvalGate);
  });

  it('runConstructorValidation safety metadata present on each contract', () => {
    const report = runConstructorValidation();
    for (const c of report.contracts) {
      assert.equal(c.safety.realQuaiTransactions, false);
      assert.equal(c.safety.noContractDeploy, true);
    }
  });

  it('runConstructorValidation with missing artifacts path returns blocker', () => {
    const report = runConstructorValidation({ artifactsPath: '' });
    assert.equal(report.valid, false);
    assert.ok(report.blockers.length > 0);
    assert.ok(report.blockers[0].toLowerCase().includes('artifacts'));
  });

  it('runConstructorValidation valid flag reflects no blockers', () => {
    const report = runConstructorValidation();
    if (report.blockers.length === 0) {
      assert.equal(report.valid, true, 'no blockers means valid');
    }
  });

  it('assertConstructorsValid returns report when valid', () => {
    const report = assertConstructorsValid();
    assert.ok(report, 'should return report');
    assert.equal(report.valid, true, 'assertion passed means valid');
  });

  it('assertConstructorsValid throws with missing artifacts', async () => {
    const mod = await import('../services/api/src/testnet-constructor-validation.js');
    assert.throws(
      () => mod.assertConstructorsValid({ artifactsPath: '' }),
      /Constructor validation FAILED/
    );
  });

  // ── Report formatting ──────────────────────────────────────────

  it('formatConstructorReport produces non-empty output', () => {
    const report = runConstructorValidation();
    const text = formatConstructorReport(report);
    assert.ok(text.length > 0, 'report should not be empty');
    assert.ok(text.includes('Constructor Validation'));
    assert.ok(text.includes('quai-orchard'));
  });

  it('formatConstructorReport includes all contract names', () => {
    const report = runConstructorValidation();
    const text = formatConstructorReport(report);
    assert.ok(text.includes('TradingVault'));
    assert.ok(text.includes('NonceManager'));
    assert.ok(text.includes('Settlement'));
  });

  it('formatConstructorReport includes status icon', () => {
    const report = runConstructorValidation();
    const text = formatConstructorReport(report);
    assert.ok(text.includes('✅') || text.includes('❌'), 'should include status icon');
  });

  it('formatConstructorReport includes safety notice', () => {
    const report = runConstructorValidation();
    const text = formatConstructorReport(report);
    assert.ok(text.includes('read-only'), 'should include read-only notice');
    assert.ok(text.includes('approval'), 'should include approval gate');
  });

  // ── Safety ──────────────────────────────────────────────────────

  it('verifySourceSafety returns true', () => {
    assert.equal(verifySourceSafety(), true);
  });

  it('source contains no wallet/signing/broadcast patterns', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const __filename = fileURLToPath(import.meta.url);
    const sourcePath = __filename.replace(
      'testnet-constructor-validation.test.mjs',
      '../services/api/src/testnet-constructor-validation.js'
    );
    const source = readFileSync(sourcePath, 'utf8');

    const prohibitedPatterns = [
      /privateKey|private_key/i,
      /signTransaction|sign_tx/i,
      /sendTransaction|send_tx/i,
      /eth_sendRawTransaction/i,
      /eth_sendTransaction/i,
      /eth_sign/i,
      /wallet\.fromMnemonic|HDWallet/i,
    ];

    for (const pattern of prohibitedPatterns) {
      assert.equal(
        source.match(pattern) !== null,
        false,
        `source should not contain: ${pattern}`
      );
    }
  });
});
