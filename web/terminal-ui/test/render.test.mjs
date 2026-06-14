import assert from 'node:assert/strict';
import test from 'node:test';

import { mockVerticalSliceFixture } from '../src/mock-vertical-fixture.js';
import { renderTradeProofPanel } from '../src/render.js';

test('renderTradeProofPanel shows the confirmed mock trade and proof without implying real settlement', () => {
  const html = renderTradeProofPanel(mockVerticalSliceFixture);

  assert.match(html, /trade-000001/);
  assert.match(html, /fill-000001/);
  assert.match(html, /WQUAI-WQI/);
  assert.match(html, /price[^<]*5/i);
  assert.match(html, /amount[^<]*100/i);
  assert.match(html, /\/v1\/proofs\/trades\/trade-000001/);
  assert.match(html, /settlementMode[^<]*mock/i);
  assert.match(html, /mock settlement confirmed/i);
  assert.match(html, /mock reference/i);
  assert.match(html, /mock-settlement-fill-000001/);
  assert.match(html, /settlement tx[\s\S]*null \(mock\)/i);
  assert.doesNotMatch(html, /settlement tx<\/dt><dd><code>mock-settlement-fill-000001<\/code>/i);
  assert.equal(Object.hasOwn(mockVerticalSliceFixture.fill, 'createdAt'), false);
  assert.equal(mockVerticalSliceFixture.fill.projectionType, 'IndexedFillProjection');
  assert.equal(mockVerticalSliceFixture.fill.sourceEventId, 'event-000001');
  assert.equal(mockVerticalSliceFixture.sources.fills, 'in-memory-indexer-projection');
  assert.equal(mockVerticalSliceFixture.sources.trades, 'in-memory-indexer-projection');
  assert.equal(mockVerticalSliceFixture.sources.proof, 'proof-service-indexer-projection');
  assert.match(html, /fill source[\s\S]*in-memory-indexer-projection/i);
  assert.match(html, /projection type[\s\S]*IndexedFillProjection/i);
  assert.match(html, /source event[\s\S]*event-000001/i);
  assert.match(html, /proof source[\s\S]*proof-service-indexer-projection/i);
  assert.doesNotMatch(html, /createdAt/i);
  assert.match(html, /no real Quai transaction/i);
  assert.match(html, /non-custodial-no-withdrawal-authority/);
  assert.doesNotMatch(html, /explorer\.quai/i);
});

test('renderTradeProofPanel exposes keyboard and command-palette hints for terminal flow', () => {
  const html = renderTradeProofPanel(mockVerticalSliceFixture);

  assert.match(html, /<kbd>\/<\/kbd> search market/);
  assert.match(html, /<kbd>b<\/kbd> buy/);
  assert.match(html, /<kbd>s<\/kbd> sell/);
  assert.match(html, /:sell WQUAI-WQI 100 @ 5/);
  assert.match(html, /:buy WQUAI-WQI 100 market_ioc slippage=50bps/);
  assert.match(html, /:proof trade-000001/);
  assert.match(html, /:deposit WQI 10 prepare owner-wallet-only/);
  assert.match(html, /:withdraw WQUAI 1 prepare owner-wallet-only/);
  assert.match(html, /:api create-key bot-mm-1 prepare owner-wallet-signature-required NO_WITHDRAW/);
  assert.match(html, /:api revoke-key bot-mm-1 prepare owner-wallet-signature-required NO_ADMIN/);
  assert.match(html, /data-qdx-trigger-cross/);
  assert.match(html, /submit mock cross/i);
  assert.match(html, /market_ioc slippage=50bps/i);
  assert.match(html, /data-qdx-trigger-cancel/);
  assert.match(html, /create \+ cancel mock order/i);
  assert.match(html, /matcher-local cancellation does not cancel on-chain nonce/i);
  assert.match(html, /data-qdx-vault-prepare-deposit/);
  assert.match(html, /prepare vault deposit/i);
  assert.match(html, /data-qdx-vault-prepare-withdraw/);
  assert.match(html, /prepare vault withdrawal/i);
  assert.match(html, /data-qdx-delegate-key-prepare-register/);
  assert.match(html, /prepare delegate\/API key/i);
  assert.match(html, /data-qdx-delegate-key-prepare-revoke/);
  assert.match(html, /prepare delegate\/API revoke/i);
  assert.match(html, /data-qdx-delegate-key-register-status/);
  assert.match(html, /data-qdx-delegate-key-revoke-status/);
  assert.match(html, /owner-wallet-signature-required/i);
  assert.match(html, /NO_WITHDRAW\/NO_ADMIN/i);
  assert.match(html, /no wallet\/RPC\/signing\/broadcast\/deploy\/tx\/funds/i);
  assert.match(html, /no real Quai tx\/explorer\/funds/i);
  assert.match(html, /data-qdx-trigger-status/);
  assert.match(html, /data-qdx-cancel-status/);
  assert.match(html, /data-qdx-vault-deposit-status/);
  assert.match(html, /data-qdx-vault-withdraw-status/);
  assert.match(html, /&gt; order signed locally/);
  assert.match(html, /&gt; mock settlement reference: mock-settlement-fill-000001/);
});

