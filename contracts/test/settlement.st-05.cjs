const assert = require('node:assert/strict');
const { ethers } = require('hardhat');

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

  function makeFill({
    label,
    makerNonce,
    takerNonce,
    makerOrderHash = digest(`${label}-maker-order`),
    takerOrderHash = digest(`${label}-taker-order`),
    baseAmount = 100n,
    price = 2n,
    quoteAmount = baseAmount * price,
    makerOrderAmount = baseAmount,
    takerOrderAmount = baseAmount,
    makerFilledAmount = baseAmount,
    takerFilledAmount = baseAmount,
  }) {
    return {
      fillId: digest(`${label}-fill`),
      marketId: digest('LOCAL-BASE-QUOTE'),
      makerOrderHash,
      takerOrderHash,
      maker: maker.address,
      taker: taker.address,
      baseToken: baseTokenAddress,
      quoteToken: quoteTokenAddress,
      price,
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
      makerOrderAmount,
      takerOrderAmount,
      makerFilledAmount,
      takerFilledAmount,
    };
  }

  async function signFill(fill) {
    const fillHash = await settlement.hashFill(fill);
    return {
      makerSignature: await maker.signMessage(ethers.getBytes(fillHash)),
      takerSignature: await taker.signMessage(ethers.getBytes(fillHash)),
    };
  }

  async function settleFill(fill) {
    const signatures = await signFill(fill);
    return settlement.connect(relayer).settle(fill, signatures.makerSignature, signatures.takerSignature);
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
    settleFill,
  };
}

async function expectRejectedBeforeAdditionalStateChange(harness, fill, expectedError, expectedState) {
  const {
    maker,
    taker,
    settlement,
    vault,
    baseTokenAddress,
    quoteTokenAddress,
    makerBaseDeposit,
    takerQuoteDeposit,
    signFill,
    relayer,
  } = harness;
  const signatures = await signFill(fill);
  const tradeEventsBefore = await settlement.queryFilter(settlement.filters.TradeSettled());

  await assert.rejects(
    settlement.connect(relayer).settle(fill, signatures.makerSignature, signatures.takerSignature),
    expectedError,
    'ST-05 over-cap fills must reject before nonce consumption, cumulative accounting changes, or vault movement',
  );

  const tradeEventsAfter = await settlement.queryFilter(settlement.filters.TradeSettled());
  assert.equal(tradeEventsAfter.length, tradeEventsBefore.length, 'rejected over-cap fills must not emit TradeSettled');
  assert.equal(await settlement.isNonceUsed(maker.address, fill.makerNonce), expectedState.makerNonceUsed, 'maker nonce availability should be unchanged by rejection');
  assert.equal(await settlement.isNonceUsed(taker.address, fill.takerNonce), expectedState.takerNonceUsed, 'taker nonce availability should be unchanged by rejection');
  assert.equal(await settlement.filledAmountOf(fill.makerOrderHash), expectedState.makerFilledBefore, 'maker cumulative fill accounting must remain unchanged');
  assert.equal(await settlement.filledAmountOf(fill.takerOrderHash), expectedState.takerFilledBefore, 'taker cumulative fill accounting must remain unchanged');
  assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit - expectedState.settledBase, 'maker base must only reflect prior valid fills');
  assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit - expectedState.settledQuote, 'taker quote must only reflect prior valid fills');
  assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), expectedState.settledBase, 'taker base credit must not include rejected fill');
  assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), expectedState.settledQuote, 'maker quote credit must not include rejected fill');
}

