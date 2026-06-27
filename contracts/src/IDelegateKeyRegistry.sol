// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

/// @notice Trade-only delegate key registry for API keys, SDKs, bots, and autonomous agents.
/// @dev Delegates are explicitly non-withdrawing and non-admin. Withdrawal remains main-wallet authority only.
interface IDelegateKeyRegistry {
    enum Permission {
        READ_ONLY,
        PLACE_ORDER,
        CANCEL_ORDER,
        CANCEL_ALL,
        NO_WITHDRAW,
        NO_ADMIN
    }

    struct DelegateKey {
        address owner;
        address delegate;
        uint256 expiresAt;
        bytes32 allowedMarketsHash;
        uint256 maxNotional;
        Permission[] permissions;
        bool revoked;
    }

    event DelegateKeyRegistered(address indexed owner, address indexed delegate, uint256 expiresAt, bytes32 allowedMarketsHash, uint256 maxNotional);
    event DelegateKeyRevoked(address indexed owner, address indexed delegate);

    function registerDelegateKey(DelegateKey calldata delegateKey) external;
    function revokeDelegateKey(address delegate) external;
    function isDelegateKeyActive(address owner, address delegate, bytes32 marketId, uint256 notional) external view returns (bool);
    function hasPermission(address owner, address delegate, Permission permission) external view returns (bool);
}
