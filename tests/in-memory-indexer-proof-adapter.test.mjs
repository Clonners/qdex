import assert from 'node:assert/strict';
import test from 'node:test';

import { createInMemoryIndexerProjection } from '../services/indexer/src/in-memory-projection.js';
import { createInMemoryProofService } from '../services/proof-service/src/in-memory-proof-service.js';

const MAKER = '0x1111111111111111111111111111111111111111';
const TAKER = '0x3333333333333333333333333333333333333333';
const MAKER_ORDER_HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TAKER_ORDER_HASH = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const mockConfirmedSettlementEvent = (overrides = {}) => ({
  eventId: 'event-000001',
  type: 'SETTLEMENT_CONFIRMED',
  source: 'mock-settlement',
  fillId: 'fill-000001',
  tradeId: 'trade-000001',
  orderHashes: [MAKER_ORDER_HASH, TAKER_ORDER_HASH],
  settlementMode: 'mock',
  mockSettlementReference: 'mock-settlement-fill-000001',
  settlementTx: null,
  blockNumber: null,
  blockHash: null,
  eventIndex: 0,
  maker: MAKER,
  taker: TAKER,
  market: 'QI-QUAI',
  price: '5',
  amount: '100',
  fees: {
    maker: '0',
    taker: '0',
  },
  explorerUrl: null,
  ...overrides,
});

test('in-memory indexer projects confirmed mock settlement into fill trade and proof rows', () => {
  const indexer = createInMemoryIndexerProjection();
  const proofService = createInMemoryProofService({ indexer });
  const event = mockConfirmedSettlementEvent();

  assert.deepEqual(indexer.projectSettlementEvent(event), {
    projected: true,
    eventIdentity: 'mock:mock-settlement-fill-000001:0',
    fillId: 'fill-000001',
    tradeId: 'trade-000001',
  });

  assert.deepEqual(indexer.listFills(), [
    {
      fillId: 'fill-000001',
      tradeId: 'trade-000001',
      marketId: 'QI-QUAI',
      makerOrderHash: MAKER_ORDER_HASH,
      takerOrderHash: TAKER_ORDER_HASH,
      maker: MAKER,
      taker: TAKER,
      price: '5',
      amount: '100',
      makerFee: '0',
      takerFee: '0',
      settlementMode: 'mock',
      settlementStatus: 'confirmed',
      sourceEventId: 'event-000001',
    },
  ]);

  assert.deepEqual(indexer.listTrades('QI-QUAI'), [
    {
      tradeId: 'trade-000001',
      fillId: 'fill-000001',
      marketId: 'QI-QUAI',
      price: '5',
      amount: '100',
      settlementStatus: 'confirmed',
      proofUrl: '/v1/proofs/trades/trade-000001',
    },
  ]);

  assert.deepEqual(proofService.getTradeProof('trade-000001'), {
    statusCode: 200,
    body: {
      tradeId: 'trade-000001',
      source: 'proof-service-indexer-projection',
      custody: 'non-custodial-no-withdrawal-authority',
      proof: {
        tradeId: 'trade-000001',
        fillId: 'fill-000001',
        orderHashes: [MAKER_ORDER_HASH, TAKER_ORDER_HASH],
        settlementMode: 'mock',
        mockSettlementReference: 'mock-settlement-fill-000001',
        settlementTx: null,
        blockNumber: null,
        blockHash: null,
        eventIndex: 0,
        maker: MAKER,
        taker: TAKER,
        market: 'QI-QUAI',
        price: '5',
        amount: '100',
        fees: {
          maker: '0',
          taker: '0',
        },
        explorerUrl: null,
        safetyNotice: 'Mock proof only: no real Quai transaction, no explorer URL, no funds moved.',
        rawEvent: {
          eventId: 'event-000001',
          type: 'SETTLEMENT_CONFIRMED',
          source: 'mock-settlement',
          fillId: 'fill-000001',
          settlementMode: 'mock',
          mockSettlementReference: 'mock-settlement-fill-000001',
          settlementTx: null,
          blockNumber: null,
          blockHash: null,
          eventIndex: 0,
        },
        createdFromEventId: 'event-000001',
      },
    },
  });

  assert.deepEqual(indexer.projectSettlementEvent(event), {
    projected: false,
    reason: 'duplicate_event',
    eventIdentity: 'mock:mock-settlement-fill-000001:0',
  });
  assert.equal(indexer.listFills().length, 1);
});

test('in-memory indexer refuses non-final or unsafe settlement events from public projections', () => {
  const indexer = createInMemoryIndexerProjection();
  const proofService = createInMemoryProofService({ indexer });

  assert.deepEqual(indexer.projectSettlementEvent(mockConfirmedSettlementEvent({
    eventId: 'event-order-matched',
    type: 'ORDER_MATCHED',
  })), {
    projected: false,
    reason: 'not_final_settlement',
    eventType: 'ORDER_MATCHED',
  });

  assert.deepEqual(indexer.projectSettlementEvent(mockConfirmedSettlementEvent({
    eventId: 'event-missing-mock-ref',
    mockSettlementReference: null,
  })), {
    projected: false,
    reason: 'invalid_mock_settlement_event',
    missingFields: ['mockSettlementReference'],
  });

  assert.deepEqual(indexer.projectSettlementEvent(mockConfirmedSettlementEvent({
    eventId: 'event-real-without-chain-proof',
    settlementMode: 'quai_contract',
    mockSettlementReference: null,
    settlementTx: null,
    blockNumber: null,
    blockHash: null,
    explorerUrl: null,
  })), {
    projected: false,
    reason: 'invalid_quai_contract_settlement_event',
    missingFields: ['settlementTx', 'blockNumber', 'blockHash', 'explorerUrl'],
  });

  assert.deepEqual(indexer.listFills(), []);
  assert.deepEqual(indexer.listProofs(), []);
  assert.deepEqual(proofService.getTradeProof('trade-000001'), {
    statusCode: 404,
    body: {
      error: 'proof_not_found',
      tradeId: 'trade-000001',
      proof: null,
      source: 'proof-service-indexer-projection',
      custody: 'non-custodial-no-withdrawal-authority',
      message: 'No indexed settlement proof exists for this trade yet.',
    },
  });
});
