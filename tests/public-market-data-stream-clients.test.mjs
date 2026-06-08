import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const assertIncludesAll = (text, terms, label) => {
  for (const term of terms) {
    assert.ok(text.includes(term), `${label} should include ${term}`);
  }
};

test('TypeScript SDK and qdex docs expose bounded public market-data stream consumers', async () => {
  const docs = [
    {
      path: 'sdk/typescript/spec.md',
      terms: [
        'tickers.openStream()',
        'tickers.stream({ limit })',
        '/v1/ws?channel=global.tickers',
        'ticker_snapshot',
        'public-read-only-no-custody',
        'mock-market-data',
        'orderbook.openStream(marketId)',
        'orderbook.stream(marketId, { limit })',
        '/v1/ws?channel=market.<MARKET>.depth',
        'orderbook_depth',
        'mock-orderbook',
        'trades.openStream(marketId)',
        'trades.stream(marketId, { limit })',
        '/v1/ws?channel=market.<MARKET>.trades',
        'trade_projection',
        'in-memory-indexer-projection',
        'confirmed-settlement-only',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'dex.tickers.openStream',
        'dex.tickers.stream',
        'dex.orderbook.openStream',
        'dex.orderbook.stream',
        'dex.trades.openStream',
        'dex.trades.stream',
        '/v1/ws?channel=global.tickers',
        '/v1/ws?channel=market.<MARKET>.depth',
        '/v1/ws?channel=market.<MARKET>.trades',
        'ticker_snapshot',
        'orderbook_depth',
        'trade_projection',
        'public-read-only-no-custody',
        'mock-market-data',
        'mock-orderbook',
        'in-memory-indexer-projection',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'cli/qdex/spec.md',
      terms: [
        'qdex stream tickers',
        'qdex stream depth QI-QUAI',
        'qdex stream trades QI-QUAI',
        '/v1/ws?channel=global.tickers',
        '/v1/ws?channel=market.<MARKET>.depth',
        '/v1/ws?channel=market.<MARKET>.trades',
        'ticker_snapshot',
        'orderbook_depth',
        'trade_projection',
        'public-read-only-no-custody',
        'mock-market-data',
        'mock-orderbook',
        'in-memory-indexer-projection',
        'confirmed-settlement-only',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'qdex --base-url http://127.0.0.1:8787 stream tickers --limit 1',
        'qdex --base-url http://127.0.0.1:8787 stream depth QI-QUAI --limit 1',
        'qdex --base-url http://127.0.0.1:8787 stream trades QI-QUAI --limit 1',
        '/v1/ws?channel=global.tickers',
        '/v1/ws?channel=market.<MARKET>.depth',
        '/v1/ws?channel=market.<MARKET>.trades',
        'ticker_snapshot',
        'orderbook_depth',
        'trade_projection',
        'public-read-only-no-custody',
        'mock-market-data',
        'mock-orderbook',
        'in-memory-indexer-projection',
        'confirmed-settlement-only',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});

test('campaign status marks public market-data stream clients complete and points to Python parity', async () => {
  const status = await readText('CAMPAIGN_STATUS.md');

  assert.ok(
    status.includes('Current phase: read-only TypeScript SDK and `qdex` CLI public market-data stream consumers are complete'),
    'campaign status should mark the public market-data stream consumer slice as current phase',
  );
  assert.ok(
    status.includes('Completed this run: read-only TypeScript SDK and `qdex` CLI public market-data stream consumers'),
    'campaign status should record this run as public market-data stream consumers',
  );
  assert.ok(
    status.includes('Next autonomous slice: Python SDK public market-data stream consumers'),
    'campaign status should point the next bounded slice at Python market-data stream parity',
  );
  assert.ok(
    status.includes('Completed previous run: qdex public ticker CLI command'),
    'campaign status should move the qdex public ticker CLI command to previous work',
  );
  assert.doesNotMatch(
    status,
    /wallet loaded for market stream|market-data signer|broadcast market-data transaction|RPC URL required for public stream|funds moved by market-data stream/i,
    'public market-data stream status must not claim wallet/RPC/signing/broadcast/tx/funds behavior',
  );
});
