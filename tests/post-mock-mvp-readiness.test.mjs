import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const planPath = 'docs/plans/2026-06-06-post-mock-mvp-readiness-owner-signed-nonce-cancel.md';

test('post-mock MVP readiness plan pins owner-signed nonce-cancel and approval gates', async () => {
  const plan = await readText(planPath);

  for (const requiredText of [
    '# Post-Mock MVP Readiness and Owner-Signed Nonce-Cancel Implementation Plan',
    '> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.',
    '**Goal:** Replace the current local mock DEX loop with approval-gated real Quai readiness without losing non-custodial invariants.',
    '**Architecture:** The current mock loop remains the executable MVP while this plan maps each mock plane to local-only ratchets and explicit approval gates.',
    '**Tech Stack:** Node `node:test` doc ratchets, TypeScript API/SDK/CLI/UI, Python SDK docs, Solidity `0.8.20` local Hardhat contracts, and Quais SDK/Orchard only after approval.',
    '## Current local MVP boundary',
    'mock market -> signed/mock orders -> deterministic matching -> FillPacket -> mock settlement confirmed -> indexed fill/proof projection',
    '`settlementMode: mock`',
    '`realQuaiTransactions: false`',
    '`walletRequired: false`',
    'No deploys, RPC URLs, wallets, transaction sends, or real funds are introduced by this plan.',
    '## Gap map before real Quai replacement',
    'Native Qi remains UTXO-model and needs a wrapper/adapter/conversion design before any real `QI-QUAI` settlement claim.',
    '## Owner-signed nonce-cancel boundary',
    'Matcher-local cancellation removes only open matcher quantity',
    'does not mutate `NonceManager`',
    'Owner-signed nonce cancellation is the separate contract-facing flow',
    '`cancelNonce(uint256 nonce)`',
    '`cancelNonceRange(uint256 from, uint256 to)`',
    'main wallet',
    'Delegate/API keys cannot submit this flow',
    '`NO_WITHDRAW`',
    '`NO_ADMIN`',
    '`CANCEL_ORDER`',
    '`CANCEL_ALL`',
    '## Approval gates',
    'Real Quai deployment addresses',
    'verified source links',
    'event-truth indexing',
    'Quais SDK relayer mode',
    'explicit Clonners approval',
    '## Completed post-mock readiness tasks',
    '### Completed Task 1: Owner-signed nonce-cancel API/OpenAPI placeholder',
    'Completed: `POST /v1/nonces/cancel` returns a prepare-only `501` boundary',
    '### Completed Task 2: SDK/CLI nonce-cancel prepare-only clients',
    'Completed: TypeScript SDK, Python SDK, and `qdex nonces cancel --prepare` call the placeholder without treating it as a generic failure.',
    '### Completed Task 3: Nonce-cancel proof/indexer projection boundary',
    'Completed: future `NonceCancelled` and `NonceRangeCancelled` event projections are separated from matcher-local cancellation events.',
    '### Completed Task 4: Relayer real-Quai approval gate',
    'Completed: `quai_contract` mode is blocked unless explicit Clonners approval and event-truth readiness metadata are present.',
    '### Completed Task 5: Native Qi wrapper/adapter boundary plan',
    'Completed: [`docs/plans/2026-06-07-native-qi-wrapper-adapter-boundary.md`](./2026-06-07-native-qi-wrapper-adapter-boundary.md) keeps mock `QI-QUAI` mock-only and limits future paths.',
    '## Remaining approval-gated decision',
    'Choose exactly one native Qi path only after explicit Clonners approval and external evidence.',
    'Do not add adapter interfaces, wallets, RPC URLs, signing, broadcasts, deploys, or real Qi settlement claims until the path is selected.',
  ]) {
    assert.ok(plan.includes(requiredText), `${planPath} should include ${requiredText}`);
  }

  assert.doesNotMatch(plan, /## Next implementation tasks/, 'post-mock plan should not advertise completed tasks as next work');

  const forbiddenRuntimeDetails = new RegExp(['process\\.env', 'RPC_URL', 'mnemo' + 'nic', 'seed' + ' phrase'].join('|'));
  assert.doesNotMatch(plan, forbiddenRuntimeDetails, 'plan must not add env, wallet-material, or secret-bearing implementation details');
});

test('contracts and architecture docs link the post-mock readiness plan', async () => {
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');

  assert.ok(
    contracts.includes('Post-mock readiness / owner-signed nonce-cancel plan'),
    'docs/contracts.md should name the post-mock readiness plan',
  );
  assert.ok(contracts.includes(`./plans/2026-06-06-post-mock-mvp-readiness-owner-signed-nonce-cancel.md`));

  assert.ok(
    architecture.includes('Post-mock MVP readiness'),
    'docs/architecture.md should explain the post-mock readiness boundary',
  );
  assert.ok(architecture.includes('Matcher-local cancellation is not on-chain nonce cancellation'));
  assert.ok(architecture.includes('owner-signed NonceManager flow'));
});
