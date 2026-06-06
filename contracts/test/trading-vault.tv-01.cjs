const assert = require('node:assert/strict');
const { ethers } = require('hardhat');

describe('TradingVault TV-01 deposit behavior', function () {
  it('increases the caller-owned available balance and emits Deposit', async function () {
    const [user, otherUser] = await ethers.getSigners();
    const amount = 1000n;

    const Token = await ethers.getContractFactory('LocalMockERC20');
    const token = await Token.deploy('Local Mock QUAI', 'LMQ', 18);
    await token.waitForDeployment();

    const Vault = await ethers.getContractFactory('TradingVault');
    const vault = await Vault.deploy();
    await vault.waitForDeployment();

    const tokenAddress = await token.getAddress();
    const vaultAddress = await vault.getAddress();

    await token.mint(user.address, amount);
    await token.connect(user).approve(vaultAddress, amount);

    const tx = await vault.connect(user).deposit(tokenAddress, amount);
    const receipt = await tx.wait();

    const depositEvent = receipt.logs
      .map((log) => {
        try {
          return vault.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((event) => event?.name === 'Deposit');

    assert.ok(depositEvent, 'deposit should emit the vault Deposit event');
    assert.equal(depositEvent.args.user, user.address);
    assert.equal(depositEvent.args.token, tokenAddress);
    assert.equal(depositEvent.args.amount, amount);

    assert.equal(await vault.balanceOf(user.address, tokenAddress), amount);
    assert.equal(await vault.availableBalanceOf(user.address, tokenAddress), amount);
    assert.equal(await vault.lockedBalanceOf(user.address, tokenAddress), 0n);
    assert.equal(await vault.balanceOf(otherUser.address, tokenAddress), 0n, 'deposit must not credit another user');
    assert.equal(await token.balanceOf(vaultAddress), amount, 'vault should hold exactly the deposited local test token amount');
  });
});
