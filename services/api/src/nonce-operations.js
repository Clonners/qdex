export const NONCE_MANAGER_EVENT_PROJECTION_SOURCE = 'nonce-manager-event-projection';

const NONCE_CANCELLATION_HISTORY_CONFIG = Object.freeze({
  cancellation: Object.freeze({
    collection: 'cancellations',
    projectionType: 'NonceCancelledProjection',
    eventName: 'NonceCancelled',
  }),
  rangeCancellation: Object.freeze({
    collection: 'cancellations',
    projectionType: 'NonceRangeCancelledProjection',
    eventName: 'NonceRangeCancelled',
  }),
});

const createNonceCancellationSafetyNotice = () =>
  'Read-only NonceManager NonceCancelled/NonceRangeCancelled history envelope. source: nonce-manager-event-projection; settlementMode: mock; mock evidence fields stay null until real event truth exists.';

export const createNonceCancellationHistoryProjectionEnvelope = () => {
  return {
    cancellations: [],
    source: NONCE_MANAGER_EVENT_PROJECTION_SOURCE,
    projectionType: 'NonceCancelledProjection',
    eventName: 'NonceCancelled',
    custody: 'non-custodial-no-withdrawal-authority',
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
    nonceManagerMutation: false,
    tradingVaultMutation: false,
    safetyNotice: createNonceCancellationSafetyNotice(),
  };
};
