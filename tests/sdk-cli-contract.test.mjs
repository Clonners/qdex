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
      'account.balances()',
      'listings.policy.get()',
      'listings.reviewFlow.get()',
      'listings.requests.prepareSubmit()',
      'listings.requests.listLocalReviewQueue()',
      'listings.requests.enqueueLocalReview()',
      'listings.requests.decideLocalReview()',
      'relayer.settlementModeGate.get()',
      'nonces.prepareCancel()',
      'delegateKeys.prepareRegister()',
      'delegateKeys.prepareRevoke()',
      'orders.createLimitOrder',
      'orders.createMarketIocOrder',
      'orders.submitSignedOrder',
      'OrderSubmissionResult',
      'IndexedFillProjection',
      'fills.stream()',
      'orders.stream()',
      'proofs.trade(tradeId)',
      'orders.cancelAll',
      'SignedOrder',
      'FillPacket',
      'TradeProof',
      'POST /v1/orders',
      'GET /v1/proofs/trades/:tradeId',
      'GET /v1/contracts',
      'GET /v1/account/balances',
      'GET /v1/listings/policy',
      'GET /v1/listings/review-flow',
      'POST /v1/listings/requests',
      'GET /v1/listings/requests',
      'GET /v1/relayer/settlement-mode-gate',
      'POST /v1/nonces/cancel',
      'POST /v1/delegate-keys',
      'DELETE /v1/delegate-keys/{keyId}',
      'relayer-approval-gate',
      'real_quai_approval_gate_blocked',
      'owner_signed_nonce_cancel_not_implemented',
      'owner-signed-required',
      'delegate_key_registration_not_implemented',
      'delegate_key_revocation_not_implemented',
      'delegate-key-owner-signed-prepare-boundary',
      'prepare-only-owner-signed-required',
      'owner-wallet-signature-required',
      'local-only-not-deployed',
      'listed-asset-marketregistry-policy',
      'listed-asset-marketregistry-review-flow',
      'clonners-managed-local-review-before-dao',
      'design-only-local-metadata',
      'approved-local-metadata-only',
      'listing_request_not_implemented',
      'not-implemented-approval-required',
      'local-in-memory-review-queue',
      'queued-local-review',
      'pending-local-review',
      'local_review_decision',
      'reviewed-local-metadata-only',
      'rejected-local-metadata-only',
      'explicit Clonners approval required before MarketRegistry.addMarket',
      'MarketRegistry-enabled-pair-metadata',
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
      'mock-vault-projection',
      'settlementMode: mock',
      'no wallet loading, signing, broadcast, or relayer submission',
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
      'account.balances()',
      'listings.policy.get()',
      'listings.review_flow.get()',
      'listings.requests.prepare_submit()',
      'listings.requests.list_local_review_queue()',
      'listings.requests.enqueue_local_review()',
      'listings.requests.decide_local_review()',
      'relayer.settlement_mode_gate.get()',
      'nonces.prepare_cancel()',
      'delegate_keys.prepare_register()',
      'delegate_keys.prepare_revoke()',
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
      'GET /v1/account/balances',
      'GET /v1/listings/policy',
      'GET /v1/listings/review-flow',
      'POST /v1/listings/requests',
      'GET /v1/listings/requests',
      'GET /v1/relayer/settlement-mode-gate',
      'relayer-approval-gate',
      'real_quai_approval_gate_blocked',
      'POST /v1/nonces/cancel',
      'POST /v1/delegate-keys',
      'DELETE /v1/delegate-keys/{keyId}',
      'owner_signed_nonce_cancel_not_implemented',
      'owner-signed-required',
      'delegate_key_registration_not_implemented',
      'delegate_key_revocation_not_implemented',
      'delegate-key-owner-signed-prepare-boundary',
      'prepare-only-owner-signed-required',
      'owner-wallet-signature-required',
      'local-only-not-deployed',
      'listed-asset-marketregistry-policy',
      'listed-asset-marketregistry-review-flow',
      'clonners-managed-local-review-before-dao',
      'design-only-local-metadata',
      'approved-local-metadata-only',
      'listing_request_not_implemented',
      'not-implemented-approval-required',
      'local-in-memory-review-queue',
      'queued-local-review',
      'pending-local-review',
      'local_review_decision',
      'reviewed-local-metadata-only',
      'rejected-local-metadata-only',
      'explicit Clonners approval required before MarketRegistry.addMarket',
      'MarketRegistry-enabled-pair-metadata',
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
      'mock-vault-projection',
      'settlementMode: mock',
      'no wallet loading, signing, broadcast, or relayer submission',
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
      'qdex listings policy',
      'qdex listings review-flow',
      'qdex listings request --prepare',
      'qdex listings requests',
      'qdex listings request --local-review-queue',
      'qdex listings request decision <request-id>',
      'qdex relayer gate',
      'qdex nonces cancel --prepare',
      'qdex api create-key bot-mm-1 --prepare',
      'qdex api revoke-key bot-mm-1 --prepare',
      'qdex balance',
      'qdex order buy QI-QUAI --amount 1000 --price 0.123',
      'qdex order sell QI-QUAI --quote-amount 100 --market --slippage-bps 50',
      'qdex cancel --all',
      'qdex stream fills',
      'qdex stream orders',
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
      'GET /v1/account/balances',
      'GET /v1/listings/policy',
      'GET /v1/listings/review-flow',
      'POST /v1/listings/requests',
      'GET /v1/listings/requests',
      'GET /v1/relayer/settlement-mode-gate',
      'relayer-approval-gate',
      'real_quai_approval_gate_blocked',
      'listed-asset-marketregistry-policy',
      'listed-asset-marketregistry-review-flow',
      'clonners-managed-local-review-before-dao',
      'design-only-local-metadata',
      'approved-local-metadata-only',
      'listing_request_not_implemented',
      'not-implemented-approval-required',
      'local-in-memory-review-queue',
      'queued-local-review',
      'pending-local-review',
      'local_review_decision',
      'reviewed-local-metadata-only',
      'rejected-local-metadata-only',
      'explicit Clonners approval required before MarketRegistry.addMarket',
      'MarketRegistry-enabled-pair-metadata',
      'POST /v1/nonces/cancel',
      'POST /v1/delegate-keys',
      'DELETE /v1/delegate-keys/{keyId}',
      'owner_signed_nonce_cancel_not_implemented',
      'owner-signed-required',
      'delegate_key_registration_not_implemented',
      'delegate_key_revocation_not_implemented',
      'delegate-key-owner-signed-prepare-boundary',
      'prepare-only-owner-signed-required',
      'owner-wallet-signature-required',
      'mock-vault-projection',
      'no wallet loaded, no funds moved',
      'no real Quai transaction',
      'no funds moved',
    ],
    'cli/qdex/spec.md',
  );
});