test('renderTradeProofPanel surfaces prepare-only vault operation safety when present', () => {
  const html = renderTradeProofPanel({
    ...mockVerticalSliceFixture,
    vaultOperation: {
      httpStatus: 501,
      error: 'owner_wallet_vault_deposit_not_implemented',
      source: 'owner-wallet-vault-operation-placeholder',
      custody: 'non-custodial-contract-vault',
      vaultOperation: 'deposit',
      operationStatus: 'prepare-only-not-implemented',
      ownerAuthorization: 'owner-wallet-required',
      permissions: ['NO_WITHDRAW', 'NO_ADMIN'],
      delegateAuthority: 'delegates-cannot-deposit-or-withdraw',
      realQuaiTransactions: false,
      walletRequired: false,
      fundsMoved: false,
      tradingVaultMutation: false,
      approvalGate: 'explicit-approval-required-before-wallet-signing-or-quai-broadcast',
      safety: {
        notice: 'Prepare-only owner-wallet TradingVault boundary: no wallet is loaded, no signature is created, no RPC URL is read, no transaction is submitted, and no funds move.',
      },
      message: 'TradingVault deposit is owner-wallet-only and not implemented in local mock mode; this prepare-only endpoint does not load wallets, sign, broadcast, submit transactions, mutate TradingVault, or move funds.',
    },
  });

  assert.match(html, /prepare-only vault operation/i);
  assert.match(html, /http status[\s\S]*501/i);
  assert.match(html, /owner-wallet-vault-operation-placeholder/);
  assert.match(html, /vault operation[\s\S]*deposit/i);
  assert.match(html, /owner-wallet-required/);
  assert.match(html, /delegates-cannot-deposit-or-withdraw/);
  assert.match(html, /NO_WITHDRAW, NO_ADMIN/);
  assert.match(html, /real Quai tx[\s\S]*false/i);
  assert.match(html, /wallet required[\s\S]*false/i);
  assert.match(html, /funds moved[\s\S]*false/i);
  assert.match(html, /TradingVault mutation[\s\S]*false/i);
  assert.match(html, /no wallet is loaded/i);
  assert.match(html, /no signature is created/i);
  assert.match(html, /no RPC URL is read/i);
  assert.match(html, /no transaction is submitted/i);
  assert.doesNotMatch(html, /WITHDRAW, ADMIN/);
});

