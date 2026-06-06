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

async function deployNonceManager() {
  const [settlement, maker, taker, operatorLike] = await ethers.getSigners();
  const NonceManager = await ethers.getContractFactory('NonceManager');
  const nonceManager = await NonceManager.deploy(settlement.address);
  await nonceManager.waitForDeployment();

  return { settlement, maker, taker, operatorLike, nonceManager };
}

describe('NonceManager NM-01 user-owned cancellation and settlement-only mark-used boundary', function () {
  it('lets users cancel their own single nonce without affecting another user\'s same nonce', async function () {
    const { maker, taker, nonceManager } = await deployNonceManager();

    assert.equal(await nonceManager.isNonceUsed(maker.address, 7n), false);
    assert.equal(await nonceManager.isNonceUsed(taker.address, 7n), false);

    const tx = await nonceManager.connect(maker).cancelNonce(7n);
    const receipt = await tx.wait();
    const events = parseEvents(receipt, nonceManager, 'NonceCancelled');

    assert.equal(events.length, 1, 'single cancellation should emit exactly one NonceCancelled event');
    assert.equal(events[0].args.user, maker.address);
    assert.equal(events[0].args.nonce, 7n);
    assert.equal(await nonceManager.isNonceUsed(maker.address, 7n), true, 'maker nonce should become unavailable');
    assert.equal(await nonceManager.isNonceUsed(taker.address, 7n), false, 'taker same-number nonce must stay available');

    await assert.rejects(
      nonceManager.connect(maker).cancelNonce(7n),
      /NM_NONCE_UNAVAILABLE/,
      're-cancelling an unavailable nonce should be rejected precisely',
    );
  });

  it('lets users cancel bounded nonce ranges and rejects invalid or too-large ranges', async function () {
    const { maker, nonceManager } = await deployNonceManager();

    const tx = await nonceManager.connect(maker).cancelNonceRange(10n, 12n);
    const receipt = await tx.wait();
    const events = parseEvents(receipt, nonceManager, 'NonceRangeCancelled');

    assert.equal(events.length, 1, 'range cancellation should emit exactly one NonceRangeCancelled event');
    assert.equal(events[0].args.user, maker.address);
    assert.equal(events[0].args.from, 10n);
    assert.equal(events[0].args.to, 12n);
    assert.equal(await nonceManager.isNonceUsed(maker.address, 10n), true);
    assert.equal(await nonceManager.isNonceUsed(maker.address, 11n), true);
    assert.equal(await nonceManager.isNonceUsed(maker.address, 12n), true);
    assert.equal(await nonceManager.isNonceUsed(maker.address, 13n), false, 'range cancellation must not over-cancel');

    await assert.rejects(
      nonceManager.connect(maker).cancelNonceRange(12n, 10n),
      /NM_NONCE_RANGE_INVALID/,
      'from > to should be rejected precisely',
    );
    await assert.rejects(
      nonceManager.connect(maker).cancelNonceRange(1000n, 1256n),
      /NM_NONCE_RANGE_TOO_LARGE/,
      'more than 256 nonces should be rejected precisely',
    );
  });

  it('allows only the settlement authority to mark a validated order nonce used', async function () {
    const { settlement, maker, taker, operatorLike, nonceManager } = await deployNonceManager();
    const makerOrderHash = digest('nm01-maker-order');
    const takerOrderHash = digest('nm01-taker-order');

    await assert.rejects(
      nonceManager.connect(maker).markNonceUsed(maker.address, 21n, makerOrderHash),
      /NM_SETTLEMENT_ONLY/,
      'users cannot mark nonces used outside settlement validation',
    );
    await assert.rejects(
      nonceManager.connect(operatorLike).markNonceUsed(maker.address, 21n, makerOrderHash),
      /NM_SETTLEMENT_ONLY/,
      'operator-like accounts cannot mark nonces used',
    );
    await assert.rejects(
      nonceManager.connect(settlement).markNonceUsed(ethers.ZeroAddress, 21n, makerOrderHash),
      /NM_USER_ZERO/,
      'settlement must bind nonce usage to a nonzero user',
    );
    await assert.rejects(
      nonceManager.connect(settlement).markNonceUsed(maker.address, 21n, ethers.ZeroHash),
      /NM_ORDER_HASH_ZERO/,
      'settlement must bind nonce usage to a nonzero order hash',
    );

    const tx = await nonceManager.connect(settlement).markNonceUsed(maker.address, 21n, makerOrderHash);
    const receipt = await tx.wait();
    const events = parseEvents(receipt, nonceManager, 'NonceUsed');

    assert.equal(events.length, 1, 'settlement mark-used should emit exactly one NonceUsed event');
    assert.equal(events[0].args.user, maker.address);
    assert.equal(events[0].args.nonce, 21n);
    assert.equal(events[0].args.orderHash, makerOrderHash);
    assert.equal(await nonceManager.isNonceUsed(maker.address, 21n), true);
    assert.equal(await nonceManager.isNonceUsed(taker.address, 21n), false, 'another user\'s same nonce remains independent');

    await assert.rejects(
      nonceManager.connect(settlement).markNonceUsed(maker.address, 21n, digest('nm01-replay-order')),
      /NM_NONCE_UNAVAILABLE/,
      'used nonces cannot be marked again with another order hash',
    );

    await nonceManager.connect(taker).cancelNonce(22n);
    await assert.rejects(
      nonceManager.connect(settlement).markNonceUsed(taker.address, 22n, takerOrderHash),
      /NM_NONCE_UNAVAILABLE/,
      'cancelled nonces cannot be marked used by settlement',
    );
  });

  it('keeps the source and ABI non-custodial: no admin cancellation or withdrawal authority', async function () {
    const { nonceManager } = await deployNonceManager();
    const source = await readRepoFile('contracts/src/NonceManager.sol');
    const abiFunctionNames = nonceManager.interface.fragments
      .filter((fragment) => fragment.type === 'function')
      .map((fragment) => fragment.name)
      .sort();

    assert.deepEqual(abiFunctionNames, [
      'MAX_CANCEL_RANGE_SIZE',
      'cancelNonce',
      'cancelNonceRange',
      'isNonceUsed',
      'markNonceUsed',
      'settlementAuthority',
    ]);

    for (const forbiddenPattern of [
      /cancelNonceFor/u,
      /cancelAllFor/u,
      /markNonceUsedFor/u,
      /withdraw/iu,
      /transfer/iu,
      /owner\s*\(/iu,
      /onlyOwner/iu,
      /Ownable/iu,
      /AccessControl/iu,
      /admin/iu,
      /operator/iu,
    ]) {
      assert.doesNotMatch(source, forbiddenPattern, `NonceManager source must not include ${forbiddenPattern}`);
    }
  });
});
