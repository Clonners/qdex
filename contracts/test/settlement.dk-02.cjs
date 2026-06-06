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

async function deploySettlementDelegateHarness() {
  const [maker, taker, makerDelegate, takerDelegate, relayer] = await ethers.getSigners();
  const makerBaseDeposit = 1000n;
  const takerQuoteDeposit = 2000n;
  const localMarketId = digest('LOCAL-BASE-QUOTE');
  const baseAmount = 100n;
  const price = 2n;
  const quoteAmount = baseAmount * price;

  const Settlement = await ethers.getContractFactory('Settlement');
  const settlement = await Settlement.deploy();
  await settlement.waitForDeployment();

  const settlementAddress = await settlement.getAddress();
  const delegateKeyRegistryAddress = await settlement.delegateKeyRegistry();
  const delegateKeyRegistry = await ethers.getContractAt('DelegateKeyRegistry', delegateKeyRegistryAddress);
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

  async function registerDelegate({
    ownerSigner,
    delegateAddress,
    marketId = localMarketId,
    maxNotional = quoteAmount,
    permissions = [
      Permission.READ_ONLY,
      Permission.PLACE_ORDER,
      Permission.CANCEL_ORDER,
      Permission.NO_WITHDRAW,
      Permission.NO_ADMIN,
    ],
  }) {
    const now = await latestTimestamp();
    const key = {
      owner: ownerSigner.address,
      delegate: delegateAddress,
      expiresAt: now + 3_600n,
      allowedMarketsHash: allowedMarketsHashFor(marketId),
      maxNotional,
      permissions,
      revoked: false,
    };

    await delegateKeyRegistry.connect(ownerSigner).registerDelegateKey(key);
    return key;
  }

  function makeFill({ label, makerNonce, takerNonce, overrides = {} }) {
    return {
      fillId: digest(`${label}-fill`),
      marketId: localMarketId,
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

  async function signFill(fill, { makerSigner = maker, takerSigner = taker } = {}) {
    const fillHash = await settlement.hashFill(fill);
    return {
      makerSignature: await makerSigner.signMessage(ethers.getBytes(fillHash)),
      takerSignature: await takerSigner.signMessage(ethers.getBytes(fillHash)),
    };
  }

  return {
    maker,
    taker,
    makerDelegate,
    takerDelegate,
    relayer,
    settlement,
    delegateKeyRegistry,
    vault,
    baseTokenAddress,
    quoteTokenAddress,
    makerBaseDeposit,
    takerQuoteDeposit,
    localMarketId,
    quoteAmount,
    registerDelegate,
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
  const tradeEventsBefore = await settlement.queryFilter(settlement.filters.TradeSettled());

  await assert.rejects(
    settlement.connect(relayer).settle(fill, signatures.makerSignature, signatures.takerSignature),
    expectedError,
    'invalid DK-02 delegate signer must reject before nonce consumption, fill accounting, vault movement, or proof events',
  );

  const tradeEventsAfter = await settlement.queryFilter(settlement.filters.TradeSettled());
  assert.equal(tradeEventsAfter.length, tradeEventsBefore.length, 'rejected delegate signer must not emit TradeSettled');
  assert.equal(await settlement.isNonceUsed(maker.address, fill.makerNonce), false, 'maker nonce must remain available after delegate rejection');
  assert.equal(await settlement.isNonceUsed(taker.address, fill.takerNonce), false, 'taker nonce must remain available after delegate rejection');
  assert.equal(await settlement.filledAmountOf(fill.makerOrderHash), 0n, 'maker fill accounting must remain unchanged');
  assert.equal(await settlement.filledAmountOf(fill.takerOrderHash), 0n, 'taker fill accounting must remain unchanged');
  assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit, 'maker base must not move on delegate rejection');
  assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit, 'taker quote must not move on delegate rejection');
  assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), 0n, 'taker base must not be credited on delegate rejection');
  assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), 0n, 'maker quote must not be credited on delegate rejection');
}

