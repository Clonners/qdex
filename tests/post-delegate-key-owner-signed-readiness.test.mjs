import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const planPath = 'docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md';
const delegateDocPath = 'docs/delegate-keys.md';

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

test('post-delegate-key owner-signed readiness plan pins completed prepare surfaces and future approval gates', async () => {
  const plan = await readText(planPath);

  for (const requiredText of [
    '# Post-Delegate-Key Owner-Signed Readiness Implementation Plan',
    '> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.',
    '**Goal:** Map the completed read-only and prepare-only delegate/API key surfaces to the owner-signed approval gate required before any live DelegateKeyRegistry mutation.',
    '**Architecture:** The current API, SDK, CLI, and terminal UI stay local/source-only and display either `delegate-key-registry-projection` metadata or intentional owner-signed prepare placeholders.',
    '**Tech Stack:** Markdown plan/spec ratchets, Node `node:test` doc guards, existing TypeScript API/SDK/CLI/terminal UI, Python SDK docs, and local Solidity/Hardhat DelegateKeyRegistry evidence only after approval.',
    '## Current completed safe delegate/API key surfaces',
    '`GET /v1/delegate-keys`',
    '`POST /v1/delegate-keys`',
    '`DELETE /v1/delegate-keys/{keyId}`',
    '`delegate-key-registry-projection`',
    '`delegate-key-owner-signed-prepare-boundary`',
    '`prepare-only-owner-signed-required`',
    '`owner-wallet-signature-required`',
    'TypeScript SDK `delegateKeys.prepareRegister()` / `delegateKeys.prepareRevoke()`',
    'Python SDK `delegate_keys.prepare_register()` / `delegate_keys.prepare_revoke()`',
    '`qdex api create-key --prepare` / `qdex api revoke-key --prepare`',
    'terminal UI prepare-only delegate/API key panel',
    'local API + terminal UI delegate/API key prepare smoke',
    '## Owner-signed approval gate',
    'explicit Clonners approval required before owner-wallet signing, RPC URL access, broadcast, live DelegateKeyRegistry mutation, transaction submission, or funds movement',
    'verified `DelegateKeyRegistry` contract address evidence',
    '`DelegateKeyRegistered` and `DelegateKeyRevoked` event-truth indexing',
    'proof-service/UI copy that separates prepare state from confirmed registry event truth',
    '## Delegate permission boundary',
    '`READ_ONLY`',
    '`PLACE_ORDER`',
    '`CANCEL_ORDER`',
    '`CANCEL_ALL`',
    '`NO_WITHDRAW`',
    '`NO_ADMIN`',
    'There is intentionally no positive `WITHDRAW` or `ADMIN` delegate permission in the MVP interface.',
    '## Disallowed autonomous work',
    'no wallet loading, RPC URL access, signing, broadcasts, deploys, transaction submission, real token addresses, real contract address claims, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement',
    '## Completed projection schema slice',
    'Completed: read-only DelegateKeyRegistry `DelegateKeyRegistered`/`DelegateKeyRevoked` projection schema ratchet',
    'Completed: read-only delegate-key registration/revocation history API envelopes',
    'Completed: read-only TypeScript/Python/qdex delegate-key history clients for `GET /v1/delegate-keys/registrations` and `GET /v1/delegate-keys/revocations`',
    'Completed: terminal UI read-only delegate-key history panel for those projection envelopes',
    'Completed: local API + terminal UI delegate-key history integration smoke',
    'Completed: private DelegateKeyRegistry registration/revocation WebSocket snapshot alignment for `/v1/ws?channel=delegate-key-registrations` and `/v1/ws?channel=delegate-key-revocations`',
    'Completed: terminal UI binding for private DelegateKeyRegistry history streams',
    'Next bounded local/source-only slice: local API + terminal UI DelegateKeyRegistry history stream integration smoke',
  ]) {
    assert.ok(plan.includes(requiredText), `${planPath} should include ${requiredText}`);
  }

  assert.doesNotMatch(plan, forbiddenRuntimeDetails, 'plan must not include secret/env/RPC/deploy mechanics or real tx/funds claims');
  assert.doesNotMatch(plan, /adminWithdraw|withdrawFrom|rescue|sweep/i, 'plan must not introduce admin/operator withdrawal surfaces');
});

test('delegate key docs and core docs link the readiness plan without runtime registry mutation claims', async () => {
  const delegateDoc = await readText(delegateDocPath);
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');

  for (const [label, text] of [
    [delegateDocPath, delegateDoc],
    ['docs/contracts.md', contracts],
    ['docs/architecture.md', architecture],
  ]) {
    assert.ok(text.includes(planPath), `${label} should link the post-delegate-key owner-signed readiness plan`);
    assert.ok(
      text.includes('post-delegate-key owner-signed readiness'),
      `${label} should name the post-delegate-key owner-signed readiness boundary`,
    );
    assert.ok(
      text.includes('read-only DelegateKeyRegistry `DelegateKeyRegistered`/`DelegateKeyRevoked` projection schema'),
      `${label} should point to the next event-projection schema rather than wallet or registry mutation behavior`,
    );
    assert.doesNotMatch(
      text,
      /walletPrivateKey|rpcUrl\s*:|broadcast transaction|funds moved|DelegateKeyRegistry mutation submitted/i,
      `${label} must not claim wallet/RPC/tx/funds/registry mutation behavior is active`,
    );
  }
});

test('campaign status moves from delegate prepare smoke to the post-delegate readiness checkpoint', async () => {
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'Completed previous run: local API + terminal UI delegate/API key prepare smoke',
    'Completed previous run: post-delegate-key owner-signed readiness docs added `docs/plans/2026-06-08-post-delegate-key-owner-signed-readiness.md` plus delegate/core doc links',
    'Completed previous run: read-only DelegateKeyRegistry registration/revocation projection schema ratchet added `DelegateKeyRegisteredProjection` and `DelegateKeyRevokedProjection`',
    'Completed previous run: read-only delegate-key registration/revocation history API envelopes',
    'Completed previous run: read-only TypeScript/Python/qdex delegate-key history clients',
    'Completed previous run: terminal UI read-only delegate-key history panel',
    'Completed previous run: local API + terminal UI delegate-key history integration smoke',
    'Completed previous run: private DelegateKeyRegistry registration/revocation WebSocket snapshot alignment',
    'Completed this run: terminal UI private DelegateKeyRegistry history stream binding',
    'Next autonomous slice: local API + terminal UI DelegateKeyRegistry history stream integration smoke',
    'Still not approved: wallets, RPC URLs, signing, broadcasts, deploys, real token addresses, transaction helpers, live `DelegateKeyRegistry` mutation, real network `MarketRegistry` mutation, public servers, remote pushes, or funds movement.',
  ]) {
    assert.ok(status.includes(requiredText), `CAMPAIGN_STATUS.md should include ${requiredText}`);
  }
});
