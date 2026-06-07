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
    'IndexedFillProjection',
    'NO_WITHDRAW',
  ]) {
    assert.ok(doc.includes(requiredText), `docs/order-schema.md should include ${requiredText}`);
  }
});

test('OpenAPI exposes SignedOrder requests and public IndexedFillProjection components', async () => {
  const spec = await readText('docs/api-openapi.yaml');

  for (const requiredText of [
    'SignedOrder:',
    'OrderSide:',
    'OrderType:',
    'TimeInForce:',
    'OrderSignature:',
    'OrderRequest:',
    'OrderAccepted:',
    'IndexedFillProjection:',
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

  assert.equal(
    spec.includes('    FillPacket:'),
    false,
    'public OpenAPI components must not expose internal matcher/relayer FillPacket as an API schema',
  );
});

test('OpenAPI IndexedFillProjection schema is the public adapter-shaped indexer projection', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const indexedFillProjection = sectionBetween(spec, '    IndexedFillProjection:', '    Market:');

  for (const requiredText of [
    'description: Public indexed fill projection',
    'not matcher-local truth',
    'required: [projectionType, fillId, tradeId, marketId, makerOrderHash, takerOrderHash, price, amount, settlementMode, settlementStatus, sourceEventId]',
    'projectionType:',
    'enum: [IndexedFillProjection]',
    'tradeId:',
    'settlementStatus:',
    'enum: [confirmed]',
    'sourceEventId:',
    'source settlement event',
  ]) {
    assert.ok(indexedFillProjection.includes(requiredText), `IndexedFillProjection schema should include ${requiredText}`);
  }

  assert.equal(indexedFillProjection.includes('createdAt'), false, 'IndexedFillProjection schema must not expose matcher-local createdAt');
  assert.equal(indexedFillProjection.includes('FillPacket'), false, 'IndexedFillProjection schema must not reuse the internal FillPacket name');
});

test('OpenAPI fill routes expose projection envelopes around adapter-shaped fills', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const orderAccepted = sectionBetween(spec, '    OrderAccepted:', '    IndexedFillProjection:');
  const fillsRoute = sectionBetween(spec, '  /v1/fills:', '  /v1/delegate-keys:');
  const fillList = sectionBetween(spec, '    FillListResponse:', '    Market:');

  for (const requiredText of [
    'fills:',
    '$ref: "#/components/schemas/IndexedFillProjection"',
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
    '$ref: "#/components/schemas/IndexedFillProjection"',
  ]) {
    assert.ok(fillList.includes(requiredText), `FillListResponse schema should include ${requiredText}`);
  }

  assert.equal(orderAccepted.includes('FillPacket'), false, 'OrderAccepted public fills must not be typed as FillPacket');
  assert.equal(fillList.includes('FillPacket'), false, 'FillListResponse public fills must not be typed as FillPacket');
});

test('OpenAPI and order docs expose matcher-local cancellation response schemas', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const doc = await readText('docs/order-schema.md');
  const cancelOneRoute = sectionBetween(spec, '  /v1/orders/{orderHash}:', '  /v1/orders/cancel-all:');
  const cancelAllRoute = sectionBetween(spec, '  /v1/orders/cancel-all:', '  /v1/fills:');
  const cancellationResult = sectionBetween(spec, '    CancellationResult:', '    CancellationError:');
  const cancellationError = sectionBetween(spec, '    CancellationError:', '    IndexedFillProjection:');
  const cancellationDoc = sectionBetween(doc, '## Order cancellation', '## API usage');

  for (const requiredText of [
    '$ref: "#/components/schemas/CancellationResult"',
    '$ref: "#/components/schemas/CancellationError"',
    'matcher-open quantity only',
    'does not cancel on-chain NonceManager nonces',
  ]) {
    assert.ok(cancelOneRoute.includes(requiredText), `/v1/orders/{orderHash} route should include ${requiredText}`);
  }

  for (const requiredText of [
    '$ref: "#/components/schemas/CancellationResult"',
    'marketId:',
    'owner:',
    'matcher-open quantity only',
  ]) {
    assert.ok(cancelAllRoute.includes(requiredText), `/v1/orders/cancel-all route should include ${requiredText}`);
  }

  for (const requiredText of [
    'required: [cancelled, cancelledCount, cancelledOrders, source, custody, nonceManager, permissions, message]',
    'cancelledOrders:',
    '$ref: "#/components/schemas/CancelledOrder"',
    'matcher-local-cancel-only-on-chain-nonce-unchanged',
    'CANCEL_ORDER',
    'CANCEL_ALL',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'not cancel on-chain NonceManager nonces',
  ]) {
    assert.ok(cancellationResult.includes(requiredText), `CancellationResult schema should include ${requiredText}`);
  }

  for (const requiredText of [
    'required: [error, orderHash, source, custody, nonceManager, permissions, message]',
    'enum: [order_not_found, order_not_open]',
    'matcher-local-cancel-only-on-chain-nonce-unchanged',
    'CANCEL_ORDER',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'not-implied-matcher-local-only',
  ]) {
    assert.ok(cancellationError.includes(requiredText), `CancellationError schema should include ${requiredText}`);
  }

  for (const requiredText of [
    '## Order cancellation',
    'CancellationResult',
    'CancellationError',
    'matcher-open quantity only',
    'does not cancel on-chain NonceManager nonces',
    'not-implied-matcher-local-only',
    'CANCEL_ORDER',
    'CANCEL_ALL',
    'NO_WITHDRAW',
    'NO_ADMIN',
  ]) {
    assert.ok(cancellationDoc.includes(requiredText), `docs/order-schema.md cancellation section should include ${requiredText}`);
  }
});

