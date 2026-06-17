import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindLiveOpenOrdersStreamsWithRestOrders } from '../src/open-orders-stream-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const ORDER_SOURCE = 'mock-order-projection';
const ORDER_CUSTODY = 'non-custodial-no-withdrawal-authority';
const STREAM_CUSTODY = 'non-custodial-no-withdrawal-authority';
const ORDER_PERMISSIONS = ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'];

const withApiServer = async (callback) => {
  const server = createApiServer();

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const waitFor = async (predicate, label) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`timed out waiting for ${label}`);
};

const assertOpenOrdersEnvelope = ({ envelope }) => {
  assert.deepEqual(envelope.orders, []);
  assert.equal(envelope.source, ORDER_SOURCE);
  assert.equal(envelope.projectionType, 'LocalOrderProjection');
  assert.equal(envelope.custody, ORDER_CUSTODY);
  assert.deepEqual(envelope.permissions, ORDER_PERMISSIONS);
  assert.equal(envelope.matcherLocalOnly, true);
  assert.equal(envelope.settlementMode, 'mock');
  assert.equal(envelope.settlementTx, null);
  assert.equal(envelope.blockNumber, null);
  assert.equal(envelope.blockHash, null);
  assert.equal(envelope.eventIndex, null);
  assert.equal(envelope.explorerUrl, null);
  assert.equal(envelope.realQuaiTransactions, false);
  assert.equal(envelope.walletRequired, false);
  assert.equal(envelope.fundsMoved, false);
  assert.equal(envelope.tradingVaultMutation, false);
  assert.match(envelope.safetyNotice, /Mock open orders only/i);
  assert.match(envelope.safetyNotice, /no real Quai transaction, no wallet loaded, no funds moved/i);
};

test('local API + terminal UI open orders stream smoke renders only REST-confirmed private snapshots', async () => {
  await withApiServer(async (baseUrl) => {
    const mount = { dataset: {}, innerHTML: '' };
    const fetchCalls = [];
    const restSnapshots = [];
    const streamFixtures = [];
    const restErrors = [];
    const streamErrors = [];
    const eventOrder = [];

    const countedFetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), method: options.method ?? 'GET' });
      return fetch(url, options);
    };

    const binding = await bindLiveOpenOrdersStreamsWithRestOrders({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      WebSocketImpl: WebSocket,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onRestOrders: (openOrders) => {
        eventOrder.push('rest');
        restSnapshots.push(openOrders);
      },
      onStreamUpdate: (fixture) => {
        eventOrder.push(`stream:${fixture.openOrdersStream.channels.join(',')}`);
        streamFixtures.push(fixture);
      },
      onRestError: (error) => restErrors.push(error),
      onStreamError: (error) => streamErrors.push(error),
    });

    try {
      await waitFor(
        () => streamFixtures.some((fixture) => fixture.openOrdersStream?.channels?.join(',') === 'open-orders'),
        'REST-confirmed private open-orders stream render',
      );

      assert.equal(eventOrder[0], 'rest');
      assert.deepEqual(restErrors, []);
      assert.deepEqual(streamErrors, []);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['GET', '/v1/account/orders'],
        ],
      );

      assert.equal(restSnapshots.length, 1);
      assert.equal(mount.dataset.qdxFillOpenOrdersRestSnapshot, ORDER_SOURCE);
      assert.equal(mount.dataset.qdxFillOpenOrdersStreamRestAgreement, ORDER_SOURCE);
      assert.equal(mount.dataset.qdxFillOpenOrdersStreams, 'open-orders');
      assert.equal(mount.dataset.qdxFillOpenOrdersStreamRows, '0');

      const restOrders = restSnapshots[0];
      assertOpenOrdersEnvelope({ envelope: restOrders });

      const fixture = streamFixtures.at(-1);
      assert.deepEqual(fixture.openOrders.orders, restOrders.orders);
      assert.equal(fixture.sources.openOrders, ORDER_SOURCE);
      assert.equal(fixture.openOrdersStream.source, ORDER_SOURCE);
      assert.equal(fixture.openOrdersStream.custody, STREAM_CUSTODY);
      assert.deepEqual(fixture.openOrdersStream.permissions, ORDER_PERMISSIONS);
      assert.equal(fixture.openOrdersStream.matcherLocalOnly, true);
      assert.equal(fixture.openOrdersStream.settlementMode, 'mock');
      assert.equal(fixture.openOrdersStream.realQuaiTransactions, false);
      assert.equal(fixture.openOrdersStream.walletRequired, false);
      assert.equal(fixture.openOrdersStream.fundsMoved, false);
      assert.equal(fixture.openOrdersStream.tradingVaultMutation, false);

      assert.match(mount.innerHTML, /open orders/i);
      assert.match(mount.innerHTML, /mock-order-projection/);
      assert.match(mount.innerHTML, /LocalOrderProjection/);
      assert.match(mount.innerHTML, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
      assert.match(mount.innerHTML, /settlementMode[\s\S]*mock/i);
      assert.match(mount.innerHTML, /real Quai tx[\s\S]*false/i);
      assert.match(mount.innerHTML, /wallet required[\s\S]*false/i);
      assert.match(mount.innerHTML, /funds moved[\s\S]*false/i);
      assert.match(mount.innerHTML, /no wallet loaded, no funds moved/i);
      assert.doesNotMatch(mount.innerHTML, /wallet connected for open orders|broadcast open orders|signing open orders|funds moved by open orders UI/i);

      assert.deepEqual(binding.openOrders, restOrders);
    } finally {
      binding.close();
    }
  });
});

