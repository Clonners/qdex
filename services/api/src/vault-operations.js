const VAULT_OPERATION_MESSAGES = Object.freeze({
  deposit:
    'TradingVault deposit is owner-wallet-only and not implemented in local mock mode; this prepare-only endpoint does not load wallets, sign, broadcast, submit transactions, mutate TradingVault, or move funds.',
  withdrawal:
    'TradingVault withdrawal is owner-wallet-only and not implemented in local mock mode; this prepare-only endpoint does not load wallets, sign, broadcast, submit transactions, mutate TradingVault, or move funds.',
});

const VAULT_HISTORY_CONFIG = Object.freeze({
  deposit: Object.freeze({
    collection: 'deposits',
    projectionType: 'TradingVaultDepositProjection',
    eventName: 'Deposit',
  }),
  withdrawal: Object.freeze({
    collection: 'withdrawals',
    projectionType: 'TradingVaultWithdrawalProjection',
    eventName: 'Withdraw',
  }),
});

const createVaultSafetyNotice = (eventName) => (
  `Read-only TradingVault ${eventName} history projection: mock rows have no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.`
);

export const createVaultOperationPreparePlaceholder = (operation) => ({
  error: `owner_wallet_vault_${operation}_not_implemented`,
  source: 'owner-wallet-vault-operation-placeholder',
  custody: 'non-custodial-contract-vault',
  vaultOperation: operation,
  operationStatus: 'prepare-only-not-implemented',
  ownerAuthorization: 'owner-wallet-required',
  permissions: ['NO_WITHDRAW', 'NO_ADMIN'],
  delegateAuthority: 'delegates-cannot-deposit-or-withdraw',
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  approvalGate: 'explicit-approval-required-before-wallet-signing-or-quai-broadcast',
  safety: {
    noWalletLoading: true,
    noRpcUrlAccess: true,
    noSigning: true,
    noBroadcast: true,
    noDeploys: true,
    noTransactionSubmission: true,
    noFundsMovement: true,
    noDelegateWithdrawalAuthority: true,
    noAdminWithdrawalAuthority: true,
    notice:
      'Prepare-only owner-wallet TradingVault boundary: no wallet is loaded, no signature is created, no RPC URL is read, no transaction is submitted, and no funds move.',
  },
  message: VAULT_OPERATION_MESSAGES[operation],
});

export const createVaultHistoryProjectionEnvelope = (operation) => {
  const config = VAULT_HISTORY_CONFIG[operation];
  if (config === undefined) {
    throw new Error(`Unsupported vault history operation: ${operation}`);
  }

  return {
    [config.collection]: [],
    source: 'tradingvault-event-projection',
    projectionType: config.projectionType,
    eventName: config.eventName,
    custody: 'non-custodial-contract-vault',
    permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
    settlementMode: 'mock',
    settlementTx: null,
    blockNumber: null,
    blockHash: null,
    eventIndex: null,
    explorerUrl: null,
    realQuaiTransactions: false,
    walletRequired: false,
    fundsMoved: false,
    tradingVaultMutation: false,
    safetyNotice: createVaultSafetyNotice(config.eventName),
  };
};
