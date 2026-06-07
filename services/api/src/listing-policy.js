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

export const createListingRequestPlaceholderResponse = () => ({
  error: 'listing_request_not_implemented',
  source: 'listed-asset-marketregistry-policy',
  status: 'design-only-local-metadata',
  requestStatus: 'not-implemented-approval-required',
  approvalGate: 'listing-submission-approval-gate',
  custody: 'non-custodial',
  assetModel: 'erc20-style-vault-token',
  primaryQuoteAssets: [...PRIMARY_QUOTE_ASSETS],
  supportedAsset: 'community-created-erc20-style-token',
  marketRegistry: {
    truthSource: 'MarketRegistry-enabled-pair-metadata',
    marketRegistryMutation: false,
    canMoveTradingVaultBalances: false,
    canGrantWithdrawalAuthority: false,
    canGrantAdminAuthority: false,
  },
  permissions: ['NO_WITHDRAW', 'NO_ADMIN'],
  realQuaiTransactions: false,
  walletRequired: false,
  safety: {
    noWalletLoading: true,
    noRpcUrlAccess: true,
    noSigning: true,
    noBroadcast: true,
    noDeploys: true,
    noTransactionSubmission: true,
    noRuntimeListingQueue: true,
    noListingAdminKeys: true,
    noRealTokenAddresses: true,
    noFundsMovement: true,
    notice:
      'Prepare-only listing request placeholder: no listing request was submitted, no MarketRegistry mutation occurred, and listing/admin metadata cannot move TradingVault balances or grant withdrawal/admin authority.',
  },
  message:
    'Listing requests are approval-gated and not implemented; this placeholder does not submit listings, mutate MarketRegistry, move TradingVault balances, or grant withdrawal/admin authority.',
});