test('open-orders-stream-binding.js syntax check registered in package.json', async () => {
  import('fs').then(({ readFileSync }) => {
    const packageJson = readFileSync(
      new URL('../package.json', import.meta.url),
      'utf8',
    );
    assert.equal(
      packageJson.includes('node --check src/open-orders-stream-binding.js'),
      true,
      'package.json check must include open-orders-stream-binding.js',
    );
  });
});

test('open-orders-stream-binding.js smoke renders only read-only metadata', async () => {
  await withApiServer(async (baseUrl) => {
    const mount = { dataset: {}, innerHTML: '' };
    const errors = [];

    const binding = await bindLiveOpenOrdersStreamsWithRestOrders({
      mount,
      baseUrl,
      fetchImpl: globalThis.fetch,
      WebSocketImpl: WebSocket,
      onError: (error) => errors.push(error),
    });

    try {
      assert.deepEqual(errors, []);
      assert.equal(binding.openOrders.matcherLocalOnly, true);
      assert.equal(binding.openOrders.settlementMode, 'mock');
      assert.equal(binding.openOrders.realQuaiTransactions, false);
      assert.equal(binding.openOrders.walletRequired, false);
      assert.equal(binding.openOrders.fundsMoved, false);
      assert.equal(binding.openOrders.tradingVaultMutation, false);
    } finally {
      binding.close();
    }
  });
});

test('open-orders-stream-binding.js app.js imports bindLiveOpenOrdersStreamsWithRestOrders', async () => {
  import('fs').then(({ readFileSync }) => {
    const app = readFileSync(
      new URL('../src/app.js', import.meta.url),
      'utf8',
    );
    assert.equal(
      app.includes("from './open-orders-stream-binding.js'"),
      true,
      'app.js must import open-orders-stream-binding.js',
    );
  });
});

test('open-orders-stream-binding.js package.json syntax check passes', async () => {
  import('fs').then(({ readFileSync }) => {
    const packageJson = readFileSync(
      new URL('../package.json', import.meta.url),
      'utf8',
    );
    assert.equal(
      packageJson.includes('src/open-orders-stream-binding.js'),
      true,
      'package.json must include open-orders-stream-binding.js in check command',
    );
  });
});
