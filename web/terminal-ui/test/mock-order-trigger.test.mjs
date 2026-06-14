import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bindMockOrderTrigger,
  buildOrderSubmitUrl,
  createMockCrossOrders,
  submitMockCrossOrders,
} from '../src/mock-order-trigger.js';

const makeJsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() {
    return body;
  },
});

const mockOrderResponse = ({ orderHash, status = 'open', fills = [] }) => ({
  orderHash,
  marketId: 'WQUAI-WQI',
  owner: '0x1111111111111111111111111111111111111111',
  delegate: '0x0000000000000000000000000000000000000000',
  side: 'sell',
  type: 'limit',
  amount: '100',
  price: '5',
  filledAmount: fills.length > 0 ? '100' : '0',
  remainingAmount: fills.length > 0 ? '0' : '100',
  status,
  custody: 'non-custodial-no-withdrawal-authority',
  fills,
  source: 'mock-matching-engine',
  settlement: fills.length > 0 ? 'mock-settlement-confirmed' : 'awaiting-cross',
});

const mockFill = Object.freeze({
  fillId: 'fill-000001',
  tradeId: 'trade-000001',
  marketId: 'WQUAI-WQI',
  makerOrderHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  takerOrderHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  maker: '0x1111111111111111111111111111111111111111',
  taker: '0x3333333333333333333333333333333333333333',
  price: '5',
  amount: '100',
  makerFee: '0',
  takerFee: '0',
  settlementMode: 'mock',
  settlementStatus: 'confirmed',
  sourceEventId: 'event-000001',
});

const mockProofEnvelope = Object.freeze({
  tradeId: 'trade-000001',
  source: 'proof-service-indexer-projection',
  custody: 'non-custodial-no-withdrawal-authority',
  proof: Object.freeze({
    tradeId: 'trade-000001',
    fillId: 'fill-000001',
    settlementMode: 'mock',
    mockSettlementReference: 'mock-settlement-fill-000001',
    settlementTx: null,
    blockNumber: null,
    blockHash: null,
    eventIndex: 0,
    explorerUrl: null,
    safetyNotice: 'Mock proof only: no real Quai transaction, no explorer URL, no funds moved.',
    createdFromEventId: 'event-000001',
  }),
});

test('createMockCrossOrders builds replay-safe mock orders with market_ioc slippage protection', () => {
  const { restingSell, crossingBuy } = createMockCrossOrders();

  assert.equal(restingSell.marketId, 'WQUAI-WQI');
  assert.equal(restingSell.side, 'sell');
  assert.equal(restingSell.type, 'limit');
  assert.equal(restingSell.timeInForce, 'GTC');
  assert.equal(restingSell.maxSlippageBps, 0);
  assert.equal(restingSell.delegate, '0x0000000000000000000000000000000000000000');
  assert.equal(restingSell.signature.scheme, 'mock');
  assert.equal(restingSell.signature.signer, restingSell.owner);

  assert.equal(crossingBuy.marketId, 'WQUAI-WQI');
  assert.equal(crossingBuy.side, 'buy');
  assert.equal(crossingBuy.type, 'market_ioc');
  assert.equal(crossingBuy.timeInForce, 'IOC');
  assert.equal(crossingBuy.maxSlippageBps, 50);
  assert.equal(crossingBuy.price, '6');
  assert.equal(crossingBuy.delegate, '0x0000000000000000000000000000000000000000');
  assert.equal(crossingBuy.signature.scheme, 'mock');
  assert.equal(crossingBuy.signature.signer, crossingBuy.owner);

  for (const order of [restingSell, crossingBuy]) {
    assert.equal(order.chainId, 0);
    assert.equal(order.settlementContract, '0x2222222222222222222222222222222222222222');
    assert.equal(order.baseToken, 'mock:WQUAI');
    assert.equal(order.quoteToken, 'mock:WQI');
    assert.equal(Object.hasOwn(order, 'withdrawalAuthority'), false);
    assert.equal(Object.hasOwn(order, 'admin'), false);
  }
});

