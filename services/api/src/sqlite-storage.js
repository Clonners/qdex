/**
 * SQLite persistent storage for QDEX
 * 
 * Stores: orders, fills, trades, proofs, vault balances, deposits, withdrawals
 * Zero-config, single file, ACID transactions.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'qdex.db');

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

export function createSqliteStorage({ path: dbPath = DB_PATH } = {}) {
  ensureDir();
  
  const db = new Database(dbPath, {
    verbose: (msg) => console.log('[sqlite]', msg),
  });

  // WAL mode for better concurrent reads
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  db.exec(`
    -- Orders
    CREATE TABLE IF NOT EXISTS orders (
      orderHash TEXT PRIMARY KEY,
      marketId TEXT NOT NULL,
      side TEXT NOT NULL,
      type TEXT NOT NULL,
      baseToken TEXT NOT NULL,
      quoteToken TEXT NOT NULL,
      amount TEXT NOT NULL,
      remainingAmount TEXT NOT NULL,
      price TEXT NOT NULL,
      timeInForce TEXT DEFAULT 'GTC',
      maxSlippageBps INTEGER DEFAULT 0,
      owner TEXT NOT NULL,
      delegate TEXT NOT NULL,
      nonce TEXT NOT NULL,
      expiresAt INTEGER,
      chainId INTEGER DEFAULT 15000,
      settlementContract TEXT,
      clientOrderId TEXT,
      status TEXT DEFAULT 'open',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    -- Fills
    CREATE TABLE IF NOT EXISTS fills (
      fillId TEXT PRIMARY KEY,
      tradeId TEXT NOT NULL,
      marketId TEXT NOT NULL,
      makerOrderHash TEXT,
      takerOrderHash TEXT,
      makerAddress TEXT,
      takerAddress TEXT,
      side TEXT NOT NULL,
      price TEXT NOT NULL,
      amount TEXT NOT NULL,
      quoteAmount TEXT NOT NULL,
      fee TEXT DEFAULT '0',
      settlementMode TEXT DEFAULT 'mock',
      settlementStatus TEXT DEFAULT 'pending',
      settlementTx TEXT,
      blockNumber INTEGER,
      blockHash TEXT,
      mockSettlementReference TEXT,
      createdAt INTEGER NOT NULL
    );

    -- Trades
    CREATE TABLE IF NOT EXISTS trades (
      tradeId TEXT PRIMARY KEY,
      marketId TEXT NOT NULL,
      fillId TEXT NOT NULL,
      makerAddress TEXT,
      takerAddress TEXT,
      side TEXT NOT NULL,
      price TEXT NOT NULL,
      amount TEXT NOT NULL,
      quoteAmount TEXT NOT NULL,
      settlementMode TEXT DEFAULT 'mock',
      settlementTx TEXT,
      blockNumber INTEGER,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (fillId) REFERENCES fills(fillId)
    );

    -- Proofs
    CREATE TABLE IF NOT EXISTS proofs (
      tradeId TEXT PRIMARY KEY,
      marketId TEXT NOT NULL,
      fillId TEXT NOT NULL,
      makerAddress TEXT,
      takerAddress TEXT,
      side TEXT NOT NULL,
      price TEXT NOT NULL,
      amount TEXT NOT NULL,
      quoteAmount TEXT NOT NULL,
      settlementMode TEXT,
      settlementTx TEXT,
      blockNumber INTEGER,
      blockHash TEXT,
      proofJson TEXT,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (tradeId) REFERENCES trades(tradeId)
    );

    -- Vault balances
    CREATE TABLE IF NOT EXISTS vault_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL,
      token TEXT NOT NULL,
      total TEXT DEFAULT '0',
      available TEXT DEFAULT '0',
      locked TEXT DEFAULT '0',
      updatedAt INTEGER NOT NULL,
      UNIQUE(owner, token)
    );

    -- Deposits
    CREATE TABLE IF NOT EXISTS deposits (
      vaultSequence TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      token TEXT NOT NULL,
      amount TEXT NOT NULL,
      settlementTx TEXT,
      blockNumber INTEGER,
      blockHash TEXT,
      settlementMode TEXT DEFAULT 'mock',
      createdAt INTEGER NOT NULL
    );

    -- Withdrawals
    CREATE TABLE IF NOT EXISTS withdrawals (
      vaultSequence TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      token TEXT NOT NULL,
      amount TEXT NOT NULL,
      toAddress TEXT,
      settlementTx TEXT,
      blockNumber INTEGER,
      blockHash TEXT,
      settlementMode TEXT DEFAULT 'mock',
      createdAt INTEGER NOT NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_orders_marketId ON orders(marketId, status);
    CREATE INDEX IF NOT EXISTS idx_orders_owner ON orders(owner, status);
    CREATE INDEX IF NOT EXISTS idx_fills_tradeId ON fills(tradeId);
    CREATE INDEX IF NOT EXISTS idx_fills_marketId ON fills(marketId);
    CREATE INDEX IF NOT EXISTS idx_trades_marketId ON trades(marketId);
    CREATE INDEX IF NOT EXISTS idx_vault_balances_owner ON vault_balances(owner);
    CREATE INDEX IF NOT EXISTS idx_deposits_owner ON deposits(owner);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_owner ON withdrawals(owner);
  `);

  // Prepared statements for performance
  const stmts = {
    insertOrder: db.prepare(`
      INSERT OR REPLACE INTO orders (
        orderHash, marketId, side, type, baseToken, quoteToken,
        amount, remainingAmount, price, timeInForce, maxSlippageBps,
        owner, delegate, nonce, expiresAt, chainId, settlementContract,
        clientOrderId, status, createdAt, updatedAt
      ) VALUES (@orderHash, @marketId, @side, @type, @baseToken, @quoteToken,
        @amount, @remainingAmount, @price, @timeInForce, @maxSlippageBps,
        @owner, @delegate, @nonce, @expiresAt, @chainId, @settlementContract,
        @clientOrderId, @status, @createdAt, @updatedAt)
    `),

    updateOrderStatus: db.prepare(`
      UPDATE orders SET status = @status, updatedAt = @updatedAt WHERE orderHash = @orderHash
    `),

    getOpenOrders: db.prepare(`
      SELECT * FROM orders WHERE status = 'open' ORDER BY createdAt DESC
    `),

    getOrdersByMarket: db.prepare(`
      SELECT * FROM orders WHERE marketId = ? AND status = 'open' ORDER BY createdAt DESC
    `),

    insertFill: db.prepare(`
      INSERT OR REPLACE INTO fills (
        fillId, tradeId, marketId, makerOrderHash, takerOrderHash,
        makerAddress, takerAddress, side, price, amount, quoteAmount,
        fee, settlementMode, settlementStatus, settlementTx, blockNumber,
        blockHash, mockSettlementReference, createdAt
      ) VALUES (@fillId, @tradeId, @marketId, @makerOrderHash, @takerOrderHash,
        @makerAddress, @takerAddress, @side, @price, @amount, @quoteAmount,
        @fee, @settlementMode, @settlementStatus, @settlementTx, @blockNumber,
        @blockHash, @mockSettlementReference, @createdAt)
    `),

    insertTrade: db.prepare(`
      INSERT OR REPLACE INTO trades (
        tradeId, marketId, fillId, makerAddress, takerAddress,
        side, price, amount, quoteAmount, settlementMode,
        settlementTx, blockNumber, createdAt
      ) VALUES (@tradeId, @marketId, @fillId, @makerAddress, @takerAddress,
        @side, @price, @amount, @quoteAmount, @settlementMode,
        @settlementTx, @blockNumber, @createdAt)
    `),

    insertProof: db.prepare(`
      INSERT OR REPLACE INTO proofs (
        tradeId, marketId, fillId, makerAddress, takerAddress,
        side, price, amount, quoteAmount, settlementMode,
        settlementTx, blockNumber, blockHash, proofJson, createdAt
      ) VALUES (@tradeId, @marketId, @fillId, @makerAddress, @takerAddress,
        @side, @price, @amount, @quoteAmount, @settlementMode,
        @settlementTx, @blockNumber, @blockHash, @proofJson, @createdAt)
    `),

    updateVaultBalance: db.prepare(`
      INSERT INTO vault_balances (owner, token, total, available, locked, updatedAt)
      VALUES (@owner, @token, @total, @available, @locked, @updatedAt)
      ON CONFLICT(owner, token) DO UPDATE SET
        total = @total, available = @available, locked = @locked, updatedAt = @updatedAt
    `),

    getVaultBalance: db.prepare(`
      SELECT * FROM vault_balances WHERE owner = ? AND token = ?
    `),

    getVaultBalancesByOwner: db.prepare(`
      SELECT * FROM vault_balances WHERE owner = ?
    `),

    insertDeposit: db.prepare(`
      INSERT OR REPLACE INTO deposits (
        vaultSequence, owner, token, amount, settlementTx,
        blockNumber, blockHash, settlementMode, createdAt
      ) VALUES (@vaultSequence, @owner, @token, @amount, @settlementTx,
        @blockNumber, @blockHash, @settlementMode, @createdAt)
    `),

    getDepositsByOwner: db.prepare(`
      SELECT * FROM deposits WHERE owner = ? ORDER BY createdAt DESC
    `),

    insertWithdrawal: db.prepare(`
      INSERT OR REPLACE INTO withdrawals (
        vaultSequence, owner, token, amount, toAddress, settlementTx,
        blockNumber, blockHash, settlementMode, createdAt
      ) VALUES (@vaultSequence, @owner, @token, @amount, @toAddress, @settlementTx,
        @blockNumber, @blockHash, @settlementMode, @createdAt)
    `),

    getWithdrawalsByOwner: db.prepare(`
      SELECT * FROM withdrawals WHERE owner = ? ORDER BY createdAt DESC
    `),

    getFillsByMarket: db.prepare(`
      SELECT * FROM fills WHERE marketId = ? ORDER BY createdAt DESC LIMIT 100
    `),

    getAllFills: db.prepare(`
      SELECT * FROM fills ORDER BY createdAt DESC
    `),

    getTradesByMarket: db.prepare(`
      SELECT * FROM trades WHERE marketId = ? ORDER BY createdAt DESC LIMIT 100
    `),

    getAllProofs: db.prepare(`
      SELECT * FROM proofs ORDER BY createdAt DESC LIMIT 200
    `),

    getProofByTradeId: db.prepare(`
      SELECT * FROM proofs WHERE tradeId = ?
    `),

    getStats: db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM orders WHERE status = 'open') as openOrders,
        (SELECT COUNT(*) FROM fills) as totalFills,
        (SELECT COUNT(*) FROM trades) as totalTrades,
        (SELECT COUNT(*) FROM proofs) as totalProofs,
        (SELECT COUNT(*) FROM deposits) as totalDeposits,
        (SELECT COUNT(*) FROM withdrawals) as totalWithdrawals
    `),
  };

  return {
    db,
    stmts,

    // Orders
    saveOrder(order) {
      const now = Date.now();
      return stmts.insertOrder.run({
        ...order,
        createdAt: now,
        updatedAt: now,
      });
    },

    updateOrderStatus(orderHash, status) {
      return stmts.updateOrderStatus.run({ orderHash, status, updatedAt: Date.now() });
    },

    getOpenOrders() {
      return stmts.getOpenOrders.all();
    },

    getOrdersByMarket(marketId) {
      return stmts.getOrdersByMarket.all(marketId);
    },

    // Fills
    saveFill(fill) {
      return stmts.insertFill.run(fill);
    },

    getFillsByMarket(marketId) {
      return stmts.getFillsByMarket.all(marketId);
    },

    getAllFills() {
      return stmts.getAllFills.all();
    },

    // Trades
    saveTrade(trade) {
      return stmts.insertTrade.run(trade);
    },

    getTradesByMarket(marketId) {
      return stmts.getTradesByMarket.all(marketId);
    },

    // Proofs
    saveProof(proof) {
      const proofJson = typeof proof.proof === 'string' ? proof.proof : JSON.stringify(proof.proof || proof);
      return stmts.insertProof.run({
        ...proof,
        proofJson,
      });
    },

    getAllProofs() {
      return stmts.getAllProofs.all().map(row => ({
        ...row,
        proof: row.proofJson ? JSON.parse(row.proofJson) : null,
      }));
    },

    getProofByTradeId(tradeId) {
      const row = stmts.getProofByTradeId.get(tradeId);
      if (!row) return null;
      return {
        ...row,
        proof: row.proofJson ? JSON.parse(row.proofJson) : null,
      };
    },

    // Vault balances
    updateVaultBalance({ owner, token, total, available, locked }) {
      return stmts.updateVaultBalance.run({
        owner, token, total, available, locked,
        updatedAt: Date.now(),
      });
    },

    getVaultBalance(owner, token) {
      return stmts.getVaultBalance.get(owner, token) || null;
    },

    getVaultBalancesByOwner(owner) {
      return stmts.getVaultBalancesByOwner.all(owner);
    },

    // Deposits
    saveDeposit(deposit) {
      return stmts.insertDeposit.run(deposit);
    },

    getDepositsByOwner(owner) {
      return stmts.getDepositsByOwner.all(owner);
    },

    // Withdrawals
    saveWithdrawal(withdrawal) {
      return stmts.insertWithdrawal.run(withdrawal);
    },

    getWithdrawalsByOwner(owner) {
      return stmts.getWithdrawalsByOwner.all(owner);
    },

    // Stats
    getStats() {
      return stmts.getStats.get();
    },

    // Close database
    close() {
      db.close();
    },

    // Reset (for testing)
    reset() {
      db.exec(`
        DROP TABLE IF EXISTS orders;
        DROP TABLE IF EXISTS fills;
        DROP TABLE IF EXISTS trades;
        DROP TABLE IF EXISTS proofs;
        DROP TABLE IF EXISTS vault_balances;
        DROP TABLE IF EXISTS deposits;
        DROP TABLE IF EXISTS withdrawals;
      `);
      // Reinitialize
      db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
          orderHash TEXT PRIMARY KEY, marketId TEXT NOT NULL, side TEXT NOT NULL,
          type TEXT NOT NULL, baseToken TEXT NOT NULL, quoteToken TEXT NOT NULL,
          amount TEXT NOT NULL, remainingAmount TEXT NOT NULL, price TEXT NOT NULL,
          timeInForce TEXT DEFAULT 'GTC', maxSlippageBps INTEGER DEFAULT 0,
          owner TEXT NOT NULL, delegate TEXT NOT NULL, nonce TEXT NOT NULL,
          expiresAt INTEGER, chainId INTEGER DEFAULT 15000,
          settlementContract TEXT, clientOrderId TEXT, status TEXT DEFAULT 'open',
          createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS fills (
          fillId TEXT PRIMARY KEY, tradeId TEXT NOT NULL, marketId TEXT NOT NULL,
          makerOrderHash TEXT, takerOrderHash TEXT, makerAddress TEXT,
          takerAddress TEXT, side TEXT NOT NULL, price TEXT NOT NULL,
          amount TEXT NOT NULL, quoteAmount TEXT NOT NULL, fee TEXT DEFAULT '0',
          settlementMode TEXT DEFAULT 'mock', settlementStatus TEXT DEFAULT 'pending',
          settlementTx TEXT, blockNumber INTEGER, blockHash TEXT,
          mockSettlementReference TEXT, createdAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS trades (
          tradeId TEXT PRIMARY KEY, marketId TEXT NOT NULL, fillId TEXT NOT NULL,
          makerAddress TEXT, takerAddress TEXT, side TEXT NOT NULL,
          price TEXT NOT NULL, amount TEXT NOT NULL, quoteAmount TEXT NOT NULL,
          settlementMode TEXT DEFAULT 'mock', settlementTx TEXT,
          blockNumber INTEGER, createdAt INTEGER NOT NULL,
          FOREIGN KEY (fillId) REFERENCES fills(fillId)
        );
        CREATE TABLE IF NOT EXISTS proofs (
          tradeId TEXT PRIMARY KEY, marketId TEXT NOT NULL, fillId TEXT NOT NULL,
          makerAddress TEXT, takerAddress TEXT, side TEXT NOT NULL,
          price TEXT NOT NULL, amount TEXT NOT NULL, quoteAmount TEXT NOT NULL,
          settlementMode TEXT, settlementTx TEXT, blockNumber INTEGER,
          blockHash TEXT, proofJson TEXT, createdAt INTEGER NOT NULL,
          FOREIGN KEY (tradeId) REFERENCES trades(tradeId)
        );
        CREATE TABLE IF NOT EXISTS vault_balances (
          id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL,
          token TEXT NOT NULL, total TEXT DEFAULT '0', available TEXT DEFAULT '0',
          locked TEXT DEFAULT '0', updatedAt INTEGER NOT NULL,
          UNIQUE(owner, token)
        );
        CREATE TABLE IF NOT EXISTS deposits (
          vaultSequence TEXT PRIMARY KEY, owner TEXT NOT NULL, token TEXT NOT NULL,
          amount TEXT NOT NULL, settlementTx TEXT, blockNumber INTEGER,
          blockHash TEXT, settlementMode TEXT DEFAULT 'mock', createdAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS withdrawals (
          vaultSequence TEXT PRIMARY KEY, owner TEXT NOT NULL, token TEXT NOT NULL,
          amount TEXT NOT NULL, toAddress TEXT, settlementTx TEXT, blockNumber INTEGER,
          blockHash TEXT, settlementMode TEXT DEFAULT 'mock', createdAt INTEGER NOT NULL
        );
      `);
    },
  };
}
