// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import {INonceManager} from "./INonceManager.sol";

/// @notice Local-only replay protection for signed orders.
/// @dev NM-01 keeps cancellation user-owned and nonce consumption restricted to the settlement contract.
contract NonceManager is INonceManager {
    uint256 public constant MAX_CANCEL_RANGE_SIZE = 256;

    address public immutable settlementAuthority;

    mapping(address => mapping(uint256 => bool)) private unavailableNonces;

    constructor(address settlementAuthority_) {
        require(settlementAuthority_ != address(0), "NM_SETTLEMENT_ZERO");
        settlementAuthority = settlementAuthority_;
    }

    function cancelNonce(uint256 nonce) external {
        _markUnavailable(msg.sender, nonce);
        emit NonceCancelled(msg.sender, nonce);
    }

    function cancelNonceRange(uint256 from, uint256 to) external {
        require(from <= to, "NM_NONCE_RANGE_INVALID");
        require(to - from < MAX_CANCEL_RANGE_SIZE, "NM_NONCE_RANGE_TOO_LARGE");

        for (uint256 nonce = from; ; nonce++) {
            _markUnavailable(msg.sender, nonce);
            if (nonce == to) {
                break;
            }
        }

        emit NonceRangeCancelled(msg.sender, from, to);
    }

    function isNonceUsed(address user, uint256 nonce) external view returns (bool) {
        return unavailableNonces[user][nonce];
    }

    function markNonceUsed(address user, uint256 nonce, bytes32 orderHash) external {
        require(msg.sender == settlementAuthority, "NM_SETTLEMENT_ONLY");
        require(user != address(0), "NM_USER_ZERO");
        require(orderHash != bytes32(0), "NM_ORDER_HASH_ZERO");

        _markUnavailable(user, nonce);
        emit NonceUsed(user, nonce, orderHash);
    }

    function _markUnavailable(address user, uint256 nonce) private {
        require(!unavailableNonces[user][nonce], "NM_NONCE_UNAVAILABLE");
        unavailableNonces[user][nonce] = true;
    }
}
