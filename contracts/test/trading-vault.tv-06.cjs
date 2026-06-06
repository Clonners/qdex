const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { ethers } = require('hardhat');

const BANNED_WITHDRAWAL_FREEZE_SELECTORS = [
  'pauseWithdrawals',
  'freezeWithdrawals',
  'setWithdrawalsPaused',
  'setWithdrawalFreeze',
  'adminWithdraw',
  'operatorWithdraw',
  'emergencyWithdraw',
  'withdrawFrom',
  'rescueFunds',
  'rescueTokens',
  'sweep',
];

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

function extractFunctionBody(source, functionName) {
  const signatureIndex = source.indexOf(`function ${functionName}(`);
  assert.notEqual(signatureIndex, -1, `${functionName} function must exist`);

  const bodyStart = source.indexOf('{', signatureIndex);
  assert.notEqual(bodyStart, -1, `${functionName} function must have a body`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }

  assert.fail(`${functionName} function body is not closed`);
}

async function deployFundedVault() {
  const [settlementAuthority, user] = await ethers.getSigners();
  const userDeposit = 1000n;
  const lockedAmount = 400n;

  const Token = await ethers.getContractFactory('LocalMockERC20');
  const token = await Token.deploy('Local Mock QUAI', 'LMQ', 18);
  await token.waitForDeployment();

  const Vault = await ethers.getContractFactory('TradingVault');
  const vault = await Vault.deploy();
  await vault.waitForDeployment();

  const tokenAddress = await token.getAddress();
  const vaultAddress = await vault.getAddress();
  const orderHash = ethers.keccak256(ethers.toUtf8Bytes('tv06-withdrawal-boundary-order'));

  await token.mint(user.address, userDeposit);
  await token.connect(user).approve(vaultAddress, userDeposit);
  await vault.connect(user).deposit(tokenAddress, userDeposit);
  await vault.connect(settlementAuthority).lockForSettlement(user.address, tokenAddress, lockedAmount, orderHash);

  return { user, token, vault, tokenAddress, vaultAddress, userDeposit, lockedAmount };
}

function readContractSource(fileName) {
  return readFileSync(path.join(__dirname, '..', 'src', fileName), 'utf8');
}

describe('TradingVault TV-06 pause/withdrawal-freeze boundary', function () {
  it('keeps caller-owned available withdrawals possible independently from trading pause concepts', async function () {
    const { user, token, vault, tokenAddress, vaultAddress, userDeposit, lockedAmount } = await deployFundedVault();
    const availableAmount = userDeposit - lockedAmount;

    const withdrawTx = await vault.connect(user).withdraw(tokenAddress, availableAmount);
    const withdrawReceipt = await withdrawTx.wait();
    const withdrawEvent = findVaultEvent(withdrawReceipt, vault, 'Withdraw');

    assert.ok(withdrawEvent, 'available withdrawal should remain a normal caller-owned exit path');
    assert.equal(withdrawEvent.args.user, user.address);
    assert.equal(withdrawEvent.args.token, tokenAddress);
    assert.equal(withdrawEvent.args.amount, availableAmount);
    assert.equal(await token.balanceOf(user.address), availableAmount, 'caller receives only their available unlocked funds');
    assert.equal(await vault.availableBalanceOf(user.address, tokenAddress), 0n, 'available balance is exhausted by caller withdrawal');
    assert.equal(await vault.lockedBalanceOf(user.address, tokenAddress), lockedAmount, 'locked settlement balance remains locked');
    assert.equal(await token.balanceOf(vaultAddress), lockedAmount, 'vault remains collateralized for locked funds');
  });

  it('ratchets the source so future pause controls cannot become a broad withdrawal freeze', function () {
    const vaultSource = readContractSource('TradingVault.sol');
    const interfaceSource = readContractSource('ITradingVault.sol');
    const withdrawBody = extractFunctionBody(vaultSource, 'withdraw');

    assert.match(
      vaultSource,
      /TV-06[^\n]+available withdrawals must not be gated by trading pause/i,
      'implementation source should carry the TV-06 withdrawal-freeze boundary marker',
    );
    assert.match(
      interfaceSource,
      /withdrawals of available balances must remain caller-owned and not become a broad trading-pause freeze/i,
      'vault interface should document the public non-custodial withdrawal boundary',
    );

    for (const selector of BANNED_WITHDRAWAL_FREEZE_SELECTORS) {
      assert.doesNotMatch(vaultSource, new RegExp(`function\\s+${selector}\\b`, 'i'), `vault must not expose ${selector}`);
    }

    assert.doesNotMatch(
      withdrawBody,
      /\b(whenNotPaused|whenPaused|paused|tradingPaused|withdrawalsPaused|freeze|halt|onlyOwner|onlyAdmin|onlyOperator)\b/i,
      'withdraw must not depend on broad pause/admin/operator gates; only caller-owned available balance may limit this path',
    );
    assert.match(
      withdrawBody,
      /availableBalances\[msg\.sender\]\[token\]\s*>=\s*amount/,
      'withdraw should remain bounded by msg.sender available balance',
    );
    assert.match(withdrawBody, /transfer\(msg\.sender, amount\)/, 'withdraw should transfer only to msg.sender');
  });
});
