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
  const nonceManagerAddress = await settlement.nonceManager();
  const nonceManager = await ethers.getContractAt('NonceManager', nonceManagerAddress);
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

  function makeFill({ label, makerNonce, takerNonce, baseAmount = 100n, quoteAmount = 200n }) {
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
    nonceManager,
    vault,
    vaultAddress,
    baseToken,
    quoteToken,
    baseTokenAddress,
    quoteTokenAddress,
    makerBaseDeposit,
    takerQuoteDeposit,
    makeFill,
    signFill,
  };
}

describe('Settlement ST-02 nonce reuse and cancellation rejection', function () {
  it('rejects different otherwise-valid fills that reuse maker or taker nonces before vault movement', async function () {
    const harness = await deploySettlementHarness();
    const { maker, taker, relayer, settlement, vault, baseTokenAddress, quoteTokenAddress, makeFill, signFill } = harness;
    const firstFill = makeFill({ label: 'st02-first', makerNonce: 11n, takerNonce: 22n });
    const firstSignatures = await signFill(firstFill);

    await settlement.connect(relayer).settle(firstFill, firstSignatures.makerSignature, firstSignatures.takerSignature);
    const makerBaseAfterFirst = await vault.availableBalanceOf(maker.address, baseTokenAddress);
    const takerQuoteAfterFirst = await vault.availableBalanceOf(taker.address, quoteTokenAddress);

    const reusedMakerFill = makeFill({ label: 'st02-reused-maker', makerNonce: 11n, takerNonce: 23n, baseAmount: 50n, quoteAmount: 100n });
    const reusedMakerSignatures = await signFill(reusedMakerFill);
    await assert.rejects(
      settlement.connect(relayer).settle(reusedMakerFill, reusedMakerSignatures.makerSignature, reusedMakerSignatures.takerSignature),
      /ST_MAKER_NONCE_USED/,
      'a new fill cannot consume a maker nonce already used by a prior settlement',
    );
    assert.equal(await settlement.isNonceUsed(taker.address, 23n), false, 'failed reused-maker fill must not consume taker nonce');

    const reusedTakerFill = makeFill({ label: 'st02-reused-taker', makerNonce: 12n, takerNonce: 22n, baseAmount: 50n, quoteAmount: 100n });
    const reusedTakerSignatures = await signFill(reusedTakerFill);
    await assert.rejects(
      settlement.connect(relayer).settle(reusedTakerFill, reusedTakerSignatures.makerSignature, reusedTakerSignatures.takerSignature),
      /ST_TAKER_NONCE_USED/,
      'a new fill cannot consume a taker nonce already used by a prior settlement',
    );
    assert.equal(await settlement.isNonceUsed(maker.address, 12n), false, 'failed reused-taker fill must not consume maker nonce');
    assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseAfterFirst, 'reused nonce attempts must not debit maker base again');
    assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteAfterFirst, 'reused nonce attempts must not debit taker quote again');
  });

  it('lets users cancel single nonces and rejects otherwise-valid fills using those cancelled nonces', async function () {
    const harness = await deploySettlementHarness();
    const { maker, taker, relayer, settlement, nonceManager, vault, baseTokenAddress, quoteTokenAddress, makerBaseDeposit, takerQuoteDeposit, makeFill, signFill } = harness;

    const makerCancelTx = await nonceManager.connect(maker).cancelNonce(77n);
    const makerCancelReceipt = await makerCancelTx.wait();
    const makerCancelEvents = parseEvents(makerCancelReceipt, nonceManager, 'NonceCancelled');
    assert.equal(makerCancelEvents.length, 1, 'single nonce cancellation should emit one NonceCancelled event');
    assert.equal(makerCancelEvents[0].args.user, maker.address);
    assert.equal(makerCancelEvents[0].args.nonce, 77n);
    assert.equal(await settlement.isNonceUsed(maker.address, 77n), true, 'cancelled maker nonce should be unavailable to settlement');

    const makerCancelledFill = makeFill({ label: 'st02-maker-cancelled', makerNonce: 77n, takerNonce: 88n });
    const makerCancelledSignatures = await signFill(makerCancelledFill);
    await assert.rejects(
      settlement.connect(relayer).settle(makerCancelledFill, makerCancelledSignatures.makerSignature, makerCancelledSignatures.takerSignature),
      /ST_MAKER_NONCE_USED/,
      'settlement must reject a maker-cancelled nonce before vault movement',
    );
    assert.equal(await settlement.isNonceUsed(taker.address, 88n), false, 'failed maker-cancelled fill must not consume taker nonce');

    const takerCancelTx = await nonceManager.connect(taker).cancelNonce(99n);
    const takerCancelReceipt = await takerCancelTx.wait();
    const takerCancelEvents = parseEvents(takerCancelReceipt, nonceManager, 'NonceCancelled');
    assert.equal(takerCancelEvents.length, 1, 'taker nonce cancellation should emit one NonceCancelled event');
    assert.equal(takerCancelEvents[0].args.user, taker.address);
    assert.equal(takerCancelEvents[0].args.nonce, 99n);
    assert.equal(await settlement.isNonceUsed(taker.address, 99n), true, 'cancelled taker nonce should be unavailable to settlement');

    const takerCancelledFill = makeFill({ label: 'st02-taker-cancelled', makerNonce: 78n, takerNonce: 99n });
    const takerCancelledSignatures = await signFill(takerCancelledFill);
    await assert.rejects(
      settlement.connect(relayer).settle(takerCancelledFill, takerCancelledSignatures.makerSignature, takerCancelledSignatures.takerSignature),
      /ST_TAKER_NONCE_USED/,
      'settlement must reject a taker-cancelled nonce before vault movement',
    );
    assert.equal(await settlement.isNonceUsed(maker.address, 78n), false, 'failed taker-cancelled fill must not consume maker nonce');
    assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit, 'cancelled nonce attempts must not debit maker base');
    assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit, 'cancelled nonce attempts must not debit taker quote');
  });

  it('lets users cancel a bounded nonce range while leaving unrelated nonces available', async function () {
    const harness = await deploySettlementHarness();
    const { maker, taker, relayer, settlement, nonceManager, vault, baseTokenAddress, makerBaseDeposit, makeFill, signFill } = harness;

    const rangeCancelTx = await nonceManager.connect(maker).cancelNonceRange(100n, 102n);
    const rangeCancelReceipt = await rangeCancelTx.wait();
    const rangeCancelEvents = parseEvents(rangeCancelReceipt, nonceManager, 'NonceRangeCancelled');
    assert.equal(rangeCancelEvents.length, 1, 'range cancellation should emit one NonceRangeCancelled event');
    assert.equal(rangeCancelEvents[0].args.user, maker.address);
    assert.equal(rangeCancelEvents[0].args.from, 100n);
    assert.equal(rangeCancelEvents[0].args.to, 102n);
    assert.equal(await settlement.isNonceUsed(maker.address, 100n), true);
    assert.equal(await settlement.isNonceUsed(maker.address, 101n), true);
    assert.equal(await settlement.isNonceUsed(maker.address, 102n), true);
    assert.equal(await settlement.isNonceUsed(maker.address, 103n), false, 'range cancellation must not over-cancel the next nonce');

    const rangeCancelledFill = makeFill({ label: 'st02-range-cancelled', makerNonce: 101n, takerNonce: 201n });
    const rangeCancelledSignatures = await signFill(rangeCancelledFill);
    await assert.rejects(
      settlement.connect(relayer).settle(rangeCancelledFill, rangeCancelledSignatures.makerSignature, rangeCancelledSignatures.takerSignature),
      /ST_MAKER_NONCE_USED/,
      'settlement must reject a range-cancelled maker nonce before vault movement',
    );
    assert.equal(await settlement.isNonceUsed(taker.address, 201n), false, 'failed range-cancelled fill must not consume taker nonce');
    assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit, 'range-cancelled nonce attempts must not move vault balances');

    await assert.rejects(
      nonceManager.connect(maker).cancelNonceRange(5n, 4n),
      /NM_NONCE_RANGE_INVALID/,
      'nonce range cancellation should reject inverted ranges',
    );
  });
});
