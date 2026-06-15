/**
 * Real-network configuration schema and defaults for QDEX testnet cutover.
 *
 * This module defines the typed shape of the future testnet configuration
 * while storing no live network values. All fields default to `null` or
 * `approval-required` placeholders. Missing real values keep the app in
 * local/mock or prepare-only mode.
 *
 * Boundaries:
 * - No real RPC URL, wallet, signing, broadcast, deploy, or funds behavior.
 * - Config validation rejects real values without explicit approval metadata.
 * - Safety metadata is always present in validation results.
 */

// Schema shape definition (documented, not enforced at runtime).
export const REAL_NETWORK_CONFIG_SCHEMA = Object.freeze({
  /** Network identifier (e.g. "quai-cyprus-1"). Placeholder before approval. */
  networkName: { type: 'string', required: true, default: 'approval-required' },
  /** Zone within the network (e.g. "zone-0"). Placeholder before approval. */
  zone: { type: 'string', required: true, default: 'approval-required' },
  /** Numeric chain ID. Null until real network inputs are approved. */
  chainId: { type: 'number | null', required: true, default: null },
  /** JSON-RPC endpoint URL. Null until explicit approval. */
  rpcUrl: { type: 'string | null', required: true, default: null },
  /** Block explorer base URL. Null until explicit approval. */
  explorerBaseUrl: { type: 'string | null', required: true, default: null },
  /** Deployer wallet address. Null until explicit approval. */
  deployer: { type: 'string | null', required: true, default: null },
  /**
   * Deployment order for the first real testnet loop:
   * 1. Mock/test ERC-20 tokens (if needed for testnet assets)
   * 2. TradingVault
   * 3. NonceManager
   * 4. MarketRegistry
   * 5. FeeManager
   * 6. DelegateKeyRegistry
   * 7. Settlement (wired to vault/nonce/market/fee/delegate)
   * 8. Vault settlement-authority wiring
   * 9. Initial market WQI/WQUAI enablement
   * 10. Fee policy initialization
   */
  contracts: {
    /** TradingVault — non-custodial balances. */
    TradingVault: { type: 'string | null', required: true, default: null },
    /** Settlement — executes matched trades on-chain. */
    Settlement: { type: 'string | null', required: true, default: null },
    /** NonceManager — replay protection and order cancellation. */
    NonceManager: { type: 'string | null', required: true, default: null },
    /** MarketRegistry — enabled markets and precision/minimums. */
    MarketRegistry: { type: 'string | null', required: true, default: null },
    /** FeeManager — transparent maker/taker fees. */
    FeeManager: { type: 'string | null', required: true, default: null },
    /** DelegateKeyRegistry — safe bot/agent access. */
    DelegateKeyRegistry: { type: 'string | null', required: true, default: null },
  },
  /** Token addresses for the first testnet market. */
  tokens: {
    /** Wrapped QUAI — quote asset. */
    WQUAI: { type: 'string | null', required: true, default: null },
    /** Wrapped QI — base asset. */
    WQI: { type: 'string | null', required: true, default: null },
  },
  /**
   * Operational mode.
   * `prepare-only-approval-required` = default; no real values permitted.
   * `testnet-ready` = all fields populated after explicit approval.
   */
  mode: { type: 'string', required: true, default: 'prepare-only-approval-required' },
});

/**
 * Create the default real-network configuration with approval-required placeholders.
 *
 * All contract addresses, token addresses, and network fields are `null`.
 * The mode is `prepare-only-approval-required`.
 */
export function createDefaultRealNetworkConfig() {
  return Object.freeze({
    networkName: 'approval-required',
    zone: 'approval-required',
    chainId: null,
    rpcUrl: null,
    explorerBaseUrl: null,
    deployer: null,
    contracts: Object.freeze({
      TradingVault: null,
      Settlement: null,
      NonceManager: null,
      MarketRegistry: null,
      FeeManager: null,
      DelegateKeyRegistry: null,
    }),
    tokens: Object.freeze({
      WQUAI: null,
      WQI: null,
    }),
    mode: 'prepare-only-approval-required',
  });
}

/**
 * Validate a real-network configuration object against the schema.
 *
 * Returns `{ valid, mode, realValuesPresent, errors, realQuaiTransactions, walletRequired,
 *   noWalletLoaded, noRpcAccess, noFundsMovement }`.
 *
 * - A default config (all nulls / approval-required) is valid in prepare-only mode.
 * - A config with real values (non-null RPC, addresses, etc.) without approval is invalid.
 * - Safety metadata is always present in the result.
 */
export function validateRealNetworkConfig(config = {}) {
  const errors = [];

  // Check required top-level fields
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
    if (!(field in config)) {
      errors.push(`missing required field: ${field}`);
    }
  }

  // Check contracts object
  if (config.contracts) {
    const requiredContracts = [
      'TradingVault',
      'Settlement',
      'NonceManager',
      'MarketRegistry',
      'FeeManager',
      'DelegateKeyRegistry',
    ];
    for (const contract of requiredContracts) {
      if (!(contract in config.contracts)) {
        errors.push(`missing required contract field: contracts.${contract}`);
      }
    }
  } else {
    errors.push('missing required object: contracts');
  }

  // Check tokens object
  if (config.tokens) {
    const requiredTokens = ['WQUAI', 'WQI'];
    for (const token of requiredTokens) {
      if (!(token in config.tokens)) {
        errors.push(`missing required token field: tokens.${token}`);
      }
    }
  } else {
    errors.push('missing required object: tokens');
  }

  // Determine if real values are present
  const hasRealRpcUrl =
    config.rpcUrl !== null &&
    config.rpcUrl !== 'approval-required' &&
    typeof config.rpcUrl === 'string' &&
    config.rpcUrl.trim().length > 0;
  const hasRealChainId =
    config.chainId !== null &&
    config.chainId !== 'approval-required' &&
    typeof config.chainId === 'number';
  const hasRealContractAddress = config.contracts && Object.values(config.contracts).some(
    (v) => v !== null && typeof v === 'string' && v.trim().length > 0
  );
  const hasRealTokenAddress = config.tokens && Object.values(config.tokens).some(
    (v) => v !== null && typeof v === 'string' && v.trim().length > 0
  );

  const realValuesPresent =
    hasRealRpcUrl || hasRealChainId || hasRealContractAddress || hasRealTokenAddress;

  // Reject real values without approval
  if (realValuesPresent && config.mode !== 'testnet-ready') {
    if (hasRealRpcUrl) {
      errors.push(
        `real rpcUrl detected without testnet-ready mode approval: rpcUrl must remain null in prepare-only mode`
      );
    }
    if (hasRealContractAddress) {
      errors.push(
        'real contract addresses detected without testnet-ready mode approval'
      );
    }
    if (hasRealTokenAddress) {
      errors.push('real token addresses detected without testnet-ready mode approval');
    }
  }

  const isPrepareOnly =
    config.mode === 'prepare-only-approval-required' ||
    (config.networkName === 'approval-required' && !realValuesPresent);

  return {
    valid: errors.length === 0,
    mode: isPrepareOnly ? 'prepare-only' : (config.mode ?? 'unknown'),
    realValuesPresent,
    errors,
    // Safety metadata — always present regardless of config state
    realQuaiTransactions: false,
    walletRequired: false,
    noWalletLoaded: true,
    noRpcAccess: true,
    noFundsMovement: true,
  };
}
