// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import {ISettlement} from "./ISettlement.sol";
import {ITradingVault} from "./ITradingVault.sol";
import {TradingVault} from "./TradingVault.sol";

/// @notice Local-only settlement skeleton for signed fill validation, nonce unavailability, expiry, replay-domain, partial-fill caps, and proof-event truth.
/// @dev This is intentionally minimal: fee movement, external nonce/market/fee managers, and real Quai proof wiring
///      remain future ratchets. ST-05 keeps local partial-fill accounting bounded by signed order amounts without adding
///      deploy scripts, RPC URLs, wallets, or admin withdrawal paths.
contract Settlement is ISettlement {
    uint256 private constant MAX_CANCEL_RANGE_SIZE = 256;

    ITradingVault public immutable vault;

    mapping(address => mapping(uint256 => bool)) private usedNonces;
    mapping(address => mapping(uint256 => bytes32)) private activeOrderHashByNonce;
    mapping(bytes32 => uint256) private orderFilledAmountByHash;

    event NonceCancelled(address indexed user, uint256 indexed nonce);
    event NonceRangeCancelled(address indexed user, uint256 from, uint256 to);

    constructor() {
        vault = ITradingVault(address(new TradingVault()));
    }

    function isNonceUsed(address user, uint256 nonce) external view returns (bool) {
        return usedNonces[user][nonce];
    }

    function filledAmountOf(bytes32 orderHash) external view returns (uint256) {
        return orderFilledAmountByHash[orderHash];
    }

    function cancelNonce(uint256 nonce) external {
        _cancelNonce(msg.sender, nonce);
        emit NonceCancelled(msg.sender, nonce);
    }

    function cancelNonceRange(uint256 from, uint256 to) external {
        require(from <= to, "ST_NONCE_RANGE_INVALID");
        require(to - from < MAX_CANCEL_RANGE_SIZE, "ST_NONCE_RANGE_TOO_LARGE");

        for (uint256 nonce = from; ; nonce++) {
            _cancelNonce(msg.sender, nonce);
            if (nonce == to) {
                break;
            }
        }

        emit NonceRangeCancelled(msg.sender, from, to);
    }

    function _cancelNonce(address user, uint256 nonce) private {
        require(!usedNonces[user][nonce], "ST_NONCE_ALREADY_USED");
        usedNonces[user][nonce] = true;
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
        require(_recoverEthSignedMessage(fillHash, makerSignature) == fill.maker, "ST_MAKER_SIGNATURE_INVALID");
        require(_recoverEthSignedMessage(fillHash, takerSignature) == fill.taker, "ST_TAKER_SIGNATURE_INVALID");

        _recordPartialFillAccounting(fill);
        _advanceNonceLifecycle(fill.maker, fill.makerNonce, fill.makerOrderHash, fill.makerFilledAmount, fill.makerOrderAmount);
        _advanceNonceLifecycle(fill.taker, fill.takerNonce, fill.takerOrderHash, fill.takerFilledAmount, fill.takerOrderAmount);

        vault.lockForSettlement(fill.maker, fill.baseToken, fill.baseAmount, fill.makerOrderHash);
        vault.lockForSettlement(fill.taker, fill.quoteToken, fill.quoteAmount, fill.takerOrderHash);
        vault.settleLockedBalance(fill.maker, fill.taker, fill.baseToken, fill.baseAmount, fill.fillId);
        vault.settleLockedBalance(fill.taker, fill.maker, fill.quoteToken, fill.quoteAmount, fill.fillId);

        _emitTradeSettled(fill);
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
        require(fill.marketId == _localMarketId(), "ST_MARKET_DISABLED");
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
        require(fill.quoteAmount == fill.baseAmount * fill.price, "ST_PRICE_AMOUNT_MISMATCH");
        require(fill.makerFee == 0 && fill.takerFee == 0, "ST_FEES_NOT_READY");
        require(fill.makerOrderAmount > 0, "ST_MAKER_ORDER_AMOUNT_ZERO");
        require(fill.takerOrderAmount > 0, "ST_TAKER_ORDER_AMOUNT_ZERO");
        require(fill.makerNonce != fill.takerNonce || fill.maker != fill.taker, "ST_NONCE_PAIR_INVALID");
        require(fill.expiresAt > block.timestamp, "ST_EXPIRED");
        require(fill.chainId == block.chainid, "ST_CHAIN_ID_MISMATCH");
        require(fill.settlementContract == address(this), "ST_SETTLEMENT_CONTRACT_MISMATCH");
    }

    function _validateNonceAvailableForOrder(
        address user,
        uint256 nonce,
        bytes32 orderHash,
        string memory usedError,
        string memory orderMismatchError
    ) private view {
        require(!usedNonces[user][nonce], usedError);

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
            usedNonces[user][nonce] = true;
            delete activeOrderHashByNonce[user][nonce];
            return;
        }

        activeOrderHashByNonce[user][nonce] = orderHash;
    }

    function _localMarketId() private pure returns (bytes32) {
        return keccak256(bytes("LOCAL-BASE-QUOTE"));
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
