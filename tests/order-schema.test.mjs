import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);

const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const sectionBetween = (text, startMarker, endMarker) => {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker ${endMarker}`);
  return text.slice(start, end);
};

test('signed order schema doc defines replay-safe partial-fill order model', async () => {
  const doc = await readText('docs/order-schema.md');

  for (const requiredText of [
    '# Signed Order Schema',
    'canonical payload',
    'partial fills',
    'chainId',
    'settlementContract',
    'nonce',
    'expiresAt',
    'Market orders are IOC limit orders with slippage bounds',
    'FillPacket',
    'NO_WITHDRAW',
  ]) {
    assert.ok(doc.includes(requiredText), `docs/order-schema.md should include ${requiredText}`);
  }
});

test('OpenAPI exposes SignedOrder request and FillPacket proof components', async () => {
  const spec = await readText('docs/api-openapi.yaml');

  for (const requiredText of [
    'SignedOrder:',
    'OrderSide:',
    'OrderType:',
    'TimeInForce:',
    'OrderSignature:',
    'OrderRequest:',
    'OrderAccepted:',
    'FillPacket:',
    'OrderStatus:',
    'maxSlippageBps:',
    'chainId:',
    'settlementContract:',
    'remainingAmount:',
    'POST /v1/orders accepts SignedOrder-like payloads',
    '$ref: "#/components/schemas/OrderRequest"',
  ]) {
    assert.ok(spec.includes(requiredText), `docs/api-openapi.yaml should include ${requiredText}`);
  }
});

test('OpenAPI FillPacket schema is adapter-shaped indexer projection', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const fillPacket = sectionBetween(spec, '    FillPacket:', '    Market:');

  for (const requiredText of [
    'description: Adapter-shaped indexed fill projection',
    'not matcher-local truth',
    'required: [fillId, tradeId, marketId, makerOrderHash, takerOrderHash, price, amount, settlementMode, settlementStatus, sourceEventId]',
    'tradeId:',
    'settlementStatus:',
    'enum: [confirmed]',
    'sourceEventId:',
    'source settlement event',
  ]) {
    assert.ok(fillPacket.includes(requiredText), `FillPacket schema should include ${requiredText}`);
  }

  assert.equal(fillPacket.includes('createdAt'), false, 'FillPacket schema must not expose matcher-local createdAt');
});

test('OpenAPI fill routes expose projection envelopes around adapter-shaped fills', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const orderAccepted = sectionBetween(spec, '    OrderAccepted:', '    FillPacket:');
  const fillsRoute = sectionBetween(spec, '  /v1/fills:', '  /v1/delegate-keys:');
  const fillList = sectionBetween(spec, '    FillListResponse:', '    Market:');

  for (const requiredText of [
    'fills:',
    '$ref: "#/components/schemas/FillPacket"',
    'source:',
    'custody:',
  ]) {
    assert.ok(orderAccepted.includes(requiredText), `OrderAccepted schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'summary: User indexed fills from confirmed settlement projections',
    '$ref: "#/components/schemas/FillListResponse"',
  ]) {
    assert.ok(fillsRoute.includes(requiredText), `/v1/fills route should include ${requiredText}`);
  }

  for (const requiredText of [
    'FillListResponse:',
    'description: Private fill list from the in-memory indexer projection',
    'source:',
    'enum: [in-memory-indexer-projection]',
    'fills:',
    '$ref: "#/components/schemas/FillPacket"',
  ]) {
    assert.ok(fillList.includes(requiredText), `FillListResponse schema should include ${requiredText}`);
  }
});

test('order schema FillPacket example uses adapter source event instead of matcher timestamp', async () => {
  const doc = await readText('docs/order-schema.md');
  const fillPacketSection = sectionBetween(doc, '## FillPacket', '## API usage');

  for (const requiredText of [
    'adapter-shaped indexed fill projection',
    'settlementStatus',
    'sourceEventId',
    'source settlement event',
    'not matcher-local truth',
  ]) {
    assert.ok(fillPacketSection.includes(requiredText), `FillPacket doc should include ${requiredText}`);
  }

  assert.equal(fillPacketSection.includes('createdAt'), false, 'FillPacket doc must not use matcher-local createdAt');
});
