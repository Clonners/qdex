/**
 * Real Event Indexer
 *
 * Reads Settlement and TradingVault events from Quai chain
 * to provide live trade history and balance updates.
 *
 * Uses eth_getLogs to query recent events with correct keccak256 topic hashes.
 */

import { keccak256, toUtf8Bytes } from 'quais';
import { rpcCall, CONTRACTS } from './real-network-adapter.js';

// ──────────────────────────────────────────────
// Event topic hashes (computed via keccak256)
// ──────────────────────────────────────────────

/**
 * TradeSettled event from Settlement contract.
 *
 * Signature: TradeSettled(bytes32 indexed,bytes32 indexed,bytes32 indexed,bytes32,address,address,uint256,uint256,uint256,uint256,uint256,address)
 *
 * Indexed topics (topics[1..3]): tradeId, fillId, marketId
 * Non-indexed data: makerOrderHash, takerOrderHash, maker, taker,
 *   price, baseAmount, quoteAmount, makerFee, takerFee, feeRecipient
 */
const TRADE_SETTLED_SIGNATURE =
  'TradeSettled(bytes32 indexed,bytes32 indexed,bytes32 indexed,bytes32,address,address,uint256,uint256,uint256,uint256,uint256,address)';
const TRADE_SETTLED_TOPIC = keccak256(toUtf8Bytes(TRADE_SETTLED_SIGNATURE));

/**
 * ERC20 Transfer event (used for both Deposit and Withdraw detection).
 *
 * Signature: Transfer(address indexed from,address indexed to,uint256)
 *
 * Deposits: from=0x0...0 (or user), to=TradingVault
 * Withdrawals: from=TradingVault, to=user (or 0x0...0)
 */
const TRANSFER_SIGNATURE = 'Transfer(address indexed,address indexed,uint256)';
const TRANSFER_TOPIC = keccak256(toUtf8Bytes(TRANSFER_SIGNATURE));
// Standard ERC20 Transfer topic (well-known constant):
// 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef

// Settlement contract address
const SETTLEMENT_ADDRESS = CONTRACTS.Settlement;
const TRADING_VAULT_ADDRESS = CONTRACTS.TradingVault;

/**
 * Helper: extract a 20-byte address from a hex string starting at `offset`.
 * Address = 20 bytes = 40 hex chars = 80 nibbles starting from slice position 2.
 */
const extractAddress = (hex, offset) => '0x' + hex.slice(offset, offset + 40);

/**
 * Helper: extract a uint256 (32 bytes) from hex data starting at offset.
 */
const extractUint256 = (hex, offset) => {
  const slice = hex.slice(offset, offset + 64);
  return BigInt('0x' + slice).toString();
};

/**
 * Helper: extract a bytes32 (32 bytes) from hex data starting at offset.
 */
const extractBytes32 = (hex, offset) => '0x' + hex.slice(offset, offset + 64);

/**
 * Parse TradeSettled event data (non-indexed portion).
 *
 * Data layout (each 32 bytes = 64 hex chars):
 *   [0..64)  : makerOrderHash   (bytes32)
 *   [64..128) : takerOrderHash   (bytes32)
 *   [128..168]: maker            (address, right-padded to 32 bytes)
 *   [168..208]: taker            (address, right-padded to 32 bytes)
 *   [208..272]: price            (uint256)
 *   [272..336]: baseAmount       (uint256)
 *   [336..400]: quoteAmount      (uint256)
 *   [400..464]: makerFee         (uint256)
 *   [464..528]: takerFee         (uint256)
 *   [528..568]: feeRecipient     (address, right-padded to 32 bytes)
 *
 * Note: topics[0] = event signature hash
 *       topics[1] = tradeId (indexed bytes32)
 *       topics[2] = fillId  (indexed bytes32)
 *       topics[3] = marketId (indexed bytes32)
 *       topics[4] = makerOrderHash (indexed bytes32, if 4+ indexed params)
 */
function parseTradeSettledData(data) {
  // Strip '0x' prefix for indexing
  const hex = data.startsWith('0x') ? data.slice(2) : data;
  return {
    makerOrderHash: extractBytes32(hex, 0),
    takerOrderHash: extractBytes32(hex, 64),
    // Addresses in Solidity are right-aligned in 32-byte slots;
    // extract the last 40 chars (20 bytes) of the slot
    maker: '0x' + hex.slice(128, 168),
    taker: '0x' + hex.slice(168, 208),
    price: extractUint256(hex, 208),
    baseAmount: extractUint256(hex, 272),
    quoteAmount: extractUint256(hex, 336),
    makerFee: extractUint256(hex, 400),
    takerFee: extractUint256(hex, 464),
    feeRecipient: '0x' + hex.slice(528, 568),
  };
}

/**
 * Get recent TradeSettled events from the Settlement contract.
 */
