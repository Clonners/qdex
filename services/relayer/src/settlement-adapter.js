/**
 * Settlement adapter — connects relayer to on-chain Settlement contract.
 *
 * Uses quais SDK exclusively (NEVER ethers.js for Quai operations).
 * Handles: settle() calls, market registration, receipt polling, event extraction.
 *
 * @module settlement-adapter
 */
import { Wallet, JsonRpcProvider, Contract, formatMixedCaseChecksumAddress, parseQuai } from 'quais';

// Settlement contract ABI (interface subset for settlement operations)
const SETTLEMENT_ABI = [
  'function settle(tuple(bytes32 fillId,bytes32 marketId,bytes32 makerOrderHash,bytes32 takerOrderHash,address maker,address taker,address baseToken,address quoteToken,uint256 price,uint256 baseAmount,uint256 quoteAmount,uint256 makerFee,uint256 takerFee,uint256 makerNonce,uint256 takerNonce,uint256 expiresAt,uint256 chainId,address settlementContract,address feeRecipient,uint256 maxFeeBps,uint256 makerOrderAmount,uint256 takerOrderAmount,uint256 makerFilledAmount,uint256 takerFilledAmount) calldata fill, bytes calldata makerSignature, bytes calldata takerSignature) external',
  'event TradeSettled(bytes32 indexed tradeId,bytes32 indexed fillId,bytes32 indexed marketId,bytes32 makerOrderHash,bytes32 takerOrderHash,address maker,address taker,uint256 price,uint256 baseAmount,uint256 quoteAmount,uint256 makerFee,uint256 takerFee,address feeRecipient)',
  'function isAddressInternal(address) view returns (bool)',
  'function vault() view returns (address)',
  'function marketRegistry() view returns (address)',
  'function nonceManager() view returns (address)',
  'function feeManager() view returns (address)',
  'function delegateKeyRegistry() view returns (address)',
];

// MarketRegistry ABI
const MARKET_REGISTRY_ABI = [
  'function addMarket(address base,address quote,uint8 pricePrecision,uint8 amountPrecision,uint256 minAmount) returns (bytes32)',
  'function marketInfo(bytes32 marketId) view returns (tuple(address base,address quote,uint8 pricePrecision,uint8 amountPrecision,uint256 minAmount,bool enabled))',
  'function getMarketCount() view returns (uint256)',
];

// Default Orchard testnet config
const DEFAULT_RPC = 'https://orchard.rpc.quai.network/cyprus1';

/**
 * Create a settlement adapter instance.
 *
 * @param {Object} config
 * @param {string} config.rpcUrl - RPC endpoint (default: Orchard testnet)
 * @param {string} config.privateKey - Deployer/trader private key
 * @param {string} config.settlementAddress - Settlement contract address
 * @param {string} config.marketRegistryAddress - MarketRegistry address
 * @param {Object} config.receiptWait - Receipt polling settings
 * @param {number} config.receiptWait.maxWaitMs - Max wait for receipt (ms)
 * @param {number} config.receiptWait.pollingIntervalMs - Poll interval (ms)
 * @returns {Object} Settlement adapter with settle(), registerMarket(), getMarketInfo()
 */
