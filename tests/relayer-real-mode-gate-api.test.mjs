import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

test('OpenAPI RelayerSettlementModeGateStatus includes realModeRequiredChecks and realModeReadiness', async () => {
  const openapi = await readText('docs/api-openapi.yaml');

  for (const requiredText of [
    'realModeRequiredChecks:',
    'RealModeReadinessResult:',
    'realModeReadiness:',
    'real_mode_checks_passed',
    'real_mode_checks_failed',
    'receipt_wait',
    'failure_classification',
    'explicit_approval',
    'complete_contracts',
    'chain_id_match',
    'signatures_present',
    'market_enabled',
    'fee_within_caps',
    'nonces_available',
    'delegate_NO_WITHDRAW',
    'delegate_NO_ADMIN',
    'slippage_bounds',
    'order_amount_valid',
    'failedChecks:',
    'checkFailures:',
    'realQuaiTransactions:',
    'walletRequired:',
    'fundsMoved:',
    'noWalletLoading:',
    'noTransactionSubmission:',
    'Read-only relayer real-mode readiness metadata',
  ]) {
    assert.ok(openapi.includes(requiredText), `docs/api-openapi.yaml should include ${requiredText}`);
  }
});

test('API source createRelayerSettlementModeGateStatus includes realModeRequiredChecks and realModeReadiness', async () => {
  const source = await readText('services/api/src/relayer-gate-status.js');

  assert.ok(source.includes('evaluateRelayerRealModeReadiness'), 'should import the real-mode readiness evaluator');
  assert.ok(source.includes('REAL_MODE_REQUIRED_CHECKS'), 'should import the required checks list');
  assert.ok(source.includes('realModeRequiredChecks: REAL_MODE_REQUIRED_CHECKS'), 'should include required checks in response');
  assert.ok(source.includes('realModeReadiness: evaluateRelayerRealModeReadiness'), 'should include readiness evaluation in response');
});

test('real-mode-gate.js exports and preserves safety metadata in all paths', async () => {
  const { evaluateRelayerRealModeReadiness, REAL_MODE_REQUIRED_CHECKS } = await import('../services/relayer/src/real-mode-gate.js');

  assert.ok(Array.isArray(REAL_MODE_REQUIRED_CHECKS));
  assert.equal(REAL_MODE_REQUIRED_CHECKS.length, 13, 'should have exactly 13 required checks');

  // Mock mode
  const mockResult = evaluateRelayerRealModeReadiness({ settlementMode: 'mock' });
  assert.equal(mockResult.allowed, true);
  assert.equal(mockResult.realQuaiTransactions, false);
  assert.equal(mockResult.walletRequired, false);
  assert.equal(mockResult.fundsMoved, false);

  // quai_contract with no inputs — fails all checks
  const blockedResult = evaluateRelayerRealModeReadiness({ settlementMode: 'quai_contract' });
  assert.equal(blockedResult.allowed, false);
  assert.equal(blockedResult.reason, 'real_mode_checks_failed');
  assert.equal(blockedResult.failedChecks.length, 13);
  assert.equal(blockedResult.realQuaiTransactions, false);
  assert.equal(blockedResult.walletRequired, false);
  assert.equal(blockedResult.fundsMoved, false);

  // Unknown mode
  const unknownResult = evaluateRelayerRealModeReadiness({ settlementMode: 'unknown' });
  assert.equal(unknownResult.allowed, false);
  assert.equal(unknownResult.reason, 'unsupported_settlement_mode');
  assert.equal(unknownResult.realQuaiTransactions, false);
});

test('CAMPAIGN_STATUS.md records relayer state machine and real-mode gate slice completed', async () => {
  const status = await readText('CAMPAIGN_STATUS.md');

  assert.ok(status.includes('relayer state machine workspace package'), 'status should record relayer slice');
  assert.ok(status.includes('createRelayerStateMachine'), 'status should reference relayer factory');
  assert.ok(status.includes('relayer-real-mode-gate-api.test.mjs'), 'status should reference this ratchet reconciliation');
});
