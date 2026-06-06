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

async function deploySettlementFeeManagerHarness() {
  const [feeAuthority, maker, taker, relayer, wrongFeeRecipient, nextFeeRecipient] = await ethers.getSigners();
  const makerBaseDeposit = 1000n;
  const takerQuoteDeposit = 2000n;
  const baseAmount = 100n;
  const price = 2n;
  const quoteAmount = baseAmount * price;

  const Settlement = await ethers.getContractFactory('Settlement');
  const settlement = await Settlement.connect(feeAuthority).deploy();
  await settlement.waitForDeployment();

  const settlementAddress = await settlement.getAddress();
  const feeManagerAddress = await settlement.feeManager();
  const feeManager = await ethers.getContractAt('FeeManager', feeManagerAddress);
  const marketRegistryAddress = await settlement.marketRegistry();
  const marketRegistry = await ethers.getContractAt('MarketRegistry', marketRegistryAddress);
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
  const marketId = marketIdFor(baseTokenAddress, quoteTokenAddress);
  await marketRegistry.connect(feeAuthority).addMarket(baseTokenAddress, quoteTokenAddress, 1, 1, 1n);
  const block = await ethers.provider.getBlock('latest');
  const network = await ethers.provider.getNetwork();

  function makeFill({ label, makerNonce, takerNonce, overrides = {} }) {
    const nextBaseAmount = overrides.baseAmount ?? baseAmount;
    const nextPrice = overrides.price ?? price;
    const nextQuoteAmount = overrides.quoteAmount ?? nextBaseAmount * nextPrice;

    return {
      fillId: digest(`${label}-fill`),
      marketId,
      makerOrderHash: digest(`${label}-maker-order`),
      takerOrderHash: digest(`${label}-taker-order`),
      maker: maker.address,
      taker: taker.address,
      baseToken: baseTokenAddress,
      quoteToken: quoteTokenAddress,
      price: nextPrice,
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

  async function settleFill(fill) {
    const signatures = await signFill(fill);
    return settlement.connect(relayer).settle(fill, signatures.makerSignature, signatures.takerSignature);
  }

  async function updateFees({ makerFeeBps = 500n, takerFeeBps = 500n } = {}) {
    await feeManager.connect(feeAuthority).updateFees(marketId, makerFeeBps, takerFeeBps);
  }

  return {
    feeAuthority,
    maker,
    taker,
    relayer,
    wrongFeeRecipient,
    nextFeeRecipient,
    settlement,
    feeManager,
    vault,
    baseTokenAddress,
    quoteTokenAddress,
    makerBaseDeposit,
    takerQuoteDeposit,
    marketId,
    quoteAmount,
    makeFill,
    signFill,
    settleFill,
    updateFees,
  };
}

async function expectRejectedBeforeStateChange(harness, fill, expectedError) {
  const {
    maker,
    taker,
    relayer,
    settlement,
    feeManager,
    vault,
    baseTokenAddress,
    quoteTokenAddress,
    makerBaseDeposit,
    takerQuoteDeposit,
    signFill,
  } = harness;
  const signatures = await signFill(fill);
  const tradeEventsBefore = await settlement.queryFilter(settlement.filters.TradeSettled());
  const currentFeeRecipient = await feeManager.feeRecipient();

  await assert.rejects(
    settlement.connect(relayer).settle(fill, signatures.makerSignature, signatures.takerSignature),
    expectedError,
    'invalid FM-02 fee-manager state must reject before nonce consumption, accounting, vault movement, or proof emission',
  );

  const tradeEventsAfter = await settlement.queryFilter(settlement.filters.TradeSettled());
  assert.equal(tradeEventsAfter.length, tradeEventsBefore.length, 'rejected fee-manager fills must not emit TradeSettled');
  assert.equal(await settlement.isNonceUsed(maker.address, fill.makerNonce), false, 'maker nonce must remain available after fee-manager rejection');
  assert.equal(await settlement.isNonceUsed(taker.address, fill.takerNonce), false, 'taker nonce must remain available after fee-manager rejection');
  assert.equal(await settlement.filledAmountOf(fill.makerOrderHash), 0n, 'maker fill accounting must remain unchanged');
  assert.equal(await settlement.filledAmountOf(fill.takerOrderHash), 0n, 'taker fill accounting must remain unchanged');
  assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit, 'maker base must not move on fee-manager rejection');
  assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit, 'taker quote must not move on fee-manager rejection');
  assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), 0n, 'taker base must not be credited on fee-manager rejection');
  assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), 0n, 'maker quote must not be credited on fee-manager rejection');
  assert.equal(await vault.availableBalanceOf(currentFeeRecipient, baseTokenAddress), 0n, 'fee recipient base must not move on fee-manager rejection');
  assert.equal(await vault.availableBalanceOf(currentFeeRecipient, quoteTokenAddress), 0n, 'fee recipient quote must not move on fee-manager rejection');
}

