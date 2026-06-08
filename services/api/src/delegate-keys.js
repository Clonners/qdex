const DEFAULT_DELEGATE_PERMISSIONS = Object.freeze([
  'READ_ONLY',
  'PLACE_ORDER',
  'CANCEL_ORDER',
  'CANCEL_ALL',
  'NO_WITHDRAW',
  'NO_ADMIN',
]);

const REQUIRED_DELEGATE_FIELDS = Object.freeze([
  'delegate',
  'expiresAt',
  'allowedMarkets',
  'maxNotional',
  'permissions',
]);

const prepareBase = Object.freeze({
  source: 'delegate-key-owner-signed-prepare-boundary',
  custody: 'non-custodial-no-withdrawal-authority',
  operationStatus: 'prepare-only-owner-signed-required',
  ownerAuthorization: 'owner-wallet-signature-required',
  delegateAuthority: 'trade-only-no-withdraw-no-admin',
  requiredFields: REQUIRED_DELEGATE_FIELDS,
  delegateCanWithdraw: false,
  delegateCanAdmin: false,
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  approvalGate: 'explicit-approval-required-before-owner-wallet-signing-or-live-registry-mutation',
});

export const createDelegateKeyListResponse = () => ({
  delegateKeys: [],
  source: 'delegate-key-registry-projection',
  custody: 'non-custodial-no-withdrawal-authority',
  defaultPermissions: [...DEFAULT_DELEGATE_PERMISSIONS],
  requiredFields: [...REQUIRED_DELEGATE_FIELDS],
  safety: {
    delegateCanWithdraw: false,
    delegateCanAdmin: false,
    realQuaiTransactions: false,
    walletRequired: false,
    fundsMoved: false,
    tradingVaultMutation: false,
    message:
      'Delegate/API keys are trade-only metadata in local mode; they cannot withdraw, administer contracts, move funds, or mutate TradingVault balances.',
  },
});

export const createDelegateKeyPreparePlaceholder = (operation, keyId = null) => {
  if (operation === 'revoke_delegate_key') {
    return {
      error: 'delegate_key_revocation_not_implemented',
      operation,
      keyId,
      ...prepareBase,
      permissions: ['NO_WITHDRAW', 'NO_ADMIN'],
      message:
        'No delegate key is revoked in local prepare-only mode; owner-signed revocation is not wired to wallet loading, signing, broadcast, deploy, transaction helpers, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement.',
    };
  }

  return {
    error: 'delegate_key_registration_not_implemented',
    operation: 'register_delegate_key',
    ...prepareBase,
    permissions: ['PLACE_ORDER', 'CANCEL_ORDER', 'CANCEL_ALL', 'NO_WITHDRAW', 'NO_ADMIN'],
    message:
      'No delegate key is registered in local prepare-only mode; owner-signed registration is not wired to wallet loading, signing, broadcast, deploy, transaction helpers, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement.',
  };
};
