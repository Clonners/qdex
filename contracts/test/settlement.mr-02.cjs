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

async function deployToken(name, symbol) {
  const Token = await ethers.getContractFactory('LocalMockERC20');
  const token = await Token.deploy(name, symbol, 18);
  await token.waitForDeployment();
  return token;
}

async function depositIntoVault({ token, vault, vaultAddress, user, amount }) {
  const tokenAddress = await token.getAddress();
  await token.mint(user.address, amount);
  await token.connect(user).approve(vaultAddress, amount);
  await vault.connect(user).deposit(tokenAddress, amount);
  return tokenAddress;
}

async function deploySettlementMarketHarness() {
  const [marketAuthority, maker, taker, relayer] = await ethers.getSigners();
  const makerBaseDeposit = 1000n;
  const takerQuoteDeposit = 2000n;
  const baseAmount = 100n;
  const price = 2n;
  const quoteAmount = baseAmount * price;

  const Settlement = await ethers.getContractFactory('Settlement');
  const settlement = await Settlement.connect(marketAuthority).deploy();
  await settlement.waitForDeployment();

  const settlementAddress = await settlement.getAddress();
  const marketRegistryAddress = await settlement.marketRegistry();
  const marketRegistry = await ethers.getContractAt('MarketRegistry', marketRegistryAddress);
  const vaultAddress = await settlement.vault();
  const vault = await ethers.getContractAt('TradingVault', vaultAddress);
  const baseToken = await deployToken('Local Mock Base', 'LMB');
  const quoteToken = await deployToken('Local Mock Quote', 'LMQ');
  const alternateQuoteToken = await deployToken('Local Mock Alt Quote', 'LMAQ');
  const baseTokenAddress = await depositIntoVault({
    token: baseToken,
    vault,
    vaultAddress,
    user: maker,
    amount: makerBaseDeposit,
  });
  const quoteTokenAddress = await depositIntoVault({
    token: quoteToken,
    vault,
    vaultAddress,
    user: taker,
    amount: takerQuoteDeposit,
  });
  const alternateQuoteTokenAddress = await alternateQuoteToken.getAddress();
  const marketId = marketIdFor(baseTokenAddress, quoteTokenAddress);
  const block = await ethers.provider.getBlock('latest');
  const network = await ethers.provider.getNetwork();

  function makeFill({ label, makerNonce, takerNonce, overrides = {} }) {
    const nextBaseAmount = overrides.baseAmount ?? baseAmount;
    const nextQuoteAmount = overrides.quoteAmount ?? nextBaseAmount * price;

    return {
      fillId: digest(`${label}-fill`),
      marketId,
      makerOrderHash: digest(`${label}-maker-order`),
      takerOrderHash: digest(`${label}-taker-order`),
      maker: maker.address,
      taker: taker.address,
      baseToken: baseTokenAddress,
      quoteToken: quoteTokenAddress,
      price,
      baseAmount: nextBaseAmount,
      quoteAmount: nextQuoteAmount,
      makerFee: 0n,
      takerFee: 0n,
      makerNonce,
      takerNonce,
      expiresAt: BigInt(block.timestamp + 3600),
      chainId: network.chainId,
      settlementContract: settlementAddress,
      feeRecipient: ethers.ZeroAddress,
      maxFeeBps: 0n,
      makerOrderAmount: nextBaseAmount,
      takerOrderAmount: nextBaseAmount,
      makerFilledAmount: nextBaseAmount,
      takerFilledAmount: nextBaseAmount,
      ...overrides,
    };
  }

  async function signFill(fill) {
    const fillHash = await settlement.hashFill(fill);
    return {
      makerSignature: await maker.signMessage(ethers.getBytes(fillHash)),
      takerSignature: await taker.signMessage(ethers.getBytes(fillHash)),
    };
  }

  async function addEnabledMarket({ minAmount = 1n } = {}) {
    const tx = await marketRegistry
      .connect(marketAuthority)
      .addMarket(baseTokenAddress, quoteTokenAddress, 1, 1, minAmount);
    const receipt = await tx.wait();
    return { receipt, marketId };
  }

  return {
    marketAuthority,
    maker,
    taker,
    relayer,
    settlement,
    marketRegistry,
    vault,
    baseTokenAddress,
    quoteTokenAddress,
    alternateQuoteTokenAddress,
    makerBaseDeposit,
    takerQuoteDeposit,
    marketId,
    makeFill,
    signFill,
    addEnabledMarket,
  };
}

async function expectRejectedBeforeStateChange(harness, fill, signatures, expectedError) {
  const {
    maker,
    taker,
    relayer,
    settlement,
    vault,
    baseTokenAddress,
    quoteTokenAddress,
    makerBaseDeposit,
    takerQuoteDeposit,
  } = harness;
  const tradeEventsBefore = await settlement.queryFilter(settlement.filters.TradeSettled());

  await assert.rejects(
    settlement.connect(relayer).settle(fill, signatures.makerSignature, signatures.takerSignature),
    expectedError,
    'invalid MR-02 market dependency state must reject before nonce consumption, vault movement, or proof emission',
  );

  const tradeEventsAfter = await settlement.queryFilter(settlement.filters.TradeSettled());
  assert.equal(tradeEventsAfter.length, tradeEventsBefore.length, 'rejected registry-state fills must not emit TradeSettled');
  assert.equal(await settlement.isNonceUsed(maker.address, fill.makerNonce), false, 'maker nonce must remain available after market rejection');
  assert.equal(await settlement.isNonceUsed(taker.address, fill.takerNonce), false, 'taker nonce must remain available after market rejection');
  assert.equal(await settlement.filledAmountOf(fill.makerOrderHash), 0n, 'maker fill accounting must remain unchanged on market rejection');
  assert.equal(await settlement.filledAmountOf(fill.takerOrderHash), 0n, 'taker fill accounting must remain unchanged on market rejection');
  assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit, 'maker base must not move on market rejection');
  assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit, 'taker quote must not move on market rejection');
  assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), 0n, 'taker base must not be credited on market rejection');
  assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), 0n, 'maker quote must not be credited on market rejection');
}

