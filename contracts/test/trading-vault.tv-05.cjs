const assert = require('node:assert/strict');
const { ethers } = require('hardhat');

function findVaultEvent(receipt, vault, eventName) {
  return receipt.logs
    .map((log) => {
      try {
        return vault.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((event) => event?.name === eventName);
}

async function deployFundedVault() {
  const [settlementAuthority, user, unauthorized, counterparty] = await ethers.getSigners();
  const userDeposit = 1000n;

  const Token = await ethers.getContractFactory('LocalMockERC20');
  const token = await Token.deploy('Local Mock QUAI', 'LMQ', 18);
  await token.waitForDeployment();

  const Vault = await ethers.getContractFactory('TradingVault');
  const vault = await Vault.deploy();
  await vault.waitForDeployment();

  const tokenAddress = await token.getAddress();
  const vaultAddress = await vault.getAddress();

  await token.mint(user.address, userDeposit);
  await token.connect(user).approve(vaultAddress, userDeposit);
  await vault.connect(user).deposit(tokenAddress, userDeposit);

  return {
    settlementAuthority,
    user,
    unauthorized,
    counterparty,
    token,
    vault,
    tokenAddress,
    vaultAddress,
    userDeposit,
  };
}

describe('TradingVault TV-05 settlement hook authorization', function () {
  it('rejects non-settlement callers for lock, unlock, and settlement movement hooks', async function () {
    const { settlementAuthority, user, unauthorized, counterparty, token, vault, tokenAddress, vaultAddress, userDeposit } =
      await deployFundedVault();
    const lockedAmount = 600n;
    const availableRemainder = userDeposit - lockedAmount;
    const orderHash = ethers.keccak256(ethers.toUtf8Bytes('tv05-authorized-lock'));
    const unauthorizedOrderHash = ethers.keccak256(ethers.toUtf8Bytes('tv05-unauthorized-lock'));
    const fillId = ethers.keccak256(ethers.toUtf8Bytes('tv05-unauthorized-fill'));

    await vault.connect(settlementAuthority).lockForSettlement(user.address, tokenAddress, lockedAmount, orderHash);

    await assert.rejects(
      vault.connect(unauthorized).lockForSettlement(user.address, tokenAddress, 1n, unauthorizedOrderHash),
      /TV_SETTLEMENT_ONLY/,
      'only the explicit settlement authority can lock user funds for settlement',
    );
    await assert.rejects(
      vault.connect(unauthorized).unlockFromSettlement(user.address, tokenAddress, 1n, orderHash),
      /TV_SETTLEMENT_ONLY/,
      'only the explicit settlement authority can unlock settlement-held funds',
    );
    await assert.rejects(
      vault.connect(unauthorized).settleLockedBalance(user.address, counterparty.address, tokenAddress, 1n, fillId),
      /TV_SETTLEMENT_ONLY/,
      'only the explicit settlement authority can move locked funds after settlement validation',
    );

    assert.equal(await vault.availableBalanceOf(user.address, tokenAddress), availableRemainder, 'unauthorized hooks do not debit available balance');
    assert.equal(await vault.lockedBalanceOf(user.address, tokenAddress), lockedAmount, 'unauthorized hooks do not change locked balance');
    assert.equal(await vault.balanceOf(counterparty.address, tokenAddress), 0n, 'unauthorized settlement movement does not credit another user');
    assert.equal(await token.balanceOf(vaultAddress), userDeposit, 'vault stays collateralized after rejected hook calls');
  });

  it('unlocks settlement-held balances only for valid settlement-authority inputs', async function () {
    const { settlementAuthority, user, token, vault, tokenAddress, vaultAddress, userDeposit } = await deployFundedVault();
    const lockedAmount = 700n;
    const unlockAmount = 250n;
    const orderHash = ethers.keccak256(ethers.toUtf8Bytes('tv05-unlock-order'));

    await vault.connect(settlementAuthority).lockForSettlement(user.address, tokenAddress, lockedAmount, orderHash);

    await assert.rejects(
      vault.connect(settlementAuthority).unlockFromSettlement(user.address, tokenAddress, lockedAmount + 1n, orderHash),
      /TV_LOCKED_LOW/,
      'settlement authority cannot unlock more than the held locked balance',
    );
    await assert.rejects(
      vault.connect(settlementAuthority).unlockFromSettlement(user.address, tokenAddress, 1n, ethers.ZeroHash),
      /TV_ORDER_HASH_ZERO/,
      'unlock requires a non-zero order hash for proof/indexer traceability',
    );

    const unlockTx = await vault
      .connect(settlementAuthority)
      .unlockFromSettlement(user.address, tokenAddress, unlockAmount, orderHash);
    const unlockReceipt = await unlockTx.wait();
    const unlockEvent = findVaultEvent(unlockReceipt, vault, 'BalanceUnlocked');

    assert.ok(unlockEvent, 'unlockFromSettlement should emit BalanceUnlocked');
    assert.equal(unlockEvent.args.user, user.address);
    assert.equal(unlockEvent.args.token, tokenAddress);
    assert.equal(unlockEvent.args.amount, unlockAmount);

    assert.equal(await vault.balanceOf(user.address, tokenAddress), userDeposit, 'unlock keeps the same total user vault balance');
    assert.equal(
      await vault.availableBalanceOf(user.address, tokenAddress),
      userDeposit - lockedAmount + unlockAmount,
      'unlock returns held funds to caller-owned available balance',
    );
    assert.equal(await vault.lockedBalanceOf(user.address, tokenAddress), lockedAmount - unlockAmount, 'unlock reduces only locked balance');
    assert.equal(await token.balanceOf(vaultAddress), userDeposit, 'unlock is internal accounting and sends no tokens out');
  });

  it('settles locked balances to another user only for valid settlement-authority inputs', async function () {
    const { settlementAuthority, user, counterparty, token, vault, tokenAddress, vaultAddress, userDeposit } =
      await deployFundedVault();
    const lockedAmount = 700n;
    const settledAmount = 300n;
    const orderHash = ethers.keccak256(ethers.toUtf8Bytes('tv05-settle-order'));
    const fillId = ethers.keccak256(ethers.toUtf8Bytes('tv05-settle-fill'));

    await vault.connect(settlementAuthority).lockForSettlement(user.address, tokenAddress, lockedAmount, orderHash);

    await assert.rejects(
      vault.connect(settlementAuthority).settleLockedBalance(user.address, counterparty.address, tokenAddress, lockedAmount + 1n, fillId),
      /TV_LOCKED_LOW/,
      'settlement authority cannot settle more than the held locked balance',
    );
    await assert.rejects(
      vault.connect(settlementAuthority).settleLockedBalance(user.address, counterparty.address, tokenAddress, 1n, ethers.ZeroHash),
      /TV_FILL_ID_ZERO/,
      'settlement movement requires a non-zero fill id for proof/indexer traceability',
    );

    const settleTx = await vault
      .connect(settlementAuthority)
      .settleLockedBalance(user.address, counterparty.address, tokenAddress, settledAmount, fillId);
    const settleReceipt = await settleTx.wait();
    const settleEvent = findVaultEvent(settleReceipt, vault, 'SettlementBalanceMoved');

    assert.ok(settleEvent, 'settleLockedBalance should emit SettlementBalanceMoved');
    assert.equal(settleEvent.args.debitUser, user.address);
    assert.equal(settleEvent.args.creditUser, counterparty.address);
    assert.equal(settleEvent.args.token, tokenAddress);
    assert.equal(settleEvent.args.amount, settledAmount);
    assert.equal(settleEvent.args.fillId, fillId);

    assert.equal(await vault.availableBalanceOf(user.address, tokenAddress), userDeposit - lockedAmount, 'settlement does not touch debit user availability');
    assert.equal(await vault.lockedBalanceOf(user.address, tokenAddress), lockedAmount - settledAmount, 'settlement debits locked funds');
    assert.equal(await vault.balanceOf(user.address, tokenAddress), userDeposit - settledAmount, 'debit user total reflects settled transfer');
    assert.equal(await vault.availableBalanceOf(counterparty.address, tokenAddress), settledAmount, 'credit user receives available vault balance');
    assert.equal(await vault.lockedBalanceOf(counterparty.address, tokenAddress), 0n, 'credit user does not receive locked funds');
    assert.equal(await token.balanceOf(vaultAddress), userDeposit, 'settlement movement stays internal to the non-custodial vault');
  });
});
