/**
 * Testnet deployment orchestrator — manages deployment lifecycle
 * from draft through deployment to completion.
 *
 * This module provides state machine semantics for the deployment
 * process, enforcing dependency ordering, tracking progress, and
 * providing clear go/no-go gates at each stage.
 *
 * Boundaries:
 * - No real RPC URL, wallet, signing, broadcast, deploy, or funds behavior.
 * - Address recording requires explicit approval metadata.
 * - Safety metadata is always present in results.
 */

import { DEPLOY_ORDER, DEPLOY_STEPS, createDeployManifest, validateDeployManifest } from './deploy-manifest.js';
import { TESTNET_CONFIG } from './testnet-config.js';

const DEPLOYABLE_CONTRACTS = Object.freeze([
  'TradingVault',
  'NonceManager',
  'MarketRegistry',
  'FeeManager',
  'DelegateKeyRegistry',
  'Settlement',
]);

const POST_DEPLOY_STEPS = Object.freeze([
  'VaultSettlementAuthority',
  'MarketWQIWQUAI',
  'FeePolicyInit',
]);

const ALL_STEP_CONTRACTS = Object.freeze([
  ...DEPLOYABLE_CONTRACTS,
  ...POST_DEPLOY_STEPS,
]);

const DEPLOYMENT_STATES = Object.freeze({
  DRAFT: 'draft',
  VALIDATED: 'validated',
  DEPLOYING: 'deploying',
  PARTIALLY_DEPLOYED: 'partially_deployed',
  DEPLOYED: 'deployed',
  FAILED: 'failed',
});

const STATE_TRANSITIONS = Object.freeze({
  [DEPLOYMENT_STATES.DRAFT]: [DEPLOYMENT_STATES.VALIDATED, DEPLOYMENT_STATES.FAILED, DEPLOYMENT_STATES.DRAFT],
  [DEPLOYMENT_STATES.VALIDATED]: [DEPLOYMENT_STATES.DEPLOYING, DEPLOYMENT_STATES.FAILED, DEPLOYMENT_STATES.DRAFT],
  [DEPLOYMENT_STATES.DEPLOYING]: [
    DEPLOYMENT_STATES.DEPLOYING,
    DEPLOYMENT_STATES.PARTIALLY_DEPLOYED,
    DEPLOYMENT_STATES.DEPLOYED,
    DEPLOYMENT_STATES.FAILED,
    DEPLOYMENT_STATES.DRAFT,
  ],
  [DEPLOYMENT_STATES.PARTIALLY_DEPLOYED]: [
    DEPLOYMENT_STATES.DEPLOYING,
    DEPLOYMENT_STATES.DEPLOYED,
    DEPLOYMENT_STATES.FAILED,
    DEPLOYMENT_STATES.DRAFT,
  ],
  [DEPLOYMENT_STATES.DEPLOYED]: [DEPLOYMENT_STATES.FAILED, DEPLOYMENT_STATES.DRAFT],
  [DEPLOYMENT_STATES.FAILED]: [DEPLOYMENT_STATES.DRAFT, DEPLOYMENT_STATES.FAILED],
});

const CUSTODY = 'non-custodial-deploy-orchestrator';
const SAFETY_NOTICE =
  'Testnet deployment orchestrator is approval-gated: no wallet loading, signing, broadcast, RPC URL access, or transaction submission without explicit Clonners approval.';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const isAddress = (value) => typeof value === 'string' && ADDRESS_RE.test(value);
const isHexString = (value) => typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value);
const clone = (value) => JSON.parse(JSON.stringify(value));

// ── Dependency helpers ──────────────────────────────────────────────

const getStepByContract = (contract) => DEPLOY_STEPS.find((s) => s.contract === contract);

const getDependencies = (contract) => {
  const step = getStepByContract(contract);
  return step ? [...step.dependencies] : [];
};

// ── State machine ───────────────────────────────────────────────────

