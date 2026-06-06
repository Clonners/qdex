// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

/// @notice Source of truth for enabled spot markets and precision/minimum constraints.
/// @dev Admin operations should be timelocked or multisig-controlled before any value-bearing deployment.
interface IMarketRegistry {
    struct MarketInfo {
        address base;
        address quote;
        uint8 pricePrecision;
        uint8 amountPrecision;
        uint256 minAmount;
        bool enabled;
    }

    event MarketAdded(bytes32 indexed marketId, address indexed base, address indexed quote, uint8 pricePrecision, uint8 amountPrecision, uint256 minAmount);
    event MarketDisabled(bytes32 indexed marketId);

    function addMarket(address base, address quote, uint8 pricePrecision, uint8 amountPrecision, uint256 minAmount) external returns (bytes32 marketId);
    function disableMarket(bytes32 marketId) external;
    function marketInfo(bytes32 marketId) external view returns (MarketInfo memory);
}
