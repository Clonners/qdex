const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { ethers } = require('hardhat');

const repoRoot = new URL('../../', pathToFileURL(__filename));

function digest(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

function parseEvents(receipt, contract, eventName) {
  return receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter((event) => event?.name === eventName);
}

async function readRepoFile(path) {
  return readFile(new URL(path, repoRoot), 'utf8');
}

async function deployFeeManager() {
  const [feeAuthority, feeRecipient, maker, taker, nonAuthority, nextFeeRecipient] = await ethers.getSigners();
  const FeeManager = await ethers.getContractFactory('FeeManager');
  const feeManager = await FeeManager.deploy(feeAuthority.address, feeRecipient.address);
  await feeManager.waitForDeployment();

  return {
    feeAuthority,
    feeRecipient,
    maker,
    taker,
    nonAuthority,
    nextFeeRecipient,
    feeManager,
  };
}

describe('FeeManager FM-01 hard cap and update-event boundary', function () {
  it('starts with zero market fees, a hard local cap, and a configured fee recipient', async function () {
    const { feeAuthority, feeRecipient, maker, taker, feeManager } = await deployFeeManager();
    const marketId = digest('fm01-qdx-local-market');

    assert.equal(await feeManager.feeAuthority(), feeAuthority.address, 'local fee policy updates should be gated by configured authority');
    assert.equal(await feeManager.feeRecipient(), feeRecipient.address, 'initial recipient must be explicit and nonzero');
    assert.equal(await feeManager.maxFeeBps(), 1000n, 'FM-01 hard cap should match the local settlement fee cap');
    assert.equal(await feeManager.makerFeeBps(marketId), 0n, 'unknown market maker fee starts at zero');
    assert.equal(await feeManager.takerFeeBps(marketId), 0n, 'unknown market taker fee starts at zero');
    assert.notEqual(maker.address, taker.address, 'test sanity: local accounts should be distinct');
  });

  it('lets only fee authority update maker/taker fees and emits deterministic cap events', async function () {
    const { feeAuthority, nonAuthority, feeManager } = await deployFeeManager();
    const marketId = digest('fm01-fee-update-market');

    await assert.rejects(
      feeManager.connect(nonAuthority).updateFees(marketId, 25n, 40n),
      /FM_FEE_AUTHORITY_ONLY/,
      'arbitrary accounts must not change market fee policy',
    );

    const tx = await feeManager.connect(feeAuthority).updateFees(marketId, 25n, 40n);
    const receipt = await tx.wait();
    const events = parseEvents(receipt, feeManager, 'FeesUpdated');

    assert.equal(events.length, 1, 'fee updates should emit exactly one deterministic FeesUpdated event');
    assert.equal(events[0].args.marketId, marketId);
    assert.equal(events[0].args.makerFeeBps, 25n);
    assert.equal(events[0].args.takerFeeBps, 40n);
    assert.equal(events[0].args.maxFeeBps, 1000n);
    assert.equal(await feeManager.makerFeeBps(marketId), 25n);
    assert.equal(await feeManager.takerFeeBps(marketId), 40n);
  });

  it('rejects invalid identifiers and fees above the hard cap before mutating schedules', async function () {
    const { feeAuthority, feeRecipient, feeManager } = await deployFeeManager();
    const FeeManager = await ethers.getContractFactory('FeeManager');
    const marketId = digest('fm01-invalid-update-market');

    await assert.rejects(
      FeeManager.deploy(ethers.ZeroAddress, feeRecipient.address),
      /FM_FEE_AUTHORITY_ZERO/,
      'fee authority must be explicit in local policy tests',
    );
    await assert.rejects(
      FeeManager.deploy(feeAuthority.address, ethers.ZeroAddress),
      /FM_FEE_RECIPIENT_ZERO/,
      'fee recipient must be explicit in local policy tests',
    );
    await assert.rejects(
      feeManager.connect(feeAuthority).updateFees(ethers.ZeroHash, 1n, 1n),
      /FM_MARKET_ID_ZERO/,
      'fee schedules must bind to a nonzero market id',
    );
    await assert.rejects(
      feeManager.connect(feeAuthority).updateFees(marketId, 1001n, 1n),
      /FM_MAKER_FEE_BPS_TOO_HIGH/,
      'maker fee cannot exceed the hard local cap',
    );
    await assert.rejects(
      feeManager.connect(feeAuthority).updateFees(marketId, 1n, 1001n),
      /FM_TAKER_FEE_BPS_TOO_HIGH/,
      'taker fee cannot exceed the hard local cap',
    );

    assert.equal(await feeManager.makerFeeBps(marketId), 0n, 'rejected updates must not mutate maker fee state');
    assert.equal(await feeManager.takerFeeBps(marketId), 0n, 'rejected updates must not mutate taker fee state');
  });

  it('lets only fee authority update the fee recipient and emits an event without fund movement', async function () {
    const { feeAuthority, nonAuthority, nextFeeRecipient, feeManager } = await deployFeeManager();

    await assert.rejects(
      feeManager.connect(nonAuthority).updateFeeRecipient(nextFeeRecipient.address),
      /FM_FEE_AUTHORITY_ONLY/,
      'arbitrary accounts must not change fee recipient policy',
    );
    await assert.rejects(
      feeManager.connect(feeAuthority).updateFeeRecipient(ethers.ZeroAddress),
      /FM_FEE_RECIPIENT_ZERO/,
      'fee recipient cannot be changed to zero address',
    );

    const tx = await feeManager.connect(feeAuthority).updateFeeRecipient(nextFeeRecipient.address);
    const receipt = await tx.wait();
    const events = parseEvents(receipt, feeManager, 'FeeRecipientUpdated');

    assert.equal(events.length, 1, 'recipient updates should emit exactly one FeeRecipientUpdated event');
    assert.equal(events[0].args.feeRecipient, nextFeeRecipient.address);
    assert.equal(await feeManager.feeRecipient(), nextFeeRecipient.address, 'recipient getter should reflect evented update');
  });

  it('keeps the source and ABI policy-scoped: no custody, owner, role, or external-call surface', async function () {
    const { feeManager } = await deployFeeManager();
    const source = await readRepoFile('contracts/src/FeeManager.sol');
    const abiFunctionNames = feeManager.interface.fragments
      .filter((fragment) => fragment.type === 'function')
      .map((fragment) => fragment.name)
      .sort();

    assert.deepEqual(abiFunctionNames, [
      'feeAuthority',
      'feeRecipient',
      'makerFeeBps',
      'maxFeeBps',
      'takerFeeBps',
      'updateFeeRecipient',
      'updateFees',
    ]);

    for (const forbiddenPattern of [
      /withdraw/iu,
      /transfer/iu,
      /rescue/iu,
      /sweep/iu,
      /owner\s*\(/iu,
      /onlyOwner/iu,
      /Ownable/iu,
      /AccessControl/iu,
      /admin/iu,
      /operator/iu,
      /delegatecall/iu,
      /call\s*\{/iu,
    ]) {
      assert.doesNotMatch(source, forbiddenPattern, `FeeManager source must not include ${forbiddenPattern}`);
    }
  });
});