describe('Settlement MR-02 MarketRegistry dependency wiring', function () {
  it('requires MarketRegistry-enabled metadata before settling a fill', async function () {
    const harness = await deploySettlementMarketHarness();
    const { marketAuthority, settlement, marketRegistry, relayer, vault, maker, taker, baseTokenAddress, quoteTokenAddress, marketId, makeFill, signFill, addEnabledMarket } = harness;

    assert.equal(await marketRegistry.marketAuthority(), marketAuthority.address, 'Settlement should deploy a market-authority scoped MarketRegistry');
    const unknownInfo = await marketRegistry.marketInfo(marketId);
    assert.equal(unknownInfo.enabled, false, 'markets should stay disabled until MarketRegistry explicitly enables them');

    const fill = makeFill({ label: 'mr02-enabled-market', makerNonce: 1101n, takerNonce: 1102n });
    const signatures = await signFill(fill);
    await expectRejectedBeforeStateChange(harness, fill, signatures, /ST_MARKET_DISABLED/);

    const { receipt } = await addEnabledMarket();
    const addedEvents = parseEvents(receipt, marketRegistry, 'MarketAdded');
    assert.equal(addedEvents.length, 1, 'enabling the market should emit indexer-replayable metadata');
    assert.equal(addedEvents[0].args.marketId, marketId);
    assert.equal(addedEvents[0].args.base, baseTokenAddress);
    assert.equal(addedEvents[0].args.quote, quoteTokenAddress);

    const enabledInfo = await marketRegistry.marketInfo(marketId);
    assert.equal(enabledInfo.enabled, true, 'MarketRegistry enabled state should become settlement truth');

    const receiptAfterSettle = await (await settlement.connect(relayer).settle(fill, signatures.makerSignature, signatures.takerSignature)).wait();
    const tradeEvents = parseEvents(receiptAfterSettle, settlement, 'TradeSettled');
    assert.equal(tradeEvents.length, 1, 'registry-enabled fills should emit exactly one public proof trigger');
    assert.equal(tradeEvents[0].args.marketId, marketId, 'TradeSettled should carry the registry market id');
    assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), 900n);
    assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), 100n);
    assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), 1800n);
    assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), 200n);
  });

  it('rejects disabled or token-mismatched registry metadata before state changes', async function () {
    const harness = await deploySettlementMarketHarness();
    const { marketAuthority, marketRegistry, marketId, alternateQuoteTokenAddress, makeFill, signFill, addEnabledMarket } = harness;

    await addEnabledMarket();
    await marketRegistry.connect(marketAuthority).disableMarket(marketId);
    const disabledFill = makeFill({ label: 'mr02-disabled-registry-market', makerNonce: 1111n, takerNonce: 1112n });
    const disabledSignatures = await signFill(disabledFill);
    await expectRejectedBeforeStateChange(harness, disabledFill, disabledSignatures, /ST_MARKET_DISABLED/);

    const mismatchedMarketId = marketIdFor(harness.baseTokenAddress, alternateQuoteTokenAddress);
    await marketRegistry.connect(marketAuthority).addMarket(harness.baseTokenAddress, alternateQuoteTokenAddress, 1, 1, 1n);
    const mismatchedFill = makeFill({
      label: 'mr02-token-mismatch',
      makerNonce: 1121n,
      takerNonce: 1122n,
      overrides: { marketId: mismatchedMarketId },
    });
    const mismatchedSignatures = await signFill(mismatchedFill);
    await expectRejectedBeforeStateChange(harness, mismatchedFill, mismatchedSignatures, /ST_MARKET_TOKEN_MISMATCH/);
  });

  it('keeps market wiring dependency-scoped with no hardcoded local market or custody surface', async function () {
    const { settlement } = await deploySettlementMarketHarness();
    const source = await readRepoFile('contracts/src/Settlement.sol');
    const abiFunctionNames = settlement.interface.fragments
      .filter((fragment) => fragment.type === 'function')
      .map((fragment) => fragment.name);

    assert.ok(abiFunctionNames.includes('marketRegistry'), 'Settlement must expose its local MarketRegistry dependency');
    assert.match(source, /IMarketRegistry public immutable marketRegistry;/, 'market registry dependency should be explicit and immutable');
    assert.match(source, /new MarketRegistry\(msg\.sender\)/, 'local Settlement must deploy a market-authority scoped MarketRegistry');
    assert.doesNotMatch(source, /LOCAL-BASE-QUOTE/u, 'Settlement must not keep a hardcoded local market id after MR-02');
    assert.doesNotMatch(source, /function\s+_localMarketId\b/u, 'Settlement must validate markets through MarketRegistry, not a private constant helper');

    for (const forbiddenPattern of [
      /function\s+(withdraw|withdrawFor|adminWithdraw|operatorWithdraw|emergencyWithdraw|rescue|sweep)\b/iu,
      /delegatecall/iu,
      /call\s*\{/iu,
    ]) {
      assert.doesNotMatch(source, forbiddenPattern, `Settlement market integration must not include ${forbiddenPattern}`);
    }
  });
});
