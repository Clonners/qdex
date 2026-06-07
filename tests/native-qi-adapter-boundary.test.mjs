import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readRepoFile = (path) => readFile(new URL(path, repoRoot), 'utf8');

const planPath = 'docs/plans/2026-06-07-native-qi-wrapper-adapter-boundary.md';

const requiredPlanText = [
  '# Native Qi Wrapper/Adapter Boundary Implementation Plan',
  '> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.',
  '**Goal:** Define the approval-gated boundary for supporting native Qi in a real Quai TradingVault without treating UTXO Qi as an ERC-20 token.',
  '**Architecture:** The current mock `QI-QUAI` loop stays mock-only while this plan defines evidence gates for wrapped Qi receipts, contract-native Qi adapters, or explicit conversion settlement flows.',
  '**Tech Stack:** Node `node:test` doc ratchets, Solidity `0.8.20` local Hardhat interface tests, TypeScript OpenAPI/API metadata, and Quais SDK research only after explicit approval.',
  '## Current blocker',
  'Native Qi is UTXO-model',
  'must not be represented as a normal ERC-20 token address inside `TradingVault`',
  'mock `QI-QUAI` stays mock-only',
  '## Acceptable design paths',
  '`wrapped_qi_receipt_token`',
  '`contract_native_qi_adapter`',
  '`conversion_settlement_flow`',
  '## Disallowed shortcuts',
  'Do not add `TradingVault.deposit(qiToken, amount)` for native Qi as if it were ERC-20.',
  'Do not claim real `QI-QUAI` settlement from mock proofs, mock fills, local-only contract addresses, or matcher-local balances.',
  '## Evidence required before unblocking real QI-QUAI',
  'reserve or conversion event truth',
  'redemption/unwrap proof path',
  'solvency invariant',
  '`TradeSettled` remains the public trade-proof trigger',
  'explicit Clonners approval',
  '## API and metadata boundary',
  '`nativeQiStatus: design-required`',
  '`local-only-not-deployed`',
  '`realQuaiTransactions: false`',
  '`walletRequired: false`',
  '## Delegate and custody boundary',
  '`NO_WITHDRAW`',
  '`NO_ADMIN`',
  'Delegate/API keys cannot wrap, unwrap, redeem, or withdraw native Qi.',
  '## Completed metadata tasks',
  'Completed: `/v1/contracts` exposes read-only `nativeQiStatus: design-required` metadata.',
  'Completed: OpenAPI, API, SDK, CLI, and docs ratchets keep `QI-QUAI` mock-only and local-only.',
  '## Remaining approval-gated task',
  'Task 3: Add local-only interface ratchets for the selected adapter path after approval',
  'No selected path exists yet; do not add an adapter interface until Clonners approves one path with external evidence.',
  'No deploys, RPC URLs, wallet loading, signing, broadcasts, transaction submissions, or real funds are introduced by this plan.',
];

test('native Qi wrapper/adapter boundary plan pins mock-only QI-QUAI and approval gates', async () => {
  const plan = await readRepoFile(planPath);

  for (const requiredText of requiredPlanText) {
    assert.ok(plan.includes(requiredText), `${planPath} should include ${requiredText}`);
  }

  const forbiddenRuntimeDetails = new RegExp(
    ['process\\.env', 'RPC_URL', 'CYPRUS1_PK', 'mnemo' + 'nic', 'seed' + ' phrase', 'private' + ' key'].join('|'),
    'i',
  );
  assert.doesNotMatch(plan, forbiddenRuntimeDetails, 'native Qi plan must not add env, wallet-material, or secret-bearing implementation details');
});

test('contract and architecture docs link native Qi boundary and clear stale next-slice wording', async () => {
  const contractsDoc = await readRepoFile('docs/contracts.md');
  const architectureDoc = await readRepoFile('docs/architecture.md');
  const contractsReadme = await readRepoFile('contracts/README.md');

  assert.ok(
    contractsDoc.includes('[`docs/plans/2026-06-07-native-qi-wrapper-adapter-boundary.md`](./plans/2026-06-07-native-qi-wrapper-adapter-boundary.md)'),
    'docs/contracts.md should link the native Qi boundary plan',
  );
  assert.ok(contractsDoc.includes('nativeQiStatus: design-required'));

  assert.ok(architectureDoc.includes('Native Qi wrapper/adapter boundary'));
  assert.ok(architectureDoc.includes('real `QI-QUAI` settlement remains blocked'));
  assert.ok(architectureDoc.includes('mock `QI-QUAI` stays mock-only'));

  assert.ok(contractsReadme.includes('Current metadata slice: `/v1/contracts` exposes read-only `nativeQiStatus`'));
  assert.ok(contractsReadme.includes('Recommended next slice: choose exactly one native Qi path only after explicit approval'));
  assert.doesNotMatch(
    contractsReadme,
    /Recommended next slice: (wire external dependency cleanup|add read-only `nativeQiStatus` metadata)/,
    'contracts README should not point at stale completed dependency/API/nativeQiStatus work',
  );
});
