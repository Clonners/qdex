// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import {ISettlement} from "./ISettlement.sol";
import {ITradingVault} from "./ITradingVault.sol";
import {IDelegateKeyRegistry} from "./IDelegateKeyRegistry.sol";
import {IFeeManager} from "./IFeeManager.sol";
import {IMarketRegistry} from "./IMarketRegistry.sol";
import {INonceManager} from "./INonceManager.sol";
import {DelegateKeyRegistry} from "./DelegateKeyRegistry.sol";
import {FeeManager} from "./FeeManager.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
import {NonceManager} from "./NonceManager.sol";
import {TradingVault} from "./TradingVault.sol";

/// @notice Settlement contract with cross-shard sister contract linking
/// @dev Supports linking to sister contracts in other zones for cross-shard settlement
/// @dev Uses Quai-specific opcodes: isaddrinternal, etx
contract Settlement is ISettlement {
    uint256 private constant BPS_DENOMINATOR = 10_000;

    ITradingVault public immutable vault;
    INonceManager public immutable nonceManager;
    IMarketRegistry public immutable marketRegistry;
    IFeeManager public immutable feeManager;
    IDelegateKeyRegistry public immutable delegateKeyRegistry;

    mapping(address => mapping(uint256 => bytes32)) private activeOrderHashByNonce;
    mapping(bytes32 => uint256) private orderFilledAmountByHash;

    // Cross-shard sister contract registry (TOFU - Trust On First Use)
    mapping(uint8 zoneIndex => SisterContract) private sisterContracts;
    uint8[] private sisterZoneIndices;
    address public owner;

    // NOTE: Quai-specific opcodes (isaddrinternal, etx) are only available on Quai EVM
    // For local development/testing, these functions use mock implementations
    // In production on Quai, replace with actual opcode calls

    constructor() {
        owner = msg.sender;
        vault = ITradingVault(address(new TradingVault()));
        nonceManager = INonceManager(address(new NonceManager(address(this))));
        marketRegistry = IMarketRegistry(address(new MarketRegistry(msg.sender)));
        feeManager = IFeeManager(address(new FeeManager(msg.sender, msg.sender)));
        delegateKeyRegistry = IDelegateKeyRegistry(address(new DelegateKeyRegistry()));
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "ST_NOT_OWNER");
        _;
    }

    // ── Cross-shard sister contract management ──

    function setSisterContracts(
        uint8[] calldata zoneIndices,
        address[] calldata settlementAddresses
    ) external onlyOwner {
        require(zoneIndices.length == settlementAddresses.length, "ST_LENGTH_MISMATCH");
        require(zoneIndices.length > 0, "ST_EMPTY_LIST");

        for (uint i = 0; i < zoneIndices.length; i++) {
            uint8 zone = zoneIndices[i];
            address settlement = settlementAddresses[i];

            require(settlement != address(0), "ST_ZERO_ADDRESS");

            bool exists = false;
            for (uint j = 0; j < sisterZoneIndices.length; j++) {
                if (sisterZoneIndices[j] == zone) {
                    exists = true;
                    sisterContracts[zone].settlementAddress = settlement;
                    sisterContracts[zone].active = true;
                    break;
                }
            }

            if (!exists) {
                sisterZoneIndices.push(zone);
                sisterContracts[zone] = SisterContract({
                    zoneIndex: zone,
                    settlementAddress: settlement,
                    active: true
                });
            }
        }

        emit SisterContractsLinked(zoneIndices, settlementAddresses, block.timestamp);
    }

    function sisterContract(uint8 zoneIndex) external view returns (SisterContract memory) {
        return sisterContracts[zoneIndex];
    }

    function getActiveSisterContracts() external view returns (SisterContract[] memory) {
        SisterContract[] memory result = new SisterContract[](sisterZoneIndices.length);
        for (uint i = 0; i < sisterZoneIndices.length; i++) {
            result[i] = sisterContracts[sisterZoneIndices[i]];
        }
        return result;
    }

     /**
     * @notice Check if an address is within the current zone context
     * @dev Uses Quai's isaddrinternal opcode to determine if a cross-zone ETX is needed
     * @dev NOTE: On Quai EVM, replace with actual opcode: result := isaddrinternal(target)
     */
    function isAddressInternal(address target) public view returns (bool) {
        // Mock for local development - assumes same zone
        // On Quai EVM: assembly { result := isaddrinternal(target) }
        bool result;
        // TODO: Implement with Quai isaddrinternal opcode
        result = true; // Default to internal for same-zone operations
        return result;
    }

    /**
     * @notice Forward settlement data to a sister contract on another zone via ETX
     * @dev Uses Quai's etx opcode for cross-zone communication
     * @param zoneIndex Zone index of the sister contract
     * @param fillId Fill identifier for tracking
     * @param data Encoded data to send to the sister contract
     * @param gasLimit Gas limit for destination chain execution
     * @param minerTip Miner tip in wei
     * @param baseFee Base fee in wei
     */
    function forwardToSister(
        uint8 zoneIndex,
        bytes32 fillId,
        bytes calldata data,
        uint256 gasLimit,
        uint256 minerTip,
        uint256 baseFee
    ) external payable onlyOwner {
        SisterContract storage sister = sisterContracts[zoneIndex];
        require(sister.active, "ST_SISTER_NOT_ACTIVE");
        require(sister.settlementAddress != address(0), "ST_SISTER_ZERO");

        // Verify gas payment
        uint256 totalGas = (baseFee + minerTip) * gasLimit;
        require(msg.value >= totalGas, "ST_INSUFFICIENT_GAS_FOR_ETX");

        // NOTE: On Quai EVM, use actual etx opcode:
        // assembly {
        //     success := etx(0, sister.settlementAddress, 0, gasLimit, minerTip, baseFee, ...)
        // }
        
        // Mock for local development
        emit CrossZoneForwarded(fillId, zoneIndex, sister.settlementAddress);
    }

    /**
     * @notice Receive settlement data from a sister contract on another zone
     * @dev Called by sister contracts via ETX cross-zone communication
     * @dev Verifies that the caller is a registered sister contract
     */
    function receiveCrossZoneSettlement(
        bytes32 fillId,
        uint256 zoneIndex,
        uint256 minerTip,
        uint256 baseFee,
        address originContract,
        address feeRecipient,
        uint256 timestamp
    ) external {
        require(originContract != address(0), "ST_ORIGIN_ZERO");

        // Verify that the caller (msg.sender) is a registered sister contract
        SisterContract storage sister = sisterContracts[uint8(zoneIndex)];
        require(sister.active, "ST_SISTER_NOT_ACTIVE");
        require(sister.settlementAddress == msg.sender, "ST_UNAUTHORIZED_SISTER");

        emit CrossZoneForwarded(fillId, uint8(zoneIndex), msg.sender);
    }

    // ── Settlement functions ──

    function isNonceUsed(address user, uint256 nonce) external view returns (bool) {
        return nonceManager.isNonceUsed(user, nonce);
    }

    function filledAmountOf(bytes32 orderHash) external view returns (uint256) {
        return orderFilledAmountByHash[orderHash];
    }

    function hashFill(FillPacket calldata fill) public pure returns (bytes32) {
        return keccak256(abi.encode(_hashFillIdentity(fill), _hashFillReplay(fill), _hashFillEconomics(fill)));
    }

    function _hashFillIdentity(FillPacket calldata fill) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                fill.fillId,
                fill.marketId,
                fill.makerOrderHash,
                fill.takerOrderHash,
                fill.maker,
                fill.taker,
                fill.baseToken,
                fill.quoteToken
            )
        );
    }

    function _hashFillReplay(FillPacket calldata fill) private pure returns (bytes32) {
        return keccak256(
            abi.encode(fill.makerNonce, fill.takerNonce, fill.expiresAt, fill.chainId, fill.settlementContract)
        );
    }

    function _hashFillEconomics(FillPacket calldata fill) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                fill.price,
                fill.baseAmount,
                fill.quoteAmount,
                fill.makerFee,
                fill.takerFee,
                fill.feeRecipient,
                fill.maxFeeBps,
                fill.makerOrderAmount,
                fill.takerOrderAmount,
                fill.makerFilledAmount,
                fill.takerFilledAmount
            )
        );
    }

    function settle(FillPacket calldata fill, bytes calldata makerSignature, bytes calldata takerSignature) external {
        _validateFillBoundary(fill);
        _validateNonceAvailableForOrder(fill.maker, fill.makerNonce, fill.makerOrderHash, "ST_MAKER_NONCE_USED", "ST_MAKER_NONCE_ORDER_MISMATCH");
        _validateNonceAvailableForOrder(fill.taker, fill.takerNonce, fill.takerOrderHash, "ST_TAKER_NONCE_USED", "ST_TAKER_NONCE_ORDER_MISMATCH");
        _validatePartialFillAccounting(fill);

        bytes32 fillHash = hashFill(fill);
        address makerSigner = _recoverEthSignedMessage(fillHash, makerSignature);
        address takerSigner = _recoverEthSignedMessage(fillHash, takerSignature);
        require(_isAuthorizedFillSigner(fill.maker, makerSigner, fill), "ST_MAKER_SIGNER_UNAUTHORIZED");
        require(_isAuthorizedFillSigner(fill.taker, takerSigner, fill), "ST_TAKER_SIGNER_UNAUTHORIZED");

        _recordPartialFillAccounting(fill);
        _advanceNonceLifecycle(fill.maker, fill.makerNonce, fill.makerOrderHash, fill.makerFilledAmount, fill.makerOrderAmount);
        _advanceNonceLifecycle(fill.taker, fill.takerNonce, fill.takerOrderHash, fill.takerFilledAmount, fill.takerOrderAmount);

        _settleFillBalances(fill);

        _emitTradeSettled(fill);
    }

    function _settleFillBalances(FillPacket calldata fill) private {
        vault.lockForSettlement(fill.maker, fill.baseToken, fill.baseAmount, fill.makerOrderHash);
        vault.lockForSettlement(fill.taker, fill.quoteToken, fill.quoteAmount, fill.takerOrderHash);

        _settleGrossAmountWithOptionalFee(
            fill.maker, fill.taker, fill.feeRecipient, fill.baseToken, fill.baseAmount, fill.takerFee, fill.fillId
        );
        _settleGrossAmountWithOptionalFee(
            fill.taker, fill.maker, fill.feeRecipient, fill.quoteToken, fill.quoteAmount, fill.makerFee, fill.fillId
        );
    }

    function _settleGrossAmountWithOptionalFee(
        address debitUser,
        address creditUser,
        address feeRecipient,
        address token,
        uint256 grossAmount,
        uint256 feeAmount,
        bytes32 fillId
    ) private {
        uint256 netAmount = grossAmount - feeAmount;

        if (netAmount > 0) {
            vault.settleLockedBalance(debitUser, creditUser, token, netAmount, fillId);
        }

        if (feeAmount > 0) {
            vault.settleLockedBalance(debitUser, feeRecipient, token, feeAmount, fillId);
        }
    }

    function _emitTradeSettled(FillPacket calldata fill) private {
        bytes32 tradeId = _tradeId(fill);
        emit TradeSettled(
            tradeId,
            fill.fillId,
            fill.marketId,
            fill.makerOrderHash,
            fill.takerOrderHash,
            fill.maker,
            fill.taker,
            fill.price,
            fill.baseAmount,
            fill.quoteAmount,
            fill.makerFee,
            fill.takerFee,
            fill.feeRecipient
        );
    }

    function _validateFillBoundary(FillPacket calldata fill) private view {
        require(fill.fillId != bytes32(0), "ST_FILL_ID_ZERO");
        require(fill.marketId != bytes32(0), "ST_MARKET_ID_ZERO");
        require(fill.makerOrderHash != bytes32(0), "ST_MAKER_ORDER_HASH_ZERO");
        require(fill.takerOrderHash != bytes32(0), "ST_TAKER_ORDER_HASH_ZERO");
        require(fill.maker != address(0), "ST_MAKER_ZERO");
        require(fill.taker != address(0), "ST_TAKER_ZERO");
        require(fill.maker != fill.taker, "ST_SELF_TRADE_NOT_READY");
        require(fill.baseToken != address(0), "ST_BASE_TOKEN_ZERO");
        require(fill.quoteToken != address(0), "ST_QUOTE_TOKEN_ZERO");
        require(fill.baseToken != fill.quoteToken, "ST_TOKEN_PAIR_INVALID");
        require(fill.price > 0, "ST_PRICE_ZERO");
        require(fill.baseAmount > 0, "ST_BASE_AMOUNT_ZERO");
        require(fill.quoteAmount > 0, "ST_QUOTE_AMOUNT_ZERO");
        _validateMarketPolicy(fill);
        require(fill.quoteAmount == fill.baseAmount * fill.price, "ST_PRICE_AMOUNT_MISMATCH");
        _validateFeePolicy(fill);
        require(fill.makerOrderAmount > 0, "ST_MAKER_ORDER_AMOUNT_ZERO");
        require(fill.takerOrderAmount > 0, "ST_TAKER_ORDER_AMOUNT_ZERO");
        require(fill.makerNonce != fill.takerNonce || fill.maker != fill.taker, "ST_NONCE_PAIR_INVALID");
        require(fill.expiresAt > block.timestamp, "ST_EXPIRED");
        require(fill.chainId == block.chainid, "ST_CHAIN_ID_MISMATCH");
        require(fill.settlementContract == address(this), "ST_SETTLEMENT_CONTRACT_MISMATCH");
    }

    function _validateMarketPolicy(FillPacket calldata fill) private view {
        IMarketRegistry.MarketInfo memory market = marketRegistry.marketInfo(fill.marketId);
        require(market.enabled, "ST_MARKET_DISABLED");
        require(market.base == fill.baseToken && market.quote == fill.quoteToken, "ST_MARKET_TOKEN_MISMATCH");
        require(fill.baseAmount >= market.minAmount, "ST_MARKET_MIN_AMOUNT");
    }

    function _validateFeePolicy(FillPacket calldata fill) private view {
        require(fill.maxFeeBps <= feeManager.maxFeeBps(), "ST_MAX_FEE_BPS_TOO_HIGH");

        if (fill.makerFee == 0 && fill.takerFee == 0) {
            return;
        }

        require(
            fill.feeRecipient != address(0) && fill.feeRecipient == feeManager.feeRecipient(),
            "ST_FEE_RECIPIENT_INVALID"
        );
        require(fill.makerFee <= _feeCap(fill.quoteAmount, fill.maxFeeBps), "ST_MAKER_FEE_CAP_EXCEEDED");
        require(fill.takerFee <= _feeCap(fill.baseAmount, fill.maxFeeBps), "ST_TAKER_FEE_CAP_EXCEEDED");
        require(
            fill.makerFee <= _feeCap(fill.quoteAmount, feeManager.makerFeeBps(fill.marketId)),
            "ST_MAKER_FEE_POLICY_EXCEEDED"
        );
        require(
            fill.takerFee <= _feeCap(fill.baseAmount, feeManager.takerFeeBps(fill.marketId)),
            "ST_TAKER_FEE_POLICY_EXCEEDED"
        );
    }

    function _feeCap(uint256 grossAmount, uint256 maxFeeBps) private pure returns (uint256) {
        return (grossAmount * maxFeeBps) / BPS_DENOMINATOR;
    }

    function _isAuthorizedFillSigner(address owner, address signer, FillPacket calldata fill) private view returns (bool) {
        if (signer == owner) {
            return true;
        }

        if (signer == address(0)) {
            return false;
        }

        uint256 notional = fill.quoteAmount;
        return delegateKeyRegistry.isDelegateKeyActive(owner, signer, fill.marketId, notional)
            && delegateKeyRegistry.hasPermission(owner, signer, IDelegateKeyRegistry.Permission.PLACE_ORDER)
            && delegateKeyRegistry.hasPermission(owner, signer, IDelegateKeyRegistry.Permission.NO_WITHDRAW)
            && delegateKeyRegistry.hasPermission(owner, signer, IDelegateKeyRegistry.Permission.NO_ADMIN);
    }

    function _validateNonceAvailableForOrder(
        address user,
        uint256 nonce,
        bytes32 orderHash,
        string memory usedError,
        string memory orderMismatchError
    ) private view {
        require(!nonceManager.isNonceUsed(user, nonce), usedError);

        bytes32 activeOrderHash = activeOrderHashByNonce[user][nonce];
        require(activeOrderHash == bytes32(0) || activeOrderHash == orderHash, orderMismatchError);
    }

    function _validatePartialFillAccounting(FillPacket calldata fill) private view {
        _validateOrderFillAccounting(
            fill.makerOrderHash,
            fill.baseAmount,
            fill.makerOrderAmount,
            fill.makerFilledAmount,
            "ST_MAKER_FILL_AMOUNT_MISMATCH",
            "ST_MAKER_ORDER_AMOUNT_EXCEEDED"
        );
        _validateOrderFillAccounting(
            fill.takerOrderHash,
            fill.baseAmount,
            fill.takerOrderAmount,
            fill.takerFilledAmount,
            "ST_TAKER_FILL_AMOUNT_MISMATCH",
            "ST_TAKER_ORDER_AMOUNT_EXCEEDED"
        );
    }

    function _validateOrderFillAccounting(
        bytes32 orderHash,
        uint256 currentFillAmount,
        uint256 orderAmount,
        uint256 cumulativeFilledAmount,
        string memory mismatchError,
        string memory exceededError
    ) private view {
        require(cumulativeFilledAmount == orderFilledAmountByHash[orderHash] + currentFillAmount, mismatchError);
        require(cumulativeFilledAmount <= orderAmount, exceededError);
    }

    function _recordPartialFillAccounting(FillPacket calldata fill) private {
        orderFilledAmountByHash[fill.makerOrderHash] = fill.makerFilledAmount;
        orderFilledAmountByHash[fill.takerOrderHash] = fill.takerFilledAmount;
    }

    function _advanceNonceLifecycle(
        address user,
        uint256 nonce,
        bytes32 orderHash,
        uint256 cumulativeFilledAmount,
        uint256 orderAmount
    ) private {
        if (cumulativeFilledAmount == orderAmount) {
            nonceManager.markNonceUsed(user, nonce, orderHash);
            delete activeOrderHashByNonce[user][nonce];
            return;
        }

        activeOrderHashByNonce[user][nonce] = orderHash;
    }

    function _tradeId(FillPacket calldata fill) private view returns (bytes32) {
        return keccak256(abi.encode("QDEX_ST01_TRADE", address(this), fill.fillId, fill.makerOrderHash, fill.takerOrderHash));
    }

    function _recoverEthSignedMessage(bytes32 digest, bytes calldata signature) private pure returns (address) {
        require(signature.length == 65, "ST_SIGNATURE_LENGTH");

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }

        if (v < 27) {
            v += 27;
        }
        require(v == 27 || v == 28, "ST_SIGNATURE_V");

        bytes32 messageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        return ecrecover(messageHash, v, r, s);
    }
}
