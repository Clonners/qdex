const LOCAL_MAX_FEE_BPS = 1_000;
const MARKET_ID = 'WQUAI-WQI';
const DEFAULT_MAKER_FEE_BPS = 0;
const DEFAULT_TAKER_FEE_BPS = 100;

export const FEEMANAGER_POLICY_PROJECTION_SOURCE = 'feemanager-policy-projection';

// Fee schedule state — mutable, updateable via POST /v1/fees/update
let feeState = {
  makerFeeBps: DEFAULT_MAKER_FEE_BPS,
  takerFeeBps: DEFAULT_TAKER_FEE_BPS,
  maxFeeBps: LOCAL_MAX_FEE_BPS,
};

export const getFeeSchedule = () => ({
  makerFeeBps: feeState.makerFeeBps,
  takerFeeBps: feeState.takerFeeBps,
  maxFeeBps: feeState.maxFeeBps,
});

export const updateFeeSchedule = (makerFeeBps, takerFeeBps) => {
  if (makerFeeBps > LOCAL_MAX_FEE_BPS || takerFeeBps > LOCAL_MAX_FEE_BPS) {
    return {
      accepted: false,
      reason: 'exceeds_hard_max',
      hardMaxFeeBps: LOCAL_MAX_FEE_BPS,
    };
  }
  feeState.makerFeeBps = makerFeeBps;
  feeState.takerFeeBps = takerFeeBps;
  return { accepted: true };
};

/** Calculate fee in base asset units given price, amount, and fee BPS.
 *  Formula: fee = price * amount * feeBps / 10000
 *  Returns string. */
export const calculateFee = (price, amount, feeBps) => {
  const p = BigInt(price);
  const a = BigInt(amount);
  const bps = BigInt(feeBps);
  const grossNotional = p * a;
  return (grossNotional * bps / 10000n).toString();
};

const createFeeScheduleProjection = () => ({
  marketId: MARKET_ID,
  projectionType: 'FeeScheduleProjection',
  eventName: 'FeesUpdated',
  makerFeeBps: feeState.makerFeeBps,
  takerFeeBps: feeState.takerFeeBps,
  maxFeeBps: feeState.maxFeeBps,
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