describe('Settlement ST-05 partial fill accounting caps', function () {
  it('settles sequential partial fills for the same signed order only up to the signed amount cap', async function () {
    const harness = await deploySettlementHarness();
    const { maker, taker, settlement, vault, baseTokenAddress, quoteTokenAddress, makerBaseDeposit, takerQuoteDeposit, makeFill, settleFill } = harness;
    const makerOrderHash = digest('st05-maker-partial-order');
    const takerOrderHash = digest('st05-taker-partial-order');
    const makerNonce = 701n;
    const takerNonce = 702n;

    const firstPartial = makeFill({
      label: 'st05-first-partial',
      makerNonce,
      takerNonce,
      makerOrderHash,
      takerOrderHash,
      baseAmount: 40n,
      makerOrderAmount: 100n,
      takerOrderAmount: 100n,
      makerFilledAmount: 40n,
      takerFilledAmount: 40n,
    });
    const firstReceipt = await (await settleFill(firstPartial)).wait();
    assert.equal(parseEvents(firstReceipt, settlement, 'TradeSettled').length, 1, 'first partial fill should emit proof truth');
    assert.equal(await settlement.filledAmountOf(makerOrderHash), 40n);
    assert.equal(await settlement.filledAmountOf(takerOrderHash), 40n);
    assert.equal(await settlement.isNonceUsed(maker.address, makerNonce), false, 'partially filled maker nonce remains live for the same order hash');
    assert.equal(await settlement.isNonceUsed(taker.address, takerNonce), false, 'partially filled taker nonce remains live for the same order hash');

    const residualFill = makeFill({
      label: 'st05-residual-fill',
      makerNonce,
      takerNonce,
      makerOrderHash,
      takerOrderHash,
      baseAmount: 60n,
      makerOrderAmount: 100n,
      takerOrderAmount: 100n,
      makerFilledAmount: 100n,
      takerFilledAmount: 100n,
    });
    const residualReceipt = await (await settleFill(residualFill)).wait();
    assert.equal(parseEvents(residualReceipt, settlement, 'TradeSettled').length, 1, 'residual fill should emit proof truth');
    assert.equal(await settlement.filledAmountOf(makerOrderHash), 100n);
    assert.equal(await settlement.filledAmountOf(takerOrderHash), 100n);
    assert.equal(await settlement.isNonceUsed(maker.address, makerNonce), true, 'maker nonce is unavailable once the signed order amount is fully filled');
    assert.equal(await settlement.isNonceUsed(taker.address, takerNonce), true, 'taker nonce is unavailable once the signed order amount is fully filled');
    assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit - 100n);
    assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), 100n);
    assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit - 200n);
    assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), 200n);
  });

  it('rejects partial fills whose cumulative maker or taker filled amount would exceed the signed order amount', async function () {
    const makerHarness = await deploySettlementHarness();
    const makerOrderHash = digest('st05-maker-over-cap-order');
    const makerTakerOrderHash = digest('st05-maker-over-cap-taker-order');
    const makerFirst = makerHarness.makeFill({
      label: 'st05-maker-first-90',
      makerNonce: 711n,
      takerNonce: 712n,
      makerOrderHash,
      takerOrderHash: makerTakerOrderHash,
      baseAmount: 90n,
      makerOrderAmount: 100n,
      takerOrderAmount: 100n,
      makerFilledAmount: 90n,
      takerFilledAmount: 90n,
    });
    await makerHarness.settleFill(makerFirst);
    const makerOverCap = makerHarness.makeFill({
      label: 'st05-maker-over-cap',
      makerNonce: 711n,
      takerNonce: 712n,
      makerOrderHash,
      takerOrderHash: makerTakerOrderHash,
      baseAmount: 11n,
      makerOrderAmount: 100n,
      takerOrderAmount: 120n,
      makerFilledAmount: 101n,
      takerFilledAmount: 101n,
    });
    await expectRejectedBeforeAdditionalStateChange(makerHarness, makerOverCap, /ST_MAKER_ORDER_AMOUNT_EXCEEDED/, {
      makerNonceUsed: false,
      takerNonceUsed: false,
      makerFilledBefore: 90n,
      takerFilledBefore: 90n,
      settledBase: 90n,
      settledQuote: 180n,
    });

    const takerHarness = await deploySettlementHarness();
    const takerMakerOrderHash = digest('st05-taker-over-cap-maker-order');
    const takerOrderHash = digest('st05-taker-over-cap-order');
    const takerFirst = takerHarness.makeFill({
      label: 'st05-taker-first-90',
      makerNonce: 721n,
      takerNonce: 722n,
      makerOrderHash: takerMakerOrderHash,
      takerOrderHash,
      baseAmount: 90n,
      makerOrderAmount: 120n,
      takerOrderAmount: 100n,
      makerFilledAmount: 90n,
      takerFilledAmount: 90n,
    });
    await takerHarness.settleFill(takerFirst);
    const takerOverCap = takerHarness.makeFill({
      label: 'st05-taker-over-cap',
      makerNonce: 721n,
      takerNonce: 722n,
      makerOrderHash: takerMakerOrderHash,
      takerOrderHash,
      baseAmount: 11n,
      makerOrderAmount: 120n,
      takerOrderAmount: 100n,
      makerFilledAmount: 101n,
      takerFilledAmount: 101n,
    });
    await expectRejectedBeforeAdditionalStateChange(takerHarness, takerOverCap, /ST_TAKER_ORDER_AMOUNT_EXCEEDED/, {
      makerNonceUsed: false,
      takerNonceUsed: false,
      makerFilledBefore: 90n,
      takerFilledBefore: 90n,
      settledBase: 90n,
      settledQuote: 180n,
    });
  });
});
