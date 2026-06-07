const PRIMARY_QUOTE_ASSETS = ['WQUAI', 'WQI'];

const supportedAssets = [
  {
    symbol: 'WQUAI',
    role: 'quote-and-base-vault-token',
    assetModel: 'erc20-style-vault-token',
    address: null,
    listingStatus: 'listed',
    nativeQiDirectSettlement: false,
  },
  {
    symbol: 'WQI',
    role: 'qi-facing-vault-token',
    assetModel: 'erc20-style-vault-token',
    address: null,
    listingStatus: 'listed',
    nativeQiDirectSettlement: false,
  },
  {
    symbol: 'community-created-erc20-style-token',
    role: 'user-created-listable-asset',
    assetModel: 'erc20-style-vault-token',
    address: null,
    listingStatus: 'listable-after-review',
    nativeQiDirectSettlement: false,
  },
];

const exampleMarkets = [
  {
    marketId: 'WQI-WQUAI',
    baseAsset: 'WQI',
    quoteAsset: 'WQUAI',
    marketRegistryStatus: 'listable-after-review',
    custodyAuthority: false,
  },
];

const listingLifecycle = [
  'submit-token-metadata',
  'review-token-safety',
  'define-precision-and-minimums',
  'marketRegistry.addMarket-after-approval',
  'marketRegistry.disableMarket-if-needed',
];

export const createTokenListingPolicyResponse = () => ({
  source: 'listed-asset-marketregistry-policy',
  status: 'design-only-local-metadata',
  assetModel: 'erc20-style-vault-token',
  primaryQuoteAssets: [...PRIMARY_QUOTE_ASSETS],
  supportedAssets: supportedAssets.map((asset) => ({ ...asset })),
  exampleMarkets: exampleMarkets.map((market) => ({ ...market })),
  listingLifecycle: [...listingLifecycle],
  marketRegistry: {
    truthSource: 'MarketRegistry-enabled-pair-metadata',
    canEnableMarkets: true,
    canDisableMarkets: true,
    custodyAuthority: false,
    balanceMovement: false,
    operatorWithdrawalAuthority: false,
    notes: 'MarketRegistry listing metadata can enable or disable token pairs, but it cannot move TradingVault balances or grant withdrawal/admin power.',
  },
  safety: {
    realQuaiTransactions: false,
    walletRequired: false,
    noWalletLoading: true,
    noSigning: true,
    noBroadcast: true,
    noRpcUrlAccess: true,
    noTransactionSubmission: true,
    delegatePermissions: ['NO_WITHDRAW', 'NO_ADMIN'],
    notice: 'Read-only listing metadata only; no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds.',
  },
});
