// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import {IMarketRegistry} from "./IMarketRegistry.sol";

/// @notice Local-only source of truth for enabled spot markets and precision/minimum constraints.
/// @dev MR-03 starts Clonners-managed and can later hand listing authority to a DAO/multisig without custody power.
contract MarketRegistry is IMarketRegistry {
    address public marketAuthority;
    address public pendingMarketAuthority;

    mapping(bytes32 => MarketInfo) private markets;

    constructor(address marketAuthority_) {
        require(marketAuthority_ != address(0), "MR_MARKET_AUTHORITY_ZERO");
        marketAuthority = marketAuthority_;
    }

    modifier onlyMarketAuthority() {
        require(msg.sender == marketAuthority, "MR_MARKET_AUTHORITY_ONLY");
        _;
    }

    function proposeMarketAuthority(address nextAuthority) external onlyMarketAuthority {
        require(nextAuthority != address(0), "MR_PENDING_AUTHORITY_ZERO");
        require(nextAuthority != marketAuthority, "MR_PENDING_AUTHORITY_SAME");

        pendingMarketAuthority = nextAuthority;

        emit MarketAuthorityHandoffProposed(marketAuthority, nextAuthority);
    }

    function acceptMarketAuthority() external {
        address nextAuthority = pendingMarketAuthority;
        require(msg.sender == nextAuthority, "MR_PENDING_AUTHORITY_ONLY");

        address previousAuthority = marketAuthority;
        marketAuthority = nextAuthority;
        pendingMarketAuthority = address(0);

        emit MarketAuthorityHandoffAccepted(previousAuthority, nextAuthority);
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
