const LOCAL_DEPLOYMENT_STATUS = 'local-only-not-deployed';

const localContract = (metadata) => ({
  address: null,
  deploymentStatus: LOCAL_DEPLOYMENT_STATUS,
  ...metadata,
});

const dependencyNames = [
  'TradingVault',
  'NonceManager',
  'MarketRegistry',
  'FeeManager',
  'DelegateKeyRegistry',
];

const listedAssetStatus = {
  status: 'erc20-only-listing',
  primaryQuoteAssets: ['USDT', 'WQI'],
  supportedAssetModel: 'erc20',
  quoteAssetModel: 'erc20',
  nativeQiTreatment: 'denomination-only',
  nativeQiDirectSettlement: false,
  nativeQiVaultSupport: false,
  realQuaiTransactions: false,
  walletRequired: false,
  safetyNotice:
    'QDEX MVP: ERC-20 only. Pairs use USDT and WQI (wrapped QI) as quote assets. Native QUAI/QI is never transferred, locked, or settled by DEX contracts — denomination only.',
};

export const createContractRegistryResponse = () => ({
  chain: 'quai-single-zone-mvp',
  settlementMode: 'mock',
  deploymentStatus: LOCAL_DEPLOYMENT_STATUS,
  custody: 'non-custodial-no-withdrawal-authority',
  realQuaiTransactions: false,
  walletRequired: false,
  source: 'contracts-local-harness-and-docs',
  docs: ['docs/contracts.md', 'docs/quai-tooling.md', 'contracts/README.md'],
  assetListingCaveat:
    'QDEX: ERC-20 only. All listed assets are ERC-20 tokens. Pairs use USDT and WQI as quote assets. Native QUAI/QI is denomination only — never transferred or settled.',
  listedAssetStatus: {
    ...listedAssetStatus,
    primaryQuoteAssets: [...listedAssetStatus.primaryQuoteAssets],
  },
  contracts: {
    tradingVault: localContract({
      key: 'tradingVault',
      contractName: 'TradingVault',
      interface: 'ITradingVault',
      sourcePath: 'contracts/src/TradingVault.sol',
      interfacePath: 'contracts/src/ITradingVault.sol',
      custodyRole: 'non-custodial-contract-vault',
      operatorWithdrawalAuthority: false,
      settlementHookAuthority: 'authorized-settlement-contract-only',
    }),
    settlement: localContract({
      key: 'settlement',
      contractName: 'Settlement',
      interface: 'ISettlement',
      sourcePath: 'contracts/src/Settlement.sol',
      interfacePath: 'contracts/src/ISettlement.sol',
      custodyRole: 'valid-fill-settlement-only',
      operatorWithdrawalAuthority: false,
      proofTrigger: 'TradeSettled',
      dependencies: dependencyNames,
      nonceTruth: 'external-nonce-manager',
      marketTruth: 'external-market-registry',
      feeTruth: 'external-fee-manager',
      delegateSigning: 'owner-scoped delegate with PLACE_ORDER, NO_WITHDRAW, and NO_ADMIN only',
    }),
    nonceManager: localContract({
      key: 'nonceManager',
      contractName: 'NonceManager',
      interface: 'INonceManager',
      sourcePath: 'contracts/src/NonceManager.sol',
      interfacePath: 'contracts/src/INonceManager.sol',
      custodyRole: 'replay-protection-only',
      operatorWithdrawalAuthority: false,
      nonceTruth: 'external-nonce-manager',
      userCancellation: true,
      settlementOnlyMarkUsed: true,
    }),
    marketRegistry: localContract({
      key: 'marketRegistry',
      contractName: 'MarketRegistry',
      interface: 'IMarketRegistry',
      sourcePath: 'contracts/src/MarketRegistry.sol',
      interfacePath: 'contracts/src/IMarketRegistry.sol',
      custodyRole: 'market-metadata-only',
      operatorWithdrawalAuthority: false,
      marketTruth: 'external-market-registry',
      authorityScope: 'local-market-authority-before-production-timelock',
    }),
    feeManager: localContract({
      key: 'feeManager',
      contractName: 'FeeManager',
      interface: 'IFeeManager',
      sourcePath: 'contracts/src/FeeManager.sol',
      interfacePath: 'contracts/src/IFeeManager.sol',
      custodyRole: 'fee-policy-metadata-only',
      operatorWithdrawalAuthority: false,
      feeTruth: 'external-fee-manager',
      maxFeeCapSource: 'maxFeeBps()',
      authorityScope: 'local-fee-authority-before-production-timelock',
    }),
    delegateKeyRegistry: localContract({
      key: 'delegateKeyRegistry',
      contractName: 'DelegateKeyRegistry',
      interface: 'IDelegateKeyRegistry',
      sourcePath: 'contracts/src/DelegateKeyRegistry.sol',
      interfacePath: 'contracts/src/IDelegateKeyRegistry.sol',
      custodyRole: 'bot-permission-registry-only',
      operatorWithdrawalAuthority: false,
      requiredPermissions: ['PLACE_ORDER', 'NO_WITHDRAW', 'NO_ADMIN'],
      withdrawalPermission: false,
      adminPermission: false,
    }),
  },
  safety: {
    nonCustodial: true,
    operatorWithdrawalAuthority: false,
    realQuaiTransactions: false,
    walletRequired: false,
    approvalGate: 'explicit-approval-required-before-deploy-or-transaction',
    notice:
      'No autonomous deployment, transaction, wallet, or external RPC activity is implied by /v1/contracts.',
  },
});
