import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindOpenOrdersLocalApiSmoke } from '../src/open-orders-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const ORDER_SOURCE = 'mock-order-projection';
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

const assertOpenOrdersEnvelope = (envelope) => {
  assert.deepEqual(envelope.orders, []);
  assert.equal(envelope.source, ORDER_SOURCE);
  assert.equal(envelope.projectionType, 'LocalOrderProjection');
  assert.equal(envelope.custody, 'non-custodial-no-withdrawal-authority');
  assert.deepEqual(envelope.permissions, ORDER_PERMISSIONS);
  assert.equal(envelope.matcherLocalOnly, true);
  assert.equal(envelope.settlementMode, 'mock');
  assert.equal(envelope.realQuaiTransactions, false);
  assert.equal(envelope.walletRequired, false);
  assert.equal(envelope.fundsMoved, false);
  assert.equal(envelope.tradingVaultMutation, false);
  assert.match(envelope.safetyNotice, /Mock open orders only/i);
  assert.match(envelope.safetyNotice, /no real Quai transaction, no wallet loaded, no funds moved/i);
};

test('local API + terminal UI open orders smoke renders REST read-only LocalOrderProjection', async () => {
  await withApiServer(async (baseUrl) => {
    const mount = { dataset: {}, innerHTML: '' };
    const fetchCalls = [];
    const orderSnapshots = [];
    const renderedFixtures = [];
    const orderErrors = [];

    const countedFetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), method: options.method ?? 'GET' });
      return fetch(url, options);
    };

    const binding = await bindOpenOrdersLocalApiSmoke({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      baseFixture: mockVerticalSliceFixture,
      render: (fixture) => {
        renderedFixtures.push(fixture);
        return renderTradeProofPanel(fixture);
      },
      onOrders: (openOrders) => orderSnapshots.push(openOrders),
      onError: (error) => orderErrors.push(error),
    });

    try {
      assert.deepEqual(orderErrors, []);
      assert.equal(fetchCalls.length, 1);
      assert.deepEqual(
        fetchCalls.map((call) => [call.method, new URL(call.url).pathname]),
        [
          ['GET', '/v1/account/orders'],
        ],
      );

      assert.equal(orderSnapshots.length, 1);
      assert.equal(renderedFixtures.length, 1);
      assert.equal(mount.dataset.qdxFillOrdersSmoke, ORDER_SOURCE);
      assert.equal(mount.dataset.qdxFillOrdersProjection, 'LocalOrderProjection');
      assert.equal(mount.dataset.qdxFillOrdersCount, '0');

      const openOrders = orderSnapshots[0];
      assertOpenOrdersEnvelope(openOrders);

      const fixture = renderedFixtures[0];
      assert.deepEqual(fixture.openOrders, openOrders);
      assert.equal(fixture.openOrders.source, ORDER_SOURCE);

      assert.match(mount.innerHTML, /read-only open orders/i);
      assert.match(mount.innerHTML, /mock-order-projection/);
      assert.match(mount.innerHTML, /LocalOrderProjection/);
      assert.match(mount.innerHTML, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
      assert.match(mount.innerHTML, /settlementMode[\s\S]*mock/i);
      assert.match(mount.innerHTML, /real Quai tx[\s\S]*false/i);
      assert.match(mount.innerHTML, /wallet required[\s\S]*false/i);
      assert.match(mount.innerHTML, /funds moved[\s\S]*false/i);
      assert.match(mount.innerHTML, /TradingVault mutation[\s\S]*false/i);
      assert.match(mount.innerHTML, /no matcher-local open orders yet/i);
      assert.match(mount.innerHTML, /no wallet loaded, no funds moved/i);

      assert.doesNotMatch(mount.innerHTML, /wallet connected for open orders/i);
      assert.doesNotMatch(mount.innerHTML, /broadcast transaction|signing request|funds moved by UI/i);
      assert.doesNotMatch(mount.innerHTML, /WITHDRAW, ADMIN/);

      assert.equal(binding.openOrders.source, ORDER_SOURCE);
    } finally {
      binding.close();
    }
  });
});

test('open-orders-binding.js syntax check registered in package.json', async () => {
  import('fs').then(({ readFileSync }) => {
    const packageJson = readFileSync(
      new URL('../package.json', import.meta.url),
      'utf8',
    );
    assert.equal(
      packageJson.includes('node --check src/open-orders-binding.js'),
      true,
      'package.json check must include open-orders-binding.js',
    );
  });
});

test('open-orders-binding.js smoke renders only read-only metadata', async () => {
  await withApiServer(async (baseUrl) => {
    const mount = { dataset: {}, innerHTML: '' };
    const errors = [];

    const binding = await bindOpenOrdersLocalApiSmoke({
      mount,
      baseUrl,
      fetchImpl: globalThis.fetch,
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

test('open-orders-binding.js app.js imports bindOpenOrdersLocalApiSmoke', async () => {
  import('fs').then(({ readFileSync }) => {
    const app = readFileSync(
      new URL('../src/app.js', import.meta.url),
      'utf8',
    );
    assert.equal(
      app.includes("from './open-orders-binding.js'"),
      true,
      'app.js must import open-orders-binding.js',
    );
  });
});

test('open-orders-binding.js package.json syntax check passes', async () => {
  import('fs').then(({ readFileSync }) => {
    const packageJson = readFileSync(
      new URL('../package.json', import.meta.url),
      'utf8',
    );
    assert.equal(
      packageJson.includes('src/open-orders-binding.js'),
      true,
      'package.json must include open-orders-binding.js in check command',
    );
  });
});