test('renderTradeProofPanel surfaces prepare-only delegate/API key safety when present', () => {
  const html = renderTradeProofPanel({
    ...mockVerticalSliceFixture,
    delegateKeyOperation: {
      httpStatus: 501,
      error: 'delegate_key_registration_not_implemented',
      operation: 'register_delegate_key',
      source: 'delegate-key-owner-signed-prepare-boundary',
      custody: 'non-custodial-no-withdrawal-authority',
      operationStatus: 'prepare-only-owner-signed-required',
      ownerAuthorization: 'owner-wallet-signature-required',
      delegateAuthority: 'trade-only-no-withdraw-no-admin',
      requiredFields: ['delegate', 'expiresAt', 'allowedMarkets', 'maxNotional', 'permissions'],
      permissions: ['PLACE_ORDER', 'CANCEL_ORDER', 'CANCEL_ALL', 'NO_WITHDRAW', 'NO_ADMIN'],
      delegateCanWithdraw: false,
      delegateCanAdmin: false,
      realQuaiTransactions: false,
      walletRequired: false,
      fundsMoved: false,
      tradingVaultMutation: false,
      approvalGate: 'explicit-approval-required-before-owner-wallet-signing-or-live-registry-mutation',
      message: 'No delegate key is registered in local prepare-only mode; owner-signed registration is not wired to wallet loading, signing, broadcast, deploy, transaction helpers, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement.',
    },
  });

  assert.match(html, /prepare-only delegate\/API key/i);
  assert.match(html, /http status[\s\S]*501/i);
  assert.match(html, /delegate-key-owner-signed-prepare-boundary/);
  assert.match(html, /register_delegate_key/);
  assert.match(html, /prepare-only-owner-signed-required/);
  assert.match(html, /owner-wallet-signature-required/);
  assert.match(html, /trade-only-no-withdraw-no-admin/);
  assert.match(html, /PLACE_ORDER, CANCEL_ORDER, CANCEL_ALL, NO_WITHDRAW, NO_ADMIN/);
  assert.match(html, /delegate can withdraw[\s\S]*false/i);
  assert.match(html, /delegate can admin[\s\S]*false/i);
  assert.match(html, /real Quai tx[\s\S]*false/i);
  assert.match(html, /wallet required[\s\S]*false/i);
  assert.match(html, /funds moved[\s\S]*false/i);
  assert.match(html, /TradingVault mutation[\s\S]*false/i);
  assert.match(html, /not wired to wallet loading, signing, broadcast, deploy, transaction helpers, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement/i);
  assert.doesNotMatch(html, /WITHDRAW, ADMIN/);
});

