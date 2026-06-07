import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  evaluateRelayerSettlementModeGate,
  REQUIRED_QUAI_EVENT_TRUTH_FIELDS,
} from '../services/relayer/src/approval-gate.js';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const completeApproval = {
  explicitApproval: true,
  approvalId: 'clonners-approved-real-quai-relayer-001',
  approvedBy: 'Clonners',
  approvedAt: '2026-06-06T00:00:00.000Z',
  scope: 'single-zone-quai-contract-relayer-gate',
};

const completeEventTruth = {
  proofTrigger: 'TradeSettled',
  settlementContract: '0x1111111111111111111111111111111111111111',
  chainId: 'cyprus-1-local-hardhat-placeholder',
  zone: 'cyprus-1-single-zone',
  indexerSource: 'quai-contract-event-indexer',
  finalityDepth: 12,
  requiredFields: REQUIRED_QUAI_EVENT_TRUTH_FIELDS,
};

test('quai_contract relayer mode is blocked without explicit approval and event-truth inputs', () => {
  const result = evaluateRelayerSettlementModeGate({ settlementMode: 'quai_contract' });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'real_quai_approval_gate_blocked');
  assert.equal(result.realQuaiTransactions, false);
  assert.equal(result.walletRequired, false);
  assert.equal(result.custody, 'non-custodial-relayer-gate');
  assert.ok(result.safetyNotice.includes('explicit Clonners approval'));
  assert.ok(result.safetyNotice.includes('no wallet loading, signing, broadcast, RPC URL, or transaction submission'));

  for (const missingField of [
    'approval.explicitApproval',
    'approval.approvalId',
    'approval.approvedBy',
    'approval.approvedAt',
    'approval.scope',
    'eventTruth.proofTrigger',
    'eventTruth.settlementContract',
    'eventTruth.chainId',
    'eventTruth.zone',
    'eventTruth.indexerSource',
    'eventTruth.finalityDepth',
    'eventTruth.requiredFields.settlementTx',
    'eventTruth.requiredFields.blockNumber',
    'eventTruth.requiredFields.blockHash',
    'eventTruth.requiredFields.eventIndex',
    'eventTruth.requiredFields.explorerUrl',
  ]) {
    assert.ok(result.missingFields.includes(missingField), `expected missing field ${missingField}`);
  }
});

test('complete real-Quai approval gate returns activation-ready metadata without tx behavior', () => {
  const result = evaluateRelayerSettlementModeGate({
    settlementMode: 'quai_contract',
    approval: completeApproval,
    eventTruth: completeEventTruth,
  });

  assert.deepEqual(result, {
    allowed: true,
    reason: 'real_quai_approval_gate_ready',
    settlementMode: 'quai_contract',
    proofTrigger: 'TradeSettled',
    requiredEventTruthFields: REQUIRED_QUAI_EVENT_TRUTH_FIELDS,
    realQuaiTransactions: false,
    walletRequired: false,
    custody: 'non-custodial-relayer-gate',
    approvalId: completeApproval.approvalId,
    nextAction: 'separately-approved-wallet-and-broadcast-implementation-required',
    safetyNotice:
      'Real Quai relayer mode is approval-gated: this gate only validates explicit approval and event-truth readiness; it performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.',
  });
});

test('mock mode remains local-only and does not need real-Quai approval inputs', () => {
  const result = evaluateRelayerSettlementModeGate({ settlementMode: 'mock' });

  assert.deepEqual(result, {
    allowed: true,
    reason: 'mock_mode_local_only',
    settlementMode: 'mock',
    requiredEventTruthFields: [],
    realQuaiTransactions: false,
    walletRequired: false,
    custody: 'non-custodial-relayer-gate',
    safetyNotice: 'Mock mode is local-only: no real Quai transaction, no explorer URL, and no funds moved.',
  });
});

test('OpenAPI exposes read-only relayer settlement-mode gate status', async () => {
  const openapi = await readText('docs/api-openapi.yaml');

  for (const requiredText of [
    '/v1/relayer/settlement-mode-gate:',
    '$ref: "#/components/schemas/RelayerSettlementModeGateStatus"',
    'RelayerSettlementModeGateStatus:',
    'RelayerModeGateResult:',
    'relayer-approval-gate',
    'quai_contract',
    'real_quai_approval_gate_blocked',
    'requiredEventTruthFields:',
    'noWalletLoading:',
    'noTransactionSubmission:',
    'Read-only relayer gate metadata only',
  ]) {
    assert.ok(openapi.includes(requiredText), `docs/api-openapi.yaml should include ${requiredText}`);
  }
});

test('relayer approval gate docs are explicit and source stays side-effect free', async () => {
  const spec = await readText('services/relayer/spec.md');
  const source = await readText('services/relayer/src/approval-gate.js');

  for (const requiredText of [
    '## Real Quai approval gate',
    'explicit Clonners approval',
    'requiredEventTruthFields',
    'settlementTx',
    'blockNumber',
    'blockHash',
    'eventIndex',
    'explorerUrl',
    'TradeSettled',
    'no wallet loading, signing, broadcast, RPC URL, or transaction submission is implemented by this gate',
    'realQuaiTransactions: false',
    'walletRequired: false',
    'GET /v1/relayer/settlement-mode-gate',
    'read-only API status',
  ]) {
    assert.ok(spec.includes(requiredText), `services/relayer/spec.md should include ${requiredText}`);
  }

  for (const forbiddenSourceText of ['process.env', 'fetch(', 'sendTransaction', 'signTransaction', 'privateKey']) {
    assert.equal(
      source.includes(forbiddenSourceText),
      false,
      `approval gate source should not include side-effect hook ${forbiddenSourceText}`,
    );
  }
});
