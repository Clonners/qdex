import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const readText = (relativePath) => readFile(new URL(relativePath, repoRoot), 'utf8');

const planPath = 'docs/plans/2026-06-07-post-listing-policy-marketregistry-admin-boundary.md';

const forbiddenRuntimeDetails = new RegExp(
  [
    'process\\.env',
    'RPC_URL',
    'PRIVATE[_-]?KEY',
    'mnemo' + 'nic',
    'seed' + ' phrase',
    'signingKey',
    'walletPrivateKey',
    'listingAdminPrivateKey',
    'txHash:',
  ].join('|'),
  'i',
);

test('post-listing-policy plan pins approval-gated listing submission and MarketRegistry admin metadata only', async () => {
  const plan = await readText(planPath);

  for (const requiredText of [
    '# Post-Listing-Policy MarketRegistry Admin Boundary Implementation Plan',
    '> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.',
    '**Goal:** Pin the completed listing-policy/request surfaces, the approved local in-memory review queue, and the explicit MarketRegistry admin approval gate without adding live listing/admin behavior.',
    '**Architecture:** Existing safe listing surfaces are `GET /v1/listings/policy`, `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, and prepare-only fallback.',
    '**Tech Stack:** Markdown plan/spec ratchets, Node `node:test` doc guards, existing OpenAPI/API/SDK/CLI docs, and local-only Solidity `MarketRegistry` concepts.',
    '## Current completed boundary',
    '`GET /v1/listings/policy`',
    '`source: listed-asset-marketregistry-policy`',
    '`status: design-only-local-metadata`',
    '`realQuaiTransactions: false`',
    '`walletRequired: false`',
    'WQUAI',
    'WQI',
    'community-created ERC-20-style vault tokens',
    '## Approval-gated runtime listing submission boundary',
    'Runtime listing submission beyond local queue state is approval-gated before implementation',
    'The prepare-only `POST /v1/listings/requests` fallback still returns a non-implemented response unless the caller explicitly uses approved local review queue mode',
    'Current local review request shape',
    'There is still no on-chain/runtime listing submission beyond metadata-only local queue surfaces.',
    '## MarketRegistry admin metadata boundary',
    '`MarketRegistry.addMarket` is enabled-pair metadata only',
    '`MarketRegistry.disableMarket` retains metadata for indexer replay',
    'cannot move `TradingVault` balances',
    'cannot grant withdrawal/admin power',
    '## Approved local authority handoff',
    'Clonners approved a useful listing authority path that starts operator-managed and can later delegate to a DAO/multisig',
    'MarketRegistry.proposeMarketAuthority(nextAuthority) -> MarketRegistry.acceptMarketAuthority()',
    'MarketAuthorityHandoffProposed, MarketAuthorityHandoffAccepted',
    'old Clonners-managed authority loses `addMarket`/`disableMarket` power',
    '## Delegates and listing-admin separation',
    '`NO_WITHDRAW`',
    '`NO_ADMIN`',
    'Delegate/API keys cannot become listing-admin authority',
    '## Disallowed autonomous work',
    'no wallets, RPC URLs, signing, broadcasts, deploys, transaction helpers, real token addresses, listing-admin key behavior, MarketRegistry mutation, or funds movement',
    '## Completed prepare-only API placeholder',
    '`POST /v1/listings/requests`',
    'returns a precise `501` approval-gated placeholder',
    '`source: listed-asset-marketregistry-policy`',
    '`status: design-only-local-metadata`',
    '`requestStatus: not-implemented-approval-required`',
    '`marketRegistryMutation: false`',
    '## Completed prepare-only clients',
    'TypeScript SDK `listings.requests.prepareSubmit()`',
    'Python SDK `listings.requests.prepare_submit()`',
    '`qdex listings request --prepare`',
    'return the intentional `501` envelope as a prepare-only boundary response',
    'not as a successful listing submission',
    '## Completed local review queue boundary',
    'Clonners approved the local runtime listing review queue as an in-memory metadata-only intake surface',
    '`queueStatus: local-in-memory-review-queue`',
    '`persistence: in-memory-local-server-only`',
    '`requestStatus: queued-local-review`',
    '## Next approval-gated boundary',
    'Approval required: runtime listing submission beyond local queue state or MarketRegistry admin mutation',
    'No further autonomous runtime listing submission or MarketRegistry admin behavior should start until Clonners explicitly approves the trust boundary.',
  ]) {
    assert.ok(plan.includes(requiredText), `${planPath} should include ${requiredText}`);
  }

  assert.doesNotMatch(plan, forbiddenRuntimeDetails, 'plan must not include runtime secrets, env/RPC/deploy mechanics, or real address/key claims');
  assert.doesNotMatch(plan, /adminWithdraw|withdrawFrom|rescue|sweep/i, 'plan must not introduce custody/admin withdrawal surfaces');
  assert.doesNotMatch(
    plan,
    /Future listing submission should be introduced first as a prepare-only\/docs\/OpenAPI boundary|Minimum future request fields, if approved for a placeholder:|source: listing-submission-approval-gate/,
    'plan must not keep stale pre-placeholder wording now that listing request clients are complete',
  );
  assert.doesNotMatch(
    plan,
    /The next safe bounded slice is read-only SDK\/CLI clients for the prepare-only listing request placeholder/,
    'plan must not keep completed listing-request client exposure as the next slice',
  );
});

