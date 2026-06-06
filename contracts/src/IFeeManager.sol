// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

/// @notice Transparent maker/taker fee interface with a hard cap.
/// @dev Fee changes should be timelocked before production; implementations must reject values above maxFeeBps().
interface IFeeManager {
    event FeesUpdated(bytes32 indexed marketId, uint256 makerFeeBps, uint256 takerFeeBps, uint256 maxFeeBps);
    event FeeRecipientUpdated(address indexed feeRecipient);

    function maxFeeBps() external pure returns (uint256);
    function makerFeeBps(bytes32 marketId) external view returns (uint256);
    function takerFeeBps(bytes32 marketId) external view returns (uint256);
    function feeRecipient() external view returns (address);
    function updateFees(bytes32 marketId, uint256 makerFeeBps, uint256 takerFeeBps) external;
    function updateFeeRecipient(address feeRecipient) external;
}
