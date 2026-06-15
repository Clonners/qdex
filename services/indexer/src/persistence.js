import { readFile, writeFile, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SAFETY_ENVELOPE = Object.freeze({
  source: 'persistence-store',
  settlementMode: 'mock',
  realQuaiTransactions: false,
  walletRequired: false,
  fundsMoved: false,
  tradingVaultMutation: false,
  marketRegistryMutation: false,
  permissions: ['NO_WITHDRAW', 'NO_ADMIN'],
});

const ALLOWED_SETTLEMENT_MODES = Object.freeze({ mock: true });
const FILL_FILENAME = 'fills.json';
const TRADE_FILENAME = 'trades.json';
const PROOF_FILENAME = 'proofs.json';

const clone = (value) => JSON.parse(JSON.stringify(value));

const readJsonFile = async (filepath) => {
  try {
    const content = await readFile(filepath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
};

const writeJsonFile = async (filepath, data) => {
  await writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
};

export function createIndexerPersistence(dataDir) {
  const ensureDir = async () => {
    await mkdir(dataDir, { recursive: true });
  };

  const loadArray = async (filename) => {
    await ensureDir();
    return readJsonFile(join(dataDir, filename));
  };

  const saveArray = async (filename, data) => {
    await ensureDir();
    return writeJsonFile(join(dataDir, filename), data);
  };

  // In-memory cache for fast reads after load
  let fills = [];
  let trades = [];
  let proofs = [];
  let loaded = false;

  const loadFromDisk = async () => {
    await ensureDir();
    fills = await readJsonFile(join(dataDir, FILL_FILENAME));
    trades = await readJsonFile(join(dataDir, TRADE_FILENAME));
    proofs = await readJsonFile(join(dataDir, PROOF_FILENAME));
    loaded = true;
    return {
      fills: clone(fills),
      trades: clone(trades),
      proofs: clone(proofs),
      meta: clone(SAFETY_ENVELOPE),
    };
  };

  const ensureLoaded = async () => {
    if (!loaded) {
      await loadFromDisk();
    }
  };

  const rejectQuaiContract = (items, type) => {
    const safe = [];
    let rejected = 0;

    for (const item of items) {
      if (item.settlementMode === 'quai_contract') {
        rejected += 1;
      } else {
        safe.push(item);
      }
    }

    return { safe, rejected, type };
  };

  return {
    async load() {
      return loadFromDisk();
    },

    async saveFills(newFills) {
      await ensureLoaded();
      const result = rejectQuaiContract(newFills, 'fills');

      if (result.rejected > 0) {
        return { saved: 0, rejected: result.rejected };
      }

      // Merge: replace fills with matching fillId, append new ones
      for (const fill of result.safe) {
        const idx = fills.findIndex((f) => f.fillId === fill.fillId);
        if (idx >= 0) {
          fills[idx] = fill;
        } else {
          fills.push(fill);
        }
      }

      await writeJsonFile(join(dataDir, FILL_FILENAME), fills);
      return { saved: result.safe.length, rejected: 0 };
    },

    async saveTrades(newTrades) {
      await ensureLoaded();
      const result = rejectQuaiContract(newTrades, 'trades');

      if (result.rejected > 0) {
        return { saved: 0, rejected: result.rejected };
      }

      for (const trade of result.safe) {
        const idx = trades.findIndex((t) => t.tradeId === trade.tradeId);
        if (idx >= 0) {
          trades[idx] = trade;
        } else {
          trades.push(trade);
        }
      }

      await writeJsonFile(join(dataDir, TRADE_FILENAME), trades);
      return { saved: result.safe.length, rejected: 0 };
    },

    async saveProofs(newProofEntries) {
      await ensureLoaded();
      // newProofEntries is [{ tradeId, proof }]
      const rejected = newProofEntries.filter(
        (entry) => entry.proof.settlementMode === 'quai_contract',
      ).length;

      if (rejected > 0) {
        return { saved: 0, rejected };
      }

      for (const entry of newProofEntries) {
        const idx = proofs.findIndex((p) => p.tradeId === entry.tradeId);
        if (idx >= 0) {
          proofs[idx] = entry.proof;
        } else {
          proofs.push(entry.proof);
        }
      }

      await writeJsonFile(join(dataDir, PROOF_FILENAME), proofs);
      return { saved: newProofEntries.length, rejected: 0 };
    },

    getFill(fillId) {
      const found = fills.find((f) => f.fillId === fillId);
      return found ? clone(found) : null;
    },

    getTrade(tradeId) {
      const found = trades.find((t) => t.tradeId === tradeId);
      return found ? clone(found) : null;
    },

    getProof(tradeId) {
      const found = proofs.find((p) => p.tradeId === tradeId);
      return found ? clone(found) : null;
    },

    listFills() {
      return clone(fills);
    },

    listTrades(marketId) {
      if (marketId) {
        return clone(trades.filter((t) => t.marketId === marketId));
      }
      return clone(trades);
    },

    listProofs() {
      return clone(proofs);
    },

    count() {
      return {
        fills: fills.length,
        trades: trades.length,
        proofs: proofs.length,
      };
    },

    async clear() {
      await ensureDir();
      fills = [];
      trades = [];
      proofs = [];
      await writeJsonFile(join(dataDir, FILL_FILENAME), []);
      await writeJsonFile(join(dataDir, TRADE_FILENAME), []);
      await writeJsonFile(join(dataDir, PROOF_FILENAME), []);
    },
  };
}
