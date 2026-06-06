import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);

const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const assertIncludesAll = (text, requiredTexts, label) => {
  for (const requiredText of requiredTexts) {
    assert.ok(text.includes(requiredText), `${label} should include ${requiredText}`);
  }
};

test('TypeScript SDK spec pins bot flow and custody-safe delegate contract', async () => {
  const spec = await readText('sdk/typescript/spec.md');

  assertIncludesAll(
    spec,
    [
      '# TypeScript SDK Bot Contract',
      'QDexClient',
      'markets.list()',
      'orderbook.get(marketId)',
      'contracts.get()',
      'orders.createLimitOrder',
      'orders.createMarketIocOrder',
      'orders.submitSignedOrder',
      'OrderSubmissionResult',
      'IndexedFillProjection',
      'fills.stream()',
      'proofs.trade(tradeId)',
      'orders.cancelAll',
      'SignedOrder',
      'FillPacket',
      'TradeProof',
      'POST /v1/orders',
      'GET /v1/proofs/trades/:tradeId',
      'GET /v1/contracts',
      'local-only-not-deployed',
      'market_ioc',
      'IOC limit order',
      'maxSlippageBps',
      'Delegate keys default to NO_WITHDRAW',
      'cannot withdraw funds',
      'NO_ADMIN',
      'allowedMarkets',
      'maxNotional',
      'expiresAt',
      'main wallet',
      'API state is projection/cache',
      'settlementMode: mock',
    ],
    'sdk/typescript/spec.md',
  );

  assert.doesNotMatch(
    spec,
    /FillPacket\s*=\s*await\s+dex\.orders\.submitSignedOrder|submitSignedOrder\([^\n]+\)[^\n]*FillPacket/,
    'sdk/typescript/spec.md must not label POST /v1/orders responses as matcher/relayer FillPacket handoff objects',
  );
});

test('Python SDK spec mirrors bot flow without creating withdrawal authority', async () => {
  const spec = await readText('sdk/python/spec.md');

  assertIncludesAll(
    spec,
    [
      '# Python SDK Bot Contract',
      'QDexClient',
      'markets.list()',
      'orderbook.get(market_id)',
      'contracts.get()',
      'orders.create_limit_order',
      'orders.create_market_ioc_order',
      'orders.submit_signed_order',
      'OrderSubmissionResult',
      'IndexedFillProjection',
      'fills.stream()',
      'proofs.trade(trade_id)',
      'orders.cancel_all',
      'SignedOrder',
      'FillPacket',
      'TradeProof',
      'POST /v1/orders',
      'GET /v1/proofs/trades/:tradeId',
      'GET /v1/contracts',
      'local-only-not-deployed',
      'market_ioc',
      'IOC limit order',
      'max_slippage_bps',
      'Delegate keys default to NO_WITHDRAW',
      'cannot withdraw funds',
      'NO_ADMIN',
      'allowed_markets',
      'max_notional',
      'expires_at',
      'main wallet',
      'API state is projection/cache',
      'settlementMode: mock',
    ],
    'sdk/python/spec.md',
  );

  assert.doesNotMatch(
    spec,
    /FillPacket\s*=\s*dex\.orders\.submit_signed_order|submit_signed_order\([^\n]+\)[^\n]*FillPacket/,
    'sdk/python/spec.md must not label POST /v1/orders responses as matcher/relayer FillPacket handoff objects',
  );
});

test('qdex CLI spec defines terminal bot commands and safe API key scopes', async () => {
  const spec = await readText('cli/qdex/spec.md');

  assertIncludesAll(
    spec,
    [
      '# qdex CLI Bot Contract',
      'qdex markets',
      'qdex ticker QI-QUAI',
      'qdex book QI-QUAI',
      'qdex contracts',
      'qdex balance',
      'qdex order buy QI-QUAI --amount 1000 --price 0.123',
      'qdex order sell QI-QUAI --quote-amount 100 --market --slippage-bps 50',
      'qdex cancel --all',
      'qdex stream fills',
      'qdex proof trade <trade-id>',
      'qdex api create-key bot-mm-1 --scope trade --expires 7d',
      'READ_ONLY',
      'PLACE_ORDER',
      'CANCEL_ORDER',
      'CANCEL_ALL',
      'NO_WITHDRAW',
      'NO_ADMIN',
      'no withdraw command is available for delegate/API keys',
      'market orders are market_ioc IOC limit orders',
      'signed price/slippage bounds',
      'order responses contain order state plus IndexedFillProjection rows',
      'mockSettlementReference',
      'local-only-not-deployed',
      'GET /v1/contracts',
      'no real Quai transaction',
      'no funds moved',
    ],
    'cli/qdex/spec.md',
  );
});

test('SDK, CLI, and terminal consumer docs pin IndexedFillProjection projectionType', async () => {
  const docs = [
    {
      path: 'sdk/typescript/spec.md',
      terms: [
        "projectionType: 'IndexedFillProjection'",
        'OrderSubmissionResult.fills are public IndexedFillProjection rows',
      ],
    },
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'result.fill.projectionType',
        'IndexedFillProjection',
      ],
    },
    {
      path: 'sdk/python/spec.md',
      terms: [
        "fill_projection['projectionType'] == 'IndexedFillProjection'",
        'OrderSubmissionResult fills are public IndexedFillProjection rows',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'smoke["fill"]["projectionType"]',
        'IndexedFillProjection',
      ],
    },
    {
      path: 'cli/qdex/spec.md',
      terms: [
        'projectionType: IndexedFillProjection',
        'order responses contain order state plus IndexedFillProjection rows',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'projectionType: IndexedFillProjection',
        'not matcher/relayer FillPacket handoffs',
      ],
    },
    {
      path: 'web/terminal-ui/README.md',
      terms: [
        'projectionType: IndexedFillProjection',
        'not a matcher-local FillPacket',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});
