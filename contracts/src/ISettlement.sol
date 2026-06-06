// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

/// @notice Interface for on-chain settlement of off-chain matched orders.
/// @dev Settlement implementations must verify signatures, replay domain, nonce state,
///      market status, fill constraints, available locked balances, and fee caps before moving vault balances.
interface ISettlement {
    struct FillPacket {
        bytes32 fillId;
        bytes32 marketId;
        bytes32 makerOrderHash;
        bytes32 takerOrderHash;
        address maker;
        address taker;
        address baseToken;
        address quoteToken;
        uint256 price;
        uint256 baseAmount;
        uint256 quoteAmount;
        uint256 makerFee;
        uint256 takerFee;
        uint256 makerNonce;
        uint256 takerNonce;
        uint256 expiresAt;
        uint256 chainId;
        address settlementContract;
        address feeRecipient;
        uint256 maxFeeBps;
        uint256 makerFilledAmount;
        uint256 takerFilledAmount;
    }

    event TradeSettled(
        bytes32 indexed tradeId,
        bytes32 indexed fillId,
        bytes32 indexed marketId,
        bytes32 makerOrderHash,
        bytes32 takerOrderHash,
        address maker,
        address taker,
        uint256 price,
        uint256 baseAmount,
        uint256 quoteAmount,
        uint256 makerFee,
        uint256 takerFee,
        address feeRecipient
    );

    function settle(FillPacket calldata fill, bytes calldata makerSignature, bytes calldata takerSignature) external;
}