describe('Settlement FM-02 FeeManager dependency wiring', function () {
  it('requires FeeManager fee schedule and recipient truth before settling nonzero fees', async function () {
    const harness = await deploySettlementFeeManagerHarness();
    const {
      feeAuthority,
      maker,
      taker,
      settlement,
      feeManager,
      vault,
      baseTokenAddress,
      quoteTokenAddress,
      makerBaseDeposit,
      takerQuoteDeposit,
      marketId,
      makeFill,
      settleFill,
      updateFees,
    } = harness;

    assert.equal(await feeManager.feeAuthority(), feeAuthority.address, 'Settlement should deploy a fee-authority-scoped FeeManager');
    assert.equal(await feeManager.feeRecipient(), feeAuthority.address, 'initial settlement fee recipient should come from FeeManager');
    assert.equal(await feeManager.makerFeeBps(marketId), 0n, 'FeeManager should be zero-fee by default before explicit market policy');
    assert.equal(await feeManager.takerFeeBps(marketId), 0n, 'FeeManager should be zero-fee by default before explicit market policy');

    const defaultZeroScheduleFill = makeFill({
      label: 'fm02-zero-schedule-nonzero-fee',
      makerNonce: 1201n,
      takerNonce: 1202n,
      overrides: { makerFee: 1n, maxFeeBps: 500n, feeRecipient: feeAuthority.address },
    });
    await expectRejectedBeforeStateChange(harness, defaultZeroScheduleFill, /ST_MAKER_FEE_POLICY_EXCEEDED/);

    await updateFees({ makerFeeBps: 500n, takerFeeBps: 500n });

    const fill = makeFill({
      label: 'fm02-valid-manager-fees',
      makerNonce: 1203n,
      takerNonce: 1204n,
      overrides: {
        makerFee: 10n,
        takerFee: 5n,
        maxFeeBps: 500n,
        feeRecipient: await feeManager.feeRecipient(),
      },
    });

    const receipt = await (await settleFill(fill)).wait();
    const tradeEvents = parseEvents(receipt, settlement, 'TradeSettled');

    assert.equal(tradeEvents.length, 1, 'FeeManager-approved fill should emit exactly one TradeSettled proof event');
    assert.equal(tradeEvents[0].args.feeRecipient, feeAuthority.address);
    assert.equal(tradeEvents[0].args.makerFee, 10n);
    assert.equal(tradeEvents[0].args.takerFee, 5n);
    assert.equal(await settlement.isNonceUsed(maker.address, fill.makerNonce), true, 'full maker fill should consume owner nonce through NonceManager');
    assert.equal(await settlement.isNonceUsed(taker.address, fill.takerNonce), true, 'full taker fill should consume owner nonce through NonceManager');
    assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit - 100n);
    assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), 95n);
    assert.equal(await vault.availableBalanceOf(feeAuthority.address, baseTokenAddress), 5n);
    assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit - 200n);
    assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), 190n);
    assert.equal(await vault.availableBalanceOf(feeAuthority.address, quoteTokenAddress), 10n);
  });

  it('rejects signed-cap excess, manager-policy excess, and recipient drift before state changes', async function () {
    const cases = [
      {
        label: 'fm02-signed-maker-fee-over-cap',
        setup: (harness) => harness.updateFees({ makerFeeBps: 1000n, takerFeeBps: 1000n }),
        overrides: async ({ feeManager }) => ({ makerFee: 11n, maxFeeBps: 500n, feeRecipient: await feeManager.feeRecipient() }),
        error: /ST_MAKER_FEE_CAP_EXCEEDED/,
      },
      {
        label: 'fm02-maker-fee-over-manager-policy',
        setup: (harness) => harness.updateFees({ makerFeeBps: 500n, takerFeeBps: 1000n }),
        overrides: async ({ feeManager }) => ({ makerFee: 11n, maxFeeBps: 1000n, feeRecipient: await feeManager.feeRecipient() }),
        error: /ST_MAKER_FEE_POLICY_EXCEEDED/,
      },
      {
        label: 'fm02-taker-fee-over-manager-policy',
        setup: (harness) => harness.updateFees({ makerFeeBps: 1000n, takerFeeBps: 500n }),
        overrides: async ({ feeManager }) => ({ takerFee: 6n, maxFeeBps: 1000n, feeRecipient: await feeManager.feeRecipient() }),
        error: /ST_TAKER_FEE_POLICY_EXCEEDED/,
      },
      {
        label: 'fm02-hard-cap-from-fee-manager',
        setup: (harness) => harness.updateFees({ makerFeeBps: 1000n, takerFeeBps: 1000n }),
        overrides: async ({ feeManager }) => ({ maxFeeBps: 1001n, feeRecipient: await feeManager.feeRecipient() }),
        error: /ST_MAX_FEE_BPS_TOO_HIGH/,
      },
      {
        label: 'fm02-fee-recipient-drift',
        setup: async ({ feeAuthority, feeManager, nextFeeRecipient, updateFees }) => {
          await updateFees({ makerFeeBps: 500n, takerFeeBps: 500n });
          await feeManager.connect(feeAuthority).updateFeeRecipient(nextFeeRecipient.address);
        },
        overrides: async ({ feeAuthority }) => ({ makerFee: 1n, maxFeeBps: 500n, feeRecipient: feeAuthority.address }),
        error: /ST_FEE_RECIPIENT_INVALID/,
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const harness = await deploySettlementFeeManagerHarness();
      await testCase.setup(harness);
      const fill = harness.makeFill({
        label: testCase.label,
        makerNonce: 1211n + BigInt(index * 2),
        takerNonce: 1212n + BigInt(index * 2),
        overrides: await testCase.overrides(harness),
      });

      await expectRejectedBeforeStateChange(harness, fill, testCase.error);
    }
  });

  it('keeps FeeManager wiring dependency-scoped with no direct custody or local fee-authority shortcuts', async function () {
    const { settlement } = await deploySettlementFeeManagerHarness();
    const source = await readRepoFile('contracts/src/Settlement.sol');
    const abiFunctionNames = settlement.interface.fragments
      .filter((fragment) => fragment.type === 'function')
      .map((fragment) => fragment.name);

    assert.ok(abiFunctionNames.includes('feeManager'), 'Settlement must expose its local FeeManager dependency');
    assert.match(source, /IFeeManager public immutable feeManager;/, 'fee manager dependency should be explicit and immutable');
    assert.match(source, /new FeeManager\(msg\.sender, msg\.sender\)/, 'local Settlement must deploy a fee-authority-scoped FeeManager');
    assert.doesNotMatch(source, /configuredFeeRecipient/u, 'Settlement must read fee recipient truth from FeeManager after FM-02');
    assert.doesNotMatch(source, /LOCAL_MAX_FEE_BPS/u, 'Settlement must read hard fee cap truth from FeeManager after FM-02');

    for (const forbiddenPattern of [
      /function\s+(withdraw|withdrawFor|adminWithdraw|operatorWithdraw|emergencyWithdraw|rescue|sweep)\b/iu,
      /delegatecall/iu,
      /call\s*\{/iu,
    ]) {
      assert.doesNotMatch(source, forbiddenPattern, `Settlement FeeManager integration must not include ${forbiddenPattern}`);
    }
  });
});
