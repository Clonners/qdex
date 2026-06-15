import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function readText(path) {
  return readFileSync(path, 'utf8');
}

// ---- Task 2: real-network config schema without real values ----

test('real-network-config.js exports the schema, defaults, and validation function', () => {
  const srcPath = join(root, 'services/api/src/real-network-config.js');
  const src = readText(srcPath);

  // Must export the shape constants and functions
  const requiredExports = [
    'REAL_NETWORK_CONFIG_SCHEMA',
    'createDefaultRealNetworkConfig',
    'validateRealNetworkConfig',
  ];
  for (const exp of requiredExports) {
    if (!src.includes(`export `) || !src.includes(exp)) {
      throw new Error(`Missing export: ${exp}`);
    }
  }
});

test('REAL_NETWORK_CONFIG_SCHEMA defines all required fields from the testnet cutover plan', () => {
  const schemaPath = join(root, 'services/api/src/real-network-config.js');
  const src = readText(schemaPath);

  // Required top-level fields from the plan
  const requiredTopLevelFields = [
    'networkName',
    'zone',
    'chainId',
    'rpcUrl',
    'explorerBaseUrl',
    'deployer',
    'mode',
  ];
  for (const field of requiredTopLevelFields) {
    if (!src.includes(`"${field}"`) && !src.includes(`'${field}'`) && !src.includes(`${field}:`)) {
      throw new Error(`Schema missing required top-level field: ${field}`);
    }
  }

  // Required contract address fields
  const contractFields = [
    'TradingVault',
    'Settlement',
    'NonceManager',
    'MarketRegistry',
    'FeeManager',
    'DelegateKeyRegistry',
  ];
  for (const field of contractFields) {
    if (!src.includes(field)) {
      throw new Error(`Schema missing contract field: ${field}`);
    }
  }

  // Required token fields
  const tokenFields = ['WQUAI', 'WQI'];
  for (const field of tokenFields) {
    if (!src.includes(field)) {
      throw new Error(`Schema missing token field: ${field}`);
    }
  }
});

test('createDefaultRealNetworkConfig returns approval-required defaults with null addresses', async () => {
  const { createDefaultRealNetworkConfig } = await import('../services/api/src/real-network-config.js');
  const config = createDefaultRealNetworkConfig();

  // Approval-required placeholders
  assert(config.networkName === 'approval-required', `networkName should be approval-required, got: ${config.networkName}`);
  assert(config.zone === 'approval-required', `zone should be approval-required, got: ${config.zone}`);
  assert(config.chainId === null, `chainId should be null, got: ${config.chainId}`);
  assert(config.rpcUrl === null, `rpcUrl should be null, got: ${config.rpcUrl}`);
  assert(config.explorerBaseUrl === null, `explorerBaseUrl should be null, got: ${config.explorerBaseUrl}`);
  assert(config.deployer === null, `deployer should be null, got: ${config.deployer}`);
  assert(config.mode === 'prepare-only-approval-required', `mode should be prepare-only-approval-required, got: ${config.mode}`);

  // Contract addresses are all null
  const contracts = config.contracts;
  assert(contracts.TradingVault === null, 'TradingVault should be null');
  assert(contracts.Settlement === null, 'Settlement should be null');
  assert(contracts.NonceManager === null, 'NonceManager should be null');
  assert(contracts.MarketRegistry === null, 'MarketRegistry should be null');
  assert(contracts.FeeManager === null, 'FeeManager should be null');
  assert(contracts.DelegateKeyRegistry === null, 'DelegateKeyRegistry should be null');

  // Token addresses are all null
  const tokens = config.tokens;
  assert(tokens.WQUAI === null, 'WQUAI should be null');
  assert(tokens.WQI === null, 'WQI should be null');
});

test('validateRealNetworkConfig rejects config with missing required fields', async () => {
  const { validateRealNetworkConfig } = await import('../services/api/src/real-network-config.js');

  const result = validateRealNetworkConfig({
    networkName: 'approval-required',
    rpcUrl: null,
    chainId: null,
  });

  assert(!result.valid, 'Should not be valid with missing fields');
  assert(Array.isArray(result.errors), 'Should have errors array');
  assert(result.errors.length > 0, 'Should have at least one error');
});