test('SDK and CLI docs expose prepare-only TradingVault deposit and withdrawal clients', async () => {
  const docs = [
    {
      path: 'sdk/typescript/spec.md',
      terms: [
        'vault.deposits.prepare()',
        'vault.withdrawals.prepare()',
        'POST /v1/vault/deposits/prepare',
        'POST /v1/vault/withdrawals/prepare',
        'owner_wallet_vault_deposit_not_implemented',
        'owner_wallet_vault_withdrawal_not_implemented',
        'owner-wallet-vault-operation-placeholder',
        'non-custodial-contract-vault',
        'prepare-only-not-implemented',
        'owner-wallet-required',
        'delegates-cannot-deposit-or-withdraw',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'fundsMoved: false',
        'tradingVaultMutation: false',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'dex.vault.deposits.prepare',
        'dex.vault.withdrawals.prepare',
        'POST /v1/vault/deposits/prepare',
        'POST /v1/vault/withdrawals/prepare',
        'owner_wallet_vault_deposit_not_implemented',
        'owner_wallet_vault_withdrawal_not_implemented',
        'owner-wallet-vault-operation-placeholder',
        'non-custodial-contract-vault',
        'prepare-only-not-implemented',
        'owner-wallet-required',
        'delegates-cannot-deposit-or-withdraw',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'fundsMoved: false',
        'tradingVaultMutation: false',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'sdk/python/spec.md',
      terms: [
        'vault.deposits.prepare()',
        'vault.withdrawals.prepare()',
        'POST /v1/vault/deposits/prepare',
        'POST /v1/vault/withdrawals/prepare',
        'owner_wallet_vault_deposit_not_implemented',
        'owner_wallet_vault_withdrawal_not_implemented',
        'owner-wallet-vault-operation-placeholder',
        'non-custodial-contract-vault',
        'prepare-only-not-implemented',
        'owner-wallet-required',
        'delegates-cannot-deposit-or-withdraw',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'fundsMoved: False',
        'tradingVaultMutation: False',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'dex.vault.deposits.prepare',
        'dex.vault.withdrawals.prepare',
        'POST /v1/vault/deposits/prepare',
        'POST /v1/vault/withdrawals/prepare',
        'owner_wallet_vault_deposit_not_implemented',
        'owner_wallet_vault_withdrawal_not_implemented',
        'owner-wallet-vault-operation-placeholder',
        'non-custodial-contract-vault',
        'prepare-only-not-implemented',
        'owner-wallet-required',
        'delegates-cannot-deposit-or-withdraw',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'fundsMoved: False',
        'tradingVaultMutation: False',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'cli/qdex/spec.md',
      terms: [
        'qdex vault deposit --prepare',
        'qdex vault withdraw --prepare',
        'POST /v1/vault/deposits/prepare',
        'POST /v1/vault/withdrawals/prepare',
        'owner_wallet_vault_deposit_not_implemented',
        'owner_wallet_vault_withdrawal_not_implemented',
        'owner-wallet-vault-operation-placeholder',
        'non-custodial-contract-vault',
        'prepare-only-not-implemented',
        'owner-wallet-required',
        'delegates-cannot-deposit-or-withdraw',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'fundsMoved: false',
        'tradingVaultMutation: false',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'qdex vault deposit --prepare',
        'qdex vault withdraw --prepare',
        'POST /v1/vault/deposits/prepare',
        'POST /v1/vault/withdrawals/prepare',
        'owner_wallet_vault_deposit_not_implemented',
        'owner_wallet_vault_withdrawal_not_implemented',
        'owner-wallet-vault-operation-placeholder',
        'non-custodial-contract-vault',
        'prepare-only-not-implemented',
        'owner-wallet-required',
        'delegates-cannot-deposit-or-withdraw',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'fundsMoved: false',
        'tradingVaultMutation: false',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds behavior',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
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

test('SDK and CLI README docs expose read-only listedAssetStatus metadata boundary', async () => {
  const docs = [
    {
      path: 'sdk/typescript/spec.md',
      terms: [
        'listedAssetStatus',
        'status: wrapped-token-listing',
        'primaryQuoteAssets: [WQUAI, WQI]',
        'supportedAssetModel: erc20-style-vault-token',
        'userListedTokens: true',
        'native Qi direct settlement is out of scope',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real native Qi settlement claim',
      ],
    },
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'contractRegistry.listedAssetStatus.status',
        'wrapped-token-listing',
        'WQUAI',
        'WQI',
        'community-created tokens',
        'out of scope',
        'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real native Qi settlement claim',
      ],
    },
    {
      path: 'sdk/python/spec.md',
      terms: [
        'listedAssetStatus',
        'status: wrapped-token-listing',
        'primaryQuoteAssets: [WQUAI, WQI]',
        'supportedAssetModel: erc20-style-vault-token',
        'userListedTokens: True',
        'native Qi direct settlement is out of scope',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real native Qi settlement claim',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'contracts["listedAssetStatus"]["status"]',
        'wrapped-token-listing',
        'WQUAI',
        'WQI',
        'user-listed token support',
        'native Qi direct settlement out of scope',
      ],
    },
    {
      path: 'cli/qdex/spec.md',
      terms: [
        'listedAssetStatus',
        'status: wrapped-token-listing',
        'primary quote assets `WQUAI` and `WQI`',
        'supportedAssetModel: erc20-style-vault-token',
        'user-listed token support',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'real native Qi direct settlement',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'listedAssetStatus',
        'wrapped-token-listing',
        'WQUAI',
        'WQI',
        'user-listed token support',
        'real native Qi settlement claim',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});

test('SDK and CLI contract docs do not point bots at completed listing metadata as a future slice', async () => {
  const docs = [
    'sdk/typescript/spec.md',
    'sdk/typescript/README.md',
    'sdk/python/spec.md',
    'sdk/python/README.md',
    'cli/qdex/spec.md',
    'cli/qdex/README.md',
  ];

  for (const path of docs) {
    const text = await readText(path);
    assert.doesNotMatch(
      text,
      /Token listing and MarketRegistry metadata are the next safe surface|future listing\/MarketRegistry metadata/,
      `${path} should point to existing listing-policy/request surfaces, not completed future listing metadata work`,
    );
    assert.ok(
      text.includes('Listing policy metadata is already exposed through GET /v1/listings/policy'),
      `${path} should mention the current read-only listing-policy surface`,
    );
    assert.ok(
      text.includes('listing requests remain prepare-only through POST /v1/listings/requests'),
      `${path} should keep listing requests prepare-only`,
    );
    assert.ok(
      text.includes('runtime listing submission or MarketRegistry admin mutation requires explicit Clonners approval'),
      `${path} should pin the next trust boundary to explicit Clonners approval`,
    );
  }
});

test('SDK and CLI README docs expose read-only listing policy clients', async () => {
  const docs = [
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'dex.listings.policy.get',
        'GET /v1/listings/policy',
        'listed-asset-marketregistry-policy',
        'design-only-local-metadata',
        'WQUAI',
        'WQI',
        'community-created-erc20-style-token',
        'MarketRegistry-enabled-pair-metadata',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'dex.listings.policy.get',
        'GET /v1/listings/policy',
        'listed-asset-marketregistry-policy',
        'design-only-local-metadata',
        'WQUAI',
        'WQI',
        'community-created-erc20-style-token',
        'MarketRegistry-enabled-pair-metadata',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'qdex listings policy',
        'GET /v1/listings/policy',
        'listed-asset-marketregistry-policy',
        'design-only-local-metadata',
        'WQUAI',
        'WQI',
        'community-created-erc20-style-token',
        'MarketRegistry-enabled-pair-metadata',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});

test('SDK and CLI README docs expose read-only listing review-flow clients', async () => {
  const docs = [
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'dex.listings.reviewFlow.get',
        'GET /v1/listings/review-flow',
        'listed-asset-marketregistry-review-flow',
        'design-only-local-metadata',
        'clonners-managed-local-review-before-dao',
        'approved-local-metadata-only',
        'rejected-local-metadata-only',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallets/RPC/signing/broadcast/deploy/tx/funds behavior',
        'cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'dex.listings.review_flow.get',
        'GET /v1/listings/review-flow',
        'listed-asset-marketregistry-review-flow',
        'design-only-local-metadata',
        'clonners-managed-local-review-before-dao',
        'approved-local-metadata-only',
        'rejected-local-metadata-only',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallets/RPC/signing/broadcast/deploy/tx/funds behavior',
        'cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'qdex listings review-flow',
        'GET /v1/listings/review-flow',
        'listed-asset-marketregistry-review-flow',
        'design-only-local-metadata',
        'clonners-managed-local-review-before-dao',
        'approved-local-metadata-only',
        'rejected-local-metadata-only',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallets/RPC/signing/broadcast/deploy/tx/funds behavior',
        'cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});

test('SDK and CLI README docs expose prepare-only listing request clients', async () => {
  const docs = [
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'dex.listings.requests.prepareSubmit',
        'POST /v1/listings/requests',
        'listing_request_not_implemented',
        'not-implemented-approval-required',
        'listed-asset-marketregistry-policy',
        'design-only-local-metadata',
        'WQUAI',
        'WQI',
        'community-created-erc20-style-token',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior',
        'does not prove a listing request was submitted on-chain',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'dex.listings.requests.prepare_submit',
        'POST /v1/listings/requests',
        'listing_request_not_implemented',
        'not-implemented-approval-required',
        'listed-asset-marketregistry-policy',
        'design-only-local-metadata',
        'WQUAI',
        'WQI',
        'community-created-erc20-style-token',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior',
        'does not prove a listing request was submitted on-chain',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'qdex listings request --prepare',
        'POST /v1/listings/requests',
        'listing_request_not_implemented',
        'not-implemented-approval-required',
        'listed-asset-marketregistry-policy',
        'design-only-local-metadata',
        'WQUAI',
        'WQI',
        'community-created-erc20-style-token',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior',
        'does not prove a listing request was submitted on-chain',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});

test('SDK and CLI README docs expose local listing review queue clients', async () => {
  const docs = [
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'dex.listings.requests.listLocalReviewQueue',
        'dex.listings.requests.enqueueLocalReview',
        'GET /v1/listings/requests',
        'POST /v1/listings/requests with requestMode: local_review_queue',
        'listed-asset-marketregistry-review-flow',
        'local-in-memory-review-queue',
        'in-memory-local-server-only',
        'queued-local-review',
        'pending-local-review',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior',
        'cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'dex.listings.requests.list_local_review_queue',
        'dex.listings.requests.enqueue_local_review',
        'GET /v1/listings/requests',
        'POST /v1/listings/requests with requestMode: local_review_queue',
        'listed-asset-marketregistry-review-flow',
        'local-in-memory-review-queue',
        'in-memory-local-server-only',
        'queued-local-review',
        'pending-local-review',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior',
        'cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'qdex listings requests',
        'qdex listings request --local-review-queue',
        'GET /v1/listings/requests',
        'POST /v1/listings/requests with requestMode: local_review_queue',
        'listed-asset-marketregistry-review-flow',
        'local-in-memory-review-queue',
        'in-memory-local-server-only',
        'queued-local-review',
        'pending-local-review',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior',
        'cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});

test('SDK and CLI README docs expose local listing review decision clients', async () => {
  const docs = [
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'dex.listings.requests.decideLocalReview',
        'POST /v1/listings/requests/{requestId}/decision',
        'decisionMode: local_review_decision',
        'reviewed-local-metadata-only',
        'approved-local-metadata-only',
        'rejected-local-metadata-only',
        'explicit Clonners approval required before MarketRegistry.addMarket',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior',
        'cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'dex.listings.requests.decide_local_review',
        'POST /v1/listings/requests/{requestId}/decision',
        'decisionMode: local_review_decision',
        'reviewed-local-metadata-only',
        'approved-local-metadata-only',
        'rejected-local-metadata-only',
        'explicit Clonners approval required before MarketRegistry.addMarket',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior',
        'cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'qdex listings request decision <request-id>',
        'POST /v1/listings/requests/{requestId}/decision',
        'decisionMode: local_review_decision',
        'reviewed-local-metadata-only',
        'approved-local-metadata-only',
        'rejected-local-metadata-only',
        'explicit Clonners approval required before MarketRegistry.addMarket',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet/RPC/sign/broadcast/deploy/tx/funds/MarketRegistry mutation behavior',
        'cannot move TradingVault balances, mutate MarketRegistry, or grant withdrawal/admin power',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});

test('SDK and CLI README docs expose owner-signed nonce-cancel prepare-only clients', async () => {
  const docs = [
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'dex.nonces.prepareCancel',
        'POST /v1/nonces/cancel',
        'owner_signed_nonce_cancel_not_implemented',
        'owner-signed-required',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet loading, signing, broadcast, or relayer submission',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'dex.nonces.prepare_cancel',
        'POST /v1/nonces/cancel',
        'owner_signed_nonce_cancel_not_implemented',
        'owner-signed-required',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet loading, signing, broadcast, or relayer submission',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'qdex nonces cancel --prepare',
        'POST /v1/nonces/cancel',
        'owner_signed_nonce_cancel_not_implemented',
        'owner-signed-required',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'no wallet loading, signing, broadcast, or relayer submission',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});

test('SDK and CLI README docs expose prepare-only delegate/API key registration and revocation clients', async () => {
  const docs = [
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'dex.delegateKeys.prepareRegister',
        'dex.delegateKeys.prepareRevoke',
        'POST /v1/delegate-keys',
        'DELETE /v1/delegate-keys/{keyId}',
        'delegate_key_registration_not_implemented',
        'delegate_key_revocation_not_implemented',
        'delegate-key-owner-signed-prepare-boundary',
        'prepare-only-owner-signed-required',
        'owner-wallet-signature-required',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'delegateCanWithdraw: false',
        'delegateCanAdmin: false',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'dex.delegate_keys.prepare_register',
        'dex.delegate_keys.prepare_revoke',
        'POST /v1/delegate-keys',
        'DELETE /v1/delegate-keys/{keyId}',
        'delegate_key_registration_not_implemented',
        'delegate_key_revocation_not_implemented',
        'delegate-key-owner-signed-prepare-boundary',
        'prepare-only-owner-signed-required',
        'owner-wallet-signature-required',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'delegateCanWithdraw: False',
        'delegateCanAdmin: False',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'qdex api create-key bot-mm-1 --prepare',
        'qdex api revoke-key bot-mm-1 --prepare',
        'POST /v1/delegate-keys',
        'DELETE /v1/delegate-keys/{keyId}',
        'delegate_key_registration_not_implemented',
        'delegate_key_revocation_not_implemented',
        'delegate-key-owner-signed-prepare-boundary',
        'prepare-only-owner-signed-required',
        'owner-wallet-signature-required',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'delegateCanWithdraw: false',
        'delegateCanAdmin: false',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});

test('SDK and CLI docs expose read-only delegate-key registration and revocation history clients', async () => {
  const docs = [
    {
      path: 'sdk/typescript/spec.md',
      terms: [
        'delegateKeys.listRegistrations()',
        'delegateKeys.listRevocations()',
        'GET /v1/delegate-keys/registrations',
        'GET /v1/delegate-keys/revocations',
        'delegatekeyregistry-event-projection',
        'DelegateKeyRegisteredProjection',
        'DelegateKeyRevokedProjection',
        'READ_ONLY',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'delegateKeyRegistryMutation: false',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'dex.delegateKeys.listRegistrations',
        'dex.delegateKeys.listRevocations',
        'GET /v1/delegate-keys/registrations',
        'GET /v1/delegate-keys/revocations',
        'delegatekeyregistry-event-projection',
        'DelegateKeyRegisteredProjection',
        'DelegateKeyRevokedProjection',
        'delegateKeyRegistryMutation: false',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'sdk/python/spec.md',
      terms: [
        'delegate_keys.list_registrations()',
        'delegate_keys.list_revocations()',
        'GET /v1/delegate-keys/registrations',
        'GET /v1/delegate-keys/revocations',
        'delegatekeyregistry-event-projection',
        'DelegateKeyRegisteredProjection',
        'DelegateKeyRevokedProjection',
        'READ_ONLY',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'delegateKeyRegistryMutation: False',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'dex.delegate_keys.list_registrations',
        'dex.delegate_keys.list_revocations',
        'GET /v1/delegate-keys/registrations',
        'GET /v1/delegate-keys/revocations',
        'delegatekeyregistry-event-projection',
        'DelegateKeyRegisteredProjection',
        'DelegateKeyRevokedProjection',
        'delegateKeyRegistryMutation: False',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'cli/qdex/spec.md',
      terms: [
        'qdex api registrations',
        'qdex api revocations',
        'GET /v1/delegate-keys/registrations',
        'GET /v1/delegate-keys/revocations',
        'delegatekeyregistry-event-projection',
        'DelegateKeyRegisteredProjection',
        'DelegateKeyRevokedProjection',
        'delegateKeyRegistryMutation: false',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'qdex api registrations',
        'qdex api revocations',
        'GET /v1/delegate-keys/registrations',
        'GET /v1/delegate-keys/revocations',
        'delegatekeyregistry-event-projection',
        'DelegateKeyRegisteredProjection',
        'DelegateKeyRevokedProjection',
        'delegateKeyRegistryMutation: false',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});

test('SDK and CLI README docs expose read-only relayer gate clients', async () => {
  const docs = [
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'dex.relayer.settlementModeGate.get',
        'GET /v1/relayer/settlement-mode-gate',
        'relayer-approval-gate',
        'currentSettlementMode: mock',
        'real_quai_approval_gate_blocked',
        'no wallet loading, signing, broadcast, RPC URL access, or transaction submission',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'dex.relayer.settlement_mode_gate.get',
        'GET /v1/relayer/settlement-mode-gate',
        'relayer-approval-gate',
        'currentSettlementMode: mock',
        'real_quai_approval_gate_blocked',
        'no wallet loading, signing, broadcast, RPC URL access, or transaction submission',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'qdex relayer gate',
        'GET /v1/relayer/settlement-mode-gate',
        'relayer-approval-gate',
        'currentSettlementMode: mock',
        'real_quai_approval_gate_blocked',
        'no wallet loading, signing, broadcast, RPC URL access, or transaction submission',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});

test('SDK and qdex CLI docs expose read-only vault history stream consumers', async () => {
  const docs = [
    {
      path: 'sdk/typescript/spec.md',
      terms: [
        'vault.deposits.openStream()',
        'vault.withdrawals.openStream()',
        'vault.deposits.stream({ limit })',
        'vault.withdrawals.stream({ limit })',
        '/v1/ws?channel=deposits',
        '/v1/ws?channel=withdrawals',
        'tradingvault-event-projection',
        'TradingVaultDepositProjection',
        'TradingVaultWithdrawalProjection',
        'READ_ONLY',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'settlementMode: mock',
        'fundsMoved: false',
        'tradingVaultMutation: false',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'sdk/typescript/README.md',
      terms: [
        'dex.vault.deposits.openStream',
        'dex.vault.withdrawals.openStream',
        '/v1/ws?channel=deposits',
        '/v1/ws?channel=withdrawals',
        'tradingvault-event-projection',
        'TradingVaultDepositProjection',
        'TradingVaultWithdrawalProjection',
        'READ_ONLY',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'settlementMode: mock',
        'fundsMoved: false',
        'tradingVaultMutation: false',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'sdk/python/spec.md',
      terms: [
        'vault.deposits.open_stream()',
        'vault.withdrawals.open_stream()',
        'vault.deposits.stream(limit=limit)',
        'vault.withdrawals.stream(limit=limit)',
        '/v1/ws?channel=deposits',
        '/v1/ws?channel=withdrawals',
        'tradingvault-event-projection',
        'TradingVaultDepositProjection',
        'TradingVaultWithdrawalProjection',
        'READ_ONLY',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'settlementMode: mock',
        'fundsMoved: False',
        'tradingVaultMutation: False',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'sdk/python/README.md',
      terms: [
        'dex.vault.deposits.open_stream',
        'dex.vault.withdrawals.open_stream',
        '/v1/ws?channel=deposits',
        '/v1/ws?channel=withdrawals',
        'tradingvault-event-projection',
        'TradingVaultDepositProjection',
        'TradingVaultWithdrawalProjection',
        'READ_ONLY',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'settlementMode: mock',
        'fundsMoved: False',
        'tradingVaultMutation: False',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'cli/qdex/spec.md',
      terms: [
        'qdex stream deposits',
        'qdex stream withdrawals',
        '/v1/ws?channel=deposits',
        '/v1/ws?channel=withdrawals',
        'tradingvault-event-projection',
        'TradingVaultDepositProjection',
        'TradingVaultWithdrawalProjection',
        'READ_ONLY',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'settlementMode: mock',
        'fundsMoved: false',
        'tradingVaultMutation: false',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
    {
      path: 'cli/qdex/README.md',
      terms: [
        'qdex stream deposits',
        'qdex stream withdrawals',
        '/v1/ws?channel=deposits',
        '/v1/ws?channel=withdrawals',
        'tradingvault-event-projection',
        'TradingVaultDepositProjection',
        'TradingVaultWithdrawalProjection',
        'READ_ONLY',
        'NO_WITHDRAW',
        'NO_ADMIN',
        'settlementMode: mock',
        'fundsMoved: false',
        'tradingVaultMutation: false',
        'no wallet/RPC/signing/broadcast/deploy/tx/funds behavior',
      ],
    },
  ];

  for (const doc of docs) {
    const text = await readText(doc.path);
    assertIncludesAll(text, doc.terms, doc.path);
  }
});
