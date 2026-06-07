const assert = require('node:assert/strict');
const { ethers } = require('hardhat');

function marketIdFor(base, quote) {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'address'], [base, quote]));
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

async function deployMarketRegistry() {
  const [clonnersAuthority, daoAuthority, nonAuthority, baseToken, quoteToken] = await ethers.getSigners();
  const MarketRegistry = await ethers.getContractFactory('MarketRegistry');
  const registry = await MarketRegistry.deploy(clonnersAuthority.address);
  await registry.waitForDeployment();

  return {
    clonnersAuthority,
    daoAuthority,
    nonAuthority,
    base: baseToken.address,
    quote: quoteToken.address,
    registry,
  };
}

describe('MarketRegistry MR-03 Clonners operator to DAO authority handoff', function () {
  it('starts with Clonners-managed listing authority and lets the proposed DAO accept future authority', async function () {
    const { clonnersAuthority, daoAuthority, nonAuthority, base, quote, registry } = await deployMarketRegistry();

    assert.equal(await registry.marketAuthority(), clonnersAuthority.address);
    assert.equal(await registry.pendingMarketAuthority(), ethers.ZeroAddress);

    await assert.rejects(
      registry.connect(nonAuthority).proposeMarketAuthority(daoAuthority.address),
      /MR_MARKET_AUTHORITY_ONLY/,
      'only current Clonners-managed authority can propose DAO handoff',
    );
    await assert.rejects(
      registry.connect(clonnersAuthority).proposeMarketAuthority(ethers.ZeroAddress),
      /MR_PENDING_AUTHORITY_ZERO/,
      'handoff cannot point to the zero address',
    );
    await assert.rejects(
      registry.connect(clonnersAuthority).proposeMarketAuthority(clonnersAuthority.address),
      /MR_PENDING_AUTHORITY_SAME/,
      'handoff cannot propose the current authority again',
    );

    const proposeTx = await registry.connect(clonnersAuthority).proposeMarketAuthority(daoAuthority.address);
    const proposeReceipt = await proposeTx.wait();
    const proposedEvents = parseEvents(proposeReceipt, registry, 'MarketAuthorityHandoffProposed');

    assert.equal(proposedEvents.length, 1, 'authority proposal must be evented for indexer/governance replay');
    assert.equal(proposedEvents[0].args.currentAuthority, clonnersAuthority.address);
    assert.equal(proposedEvents[0].args.pendingAuthority, daoAuthority.address);
    assert.equal(await registry.pendingMarketAuthority(), daoAuthority.address);

    await assert.rejects(
      registry.connect(nonAuthority).acceptMarketAuthority(),
      /MR_PENDING_AUTHORITY_ONLY/,
      'only the proposed DAO authority can accept the handoff',
    );

    const acceptTx = await registry.connect(daoAuthority).acceptMarketAuthority();
    const acceptReceipt = await acceptTx.wait();
    const acceptedEvents = parseEvents(acceptReceipt, registry, 'MarketAuthorityHandoffAccepted');

    assert.equal(acceptedEvents.length, 1, 'accepted handoff must be evented for public governance proof');
    assert.equal(acceptedEvents[0].args.previousAuthority, clonnersAuthority.address);
    assert.equal(acceptedEvents[0].args.newAuthority, daoAuthority.address);
    assert.equal(await registry.marketAuthority(), daoAuthority.address);
    assert.equal(await registry.pendingMarketAuthority(), ethers.ZeroAddress);

    await assert.rejects(
      registry.connect(clonnersAuthority).addMarket(base, quote, 8, 6, 100n),
      /MR_MARKET_AUTHORITY_ONLY/,
      'old Clonners-managed authority must lose listing power after DAO acceptance',
    );

    const marketId = marketIdFor(base, quote);
    const staticMarketId = await registry.connect(daoAuthority).addMarket.staticCall(base, quote, 8, 6, 100n);
    assert.equal(staticMarketId, marketId, 'DAO authority should keep deterministic MarketRegistry IDs');

    await registry.connect(daoAuthority).addMarket(base, quote, 8, 6, 100n);
    const info = await registry.marketInfo(marketId);
    assert.equal(info.enabled, true, 'DAO authority can list markets after accepted handoff');
  });
});
