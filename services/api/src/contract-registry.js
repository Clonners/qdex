import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const LOCAL_DEPLOYMENT_STATUS = 'local-only-not-deployed';
const TESTNET_DEPLOYED_STATUS = 'testnet-deployed-cyprus1';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load deployed addresses from deployment-addresses.json
let deployedAddresses = { Settlement: null };
try {
  const deploymentPath = join(__dirname, 'deployment-addresses.json');
  const deploymentData = JSON.parse(readFileSync(deploymentPath, 'utf8'));
  // Support both formats: { contracts: {...} } and { Settlement: "...", ... }
  deployedAddresses = deploymentData.contracts || deploymentData;
} catch {
  // If file doesn't exist or is invalid, use null addresses
}

const TESTNET_RPC = 'https://orchard.rpc.quai.network/cyprus1';
const TESTNET_EXPLORER = 'https://orchard.quaiscan.io';

const deployedContract = (metadata, address) => ({
  address: address ?? null,
  deploymentStatus: address ? TESTNET_DEPLOYED_STATUS : LOCAL_DEPLOYMENT_STATUS,
  explorerUrl: address ? `${TESTNET_EXPLORER}/address/${address}` : null,
  ...metadata,
});

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
  status: 'wrapped-token-listing',
  primaryQuoteAssets: ['WQI', 'USDT'],
  supportedAssetModel: 'erc20-style-vault-token',
  quoteAssetModel: 'erc20',
  nativeQiTreatment: 'out-of-scope-direct-settlement-use-WQI',
  nativeQiDirectSettlement: false,
  nativeQiVaultSupport: false,
  userListedTokens: false,
  listingFlowStatus: 'deferred-after-initial-three-markets',
  marketRegistryRole: 'enable initial fixed pairs; future DAO can expand after review',
  realQuaiTransactions: false,
  walletRequired: false,
  safetyNotice:
    'QDEX MVP: ERC-20 only. WQUAI/WQI, WQUAI/USDT, and WQI/USDT only. Pairs use USDT and WQI (wrapped QI) as quote assets. Native QUAI/QI is never transferred, locked, or settled by DEX contracts — denomination only.',
};

export const createContractRegistryResponse = () => {
  const addresses = deployedAddresses;
  const hasDeployments = Object.values(addresses).some((a) => a !== null);

  return {
    chain: 'quai-single-zone-mvp',
    settlementMode: hasDeployments ? 'testnet-deployed' : 'mock',
    deploymentStatus: hasDeployments ? TESTNET_DEPLOYED_STATUS : LOCAL_DEPLOYMENT_STATUS,
    network: hasDeployments ? {
      rpc: TESTNET_RPC,
      explorer: TESTNET_EXPLORER,
      zone: 'cyprus1',
      chainId: 15000,
    } : null,
    custody: 'non-custodial-no-withdrawal-authority',
    realQuaiTransactions: hasDeployments,
    walletRequired: hasDeployments,
    source: hasDeployments ? 'contracts-deployed-cyprus1' : 'contracts-local-harness-and-docs',
    docs: ['docs/contracts.md', 'docs/quai-tooling.md', 'contracts/README.md'],
    assetListingCaveat:
      'QDEX: ERC-20 only. All listed assets are ERC-20 tokens. Pairs use USDT and WQI as quote assets — WQUAI/WQI, WQUAI/USDT, and WQI/USDT. Native QUAI/QI is denomination only — never transferred or settled.',
    listedAssetStatus: {
      ...listedAssetStatus,
      primaryQuoteAssets: [...listedAssetStatus.primaryQuoteAssets],
      realQuaiTransactions: hasDeployments,
      walletRequired: hasDeployments,
    },
    contracts: {
      tradingVault: deployedContract({
        key: 'tradingVault',
        contractName: 'TradingVault',
        interface: 'ITradingVault',
        sourcePath: 'contracts/src/TradingVault.sol',
        interfacePath: 'contracts/src/ITradingVault.sol',
        custodyRole: 'non-custodial-contract-vault',
        operatorWithdrawalAuthority: false,
        settlementHookAuthority: 'authorized-settlement-contract-only',
      }, addresses.TradingVault),
      settlement: deployedContract({
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
      }, addresses.Settlement),
      nonceManager: deployedContract({
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
      }, addresses.NonceManager),
      marketRegistry: deployedContract({
        key: 'marketRegistry',
        contractName: 'MarketRegistry',
        interface: 'IMarketRegistry',
        sourcePath: 'contracts/src/MarketRegistry.sol',
        interfacePath: 'contracts/src/IMarketRegistry.sol',
        custodyRole: 'market-metadata-only',
        operatorWithdrawalAuthority: false,
        marketTruth: 'external-market-registry',
        authorityScope: 'local-market-authority-before-production-timelock',
      }, addresses.MarketRegistry),
      feeManager: deployedContract({
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
      }, addresses.FeeManager),
      delegateKeyRegistry: deployedContract({
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
      }, addresses.DelegateKeyRegistry),
    },
    safety: {
      nonCustodial: true,
      operatorWithdrawalAuthority: false,
      realQuaiTransactions: hasDeployments,
      walletRequired: hasDeployments,
      approvalGate: 'explicit-approval-required-before-deploy-or-transaction',
      notice:
        'No autonomous deployment, transaction, wallet, or external RPC activity is implied by /v1/contracts.',
    },
  };
};
