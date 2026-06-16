import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const planPath = 'docs/plans/2026-06-08-post-nonce-cancel-owner-signed-readiness.md';

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

test('post-nonce-cancel owner-signed readiness plan pins completed prepare surfaces and future approval gates', async () => {
  const plan = await readText(planPath);

  for (const requiredText of [
    '# Post-Nonce-Cancel Owner-Signed Readiness Implementation Plan',
    '> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.',
    '**Goal:** Map the completed prepare-only nonce cancellation surfaces to the owner-signed approval gate required before any live NonceManager mutation.',
    '**Architecture:** The current API, SDK, CLI, and terminal UI stay local/source-only and display either intentional owner-signed prepare placeholders or read-only metadata.',
    '**Tech Stack:** Markdown plan/spec ratchets, Node `node:test` doc guards, existing TypeScript API/SDK/CLI/terminal UI, Python SDK docs, and local Solidity/Hardhat NonceManager evidence only after approval.',
    '## Current completed safe nonce-cancel surfaces',
    '`POST /v1/nonces/cancel`',
    '`owner-signed-nonce-cancel-placeholder`',
    '`owner_signed_nonce_cancel_not_implemented`',
    '`owner-signed-required`',
    'TypeScript SDK nonce-cancel prepare-only client',
    'Python SDK nonce-cancel prepare-only client',
    '`qdex nonces cancel --prepare`',
    'terminal UI prepare-only nonce cancel trigger',
    'terminal UI prepare-only nonce cancel panel',
    'local API + terminal UI nonce cancel prepare smoke',
    '## Owner-signed approval gate',
    'explicit Clonners approval required before owner-wallet signing, RPC URL access, broadcast, live NonceManager mutation, transaction submission, or funds movement',
    'verified `NonceManager` contract address evidence',
    '`NonceCancelled` and `NonceRangeCancelled` event-truth indexing',
    'proof-service/UI copy that separates prepare state from confirmed NonceManager event truth',
    '## Matcher-local vs owner-signed boundary',
    '`CANCEL_ORDER`',
    '`CANCEL_ALL`',
    '`NO_WITHDRAW`',
    '`NO_ADMIN`',
    'Delegate/API keys cannot submit the owner-signed nonce-cancel flow by default',
    '## Disallowed autonomous work',
    'no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, real contract address claims, live NonceManager mutation, TradingVault mutation, or funds movement',
    '## Completed terminal UI nonce cancel prepare render panel',
    '## Completed terminal UI nonce cancel prepare trigger',
    '## Completed local API + terminal UI nonce cancel prepare smoke',
    'Next bounded local/source-only slice: another bounded MVP surface; live `NonceManager` mutation remains approval-gated',
  ]) {
    assert.ok(plan.includes(requiredText), `${planPath} should include ${requiredText}`);
  }

  assert.doesNotMatch(plan, forbiddenRuntimeDetails, 'plan must not include secret/env/RPC/deploy mechanics or real tx/funds claims');
  assert.doesNotMatch(plan, /adminWithdraw|withdrawFrom|rescue|sweep/i, 'plan must not introduce admin/operator withdrawal surfaces');
});

test('contracts docs and architecture docs link the post-nonce-cancel readiness plan without runtime claims', async () => {
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');

  for (const [label, text] of [
    ['docs/contracts.md', contracts],
    ['docs/architecture.md', architecture],
  ]) {
    assert.ok(text.includes(planPath), `${label} should link the post-nonce-cancel owner-signed readiness plan`);
    assert.ok(
      text.includes('post-nonce-cancel owner-signed readiness'),
      `${label} should name the post-nonce-cancel owner-signed readiness boundary`,
    );
    assert.ok(
      text.includes('owner-signed NonceManager cancellation') || text.includes('owner-signed nonce-cancel'),
      `${label} should point to the nonce-cancel boundary rather than wallet or NonceManager mutation behavior`,
    );
    assert.doesNotMatch(
      text,
      /walletPrivateKey|rpcUrl\s*:|broadcast transaction|funds moved|NonceManager mutation submitted/i,
      `${label} must not claim wallet/RPC/tx/funds/NonceManager mutation behavior is active`,
    );
  }
});

test('campaign status moves from nonce cancel prepare smoke to the post-nonce-cancel readiness checkpoint', async () => {
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'Completed this run: local API + terminal UI nonce cancel prepare render smoke',
    'post-nonce-cancel owner-signed readiness docs',
  ]) {
    assert.ok(status.includes(requiredText), `CAMPAIGN_STATUS.md should include ${requiredText}`);
  }
});
