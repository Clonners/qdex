// Reorg-safe event log — stores contract events with block hashes so the
// indexer can detect chain reorganisations and replay invalidated events.
//
// Safety envelope: no RPC, no wallet, no signing, no broadcast, no funds.
// All block hash comparisons are local data-structure operations.

const SAFETY_ENVELOPE = Object.freeze({
  source: 'reorg-safe-event-log',
  settlementMode: 'mock',
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  marketRegistryMutation: false,
  permissions: ['NO_WITHDRAW', 'NO_ADMIN'],
});

/**
 * createReorgSafeEventLog — deterministic event log with reorg detection.
 *
 * @param {object} options
 * @param {number} [options.reorgSafetyDepth] — blocks behind head before
 *   an event is considered canonical (default: 3). Lower than finality
 *   because this is a local replay buffer, not settlement finality.
 * @returns {object} event log API
 */
export function createReorgSafeEventLog(options = {}) {
  const { reorgSafetyDepth = 3 } = options;

  // Canonical block heads: { blockNumber: blockHash }
  const canonicalHeads = new Map();

  // All ingested events, ordered by block then event index
  const eventLog = [];

  // Events invalidated by reorg (kept for diagnostics / replay)
  const reorgedEvents = [];

  // Reorg incident history for diagnostics
  const reorgHistory = [];

  // ─── Internal helpers ─────────────────────────────────────────────

  const isValidBlockHash = (hash) =>
    typeof hash === 'string' && hash.startsWith('0x') && hash.length === 66;

  const isValidBlockNumber = (n) =>
    Number.isInteger(n) && n >= 0;

  // ─── Public API ───────────────────────────────────────────────────

  return {
    ...SAFETY_ENVELOPE,

    /**
     * Append a new canonical block head.
     * If the block number already exists and the hash differs, a reorg is
     * detected and events at/after that block are invalidated.
     *
     * @param {number} blockNumber
     * @param {string} blockHash
     * @returns {{ reorg: boolean, blockNumber: number, invalidatedCount: number }}
     */
    appendBlock(blockNumber, blockHash) {
      if (!isValidBlockNumber(blockNumber)) {
        return { reorg: false, blockNumber, invalidatedCount: 0, error: 'invalid_block_number' };
      }
      if (!isValidBlockHash(blockHash)) {
        return { reorg: false, blockNumber, invalidatedCount: 0, error: 'invalid_block_hash' };
      }

      // Check for reorg: same block number, different hash
      if (canonicalHeads.has(blockNumber)) {
        const existingHash = canonicalHeads.get(blockNumber);
        if (existingHash !== blockHash) {
          // Reorg detected at this block — invalidate events from here
          const invalidated = this.replayFrom(blockNumber);
          reorgHistory.push({
            reorgBlockNumber: blockNumber,
            oldHash: existingHash,
            newHash: blockHash,
            invalidatedCount: invalidated.length,
            detectedAt: Date.now(),
          });
          canonicalHeads.set(blockNumber, blockHash);
          return { reorg: true, blockNumber, invalidatedCount: invalidated.length };
        }
      }

      // New or confirming block
      canonicalHeads.set(blockNumber, blockHash);
      return { reorg: false, blockNumber, invalidatedCount: 0 };
    },

    /**
     * Append a contract event to the log.
     *
     * @param {object} event
     * @param {string} event.eventId — unique event identifier
     * @param {string} event.eventType — e.g. 'TradeSettled', 'Deposit'
     * @param {number} event.blockNumber — block containing this event
     * @param {string} event.blockHash — block hash at ingestion time
     * @param {number} event.eventIndex — index within the block's events
     * @param {string} [event.contractAddress]
     * @param {object} [event.data]
     * @returns {{ ingested: boolean, eventId: string, error?: string }}
     */
    appendEvent(event) {
      const { eventId, eventType, blockNumber, blockHash, eventIndex } = event;

      if (!eventId) {
        return { ingested: false, eventId: null, error: 'missing_event_id' };
      }
      if (!eventType) {
        return { ingested: false, eventId, error: 'missing_event_type' };
      }
      if (!isValidBlockNumber(blockNumber)) {
        return { ingested: false, eventId, error: 'invalid_block_number' };
      }
      if (!isValidBlockHash(blockHash)) {
        return { ingested: false, eventId, error: 'invalid_block_hash' };
      }
      if (!Number.isInteger(eventIndex) || eventIndex < 0) {
        return { ingested: false, eventId, error: 'invalid_event_index' };
      }

      // Check for duplicate eventId
      if (eventLog.find((e) => e.eventId === eventId)) {
        return { ingested: false, eventId, error: 'duplicate_event_id' };
      }

      eventLog.push({
        eventId,
        eventType,
        blockNumber,
        blockHash,
        eventIndex,
        contractAddress: event.contractAddress ?? null,
        data: event.data ?? null,
        ingestedAt: Date.now(),
        invalidated: false,
      });

      return { ingested: true, eventId };
    },

    /**
     * Check if a given block hash matches the canonical chain without
     * mutating state.
     *
     * @param {number} blockNumber
     * @param {string} blockHash
     * @returns {{ matches: boolean, reorg: boolean }}
     */
    checkReorg(blockNumber, blockHash) {
      if (!canonicalHeads.has(blockNumber)) {
        return { matches: false, reorg: false };
      }
      const existing = canonicalHeads.get(blockNumber);
      return { matches: existing === blockHash, reorg: existing !== blockHash };
    },

    /**
     * Invalidate all events at or after the given block number and move
     * them to the reorged pool.
     *
     * @param {number} fromBlockNumber
     * @returns {Array<object>} — invalidated events
     */
    replayFrom(fromBlockNumber) {
      const invalidated = [];

      for (const event of eventLog) {
        if (!event.invalidated && event.blockNumber >= fromBlockNumber) {
          event.invalidated = true;
          invalidated.push({ ...event });
        }
      }

      // Trim canonical heads from reorg point onward
      const headsToRemove = [];
      for (const [bn] of canonicalHeads) {
        if (bn >= fromBlockNumber) {
          headsToRemove.push(bn);
        }
      }
      for (const bn of headsToRemove) {
        canonicalHeads.delete(bn);
      }

      reorgedEvents.push(...invalidated);
      return invalidated;
    },

    /**
     * Return events that are on the canonical chain and not invalidated.
     * Optionally filtered by a minimum canonical confirmation depth.
     *
     * @param {object} [options]
     * @param {boolean} [options.withinSafetyDepth] — if true, exclude events
     *   within reorgSafetyDepth of the chain head.
     * @returns {Array<object>}
     */
    getCanonicalEvents(options = {}) {
      const { withinSafetyDepth = false } = options;
      const headBlock = this.getHeadBlockNumber();

      return eventLog
        .filter((e) => !e.invalidated)
        .filter((e) => {
          // Verify event's block hash matches canonical
          const canonicalHash = canonicalHeads.get(e.blockNumber);
          return canonicalHash !== undefined && canonicalHash === e.blockHash;
        })
        .filter((e) => {
          if (!withinSafetyDepth || headBlock == null) return true;
          return (headBlock - e.blockNumber) >= reorgSafetyDepth;
        })
        .map((e) => ({ ...e }))
        .sort((a, b) => a.blockNumber - b.blockNumber || a.eventIndex - b.eventIndex);
    },

    /**
     * Return all events that were invalidated by reorg.
     *
     * @returns {Array<object>}
     */
    getReorgedEvents() {
      return reorgedEvents.map((e) => ({ ...e }));
    },

    /**
     * Return the reorg incident history.
     *
     * @returns {Array<object>}
     */
    getReorgHistory() {
      return reorgHistory.map((r) => ({ ...r }));
    },

    /**
     * Return the current canonical head block number, or null if empty.
     *
     * @returns {number|null}
     */
    getHeadBlockNumber() {
      if (canonicalHeads.size === 0) return null;
      let max = -1;
      for (const [bn] of canonicalHeads) {
        if (bn > max) max = bn;
      }
      return max;
    },

    /**
     * Return the block hash for a given canonical block number.
     *
     * @param {number} blockNumber
     * @returns {string|null}
     */
    getCanonicalHash(blockNumber) {
      return canonicalHeads.get(blockNumber) ?? null;
    },

    /**
     * Return log status summary.
     *
     * @returns {object}
     */
    getStatus() {
      const head = this.getHeadBlockNumber();
      const canonicalCount = eventLog.filter((e) => !e.invalidated).length;
      const invalidatedCount = eventLog.filter((e) => e.invalidated).length;

      return {
        ...SAFETY_ENVELOPE,
        headBlock: head,
        canonicalHeadsTracked: canonicalHeads.size,
        totalEventsIngested: eventLog.length,
        canonicalEvents: canonicalCount,
        invalidatedEvents: invalidatedCount,
        reorgedEventsPool: reorgedEvents.length,
        reorgIncidents: reorgHistory.length,
        reorgSafetyDepth,
      };
    },

    /**
     * Clear all state (events, heads, reorg history).
     */
    clear() {
      canonicalHeads.clear();
      eventLog.length = 0;
      reorgedEvents.length = 0;
      reorgHistory.length = 0;
    },
  };
}