export function createDeployOrchestrator() {
  let state = DEPLOYMENT_STATES.DRAFT;
  let manifest = createDeployManifest();
  let validationErrors = [];
  let deploymentLog = [];
  let approvalMetadata = null;
  let failedReason = null;

  const addLog = (entry) => {
    deploymentLog.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
  };

  const canTransition = (from, to) => {
    const allowed = STATE_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  };

  const transition = (to, reason = null) => {
    if (!canTransition(state, to)) {
      throw new Error(`Invalid state transition: ${state} → ${to} (reason: ${reason ?? 'unknown'})`);
    }
    state = to;
    if (reason) {
      failedReason = reason;
    }
    addLog({ type: 'state_transition', from: state === to ? undefined : state, to, reason });
  };

  const getSafetyMetadata = () => ({
    realQuaiTransactions: false,
    walletRequired: false,
    noWalletLoaded: true,
    noRpcAccess: true,
    noFundsMovement: true,
    noBroadcast: true,
    custody: CUSTODY,
    approvalGate: 'explicit-approval-required-before-deploy',
    safetyNotice: SAFETY_NOTICE,
  });

  return {
    /**
     * Initialize the orchestrator from scratch.
     * Returns the current state.
     */
    initialize() {
      state = DEPLOYMENT_STATES.DRAFT;
      manifest = createDeployManifest();
      validationErrors = [];
      deploymentLog = [];
      approvalMetadata = null;
      failedReason = null;
      addLog({ type: 'initialize', state });
      return state;
    },

    /**
     * Set approval metadata before deployment.
     * Required before transitioning to DEPLOYING state.
     *
     * @param {object} metadata - { approvalId, approvedBy, approvedAt, scope }
     * @returns {object} - result with safety metadata
     */
    setApproval(metadata) {
      if (!metadata || !metadata.approvalId || !metadata.approvedBy || !metadata.approvedAt) {
        return {
          success: false,
          reason: 'incomplete_approval_metadata',
          requiredFields: ['approvalId', 'approvedBy', 'approvedAt'],
          ...getSafetyMetadata(),
        };
      }

      if (metadata.scope && typeof metadata.scope !== 'string') {
        return {
          success: false,
          reason: 'scope_must_be_string',
          ...getSafetyMetadata(),
        };
      }

      approvalMetadata = { ...metadata };
      addLog({ type: 'approval_set', approvalId: metadata.approvalId, approvedBy: metadata.approvedBy });
      return {
        success: true,
        approval: clone(approvalMetadata),
        ...getSafetyMetadata(),
      };
    },

    /**
     * Validate the deployment manifest.
     * Transitions DRAFT → VALIDATED on success, DRAFT → FAILED on failure.
     *
     * @returns {object} - validation result with safety metadata
     */
    validate() {
      if (state !== DEPLOYMENT_STATES.DRAFT) {
        return {
          success: false,
          reason: `cannot_validate_in_state: ${state}`,
          currentState: state,
          ...getSafetyMetadata(),
        };
      }

      const validation = validateDeployManifest(manifest);
      validationErrors = [...validation.errors];

      if (!validation.valid) {
        transition(DEPLOYMENT_STATES.FAILED, `manifest_validation_failed: ${validationErrors.join('; ')}`);
        return {
          success: false,
          state: DEPLOYMENT_STATES.FAILED,
          errors: [...validationErrors],
          ...getSafetyMetadata(),
        };
      }

      // Verify dependency ordering in manifest steps
      const depErrors = [];
      for (const step of manifest.steps) {
        const deps = getDependencies(step.contract);
        for (const dep of deps) {
          const depStepIdx = manifest.steps.findIndex((s) => s.contract === dep);
          const stepIdx = manifest.steps.findIndex((s) => s.contract === step.contract);
          if (depStepIdx >= stepIdx) {
            depErrors.push(`dependency ${dep} must be deployed before ${step.contract}`);
          }
        }
      }

      if (depErrors.length > 0) {
        validationErrors.push(...depErrors);
        transition(DEPLOYMENT_STATES.FAILED, `dependency_ordering_failed: ${depErrors.join('; ')}`);
        return {
          success: false,
          state: DEPLOYMENT_STATES.FAILED,
          errors: [...validationErrors],
          ...getSafetyMetadata(),
        };
      }

      transition(DEPLOYMENT_STATES.VALIDATED);
      return {
        success: true,
        state: DEPLOYMENT_STATES.VALIDATED,
        steps: manifest.steps.map((s) => ({
          contract: s.contract,
          dependencies: s.dependencies,
          status: s.status,
        })),
        ...getSafetyMetadata(),
      };
    },

    /**
     * Begin deployment — transitions VALIDATED → DEPLOYING.
     * Requires approval metadata to be set.
     *
     * @returns {object} - result with safety metadata
     */
    beginDeployment() {
      if (state !== DEPLOYMENT_STATES.VALIDATED) {
        return {
          success: false,
          reason: `cannot_begin_deployment_in_state: ${state}`,
          currentState: state,
          ...getSafetyMetadata(),
        };
      }

      if (!approvalMetadata) {
        return {
          success: false,
          reason: 'approval_metadata_required',
          currentState: state,
          requiredFields: ['approvalId', 'approvedBy', 'approvedAt', 'scope'],
          ...getSafetyMetadata(),
        };
      }

      transition(DEPLOYMENT_STATES.DEPLOYING);
      addLog({ type: 'deployment_started', approvalId: approvalMetadata.approvalId });
      return {
        success: true,
        state: DEPLOYMENT_STATES.DEPLOYING,
        approval: clone(approvalMetadata),
        network: TESTNET_CONFIG.networkName,
        zone: TESTNET_CONFIG.zone,
        chainId: TESTNET_CONFIG.chainId,
        deployer: TESTNET_CONFIG.deployer,
        steps: DEPLOY_STEPS.map((s) => ({
          contract: s.contract,
          dependencies: s.dependencies,
          status: 'pending',
        })),
        ...getSafetyMetadata(),
      };
    },

    /**
     * Record a deployed contract address.
     * Updates manifest address and step status.
     *
     * @param {string} contract - Contract name
     * @param {string} address - Deployed address (0x...)
     * @param {object} deploymentInfo - { txHash, blockNumber, gasUsed }
     * @returns {object} - result with safety metadata
     */
    recordAddress(contract, address, deploymentInfo = {}) {
      if (state !== DEPLOYMENT_STATES.DEPLOYING && state !== DEPLOYMENT_STATES.PARTIALLY_DEPLOYED) {
        return {
          success: false,
          reason: `cannot_record_address_in_state: ${state}`,
          currentState: state,
          ...getSafetyMetadata(),
        };
      }

      if (!isAddress(address)) {
        return {
          success: false,
          reason: 'invalid_address_format',
          expected: '0x + 40 hex characters',
          provided: address,
          ...getSafetyMetadata(),
        };
      }

      // Verify contract is in deployment sequence
      const step = getStepByContract(contract);
      if (!step) {
        return {
          success: false,
          reason: `unknown_contract: ${contract}`,
          validContracts: ALL_STEP_CONTRACTS,
          ...getSafetyMetadata(),
        };
      }

      // Verify dependencies are already deployed
      const unmetDeps = [];
      for (const dep of step.dependencies) {
        const depAddress = manifest.addresses[dep];
        if (!depAddress) {
          unmetDeps.push(dep);
        }
      }

      if (unmetDeps.length > 0) {
        return {
          success: false,
          reason: 'unmet_dependencies',
          contract,
          unmetDeps: [...unmetDeps],
          ...getSafetyMetadata(),
        };
      }

      // Check for duplicate recording
      if (manifest.addresses[contract] !== null) {
        return {
          success: false,
          reason: 'address_already_recorded',
          contract,
          existingAddress: manifest.addresses[contract],
          ...getSafetyMetadata(),
        };
      }

      // Update manifest address — create new frozen manifest with updated address
      manifest = Object.freeze({
        ...manifest,
        addresses: Object.freeze({
          ...manifest.addresses,
          [contract]: address,
        }),
        steps: Object.freeze(
          manifest.steps.map((s) =>
            Object.freeze({
              ...s,
              status: s.contract === contract ? 'deployed' : s.status,
              address: s.contract === contract ? address : s.address,
            })
          )
        ),
      });

      // Update deployment log
      addLog({
        type: 'contract_deployed',
        contract,
        address,
        txHash: deploymentInfo.txHash ?? null,
        blockNumber: deploymentInfo.blockNumber ?? null,
        gasUsed: deploymentInfo.gasUsed ?? null,
      });

      // Check if all contracts are deployed
      const deployedCount = Object.values(manifest.addresses).filter(
        (a) => typeof a === 'string' && isAddress(a)
      ).length;
      const totalContracts = Object.keys(manifest.addresses).length;

      let newState = state;
      if (deployedCount === totalContracts) {
        newState = DEPLOYMENT_STATES.DEPLOYED;
      } else if (deployedCount > 0) {
        newState = DEPLOYMENT_STATES.PARTIALLY_DEPLOYED;
      }

      if (newState !== state) {
        transition(newState);
      }

      return {
        success: true,
        state: newState,
        contract,
        address,
        deployedCount,
        totalContracts,
        progress: `${deployedCount}/${totalContracts}`,
        ...getSafetyMetadata(),
      };
    },

    /**
     * Get deployment progress.
     *
     * @returns {object} - current state, progress, addresses, safety metadata
     */
    getProgress() {
      const deployedCount = Object.values(manifest.addresses).filter(
        (a) => typeof a === 'string' && isAddress(a)
      ).length;
      const totalContracts = Object.keys(manifest.addresses).length;

      const pendingSteps = manifest.steps.filter((s) => s.status !== 'deployed');
      const nextDeployable = DEPLOYABLE_CONTRACTS.find((c) => {
        if (manifest.addresses[c]) return false;
        const deps = getDependencies(c);
        return deps.every((dep) => manifest.addresses[dep]);
      });

      return {
        state,
        deployedCount,
        totalContracts,
        progress: `${deployedCount}/${totalContracts}`,
        addresses: clone(manifest.addresses),
        nextDeployable: nextDeployable ?? null,
        pendingSteps: pendingSteps.map((s) => ({
          contract: s.contract,
          dependencies: s.dependencies,
          status: s.status,
        })),
        approval: approvalMetadata ? clone(approvalMetadata) : null,
        deploymentLog: clone(deploymentLog),
        failedReason: failedReason ?? null,
        network: TESTNET_CONFIG.networkName,
        zone: TESTNET_CONFIG.zone,
        chainId: TESTNET_CONFIG.chainId,
        ...getSafetyMetadata(),
      };
    },

    /**
     * Reset the orchestrator to draft state.
     *
     * @returns {object} - result with safety metadata
     */
    reset() {
      const previousState = state;
      transition(DEPLOYMENT_STATES.DRAFT);
      return {
        success: true,
        previousState,
        state: DEPLOYMENT_STATES.DRAFT,
        ...getSafetyMetadata(),
      };
    },

    /**
     * Format a human-readable deployment status report.
     *
     * @returns {string} - formatted report
     */
    formatStatusReport() {
      const lines = [];
      lines.push(`Deployment Orchestrator Status`);
      lines.push(`  State: ${state}`);
      lines.push(`  Network: ${TESTNET_CONFIG.networkName} / ${TESTNET_CONFIG.zone} (chainId ${TESTNET_CONFIG.chainId})`);
      lines.push(`  Deployer: ${TESTNET_CONFIG.deployer}`);
      lines.push('');

      const deployedCount = Object.values(manifest.addresses).filter(
        (a) => typeof a === 'string' && isAddress(a)
      ).length;
      lines.push(`  Progress: ${deployedCount}/${Object.keys(manifest.addresses).length} contracts deployed`);
      lines.push('');

      lines.push('  Contract Addresses:');
      for (const [name, addr] of Object.entries(manifest.addresses)) {
        lines.push(`    ${name}: ${addr ?? '⏳ pending'}`);
      }
      lines.push('');

      const nextDeployable = DEPLOYABLE_CONTRACTS.find((c) => {
        if (manifest.addresses[c]) return false;
        const deps = getDependencies(c);
        return deps.every((dep) => manifest.addresses[dep]);
      });
      if (nextDeployable && state === DEPLOYMENT_STATES.DEPLOYING) {
        lines.push(`  Next deployable: ${nextDeployable}`);
      }

      if (failedReason) {
        lines.push('');
        lines.push(`  Failed: ${failedReason}`);
      }

      lines.push('');
      lines.push(SAFETY_NOTICE);

      return lines.join('\n');
    },

    /**
     * Get current state.
     */
    getState() {
      return state;
    },

    /**
     * Get approval metadata.
     */
    getApproval() {
      return approvalMetadata ? clone(approvalMetadata) : null;
    },

    /**
     * Get deployment log.
     */
    getLog() {
      return clone(deploymentLog);
    },
  };
}

// ── Exported constants for testing ──────────────────────────────────

export {
  DEPLOYABLE_CONTRACTS,
  POST_DEPLOY_STEPS,
  ALL_STEP_CONTRACTS,
  DEPLOYMENT_STATES,
  STATE_TRANSITIONS,
  CUSTODY,
  SAFETY_NOTICE,
};
