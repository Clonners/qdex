// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import {ISettlement} from "./ISettlement.sol";
import {ITradingVault} from "./ITradingVault.sol";
import {TradingVault} from "./TradingVault.sol";

/// @notice Local-only settlement skeleton for signed fill validation, nonce unavailability, expiry, replay-domain, and proof-event truth.
/// @dev This is intentionally minimal: fee movement, external nonce/market/fee managers, and real Quai proof wiring
///      remain future ratchets. ST-03 keeps expiry and replay-domain rejects ahead of nonce consumption and vault
///      movement without adding deploy scripts, RPC URLs, wallets, or admin withdrawal paths.
contract Settlement is ISettlement {
    uint256 private constant MAX_CANCEL_RANGE_SIZE = 256;

    ITradingVault public immutable vault;

    mapping(address => mapping(uint256 => bool)) private usedNonces;

    event NonceCancelled(address indexed user, uint256 indexed nonce);
    event NonceRangeCancelled(address indexed user, uint256 from, uint256 to);

    constructor() {
        vault = ITradingVault(address(new TradingVault()));
    }

    function isNonceUsed(address user, uint256 nonce) external view returns (bool) {
        return usedNonces[user][nonce];
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
                fill.makerFilledAmount,
                fill.takerFilledAmount
            )
        );
    }

    function settle(FillPacket calldata fill, bytes calldata makerSignature, bytes calldata takerSignature) external {
        _validateFillBoundary(fill);
        require(!usedNonces[fill.maker][fill.makerNonce], "ST_MAKER_NONCE_USED");
        require(!usedNonces[fill.taker][fill.takerNonce], "ST_TAKER_NONCE_USED");

        bytes32 fillHash = hashFill(fill);
        require(_recoverEthSignedMessage(fillHash, makerSignature) == fill.maker, "ST_MAKER_SIGNATURE_INVALID");
        require(_recoverEthSignedMessage(fillHash, takerSignature) == fill.taker, "ST_TAKER_SIGNATURE_INVALID");

        usedNonces[fill.maker][fill.makerNonce] = true;
        usedNonces[fill.taker][fill.takerNonce] = true;

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
        require(fill.makerFee == 0 && fill.takerFee == 0, "ST_FEES_NOT_READY");
        require(fill.makerNonce != fill.takerNonce || fill.maker != fill.taker, "ST_NONCE_PAIR_INVALID");
        require(fill.expiresAt > block.timestamp, "ST_EXPIRED");
        require(fill.chainId == block.chainid, "ST_CHAIN_ID_MISMATCH");
        require(fill.settlementContract == address(this), "ST_SETTLEMENT_CONTRACT_MISMATCH");
        require(fill.makerFilledAmount == fill.baseAmount, "ST_MAKER_FILL_AMOUNT_MISMATCH");
        require(fill.takerFilledAmount == fill.baseAmount, "ST_TAKER_FILL_AMOUNT_MISMATCH");
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
