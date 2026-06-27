// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

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
        uint256 makerOrderAmount;
        uint256 takerOrderAmount;
        uint256 makerFilledAmount;
        uint256 takerFilledAmount;
    }

    struct SisterContract {
        uint8 zoneIndex;
        address settlementAddress;
        bool active;
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

    event SisterContractsLinked(
        uint8[] zoneIndices,
        address[] settlementAddresses,
        uint256 timestamp
    );

    event CrossZoneForwarded(
        bytes32 indexed fillId,
        uint8 indexed zoneIndex,
        address indexed sisterAddress
    );

    function settle(FillPacket calldata fill, bytes calldata makerSignature, bytes calldata takerSignature) external;

    // Cross-shard sister contract management
    function setSisterContracts(
        uint8[] calldata zoneIndices,
        address[] calldata settlementAddresses
    ) external;

    function sisterContract(uint8 zoneIndex) external view returns (SisterContract memory);

    function getActiveSisterContracts() external view returns (SisterContract[] memory);

    function isAddressInternal(address target) external view returns (bool);

    function forwardToSister(
        uint8 zoneIndex,
        bytes32 fillId,
        bytes calldata data,
        uint256 gasLimit,
        uint256 minerTip,
        uint256 baseFee
    ) external payable;
}