test('OpenAPI and order docs expose owner-signed nonce-cancel placeholder', async () => {
  const spec = await readText('docs/api-openapi.yaml');
  const doc = await readText('docs/order-schema.md');
  const nonceCancelRoute = sectionBetween(spec, '  /v1/nonces/cancel:', '  /v1/delegate-keys:');
  const nonceCancelRequest = sectionBetween(spec, '    OwnerSignedNonceCancelRequest:', '    OwnerSignedNonceCancelNotImplemented:');
  const nonceCancelResponse = sectionBetween(spec, '    OwnerSignedNonceCancelNotImplemented:', '    Market:');
  const nonceCancelDoc = sectionBetween(doc, '## Owner-signed nonce cancellation', '## API usage');

  for (const requiredText of [
    'summary: Prepare owner-signed NonceManager cancellation',
    '$ref: "#/components/schemas/OwnerSignedNonceCancelRequest"',
    '$ref: "#/components/schemas/OwnerSignedNonceCancelNotImplemented"',
    '501',
    'Matcher-local cancellation does not mutate on-chain NonceManager nonces',
    'no wallet loading, transaction signing, RPC broadcast, or relayer submission',
  ]) {
    assert.ok(nonceCancelRoute.includes(requiredText), `/v1/nonces/cancel route should include ${requiredText}`);
  }

  for (const requiredText of [
    'required: [action, owner, chainId, nonceManagerContract, expiresAt, signature]',
    'enum: [cancelNonce, cancelNonceRange]',
    'nonce:',
    'nonceRange:',
    'signature:',
    'owner wallet signature',
  ]) {
    assert.ok(nonceCancelRequest.includes(requiredText), `OwnerSignedNonceCancelRequest should include ${requiredText}`);
  }

  for (const requiredText of [
    'owner_signed_nonce_cancel_not_implemented',
    'owner-signed-nonce-cancel-placeholder',
    'owner-signed-required',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'realQuaiTransactions:',
    'walletRequired:',
    'explicit-approval-required-before-wallet-signing-or-quai-broadcast',
  ]) {
    assert.ok(nonceCancelResponse.includes(requiredText), `OwnerSignedNonceCancelNotImplemented should include ${requiredText}`);
  }

  for (const requiredText of [
    '## Owner-signed nonce cancellation',
    'POST /v1/nonces/cancel',
    'prepare-only `501` placeholder',
    'owner-signed-required',
    'Matcher-local cancellation does not mutate on-chain NonceManager nonces',
    'Delegate/API keys cannot submit this flow by default',
    'CANCEL_ORDER` and `CANCEL_ALL` remain matcher-local permissions only',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'no wallet loading, no transaction signing, no RPC broadcast, and no relayer submission',
  ]) {
    assert.ok(nonceCancelDoc.includes(requiredText), `docs/order-schema.md owner-signed nonce section should include ${requiredText}`);
  }
});

test('order schema splits internal FillPacket from public IndexedFillProjection rows', async () => {
  const doc = await readText('docs/order-schema.md');
  const projectionSection = sectionBetween(doc, '## IndexedFillProjection', '## API usage');

  for (const requiredText of [
    'Public API and WebSocket rows use `IndexedFillProjection`',
    'FillPacket remains the internal matcher/relayer handoff',
    '"projectionType": "IndexedFillProjection"',
    'settlementStatus',
    'sourceEventId',
    'source settlement event',
    'not matcher-local truth',
  ]) {
    assert.ok(projectionSection.includes(requiredText), `IndexedFillProjection doc should include ${requiredText}`);
  }

  assert.equal(projectionSection.includes('createdAt'), false, 'IndexedFillProjection doc must not use matcher-local createdAt');
});
