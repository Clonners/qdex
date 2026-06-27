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
    Settlement: '0x004C1D112dB14611A16Bf1dA825Ee5C3F67adD22',
    TradingVault: '0x0078293b837B677Cd87776d087659AAEEf9B9e0E',
    NonceManager: '0x0046E3FAfa50e7AF3306400F5C6e35Ba6d0eAb0d',
    MarketRegistry: '0x00312df1022EF1dF16472D2470925A3666655852',
    FeeManager: '0x005E9892A46fD3a7eaCF8Dd85C2c885829283c7b',
    DelegateKeyRegistry: '0x003EA9612F140D51375bBd2a68884d88677f6264',
  }),
  tokens: Object.freeze({
    WQUAI: '0x005c46f661Baef20671943f2b4c087Df3E7CEb13', // Quai Orchard testnet
    WQI:   '0x002b2596EcF05C93a31ff916E8b456DF6C77c750', // Quai Orchard testnet
  }),
  mode: 'testnet-ready',
  deployment: Object.freeze({
    deployedAt: '2026-06-20T19:30:00-03:00',
    deployScript: 'scripts/deploy-quai.mjs',
    zone: '0x00', // Cyprus-1
    settlementSubContracts: {
      vault: '0x002325d071d57bafd3169f270a71b67a05360abf',
      nonceManager: '0x000c826c29746b9c35a9712fed465ba0a9902584',
      marketRegistry: '0x00793e6ac77dd2b895cc57eb90a7b3274d69353d',
      feeManager: '0x005a069df8705f4c47f3cd924ad9b8f39517f383',
      delegateKeyRegistry: '0x002a307a11d6f736d480a7e08fbe519e2d44b676',
    },
  }),
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
