const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { ethers } = require('hardhat');

const repoRoot = new URL('../../', pathToFileURL(__filename));

const Permission = Object.freeze({
  READ_ONLY: 0,
  PLACE_ORDER: 1,
  CANCEL_ORDER: 2,
  CANCEL_ALL: 3,
  NO_WITHDRAW: 4,
  NO_ADMIN: 5,
});

function digest(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

function allowedMarketsHashFor(marketId) {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [marketId]));
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

async function latestTimestamp() {
  const block = await ethers.provider.getBlock('latest');
  return BigInt(block.timestamp);
}

async function deployDelegateKeyRegistry() {
  const [owner, delegate, nextDelegate, nonOwner, marketMaker] = await ethers.getSigners();
  const DelegateKeyRegistry = await ethers.getContractFactory('DelegateKeyRegistry');
  const registry = await DelegateKeyRegistry.deploy();
  await registry.waitForDeployment();

  return { owner, delegate, nextDelegate, nonOwner, marketMaker, registry };
}

async function makeDelegateKey(overrides = {}) {
  const now = await latestTimestamp();
  const marketId = overrides.marketId ?? digest('dk01-qdx-local-market');

  return {
    marketId,
    key: {
      owner: overrides.owner,
      delegate: overrides.delegate,
      expiresAt: overrides.expiresAt ?? now + 3_600n,
      allowedMarketsHash: overrides.allowedMarketsHash ?? allowedMarketsHashFor(marketId),
      maxNotional: overrides.maxNotional ?? 5_000n,
      permissions: overrides.permissions ?? [
        Permission.READ_ONLY,
        Permission.PLACE_ORDER,
        Permission.CANCEL_ORDER,
        Permission.NO_WITHDRAW,
        Permission.NO_ADMIN,
      ],
      revoked: overrides.revoked ?? false,
    },
  };
}

