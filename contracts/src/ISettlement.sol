// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

/// @notice Placeholder interface for settlement execution.
/// @dev This is intentionally not production code yet. It documents the MVP surface.
interface ISettlement {
    struct FillPacket {
        bytes32 marketId;
        bytes32 makerOrderHash;
        bytes32 takerOrderHash;
        address maker;
        address taker;
        address baseToken;
        address quoteToken;
        uint256 baseAmount;
        uint256 quoteAmount;
        uint256 makerFee;
        uint256 takerFee;
        uint256 makerNonce;
        uint256 takerNonce;
        uint256 expiresAt;
    }

    event TradeSettled(
        bytes32 indexed tradeId,
        bytes32 indexed marketId,
        bytes32 makerOrderHash,
        bytes32 takerOrderHash,
        address maker,
        address taker,
        uint256 baseAmount,
        uint256 quoteAmount,
        uint256 makerFee,
        uint256 takerFee
    );

    function settle(FillPacket calldata fill, bytes calldata makerSignature, bytes calldata takerSignature) external;
}
