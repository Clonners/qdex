import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const planPath = 'docs/plans/2026-06-08-testnet-cutover-real-settlement-readiness.md';

test('testnet cutover plan freezes local MVP and keeps real-network gates closed', async () => {
  const plan = await readText(planPath);

  for (const requiredText of [
    'Move QDEX from the source-only/local MVP to an approval-gated Quai testnet MVP',
    'Freeze the local MVP as feature-complete',
    'No real/testnet RPC use.',
    'No wallet import or wallet generation.',
    'No contract deploys.',
    'No transaction signing or broadcasts.',
    'No test funds movement.',
    'No remote Git push.',
    'ORDER_MATCHED` is never final settlement',
    '`TradeSettled`',
    '`Deposit`',
    '`Withdraw`',
    '`NonceUsed`',
    '`DelegateKeyRegistered`',
    '`DelegateKeyRevoked`',
    'Delegate/API keys cannot withdraw.',
    'Delegate/API keys cannot admin markets/fees/listings.',
    'local MVP feature-complete; testnet real-settlement cutover pending approval and implementation',
  ]) {
    assert.ok(plan.includes(requiredText), `cutover plan should include ${requiredText}`);
  }

  assert.doesNotMatch(
    plan,
    /https:\/\/[^\s`]*rpc|0x[a-fA-F0-9]{40}/i,
    'cutover plan must not embed secrets, live RPC URLs, or real addresses',
  );
});

test('campaign status points next autonomous work at the source-only testnet cutover plan', async () => {
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    'Current phase: local API + terminal UI keyboard-shortcut help smoke for read-only/local mock actions is complete',
    'local MVP is feature-complete for source-only/demo purposes',
    'next autonomous work should stop adding UI/local polish and move to a source-only testnet cutover readiness plan',
    'Next autonomous slice: source-only testnet cutover readiness plan',
    planPath,
    'Still not approved: wallets, RPC URLs, signing, broadcasts, deploys, real token addresses',
  ]) {
    assert.ok(status.includes(requiredText), `campaign status should include ${requiredText}`);
  }

  assert.doesNotMatch(
    status,
    /wallet loaded for testnet cutover|broadcast testnet transaction|RPC URL configured for testnet|funds moved by testnet cutover/i,
    'campaign status must not claim real network side effects',
  );
});