async function getTradeSettledEvents(limit = 50) {
  const latestBlock = await rpcCall('eth_blockNumber');
  if (!latestBlock) {
    return [];
  }

  const blockNum = parseInt(latestBlock, 16);
  const fromBlock = Math.max(0, blockNum - 2000); // Look back 2000 blocks

  try {
    const logs = await rpcCall('eth_getLogs', [{
      address: SETTLEMENT_ADDRESS,
      topics: [TRADE_SETTLED_TOPIC],
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: 'latest',
    }]);

    if (!logs || !Array.isArray(logs)) {
      return [];
    }

    const events = [];
    for (const log of logs.slice(0, limit)) {
      const data = parseTradeSettledData(log.data || '0x');

      events.push({
        tradeId: log.topics[1] || '0x',
        fillId: log.topics[2] || '0x',
        marketId: log.topics[3] || '0x',
        ...data,
        blockNumber: parseInt(log.blockNumber, 16),
        transactionHash: log.transactionHash,
        logIndex: parseInt(log.logIndex, 16),
        source: 'real-event-indexer',
      });
    }

    return events;
  } catch (error) {
    console.error('[Indexer] Failed to get TradeSettled events:', error.message);
    return [];
  }
}

/**
 * Get recent Deposit events from TradingVault.
 *
 * Deposits are ERC20 Transfer events where `to == TradingVault`.
 */
async function getDepositEvents(limit = 50) {
  const latestBlock = await rpcCall('eth_blockNumber');
  if (!latestBlock) {
    return [];
  }

  const blockNum = parseInt(latestBlock, 16);
  const fromBlock = Math.max(0, blockNum - 2000);

  try {
    // Filter: topic[0] = Transfer, topic[2] = TradingVault (indexed `to`)
    const vaultPadded = '0x' + TRADING_VAULT_ADDRESS.toLowerCase().slice(2).padStart(64, '0');

    const logs = await rpcCall('eth_getLogs', [{
      address: TRADING_VAULT_ADDRESS,
      topics: [
        TRANSFER_TOPIC,          // topic[0]: Transfer signature
        null,                    // topic[1]: from (any)
        vaultPadded,             // topic[2]: to == TradingVault
      ],
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: 'latest',
    }]);

    if (!logs || !Array.isArray(logs)) {
      return [];
    }

    const events = [];
    for (const log of logs.slice(0, limit)) {
      const hex = (log.data || '0x').startsWith('0x') ? (log.data || '0x').slice(2) : (log.data || '');
      const user = '0x' + (log.topics[1] || '').slice(26); // from address (last 20 bytes)

      events.push({
        type: 'Deposit',
        user,
        token: null, // ERC20 Transfer doesn't include token in topics; caller may enrich
        amount: extractUint256(hex, 0),
        blockNumber: parseInt(log.blockNumber, 16),
        transactionHash: log.transactionHash,
        logIndex: parseInt(log.logIndex, 16),
        source: 'real-event-indexer',
      });
    }

    return events;
  } catch (error) {
    console.error('[Indexer] Failed to get Deposit events:', error.message);
    return [];
  }
}

/**
 * Get recent Withdrawal events from TradingVault.
 *
 * Withdrawals are ERC20 Transfer events where `from == TradingVault`.
 */
async function getWithdrawEvents(limit = 50) {
  const latestBlock = await rpcCall('eth_blockNumber');
  if (!latestBlock) {
    return [];
  }

  const blockNum = parseInt(latestBlock, 16);
  const fromBlock = Math.max(0, blockNum - 2000);

  try {
    // Filter: topic[0] = Transfer, topic[1] = TradingVault (indexed `from`)
    const vaultPadded = '0x' + TRADING_VAULT_ADDRESS.toLowerCase().slice(2).padStart(64, '0');

    const logs = await rpcCall('eth_getLogs', [{
      address: TRADING_VAULT_ADDRESS,
      topics: [
        TRANSFER_TOPIC,          // topic[0]: Transfer signature
        vaultPadded,             // topic[1]: from == TradingVault
        null,                    // topic[2]: to (any recipient)
      ],
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: 'latest',
    }]);

    if (!logs || !Array.isArray(logs)) {
      return [];
    }

    const events = [];
    for (const log of logs.slice(0, limit)) {
      const hex = (log.data || '0x').startsWith('0x') ? (log.data || '0x').slice(2) : (log.data || '');
      const user = '0x' + (log.topics[2] || '').slice(26); // to address (last 20 bytes)

      events.push({
        type: 'Withdraw',
        user,
        token: null, // ERC20 Transfer doesn't include token in topics; caller may enrich
        amount: extractUint256(hex, 0),
        blockNumber: parseInt(log.blockNumber, 16),
        transactionHash: log.transactionHash,
        logIndex: parseInt(log.logIndex, 16),
        source: 'real-event-indexer',
      });
    }

    return events;
  } catch (error) {
    console.error('[Indexer] Failed to get Withdraw events:', error.message);
    return [];
  }
}

export {
  getTradeSettledEvents,
  getDepositEvents,
  getWithdrawEvents,
  SETTLEMENT_ADDRESS,
  TRADING_VAULT_ADDRESS,
  TRADE_SETTLED_TOPIC,
  TRANSFER_TOPIC,
};
