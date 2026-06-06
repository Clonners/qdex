const assert = require('node:assert/strict');
const { ethers } = require('hardhat');

function digest(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
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

async function deploySettlementHarness() {
  const [maker, taker, relayer] = await ethers.getSigners();
  const makerBaseDeposit = 1000n;
  const takerQuoteDeposit = 2000n;
  const Settlement = await ethers.getContractFactory('Settlement');
  const settlement = await Settlement.deploy();
  await settlement.waitForDeployment();

  const settlementAddress = await settlement.getAddress();
  const vaultAddress = await settlement.vault();
  const vault = await ethers.getContractAt('TradingVault', vaultAddress);
  const baseToken = await deployToken('Local Mock Base', 'LMB');
  const quoteToken = await deployToken('Local Mock Quote', 'LMQ');
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
  const block = await ethers.provider.getBlock('latest');
  const network = await ethers.provider.getNetwork();

  function makeFill({ label, makerNonce, takerNonce, overrides = {} }) {
    const baseAmount = overrides.baseAmount ?? 100n;
    const quoteAmount = overrides.quoteAmount ?? 200n;

    return {
      fillId: digest(`${label}-fill`),
      marketId: digest('LOCAL-BASE-QUOTE'),
      makerOrderHash: digest(`${label}-maker-order`),
      takerOrderHash: digest(`${label}-taker-order`),
      maker: maker.address,
      taker: taker.address,
      baseToken: baseTokenAddress,
      quoteToken: quoteTokenAddress,
      price: 2n,
      baseAmount,
      quoteAmount,
      makerFee: 0n,
      takerFee: 0n,
      makerNonce,
      takerNonce,
      expiresAt: BigInt(block.timestamp + 3600),
      chainId: network.chainId,
      settlementContract: settlementAddress,
      feeRecipient: ethers.ZeroAddress,
      maxFeeBps: 0n,
      makerOrderAmount: baseAmount,
      takerOrderAmount: baseAmount,
      makerFilledAmount: baseAmount,
      takerFilledAmount: baseAmount,
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

  return {
    maker,
    taker,
    relayer,
    settlement,
    vault,
    baseTokenAddress,
    quoteTokenAddress,
    makerBaseDeposit,
    takerQuoteDeposit,
    makeFill,
    signFill,
  };
}

async function expectRejectedBeforeStateChange(harness, fill, expectedError) {
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
    signFill,
  } = harness;
  const signatures = await signFill(fill);
  const tradeEventsBefore = await settlement.queryFilter(settlement.filters.TradeSettled());

  await assert.rejects(
    settlement.connect(relayer).settle(fill, signatures.makerSignature, signatures.takerSignature),
    expectedError,
    'invalid ST-04 fill constraints must reject before nonce consumption or vault movement',
  );

  const tradeEventsAfter = await settlement.queryFilter(settlement.filters.TradeSettled());
  assert.equal(tradeEventsAfter.length, tradeEventsBefore.length, 'rejected fills must not emit TradeSettled proof events');
  assert.equal(await settlement.isNonceUsed(maker.address, fill.makerNonce), false, 'maker nonce must remain available after rejected fill');
  assert.equal(await settlement.isNonceUsed(taker.address, fill.takerNonce), false, 'taker nonce must remain available after rejected fill');
  assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit, 'maker base must not move on rejected fill');
  assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit, 'taker quote must not move on rejected fill');
  assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), 0n, 'taker base must not be credited on rejected fill');
  assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), 0n, 'maker quote must not be credited on rejected fill');
  assert.equal(await vault.lockedBalanceOf(maker.address, baseTokenAddress), 0n, 'maker base must not remain locked on rejected fill');
  assert.equal(await vault.lockedBalanceOf(taker.address, quoteTokenAddress), 0n, 'taker quote must not remain locked on rejected fill');
}

describe('Settlement ST-04 market and fill-constraint rejection', function () {
  it('rejects unknown or disabled markets before nonce consumption or vault movement', async function () {
    const harness = await deploySettlementHarness();
    const fill = harness.makeFill({
      label: 'st04-disabled-market',
      makerNonce: 601n,
      takerNonce: 602n,
      overrides: { marketId: digest('DISABLED-LOCAL-MARKET') },
    });

    await expectRejectedBeforeStateChange(harness, fill, /ST_MARKET_DISABLED/);
  });

  it('rejects price and amount arithmetic that does not match the signed quote amount', async function () {
    const harness = await deploySettlementHarness();
    const fill = harness.makeFill({
      label: 'st04-quote-mismatch',
      makerNonce: 611n,
      takerNonce: 612n,
      overrides: { quoteAmount: 201n },
    });

    await expectRejectedBeforeStateChange(harness, fill, /ST_PRICE_AMOUNT_MISMATCH/);
  });

  it('rejects zero price or zero amounts before nonce consumption or vault movement', async function () {
    const cases = [
      { label: 'st04-price-zero', makerNonce: 621n, takerNonce: 622n, overrides: { price: 0n }, error: /ST_PRICE_ZERO/ },
      { label: 'st04-base-zero', makerNonce: 623n, takerNonce: 624n, overrides: { baseAmount: 0n, makerFilledAmount: 0n, takerFilledAmount: 0n }, error: /ST_BASE_AMOUNT_ZERO/ },
      { label: 'st04-quote-zero', makerNonce: 625n, takerNonce: 626n, overrides: { quoteAmount: 0n }, error: /ST_QUOTE_AMOUNT_ZERO/ },
    ];

    for (const testCase of cases) {
      const harness = await deploySettlementHarness();
      const fill = harness.makeFill(testCase);
      await expectRejectedBeforeStateChange(harness, fill, testCase.error);
    }
  });

  it('rejects unsupported fees and fill-accounting mismatches before nonce consumption or vault movement', async function () {
    const cases = [
      { label: 'st04-maker-fee', makerNonce: 631n, takerNonce: 632n, overrides: { makerFee: 1n }, error: /ST_FEES_NOT_READY/ },
      { label: 'st04-taker-fee', makerNonce: 633n, takerNonce: 634n, overrides: { takerFee: 1n }, error: /ST_FEES_NOT_READY/ },
      { label: 'st04-maker-filled-mismatch', makerNonce: 635n, takerNonce: 636n, overrides: { makerFilledAmount: 99n }, error: /ST_MAKER_FILL_AMOUNT_MISMATCH/ },
      { label: 'st04-taker-filled-mismatch', makerNonce: 637n, takerNonce: 638n, overrides: { takerFilledAmount: 99n }, error: /ST_TAKER_FILL_AMOUNT_MISMATCH/ },
    ];

    for (const testCase of cases) {
      const harness = await deploySettlementHarness();
      const fill = harness.makeFill(testCase);
      await expectRejectedBeforeStateChange(harness, fill, testCase.error);
    }
  });
});