test('submitMockCrossOrders posts resting and IOC crossing orders then verifies mock proof safety', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });

    if (calls.length === 1) {
      return makeJsonResponse(201, mockOrderResponse({
        orderHash: mockFill.makerOrderHash,
        status: 'open',
        fills: [],
      }));
    }

    if (calls.length === 2) {
      return makeJsonResponse(201, mockOrderResponse({
        orderHash: mockFill.takerOrderHash,
        status: 'filled',
        fills: [mockFill],
      }));
    }

    return makeJsonResponse(200, mockProofEnvelope);
  };

  const smoke = await submitMockCrossOrders({
    baseUrl: 'http://127.0.0.1:8787',
    fetchImpl,
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'http://127.0.0.1:8787/v1/orders');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(JSON.parse(calls[0].options.body).order.side, 'sell');
  assert.equal(JSON.parse(calls[1].options.body).order.type, 'market_ioc');
  assert.equal(JSON.parse(calls[1].options.body).order.maxSlippageBps, 50);
  assert.equal(calls[2].url, 'http://127.0.0.1:8787/v1/proofs/trades/trade-000001');

  assert.equal(smoke.fill.fillId, 'fill-000001');
  assert.equal(smoke.fill.sourceEventId, 'event-000001');
  assert.equal(Object.hasOwn(smoke.fill, 'createdAt'), false);
  assert.equal(smoke.proofEnvelope.source, 'proof-service-indexer-projection');
  assert.equal(smoke.proof.settlementMode, 'mock');
  assert.equal(smoke.proof.settlementTx, null);
  assert.equal(smoke.proof.blockNumber, null);
  assert.equal(smoke.proof.blockHash, null);
  assert.equal(smoke.proof.explorerUrl, null);
  assert.match(smoke.proof.safetyNotice, /no real Quai transaction, no explorer URL, no funds moved/);
  assert.equal(smoke.custody, 'non-custodial-no-withdrawal-authority');
});

test('bindMockOrderTrigger delegates browser clicks and reports the created mock fill without withdrawal authority', async () => {
  const listeners = new Map();
  const statusNode = { textContent: '', dataset: {} };
  const button = {
    disabled: false,
    dataset: { qdxTriggerCross: '' },
    matches(selector) {
      return selector === '[data-qdx-trigger-cross]';
    },
    closest(selector) {
      return this.matches(selector) ? this : null;
    },
  };
  const mount = {
    dataset: {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    querySelector(selector) {
      if (selector === '[data-qdx-trigger-status]') return statusNode;
      return null;
    },
  };
  const smokeEvents = [];
  const fetchImpl = async (_url, _options = {}) => {
    if (smokeEvents.length === 0) {
      smokeEvents.push('resting');
      return makeJsonResponse(201, mockOrderResponse({ orderHash: mockFill.makerOrderHash }));
    }
    if (smokeEvents.length === 1) {
      smokeEvents.push('crossing');
      return makeJsonResponse(201, mockOrderResponse({
        orderHash: mockFill.takerOrderHash,
        status: 'filled',
        fills: [mockFill],
      }));
    }
    smokeEvents.push('proof');
    return makeJsonResponse(200, mockProofEnvelope);
  };
  const completed = [];

  const binding = bindMockOrderTrigger({
    mount,
    baseUrl: 'http://127.0.0.1:8787',
    fetchImpl,
    onSmoke: (smoke) => completed.push(smoke),
  });

  const clickPromise = listeners.get('click')({ target: button, preventDefault() {} });
  await clickPromise;

  assert.equal(button.disabled, false);
  assert.equal(mount.dataset.qdxMockOrderTrigger, 'filled');
  assert.match(statusNode.textContent, /fill-000001/);
  assert.match(statusNode.textContent, /proof-service-indexer-projection/);
  assert.match(statusNode.textContent, /no real Quai tx\/explorer\/funds/);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].fill.settlementMode, 'mock');
  assert.equal(completed[0].proof.settlementTx, null);

  binding.close();
  assert.equal(listeners.has('click'), false);
});

test('buildOrderSubmitUrl normalizes any local API base URL to POST /v1/orders', () => {
  assert.equal(buildOrderSubmitUrl({ baseUrl: 'http://127.0.0.1:8787/app' }), 'http://127.0.0.1:8787/v1/orders');
  assert.equal(buildOrderSubmitUrl({ baseUrl: 'https://dex.local:9443' }), 'https://dex.local:9443/v1/orders');
});
