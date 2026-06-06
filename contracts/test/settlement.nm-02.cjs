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

async function deploySettlementNonceHarness() {
  const [maker, taker, relayer] = await ethers.getSigners();
  const makerBaseDeposit = 1000n;
  const takerQuoteDeposit = 2000n;
  const baseAmount = 100n;
  const price = 2n;
  const quoteAmount = baseAmount * price;

  const Settlement = await ethers.getContractFactory('Settlement');
  const settlement = await Settlement.deploy();
  await settlement.waitForDeployment();

  const settlementAddress = await settlement.getAddress();
  const nonceManagerAddress = await settlement.nonceManager();
  const nonceManager = await ethers.getContractAt('NonceManager', nonceManagerAddress);
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
  await marketRegistry.connect(maker).addMarket(baseTokenAddress, quoteTokenAddress, 1, 1, 1n);
  const block = await ethers.provider.getBlock('latest');
  const network = await ethers.provider.getNetwork();

  function makeFill({ label, makerNonce, takerNonce, overrides = {} }) {
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

  return {
    maker,
    taker,
    relayer,
    settlement,
    nonceManager,
    settlementAddress,
    vault,
    baseTokenAddress,
    quoteTokenAddress,
    makerBaseDeposit,
    takerQuoteDeposit,
    makeFill,
    signFill,
  };
}

describe('Settlement NM-02 external NonceManager wiring', function () {
  it('uses its deployed NonceManager as settlement-scoped nonce truth for user cancellations', async function () {
    const harness = await deploySettlementNonceHarness();
    const {
      maker,
      taker,
      relayer,
      settlement,
      nonceManager,
      settlementAddress,
      vault,
      baseTokenAddress,
      quoteTokenAddress,
      makerBaseDeposit,
      takerQuoteDeposit,
      makeFill,
      signFill,
    } = harness;

    assert.equal(await nonceManager.settlementAuthority(), settlementAddress, 'NonceManager must authorize only its Settlement');
    assert.equal(await settlement.isNonceUsed(maker.address, 77n), false);
    assert.equal(await nonceManager.isNonceUsed(maker.address, 77n), false);

    const cancelTx = await nonceManager.connect(maker).cancelNonce(77n);
    const cancelReceipt = await cancelTx.wait();
    const cancelEvents = parseEvents(cancelReceipt, nonceManager, 'NonceCancelled');
    assert.equal(cancelEvents.length, 1, 'user cancellation should emit from the NonceManager dependency');
    assert.equal(cancelEvents[0].args.user, maker.address);
    assert.equal(cancelEvents[0].args.nonce, 77n);
    assert.equal(await settlement.isNonceUsed(maker.address, 77n), true, 'Settlement nonce view must mirror NonceManager truth');

    const fill = makeFill({ label: 'nm02-maker-cancelled', makerNonce: 77n, takerNonce: 78n });
    const signatures = await signFill(fill);
    await assert.rejects(
      settlement.connect(relayer).settle(fill, signatures.makerSignature, signatures.takerSignature),
      /ST_MAKER_NONCE_USED/,
      'Settlement must reject NonceManager-cancelled maker nonces before vault movement',
    );

    assert.equal(await settlement.isNonceUsed(taker.address, 78n), false, 'failed maker-cancelled fill must not consume taker nonce');
    assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit, 'cancelled nonce attempts must not debit maker base');
    assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit, 'cancelled nonce attempts must not debit taker quote');
  });

  it('marks fully filled owner nonces through NonceManager and emits dependency replay events', async function () {
    const harness = await deploySettlementNonceHarness();
    const { maker, taker, relayer, settlement, nonceManager, makeFill, signFill } = harness;

    const fill = makeFill({ label: 'nm02-valid-full-fill', makerNonce: 810n, takerNonce: 811n });
    const signatures = await signFill(fill);
    const receipt = await (await settlement.connect(relayer).settle(fill, signatures.makerSignature, signatures.takerSignature)).wait();
    const nonceUsedEvents = parseEvents(receipt, nonceManager, 'NonceUsed');

    assert.equal(nonceUsedEvents.length, 2, 'a full fill should emit maker and taker NonceUsed events from NonceManager');
    assert.deepEqual(
      nonceUsedEvents.map((event) => [event.args.user, event.args.nonce, event.args.orderHash]),
      [
        [maker.address, 810n, fill.makerOrderHash],
        [taker.address, 811n, fill.takerOrderHash],
      ],
    );
    assert.equal(await nonceManager.isNonceUsed(maker.address, 810n), true, 'maker nonce truth lives in NonceManager');
    assert.equal(await nonceManager.isNonceUsed(taker.address, 811n), true, 'taker nonce truth lives in NonceManager');
    assert.equal(await settlement.isNonceUsed(maker.address, 810n), true, 'Settlement view mirrors the dependency after full fill');
    assert.equal(await settlement.isNonceUsed(taker.address, 811n), true, 'Settlement view mirrors the dependency after full fill');
  });

  it('keeps Settlement nonce wiring dependency-scoped with no cancellation or custody surface', async function () {
    const { settlement } = await deploySettlementNonceHarness();
    const source = await readRepoFile('contracts/src/Settlement.sol');
    const abiFunctionNames = settlement.interface.fragments
      .filter((fragment) => fragment.type === 'function')
      .map((fragment) => fragment.name);

    assert.ok(abiFunctionNames.includes('nonceManager'), 'Settlement must expose its local nonce manager dependency');
    assert.ok(abiFunctionNames.includes('isNonceUsed'), 'Settlement may expose a read-only nonce mirror for existing tests/API proofs');
    assert.ok(!abiFunctionNames.includes('cancelNonce'), 'user cancellation must live on NonceManager, not Settlement wrappers');
    assert.ok(!abiFunctionNames.includes('cancelNonceRange'), 'range cancellation must live on NonceManager, not Settlement wrappers');
    assert.match(source, /INonceManager public immutable nonceManager;/, 'nonce manager dependency should be explicit and immutable');
    assert.match(source, /new NonceManager\(address\(this\)\)/, 'local Settlement must deploy its own settlement-authorized NonceManager');
    assert.doesNotMatch(source, /mapping\(address => mapping\(uint256 => bool\)\) private usedNonces;/, 'Settlement must not keep a second embedded nonce-truth map');

    for (const forbiddenPattern of [
      /function\s+(withdraw|withdrawFor|adminWithdraw|operatorWithdraw|emergencyWithdraw|rescue|sweep)\b/iu,
      /delegatecall/iu,
      /call\s*\{/iu,
      /cancelNonceFor/u,
      /cancelAllFor/u,
    ]) {
      assert.doesNotMatch(source, forbiddenPattern, `Settlement nonce integration must not include ${forbiddenPattern}`);
    }
  });
});
