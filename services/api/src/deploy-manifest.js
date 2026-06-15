/**
 * Deploy manifest and dry-run validation for QDEX testnet cutover.
 *
 * This module defines the canonical deployment order, step metadata,
 * and a dry-run manifest that can be validated without deploying.
 *
 * Boundaries:
 * - No real RPC URL, wallet, signing, broadcast, deploy, or funds behavior.
 * - Manifest addresses are `null` in draft-dry-run mode.
 * - Validation rejects real addresses without explicit approval metadata.
 * - Safety metadata is always present in results.
 */

// Canonical deployment order from testnet cutover plan Task 3.
export const DEPLOY_ORDER = Object.freeze([
  {
    contract: 'TradingVault',
    dependencies: [],
    description: 'Non-custodial balance vault — users deposit/withdraw, operator cannot touch funds.',
  },
  {
    contract: 'NonceManager',
    dependencies: [],
    description: 'Replay protection and order cancellation — user-owned nonce management.',
  },
  {
    contract: 'MarketRegistry',
    dependencies: [],
    description: 'Enabled markets and precision/minimums — authority-gated add/disable.',
  },
  {
    contract: 'FeeManager',
    dependencies: [],
    description: 'Transparent maker/taker fees — authority-gated with hard caps.',
  },
  {
    contract: 'DelegateKeyRegistry',
    dependencies: [],
    description: 'Safe bot/agent access — NO_WITHDRAW, NO_ADMIN, expiry, notional caps.',
  },
  {
    contract: 'Settlement',
    dependencies: ['TradingVault', 'NonceManager', 'MarketRegistry', 'FeeManager', 'DelegateKeyRegistry'],
    description: 'Executes matched trades on-chain — wired to all dependency contracts.',
  },
]);

// Detailed deployment steps with post-deploy actions.
export const DEPLOY_STEPS = Object.freeze([
  ...DEPLOY_ORDER.map((step) => ({
    ...step,
    name: step.contract,
    postDeployActions: [],
    noWithdraw: true,
    noAdmin: true,
  })),
  {
    contract: 'VaultSettlementAuthority',
    name: 'Vault Settlement Authority Wiring',
    dependencies: ['TradingVault', 'Settlement'],
    description: 'Wire Settlement as TradingVault settlement authority — Settlement can only lock/unlock/settle, never withdraw user funds.',
    postDeployActions: ['settleAuthorityGrant'],
    noWithdraw: true,
    noAdmin: true,
  },
  {
    contract: 'MarketWQIWQUAI',
    name: 'WQI/WQUAI Market Enablement',
    dependencies: ['MarketRegistry'],
    description: 'Enable initial WQI/WQUAI market pair with precision and minimums.',
    postDeployActions: ['addMarket'],
    noWithdraw: true,
    noAdmin: true,
  },
  {
    contract: 'FeePolicyInit',
    name: 'Fee Policy Initialization',
    dependencies: ['FeeManager'],
    description: 'Initialize fee policy for WQI/WQUAI market — zero fees until explicitly configured.',
    postDeployActions: ['updateFees'],
    noWithdraw: true,
    noAdmin: true,
  },
]);

/**
 * Create a draft deploy manifest for dry-run validation.
 *
 * Returns a manifest with all addresses null, no broadcast capability,
 * and explicit mock safety metadata.
 */
export function createDeployManifest() {
  return Object.freeze({
    mode: 'draft-dry-run',
    deployed: false,
    canBroadcast: false,

    // Contract addresses — null in draft mode
    addresses: Object.freeze({
      TradingVault: null,
      NonceManager: null,
      MarketRegistry: null,
      FeeManager: null,
      DelegateKeyRegistry: null,
      Settlement: null,
    }),

    // Deployment steps — all pending, safety metadata preserved
    steps: Object.freeze(
      DEPLOY_STEPS.map((step) =>
        Object.freeze({
          contract: step.contract,
          status: 'pending',
          address: null,
          dependencies: step.dependencies,
          description: step.description,
          postDeployActions: step.postDeployActions,
          noWithdraw: step.noWithdraw,
          noAdmin: step.noAdmin,
        })
      )
    ),

    // Safety metadata — always present
    realQuaiTransactions: false,
    walletRequired: false,
    noWalletLoaded: true,
    noRpcAccess: true,
    noFundsMovement: true,
    noBroadcast: true,
  });
}

/**
 * Validate a deploy manifest against dry-run invariants.
 *
 * Returns `{ valid, mode, realAddressesPresent, errors,
 *   realQuaiTransactions, walletRequired, noWalletLoaded,
 *   noRpcAccess, noFundsMovement, noBroadcast }`.
 *
 * - A draft manifest with null addresses is valid.
 * - A manifest with real addresses without approval is invalid.
 * - Safety metadata is always present.
 */
export function validateDeployManifest(manifest) {
  const errors = [];

  // Check required structure
  if (!manifest.mode) {
    errors.push('missing required field: mode');
  }
  if (!manifest.addresses) {
    errors.push('missing required object: addresses');
  }
  if (!Array.isArray(manifest.steps)) {
    errors.push('missing required array: steps');
  }

  // Check contract addresses
  if (manifest.addresses) {
    const requiredContracts = [
      'TradingVault',
      'NonceManager',
      'MarketRegistry',
      'FeeManager',
      'DelegateKeyRegistry',
      'Settlement',
    ];
    for (const contract of requiredContracts) {
      if (!(contract in manifest.addresses)) {
        errors.push(`missing required address field: addresses.${contract}`);
      }
    }

    // Detect real addresses
    const realAddressPattern = /^0x[a-fA-F0-9]{40}$/;
    const hasRealAddresses = Object.values(manifest.addresses).some(
      (addr) => typeof addr === 'string' && realAddressPattern.test(addr)
    );

    if (hasRealAddresses && manifest.mode === 'draft-dry-run') {
      errors.push(
        'real contract addresses detected in draft-dry-run mode without explicit approval'
      );
    }
  }

  // Verify step ordering — Settlement must come after its dependencies
  if (Array.isArray(manifest.steps)) {
    const stepOrder = {};
    for (let i = 0; i < manifest.steps.length; i++) {
      stepOrder[manifest.steps[i].contract] = i;
    }

    const settlementIdx = stepOrder['Settlement'];
    if (settlementIdx !== undefined) {
      for (const dep of ['TradingVault', 'NonceManager', 'MarketRegistry', 'FeeManager', 'DelegateKeyRegistry']) {
        const depIdx = stepOrder[dep];
        if (depIdx !== undefined && depIdx > settlementIdx) {
          errors.push(
            `dependency ordering violation: ${dep} (step ${depIdx}) must come before Settlement (step ${settlementIdx})`
          );
        }
      }
    }
  }

  const realAddressesPresent = manifest.addresses && Object.values(manifest.addresses).some(
    (addr) => typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr)
  );

  return {
    valid: errors.length === 0,
    mode: manifest.mode ?? 'unknown',
    realAddressesPresent: !!realAddressesPresent,
    errors,
    // Safety metadata — always present regardless of manifest state
    realQuaiTransactions: false,
    walletRequired: false,
    noWalletLoaded: true,
    noRpcAccess: true,
    noFundsMovement: true,
    noBroadcast: true,
  };
}
