import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PUBLIC_CONTRACT_PROOF_EVENT,
  adaptContractProofEventToSettlementEvent,
  listPublicProofTriggerEvents,
} from '../services/indexer/src/contract-proof-event-adapter.js';
import { createInMemoryIndexerProjection } from '../services/indexer/src/in-memory-projection.js';
import { createInMemoryProofService } from '../services/proof-service/src/in-memory-proof-service.js';

const repoRoot = new URL('../', import.meta.url);
const readRepoFile = (path) => readFile(new URL(path, repoRoot), 'utf8');

const TRADE_ID = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const FILL_ID = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const MARKET_ID = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const MAKER_ORDER_HASH = '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
const TAKER_ORDER_HASH = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const MAKER = '0x1111111111111111111111111111111111111111';
const TAKER = '0x2222222222222222222222222222222222222222';
const SETTLEMENT_CONTRACT = '0x3333333333333333333333333333333333333333';
const SETTLEMENT_TX = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
const BLOCK_HASH = '0x9999999999999999999999999999999999999999999999999999999999999999';

const tradeSettledArgs = (overrides = {}) => ({
  tradeId: TRADE_ID,
  fillId: FILL_ID,
  marketId: MARKET_ID,
  makerOrderHash: MAKER_ORDER_HASH,
  takerOrderHash: TAKER_ORDER_HASH,
  maker: MAKER,
  taker: TAKER,
  price: 2n,
  baseAmount: 100n,
  quoteAmount: 200n,
  makerFee: 10n,
  takerFee: 5n,
  feeRecipient: SETTLEMENT_CONTRACT,
  ...overrides,
});

const completeQuaiEvidence = (overrides = {}) => ({
  settlementMode: 'quai_contract',
  contractAddress: SETTLEMENT_CONTRACT,
  settlementTx: SETTLEMENT_TX,
  blockNumber: 12345,
  blockHash: BLOCK_HASH,
  eventIndex: 7,
  explorerUrl: `https://quaiscan.io/tx/${SETTLEMENT_TX}`,
  ...overrides,
});

