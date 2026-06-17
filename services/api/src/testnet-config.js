/**
 * Quai Orchard testnet configuration — Cyprus1 zone.
 *
 * Provided by Clonners: https://orchard.rpc.quai.network/cyprus1
 *
 * This config enables testnet-ready mode. Contract addresses and token
 * addresses are null until deployment.
 */

export const TESTNET_CONFIG = Object.freeze({
  networkName: 'quai-orchard',
  zone: 'cyprus1',
  chainId: 15000, // detected via eth_chainId probe (read-only, public network param)
  rpcUrl: 'https://orchard.rpc.quai.network/cyprus1',
  explorerBaseUrl: null,
  deployer: null,
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
