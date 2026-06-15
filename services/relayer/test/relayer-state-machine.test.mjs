import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRelayerStateMachine } from '../src/state-machine.js';

const MOCK_FILL = {
  fillId: 'fill-000001',
  marketId: 'WQUAI-WQI',
  makerOrderHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
  takerOrderHash: '0x0000000000000000000000000000000000000000000000000000000000000002',
  maker: '0x1111111111111111111111111111111111111111',
  taker: '0x3333333333333333333333333333333333333333',
  price: '123000000000000000',
  amount: '1000000000000000000',
  makerFee: '0',
  takerFee: '0',
  settlementMode: 'mock',
};

describe('relayer state machine', () => {
  it('rejects FillPacket with missing required fields', () => {
    const relayer = createRelayerStateMachine();
    const result = relayer.submitFillPacket({ fillId: 'fill-000001' });

    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'validation_failed');
    assert.equal(result.state, 'failed_terminal');
    assert.equal(result.fillId, 'fill-000001');
    assert.ok(result.missingFields);
  });

  it('rejects FillPacket with non-decimal-string price/amount', () => {
    const relayer = createRelayerStateMachine();
    const result = relayer.submitFillPacket({
      ...MOCK_FILL,
      price: 'not-a-number',
    });

    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'validation_failed');
    assert.equal(result.state, 'failed_terminal');
  });

  it('rejects FillPacket with negative amount', () => {
    const relayer = createRelayerStateMachine();
    const result = relayer.submitFillPacket({
      ...MOCK_FILL,
      amount: '-100',
    });

    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'validation_failed');
  });

  it('rejects FillPacket with unknown settlement mode', () => {
    const relayer = createRelayerStateMachine();
    const result = relayer.submitFillPacket({
      ...MOCK_FILL,
      settlementMode: 'unknown_mode',
    });

    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'validation_failed');
    assert.ok(result.missingFields?.includes('settlementMode'));
  });

  it('rejects quai_contract settlement mode without approval', () => {
    const relayer = createRelayerStateMachine();
    const result = relayer.submitFillPacket({
      ...MOCK_FILL,
      settlementMode: 'quai_contract',
    });

    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'quai_contract_approval_gate_blocked');
  });

  it('accepts valid mock FillPacket and transitions to received state', () => {
    const relayer = createRelayerStateMachine();
    const result = relayer.submitFillPacket(MOCK_FILL);

    assert.equal(result.accepted, true);
    assert.equal(result.state, 'received');
    assert.equal(result.fillId, 'fill-000001');
    assert.equal(result.settlementMode, 'mock');
    assert.ok(result.events);
    assert.equal(result.events[0]?.type, 'RELAYER_RECEIVED');
  });

  it('is idempotent by fillId — re-submitting same FillPacket returns existing state', () => {
    const relayer = createRelayerStateMachine();
    const first = relayer.submitFillPacket(MOCK_FILL);
    assert.equal(first.state, 'received');

    const second = relayer.submitFillPacket(MOCK_FILL);
    assert.equal(second.accepted, true);
    assert.equal(second.state, 'received');
    assert.equal(second.fillId, 'fill-000001');
  });

  it('rejects same fillId with different payload hash as terminal conflict', () => {
    const relayer = createRelayerStateMachine();
    relayer.submitFillPacket(MOCK_FILL);
    const conflict = relayer.submitFillPacket({
      ...MOCK_FILL,
      price: '999000000000000000',
    });

    assert.equal(conflict.accepted, false);
    assert.equal(conflict.reason, 'fill_id_conflict');
    assert.equal(conflict.state, 'failed_terminal');
  });

  it('transitions from received to validated', () => {
    const relayer = createRelayerStateMachine();
    relayer.submitFillPacket(MOCK_FILL);
    const result = relayer.validateFill('fill-000001');

    assert.equal(result.accepted, true);
    assert.equal(result.state, 'validated');
    assert.equal(result.fillId, 'fill-000001');
    assert.ok(result.checked?.includes('market'));
    assert.ok(result.checked?.includes('replay_domain'));
    assert.ok(result.events?.some((e) => e.type === 'RELAYER_VALIDATED'));
  });

  it('cannot validate a fill that does not exist', () => {
    const relayer = createRelayerStateMachine();
    const result = relayer.validateFill('fill-999999');

    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'fill_not_found');
  });

  it('transitions from validated to submitted (mock)', () => {
    const relayer = createRelayerStateMachine();
    relayer.submitFillPacket(MOCK_FILL);
    relayer.validateFill('fill-000001');
    const result = relayer.submitFill('fill-000001');

    assert.equal(result.accepted, true);
    assert.equal(result.state, 'submitted');
    assert.equal(result.settlementMode, 'mock');
    assert.ok(result.mockSettlementReference);
    assert.equal(result.settlementTx, null);
    assert.ok(result.events?.some((e) => e.type === 'RELAYER_SUBMITTED'));
  });

  it('transitions from submitted to confirmed (mock)', () => {
    const relayer = createRelayerStateMachine();
    relayer.submitFillPacket(MOCK_FILL);
    relayer.validateFill('fill-000001');
    relayer.submitFill('fill-000001');
    const result = relayer.confirmSettlement('fill-000001');

    assert.equal(result.accepted, true);
    assert.equal(result.state, 'confirmed');
    assert.equal(result.settlementMode, 'mock');
    assert.ok(result.mockSettlementReference);
    assert.equal(result.settlementTx, null);
    assert.equal(result.blockNumber, null);
    assert.equal(result.eventIndex, null);
    assert.equal(result.explorerUrl, null);
    assert.ok(result.events?.some((e) => e.type === 'SETTLEMENT_CONFIRMED'));
  });

  it('cannot transition confirmed back to mutable state', () => {
    const relayer = createRelayerStateMachine();
    relayer.submitFillPacket(MOCK_FILL);
    relayer.validateFill('fill-000001');
    relayer.submitFill('fill-000001');
    relayer.confirmSettlement('fill-000001');
    const retry = relayer.submitFill('fill-000001');

    assert.equal(retry.accepted, false);
    assert.equal(retry.reason, 'state_immutable');
  });

  it('transitions from submitted to failed_retryable', () => {
    const relayer = createRelayerStateMachine();
    relayer.submitFillPacket(MOCK_FILL);
    relayer.validateFill('fill-000001');
    relayer.submitFill('fill-000001');
    const result = relayer.failSettlement('fill-000001', 'rpc_timeout', 'retryable');

    assert.equal(result.accepted, true);
    assert.equal(result.state, 'failed_retryable');
    assert.equal(result.reason, 'rpc_timeout');
    assert.ok(result.events?.some((e) => e.type === 'SETTLEMENT_FAILED_RETRYABLE'));
  });

  it('transitions from submitted to failed_terminal', () => {
    const relayer = createRelayerStateMachine();
    relayer.submitFillPacket(MOCK_FILL);
    relayer.validateFill('fill-000001');
    relayer.submitFill('fill-000001');
    const result = relayer.failSettlement('fill-000001', 'fee_cap_exceeded', 'terminal');

    assert.equal(result.accepted, true);
    assert.equal(result.state, 'failed_terminal');
    assert.equal(result.reason, 'fee_cap_exceeded');
    assert.ok(result.events?.some((e) => e.type === 'SETTLEMENT_FAILED_TERMINAL'));
  });

  it('failed_terminal cannot transition back to retry', () => {
    const relayer = createRelayerStateMachine();
    relayer.submitFillPacket(MOCK_FILL);
    relayer.validateFill('fill-000001');
    relayer.submitFill('fill-000001');
    relayer.failSettlement('fill-000001', 'fee_cap_exceeded', 'terminal');
    const retry = relayer.validateFill('fill-000001');

    assert.equal(retry.accepted, false);
    assert.equal(retry.reason, 'state_immutable');
  });

  it('failed_retryable can transition back to validated', () => {
    const relayer = createRelayerStateMachine();
    relayer.submitFillPacket(MOCK_FILL);
    relayer.validateFill('fill-000001');
    relayer.submitFill('fill-000001');
    relayer.failSettlement('fill-000001', 'rpc_timeout', 'retryable');
    const result = relayer.validateFill('fill-000001');

    assert.equal(result.accepted, true);
    assert.equal(result.state, 'validated');
  });

  it('preserves NO_WITHDRAW and NO_ADMIN in all results', () => {
    const relayer = createRelayerStateMachine();
    const received = relayer.submitFillPacket(MOCK_FILL);
    assert.equal(received.permissions?.includes('NO_WITHDRAW'), true);
    assert.equal(received.permissions?.includes('NO_ADMIN'), true);
    assert.equal(received.custody, 'non-custodial-relayer');
  });

  it('mock confirmation preserves explicit safety metadata', () => {
    const relayer = createRelayerStateMachine();
    relayer.submitFillPacket(MOCK_FILL);
    relayer.validateFill('fill-000001');
    relayer.submitFill('fill-000001');
    const result = relayer.confirmSettlement('fill-000001');

    assert.equal(result.settlementMode, 'mock');
    assert.equal(result.settlementTx, null);
    assert.equal(result.blockNumber, null);
    assert.equal(result.blockHash, null);
    assert.equal(result.eventIndex, null);
    assert.equal(result.explorerUrl, null);
    assert.equal(result.realQuaiTransactions, false);
    assert.equal(result.walletRequired, false);
    assert.equal(result.fundsMoved, false);
  });

  it('getFillState returns current lifecycle state', () => {
    const relayer = createRelayerStateMachine();
    relayer.submitFillPacket(MOCK_FILL);
    relayer.validateFill('fill-000001');
    relayer.submitFill('fill-000001');
    relayer.confirmSettlement('fill-000001');

    const state = relayer.getFillState('fill-000001');
    assert.equal(state.fillId, 'fill-000001');
    assert.equal(state.state, 'confirmed');
    assert.equal(state.settlementMode, 'mock');
    assert.ok(state.events);
    assert.equal(state.events.length, 4);
  });

  it('getFillState returns null for unknown fillId', () => {
    const relayer = createRelayerStateMachine();
    const state = relayer.getFillState('fill-999999');
    assert.equal(state, null);
  });

  it('getPendingFills returns only non-terminal fills', () => {
    const relayer = createRelayerStateMachine();
    relayer.submitFillPacket(MOCK_FILL);
    relayer.submitFillPacket({ ...MOCK_FILL, fillId: 'fill-000002' });
    relayer.validateFill('fill-000001');
    relayer.submitFill('fill-000001');
    relayer.confirmSettlement('fill-000001');

    const pending = relayer.getPendingFills();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].fillId, 'fill-000002');
    assert.equal(pending[0].state, 'received');
  });

  it('getConfirmedFills returns only confirmed fills', () => {
    const relayer = createRelayerStateMachine();
    relayer.submitFillPacket(MOCK_FILL);
    relayer.validateFill('fill-000001');
    relayer.submitFill('fill-000001');
    relayer.confirmSettlement('fill-000001');

    const confirmed = relayer.getConfirmedFills();
    assert.equal(confirmed.length, 1);
    assert.equal(confirmed[0].fillId, 'fill-000001');
    assert.equal(confirmed[0].state, 'confirmed');
  });
});
