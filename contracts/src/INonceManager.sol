// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

/// @notice Replay protection and cancellation interface for signed orders.
/// @dev Implementations must restrict nonce consumption to settlement after validating the corresponding order hash.
interface INonceManager {
    event NonceCancelled(address indexed user, uint256 indexed nonce);
    event NonceRangeCancelled(address indexed user, uint256 from, uint256 to);
    event NonceUsed(address indexed user, uint256 indexed nonce, bytes32 indexed orderHash);

    function cancelNonce(uint256 nonce) external;
    function cancelNonceRange(uint256 from, uint256 to) external;
    function isNonceUsed(address user, uint256 nonce) external view returns (bool);
    function markNonceUsed(address user, uint256 nonce, bytes32 orderHash) external;
}