test('renderTradeProofPanel surfaces live fills stream safety when present', () => {
  const html = renderTradeProofPanel({
    ...mockVerticalSliceFixture,
    liveStream: {
      channel: 'fills',
      source: 'in-memory-indexer-projection',
      custody: 'non-custodial-no-withdrawal-authority',
      permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
      safetyNotice: 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.',
      streamEvent: {
        reason: 'mock_settlement_confirmed',
        marketId: 'WQUAI-WQI',
      },
    },
  });

  assert.match(html, /live fills stream/i);
  assert.match(html, /channel[\s\S]*fills/i);
  assert.match(html, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
  assert.match(html, /mock_settlement_confirmed/);
  assert.match(html, /no real Quai transaction/i);
  assert.doesNotMatch(html, /WITHDRAW, ADMIN/);
});

test('renderTradeProofPanel surfaces live orders stream matcher-local cancellation safety when present', () => {
  const html = renderTradeProofPanel({
    ...mockVerticalSliceFixture,
    orders: [
      {
        orderHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        marketId: 'WQUAI-WQI',
        side: 'sell',
        price: '5',
        amount: '100',
        remainingAmount: '0',
        status: 'cancelled',
        nonceCancellation: 'not-implied-matcher-local-only',
      },
    ],
    orderStream: {
      channel: 'orders',
      source: 'mock-order-projection',
      custody: 'non-custodial-no-withdrawal-authority',
      permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
      cancellationPermissions: ['CANCEL_ORDER', 'NO_WITHDRAW', 'NO_ADMIN'],
      safetyNotice: 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.',
      nonceManager: 'matcher-local-cancel-only-on-chain-nonce-unchanged',
      cancelledOrderHashes: ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      message: 'Mock cancellation removes only matcher-open quantity and does not cancel the on-chain nonce; user nonce cancellation must be signed through NonceManager later.',
      streamEvent: {
        reason: 'matcher_local_order_cancelled',
        marketId: 'WQUAI-WQI',
      },
    },
  });

  assert.match(html, /live orders stream/i);
  assert.match(html, /channel[\s\S]*orders/i);
  assert.match(html, /mock-order-projection/);
  assert.match(html, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
  assert.match(html, /CANCEL_ORDER, NO_WITHDRAW, NO_ADMIN/);
  assert.match(html, /matcher_local_order_cancelled/);
  assert.match(html, /matcher-local-cancel-only-on-chain-nonce-unchanged/);
  assert.match(html, /not-implied-matcher-local-only/);
  assert.match(html, /does not cancel the on-chain nonce/i);
  assert.match(html, /cancelled/i);
  assert.match(html, /no real Quai transaction/i);
  assert.doesNotMatch(html, /WITHDRAW, ADMIN/);
});

test('renderTradeProofPanel surfaces live balances stream mock-vault safety when present', () => {
  const html = renderTradeProofPanel({
    ...mockVerticalSliceFixture,
    balances: [],
    balanceProjection: {
      balances: [],
      source: 'mock-vault-projection',
      custody: 'non-custodial-contract-vault',
      permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
      withdrawalAuthority: 'owner-wallet-only',
      settlementMode: 'mock',
      realQuaiTransactions: false,
      walletRequired: false,
      safetyNotice: 'Mock vault projection only: no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.',
    },
    balanceStream: {
      channel: 'balances',
      source: 'mock-vault-projection',
      custody: 'non-custodial-no-withdrawal-authority',
      permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
      safetyNotice: 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.',
      streamEvent: {
        reason: 'initial_snapshot',
      },
    },
  });

  assert.match(html, /live balances stream/i);
  assert.match(html, /channel[\s\S]*balances/i);
  assert.match(html, /mock-vault-projection/);
  assert.match(html, /non-custodial-contract-vault/);
  assert.match(html, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
  assert.match(html, /withdrawals[\s\S]*owner-wallet-only/i);
  assert.match(html, /settlementMode[\s\S]*mock/i);
  assert.match(html, /real Quai tx[\s\S]*false/i);
  assert.match(html, /wallet required[\s\S]*false/i);
  assert.match(html, /no wallet loaded, no funds moved/i);
  assert.match(html, /no delegate withdrawal\/admin authority/i);
  assert.match(html, /no mock vault balances yet/i);
  assert.doesNotMatch(html, /WITHDRAW, ADMIN/);
});

test('renderTradeProofPanel surfaces live vault history stream safety when present', () => {
  const html = renderTradeProofPanel({
    ...mockVerticalSliceFixture,
    vaultHistoryStream: {
      channels: ['deposits', 'withdrawals'],
      source: 'tradingvault-event-projection',
      custody: 'non-custodial-no-withdrawal-authority',
      permissions: ['READ_ONLY', 'NO_WITHDRAW', 'NO_ADMIN'],
      safetyNotice: 'Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.',
      projectionSafetyNotices: {
        deposits: 'Read-only TradingVault Deposit history projection: mock rows have no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.',
        withdrawals: 'Read-only TradingVault Withdraw history projection: mock rows have no real Quai transaction, no wallet loaded, no funds moved, and no delegate withdrawal/admin authority.',
      },
      settlementMode: 'mock',
      realQuaiTransactions: false,
      walletRequired: false,
      fundsMoved: false,
      tradingVaultMutation: false,
      rowCount: 0,
      streamEvents: [
        { channel: 'deposits', event: { reason: 'initial_snapshot' } },
        { channel: 'withdrawals', event: { reason: 'initial_snapshot' } },
      ],
    },
  });

  assert.match(html, /live vault history streams/i);
  assert.match(html, /channels[\s\S]*deposits, withdrawals/i);
  assert.match(html, /tradingvault-event-projection/);
  assert.match(html, /non-custodial-no-withdrawal-authority/);
  assert.match(html, /READ_ONLY, NO_WITHDRAW, NO_ADMIN/);
  assert.match(html, /settlementMode[\s\S]*mock/i);
  assert.match(html, /real Quai tx[\s\S]*false/i);
  assert.match(html, /wallet required[\s\S]*false/i);
  assert.match(html, /funds moved[\s\S]*false/i);
  assert.match(html, /TradingVault mutation[\s\S]*false/i);
  assert.match(html, /row count[\s\S]*0/i);
  assert.match(html, /no real Quai transaction/i);
  assert.match(html, /no wallet loaded, no funds moved/i);
  assert.match(html, /no delegate withdrawal\/admin authority/i);
  assert.doesNotMatch(html, /WITHDRAW, ADMIN/);
});
