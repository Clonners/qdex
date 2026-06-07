const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { ethers } = require('hardhat');

const repoRoot = new URL('../../', pathToFileURL(__filename));

function digest(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

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

async function readRepoFile(path) {
  return readFile(new URL(path, repoRoot), 'utf8');
}

async function deployMarketRegistry() {
  const [marketAuthority, maker, taker, nonAuthority] = await ethers.getSigners();
  const MarketRegistry = await ethers.getContractFactory('MarketRegistry');
  const registry = await MarketRegistry.deploy(marketAuthority.address);
  await registry.waitForDeployment();

  return {
    marketAuthority,
    maker,
    taker,
    nonAuthority,
    registry,
    base: maker.address,
    quote: taker.address,
  };
}

describe('MarketRegistry MR-01 enabled/disabled market metadata boundary', function () {
  it('starts unknown markets disabled and lets only market authority add stable metadata', async function () {
    const { marketAuthority, nonAuthority, registry, base, quote } = await deployMarketRegistry();
    const marketId = marketIdFor(base, quote);
    const unknown = await registry.marketInfo(digest('mr01-unknown-market'));

    assert.equal(unknown.base, ethers.ZeroAddress, 'unknown market base should be empty');
    assert.equal(unknown.quote, ethers.ZeroAddress, 'unknown market quote should be empty');
    assert.equal(unknown.enabled, false, 'unknown markets must start disabled');

    await assert.rejects(
      registry.connect(nonAuthority).addMarket(base, quote, 8, 6, 100n),
      /MR_MARKET_AUTHORITY_ONLY/,
      'only the configured market authority can add market metadata',
    );

    const staticMarketId = await registry.connect(marketAuthority).addMarket.staticCall(base, quote, 8, 6, 100n);
    assert.equal(staticMarketId, marketId, 'market id should be deterministic from base/quote token addresses');

    const tx = await registry.connect(marketAuthority).addMarket(base, quote, 8, 6, 100n);
    const receipt = await tx.wait();
    const events = parseEvents(receipt, registry, 'MarketAdded');
    const info = await registry.marketInfo(marketId);

    assert.equal(events.length, 1, 'adding a market should emit exactly one MarketAdded event');
    assert.equal(events[0].args.marketId, marketId);
    assert.equal(events[0].args.base, base);
    assert.equal(events[0].args.quote, quote);
    assert.equal(events[0].args.pricePrecision, 8n);
    assert.equal(events[0].args.amountPrecision, 6n);
    assert.equal(events[0].args.minAmount, 100n);
    assert.equal(info.base, base);
    assert.equal(info.quote, quote);
    assert.equal(info.pricePrecision, 8n);
    assert.equal(info.amountPrecision, 6n);
    assert.equal(info.minAmount, 100n);
    assert.equal(info.enabled, true, 'newly added local market should be enabled');

    await assert.rejects(
      registry.connect(marketAuthority).addMarket(base, quote, 8, 6, 100n),
      /MR_MARKET_EXISTS/,
      'duplicate market metadata must not overwrite the stable market record',
    );
  });

  it('rejects invalid market metadata before adding anything', async function () {
    const { marketAuthority, registry, base, quote } = await deployMarketRegistry();
    const cases = [
      { label: 'base-zero', args: [ethers.ZeroAddress, quote, 8, 6, 100n], error: /MR_BASE_ZERO/ },
      { label: 'quote-zero', args: [base, ethers.ZeroAddress, 8, 6, 100n], error: /MR_QUOTE_ZERO/ },
      { label: 'same-token', args: [base, base, 8, 6, 100n], error: /MR_TOKEN_PAIR_INVALID/ },
      { label: 'price-precision-zero', args: [base, quote, 0, 6, 100n], error: /MR_PRICE_PRECISION_ZERO/ },
      { label: 'amount-precision-zero', args: [base, quote, 8, 0, 100n], error: /MR_AMOUNT_PRECISION_ZERO/ },
      { label: 'min-amount-zero', args: [base, quote, 8, 6, 0n], error: /MR_MIN_AMOUNT_ZERO/ },
    ];

    for (const testCase of cases) {
      await assert.rejects(
        registry.connect(marketAuthority).addMarket(...testCase.args),
        testCase.error,
        `invalid MR-01 metadata should reject precisely for ${testCase.label}`,
      );
    }

    const info = await registry.marketInfo(marketIdFor(base, quote));
    assert.equal(info.enabled, false, 'invalid metadata attempts must not create an enabled market');
    assert.equal(info.base, ethers.ZeroAddress, 'invalid metadata attempts must not write base token');
  });

  it('lets only market authority disable an enabled market without erasing metadata', async function () {
    const { marketAuthority, nonAuthority, registry, base, quote } = await deployMarketRegistry();
    const marketId = marketIdFor(base, quote);
    await registry.connect(marketAuthority).addMarket(base, quote, 8, 6, 100n);

    await assert.rejects(
      registry.connect(nonAuthority).disableMarket(marketId),
      /MR_MARKET_AUTHORITY_ONLY/,
      'only the configured market authority can disable markets',
    );
    await assert.rejects(
      registry.connect(marketAuthority).disableMarket(digest('mr01-missing-market')),
      /MR_MARKET_UNKNOWN/,
      'unknown markets should not produce fake disabled records',
    );

    const tx = await registry.connect(marketAuthority).disableMarket(marketId);
    const receipt = await tx.wait();
    const events = parseEvents(receipt, registry, 'MarketDisabled');
    const info = await registry.marketInfo(marketId);

    assert.equal(events.length, 1, 'disabling a market should emit exactly one MarketDisabled event');
    assert.equal(events[0].args.marketId, marketId);
    assert.equal(info.base, base, 'disabled markets keep base metadata for indexer replay');
    assert.equal(info.quote, quote, 'disabled markets keep quote metadata for indexer replay');
    assert.equal(info.pricePrecision, 8n, 'disabled markets keep price precision metadata');
    assert.equal(info.amountPrecision, 6n, 'disabled markets keep amount precision metadata');
    assert.equal(info.minAmount, 100n, 'disabled markets keep minimum amount metadata');
    assert.equal(info.enabled, false, 'disabled market should no longer be enabled');

    await assert.rejects(
      registry.connect(marketAuthority).disableMarket(marketId),
      /MR_MARKET_DISABLED/,
      'disabling an already disabled market should reject precisely',
    );
  });

  it('keeps the source and ABI dependency-scoped: no withdrawal, settlement, owner, or role surface', async function () {
    const { registry } = await deployMarketRegistry();
    const source = await readRepoFile('contracts/src/MarketRegistry.sol');
    const abiFunctionNames = registry.interface.fragments
      .filter((fragment) => fragment.type === 'function')
      .map((fragment) => fragment.name)
      .sort();

    assert.deepEqual(abiFunctionNames, [
      'acceptMarketAuthority',
      'addMarket',
      'disableMarket',
      'marketAuthority',
      'marketInfo',
      'pendingMarketAuthority',
      'proposeMarketAuthority',
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
      /delegatecall/iu,
      /call\s*\{/iu,
    ]) {
      assert.doesNotMatch(source, forbiddenPattern, `MarketRegistry source must not include ${forbiddenPattern}`);
    }
  });
});
