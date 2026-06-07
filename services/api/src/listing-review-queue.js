const QUEUE_SOURCE = 'listed-asset-marketregistry-review-flow';
const QUEUE_STATUS = 'design-only-local-metadata';
const QUEUE_PHASE = 'clonners-managed-local-review-before-dao';
const QUEUE_STATUS_VALUE = 'local-in-memory-review-queue';
const QUEUED_REQUEST_STATUS = 'queued-local-review';
const REVIEWED_REQUEST_STATUS = 'reviewed-local-metadata-only';
const PENDING_REVIEW_DECISION = 'pending-local-review';
const APPROVED_REVIEW_DECISION = 'approved-local-metadata-only';
const REJECTED_REVIEW_DECISION = 'rejected-local-metadata-only';
const DECISION_MODE = 'local_review_decision';
const REVIEW_STAGE = 'metadata_intake';
const DECISION_STAGES = new Set(['token_safety_review', 'market_parameter_review', 'clonners_local_approval']);
const NEXT_MUTATION_GATE = 'explicit Clonners approval required before MarketRegistry.addMarket';
const PERMISSIONS = ['NO_WITHDRAW', 'NO_ADMIN'];
const PRIMARY_QUOTE_ASSETS = ['WQUAI', 'WQI'];
const TOKEN_MODEL = 'erc20-style-vault-token';
const REQUIRED_FIELDS = [
  'baseSymbol',
  'quoteSymbol',
  'tokenModel',
  'requestedMarketId',
  'pricePrecision',
  'amountPrecision',
  'minAmount',
];
const FORBIDDEN_LIVE_AUTHORITY_FIELDS = [
  'tokenAddress',
  'contractAddress',
  'deployedAddress',
  'listingAdminKey',
  'listingAdminPrivateKey',
  'wallet',
  'walletPrivateKey',
  'rpcUrl',
  'signature',
  'txHash',
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const paddedId = (prefix, value) => `${prefix}-${String(value).padStart(6, '0')}`;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const isPositiveDecimalString = (value) => typeof value === 'string' && /^[0-9]+$/.test(value) && BigInt(value) > 0n;

const marketRegistrySafety = () => ({
  truthSource: 'MarketRegistry-enabled-pair-metadata',
  marketRegistryMutation: false,
  canMoveTradingVaultBalances: false,
  canGrantWithdrawalAuthority: false,
  canGrantAdminAuthority: false,
});

const queueSafety = () => ({
  permissions: [...PERMISSIONS],
  marketRegistryMutation: false,
  realQuaiTransactions: false,
  walletRequired: false,
  noWalletLoading: true,
  noRpcUrlAccess: true,
  noSigning: true,
  noBroadcast: true,
  noDeploys: true,
  noTransactionSubmission: true,
  noListingAdminKeys: true,
  noRealTokenAddresses: true,
  noFundsMovement: true,
  notice:
    'Local in-memory listing review queue only: it cannot mutate MarketRegistry, move TradingVault balances, grant withdrawal/admin authority, load wallets, read RPC URLs, sign, broadcast, deploy, submit transactions, or register real token addresses.',
});

const requestSnapshot = (request) => ({
  baseSymbol: request.baseSymbol,
  quoteSymbol: request.quoteSymbol,
  tokenModel: request.tokenModel,
  requestedMarketId: request.requestedMarketId,
  pricePrecision: request.pricePrecision,
  amountPrecision: request.amountPrecision,
  minAmount: request.minAmount,
  ...(request.reviewNotes === undefined ? {} : { reviewNotes: request.reviewNotes }),
});

const decisionSnapshot = (decision) => ({
  decision: decision.decision,
  ...(decision.rejectionReason === undefined ? {} : { rejectionReason: decision.rejectionReason }),
  decisionNotes: decision.decisionNotes,
});

const rejection = ({ reason, message, missingFields, forbiddenFields }) => ({
  statusCode: 400,
  body: {
    error: 'listing_request_rejected',
    source: QUEUE_SOURCE,
    status: QUEUE_STATUS,
    requestStatus: 'rejected-local-review-input',
    phase: QUEUE_PHASE,
    reason,
    ...(missingFields === undefined ? {} : { missingFields }),
    ...(forbiddenFields === undefined ? {} : { forbiddenFields }),
    custody: 'non-custodial',
    marketRegistry: marketRegistrySafety(),
    permissions: [...PERMISSIONS],
    realQuaiTransactions: false,
    walletRequired: false,
    safety: queueSafety(),
    message,
  },
});

const validateLocalReviewRequest = (request) => {
  if (!isObject(request)) {
    return rejection({
      reason: 'missing_request_body',
      message: 'POST /v1/listings/requests requires a metadata-only JSON body for local review queue mode.',
    });
  }

  const forbiddenFields = FORBIDDEN_LIVE_AUTHORITY_FIELDS.filter((field) => request[field] !== undefined);
  if (forbiddenFields.length > 0) {
    return rejection({
      reason: 'forbidden_live_authority_fields',
      forbiddenFields,
      message:
        'Local listing review requests cannot carry live token addresses, wallet/admin key material, RPC URLs, signatures, transaction hashes, or deploy metadata.',
    });
  }

  const missingFields = REQUIRED_FIELDS.filter((field) => request[field] === undefined || request[field] === null || request[field] === '');
  if (missingFields.length > 0) {
    return rejection({
      reason: 'missing_required_fields',
      missingFields,
      message: 'Local listing review requests require complete metadata before queueing.',
    });
  }

  if (request.requestMode !== 'local_review_queue') {
    return rejection({
      reason: 'missing_local_review_queue_mode',
      message: 'Runtime listing review queue writes require requestMode: local_review_queue to avoid confusing local review with on-chain submission.',
    });
  }

  if (!isNonEmptyString(request.baseSymbol) || !isNonEmptyString(request.requestedMarketId)) {
    return rejection({
      reason: 'invalid_symbol_metadata',
      message: 'baseSymbol and requestedMarketId must be non-empty metadata strings.',
    });
  }

  if (!PRIMARY_QUOTE_ASSETS.includes(request.quoteSymbol)) {
    return rejection({
      reason: 'unsupported_quote_asset',
      message: 'Local listing review requests must quote against WQUAI or WQI for this MVP boundary.',
    });
  }

  if (request.tokenModel !== TOKEN_MODEL) {
    return rejection({
      reason: 'unsupported_token_model',
      message: 'Local listing review requests are limited to ERC-20-style vault-token metadata.',
    });
  }

  if (!isNonNegativeInteger(request.pricePrecision) || !isNonNegativeInteger(request.amountPrecision)) {
    return rejection({
      reason: 'invalid_precision_metadata',
      message: 'pricePrecision and amountPrecision must be non-negative integers.',
    });
  }

  if (!isPositiveDecimalString(request.minAmount)) {
    return rejection({
      reason: 'invalid_min_amount',
      message: 'minAmount must be a positive decimal string.',
    });
  }

  return { accepted: true };
};

const decisionRejection = ({ statusCode = 400, requestId, reason, message, forbiddenFields }) => ({
  statusCode,
  body: {
    error: 'listing_review_decision_rejected',
    source: QUEUE_SOURCE,
    status: QUEUE_STATUS,
    requestStatus: 'rejected-local-review-decision',
    phase: QUEUE_PHASE,
    reason,
    ...(requestId === undefined ? {} : { requestId }),
    ...(forbiddenFields === undefined ? {} : { forbiddenFields }),
    custody: 'non-custodial',
    marketRegistry: marketRegistrySafety(),
    permissions: [...PERMISSIONS],
    realQuaiTransactions: false,
    walletRequired: false,
    safety: queueSafety(),
    message,
  },
});

const validateLocalReviewDecision = (decision) => {
  if (!isObject(decision)) {
    return decisionRejection({
      reason: 'invalid_decision_body',
      message: 'Local review decisions require a metadata-only JSON body.',
    });
  }

  const forbiddenFields = FORBIDDEN_LIVE_AUTHORITY_FIELDS.filter((field) => decision[field] !== undefined);
  if (forbiddenFields.length > 0) {
    return decisionRejection({
      reason: 'forbidden_live_authority_fields',
      forbiddenFields,
      message:
        'Local review decisions cannot carry live token addresses, wallet/admin key material, RPC URLs, signatures, transaction hashes, or deploy metadata.',
    });
  }

  if (decision.decisionMode !== DECISION_MODE) {
    return decisionRejection({
      reason: 'invalid_decision_mode',
      message: 'Local review decisions require decisionMode: local_review_decision.',
    });
  }

  if (!['approve', 'reject'].includes(decision.decision)) {
    return decisionRejection({
      reason: 'invalid_decision',
      message: 'Local review decision must be approve or reject.',
    });
  }

  if (!DECISION_STAGES.has(decision.reviewStage)) {
    return decisionRejection({
      reason: 'invalid_review_stage',
      message: 'Local review decision stage must be token_safety_review, market_parameter_review, or clonners_local_approval.',
    });
  }

  if (!isNonEmptyString(decision.decisionNotes)) {
    return decisionRejection({
      reason: 'missing_decision_notes',
      message: 'Local review decisions require human-readable local metadata decision notes.',
    });
  }

  if (decision.decision === 'reject' && !isNonEmptyString(decision.rejectionReason)) {
    return decisionRejection({
      reason: 'missing_rejection_reason',
      message: 'Rejected local review decisions require a metadata-only rejectionReason.',
    });
  }

  return { accepted: true };
};

const queueEnvelope = (requests) => ({
  source: QUEUE_SOURCE,
  status: QUEUE_STATUS,
  phase: QUEUE_PHASE,
  queueStatus: QUEUE_STATUS_VALUE,
  persistence: 'in-memory-local-server-only',
  inspectionSurface: 'GET /v1/listings/requests',
  submitSurface: 'POST /v1/listings/requests with requestMode=local_review_queue',
  count: requests.length,
  requests: requests.map(clone),
  marketRegistry: marketRegistrySafety(),
  safety: queueSafety(),
  message:
    'Local listing review queue is in-memory and metadata-only; it does not mutate MarketRegistry, move TradingVault balances, or grant withdrawal/admin authority.',
});

const queuedRequest = ({ sequence, request }) => ({
  requestId: paddedId('listing-request', sequence),
  source: QUEUE_SOURCE,
  status: QUEUE_STATUS,
  requestStatus: QUEUED_REQUEST_STATUS,
  phase: QUEUE_PHASE,
  requestMode: 'local_review_queue',
  reviewStage: REVIEW_STAGE,
  reviewDecision: PENDING_REVIEW_DECISION,
  submittedAt: paddedId('local-review-sequence', sequence),
  request: requestSnapshot(request),
  custody: 'non-custodial',
  marketRegistry: marketRegistrySafety(),
  permissions: [...PERMISSIONS],
  realQuaiTransactions: false,
  walletRequired: false,
  safety: queueSafety(),
  message:
    'Queued in the in-memory local review queue only; this does not mutate MarketRegistry, move TradingVault balances, grant withdrawal/admin authority, load wallets, read RPC URLs, sign, broadcast, deploy, submit transactions, or register real token addresses.',
});

export const createListingReviewQueue = () => {
  const requests = [];
  let sequence = 0;
  let decisionSequence = 0;

  return {
    enqueue(request) {
      const validation = validateLocalReviewRequest(request);
      if (!validation.accepted) {
        return validation;
      }

      sequence += 1;
      const queued = queuedRequest({ sequence, request });
      requests.push(queued);

      return {
        statusCode: 202,
        body: clone(queued),
      };
    },

    list() {
      return queueEnvelope(requests);
    },

    decide(requestId, decision) {
      const validation = validateLocalReviewDecision(decision);
      if (!validation.accepted) {
        return validation;
      }

      const request = requests.find((candidate) => candidate.requestId === requestId);
      if (request === undefined) {
        return decisionRejection({
          statusCode: 404,
          requestId,
          reason: 'request_not_found',
          message: 'No local in-memory listing review request exists for this requestId.',
        });
      }

      if (request.reviewDecision !== PENDING_REVIEW_DECISION) {
        return decisionRejection({
          statusCode: 409,
          requestId,
          reason: 'request_already_decided',
          message: 'Local review decisions are metadata-only and immutable once recorded for a queued request.',
        });
      }

      decisionSequence += 1;
      request.requestStatus = REVIEWED_REQUEST_STATUS;
      request.decisionMode = DECISION_MODE;
      request.reviewStage = decision.reviewStage;
      request.reviewDecision = decision.decision === 'approve' ? APPROVED_REVIEW_DECISION : REJECTED_REVIEW_DECISION;
      request.decisionAt = paddedId('local-review-decision-sequence', decisionSequence);
      request.nextMutationGate = NEXT_MUTATION_GATE;
      request.decision = decisionSnapshot(decision);
      request.message = `Recorded local ${decision.decision === 'approve' ? 'approval' : 'rejection'} metadata only; this does not mutate MarketRegistry, move TradingVault balances, grant withdrawal/admin authority, load wallets, read RPC URLs, sign, broadcast, deploy, submit transactions, or register real token addresses.`;

      return {
        statusCode: 200,
        body: clone(request),
      };
    },
  };
};

export const createListingReviewQueueStatus = () => queueEnvelope([]);