describe('DelegateKeyRegistry DK-01 permission, expiry, market, and notional boundary', function () {
  it('lets only the owner register a trade-scoped delegate that is active only within market, notional, expiry, and NO_WITHDRAW/NO_ADMIN permissions', async function () {
    const { owner, delegate, nonOwner, registry } = await deployDelegateKeyRegistry();
    const { key, marketId } = await makeDelegateKey({ owner: owner.address, delegate: delegate.address });
    const otherMarketId = digest('dk01-other-local-market');

    await assert.rejects(
      registry.connect(nonOwner).registerDelegateKey(key),
      /DK_OWNER_ONLY/,
      'operator-like or arbitrary accounts must not register a delegate for another owner',
    );

    const tx = await registry.connect(owner).registerDelegateKey(key);
    const receipt = await tx.wait();
    const events = parseEvents(receipt, registry, 'DelegateKeyRegistered');

    assert.equal(events.length, 1, 'delegate registration should emit exactly one deterministic event');
    assert.equal(events[0].args.owner, owner.address);
    assert.equal(events[0].args.delegate, delegate.address);
    assert.equal(events[0].args.expiresAt, key.expiresAt);
    assert.equal(events[0].args.allowedMarketsHash, key.allowedMarketsHash);
    assert.equal(events[0].args.maxNotional, key.maxNotional);

    assert.equal(await registry.isDelegateKeyActive(owner.address, delegate.address, marketId, 4_999n), true);
    assert.equal(await registry.isDelegateKeyActive(owner.address, delegate.address, marketId, 5_000n), true);
    assert.equal(await registry.isDelegateKeyActive(owner.address, delegate.address, marketId, 5_001n), false, 'notional above signed max must deactivate the key');
    assert.equal(await registry.isDelegateKeyActive(owner.address, delegate.address, otherMarketId, 100n), false, 'unlisted markets must not activate the delegate');
    assert.equal(await registry.hasPermission(owner.address, delegate.address, Permission.READ_ONLY), true);
    assert.equal(await registry.hasPermission(owner.address, delegate.address, Permission.PLACE_ORDER), true);
    assert.equal(await registry.hasPermission(owner.address, delegate.address, Permission.CANCEL_ORDER), true);
    assert.equal(await registry.hasPermission(owner.address, delegate.address, Permission.CANCEL_ALL), false, 'omitted permissions must remain false');
    assert.equal(await registry.hasPermission(owner.address, delegate.address, Permission.NO_WITHDRAW), true, 'delegates must carry explicit no-withdraw safety');
    assert.equal(await registry.hasPermission(owner.address, delegate.address, Permission.NO_ADMIN), true, 'delegates must carry explicit no-admin safety');
  });

  it('rejects invalid delegate registrations before creating active authority', async function () {
    const { owner, delegate, registry } = await deployDelegateKeyRegistry();
    const now = await latestTimestamp();
    const base = await makeDelegateKey({ owner: owner.address, delegate: delegate.address });

    const cases = [
      { label: 'owner-zero', patch: { owner: ethers.ZeroAddress }, error: /DK_OWNER_ZERO/ },
      { label: 'delegate-zero', patch: { delegate: ethers.ZeroAddress }, error: /DK_DELEGATE_ZERO/ },
      { label: 'delegate-self', patch: { delegate: owner.address }, error: /DK_DELEGATE_SELF_INVALID/ },
      { label: 'expires-now', patch: { expiresAt: now }, error: /DK_EXPIRES_AT_NOT_FUTURE/ },
      { label: 'empty-market-set', patch: { allowedMarketsHash: ethers.ZeroHash }, error: /DK_ALLOWED_MARKETS_EMPTY/ },
      { label: 'zero-notional', patch: { maxNotional: 0n }, error: /DK_MAX_NOTIONAL_ZERO/ },
      {
        label: 'missing-no-withdraw',
        patch: { permissions: [Permission.READ_ONLY, Permission.PLACE_ORDER, Permission.NO_ADMIN] },
        error: /DK_NO_WITHDRAW_REQUIRED/,
      },
      {
        label: 'missing-no-admin',
        patch: { permissions: [Permission.READ_ONLY, Permission.PLACE_ORDER, Permission.NO_WITHDRAW] },
        error: /DK_NO_ADMIN_REQUIRED/,
      },
      { label: 'already-revoked', patch: { revoked: true }, error: /DK_REGISTERED_REVOKED/ },
    ];

    for (const testCase of cases) {
      const invalidKey = { ...base.key, ...testCase.patch };
      await assert.rejects(
        registry.connect(owner).registerDelegateKey(invalidKey),
        testCase.error,
        `invalid DK-01 registration should reject precisely for ${testCase.label}`,
      );
    }

    assert.equal(
      await registry.isDelegateKeyActive(owner.address, delegate.address, base.marketId, 1n),
      false,
      'rejected registration attempts must not create active delegate authority',
    );
  });

  it('lets owners revoke delegates and treats exact-expiry delegates as inactive', async function () {
    const { owner, delegate, nextDelegate, nonOwner, registry } = await deployDelegateKeyRegistry();
    const first = await makeDelegateKey({ owner: owner.address, delegate: delegate.address });
    await registry.connect(owner).registerDelegateKey(first.key);

    await assert.rejects(
      registry.connect(nonOwner).revokeDelegateKey(delegate.address),
      /DK_DELEGATE_KEY_INACTIVE/,
      'another account must not revoke a key under the owner namespace',
    );

    const revokeTx = await registry.connect(owner).revokeDelegateKey(delegate.address);
    const revokeReceipt = await revokeTx.wait();
    const revokeEvents = parseEvents(revokeReceipt, registry, 'DelegateKeyRevoked');

    assert.equal(revokeEvents.length, 1, 'revocation should emit exactly one event');
    assert.equal(revokeEvents[0].args.owner, owner.address);
    assert.equal(revokeEvents[0].args.delegate, delegate.address);
    assert.equal(await registry.isDelegateKeyActive(owner.address, delegate.address, first.marketId, 1n), false, 'revoked delegates are inactive');
    assert.equal(await registry.hasPermission(owner.address, delegate.address, Permission.PLACE_ORDER), false, 'revoked delegates expose no active permissions');

    await assert.rejects(
      registry.connect(owner).revokeDelegateKey(delegate.address),
      /DK_DELEGATE_KEY_INACTIVE/,
      'revoking an already inactive key should reject precisely',
    );

    const now = await latestTimestamp();
    const expiryMarketId = digest('dk01-expiry-market');
    const expiring = await makeDelegateKey({
      owner: owner.address,
      delegate: nextDelegate.address,
      marketId: expiryMarketId,
      expiresAt: now + 20n,
      maxNotional: 50n,
    });
    await registry.connect(owner).registerDelegateKey(expiring.key);
    assert.equal(await registry.isDelegateKeyActive(owner.address, nextDelegate.address, expiryMarketId, 50n), true);

    await ethers.provider.send('evm_setNextBlockTimestamp', [Number(expiring.key.expiresAt)]);
    await ethers.provider.send('evm_mine');

    assert.equal(
      await registry.isDelegateKeyActive(owner.address, nextDelegate.address, expiryMarketId, 50n),
      false,
      'expiresAt is exclusive: exact expiry timestamp must deactivate the delegate',
    );
  });

  it('keeps the source and ABI bot-scoped: no positive withdrawal/admin, custody, owner, role, or external-call surface', async function () {
    const { registry } = await deployDelegateKeyRegistry();
    const source = await readRepoFile('contracts/src/DelegateKeyRegistry.sol');
    const abiFunctionNames = registry.interface.fragments
      .filter((fragment) => fragment.type === 'function')
      .map((fragment) => fragment.name)
      .sort();

    assert.deepEqual(abiFunctionNames, [
      'hasPermission',
      'isDelegateKeyActive',
      'registerDelegateKey',
      'revokeDelegateKey',
    ]);

    for (const forbiddenPattern of [
      /^\s*WITHDRAW\s*,?\s*$/mu,
      /^\s*ADMIN\s*,?\s*$/mu,
      /function\s+(withdraw|withdrawFor|adminWithdraw|operatorWithdraw|emergencyWithdraw|rescue|sweep)\b/iu,
      /transfer\s*\(/iu,
      /owner\s*\(/iu,
      /onlyOwner/iu,
      /Ownable/iu,
      /AccessControl/iu,
      /delegatecall/iu,
      /call\s*\{/iu,
    ]) {
      assert.doesNotMatch(source, forbiddenPattern, `DelegateKeyRegistry source must not include ${forbiddenPattern}`);
    }
  });
});