export function createSettlementAdapter(config = {}) {
  const {
    rpcUrl = DEFAULT_RPC,
    privateKey,
    settlementAddress,
    marketRegistryAddress,
    receiptWait = { maxWaitMs: 60_000, pollingIntervalMs: 2_000 },
  } = config;

  let provider, wallet, settlementContract, marketRegistryContract;
  let initialized = false;

  /**
   * Initialize the adapter — connects to RPC and loads contracts.
   */
  async function init() {
    if (initialized) return;

    provider = new JsonRpcProvider(rpcUrl, undefined, { usePathing: false });
    wallet = new Wallet(privateKey, provider);

    const settlementAddr = formatMixedCaseChecksumAddress(settlementAddress);
    settlementContract = new Contract(settlementAddr, SETTLEMENT_ABI, wallet);

    const marketAddr = formatMixedCaseChecksumAddress(marketRegistryAddress);
    marketRegistryContract = new Contract(marketAddr, MARKET_REGISTRY_ABI, wallet);

    initialized = true;
  }

  /**
   * Wait for transaction receipt with polling.
   *
   * @param {string} txHash - Transaction hash
   * @returns {Object} Transaction receipt
   */
  async function waitForReceipt(txHash) {
    const deadline = Date.now() + receiptWait.maxWaitMs;

    while (Date.now() < deadline) {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) return receipt;
      } catch {
        // Continue polling
      }
      await new Promise((r) => setTimeout(r, receiptWait.pollingIntervalMs));
    }

    throw new Error(`Receipt timeout for ${txHash} after ${receiptWait.maxWaitMs}ms`);
  }

  /**
   * Extract TradeSettled event from receipt.
   *
   * @param {Object} receipt - Transaction receipt
   * @returns {Object|null} Parsed TradeSettled event or null
   */
  function extractTradeSettled(receipt) {
    if (!receipt || !receipt.logs) return null;

    const tradeSettledTopic = '0x' +
      'd4b9e5e6e3e8c6b3a2f1d0c9b8a7968574635241300ffeeddccbbaa9988776655'.substring(2); // placeholder

    // Try to find TradeSettled by log structure
    for (const log of receipt.logs) {
      if (log.topics && log.topics.length >= 3) {
        // TradeSettled has 3 indexed topics: tradeId, fillId, marketId
        const fillId = log.topics[2]; // Second indexed = fillId
        return {
          tradeId: log.topics[0],
          fillId: fillId,
          marketId: log.topics[1],
          logIndex: log.index,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          transactionHash: receipt.transactionHash,
        };
      }
    }

    return null;
  }

  /**
   * Register a new market on MarketRegistry.
   *
   * @param {string} baseToken - Base token address (e.g., WQUAI)
   * @param {string} quoteToken - Quote token address (e.g., WQI)
   * @param {number} pricePrecision - Decimal places for price
   * @param {number} amountPrecision - Decimal places for amount
   * @param {string} minAmount - Minimum trade amount (in quote decimals)
   * @returns {Object} { marketId, txHash, receipt }
   */
  async function registerMarket(baseToken, quoteToken, pricePrecision = 8, amountPrecision = 6, minAmount = '1000000') {
    await init();

    const baseAddr = formatMixedCaseChecksumAddress(baseToken);
    const quoteAddr = formatMixedCaseChecksumAddress(quoteToken);

    // Sign transaction and broadcast manually (skip access list creation)
    const txRequest = {
      from: wallet.address,
      to: formatMixedCaseChecksumAddress(marketRegistryAddress),
      data: marketRegistryContract.interface.encodeFunctionData('addMarket', [
        baseAddr,
        quoteAddr,
        pricePrecision,
        amountPrecision,
        minAmount,
      ]),
      gasLimit: 500_000n,
      gasPrice: parseQuai('0.0000012'),
      nonce: await provider.getTransactionCount(wallet.address),
      chainId: 15000n, // Orchard testnet
    };

    const signed = await wallet.signTransaction(txRequest);
    const txHash = await provider.send('eth_sendRawTransaction', [signed]);

    const receipt = await waitForReceipt(txHash);
    return {
      marketId: null,
      txHash,
      receipt,
    };
  }

  /**
   * Get market info from MarketRegistry.
   *
   * @param {string} marketId - Market ID (bytes32 as hex string)
   * @returns {Object|null} Market info or null if not found
   */
  async function getMarketInfo(marketId) {
    await init();

    try {
      const info = await marketRegistryContract.marketInfo(marketId);
      return {
        base: info.base,
        quote: info.quote,
        pricePrecision: info.pricePrecision,
        amountPrecision: info.amountPrecision,
        minAmount: info.minAmount.toString(),
        enabled: info.enabled,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get market count from MarketRegistry.
   *
   * @returns {number} Number of registered markets
   */
  async function getMarketCount() {
    await init();

    try {
      const count = await marketRegistryContract.getMarketCount();
      return Number(count);
    } catch {
      return 0;
    }
  }

  /**
   * Execute on-chain settlement.
   *
   * @param {Object} params
   * @param {string} params.fillId - Fill ID (bytes32 hex)
   * @param {string} params.marketId - Market ID (bytes32 hex)
   * @param {string} params.makerOrderHash - Maker order hash (bytes32 hex)
   * @param {string} params.takerOrderHash - Taker order hash (bytes32 hex)
   * @param {string} params.maker - Maker address
   * @param {string} params.taker - Taker address
   * @param {string} params.baseToken - Base token address
   * @param {string} params.quoteToken - Quote token address
   * @param {string} params.price - Price (wei)
   * @param {string} params.baseAmount - Base token amount
   * @param {string} params.quoteAmount - Quote token amount
   * @param {string} params.makerFee - Maker fee
   * @param {string} params.takerFee - Taker fee
   * @param {string} params.makerNonce - Maker nonce
   * @param {string} params.takerNonce - Taker nonce
   * @param {string} params.expiresAt - Expiration timestamp
   * @param {string} params.chainId - Chain ID
   * @param {string} params.feeRecipient - Fee recipient address
   * @param {string} params.maxFeeBps - Max fee in basis points
   * @param {string} params.makerOrderAmount - Original maker order amount
   * @param {string} params.takerOrderAmount - Original taker order amount
   * @param {string} params.makerFilledAmount - Maker filled amount
   * @param {string} params.takerFilledAmount - Taker filled amount
   * @param {string} params.makerSignature - Maker ECDSA signature
   * @param {string} params.takerSignature - Taker ECDSA signature
   * @returns {Object} Settlement result with tx, receipt, event
   */
  async function settle(params) {
    await init();

    const {
      fillId,
      marketId,
      makerOrderHash,
      takerOrderHash,
      maker,
      taker,
      baseToken,
      quoteToken,
      price,
      baseAmount,
      quoteAmount,
      makerFee,
      takerFee,
      makerNonce,
      takerNonce,
      expiresAt,
      chainId,
      feeRecipient,
      maxFeeBps,
      makerOrderAmount,
      takerOrderAmount,
      makerFilledAmount,
      takerFilledAmount,
      makerSignature,
      takerSignature,
    } = params;

    // Build FillPacket
    const fillPacket = [
      fillId,
      marketId,
      makerOrderHash,
      takerOrderHash,
      formatMixedCaseChecksumAddress(maker),
      formatMixedCaseChecksumAddress(taker),
      formatMixedCaseChecksumAddress(baseToken),
      formatMixedCaseChecksumAddress(quoteToken),
      BigInt(price),
      BigInt(baseAmount),
      BigInt(quoteAmount),
      BigInt(makerFee),
      BigInt(takerFee),
      BigInt(makerNonce),
      BigInt(takerNonce),
      BigInt(expiresAt),
      BigInt(chainId),
      formatMixedCaseChecksumAddress(params.settlementContract || settlementAddress),
      formatMixedCaseChecksumAddress(feeRecipient),
      BigInt(maxFeeBps),
      BigInt(makerOrderAmount),
      BigInt(takerOrderAmount),
      BigInt(makerFilledAmount),
      BigInt(takerFilledAmount),
    ];

    // Use fixed gas limit for settlement (estimates are unreliable on Quai)
    const gasLimit = 3_000_000n;

    // Build transaction data
    const txData = settlementContract.interface.encodeFunctionData('settle', [
      fillPacket,
      makerSignature,
      takerSignature,
    ]);

    // Get next nonce
    const nonce = await provider.getTransactionCount(wallet.address);

    // Build raw transaction
    const gasPrice = parseQuai('0.0000012'); // Minimum gas price for Orchard testnet
    const txRequest = {
      from: wallet.address,
      to: settlementContract.address,
      data: txData,
      gasLimit,
      gasPrice,
      nonce,
      chainId: 15000n, // Orchard testnet
    };

    // Sign and send raw transaction (bypass access list creation)
    const signedTx = await wallet.signTransaction(txRequest);
    const txHash = await provider.send('eth_sendRawTransaction', [signedTx]);

    const tx = { hash: txHash };

    // Wait for receipt
    const receipt = await waitForReceipt(tx.hash);

    // Extract event
    const event = extractTradeSettled(receipt);

    return {
      txHash: tx.hash,
      receipt,
      event,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      gasUsed: receipt.gasUsed.toString(),
      explorerUrl: `https://orchard.quaiscan.io/tx/${tx.hash}`,
    };
  }

  return {
    init,
    settle,
    registerMarket,
    getMarketInfo,
    getMarketCount,
    getProvider: () => provider,
    getWallet: () => wallet,
    getSettlementContract: () => settlementContract,
    getMarketRegistryContract: () => marketRegistryContract,
  };
}
