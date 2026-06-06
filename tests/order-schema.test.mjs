import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);

const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

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
