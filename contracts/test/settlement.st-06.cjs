const assert = require('node:assert/strict');
const { ethers } = require('hardhat');

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
  const [maker, taker, relayer, feeRecipient, wrongFeeRecipient] = await ethers.getSigners();
  const makerBaseDeposit = 1000n;
  const takerQuoteDeposit = 2000n;
  const Settlement = await ethers.getContractFactory('Settlement');
  const settlement = await Settlement.connect(feeRecipient).deploy();
  await settlement.waitForDeployment();

  const settlementAddress = await settlement.getAddress();
  const configuredFeeRecipient = await settlement.configuredFeeRecipient();
  assert.equal(configuredFeeRecipient, feeRecipient.address, 'ST-06 local settlement should expose the configured fee recipient');

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
  await marketRegistry.connect(feeRecipient).addMarket(baseTokenAddress, quoteTokenAddress, 1, 1, 1n);
  const block = await ethers.provider.getBlock('latest');
  const network = await ethers.provider.getNetwork();

  function makeFill({ label, makerNonce, takerNonce, overrides = {} }) {
    const baseAmount = overrides.baseAmount ?? 100n;
    const price = overrides.price ?? 2n;
    const quoteAmount = overrides.quoteAmount ?? baseAmount * price;

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

  async function settleFill(fill) {
    const signatures = await signFill(fill);
    return settlement.connect(relayer).settle(fill, signatures.makerSignature, signatures.takerSignature);
  }

  return {
    maker,
    taker,
    relayer,
    feeRecipient,
    wrongFeeRecipient,
    configuredFeeRecipient,
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

async function expectRejectedBeforeStateChange(harness, fill, expectedError) {
  const {
    maker,
    taker,
    relayer,
    configuredFeeRecipient,
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
    'invalid ST-06 fee policy must reject before nonce consumption, fill accounting, vault movement, or proof events',
  );

  const tradeEventsAfter = await settlement.queryFilter(settlement.filters.TradeSettled());
  assert.equal(tradeEventsAfter.length, tradeEventsBefore.length, 'rejected fee policy must not emit TradeSettled');
  assert.equal(await settlement.isNonceUsed(maker.address, fill.makerNonce), false, 'maker nonce must remain available after fee-policy rejection');
  assert.equal(await settlement.isNonceUsed(taker.address, fill.takerNonce), false, 'taker nonce must remain available after fee-policy rejection');
  assert.equal(await settlement.filledAmountOf(fill.makerOrderHash), 0n, 'maker cumulative fill accounting must remain unchanged');
  assert.equal(await settlement.filledAmountOf(fill.takerOrderHash), 0n, 'taker cumulative fill accounting must remain unchanged');
  assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit, 'maker base must not move on rejected fee policy');
  assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit, 'taker quote must not move on rejected fee policy');
  assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), 0n, 'taker base must not be credited on rejected fee policy');
  assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), 0n, 'maker quote must not be credited on rejected fee policy');
  assert.equal(await vault.availableBalanceOf(configuredFeeRecipient, baseTokenAddress), 0n, 'fee recipient base must not move on rejected fee policy');
  assert.equal(await vault.availableBalanceOf(configuredFeeRecipient, quoteTokenAddress), 0n, 'fee recipient quote must not move on rejected fee policy');
}

describe('Settlement ST-06 fee cap and recipient enforcement', function () {
  it('settles valid maker/taker fees to the configured recipient and emits fee proof fields', async function () {
    const harness = await deploySettlementHarness();
    const {
      maker,
      taker,
      configuredFeeRecipient,
      settlement,
      vault,
      baseTokenAddress,
      quoteTokenAddress,
      makerBaseDeposit,
      takerQuoteDeposit,
      makeFill,
      settleFill,
    } = harness;
    const fill = makeFill({
      label: 'st06-valid-fees',
      makerNonce: 801n,
      takerNonce: 802n,
      overrides: {
        makerFee: 10n,
        takerFee: 5n,
        maxFeeBps: 500n,
        feeRecipient: configuredFeeRecipient,
      },
    });

    const receipt = await (await settleFill(fill)).wait();
    const tradeEvents = parseEvents(receipt, settlement, 'TradeSettled');
    const movementEvents = parseEvents(receipt, vault, 'SettlementBalanceMoved');

    assert.equal(tradeEvents.length, 1, 'valid fee fill should emit exactly one proof event');
    assert.equal(movementEvents.length, 4, 'valid fee fill should split base/quote settlement plus fee credits');
    assert.equal(tradeEvents[0].args.makerFee, 10n);
    assert.equal(tradeEvents[0].args.takerFee, 5n);
    assert.equal(tradeEvents[0].args.feeRecipient, configuredFeeRecipient);

    assert.equal(await settlement.isNonceUsed(maker.address, fill.makerNonce), true, 'fully filled maker nonce should be used');
    assert.equal(await settlement.isNonceUsed(taker.address, fill.takerNonce), true, 'fully filled taker nonce should be used');
    assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit - 100n, 'maker sells the gross base amount');
    assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), 95n, 'taker receives base net of taker fee');
    assert.equal(await vault.availableBalanceOf(configuredFeeRecipient, baseTokenAddress), 5n, 'fee recipient receives taker fee in base token');
    assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit - 200n, 'taker pays the gross quote amount');
    assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), 190n, 'maker receives quote proceeds net of maker fee');
    assert.equal(await vault.availableBalanceOf(configuredFeeRecipient, quoteTokenAddress), 10n, 'fee recipient receives maker fee in quote token');
  });

  it('rejects fee-cap excess and fee-recipient mismatches before state changes', async function () {
    const cases = [
      {
        label: 'st06-maker-fee-over-cap',
        overrides: ({ configuredFeeRecipient }) => ({ makerFee: 11n, takerFee: 5n, maxFeeBps: 500n, feeRecipient: configuredFeeRecipient }),
        error: /ST_MAKER_FEE_CAP_EXCEEDED/,
      },
      {
        label: 'st06-taker-fee-over-cap',
        overrides: ({ configuredFeeRecipient }) => ({ makerFee: 10n, takerFee: 6n, maxFeeBps: 500n, feeRecipient: configuredFeeRecipient }),
        error: /ST_TAKER_FEE_CAP_EXCEEDED/,
      },
      {
        label: 'st06-hard-cap-over-local-max',
        overrides: () => ({ maxFeeBps: 1001n }),
        error: /ST_MAX_FEE_BPS_TOO_HIGH/,
      },
      {
        label: 'st06-zero-fee-recipient',
        overrides: () => ({ makerFee: 1n, maxFeeBps: 500n, feeRecipient: ethers.ZeroAddress }),
        error: /ST_FEE_RECIPIENT_INVALID/,
      },
      {
        label: 'st06-wrong-fee-recipient',
        overrides: ({ wrongFeeRecipient }) => ({ takerFee: 1n, maxFeeBps: 500n, feeRecipient: wrongFeeRecipient.address }),
        error: /ST_FEE_RECIPIENT_INVALID/,
      },
    ];

    for (const testCase of cases) {
      const harness = await deploySettlementHarness();
      const fill = harness.makeFill({
        label: testCase.label,
        makerNonce: 810n + BigInt(cases.indexOf(testCase) * 2),
        takerNonce: 811n + BigInt(cases.indexOf(testCase) * 2),
        overrides: testCase.overrides(harness),
      });

      await expectRejectedBeforeStateChange(harness, fill, testCase.error);
    }
  });
});
