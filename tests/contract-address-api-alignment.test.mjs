import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);

const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

test('OpenAPI pins local-only contract registry metadata for /v1/contracts', async () => {
  const openapi = await readText('docs/api-openapi.yaml');

  for (const requiredText of [
    '/v1/contracts:',
    '$ref: "#/components/schemas/ContractRegistry"',
    'ContractRegistry:',
    'ContractMetadata:',
    'ContractSafety:',
    'deploymentStatus:',
    'local-only-not-deployed',
    'operatorWithdrawalAuthority:',
    'proofTrigger:',
    'TradeSettled',
    'assetListingCaveat:',
    'NO_WITHDRAW',
    'No autonomous deployment, transaction, wallet, or external RPC activity is implied by /v1/contracts',
  ]) {
    assert.ok(openapi.includes(requiredText), `docs/api-openapi.yaml should include ${requiredText}`);
  }
});

test('contracts overview documents API metadata as local-only dependency truth', async () => {
  const contracts = await readText('docs/contracts.md');

  for (const requiredText of [
    '## Contract address/API metadata alignment',
    'GET /v1/contracts',
    'local-only-not-deployed',
    'address: null',
    'No autonomous deployment, transaction, wallet, external RPC, or real-funds activity is implied',
    'TradeSettled',
    'TradingVault`, `NonceManager`, `MarketRegistry`, `FeeManager`, and `DelegateKeyRegistry`',
    'NO_WITHDRAW',
    'WQUAI, WQI, and community-created tokens',
  ]) {
    assert.ok(contracts.includes(requiredText), `docs/contracts.md should include ${requiredText}`);
  }
});
