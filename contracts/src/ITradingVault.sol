// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @notice Placeholder interface for the non-custodial vault.
/// @dev This is intentionally not production code yet. It documents the MVP surface.
interface ITradingVault {
    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdraw(address indexed user, address indexed token, uint256 amount);
    event BalanceLocked(address indexed user, address indexed token, uint256 amount);
    event BalanceUnlocked(address indexed user, address indexed token, uint256 amount);

    function deposit(address token, uint256 amount) external;
    function withdraw(address token, uint256 amount) external;
    function balanceOf(address user, address token) external view returns (uint256);
    function availableBalanceOf(address user, address token) external view returns (uint256);
    function lockedBalanceOf(address user, address token) external view returns (uint256);
}
