// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

/// @notice Interface for the non-custodial trading vault.
/// @dev Implementations must ensure only users can withdraw their own available balances.
///      Settlement-only functions are balance movement hooks for validated fills, not operator custody.
///      Future withdrawals of available balances must remain caller-owned and not become a broad trading-pause freeze.
interface ITradingVault {
    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdraw(address indexed user, address indexed token, uint256 amount);
    event BalanceLocked(address indexed user, address indexed token, uint256 amount);
    event BalanceUnlocked(address indexed user, address indexed token, uint256 amount);
    event SettlementBalanceMoved(address indexed debitUser, address indexed creditUser, address indexed token, uint256 amount, bytes32 fillId);

    function deposit(address token, uint256 amount) external;
    function withdraw(address token, uint256 amount) external;
    function balanceOf(address user, address token) external view returns (uint256);
    function availableBalanceOf(address user, address token) external view returns (uint256);
    function lockedBalanceOf(address user, address token) external view returns (uint256);

    /// @notice Lock a user's available balance for an accepted signed order.
    /// @dev Implementation must restrict this hook to the authorized settlement/order manager.
    function lockForSettlement(address user, address token, uint256 amount, bytes32 orderHash) external;

    /// @notice Release a previously locked balance when an order is cancelled, expired, or residual IOC amount is released.
    /// @dev Implementation must restrict this hook to the authorized settlement/order manager.
    function unlockFromSettlement(address user, address token, uint256 amount, bytes32 orderHash) external;

    /// @notice Move locked balance after a fill has been validated by settlement rules.
    /// @dev Implementation must restrict this hook to the authorized settlement contract.
    function settleLockedBalance(address debitUser, address creditUser, address token, uint256 amount, bytes32 fillId) external;
}
