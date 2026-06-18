import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveArtifactsPath,
  readArtifact,
  encodeConstructorData,
  estimateDeploymentGas,
  resolveConstructorParams,
  runDeploymentSimulation,
  verifySourceSafety,
  GAS_PER_BYTE_DEPOSIT,
  GAS_PER_ZERO_BYTE,
  GAS_TX_BASE_COST,
  GAS_CONTRACT_CREATION_EXTRA,
  GAS_CONSTRUCTOR_AVG,
} from '../services/api/src/testnet-deploy-simulation.js';

const DEPLOYER = '0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267';

describe('testnet deploy simulation', () => {
  it('exports gas cost constants', () => {
    assert.equal(GAS_PER_BYTE_DEPOSIT, 16);
    assert.equal(GAS_PER_ZERO_BYTE, 4);
    assert.equal(GAS_TX_BASE_COST, 21000);
    assert.equal(GAS_CONTRACT_CREATION_EXTRA, 32000);
    assert.equal(GAS_CONSTRUCTOR_AVG, 50000);
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
    assert.ok(result.data.abi, 'should have ABI');
    assert.ok(Array.isArray(result.data.abi), 'ABI should be array');
  });

  it('readArtifact returns error for missing contract', () => {
    const artifactsPath = resolveArtifactsPath();
    const result = readArtifact(artifactsPath, 'NonExistentContract');
    assert.ok(result.error, 'should have error for missing contract');
    assert.equal(result.data, null, 'data should be null');
  });

  it('encodeConstructorData rejects empty bytecode', () => {
    const result = encodeConstructorData('', [], []);
    assert.equal(result.calldata, null);
    assert.ok(result.error);
  });

  it('encodeConstructorData rejects non-hex bytecode', () => {
    const result = encodeConstructorData('not-hex', [], []);
    assert.equal(result.calldata, null);
    assert.ok(result.error);
  });

  it('encodeConstructorData with no constructor args returns bytecode unchanged', () => {
    const bytecode = '0xabcdef1234';
    const result = encodeConstructorData(bytecode, [], []);
    assert.equal(result.error, null);
    assert.equal(result.calldata, bytecode, 'calldata should equal bytecode when no args');
  });

  it('encodeConstructorData encodes single address parameter', () => {
    const bytecode = '0x00';
    const inputs = [{ type: 'address', name: 'owner_' }];
    const values = [DEPLOYER];
    const result = encodeConstructorData(bytecode, inputs, values);

    assert.equal(result.error, null, `should encode: ${result.error}`);
    assert.ok(result.calldata, 'should have calldata');
    assert.ok(result.calldata.startsWith('0x00'), 'calldata should start with bytecode');
    // Address encoded as 32 bytes (64 hex chars), left-padded
    const encodedAddr = '0x' + '00'.repeat(12) + DEPLOYER.slice(2);
    assert.ok(result.calldata.includes(encodedAddr.slice(2)), 'should include encoded address');
  });

  it('encodeConstructorData encodes two address parameters', () => {
    const bytecode = '0x00';
    const inputs = [
      { type: 'address', name: 'feeAuthority_' },
      { type: 'address', name: 'feeRecipient_' },
    ];
    const values = [DEPLOYER, DEPLOYER];
    const result = encodeConstructorData(bytecode, inputs, values);

    assert.equal(result.error, null, `should encode: ${result.error}`);
    assert.ok(result.calldata, 'should have calldata');
    // "0x" prefix (2) + bytecode content (2) + 2 x 32-byte encoded addresses (128) = 132
    assert.equal(result.calldata.length, 2 + 2 + 128, 'calldata length should match bytecode + 2 args');
  });

  it('encodeConstructorData rejects parameter count mismatch', () => {
    const bytecode = '0x00';
    const inputs = [{ type: 'address', name: 'owner_' }];
    const result = encodeConstructorData(bytecode, inputs, []);
    assert.equal(result.calldata, null);
    assert.ok(result.error, 'should reject mismatch');
  });

  it('estimateDeploymentGas returns positive value for valid bytecode', () => {
    const gas = estimateDeploymentGas('0x' + '01'.repeat(100));
    assert.ok(gas > 0, 'gas should be positive');
    assert.ok(gas > GAS_TX_BASE_COST, 'gas should exceed tx base cost');
  });

  it('estimateDeploymentGas accounts for zero bytes being cheaper', () => {
    const gasNonZero = estimateDeploymentGas('0x' + '01'.repeat(100));
    const gasZero = estimateDeploymentGas('0x' + '00'.repeat(100));
    assert.ok(gasZero < gasNonZero, 'zero bytes should cost less gas');
  });

  it('estimateDeploymentGas handles empty bytecode', () => {
    const gas = estimateDeploymentGas('');
    // Base costs: tx base + creation extra + constructor avg
    const expected = GAS_TX_BASE_COST + GAS_CONTRACT_CREATION_EXTRA + GAS_CONSTRUCTOR_AVG;
    assert.equal(gas, expected, 'empty bytecode should return base costs only');
  });

  it('estimateDeploymentGas with custom constructor estimate', () => {
    const baseGas = estimateDeploymentGas('0x' + '01'.repeat(100));
    const lowGas = estimateDeploymentGas('0x' + '01'.repeat(100), 10000);
    assert.ok(lowGas < baseGas, 'lower constructor estimate should yield lower gas');
  });

  it('resolveConstructorParams resolves TradingVault (no inputs)', () => {
    const result = resolveConstructorParams('TradingVault', [], DEPLOYER);
    assert.equal(result.error, null);
    assert.deepEqual(result.params, []);
  });

  it('resolveConstructorParams resolves NonceManager (authority = deployer)', () => {
    const inputs = [{ type: 'address', name: 'settlementAuthority_' }];
    const result = resolveConstructorParams('NonceManager', inputs, DEPLOYER);
    assert.equal(result.error, null);
    assert.equal(result.params.length, 1);
    assert.equal(result.params[0].toLowerCase(), DEPLOYER.toLowerCase());
  });

  it('resolveConstructorParams resolves MarketRegistry (authority = deployer)', () => {
    const inputs = [{ type: 'address', name: 'marketAuthority_' }];
    const result = resolveConstructorParams('MarketRegistry', inputs, DEPLOYER);
    assert.equal(result.error, null);
    assert.equal(result.params.length, 1);
    assert.equal(result.params[0].toLowerCase(), DEPLOYER.toLowerCase());
  });

  it('resolveConstructorParams resolves FeeManager (authority + recipient = deployer)', () => {
    const inputs = [
      { type: 'address', name: 'feeAuthority_' },
      { type: 'address', name: 'feeRecipient_' },
    ];
    const result = resolveConstructorParams('FeeManager', inputs, DEPLOYER);
    assert.equal(result.error, null);
    assert.equal(result.params.length, 2);
    assert.equal(result.params[0].toLowerCase(), DEPLOYER.toLowerCase());
    assert.equal(result.params[1].toLowerCase(), DEPLOYER.toLowerCase());
  });

  it('resolveConstructorParams rejects unsupported type', () => {
    const inputs = [{ type: 'uint256', name: 'amount' }];
    const result = resolveConstructorParams('Unknown', inputs, DEPLOYER);
    assert.ok(result.error, 'should reject unsupported type');
    assert.ok(result.error.includes('uint256'));
  });

  it('runDeploymentSimulation returns structured report', () => {
    const report = runDeploymentSimulation();

    assert.ok(typeof report.ready === 'boolean', 'ready should be boolean');
    assert.ok(Array.isArray(report.blockers), 'blockers should be array');
    assert.ok(Array.isArray(report.warnings), 'warnings should be array');
    assert.ok(Array.isArray(report.contracts), 'contracts should be array');
    assert.ok(typeof report.totalEstimatedGas === 'number', 'totalEstimatedGas should be number');
    assert.equal(report.contractCount, 6, 'should have 6 deployable contracts');
    assert.ok(typeof report.readyCount === 'number', 'readyCount should be number');
    assert.ok(typeof report.blockerCount === 'number', 'blockerCount should be number');
  });

  it('runDeploymentSimulation reports network info from testnet config', () => {
    const report = runDeploymentSimulation();

    assert.equal(report.networkName, 'quai-orchard', 'network name should match config');
    assert.equal(report.zone, 'cyprus1', 'zone should match config');
    assert.equal(report.chainId, 15000, 'chainId should match config');
    assert.ok(report.rpcUrl, 'rpcUrl should be set');
  });

  it('runDeploymentSimulation reports all 6 contracts', () => {
    const report = runDeploymentSimulation();

    assert.equal(report.contracts.length, 6, 'should simulate 6 contracts');
    const names = report.contracts.map((c) => c.contract);
    assert.ok(names.includes('TradingVault'), 'should include TradingVault');
    assert.ok(names.includes('NonceManager'), 'should include NonceManager');
    assert.ok(names.includes('MarketRegistry'), 'should include MarketRegistry');
    assert.ok(names.includes('FeeManager'), 'should include FeeManager');
    assert.ok(names.includes('DelegateKeyRegistry'), 'should include DelegateKeyRegistry');
    assert.ok(names.includes('Settlement'), 'should include Settlement');
  });

  it('runDeploymentSimulation total gas is sum of per-contract estimates', () => {
    const report = runDeploymentSimulation();
    const sum = report.contracts.reduce((total, c) => total + c.estimatedGas, 0);
    assert.equal(report.totalEstimatedGas, sum, 'total should equal sum of per-contract gas');
  });

  it('runDeploymentSimulation each contract has safety metadata', () => {
    const report = runDeploymentSimulation();
    for (const c of report.contracts) {
      assert.equal(c.safety.realQuaiTransactions, false);
      assert.equal(c.safety.walletRequired, false);
      assert.equal(c.safety.noWalletLoaded, true);
      assert.equal(c.safety.noSigning, true);
      assert.equal(c.safety.noBroadcasting, true);
      assert.equal(c.safety.noFundsMovement, true);
      assert.equal(c.safety.noContractDeploy, true);
      assert.ok(c.safety.approvalGate);
    }
  });

  it('runDeploymentSimulation report has top-level safety metadata', () => {
    const report = runDeploymentSimulation();
    assert.equal(report.safety.realQuaiTransactions, false);
    assert.equal(report.safety.walletRequired, false);
    assert.equal(report.safety.noWalletLoaded, true);
    assert.equal(report.safety.noSigning, true);
    assert.equal(report.safety.noBroadcasting, true);
    assert.equal(report.safety.noFundsMovement, true);
    assert.equal(report.safety.noContractDeploy, true);
  });

  it('runDeploymentSimulation with missing artifacts path returns blocker', () => {
    // Empty string bypasses ?? resolution and triggers the artifacts guard
    const report = runDeploymentSimulation({ artifactsPath: '' });
    assert.equal(report.ready, false);
    assert.ok(report.blockers.length > 0, 'should have blockers');
    assert.ok(report.blockers[0].toLowerCase().includes('artifacts'), 'blocker should mention artifacts');
  });

  it('runDeploymentSimulation with null deployer returns blocker', () => {
    // Empty string triggers the deployer guard (|| short-circuit skips null/undefined)
    const report = runDeploymentSimulation({ deployerAddress: '' });
    assert.equal(report.ready, false);
    assert.ok(report.blockers.length > 0, 'should have blockers');
    assert.ok(report.blockers[0].toLowerCase().includes('deployer'), 'blocker should mention deployer');
  });

  it('runDeploymentSimulation ready contracts have status "ready"', () => {
    const report = runDeploymentSimulation();
    const readyContracts = report.contracts.filter((c) => c.status === 'ready');
    assert.ok(readyContracts.length > 0, 'should have at least some ready contracts');
    for (const c of readyContracts) {
      assert.equal(c.error, null, `ready contract ${c.contract} should have no error`);
      assert.ok(c.estimatedGas > 0, `ready contract ${c.contract} should have positive gas estimate`);
      assert.ok(c.deploymentCalldata !== null, `ready contract ${c.contract} should have calldata`);
      assert.ok(c.calldataLength > 0, `ready contract ${c.contract} calldata should have length`);
    }
  });

  it('verifySourceSafety returns true', () => {
    assert.equal(verifySourceSafety(), true, 'source safety should be clean');
  });

  it('source does not contain wallet/signing/broadcast patterns', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const __filename = fileURLToPath(import.meta.url);
    const sourcePath = __filename.replace('testnet-deploy-simulation.test.mjs', '../services/api/src/testnet-deploy-simulation.js');
    const source = readFileSync(sourcePath, 'utf8');

    const prohibitedPatterns = [
      /privateKey|private_key/i,
      /signTransaction|sign_tx|signTransaction/i,
      /sendTransaction|send_tx|sendTransaction/i,
      /eth_sendRawTransaction/i,
      /eth_sendTransaction/i,
      /eth_sign/i,
      /wallet\.fromMnemonic|wallet\.fromPhrase|HDWallet/i,
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