test('validateRealNetworkConfig rejects config that has real RPC URL without approval', async () => {
  const { validateRealNetworkConfig } = await import('../services/api/src/real-network-config.js');

  const result = validateRealNetworkConfig({
    networkName: 'quai-testnet',
    zone: 'zone-0',
    chainId: 1,
    rpcUrl: 'https://testnet-rpc.quai.network',
    explorerBaseUrl: 'https://testnet-explorer.quai.network',
    deployer: null,
    mode: 'prepare-only-approval-required',
    contracts: {
      TradingVault: null,
      Settlement: null,
      NonceManager: null,
      MarketRegistry: null,
      FeeManager: null,
      DelegateKeyRegistry: null,
    },
    tokens: {
      WQUAI: null,
      WQI: null,
    },
  });

  assert(!result.valid, 'Should not be valid with real RPC URL and no approval');
  const rpcError = result.errors.find((e) => e.includes('rpcUrl') || e.includes('rpc'));
  assert(rpcError, 'Should have an RPC-related error');
});

test('validateRealNetworkConfig accepts approval-required defaults as valid prepare-only config', async () => {
  const { createDefaultRealNetworkConfig, validateRealNetworkConfig } = await import('../services/api/src/real-network-config.js');

  const config = createDefaultRealNetworkConfig();
  const result = validateRealNetworkConfig(config);

  assert(result.valid, 'Default config should be valid for prepare-only mode');
  assert(result.mode === 'prepare-only', 'Should report prepare-only mode');
  assert(result.realValuesPresent === false, 'Should not have real values present');
});

test('validateRealNetworkConfig carries safety metadata in results', async () => {
  const { createDefaultRealNetworkConfig, validateRealNetworkConfig } = await import('../services/api/src/real-network-config.js');

  const result = validateRealNetworkConfig(createDefaultRealNetworkConfig());

  assert(result.realQuaiTransactions === false, 'Should preserve realQuaiTransactions: false');
  assert(result.walletRequired === false, 'Should preserve walletRequired: false');
  assert(result.noWalletLoaded === true, 'Should confirm no wallet loaded');
  assert(result.noRpcAccess === true, 'Should confirm no RPC access');
  assert(result.noFundsMovement === true, 'Should confirm no funds movement');
});

test('REAL_NETWORK_CONFIG_SCHEMA defines contracts and tokens as nested objects', async () => {
  const { REAL_NETWORK_CONFIG_SCHEMA } = await import('../services/api/src/real-network-config.js');

  assert(REAL_NETWORK_CONFIG_SCHEMA.contracts, 'Schema should have contracts section');
  assert(REAL_NETWORK_CONFIG_SCHEMA.tokens, 'Schema should have tokens section');

  // Verify contract names
  assert(REAL_NETWORK_CONFIG_SCHEMA.contracts.TradingVault, 'Should have TradingVault');
  assert(REAL_NETWORK_CONFIG_SCHEMA.contracts.Settlement, 'Should have Settlement');
  assert(REAL_NETWORK_CONFIG_SCHEMA.contracts.NonceManager, 'Should have NonceManager');
  assert(REAL_NETWORK_CONFIG_SCHEMA.contracts.MarketRegistry, 'Should have MarketRegistry');
  assert(REAL_NETWORK_CONFIG_SCHEMA.contracts.FeeManager, 'Should have FeeManager');
  assert(REAL_NETWORK_CONFIG_SCHEMA.contracts.DelegateKeyRegistry, 'Should have DelegateKeyRegistry');

  // Verify token names
  assert(REAL_NETWORK_CONFIG_SCHEMA.tokens.WQUAI, 'Should have WQUAI');
  assert(REAL_NETWORK_CONFIG_SCHEMA.tokens.WQI, 'Should have WQI');
});

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}
