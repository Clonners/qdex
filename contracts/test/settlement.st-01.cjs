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

describe('Settlement ST-01 valid signed fill skeleton', function () {
  it('settles a valid signed fill once, moves vault balances, marks nonces, and emits TradeSettled proof truth', async function () {
    const [maker, taker, relayer] = await ethers.getSigners();
    const makerBaseDeposit = 1000n;
    const takerQuoteDeposit = 2000n;
    const baseAmount = 100n;
    const quoteAmount = 200n;
    const makerNonce = 11n;
    const takerNonce = 22n;

    const Settlement = await ethers.getContractFactory('Settlement');
    const settlement = await Settlement.deploy();
    await settlement.waitForDeployment();

    const settlementAddress = await settlement.getAddress();
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
    const fill = {
      fillId: digest('st01-fill'),
      marketId,
      makerOrderHash: digest('st01-maker-order'),
      takerOrderHash: digest('st01-taker-order'),
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
    const fillHash = await settlement.hashFill(fill);
    const makerSignature = await maker.signMessage(ethers.getBytes(fillHash));
    const takerSignature = await taker.signMessage(ethers.getBytes(fillHash));

    const tx = await settlement.connect(relayer).settle(fill, makerSignature, takerSignature);
    const receipt = await tx.wait();
    const tradeEvents = parseEvents(receipt, settlement, 'TradeSettled');
    const movementEvents = parseEvents(receipt, vault, 'SettlementBalanceMoved');

    assert.equal(tradeEvents.length, 1, 'settlement must emit exactly one public proof-triggering TradeSettled event');
    const trade = tradeEvents[0];
    assert.equal(trade.args.fillId, fill.fillId);
    assert.equal(trade.args.marketId, fill.marketId);
    assert.equal(trade.args.makerOrderHash, fill.makerOrderHash);
    assert.equal(trade.args.takerOrderHash, fill.takerOrderHash);
    assert.equal(trade.args.maker, maker.address);
    assert.equal(trade.args.taker, taker.address);
    assert.equal(trade.args.price, fill.price);
    assert.equal(trade.args.baseAmount, baseAmount);
    assert.equal(trade.args.quoteAmount, quoteAmount);
    assert.equal(trade.args.makerFee, 0n);
    assert.equal(trade.args.takerFee, 0n);
    assert.equal(trade.args.feeRecipient, ethers.ZeroAddress);

    assert.equal(movementEvents.length, 2, 'valid settlement should move maker base and taker quote locked balances once each');
    assert.equal(await settlement.isNonceUsed(maker.address, makerNonce), true, 'maker nonce should be marked used');
    assert.equal(await settlement.isNonceUsed(taker.address, takerNonce), true, 'taker nonce should be marked used');

    assert.equal(await vault.availableBalanceOf(maker.address, baseTokenAddress), makerBaseDeposit - baseAmount);
    assert.equal(await vault.lockedBalanceOf(maker.address, baseTokenAddress), 0n);
    assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), baseAmount);
    assert.equal(await vault.lockedBalanceOf(taker.address, baseTokenAddress), 0n);
    assert.equal(await vault.availableBalanceOf(taker.address, quoteTokenAddress), takerQuoteDeposit - quoteAmount);
    assert.equal(await vault.lockedBalanceOf(taker.address, quoteTokenAddress), 0n);
    assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), quoteAmount);
    assert.equal(await vault.lockedBalanceOf(maker.address, quoteTokenAddress), 0n);
    assert.equal(await baseToken.balanceOf(vaultAddress), makerBaseDeposit, 'vault stays collateralized for base token deposits');
    assert.equal(await quoteToken.balanceOf(vaultAddress), takerQuoteDeposit, 'vault stays collateralized for quote token deposits');

    await assert.rejects(
      settlement.connect(relayer).settle(fill, makerSignature, takerSignature),
      /ST_MAKER_NONCE_USED/,
      'replaying the same signed fill must fail before any second vault movement',
    );
    assert.equal(await vault.availableBalanceOf(taker.address, baseTokenAddress), baseAmount, 'replay attempt must not credit base twice');
    assert.equal(await vault.availableBalanceOf(maker.address, quoteTokenAddress), quoteAmount, 'replay attempt must not credit quote twice');
  });
});
