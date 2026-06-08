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
        'klines.get(marketId, { interval })',
        '/v1/klines/<MARKET>?interval=1m',
        'klines.openStream(marketId, { interval })',
        'klines.stream(marketId, { interval, limit })',
        '/v1/ws?channel=market.<MARKET>.klines.1m',
        'kline_snapshot',
        'mock-candle-projection',
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
        'dex.klines.get',
        'dex.klines.openStream',
        'dex.klines.stream',
        '/v1/klines/<MARKET>?interval=1m',
        '/v1/ws?channel=market.<MARKET>.klines.1m',
        'kline_snapshot',
        'mock-candle-projection',
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
        'qdex klines QI-QUAI --interval 1m',
        'qdex stream klines QI-QUAI --interval 1m --limit N',
        '/v1/klines/<MARKET>?interval=1m',
        '/v1/ws?channel=market.<MARKET>.klines.1m',
        'kline_snapshot',
        'mock-candle-projection',
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
        'qdex --base-url http://127.0.0.1:8787 klines QI-QUAI --interval 1m',
        'qdex --base-url http://127.0.0.1:8787 stream klines QI-QUAI --interval 1m --limit 1',
        '/v1/klines/<MARKET>?interval=1m',
        '/v1/ws?channel=market.<MARKET>.klines.1m',
        'kline_snapshot',
        'mock-candle-projection',
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

test('Python SDK docs expose bounded public market-data and kline/candle consumers', async () => {
  const docs = [
    {
      path: 'sdk/python/spec.md',
      terms: [
        'klines.get(market_id, interval="1m")',
        'klines.open_stream(market_id, interval="1m")',
        'klines.stream(market_id, interval="1m", limit=limit)',
        '/v1/klines/<MARKET>?interval=1m',
        '/v1/ws?channel=market.<MARKET>.klines.1m',
        'kline_snapshot',
        'mock-candle-projection',
        'tickers.open_stream()',
        'tickers.stream(limit=limit)',
        '/v1/ws?channel=global.tickers',
        'ticker_snapshot',
        'public-read-only-no-custody',
        'mock-market-data',
        'orderbook.open_stream(market_id)',
        'orderbook.stream(market_id, limit=limit)',
        '/v1/ws?channel=market.<MARKET>.depth',
        'orderbook_depth',
        'mock-orderbook',
        'trades.open_stream(market_id)',
        'trades.stream(market_id, limit=limit)',
        '/v1/ws?channel=market.<MARKET>.trades',
        'trade_projection',
        'in-memory-indexer-projection',
        'confirmed-settlement-only',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'dex.klines.get',
        'dex.klines.open_stream',
        'dex.klines.stream',
        '/v1/klines/<MARKET>?interval=1m',
        '/v1/ws?channel=market.<MARKET>.klines.1m',
        'kline_snapshot',
        'mock-candle-projection',
        'dex.tickers.open_stream',
        'dex.tickers.stream',
        'dex.orderbook.open_stream',
        'dex.orderbook.stream',
        'dex.trades.open_stream',
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
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});

test('campaign status marks local API + terminal UI public kline/candle stream smoke complete after the terminal UI binding', async () => {
  const status = await readText('CAMPAIGN_STATUS.md');

  assert.ok(
    status.includes('Current phase: local API + terminal UI public kline/candle stream integration smoke is complete'),
    'campaign status should mark local API + terminal UI public kline/candle stream smoke as current phase',
  );
  assert.ok(
    status.includes('Completed previous run: TypeScript SDK and `qdex` CLI public kline/candle consumers'),
    'campaign status should retain TypeScript/qdex public kline consumers as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: Python SDK public kline/candle consumers'),
    'campaign status should retain Python public kline consumers as previous work',
  );
  assert.ok(
    status.includes('Completed previous run: terminal UI public kline/candle panel binding'),
    'campaign status should move terminal UI public kline/candle panel binding to previous work',
  );
  assert.ok(
    status.includes('Completed this run: local API + terminal UI public kline/candle stream integration smoke'),
    'campaign status should record this run as the REST-confirmed public kline/candle stream smoke',
  );
  assert.ok(
    status.includes('Next autonomous slice: another bounded local/source-only MVP surface'),
    'campaign status should move next work to another safe local/source-only MVP surface',
  );
  assert.doesNotMatch(
    status,
    /wallet loaded for market stream|market-data signer|broadcast market-data transaction|RPC URL required for public stream|funds moved by market-data stream/i,
    'public market-data stream status must not claim wallet/RPC/signing/broadcast/tx/funds behavior',
  );
});