describe('Settlement DK-02 delegate signing validation', function () {
  it('accepts active delegate signatures scoped by owner, market, notional, PLACE_ORDER, NO_WITHDRAW, and NO_ADMIN', async function () {
    const harness = await deploySettlementDelegateHarness();
    const {
      maker,
      taker,
      makerDelegate,
      takerDelegate,
      relayer,
      settlement,
      delegateKeyRegistry,
      vault,
      baseTokenAddress,
      quoteTokenAddress,
      makerBaseDeposit,
      takerQuoteDeposit,
      localMarketId,
      quoteAmount,
      registerDelegate,
      makeFill,
      signFill,
    } = harness;

    await registerDelegate({ ownerSigner: maker, delegateAddress: makerDelegate.address });
    await registerDelegate({ ownerSigner: taker, delegateAddress: takerDelegate.address });

    assert.equal(await delegateKeyRegistry.isDelegateKeyActive(maker.address, makerDelegate.address, localMarketId, quoteAmount), true);
    assert.equal(await delegateKeyRegistry.hasPermission(maker.address, makerDelegate.address, Permission.PLACE_ORDER), true);
    assert.equal(await delegateKeyRegistry.hasPermission(maker.address, makerDelegate.address, Permission.NO_WITHDRAW), true);
    assert.equal(await delegateKeyRegistry.hasPermission(maker.address, makerDelegate.address, Permission.NO_ADMIN), true);

    const fill = makeFill({ label: 'dk02-valid-delegate-fill', makerNonce: 901n, takerNonce: 902n });
    const signatures = await signFill(fill, { makerSigner: makerDelegate, takerSigner: takerDelegate });
    const receipt = await (await settlement.connect(relayer).settle(fill, signatures.makerSignature, signatures.takerSignature)).wait();
    const tradeEvents = parseEvents(receipt, settlement, 'TradeSettled');

    assert.equal(tradeEvents.length, 1, 'delegate-signed fills should emit exactly one final TradeSettled proof event');
    assert.equal(tradeEvents[0].args.maker, maker.address, 'proof event remains owner-addressed, not delegate-addressed');
    assert.equal(tradeEvents[0].args.taker, taker.address, 'proof event remains owner-addressed, not delegate-addressed');
    assert.equal(await settlement.isNonceUsed(maker.address, fill.makerNonce), true, 'maker owner nonce should be consumed');
    assert.equal(await settlement.isNonceUsed(taker.address, fill.takerNonce), true, 'taker owner nonce should be consumed');
    assert.equal(await settlement.isNonceUsed(makerDelegate.address, fill.makerNonce), false, 'delegate nonce namespace must not be consumed');
    assert.equal(await settlement.isNonceUsed(takerDelegate.address, fill.takerNonce), false, 'delegate nonce namespace must not be consumed');
    assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit - 100n);
    assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), 100n);
    assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit - 200n);
    assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), 200n);
  });

  it('rejects inactive or under-scoped delegate signatures before state changes', async function () {
    const cases = [
      {
        label: 'dk02-maker-missing-place-order',
        setup: async (harness) => {
          await harness.registerDelegate({
            ownerSigner: harness.maker,
            delegateAddress: harness.makerDelegate.address,
            permissions: [Permission.READ_ONLY, Permission.NO_WITHDRAW, Permission.NO_ADMIN],
          });
          await harness.registerDelegate({ ownerSigner: harness.taker, delegateAddress: harness.takerDelegate.address });
        },
        error: /ST_MAKER_SIGNER_UNAUTHORIZED/,
      },
      {
        label: 'dk02-taker-notional-over-cap',
        setup: async (harness) => {
          await harness.registerDelegate({ ownerSigner: harness.maker, delegateAddress: harness.makerDelegate.address });
          await harness.registerDelegate({
            ownerSigner: harness.taker,
            delegateAddress: harness.takerDelegate.address,
            maxNotional: harness.quoteAmount - 1n,
          });
        },
        error: /ST_TAKER_SIGNER_UNAUTHORIZED/,
      },
    ];

    for (const testCase of cases) {
      const harness = await deploySettlementDelegateHarness();
      await testCase.setup(harness);
      const fill = harness.makeFill({ label: testCase.label, makerNonce: 920n, takerNonce: 921n });
      const signatures = await harness.signFill(fill, {
        makerSigner: harness.makerDelegate,
        takerSigner: harness.takerDelegate,
      });

      await expectRejectedBeforeStateChange(harness, fill, signatures, testCase.error);
    }
  });

  it('keeps Settlement delegate signing trade-only with no withdrawal/admin or low-level call surface', async function () {
    const harness = await deploySettlementDelegateHarness();
    const source = await readRepoFile('contracts/src/Settlement.sol');
    const abiFunctionNames = harness.settlement.interface.fragments
      .filter((fragment) => fragment.type === 'function')
      .map((fragment) => fragment.name);

    assert.ok(abiFunctionNames.includes('delegateKeyRegistry'), 'Settlement must expose its local delegate registry for bot-key registration tests');
    assert.match(source, /IDelegateKeyRegistry public immutable delegateKeyRegistry;/, 'delegate registry dependency should be explicit and immutable');
    assert.match(source, /Permission\.PLACE_ORDER/, 'delegate settlement signatures must require PLACE_ORDER');
    assert.match(source, /Permission\.NO_WITHDRAW/, 'delegate settlement signatures must preserve NO_WITHDRAW');
    assert.match(source, /Permission\.NO_ADMIN/, 'delegate settlement signatures must preserve NO_ADMIN');

    for (const forbiddenPattern of [
      /function\s+(withdraw|withdrawFor|adminWithdraw|operatorWithdraw|emergencyWithdraw|rescue|sweep)\b/iu,
      /delegatecall/iu,
      /call\s*\{/iu,
    ]) {
      assert.doesNotMatch(source, forbiddenPattern, `Settlement delegate path must not include ${forbiddenPattern}`);
    }
  });
});
