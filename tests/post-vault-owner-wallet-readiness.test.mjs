import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const planPath = 'docs/plans/2026-06-08-post-vault-owner-wallet-readiness.md';

const forbiddenRuntimeDetails = new RegExp(
  [
    'process\\.env',
    'RPC_URL',
    'PRIVATE[_-]?KEY',
    'mnemo' + 'nic',
    'seed' + ' phrase',
    'walletPrivateKey',
    'txHash:',
    'deployed address: 0x',
    'broadcast transaction',
    'funds moved',
  ].join('|'),
  'i',
);

test('post-vault owner-wallet readiness plan pins completed prepare surfaces and future approval gates', async () => {
  const plan = await readText(planPath);

  for (const requiredText of [
    '# Post-Vault Owner-Wallet Readiness Implementation Plan',
    '> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.',
    '**Goal:** Map the completed mock vault/balance and prepare-only deposit/withdrawal surfaces to the approval-gated owner-wallet path required before real TradingVault funds can move.',
    '**Architecture:** The current API, SDK, CLI, and terminal UI stay local/source-only and display either `mock-vault-projection` balances or intentional owner-wallet prepare placeholders.',
    '**Tech Stack:** Markdown plan/spec ratchets, Node `node:test` doc guards, existing TypeScript API/SDK/CLI/terminal UI, Python SDK docs, and local Solidity/Hardhat contract evidence only after approval.',
    '## Current completed safe vault surfaces',
    '`GET /v1/account/balances`',
    '`/v1/ws?channel=balances`',
    '`mock-vault-projection`',
    '`POST /v1/vault/deposits/prepare`',
    '`POST /v1/vault/withdrawals/prepare`',
    '`owner-wallet-vault-operation-placeholder`',
    '`prepare-only-not-implemented`',
    'TypeScript SDK `vault.deposits.prepare()` / `vault.withdrawals.prepare()`',
    'Python SDK `vault.deposits.prepare()` / `vault.withdrawals.prepare()`',
    '`qdex vault deposit --prepare` / `qdex vault withdraw --prepare`',
    'terminal UI prepare-only vault operation panel',
    'local API + terminal UI vault prepare smoke',
    '## Owner-wallet approval gate',
    'explicit Clonners approval required before owner-wallet signing, RPC URL access, broadcast, TradingVault mutation, transaction submission, or funds movement',
    'verified `TradingVault` contract address evidence',
    'listed asset token evidence from the WQUAI/WQI/community-token listing flow',
    '`Deposit` and `Withdraw` event-truth indexing',
    'proof-service/UI copy that separates prepare state from confirmed contract event truth',
    '## Delegate/API key boundary',
    '`delegates-cannot-deposit-or-withdraw`',
    '`NO_WITHDRAW`',
    '`NO_ADMIN`',
    '## Disallowed autonomous work',
    'no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, real contract address claims, relayer jobs, TradingVault mutation, or funds movement',
    '## Completed local/source-only vault history clients',
    'Completed: read-only TypeScript/Python/qdex clients for vault deposit/withdrawal history.',
    'SDK `dex.vault.deposits.list()` / `dex.vault.withdrawals.list()` and CLI `qdex vault deposits` / `qdex vault withdrawals`',
    'Next bounded local/source-only slice: terminal UI read-only vault history panel',
  ]) {
    assert.ok(plan.includes(requiredText), `${planPath} should include ${requiredText}`);
  }

  assert.doesNotMatch(plan, forbiddenRuntimeDetails, 'plan must not include secret/env/RPC/deploy mechanics or real tx/funds claims');
  assert.doesNotMatch(plan, /adminWithdraw|withdrawFrom|rescue|sweep/i, 'plan must not introduce admin/operator withdrawal surfaces');
});

test('vault docs and core docs link the post-vault readiness plan', async () => {
  const vaultOperations = await readText('docs/vault-operations.md');
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');

  for (const [label, text] of [
    ['docs/vault-operations.md', vaultOperations],
    ['docs/contracts.md', contracts],
    ['docs/architecture.md', architecture],
  ]) {
    assert.ok(text.includes(planPath), `${label} should link the post-vault owner-wallet readiness plan`);
    assert.ok(
      text.includes('post-vault owner-wallet readiness'),
      `${label} should name the post-vault owner-wallet readiness boundary`,
    );
    assert.ok(
      text.includes('read-only TradingVault `Deposit`/`Withdraw` projection schema'),
      `${label} should point to the completed event-projection schema rather than wallet behavior`,
    );
    assert.doesNotMatch(
      text,
      /walletPrivateKey|rpcUrl\s*:|broadcast transaction|funds moved|TradingVault mutation submitted/i,
      `${label} must not claim wallet/RPC/tx/funds behavior is active`,
    );
  }
});
