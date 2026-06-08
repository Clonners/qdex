import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { bindLiveBalanceStreamWithAccountSnapshot } from '../src/balance-stream-binding.js';
import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

const BALANCE_SOURCE = 'mock-vault-projection';
const BALANCE_SAFETY_NOTICE = 'Mock vault projection only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.';

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

test('local API + terminal UI balances stream smoke renders REST-checked read-only mock vault projection', async () => {
  await withApiServer(async (baseUrl) => {
    const mount = { dataset: {}, innerHTML: '' };
    const fetchCalls = [];
    const streamFixtures = [];
    const restSnapshots = [];
    const streamErrors = [];
    const restErrors = [];

    const countedFetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), method: options.method ?? 'GET' });
      return fetch(url, options);
    };

    const binding = await bindLiveBalanceStreamWithAccountSnapshot({
      mount,
      baseUrl,
      fetchImpl: countedFetch,
      WebSocketImpl: WebSocket,
      baseFixture: mockVerticalSliceFixture,
      render: renderTradeProofPanel,
      onRestSnapshot: (snapshot) => restSnapshots.push(snapshot),
      onStreamUpdate: (fixture) => streamFixtures.push(fixture),
      onRestError: (error) => restErrors.push(error),
      onStreamError: (error) => streamErrors.push(error),
    });

    try {
      await waitFor(
        () => streamFixtures.some((fixture) => fixture.balanceStream?.channel === 'balances'),
        'initial private balances stream render',
      );

      const accountBalanceCalls = fetchCalls.filter(
        (call) => call.method === 'GET' && new URL(call.url).pathname === '/v1/account/balances',
      );

      assert.equal(accountBalanceCalls.length, 1);
      assert.equal(restSnapshots.length, 1);
      assert.deepEqual(restErrors, []);
      assert.deepEqual(streamErrors, []);
      assert.equal(mount.dataset.qdxBalanceRestSnapshot, BALANCE_SOURCE);
      assert.equal(mount.dataset.qdxLiveBalancesStream, 'balances');

      const restSnapshot = restSnapshots[0];
      assert.equal(restSnapshot.source, BALANCE_SOURCE);
      assert.equal(restSnapshot.custody, 'non-custodial-contract-vault');
      assert.deepEqual(restSnapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.equal(restSnapshot.withdrawalAuthority, 'owner-wallet-only');
      assert.equal(restSnapshot.settlementMode, 'mock');
      assert.equal(restSnapshot.realQuaiTransactions, false);
      assert.equal(restSnapshot.walletRequired, false);
      assert.equal(restSnapshot.safetyNotice, BALANCE_SAFETY_NOTICE);
      assert.deepEqual(restSnapshot.balances, []);

      const fixture = streamFixtures.at(-1);
      assert.equal(fixture.sources.balances, BALANCE_SOURCE);
      assert.equal(fixture.balanceProjection.source, restSnapshot.source);
      assert.equal(fixture.balanceProjection.safetyNotice, restSnapshot.safetyNotice);
      assert.deepEqual(fixture.balanceProjection.permissions, restSnapshot.permissions);
      assert.equal(fixture.balanceStream.channel, 'balances');
      assert.equal(fixture.balanceStream.custody, 'non-custodial-no-withdrawal-authority');
      assert.deepEqual(fixture.balanceStream.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
      assert.equal(fixture.balanceStream.settlementMode, 'mock');
      assert.equal(fixture.balanceStream.realQuaiTransactions, false);
      assert.equal(fixture.balanceStream.walletRequired, false);
      assert.equal(fixture.custody.withdrawalAuthority, 'owner-wallet-only');
      assert.match(fixture.balanceStream.safetyNotice, /no real Quai transaction, no explorer URL, no funds moved/i);
      assert.match(fixture.balanceStream.projectionSafetyNotice, /no wallet loaded, no funds moved/i);

      assert.match(mount.innerHTML, /live balances stream/i);
      assert.match(mount.innerHTML, /mock-vault-projection/i);
      assert.match(mount.innerHTML, /NO_WITHDRAW, NO_ADMIN/i);
      assert.match(mount.innerHTML, /no wallet loaded, no funds moved/i);
    } finally {
      binding.close();
    }
  });
});
