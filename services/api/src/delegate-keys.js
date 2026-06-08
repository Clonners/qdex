const DEFAULT_DELEGATE_PERMISSIONS = Object.freeze([
  'READ_ONLY',
  'PLACE_ORDER',
  'CANCEL_ORDER',
  'CANCEL_ALL',
  'NO_WITHDRAW',
  'NO_ADMIN',
]);

export const DELEGATE_KEY_EVENT_PROJECTION_SOURCE = 'delegatekeyregistry-event-projection';

const REQUIRED_DELEGATE_FIELDS = Object.freeze([
  'delegate',
  'expiresAt',
  'allowedMarkets',
  'maxNotional',
  'permissions',
]);

const DELEGATE_KEY_HISTORY_CONFIG = Object.freeze({
  registration: Object.freeze({
    collection: 'registrations',
    projectionType: 'DelegateKeyRegisteredProjection',
    eventName: 'DelegateKeyRegistered',
  }),
  revocation: Object.freeze({
    collection: 'revocations',
    projectionType: 'DelegateKeyRevokedProjection',
    eventName: 'DelegateKeyRevoked',
  }),
});

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

const createDelegateKeyHistorySafetyNotice = (eventName) => (
  `Read-only DelegateKeyRegistry ${eventName} history projection: mock rows have no real Quai transaction, no wallet loaded, no live DelegateKeyRegistry mutation, no funds moved, and no delegate withdrawal/admin authority.`
);

export const createDelegateKeyHistoryProjectionEnvelope = (operation) => {
  const config = DELEGATE_KEY_HISTORY_CONFIG[operation];
  if (config === undefined) {
    throw new Error(`Unsupported delegate-key history operation: ${operation}`);
  }

  return {
    [config.collection]: [],
    source: DELEGATE_KEY_EVENT_PROJECTION_SOURCE,
    projectionType: config.projectionType,
    eventName: config.eventName,
    custody: 'non-custodial-no-withdrawal-authority',
    permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
    settlementMode: 'mock',
    settlementTx: null,
    blockNumber: null,
    blockHash: null,
    eventIndex: null,
    explorerUrl: null,
    delegateCanWithdraw: false,
    delegateCanAdmin: false,
    realQuaiTransactions: false,
    walletRequired: false,
    fundsMoved: false,
    tradingVaultMutation: false,
    delegateKeyRegistryMutation: false,
    safetyNotice: createDelegateKeyHistorySafetyNotice(config.eventName),
  };
};

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
