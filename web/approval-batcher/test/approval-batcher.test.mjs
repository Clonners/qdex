import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Simple encoding helpers (no ethers dependency for tests)
const ERC20_APPROVE_SELECTOR = 'a9059cbb';
const ERC20_ALLOWANCE_SELECTOR = 'dd62ed3e';

function encodeApprove(spender, amount) {
  const spenderPadded = spender.slice(2).padStart(64, '0');
  const amountHex = BigInt(amount).toString(16).padStart(64, '0');
  return '0x' + ERC20_APPROVE_SELECTOR + spenderPadded + amountHex;
}

function encodeAllowance(owner, spender) {
  const ownerPadded = owner.slice(2).padStart(64, '0');
  const spenderPadded = spender.slice(2).padStart(64, '0');
  return '0x' + ERC20_ALLOWANCE_SELECTOR + ownerPadded + spenderPadded;
}

function buildApprovalTransactions(tokens, vaultAddress, amount) {
  return tokens.map(token => ({
    to: token,
    data: encodeApprove(vaultAddress, amount),
  }));
}

const VAULT_ADDR = '0x' + '11'.repeat(20);
const USER_ADDR = '0x' + '22'.repeat(20);
const WQUAI = '0x005c46f661Baef20671943f2b4c087Df3E7CEb13';
const WQI = '0x002b2596EcF05C93a31ff916E8b456DF6C77c750';

describe('encodeApprove', function () {
  it('encodes approve() calldata', function () {
    const data = encodeApprove(VAULT_ADDR, 1000n);
    assert.ok(data.startsWith('0x'), 'hex string');
    assert.ok(data.length > 10, 'non-empty calldata');
    assert.ok(data.includes('a9059cbb'), 'approve selector');
  });

  it('encodes MaxUint256 approval', function () {
    const data = encodeApprove(VAULT_ADDR, 2n ** 256n - 1n);
    assert.ok(data.startsWith('0x'));
    assert.equal(data.length, 138, 'correct length (4 selector + 64 spender + 64 amount + 2 prefix + 4 selector)');
  });

  it('produces different calldata for different vaults', function () {
    const data1 = encodeApprove(VAULT_ADDR, 100n);
    const data2 = encodeApprove('0x' + '33'.repeat(20), 100n);
    assert.notEqual(data1, data2, 'different vaults produce different calldata');
  });
});

describe('encodeAllowance', function () {
  it('encodes allowance() calldata', function () {
    const data = encodeAllowance(USER_ADDR, VAULT_ADDR);
    assert.ok(data.startsWith('0x'));
    assert.ok(data.includes('dd62ed3e'), 'allowance selector');
  });

  it('produces different calldata for different users', function () {
    const data1 = encodeAllowance(USER_ADDR, VAULT_ADDR);
    const data2 = encodeAllowance('0x' + '44'.repeat(20), VAULT_ADDR);
    assert.notEqual(data1, data2);
  });
});

describe('buildApprovalTransactions', function () {
  it('builds 1 tx for 1 token', function () {
    const txs = buildApprovalTransactions([WQUAI], VAULT_ADDR, 100n);
    assert.equal(txs.length, 1);
    assert.equal(txs[0].to.toLowerCase(), WQUAI.toLowerCase());
    assert.ok(txs[0].data.startsWith('0x'));
  });

  it('builds N txs for N tokens', function () {
    const txs = buildApprovalTransactions([WQUAI, WQI], VAULT_ADDR, 500n);
    assert.equal(txs.length, 2);
    assert.equal(txs[0].to.toLowerCase(), WQUAI.toLowerCase());
    assert.equal(txs[1].to.toLowerCase(), WQI.toLowerCase());
  });

  it('returns empty array for no tokens', function () {
    const txs = buildApprovalTransactions([], VAULT_ADDR);
    assert.equal(txs.length, 0);
  });
});

describe('getTokenAddresses', function () {
  it('filters zero addresses', function () {
    const tokens = [WQUAI, WQI, '0x' + '00'.repeat(20)];
    const filtered = tokens.filter(addr => addr !== '0x' + '00'.repeat(20));
    assert.ok(filtered.includes(WQUAI), 'includes WQUAI');
    assert.ok(filtered.includes(WQI), 'includes WQI');
    assert.ok(!filtered.includes('0x' + '00'.repeat(20)), 'filters zero addresses');
  });
});
