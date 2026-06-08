const LOCAL_MAX_FEE_BPS = 1_000;
const MARKET_ID = 'QI-QUAI';

export const FEEMANAGER_POLICY_PROJECTION_SOURCE = 'feemanager-policy-projection';

const createFeeScheduleProjection = () => ({
  marketId: MARKET_ID,
  projectionType: 'FeeScheduleProjection',
  eventName: 'FeesUpdated',
  makerFeeBps: 0,
  takerFeeBps: 0,
  maxFeeBps: LOCAL_MAX_FEE_BPS,
  feeRecipient: null,
  settlementMode: 'mock',
  settlementTx: null,
  blockNumber: null,
  blockHash: null,
  eventIndex: null,
  explorerUrl: null,
});

export const createFeeScheduleResponse = () => ({
  feeSchedules: [createFeeScheduleProjection()],
  source: FEEMANAGER_POLICY_PROJECTION_SOURCE,
  status: 'local-only-not-deployed',
  custody: 'non-custodial-fee-policy',
  permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
  hardMaxFeeBps: LOCAL_MAX_FEE_BPS,
  feeRecipient: null,
  feeManagerMutation: false,
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  safety: {
    noWalletLoading: true,
    noRpcUrlAccess: true,
    noSigning: true,
    noBroadcast: true,
    noDeploys: true,
    noTransactionSubmission: true,
    noFundsMovement: true,
    noFeeAuthorityRuntimeKeys: true,
    notice:
      'Read-only FeeManager schedule metadata: local/mock rows have no real Quai transaction, no wallet loaded, no fee-authority key, no TradingVault mutation, and no funds moved.',
  },
});
