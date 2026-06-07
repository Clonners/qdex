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
  listingAuthority: {
    currentPhase: 'clonners-operator-managed',
    initialAuthority: 'Clonners-controlled MarketRegistry authority',
    futureAuthority: 'dao-governance',
    handoffPattern: 'MarketRegistry.proposeMarketAuthority -> MarketRegistry.acceptMarketAuthority',
    authorityCan: ['addMarket', 'disableMarket', 'proposeMarketAuthority'],
    authorityCannot: ['moveTradingVaultBalances', 'withdrawUserFunds', 'grantDelegateAdmin', 'loadWallets', 'broadcastTransactions'],
    daoMigration: {
      status: 'supported-by-two-step-handoff',
      acceptanceRequired: true,
      eventTruth: ['MarketAuthorityHandoffProposed', 'MarketAuthorityHandoffAccepted'],
    },
    safety: {
      custodyAuthority: false,
      balanceMovement: false,
      delegateWithdrawalAuthority: false,
      delegateAdminAuthority: false,
    },
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

export const createListingRequestReviewFlowResponse = () => ({
  source: 'listed-asset-marketregistry-review-flow',
  status: 'design-only-local-metadata',
  phase: 'clonners-managed-local-review-before-dao',
  requestSurface: 'prepare-only POST /v1/listings/requests; POST /v1/listings/requests with requestMode=local_review_queue; GET /v1/listings/requests inspection',
  reviewAuthority: {
    currentAuthority: 'Clonners-managed MarketRegistry authority',
    futureAuthority: 'dao-governance',
    handoffPattern: 'MarketRegistry.proposeMarketAuthority -> MarketRegistry.acceptMarketAuthority',
  },
  stages: [
    {
      id: 'metadata_intake',
      label: 'Metadata intake',
      requiredEvidence: ['baseSymbol', 'quoteSymbol', 'tokenModel', 'requestedMarketId', 'pricePrecision', 'amountPrecision', 'minAmount'],
      effect: 'local-review-record-only',
      marketRegistryMutation: false,
    },
    {
      id: 'token_safety_review',
      label: 'Token safety review',
      requiredEvidence: ['erc20-style-vault-token-behavior', 'no-native-qi-direct-settlement', 'no-custody-or-admin-withdrawal-path'],
      effect: 'local-review-record-only',
      marketRegistryMutation: false,
    },
    {
      id: 'market_parameter_review',
      label: 'Market parameter review',
      requiredEvidence: ['WQUAI-or-WQI-quote', 'pricePrecision', 'amountPrecision', 'minAmount'],
      effect: 'local-review-record-only',
      marketRegistryMutation: false,
    },
    {
      id: 'clonners_local_approval',
      label: 'Clonners local approval',
      requiredEvidence: ['operator-approval-note', 'NO_WITHDRAW', 'NO_ADMIN'],
      effect: 'approved-local-metadata-only',
      marketRegistryMutation: false,
    },
    {
      id: 'marketregistry_admin_gate',
      label: 'MarketRegistry admin gate',
      requiredEvidence: ['separate-explicit-approval-before-addMarket', 'local-contract-ratchets-green'],
      effect: 'future-approved-addMarket-only-after-separate-slice',
      marketRegistryMutation: false,
    },
  ],
  approvalOutcome: {
    approvedStatus: 'approved-local-metadata-only',
    rejectedStatus: 'rejected-local-metadata-only',
    nextMutationGate: 'explicit Clonners approval required before MarketRegistry.addMarket',
    marketRegistryMutation: false,
    realQuaiTransactions: false,
  },
  safety: {
    custody: 'non-custodial',
    permissions: ['NO_WITHDRAW', 'NO_ADMIN'],
    marketRegistryMutation: false,
    realQuaiTransactions: false,
    walletRequired: false,
    noWalletLoading: true,
    noRpcUrlAccess: true,
    noSigning: true,
    noBroadcast: true,
    noDeploys: true,
    noTransactionSubmission: true,
    noListingAdminKeys: true,
    noRealTokenAddresses: true,
    noFundsMovement: true,
    notice:
      'Local review/approval metadata plus approved in-memory queue only; it does not mutate MarketRegistry, move TradingVault balances, grant withdrawal/admin authority, load wallets, read RPC URLs, sign, broadcast, deploy, submit transactions, or register real token addresses.',
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
