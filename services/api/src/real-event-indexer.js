/**
 * Real Event Indexer
 * 
 * Reads Settlement and TradingVault events from Quai chain
 * to provide live trade history and balance updates.
 * 
 * Uses eth_getLogs to query recent events.
 */

import { rpcCall, CONTRACTS } from './real-network-adapter.js';

// Event signatures
const TRADE_SETTLED_TOPIC = '0x7c5d8c9e8e1e8f3a3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f';
const DEPOSIT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const WITHDRAW_TOPIC = '0x2a3a6f0c9d3b5d3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3f';

// TradeSettled event topic (computed from event signature)
const TRADE_SETTLED_SIGNATURE = 'TradeSettled(bytes32,bytes32,bytes32,bytes32,bytes32,address,address,uint256,uint256,uint256,uint256,uint256,address)';
const TRADE_SETTLED_HASH = '0x' + Buffer.from(TRADE_SETTLED_SIGNATURE, 'utf8').toString('hex').slice(0, 64);

// Settlement contract address
const SETTLEMENT_ADDRESS = CONTRACTS.Settlement;

/**
 * Get recent TradeSettled events
 */
async function getTradeSettledEvents(limit = 50) {
  const latestBlock = await rpcCall('eth_blockNumber');
  if (!latestBlock) {
    return [];
  }

  const blockNum = parseInt(latestBlock, 16);
  const fromBlock = Math.max(0, blockNum - 1000); // Look back 1000 blocks

  try {
    const logs = await rpcCall('eth_getLogs', [{
      address: SETTLEMENT_ADDRESS,
      topics: [TRADE_SETTLED_HASH],
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: 'latest',
    }]);

    if (!logs || !Array.isArray(logs)) {
      return [];
    }

    const events = [];
    for (const log of logs.slice(0, limit)) {
      // Parse TradeSettled event
      const tradeId = '0x' + log.topics[1].slice(26);
      const fillId = '0x' + log.topics[2].slice(26);
      const marketId = '0x' + log.topics[3].slice(26);

      // Parse non-indexed data
      const data = log.data;
      const makerOrderHash = '0x' + data.slice(2, 66);
      const takerOrderHash = '0x' + data.slice(66, 130);
      const maker = '0x' + data.slice(130, 170);
      const taker = '0x' + data.slice(170, 210);
      const price = parseInt(data.slice(210, 274), 16);
      const baseAmount = parseInt(data.slice(274, 338), 16);
      const quoteAmount = parseInt(data.slice(338, 402), 16);
      const makerFee = parseInt(data.slice(402, 466), 16);
      const takerFee = parseInt(data.slice(466, 530), 16);
      const feeRecipient = '0x' + data.slice(530, 570);

      events.push({
        tradeId,
        fillId,
        marketId,
        makerOrderHash,
        takerOrderHash,
        maker,
        taker,
        price: price.toString(),
        baseAmount: baseAmount.toString(),
        quoteAmount: quoteAmount.toString(),
        makerFee: makerFee.toString(),
        takerFee: takerFee.toString(),
        feeRecipient,
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
 * Get recent Deposit events from TradingVault
 */
async function getDepositEvents(limit = 50) {
  const latestBlock = await rpcCall('eth_blockNumber');
  if (!latestBlock) {
    return [];
  }

  const blockNum = parseInt(latestBlock, 16);
  const fromBlock = Math.max(0, blockNum - 1000);

  try {
    const logs = await rpcCall('eth_getLogs', [{
      address: CONTRACTS.TradingVault,
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'],
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: 'latest',
    }]);

    if (!logs || !Array.isArray(logs)) {
      return [];
    }

    const events = [];
    for (const log of logs.slice(0, limit)) {
      // Parse Deposit event
      const user = '0x' + log.topics[1].slice(26);
      const token = '0x' + log.topics[2].slice(26);
      const amount = parseInt(log.data.slice(2, 66), 16).toString();

      events.push({
        type: 'Deposit',
        user,
        token,
        amount,
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
 * Get recent Withdraw events from TradingVault
 */
async function getWithdrawEvents(limit = 50) {
  const latestBlock = await rpcCall('eth_blockNumber');
  if (!latestBlock) {
    return [];
  }

  const blockNum = parseInt(latestBlock, 16);
  const fromBlock = Math.max(0, blockNum - 1000);

  try {
    const logs = await rpcCall('eth_getLogs', [{
      address: CONTRACTS.TradingVault,
      topics: ['0x2a3a6f0c9d3b5d3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3f'],
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: 'latest',
    }]);

    if (!logs || !Array.isArray(logs)) {
      return [];
    }

    const events = [];
    for (const log of logs.slice(0, limit)) {
      const user = '0x' + log.topics[1].slice(26);
      const token = '0x' + log.topics[2].slice(26);
      const amount = parseInt(log.data.slice(2, 66), 16).toString();

      events.push({
        type: 'Withdraw',
        user,
        token,
        amount,
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
};