test('contract proof adapter pins TradeSettled as the sole public contract proof trigger', async () => {
  assert.equal(PUBLIC_CONTRACT_PROOF_EVENT, 'TradeSettled');
  assert.deepEqual(listPublicProofTriggerEvents(), ['TradeSettled']);

  const settlementInterface = await readRepoFile('contracts/src/ISettlement.sol');
  const interfaceEventNames = [...settlementInterface.matchAll(/event\s+([A-Za-z0-9_]+)\s*\(/g)].map((match) => match[1]);
  assert.deepEqual(interfaceEventNames, ['TradeSettled'], 'ISettlement must expose only TradeSettled as public proof event truth');
});

test('contract proof adapter suppresses matcher and non-TradeSettled events from public proof projection', () => {
  const indexer = createInMemoryIndexerProjection();
  const proofService = createInMemoryProofService({ indexer });
  const ignored = adaptContractProofEventToSettlementEvent({
    eventName: 'ORDER_MATCHED',
    args: tradeSettledArgs(),
    evidence: completeQuaiEvidence(),
  });

  assert.deepEqual(ignored, {
    projected: false,
    reason: 'not_public_contract_proof_event',
    eventName: 'ORDER_MATCHED',
    acceptedEventName: 'TradeSettled',
  });
  assert.deepEqual(indexer.listFills(), []);
  assert.deepEqual(indexer.listProofs(), []);
  assert.equal(proofService.getTradeProof(TRADE_ID).statusCode, 404);
});

test('contract proof adapter requires real Quai event evidence before public projection', () => {
  assert.deepEqual(adaptContractProofEventToSettlementEvent({
    eventName: 'TradeSettled',
    args: tradeSettledArgs(),
    evidence: completeQuaiEvidence({
      settlementTx: null,
      blockNumber: null,
      blockHash: null,
      explorerUrl: null,
    }),
  }), {
    projected: false,
    reason: 'missing_quai_contract_event_evidence',
    eventName: 'TradeSettled',
    missingFields: ['settlementTx', 'blockNumber', 'blockHash', 'explorerUrl'],
  });
});

test('contract proof adapter requires complete TradeSettled event fields before projection', () => {
  const incompleteArgs = tradeSettledArgs({ baseAmount: undefined, makerFee: undefined });

  assert.deepEqual(adaptContractProofEventToSettlementEvent({
    eventName: 'TradeSettled',
    args: incompleteArgs,
    evidence: completeQuaiEvidence(),
  }), {
    projected: false,
    reason: 'missing_trade_settled_event_fields',
    eventName: 'TradeSettled',
    missingFields: ['baseAmount', 'makerFee'],
  });
});

test('TradeSettled maps to SETTLEMENT_CONFIRMED and then creates the public proof row', () => {
  const indexer = createInMemoryIndexerProjection();
  const proofService = createInMemoryProofService({ indexer });
  const adapted = adaptContractProofEventToSettlementEvent({
    eventName: 'TradeSettled',
    args: tradeSettledArgs(),
    evidence: completeQuaiEvidence(),
  });

  assert.deepEqual(adapted, {
    projected: true,
    event: {
      eventId: `quai_contract:${SETTLEMENT_CONTRACT}:${SETTLEMENT_TX}:7`,
      type: 'SETTLEMENT_CONFIRMED',
      source: 'quai-contract:TradeSettled',
      fillId: FILL_ID,
      tradeId: TRADE_ID,
      orderHashes: [MAKER_ORDER_HASH, TAKER_ORDER_HASH],
      settlementMode: 'quai_contract',
      mockSettlementReference: null,
      settlementTx: SETTLEMENT_TX,
      blockNumber: 12345,
      blockHash: BLOCK_HASH,
      eventIndex: 7,
      maker: MAKER,
      taker: TAKER,
      market: MARKET_ID,
      price: '2',
      amount: '100',
      fees: {
        maker: '10',
        taker: '5',
      },
      explorerUrl: `https://quaiscan.io/tx/${SETTLEMENT_TX}`,
    },
  });

  assert.deepEqual(indexer.projectSettlementEvent(adapted.event), {
    projected: true,
    eventIdentity: `quai_contract:${SETTLEMENT_TX}:7`,
    fillId: FILL_ID,
    tradeId: TRADE_ID,
  });
  assert.deepEqual(indexer.listFills(), [{
    projectionType: 'IndexedFillProjection',
    fillId: FILL_ID,
    tradeId: TRADE_ID,
    marketId: MARKET_ID,
    makerOrderHash: MAKER_ORDER_HASH,
    takerOrderHash: TAKER_ORDER_HASH,
    maker: MAKER,
    taker: TAKER,
    price: '2',
    amount: '100',
    makerFee: '10',
    takerFee: '5',
    settlementMode: 'quai_contract',
    settlementStatus: 'confirmed',
    sourceEventId: `quai_contract:${SETTLEMENT_CONTRACT}:${SETTLEMENT_TX}:7`,
  }]);

  const proof = proofService.getTradeProof(TRADE_ID);
  assert.equal(proof.statusCode, 200);
  assert.equal(proof.body.proof.rawEvent.type, 'SETTLEMENT_CONFIRMED');
  assert.equal(proof.body.proof.createdFromEventId, `quai_contract:${SETTLEMENT_CONTRACT}:${SETTLEMENT_TX}:7`);
  assert.equal(proof.body.proof.settlementTx, SETTLEMENT_TX);
  assert.equal(proof.body.proof.blockNumber, 12345);
  assert.equal(proof.body.proof.blockHash, BLOCK_HASH);
  assert.equal(proof.body.proof.eventIndex, 7);
  assert.equal(proof.body.proof.explorerUrl, `https://quaiscan.io/tx/${SETTLEMENT_TX}`);
  assert.equal(proof.body.proof.safetyNotice, 'Quai contract proof: verify settlementTx, blockNumber, eventIndex, and explorerUrl against contract events.');
});
