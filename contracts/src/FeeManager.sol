// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import {IFeeManager} from "./IFeeManager.sol";

/// @notice Local-only maker/taker fee policy with a hard basis-point cap.
/// @dev FM-01 keeps fee policy dependency-scoped; production timelock or multisig hardening remains approval-gated.
contract FeeManager is IFeeManager {
    uint256 private constant LOCAL_MAX_FEE_BPS = 1_000;

    address public immutable feeAuthority;
    address private currentFeeRecipient;

    mapping(bytes32 => uint256) private makerFeesByMarket;
    mapping(bytes32 => uint256) private takerFeesByMarket;

    constructor(address feeAuthority_, address feeRecipient_) {
        require(feeAuthority_ != address(0), "FM_FEE_AUTHORITY_ZERO");
        require(feeRecipient_ != address(0), "FM_FEE_RECIPIENT_ZERO");

        feeAuthority = feeAuthority_;
        currentFeeRecipient = feeRecipient_;

        emit FeeRecipientUpdated(feeRecipient_);
    }

    modifier onlyFeeAuthority() {
        require(msg.sender == feeAuthority, "FM_FEE_AUTHORITY_ONLY");
        _;
    }

    function maxFeeBps() external pure returns (uint256) {
        return LOCAL_MAX_FEE_BPS;
    }

    function makerFeeBps(bytes32 marketId) external view returns (uint256) {
        return makerFeesByMarket[marketId];
    }

    function takerFeeBps(bytes32 marketId) external view returns (uint256) {
        return takerFeesByMarket[marketId];
    }

    function feeRecipient() external view returns (address) {
        return currentFeeRecipient;
    }

    function updateFees(bytes32 marketId, uint256 makerFeeBps_, uint256 takerFeeBps_) external onlyFeeAuthority {
        require(marketId != bytes32(0), "FM_MARKET_ID_ZERO");
        require(makerFeeBps_ <= LOCAL_MAX_FEE_BPS, "FM_MAKER_FEE_BPS_TOO_HIGH");
        require(takerFeeBps_ <= LOCAL_MAX_FEE_BPS, "FM_TAKER_FEE_BPS_TOO_HIGH");

        makerFeesByMarket[marketId] = makerFeeBps_;
        takerFeesByMarket[marketId] = takerFeeBps_;

        emit FeesUpdated(marketId, makerFeeBps_, takerFeeBps_, LOCAL_MAX_FEE_BPS);
    }

    function updateFeeRecipient(address feeRecipient_) external onlyFeeAuthority {
        require(feeRecipient_ != address(0), "FM_FEE_RECIPIENT_ZERO");

        currentFeeRecipient = feeRecipient_;

        emit FeeRecipientUpdated(feeRecipient_);
    }
}
