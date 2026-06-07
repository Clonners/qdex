# TypeScript SDK

First-class client for bots, market makers and frontend code.

Smoke stub available now:

```ts
import { QDexClient, createMockSignedOrder, runMockCrossSmoke } from '@qdex/sdk-typescript';

const dex = new QDexClient({ baseUrl: 'http://127.0.0.1:8787' });
const contractRegistry = await dex.contracts.get();
const relayerGate = await dex.relayer.settlementModeGate.get();
const nonceCancelPrepare = await dex.nonces.prepareCancel({
  action: 'cancelNonce',
  owner: '0x1111111111111111111111111111111111111111',
  nonce: '77',
  chainId: 0,
  nonceManagerContract: '0x0000000000000000000000000000000000000000',
  expiresAt: 1780003600,
  signature: '0xowner-signed-placeholder',
});
const fillsStream = dex.fills.openStream({ timeoutMs: 2000 });
const initialFillsSnapshot = await fillsStream.next();
await fillsStream.close();
const ordersStream = dex.orders.openStream({ timeoutMs: 2000 });
const initialOrdersSnapshot = await ordersStream.next();
await ordersStream.close();

const result = await runMockCrossSmoke(dex, {
  restingSell: createMockSignedOrder({ side: 'sell', amount: '100', price: '5', nonce: '1' }),
  crossingBuy: createMockSignedOrder({ side: 'buy', amount: '100', price: '6', nonce: '2' }),
});

console.log(contractRegistry.deploymentStatus); // local-only-not-deployed
console.log(contractRegistry.nativeQiStatus.status); // design-required
console.log(contractRegistry.nativeQiStatus.currentTreatment); // mock-only
console.log(contractRegistry.nativeQiStatus.nativeQiModel); // UTXO-model
console.log(contractRegistry.nativeQiStatus.acceptedFuturePaths); // wrapped_qi_receipt_token, contract_native_qi_adapter, conversion_settlement_flow
console.log(relayerGate.source); // relayer-approval-gate
console.log(relayerGate.currentSettlementMode); // currentSettlementMode: mock
console.log(relayerGate.modes.quai_contract.reason); // real_quai_approval_gate_blocked
console.log(nonceCancelPrepare.status); // 501
console.log(nonceCancelPrepare.body.error); // owner_signed_nonce_cancel_not_implemented
console.log(nonceCancelPrepare.body.nonceManager); // owner-signed-required
console.log(nonceCancelPrepare.body.permissions); // NO_WITHDRAW, NO_ADMIN
console.log(initialFillsSnapshot.snapshot.permissions); // READ_ONLY, NO_WITHDRAW, NO_ADMIN
console.log(initialOrdersSnapshot.snapshot.channel); // orders
console.log(result.fill.projectionType); // IndexedFillProjection
console.log(result.fill.sourceEventId);
console.log(result.proof.settlementMode); // mock
```

`contracts.get()` calls `GET /v1/contracts` and returns local-only contract metadata with null addresses, `realQuaiTransactions: false`, `walletRequired: false`, and no deploy/transaction side effects. `contractRegistry.nativeQiStatus.status` stays `design-required`; native Qi remains `UTXO-model`, `QI-QUAI` is `mock-only`, and accepted future paths are limited to `wrapped_qi_receipt_token`, `contract_native_qi_adapter`, or `conversion_settlement_flow`. The safety notice preserves: no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real Qi settlement claim.

`dex.relayer.settlementModeGate.get()` calls `GET /v1/relayer/settlement-mode-gate` and returns read-only `relayer-approval-gate` metadata for `currentSettlementMode: mock` plus the blocked `quai_contract` reason `real_quai_approval_gate_blocked`; it performs no wallet loading, signing, broadcast, RPC URL access, or transaction submission.

`dex.nonces.prepareCancel()` calls `POST /v1/nonces/cancel` and returns the prepare-only 501 placeholder body (`owner_signed_nonce_cancel_not_implemented`, `owner-signed-required`, `NO_WITHDRAW`, `NO_ADMIN`) with no wallet loading, signing, broadcast, or relayer submission.

`fills.openStream()` consumes the local `/v1/ws?channel=fills` WebSocket transport. Private stream snapshots remain read-only and carry `NO_WITHDRAW`/`NO_ADMIN` permissions.

`orders.openStream()` consumes `/v1/ws?channel=orders` for order/cancel stream snapshots. Matcher-local cancellation updates keep on-chain nonce wording explicit and do not grant withdrawal/admin authority.

The smoke helper is deliberately mock-only: it proves the API/indexer/proof loop without wallets, transactions, real Quai settlement, or fund movement.
