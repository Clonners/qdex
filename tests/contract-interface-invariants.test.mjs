import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('../', import.meta.url);
const contractsDir = new URL('contracts/src/', repoRoot);

const readContract = (fileName) => readFile(new URL(fileName, contractsDir), 'utf8');

const readAllContracts = async () => {
  const fileNames = (await readdir(contractsDir)).filter((fileName) => fileName.endsWith('.sol'));
  const entries = await Promise.all(
    fileNames.map(async (fileName) => [fileName, await readContract(fileName)]),
  );
  return new Map(entries);
};

test('contract interfaces pin the Quai tooling compiler candidate', async () => {
  const sources = await readAllContracts();

  assert.ok(sources.size >= 6, 'contract interface set should include vault, settlement, nonce, market, fee, and delegate surfaces');

  for (const [fileName, source] of sources) {
    assert.match(source, /pragma solidity 0\.8\.20;/, `${fileName} must pin the current Quai Hardhat candidate compiler`);
    assert.doesNotMatch(source, /0\.8\.24/, `${fileName} must not drift beyond the documented Quai compiler risk window`);
  }
});

test('TradingVault interface preserves the non-custodial withdrawal boundary', async () => {
  const source = await readContract('ITradingVault.sol');

  for (const requiredText of [
    'function deposit(address token, uint256 amount) external;',
    'function withdraw(address token, uint256 amount) external;',
    'function balanceOf(address user, address token) external view returns (uint256);',
    'function availableBalanceOf(address user, address token) external view returns (uint256);',
    'function lockedBalanceOf(address user, address token) external view returns (uint256);',
    'function lockForSettlement(address user, address token, uint256 amount, bytes32 orderHash) external;',
    'function unlockFromSettlement(address user, address token, uint256 amount, bytes32 orderHash) external;',
    'function settleLockedBalance(address debitUser, address creditUser, address token, uint256 amount, bytes32 fillId) external;',
    'event SettlementBalanceMoved(address indexed debitUser, address indexed creditUser, address indexed token, uint256 amount, bytes32 fillId);',
  ]) {
    assert.ok(source.includes(requiredText), `ITradingVault.sol should include ${requiredText}`);
  }

  for (const bannedSelector of [
    'adminWithdraw',
    'operatorWithdraw',
    'emergencyWithdraw',
    'forceWithdraw',
    'withdrawFor',
    'rescueFunds',
    'rescueTokens',
    'sweep',
  ]) {
    assert.doesNotMatch(source, new RegExp(`function\\s+${bannedSelector}\\b`, 'i'), `vault must not expose ${bannedSelector}`);
  }

  assert.doesNotMatch(source, /function\s+withdraw\s*\([^)]*user/i, 'withdraw must only withdraw caller-owned available balance');
});

test('Settlement FillPacket carries replay, price, fee-cap, and event-proof fields', async () => {
  const source = await readContract('ISettlement.sol');

  for (const requiredText of [
    'bytes32 fillId;',
    'bytes32 marketId;',
    'bytes32 makerOrderHash;',
    'bytes32 takerOrderHash;',
    'uint256 price;',
    'uint256 baseAmount;',
    'uint256 quoteAmount;',
    'uint256 makerNonce;',
    'uint256 takerNonce;',
    'uint256 expiresAt;',
    'uint256 chainId;',
    'address settlementContract;',
    'address feeRecipient;',
    'uint256 maxFeeBps;',
    'uint256 makerOrderAmount;',
    'uint256 takerOrderAmount;',
    'uint256 makerFilledAmount;',
    'uint256 takerFilledAmount;',
    'function settle(FillPacket calldata fill, bytes calldata makerSignature, bytes calldata takerSignature) external;',
    'event TradeSettled(',
    'bytes32 indexed fillId,',
    'uint256 price,',
    'address feeRecipient',
  ]) {
    assert.ok(source.includes(requiredText), `ISettlement.sol should include ${requiredText}`);
  }

  assert.doesNotMatch(source, /function\s+(adminWithdraw|operatorWithdraw|emergencyWithdraw|withdrawFor|sweep)\b/i, 'settlement must not expose withdrawal/admin drain selectors');
});

test('supporting interfaces pin nonce, market, fee, and delegate safety invariants', async () => {
  const nonce = await readContract('INonceManager.sol');
  const market = await readContract('IMarketRegistry.sol');
  const fee = await readContract('IFeeManager.sol');
  const delegate = await readContract('IDelegateKeyRegistry.sol');

  for (const requiredText of [
    'function cancelNonce(uint256 nonce) external;',
    'function cancelNonceRange(uint256 from, uint256 to) external;',
    'function isNonceUsed(address user, uint256 nonce) external view returns (bool);',
    'function markNonceUsed(address user, uint256 nonce, bytes32 orderHash) external;',
  ]) {
    assert.ok(nonce.includes(requiredText), `INonceManager.sol should include ${requiredText}`);
  }

  for (const requiredText of [
    'struct MarketInfo',
    'function addMarket(address base, address quote, uint8 pricePrecision, uint8 amountPrecision, uint256 minAmount) external returns (bytes32 marketId);',
    'function disableMarket(bytes32 marketId) external;',
    'function marketInfo(bytes32 marketId) external view returns (MarketInfo memory);',
    'event MarketAdded(bytes32 indexed marketId, address indexed base, address indexed quote, uint8 pricePrecision, uint8 amountPrecision, uint256 minAmount);',
  ]) {
    assert.ok(market.includes(requiredText), `IMarketRegistry.sol should include ${requiredText}`);
  }

  for (const requiredText of [
    'function maxFeeBps() external pure returns (uint256);',
    'function makerFeeBps(bytes32 marketId) external view returns (uint256);',
    'function takerFeeBps(bytes32 marketId) external view returns (uint256);',
    'function updateFees(bytes32 marketId, uint256 makerFeeBps, uint256 takerFeeBps) external;',
    'event FeesUpdated(bytes32 indexed marketId, uint256 makerFeeBps, uint256 takerFeeBps, uint256 maxFeeBps);',
  ]) {
    assert.ok(fee.includes(requiredText), `IFeeManager.sol should include ${requiredText}`);
  }

  for (const requiredText of [
    'enum Permission',
    'READ_ONLY',
    'PLACE_ORDER',
    'CANCEL_ORDER',
    'CANCEL_ALL',
    'NO_WITHDRAW',
    'NO_ADMIN',
    'struct DelegateKey',
    'uint256 expiresAt;',
    'bytes32 allowedMarketsHash;',
    'uint256 maxNotional;',
    'function registerDelegateKey(DelegateKey calldata delegateKey) external;',
    'function revokeDelegateKey(address delegate) external;',
    'function isDelegateKeyActive(address owner, address delegate, bytes32 marketId, uint256 notional) external view returns (bool);',
    'function hasPermission(address owner, address delegate, Permission permission) external view returns (bool);',
  ]) {
    assert.ok(delegate.includes(requiredText), `IDelegateKeyRegistry.sol should include ${requiredText}`);
  }

  assert.doesNotMatch(delegate, /^\s*WITHDRAW\s*,?\s*$/m, 'delegate permissions must not include a positive withdraw capability');
  assert.doesNotMatch(delegate, /^\s*ADMIN\s*,?\s*$/m, 'delegate permissions must not include a positive admin capability');
});
