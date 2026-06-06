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

describe('TradingVault TV-02 withdraw behavior', function () {
  it('lets a caller withdraw only their own available balance and emits Withdraw', async function () {
    const [user, otherUser] = await ethers.getSigners();
    const userDeposit = 1000n;
    const otherDeposit = 500n;
    const withdrawAmount = 400n;

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

    await token.mint(otherUser.address, otherDeposit);
    await token.connect(otherUser).approve(vaultAddress, otherDeposit);
    await vault.connect(otherUser).deposit(tokenAddress, otherDeposit);

    const tx = await vault.connect(user).withdraw(tokenAddress, withdrawAmount);
    const receipt = await tx.wait();

    const withdrawEvent = findVaultEvent(receipt, vault, 'Withdraw');
    assert.ok(withdrawEvent, 'withdraw should emit the vault Withdraw event');
    assert.equal(withdrawEvent.args.user, user.address);
    assert.equal(withdrawEvent.args.token, tokenAddress);
    assert.equal(withdrawEvent.args.amount, withdrawAmount);

    assert.equal(await vault.balanceOf(user.address, tokenAddress), userDeposit - withdrawAmount);
    assert.equal(await vault.availableBalanceOf(user.address, tokenAddress), userDeposit - withdrawAmount);
    assert.equal(await vault.lockedBalanceOf(user.address, tokenAddress), 0n);
    assert.equal(await token.balanceOf(user.address), withdrawAmount);

    assert.equal(await vault.balanceOf(otherUser.address, tokenAddress), otherDeposit, 'withdraw must not debit another user');
    assert.equal(await vault.availableBalanceOf(otherUser.address, tokenAddress), otherDeposit, 'other user availability must stay untouched');
    assert.equal(await token.balanceOf(otherUser.address), 0n, 'other user did not withdraw local test tokens');
    assert.equal(await token.balanceOf(vaultAddress), userDeposit + otherDeposit - withdrawAmount);

    await assert.rejects(
      vault.connect(user).withdraw(tokenAddress, userDeposit),
      /TV_AVAILABLE_LOW/,
      'caller cannot withdraw pooled tokens beyond their own available balance',
    );
  });
});
