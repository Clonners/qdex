const assert = require('node:assert/strict');
const { ethers } = require('hardhat');

const BANNED_WITHDRAWAL_SELECTORS = [
  'withdrawFrom',
  'adminWithdraw',
  'operatorWithdraw',
  'emergencyWithdraw',
  'forceWithdraw',
  'rescueFunds',
  'rescueTokens',
  'sweep',
];

async function deployFundedVault() {
  const [deployer, user, operator] = await ethers.getSigners();
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

  return { deployer, user, operator, token, vault, tokenAddress, vaultAddress, userDeposit };
}

describe('TradingVault TV-03 admin/operator custody boundary', function () {
  it('keeps deployer and operator-like accounts unable to withdraw user funds', async function () {
    const { deployer, user, operator, token, vault, tokenAddress, vaultAddress, userDeposit } = await deployFundedVault();

    const functionNames = vault.interface.fragments
      .filter((fragment) => fragment.type === 'function')
      .map((fragment) => fragment.name);

    for (const selector of BANNED_WITHDRAWAL_SELECTORS) {
      assert.equal(functionNames.includes(selector), false, `vault ABI must not expose ${selector}`);
    }

    const withdrawFragment = vault.interface.getFunction('withdraw');
    assert.equal(withdrawFragment.inputs.length, 2, 'withdraw remains caller-owned: token and amount only');
    assert.deepEqual(
      withdrawFragment.inputs.map((input) => input.type),
      ['address', 'uint256'],
      'withdraw must not accept a target user/admin parameter',
    );

    for (const adminLike of [deployer, operator]) {
      await assert.rejects(
        vault.connect(adminLike).withdraw(tokenAddress, userDeposit),
        /TV_AVAILABLE_LOW/,
        `${adminLike.address} must not withdraw against the user's available vault balance`,
      );
    }

    assert.equal(await vault.balanceOf(user.address, tokenAddress), userDeposit, 'user vault balance stays intact');
    assert.equal(await vault.availableBalanceOf(user.address, tokenAddress), userDeposit, 'user available balance stays intact');
    assert.equal(await vault.lockedBalanceOf(user.address, tokenAddress), 0n, 'user locked balance stays untouched');
    assert.equal(await token.balanceOf(user.address), 0n, 'user wallet remains deposited; no unauthorized withdrawal occurred');
    assert.equal(await token.balanceOf(deployer.address), 0n, 'deployer receives no user funds');
    assert.equal(await token.balanceOf(operator.address), 0n, 'operator receives no user funds');
    assert.equal(await token.balanceOf(vaultAddress), userDeposit, 'vault remains fully collateralized for the user deposit');
  });
});
