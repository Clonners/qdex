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

test('OpenAPI exposes prepare-only owner-wallet TradingVault deposit and withdrawal boundaries', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const vaultRoutes = sectionBetween(spec, '  /v1/vault/deposits/prepare:', '  /v1/orders:');
  const requestSchema = sectionBetween(spec, '    VaultOperationPrepareRequest:', '    VaultOperationPrepareNotImplemented:');
  const responseSchema = sectionBetween(spec, '    VaultOperationPrepareNotImplemented:', '    ContractRegistry:');

  for (const requiredText of [
    'summary: Prepare owner-wallet TradingVault deposit',
    'summary: Prepare owner-wallet TradingVault withdrawal',
    'owner-wallet-only prepare-only boundary',
    'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or funds movement',
    '$ref: "#/components/schemas/VaultOperationPrepareRequest"',
    '$ref: "#/components/schemas/VaultOperationPrepareNotImplemented"',
    '"501":',
  ]) {
    assert.ok(vaultRoutes.includes(requiredText), `vault routes should include ${requiredText}`);
  }

  for (const requiredText of [
    'required: [operation, owner, assetSymbol, amount, chainId, vaultContractRef]',
    'operation:',
    'enum: [deposit, withdrawal]',
    'assetSymbol:',
    'enum: [WQUAI, WQI, community-created-erc20-style-token]',
    'vaultContractRef:',
    'enum: [local-only-not-deployed]',
    'owner wallet must authorize the future deposit/withdrawal',
  ]) {
    assert.ok(requestSchema.includes(requiredText), `VaultOperationPrepareRequest should include ${requiredText}`);
  }
  assert.doesNotMatch(requestSchema, /signature|privateKey|rpcUrl|txHash/i, 'prepare request must not carry signing/RPC/tx fields');

  for (const requiredText of [
    'required: [error, source, custody, vaultOperation, operationStatus, ownerAuthorization, permissions, delegateAuthority, realQuaiTransactions, walletRequired, fundsMoved, tradingVaultMutation, approvalGate, safety, message]',
    'owner_wallet_vault_deposit_not_implemented',
    'owner_wallet_vault_withdrawal_not_implemented',
    'owner-wallet-vault-operation-placeholder',
    'non-custodial-contract-vault',
    'prepare-only-not-implemented',
    'owner-wallet-required',
    'delegates-cannot-deposit-or-withdraw',
    'enum: [NO_WITHDRAW, NO_ADMIN]',
    'realQuaiTransactions:',
    'walletRequired:',
    'fundsMoved:',
    'tradingVaultMutation:',
    'explicit-approval-required-before-wallet-signing-or-quai-broadcast',
    'noWalletLoading:',
    'noRpcUrlAccess:',
    'noSigning:',
    'noBroadcast:',
    'noTransactionSubmission:',
    'noFundsMovement:',
    'noDelegateWithdrawalAuthority:',
    'noAdminWithdrawalAuthority:',
  ]) {
    assert.ok(responseSchema.includes(requiredText), `VaultOperationPrepareNotImplemented should include ${requiredText}`);
  }
});

test('vault operations docs pin owner-wallet-only custody and no autonomous tx behavior', async () => {
  const vaultDoc = await readText('docs/vault-operations.md');
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');

  for (const requiredText of [
    '# TradingVault Deposit/Withdrawal Prepare Boundary',
    'POST /v1/vault/deposits/prepare',
    'POST /v1/vault/withdrawals/prepare',
    'owner-wallet-required',
    'owner-wallet-only prepare-only boundary',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'realQuaiTransactions: false',
    'walletRequired: false',
    'fundsMoved: false',
    'tradingVaultMutation: false',
    'Delegate/API keys cannot deposit or withdraw by default',
    'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds',
  ]) {
    assert.ok(vaultDoc.includes(requiredText), `docs/vault-operations.md should include ${requiredText}`);
  }

  for (const doc of [contracts, architecture]) {
    assert.ok(doc.includes('docs/vault-operations.md'), 'core docs should link the vault prepare boundary');
    assert.ok(doc.includes('POST /v1/vault/deposits/prepare'), 'core docs should name the deposit prepare endpoint');
    assert.ok(doc.includes('POST /v1/vault/withdrawals/prepare'), 'core docs should name the withdrawal prepare endpoint');
  }

  const disallowedVaultDocClaims = [
    'walletPrivateKey',
    `seed${' '}phrase`,
    `mnemo${'nic'}`,
    'rpcUrl\\s*:',
    'transaction submitted',
    'funds moved',
    'admin withdraw',
  ].join('|');

  assert.doesNotMatch(
    `${vaultDoc}\n${contracts}\n${architecture}`,
    new RegExp(disallowedVaultDocClaims, 'i'),
    'vault operation docs must not introduce wallet/RPC/tx/funds/admin-withdraw claims',
  );
});
