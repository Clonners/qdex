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

describe('TradingVault TV-04 locked balance withdrawal boundary', function () {
  it('keeps locked settlement balance from leaving through normal user withdraw', async function () {
    const [settlementAuthority, user] = await ethers.getSigners();
    const userDeposit = 1000n;
    const lockedAmount = 700n;
    const availableRemainder = userDeposit - lockedAmount;

    const Token = await ethers.getContractFactory('LocalMockERC20');
    const token = await Token.deploy('Local Mock QUAI', 'LMQ', 18);
    await token.waitForDeployment();

    const Vault = await ethers.getContractFactory('TradingVault');
    const vault = await Vault.deploy();
    await vault.waitForDeployment();

    const tokenAddress = await token.getAddress();
    const vaultAddress = await vault.getAddress();
    const orderHash = ethers.keccak256(ethers.toUtf8Bytes('tv04-order-lock'));

    await token.mint(user.address, userDeposit);
    await token.connect(user).approve(vaultAddress, userDeposit);
    await vault.connect(user).deposit(tokenAddress, userDeposit);

    const lockTx = await vault
      .connect(settlementAuthority)
      .lockForSettlement(user.address, tokenAddress, lockedAmount, orderHash);
    const lockReceipt = await lockTx.wait();

    const lockEvent = findVaultEvent(lockReceipt, vault, 'BalanceLocked');
    assert.ok(lockEvent, 'lockForSettlement should emit BalanceLocked');
    assert.equal(lockEvent.args.user, user.address);
    assert.equal(lockEvent.args.token, tokenAddress);
    assert.equal(lockEvent.args.amount, lockedAmount);

    assert.equal(await vault.balanceOf(user.address, tokenAddress), userDeposit, 'total vault balance includes locked funds');
    assert.equal(await vault.availableBalanceOf(user.address, tokenAddress), availableRemainder, 'available balance excludes locked funds');
    assert.equal(await vault.lockedBalanceOf(user.address, tokenAddress), lockedAmount, 'locked balance tracks settlement hold');

    await assert.rejects(
      vault.connect(user).withdraw(tokenAddress, lockedAmount),
      /TV_AVAILABLE_LOW/,
      'user cannot withdraw the locked portion through the normal caller-owned withdraw path',
    );

    const withdrawTx = await vault.connect(user).withdraw(tokenAddress, availableRemainder);
    const withdrawReceipt = await withdrawTx.wait();
    const withdrawEvent = findVaultEvent(withdrawReceipt, vault, 'Withdraw');
    assert.ok(withdrawEvent, 'user should still be able to withdraw the remaining available balance');
    assert.equal(withdrawEvent.args.user, user.address);
    assert.equal(withdrawEvent.args.token, tokenAddress);
    assert.equal(withdrawEvent.args.amount, availableRemainder);

    assert.equal(await vault.balanceOf(user.address, tokenAddress), lockedAmount, 'only locked funds remain in the vault');
    assert.equal(await vault.availableBalanceOf(user.address, tokenAddress), 0n, 'available balance is exhausted after normal withdrawal');
    assert.equal(await vault.lockedBalanceOf(user.address, tokenAddress), lockedAmount, 'normal withdrawal does not unlock settlement-held funds');
    assert.equal(await token.balanceOf(user.address), availableRemainder, 'wallet only receives the available remainder');
    assert.equal(await token.balanceOf(vaultAddress), lockedAmount, 'vault stays collateralized for locked settlement funds');

    await assert.rejects(
      vault.connect(user).withdraw(tokenAddress, 1n),
      /TV_AVAILABLE_LOW/,
      'locked balance cannot leak out through a later normal withdraw call',
    );
  });
});
