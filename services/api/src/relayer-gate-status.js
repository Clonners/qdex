import {
  evaluateRelayerSettlementModeGate,
  REQUIRED_QUAI_EVENT_TRUTH_FIELDS,
} from '../../relayer/src/approval-gate.js';

const CURRENT_SETTLEMENT_MODE = 'mock';

const SAFETY = Object.freeze({
  approvalRequired: true,
  explicitApproval: 'Clonners approval required before quai_contract activation',
  noWalletLoading: true,
  noSigning: true,
  noBroadcast: true,
  noRpcUrlAccess: true,
  noTransactionSubmission: true,
  proofTrigger: 'TradeSettled',
  notice:
    'Read-only relayer gate metadata only: no wallet loading, signing, broadcast, RPC URL access, or transaction submission is performed.',
});

export const createRelayerSettlementModeGateStatus = () => ({
  source: 'relayer-approval-gate',
  currentSettlementMode: CURRENT_SETTLEMENT_MODE,
  supportedSettlementModes: ['mock', 'quai_contract'],
  custody: 'non-custodial-relayer-gate',
  realQuaiTransactions: false,
  walletRequired: false,
  requiredEventTruthFields: REQUIRED_QUAI_EVENT_TRUTH_FIELDS,
  modes: {
    mock: evaluateRelayerSettlementModeGate({ settlementMode: 'mock' }),
    quai_contract: evaluateRelayerSettlementModeGate({ settlementMode: 'quai_contract' }),
  },
  safety: SAFETY,
});
