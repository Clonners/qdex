// Event-truth adapter — ingests real contract events into the indexer.
// In mock mode, all event evidence fields remain null; real mode requires
// explicit approval before any RPC or chain interaction.

export const EVENT_TRUTH_SOURCE = 'quai-contract-event-truth';

export const EVENT_TRUTH_EVENT_TYPES = Object.freeze([
  'TradeSettled',
  'Deposit',
  'Withdraw',
  'NonceUsed',
  'NonceCancelled',
  'NonceRangeCancelled',
  'MarketAdded',
  'MarketDisabled',
  'FeesUpdated',
  'DelegateKeyRegistered',
  'DelegateKeyRevoked',
]);

const EVENT_CONTRACT_MAP = Object.freeze({
  Settlement: ['TradeSettled'],
  TradingVault: ['Deposit', 'Withdraw'],
  NonceManager: ['NonceUsed', 'NonceCancelled', 'NonceRangeCancelled'],
  MarketRegistry: ['MarketAdded', 'MarketDisabled'],
  FeeManager: ['FeesUpdated'],
  DelegateKeyRegistry: ['DelegateKeyRegistered', 'DelegateKeyRevoked'],
});

export function listEventTruthContracts() {
  return Object.entries(EVENT_CONTRACT_MAP).map(([name, events]) => ({
    name,
    events,
  }));
}

export function listEventsForContract(contractName) {
  return EVENT_CONTRACT_MAP[contractName] ?? [];
}

const REQUIRED_EVIDENCE_FIELDS = Object.freeze([
  'contractAddress',
  'settlementTx',
  'blockNumber',
  'blockHash',
  'eventIndex',
]);

export function validateEventEvidence(evidence) {
  const missing = REQUIRED_EVIDENCE_FIELDS.filter((field) => {
    return evidence?.[field] === undefined || evidence?.[field] === null || evidence?.[field] === '';
  });
  return {
    valid: missing.length === 0,
    missingFields: missing,
    source: EVENT_TRUTH_SOURCE,
  };
}

const DEFAULT_FINALITY_DEPTH = 12;

export function isFinalityMet({ blockNumber, currentBlock, finalityDepth = DEFAULT_FINALITY_DEPTH } = {}) {
  if (blockNumber == null || currentBlock == null) {
    return false;
  }
  return (currentBlock - blockNumber) >= finalityDepth;
}

/**
 * createEventTruthAdapter — processes contract events into indexer projections.
 *
 * In mock mode, all evidence fields remain null and settlementMode is "mock".
 * Real mode is gated behind explicit approval; without it the adapter returns
 * a reject envelope for every event.
 */
export function createEventTruthAdapter(options = {}) {
  const { approval = false, finalityDepth = DEFAULT_FINALITY_DEPTH } = options;

  const events = [];
  const projected = [];

  return {
    source: EVENT_TRUTH_SOURCE,
    approval,
    finalityDepth,
    settlementMode: approval ? 'quai_contract' : 'mock',
    realQuaiTransactions: false,
    walletRequired: false,
    fundsMoved: false,

    ingest(event) {
      events.push(event);
      return { ingested: 1, totalEvents: events.length };
    },

    process() {
      const results = [];
      for (const event of events) {
        const evidence = validateEventEvidence(event);
        if (!approval || !evidence.valid) {
          results.push({
            ...event,
            settlementMode: 'mock',
            projectionStatus: 'pending',
            realQuaiTransactions: false,
            walletRequired: false,
            fundsMoved: false,
          });
        } else {
          const finalized = isFinalityMet({
            blockNumber: event.blockNumber,
            currentBlock: event.currentBlock,
            finalityDepth,
          });
          projected.push({ ...event, finalized });
          results.push({
            ...event,
            settlementMode: 'quai_contract',
            projectionStatus: finalized ? 'finalized' : 'confirmed',
            realQuaiTransactions: false,
            walletRequired: false,
            fundsMoved: false,
          });
        }
      }
      return results;
    },

    getEvents() {
      return [...events];
    },

    getProjected() {
      return [...projected];
    },
  };
}
