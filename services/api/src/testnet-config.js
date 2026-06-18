/**
 * Quai Orchard testnet configuration — Cyprus1 zone.
 *
 * Provided by Clonners: https://orchard.rpc.quai.network/cyprus1
 * Explorer: https://orchard.quaiscan.io (verified HTTP 200)
 *
 * This config enables testnet-ready mode. Contract addresses and token
 * addresses are null until deployment.
 */

export const TESTNET_CONFIG = Object.freeze({
  networkName: 'quai-orchard',
  zone: 'cyprus1',
  chainId: 15000, // detected via eth_chainId probe (read-only, public network param)
  rpcUrl: 'https://orchard.rpc.quai.network/cyprus1',
  explorerBaseUrl: 'https://orchard.quaiscan.io', // Quai Orchard testnet explorer
  deployer: '0x005CADdF8Fe81F1ea33ABF16Db610CAd0aaD3267',
  contracts: Object.freeze({
    TradingVault: null,
    Settlement: null,
    NonceManager: null,
    MarketRegistry: null,
    FeeManager: null,
    DelegateKeyRegistry: null,
  }),
  tokens: Object.freeze({
    WQUAI: null,
    WQI: null,
  }),
  mode: 'testnet-ready',
});

/**
 * Build an explorer URL for a transaction hash.
 *
 * Returns null if the explorer base URL is not configured or txHash is absent.
 *
 * @param {string} txHash - Transaction hash (with or without 0x prefix)
 * @returns {string|null} - Explorer URL or null
 */
export function explorerUrlForTx(txHash) {
  if (!TESTNET_CONFIG.explorerBaseUrl || !txHash) return null;
  const hash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;
  return `${TESTNET_CONFIG.explorerBaseUrl}/tx/${hash}`;
}

/**
 * Build an explorer URL for an address.
 *
 * Returns null if the explorer base URL is not configured or address is absent.
 *
 * @param {string} address - Ethereum-style address (with or without 0x prefix)
 * @returns {string|null} - Explorer URL or null
 */
export function explorerUrlForAddress(address) {
  if (!TESTNET_CONFIG.explorerBaseUrl || !address) return null;
  const addr = address.startsWith('0x') ? address : `0x${address}`;
  return `${TESTNET_CONFIG.explorerBaseUrl}/address/${addr}`;
}

/**
 * Build an explorer URL for a block number or hash.
 *
 * Returns null if the explorer base URL is not configured or blockId is absent.
 *
 * @param {string|number} blockId - Block number (decimal) or block hash
 * @returns {string|null} - Explorer URL or null
 */
export function explorerUrlForBlock(blockId) {
  if (!TESTNET_CONFIG.explorerBaseUrl || blockId === null || blockId === undefined) return null;
  const id = typeof blockId === 'number' ? String(blockId) : blockId;
  if (id === '') return null;
  return `${TESTNET_CONFIG.explorerBaseUrl}/block/${id}`;
}