test('campaign status records approved local listing review queue boundary', async () => {
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
    '- Status: active autonomous builder cron; local runtime listing review queue implemented; listing submission and MarketRegistry admin mutation remain approval-gated',
    '- Current phase: Clonners-managed local in-memory listing request review queue before DAO handoff; no wallets/RPC/deploys/txs are approved',
    'Approval received: Clonners approved building a useful listing path initially managed by Clonners and later delegable to a DAO.',
    'Existing safe listing surfaces are `GET /v1/listings/policy`, read-only `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, TypeScript/Python/qdex review-flow clients, and prepare-only listing-request fallback; contract-level authority handoff remains local-only.',
    'Implemented: Clonners approved and the campaign added a local runtime listing review queue only; listing submission and MarketRegistry admin mutation still require separate explicit approval.',
    'Next bounded slice: expose TypeScript/Python/qdex clients for the local listing review queue',
    'Added read-only TypeScript/Python SDK and `qdex` CLI clients for `/v1/listings/review-flow`;',
    'Clonners approved the next local-only runtime listing review queue slice.',
    'Implemented the approved local in-memory listing review queue:',
  ]) {
    assert.ok(status.includes(requiredText), `CAMPAIGN_STATUS.md should include ${requiredText}`);
  }
});

test('listing docs point future work to the post-listing policy approval gate', async () => {
  const listingPolicy = await readText('docs/listing-policy.md');
  const contracts = await readText('docs/contracts.md');
  const architecture = await readText('docs/architecture.md');
  const contractsReadme = await readText('contracts/README.md');
  const wrappedPlan = await readText('docs/plans/2026-06-07-native-qi-wrapper-adapter-boundary.md');

  for (const text of [listingPolicy, contracts, architecture, contractsReadme, wrappedPlan]) {
    assert.ok(text.includes(planPath), 'docs should link the post-listing-policy admin boundary plan');
    assert.ok(
      text.includes('post-listing-policy MarketRegistry admin boundary'),
      'docs should name the post-listing-policy MarketRegistry admin boundary',
    );
  }

  const staleApprovalGateCopy = /Future listing submission and MarketRegistry admin metadata are pinned as an approval-gated, design-only next boundary|That plan keeps future listing submission and MarketRegistry admin metadata design-only|The next (?:safe|design-only) planning boundary is/;

  for (const [label, text] of [
    ['docs/listing-policy.md', listingPolicy],
    ['docs/contracts.md', contracts],
    ['docs/architecture.md', architecture],
  ]) {
    assert.ok(
      text.includes('Existing safe listing surfaces: `GET /v1/listings/policy`, `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, and prepare-only fallback.'),
      `${label} should point to the existing policy/request surfaces instead of a future planning slice`,
    );
    assert.ok(
      text.includes('Approval required: runtime listing submission beyond local queue state or MarketRegistry admin mutation'),
      `${label} should pin the runtime listing/admin approval gate`,
    );
  }
      text,
      staleApprovalGateCopy,
      `${label} must not describe completed listing surfaces as a future/next autonomous planning boundary`,
    );
  }

  assert.ok(
    contractsReadme.includes('Approval required: runtime listing submission beyond local queue state or MarketRegistry admin mutation'),
    'contracts README should point to the approval gate instead of a completed listing-policy slice',
  );
  assert.doesNotMatch(
    contractsReadme,
    /Recommended next slice: token listing and MarketRegistry metadata flow/,
    'contracts README must not keep the completed token-listing metadata flow as the next slice',
  );
  assert.ok(
    wrappedPlan.includes('Completed: TypeScript SDK, Python SDK, and `qdex` CLI clients expose the read-only listing policy'),
    'wrapped token plan should mark listing-policy clients complete',
  );
  assert.doesNotMatch(
    wrappedPlan,
    /Next implementation slice\n\nToken listing and MarketRegistry metadata flow clients/,
    'wrapped token plan should not keep completed listing-policy client exposure as the next slice',
  );
});
