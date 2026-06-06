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
///      TV-04 introduces the first local settlement-authority lock path; unlock/settle stay gated for later ratchets.
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
        require(user != address(0), "TV_USER_ZERO");
        require(token != address(0), "TV_TOKEN_ZERO");
        require(amount > 0, "TV_AMOUNT_ZERO");
        require(orderHash != bytes32(0), "TV_ORDER_HASH_ZERO");
        require(availableBalances[user][token] >= amount, "TV_AVAILABLE_LOW");

        availableBalances[user][token] -= amount;
        lockedBalances[user][token] += amount;

        emit BalanceLocked(user, token, amount);
    }

    function unlockFromSettlement(address, address, uint256, bytes32) external pure {
        revert("TV_SETTLEMENT_HOOK_NOT_READY");
    }

    function settleLockedBalance(address, address, address, uint256, bytes32) external pure {
        revert("TV_SETTLEMENT_HOOK_NOT_READY");
    }
}
