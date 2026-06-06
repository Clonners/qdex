import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiServer } from '../../../services/api/src/server.js';
import { runQdexCli } from '../src/cli.js';

const withServer = async (callback) => {
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

const runCliJson = async (argv) => {
  let output = '';
  const exitCode = await runQdexCli(argv, {
    stdout: {
      write(chunk) {
        output += chunk;
      },
    },
    stderr: {
      write(chunk) {
        throw new Error(`unexpected stderr: ${chunk}`);
      },
    },
  });

  assert.equal(exitCode, 0);
  return JSON.parse(output);
};

test('qdex smoke command drives current mock API flow and prints mock-proof safety', async () => {
  await withServer(async (baseUrl) => {
    const result = await runCliJson(['--base-url', baseUrl, 'smoke']);

    assert.equal(result.command, 'smoke');
    assert.equal(result.marketId, 'QI-QUAI');
    assert.equal(result.fill.fillId, 'fill-000001');
    assert.equal(result.fill.sourceEventId, 'event-000001');
    assert.equal(result.fill.settlementMode, 'mock');
    assert.equal(result.proof.source, 'proof-service-indexer-projection');
    assert.equal(result.proof.settlementMode, 'mock');
    assert.equal(result.proof.settlementTx, null);
    assert.equal(result.proof.explorerUrl, null);
    assert.match(result.proof.safetyNotice, /no real Quai transaction, no explorer URL, no funds moved/);
    assert.ok(result.delegateSafety.defaultPermissions.includes('NO_WITHDRAW'));
    assert.ok(result.delegateSafety.defaultPermissions.includes('NO_ADMIN'));
  });
});

test('qdex stream fills command consumes local WebSocket snapshots with read-only private permissions', async () => {
  await withServer(async (baseUrl) => {
    const result = await runCliJson(['--base-url', baseUrl, 'stream', 'fills', '--limit', '1']);

    assert.equal(result.command, 'stream fills');
    assert.equal(result.channel, 'fills');
    assert.equal(result.transport, 'websocket');
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].type, 'snapshot');
    assert.equal(result.messages[0].snapshot.channel, 'fills');
    assert.equal(result.messages[0].snapshot.visibility, 'private');
    assert.deepEqual(result.messages[0].snapshot.permissions, ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN']);
    assert.equal(result.messages[0].snapshot.safetyNotice, 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.');
  });
});

test('qdex contracts command prints local-only registry metadata without wallet or tx claims', async () => {
  await withServer(async (baseUrl) => {
    const result = await runCliJson(['--base-url', baseUrl, 'contracts']);

    assert.equal(result.command, 'contracts');
    assert.equal(result.deploymentStatus, 'local-only-not-deployed');
    assert.equal(result.realQuaiTransactions, false);
    assert.equal(result.walletRequired, false);
    assert.match(result.nativeQiCaveat, /UTXO-model/);
    assert.equal(result.contracts.tradingVault.address, null);
    assert.equal(result.contracts.tradingVault.operatorWithdrawalAuthority, false);
    assert.equal(result.contracts.settlement.proofTrigger, 'TradeSettled');
    assert.deepEqual(result.contracts.settlement.dependencies, [
      'TradingVault',
      'NonceManager',
      'MarketRegistry',
      'FeeManager',
      'DelegateKeyRegistry',
    ]);
    assert.deepEqual(result.contracts.delegateKeyRegistry.requiredPermissions, [
      'PLACE_ORDER',
      'NO_WITHDRAW',
      'NO_ADMIN',
    ]);
    assert.equal(result.safety.approvalGate, 'explicit-approval-required-before-deploy-or-transaction');
  });
});

test('qdex read-only commands return market and book JSON from the API', async () => {
  await withServer(async (baseUrl) => {
    const markets = await runCliJson(['--base-url', baseUrl, 'markets']);
    assert.equal(markets.command, 'markets');
    assert.equal(markets.markets[0].id, 'QI-QUAI');

    const book = await runCliJson(['--base-url', baseUrl, 'book', 'QI-QUAI']);
    assert.equal(book.command, 'book');
    assert.equal(book.marketId, 'QI-QUAI');
    assert.equal(book.source, 'mock-orderbook');
  });
});
