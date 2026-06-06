// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import {IDelegateKeyRegistry} from "./IDelegateKeyRegistry.sol";

/// @notice Local-only trade delegate registry for bots and SDK/API keys.
/// @dev DK-01 keeps delegate authority owner-registered, time-boxed, market/notional-scoped, and explicitly non-withdrawing/non-administrative.
contract DelegateKeyRegistry is IDelegateKeyRegistry {
    struct StoredDelegateKey {
        uint256 expiresAt;
        bytes32 allowedMarketsHash;
        uint256 maxNotional;
        bool registered;
        bool revoked;
    }

    mapping(address => mapping(address => StoredDelegateKey)) private delegateKeys;
    mapping(address => mapping(address => mapping(Permission => bool))) private permissionEnabled;

    function registerDelegateKey(DelegateKey calldata delegateKey) external {
        require(delegateKey.owner != address(0), "DK_OWNER_ZERO");
        require(delegateKey.delegate != address(0), "DK_DELEGATE_ZERO");
        require(delegateKey.owner != delegateKey.delegate, "DK_DELEGATE_SELF_INVALID");
        require(msg.sender == delegateKey.owner, "DK_OWNER_ONLY");
        require(delegateKey.expiresAt > block.timestamp, "DK_EXPIRES_AT_NOT_FUTURE");
        require(delegateKey.allowedMarketsHash != bytes32(0), "DK_ALLOWED_MARKETS_EMPTY");
        require(delegateKey.maxNotional > 0, "DK_MAX_NOTIONAL_ZERO");
        require(!delegateKey.revoked, "DK_REGISTERED_REVOKED");

        _clearPermissions(delegateKey.owner, delegateKey.delegate);
        (bool hasNoWithdraw, bool hasNoAdmin) = _recordPermissions(delegateKey);
        require(hasNoWithdraw, "DK_NO_WITHDRAW_REQUIRED");
        require(hasNoAdmin, "DK_NO_ADMIN_REQUIRED");

        delegateKeys[delegateKey.owner][delegateKey.delegate] = StoredDelegateKey({
            expiresAt: delegateKey.expiresAt,
            allowedMarketsHash: delegateKey.allowedMarketsHash,
            maxNotional: delegateKey.maxNotional,
            registered: true,
            revoked: false
        });

        emit DelegateKeyRegistered(
            delegateKey.owner,
            delegateKey.delegate,
            delegateKey.expiresAt,
            delegateKey.allowedMarketsHash,
            delegateKey.maxNotional
        );
    }

    function revokeDelegateKey(address delegate) external {
        StoredDelegateKey storage delegateKey = delegateKeys[msg.sender][delegate];
        require(delegateKey.registered && !delegateKey.revoked, "DK_DELEGATE_KEY_INACTIVE");

        delegateKey.revoked = true;
        _clearPermissions(msg.sender, delegate);

        emit DelegateKeyRevoked(msg.sender, delegate);
    }

    function isDelegateKeyActive(address owner, address delegate, bytes32 marketId, uint256 notional)
        external
        view
        returns (bool)
    {
        if (marketId == bytes32(0)) {
            return false;
        }

        StoredDelegateKey storage delegateKey = delegateKeys[owner][delegate];
        if (!_isStoredKeyActive(delegateKey)) {
            return false;
        }
        if (notional > delegateKey.maxNotional) {
            return false;
        }
        if (delegateKey.allowedMarketsHash != _singleMarketHash(marketId)) {
            return false;
        }

        return permissionEnabled[owner][delegate][Permission.NO_WITHDRAW]
            && permissionEnabled[owner][delegate][Permission.NO_ADMIN];
    }

    function hasPermission(address owner, address delegate, Permission permission) external view returns (bool) {
        StoredDelegateKey storage delegateKey = delegateKeys[owner][delegate];
        if (!_isStoredKeyActive(delegateKey)) {
            return false;
        }

        return permissionEnabled[owner][delegate][permission];
    }

    function _isStoredKeyActive(StoredDelegateKey storage delegateKey) private view returns (bool) {
        return delegateKey.registered && !delegateKey.revoked && block.timestamp < delegateKey.expiresAt;
    }

    function _recordPermissions(DelegateKey calldata delegateKey) private returns (bool hasNoWithdraw, bool hasNoAdmin) {
        for (uint256 index = 0; index < delegateKey.permissions.length; index++) {
            Permission permission = delegateKey.permissions[index];
            permissionEnabled[delegateKey.owner][delegateKey.delegate][permission] = true;

            if (permission == Permission.NO_WITHDRAW) {
                hasNoWithdraw = true;
            }
            if (permission == Permission.NO_ADMIN) {
                hasNoAdmin = true;
            }
        }
    }

    function _clearPermissions(address owner, address delegate) private {
        for (uint8 permission = uint8(Permission.READ_ONLY); permission <= uint8(Permission.NO_ADMIN); permission++) {
            permissionEnabled[owner][delegate][Permission(permission)] = false;
        }
    }

    /// @dev DK-01 supports a single allowed market per delegate key; wider allowlists can replace this hash rule in a later ratchet.
    function _singleMarketHash(bytes32 marketId) private pure returns (bytes32) {
        return keccak256(abi.encode(marketId));
    }
}
