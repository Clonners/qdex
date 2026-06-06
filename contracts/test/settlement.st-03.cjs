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

  function makeFill({
    label,
    makerNonce,
    takerNonce,
    expiresAt = BigInt(block.timestamp + 3600),
    chainId = network.chainId,
    settlementContract = settlementAddress,
  }) {
    const baseAmount = 100n;
    const quoteAmount = 200n;

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
      expiresAt,
      chainId,
      settlementContract,
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
    vault,
    baseTokenAddress,
    quoteTokenAddress,
    makerBaseDeposit,
    takerQuoteDeposit,
    network,
    makeFill,
    signFill,
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

  await assert.rejects(
    settlement.connect(relayer).settle(fill, signatures.makerSignature, signatures.takerSignature),
    expectedError,
    'domain/expiry-invalid fills must reject before nonce consumption or vault movement',
  );

  assert.equal(await settlement.isNonceUsed(maker.address, fill.makerNonce), false, 'maker nonce must remain available after rejected fill');
  assert.equal(await settlement.isNonceUsed(taker.address, fill.takerNonce), false, 'taker nonce must remain available after rejected fill');
  assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit, 'maker base must not move on rejected fill');
  assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit, 'taker quote must not move on rejected fill');
  assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), 0n, 'taker base must not be credited on rejected fill');
  assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), 0n, 'maker quote must not be credited on rejected fill');
  assert.equal(await vault.lockedBalanceOf(maker.address, baseTokenAddress), 0n, 'maker base must not remain locked on rejected fill');
  assert.equal(await vault.lockedBalanceOf(taker.address, quoteTokenAddress), 0n, 'taker quote must not remain locked on rejected fill');
}

describe('Settlement ST-03 expiry and replay-domain rejection', function () {
  it('treats a fill at its exact expiresAt timestamp as expired before nonce consumption or vault movement', async function () {
    const harness = await deploySettlementHarness();
    const latestBlock = await ethers.provider.getBlock('latest');
    const exactExpiryTimestamp = BigInt(latestBlock.timestamp + 60);
    const fill = harness.makeFill({
      label: 'st03-expired-at-boundary',
      makerNonce: 301n,
      takerNonce: 302n,
      expiresAt: exactExpiryTimestamp,
    });
    const signatures = await harness.signFill(fill);

    await ethers.provider.send('evm_setNextBlockTimestamp', [Number(exactExpiryTimestamp)]);
    await expectRejectedBeforeStateChange(harness, fill, signatures, /ST_EXPIRED/);
  });

  it('rejects a wrong chainId replay domain before nonce consumption or vault movement', async function () {
    const harness = await deploySettlementHarness();
    const fill = harness.makeFill({
      label: 'st03-wrong-chain-id',
      makerNonce: 401n,
      takerNonce: 402n,
      chainId: harness.network.chainId + 1n,
    });
    const signatures = await harness.signFill(fill);

    await expectRejectedBeforeStateChange(harness, fill, signatures, /ST_CHAIN_ID_MISMATCH/);
  });

  it('rejects a wrong settlementContract replay domain before nonce consumption or vault movement', async function () {
    const harness = await deploySettlementHarness();
    const fill = harness.makeFill({
      label: 'st03-wrong-settlement-contract',
      makerNonce: 501n,
      takerNonce: 502n,
      settlementContract: harness.relayer.address,
    });
    const signatures = await harness.signFill(fill);

    await expectRejectedBeforeStateChange(harness, fill, signatures, /ST_SETTLEMENT_CONTRACT_MISMATCH/);
  });
});
