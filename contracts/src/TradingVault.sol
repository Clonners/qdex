// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import {ITradingVault} from "./ITradingVault.sol";

interface IERC20TransferFromMinimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Local-first non-custodial trading vault implementation.
/// @dev TV-01 covers caller deposits. Withdrawals and settlement hooks intentionally stay non-operational until their own tests define access control.
contract TradingVault is ITradingVault {
    mapping(address => mapping(address => uint256)) private availableBalances;
    mapping(address => mapping(address => uint256)) private lockedBalances;

    function deposit(address token, uint256 amount) external {
        require(token != address(0), "TV_TOKEN_ZERO");
        require(amount > 0, "TV_AMOUNT_ZERO");

        bool transferred = IERC20TransferFromMinimal(token).transferFrom(msg.sender, address(this), amount);
        require(transferred, "TV_TRANSFER_IN_FAILED");

        availableBalances[msg.sender][token] += amount;

        emit Deposit(msg.sender, token, amount);
    }

    function withdraw(address, uint256) external pure {
        revert("TV_WITHDRAW_NOT_READY");
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

    function lockForSettlement(address, address, uint256, bytes32) external pure {
        revert("TV_SETTLEMENT_HOOK_NOT_READY");
    }

    function unlockFromSettlement(address, address, uint256, bytes32) external pure {
        revert("TV_SETTLEMENT_HOOK_NOT_READY");
    }

    function settleLockedBalance(address, address, address, uint256, bytes32) external pure {
        revert("TV_SETTLEMENT_HOOK_NOT_READY");
    }
}
