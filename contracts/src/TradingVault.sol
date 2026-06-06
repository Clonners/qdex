// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import {ITradingVault} from "./ITradingVault.sol";

interface IERC20VaultTokenMinimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Local-first non-custodial trading vault implementation.
/// @dev TV-01 covers caller deposits. TV-02 covers caller-owned available withdrawals.
///      TV-03 hardens the admin/operator custody boundary by keeping withdrawals caller-owned only.
///      TV-04 introduced settlement-authority locking. TV-05 gates all settlement hooks and adds
///      local-only unlock/settle accounting without any admin/operator withdrawal surface.
contract TradingVault is ITradingVault {
    mapping(address => mapping(address => uint256)) private availableBalances;
    mapping(address => mapping(address => uint256)) private lockedBalances;

    address public immutable settlementAuthority;

    modifier onlySettlementAuthority() {
        require(msg.sender == settlementAuthority, "TV_SETTLEMENT_ONLY");
        _;
    }

    constructor() {
        settlementAuthority = msg.sender;
    }

    function deposit(address token, uint256 amount) external {
        require(token != address(0), "TV_TOKEN_ZERO");
        require(amount > 0, "TV_AMOUNT_ZERO");

        bool transferred = IERC20VaultTokenMinimal(token).transferFrom(msg.sender, address(this), amount);
        require(transferred, "TV_TRANSFER_IN_FAILED");

        availableBalances[msg.sender][token] += amount;

        emit Deposit(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external {
        require(token != address(0), "TV_TOKEN_ZERO");
        require(amount > 0, "TV_AMOUNT_ZERO");
        require(availableBalances[msg.sender][token] >= amount, "TV_AVAILABLE_LOW");

        availableBalances[msg.sender][token] -= amount;

        bool transferred = IERC20VaultTokenMinimal(token).transfer(msg.sender, amount);
        require(transferred, "TV_TRANSFER_OUT_FAILED");

        emit Withdraw(msg.sender, token, amount);
    }

    function balanceOf(address user, address token) external view returns (uint256) {
        return availableBalances[user][token] + lockedBalances[user][token];
    }

    function availableBalanceOf(address user, address token) external view returns (uint256) {
        return availableBalances[user][token];
    }

    function lockedBalanceOf(address user, address token) external view returns (uint256) {
        return lockedBalances[user][token];
    }

    function lockForSettlement(address user, address token, uint256 amount, bytes32 orderHash) external onlySettlementAuthority {
        _requireUserTokenAmount(user, token, amount);
        require(orderHash != bytes32(0), "TV_ORDER_HASH_ZERO");
        require(availableBalances[user][token] >= amount, "TV_AVAILABLE_LOW");

        availableBalances[user][token] -= amount;
        lockedBalances[user][token] += amount;

        emit BalanceLocked(user, token, amount);
    }

    function unlockFromSettlement(address user, address token, uint256 amount, bytes32 orderHash)
        external
        onlySettlementAuthority
    {
        _requireUserTokenAmount(user, token, amount);
        require(orderHash != bytes32(0), "TV_ORDER_HASH_ZERO");
        require(lockedBalances[user][token] >= amount, "TV_LOCKED_LOW");

        lockedBalances[user][token] -= amount;
        availableBalances[user][token] += amount;

        emit BalanceUnlocked(user, token, amount);
    }

    function settleLockedBalance(address debitUser, address creditUser, address token, uint256 amount, bytes32 fillId)
        external
        onlySettlementAuthority
    {
        require(debitUser != address(0), "TV_DEBIT_USER_ZERO");
        require(creditUser != address(0), "TV_CREDIT_USER_ZERO");
        require(token != address(0), "TV_TOKEN_ZERO");
        require(amount > 0, "TV_AMOUNT_ZERO");
        require(fillId != bytes32(0), "TV_FILL_ID_ZERO");
        require(lockedBalances[debitUser][token] >= amount, "TV_LOCKED_LOW");

        lockedBalances[debitUser][token] -= amount;
        availableBalances[creditUser][token] += amount;

        emit SettlementBalanceMoved(debitUser, creditUser, token, amount, fillId);
    }

    function _requireUserTokenAmount(address user, address token, uint256 amount) private pure {
        require(user != address(0), "TV_USER_ZERO");
        require(token != address(0), "TV_TOKEN_ZERO");
        require(amount > 0, "TV_AMOUNT_ZERO");
    }
}
