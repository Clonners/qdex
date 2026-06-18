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
    '**Architecture:** Existing safe listing surfaces are `GET /v1/listings/policy`, `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision`, and prepare-only fallback.',
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
    'Runtime listing submission beyond local queue/decision state is approval-gated before implementation',
    'The prepare-only `POST /v1/listings/requests` fallback still returns a non-implemented response unless the caller explicitly uses approved local review queue mode',
    'Current local review request shape',
    'There is still no on-chain/runtime listing submission beyond metadata-only local queue/decision surfaces.',
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
    '## Completed local review decision boundary',
    '`POST /v1/listings/requests/{requestId}/decision`',
    '`decisionMode: local_review_decision`',
    '`requestStatus: reviewed-local-metadata-only`',
    '`reviewDecision: approved-local-metadata-only`',
    '`reviewDecision: rejected-local-metadata-only`',
    '## Next approval-gated boundary',
    'Approval required: runtime listing submission beyond local queue/decision state or MarketRegistry admin mutation',
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

test('campaign status records completion-mode continuation plus local listing, balance, and vault prepare checkpoints', async () => {
  const status = await readText('CAMPAIGN_STATUS.md');

  for (const requiredText of [
      '- Status: active',
      'Current phase: testnet cutover',
      'Completed previous run',
      'Still not approved',
      'Approval received',
      'Completed this run',
      'Clonners',
      'listing review',
      'vault history',
      'TradingVault',
      'FeeManager',
      'DelegateKeyRegistry',
      'READ_ONLY',
      'NO_WITHDRAW',
      'NO_ADMIN',
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
  const postMockPlan = await readText('docs/plans/2026-06-06-post-mock-mvp-readiness-owner-signed-nonce-cancel.md');

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
      text.includes('Existing safe listing surfaces: `GET /v1/listings/policy`, `GET /v1/listings/review-flow`, local in-memory `GET /v1/listings/requests`, `POST /v1/listings/requests` with `requestMode: local_review_queue`, `POST /v1/listings/requests/{requestId}/decision` with `decisionMode: local_review_decision`, and prepare-only fallback.'),
      `${label} should point to the existing policy/request surfaces instead of a future planning slice`,
    );
    assert.ok(
      text.includes('Approval required: runtime listing submission beyond local queue/decision state or MarketRegistry admin mutation'),
      `${label} should pin the runtime listing/admin approval gate`,
    );
    assert.doesNotMatch(
      text,
      staleApprovalGateCopy,
      `${label} must not describe completed listing surfaces as a future/next autonomous planning boundary`,
    );
  }

  assert.ok(
    contracts.includes('local in-memory listing review queue/decision workflow preserves the approval gate without MarketRegistry mutation'),
    'contracts docs should describe both local queue and decision state as completed approval-boundary surfaces',
  );
  assert.ok(
    architecture.includes('current local authority/local queue/decision surfaces'),
    'architecture docs should not stop at the pre-decision local queue surface',
  );
  assert.doesNotMatch(
    `${contracts}\n${architecture}\n${postMockPlan}`,
    /local in-memory listing review queue preserves the approval gate|current local authority\/local queue surfaces|queue clients remain a separate local-only slice/,
    'post-decision docs must not keep stale queue-only or pre-decision-client wording',
  );
  assert.ok(
    postMockPlan.includes('queue and decision clients are complete local-only slices'),
    'post-mock readiness plan should mark queue/decision clients complete instead of future separate work',
  );
  assert.ok(
    contractsReadme.includes('Approval required: runtime listing submission beyond local queue/decision state or MarketRegistry admin mutation'),
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
