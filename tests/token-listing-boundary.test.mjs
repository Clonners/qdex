import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const sectionBetween = (text, startMarker, endMarker) => {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker ${endMarker}`);
  return text.slice(start, end);
};

test('token listing policy doc pins MarketRegistry metadata flow without custody authority', async () => {
  const policy = await readText('docs/listing-policy.md');

  for (const requiredText of [
    '# Token Listing and MarketRegistry Metadata Policy',
    'WQUAI',
    'WQI',
    'community-created ERC-20-style vault tokens',
    '`MarketRegistry` is market metadata/enabled-pair truth, not custody truth',
    '`TradingVault` remains the only vault-balance surface',
    '`addMarket`',
    '`disableMarket`',
    'cannot move user balances',
    '`NO_WITHDRAW`',
    '`NO_ADMIN`',
    'realQuaiTransactions: false',
    'walletRequired: false',
    'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds',
  ]) {
    assert.ok(policy.includes(requiredText), `docs/listing-policy.md should include ${requiredText}`);
  }

  assert.doesNotMatch(
    policy,
    /wrapped_qi_receipt_token|contract_native_qi_adapter|conversion_settlement_flow/,
    'listing policy must not reopen direct native Qi adapter paths as active blockers',
  );
});

test('OpenAPI exposes read-only token listing policy route and schema', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const route = sectionBetween(spec, '  /v1/listings/policy:', '  /v1/relayer/settlement-mode-gate:');
  const tokenListingPolicy = sectionBetween(spec, '    TokenListingPolicy:', '    TokenListingAsset:');
  const tokenListingAsset = sectionBetween(spec, '    TokenListingAsset:', '    TokenListingMarketRegistry:');
  const marketRegistry = sectionBetween(spec, '    TokenListingMarketRegistry:', '    TokenListingSafety:');
  const safety = sectionBetween(spec, '    TokenListingSafety:', '    ContractMetadata:');

  for (const requiredText of [
    'summary: Read-only token listing and MarketRegistry metadata policy',
    '$ref: "#/components/schemas/TokenListingPolicy"',
    'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds',
  ]) {
    assert.ok(route.includes(requiredText), `/v1/listings/policy route should include ${requiredText}`);
  }

  for (const requiredText of [
    'required: [source, status, assetModel, primaryQuoteAssets, supportedAssets, exampleMarkets, listingLifecycle, marketRegistry, safety]',
    'enum: [listed-asset-marketregistry-policy]',
    'enum: [design-only-local-metadata]',
    'enum: [erc20-style-vault-token]',
    'enum: [WQUAI, WQI]',
    'supportedAssets:',
    'exampleMarkets:',
    'listingLifecycle:',
  ]) {
    assert.ok(tokenListingPolicy.includes(requiredText), `TokenListingPolicy schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'symbol:',
    'enum: [WQUAI, WQI, community-created-erc20-style-token]',
    'address:',
    'type: [string, "null"]',
    'listingStatus:',
    'enum: [listed, listable-after-review]',
    'nativeQiDirectSettlement:',
    'enum: [false]',
  ]) {
    assert.ok(tokenListingAsset.includes(requiredText), `TokenListingAsset schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'truthSource:',
    'enum: [MarketRegistry-enabled-pair-metadata]',
    'canEnableMarkets:',
    'canDisableMarkets:',
    'custodyAuthority:',
    'balanceMovement:',
    'operatorWithdrawalAuthority:',
    'enum: [false]',
  ]) {
    assert.ok(marketRegistry.includes(requiredText), `TokenListingMarketRegistry schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'realQuaiTransactions:',
    'walletRequired:',
    'noWalletLoading:',
    'noSigning:',
    'noBroadcast:',
    'noRpcUrlAccess:',
    'noTransactionSubmission:',
    'delegatePermissions:',
    'enum: [NO_WITHDRAW, NO_ADMIN]',
  ]) {
    assert.ok(safety.includes(requiredText), `TokenListingSafety schema should include ${requiredText}`);
  }
});

test('contracts and architecture docs link listing policy as the active safe metadata slice', async () => {
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');
  const plan = await readText('docs/plans/2026-06-07-native-qi-wrapper-adapter-boundary.md');

  for (const text of [contracts, architecture, plan]) {
    assert.ok(text.includes('docs/listing-policy.md'), 'docs should link the token listing policy');
    assert.ok(text.includes('token listing and MarketRegistry metadata flow'), 'docs should name the listing metadata flow');
  }

  assert.ok(
    plan.includes('Completed: `GET /v1/listings/policy` exposes read-only listing metadata'),
    'wrapped token plan should mark the listing-policy route slice complete once implemented',
  );
});
