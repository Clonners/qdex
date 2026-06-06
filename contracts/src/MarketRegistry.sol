// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import {IMarketRegistry} from "./IMarketRegistry.sol";

/// @notice Local-only source of truth for enabled spot markets and precision/minimum constraints.
/// @dev MR-01 keeps metadata stable and dependency-scoped; production authority hardening remains approval-gated.
contract MarketRegistry is IMarketRegistry {
    address public immutable marketAuthority;

    mapping(bytes32 => MarketInfo) private markets;

    constructor(address marketAuthority_) {
        require(marketAuthority_ != address(0), "MR_MARKET_AUTHORITY_ZERO");
        marketAuthority = marketAuthority_;
    }

    modifier onlyMarketAuthority() {
        require(msg.sender == marketAuthority, "MR_MARKET_AUTHORITY_ONLY");
        _;
    }

    function addMarket(address base, address quote, uint8 pricePrecision, uint8 amountPrecision, uint256 minAmount)
        external
        onlyMarketAuthority
        returns (bytes32 marketId)
    {
        require(base != address(0), "MR_BASE_ZERO");
        require(quote != address(0), "MR_QUOTE_ZERO");
        require(base != quote, "MR_TOKEN_PAIR_INVALID");
        require(pricePrecision > 0, "MR_PRICE_PRECISION_ZERO");
        require(amountPrecision > 0, "MR_AMOUNT_PRECISION_ZERO");
        require(minAmount > 0, "MR_MIN_AMOUNT_ZERO");

        marketId = keccak256(abi.encode(base, quote));
        require(markets[marketId].base == address(0), "MR_MARKET_EXISTS");

        markets[marketId] = MarketInfo({
            base: base,
            quote: quote,
            pricePrecision: pricePrecision,
            amountPrecision: amountPrecision,
            minAmount: minAmount,
            enabled: true
        });

        emit MarketAdded(marketId, base, quote, pricePrecision, amountPrecision, minAmount);
    }

    function disableMarket(bytes32 marketId) external onlyMarketAuthority {
        MarketInfo storage market = markets[marketId];
        require(market.base != address(0), "MR_MARKET_UNKNOWN");
        require(market.enabled, "MR_MARKET_DISABLED");

        market.enabled = false;

        emit MarketDisabled(marketId);
    }

    function marketInfo(bytes32 marketId) external view returns (MarketInfo memory) {
        return markets[marketId];
    }
}
