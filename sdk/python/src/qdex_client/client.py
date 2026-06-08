import base64
import hashlib
import json
import os
import socket
import ssl
from urllib.error import HTTPError
from urllib.parse import quote, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://127.0.0.1:8787"
ZERO_DELEGATE = "0x0000000000000000000000000000000000000000"
DEFAULT_OWNER = "0x1111111111111111111111111111111111111111"
DEFAULT_SETTLEMENT_CONTRACT = "0x2222222222222222222222222222222222222222"
MOCK_SIGNED_AT = 1780000000
DEFAULT_EXPIRES_AT = 1780003600


class QDexHttpError(Exception):
    def __init__(self, message, *, status, body):
        super().__init__(message)
        self.status = status
        self.body = body


class QDexStreamError(Exception):
    pass


def _trim_trailing_slash(value):
    return value.rstrip("/")


def _market_depth_channel(market_id):
    return f"market.{market_id}.depth"


def _market_trades_channel(market_id):
    return f"market.{market_id}.trades"


def _encode_path_value(value):
    return quote(value, safe="")


class QDexStream:
    def __init__(self, *, channel, url, timeout=5):
        self.channel = channel
        self.url = url
        self.timeout = timeout
        self.closed = False
        self._buffer = b""
        self._socket = self._connect(url, timeout)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def next(self, *, timeout=None):
        if self.closed:
            raise QDexStreamError(f"QDex WebSocket stream is closed for {self.channel}.")
        if timeout is not None:
            self._socket.settimeout(timeout)

        while True:
            first_byte, second_byte = self._read_exact(2)
            opcode = first_byte & 0x0F
            masked = (second_byte & 0x80) != 0
            payload_length = second_byte & 0x7F

            if payload_length == 126:
                payload_length = int.from_bytes(self._read_exact(2), "big")
            elif payload_length == 127:
                payload_length = int.from_bytes(self._read_exact(8), "big")

            mask_key = self._read_exact(4) if masked else None
            payload = bytearray(self._read_exact(payload_length))
            if mask_key is not None:
                for index in range(len(payload)):
                    payload[index] ^= mask_key[index % 4]

            if opcode == 0x1:
                return json.loads(bytes(payload).decode("utf-8"))
            if opcode == 0x8:
                self.closed = True
                raise QDexStreamError(f"QDex WebSocket stream closed for {self.channel}.")
            if opcode == 0x9:
                self._send_frame(0xA, bytes(payload))
                continue
            if opcode == 0xA:
                continue
            raise QDexStreamError(f"Unsupported WebSocket opcode {opcode} for {self.channel}.")

    def close(self):
        if self.closed:
            return
        self.closed = True
        try:
            self._send_frame(0x8, b"")
        except OSError:
            pass
        try:
            self._socket.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self._socket.close()

    def _connect(self, url, timeout):
        parts = urlsplit(url)
        if parts.scheme not in {"ws", "wss"}:
            raise ValueError("QDex stream URL must use ws:// or wss://")

        host = parts.hostname
        if host is None:
            raise ValueError("QDex stream URL must include a host")
        port = parts.port or (443 if parts.scheme == "wss" else 80)
        path = parts.path or "/"
        if parts.query:
            path = f"{path}?{parts.query}"

        raw_socket = socket.create_connection((host, port), timeout=timeout)
        raw_socket.settimeout(timeout)
        stream_socket = ssl.create_default_context().wrap_socket(raw_socket, server_hostname=host) if parts.scheme == "wss" else raw_socket

        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = "\r\n".join(
            [
                f"GET {path} HTTP/1.1",
                f"Host: {parts.netloc}",
                "Upgrade: websocket",
                "Connection: Upgrade",
                f"Sec-WebSocket-Key: {key}",
                "Sec-WebSocket-Version: 13",
                "",
                "",
            ]
        )
        stream_socket.sendall(request.encode("ascii"))
        self._socket = stream_socket
        self._verify_handshake(key)
        return stream_socket

    def _verify_handshake(self, key):
        response = b""
        while b"\r\n\r\n" not in response:
            chunk = self._socket.recv(4096)
            if chunk == b"":
                raise QDexStreamError(f"QDex WebSocket handshake closed early for {self.channel}.")
            response += chunk

        headers_raw, self._buffer = response.split(b"\r\n\r\n", 1)
        lines = headers_raw.decode("iso-8859-1").split("\r\n")
        if len(lines) == 0 or " 101 " not in lines[0]:
            status = lines[0] if lines else "empty response"
            raise QDexStreamError(f"QDex WebSocket upgrade failed for {self.channel}: {status}")

        headers = {}
        for line in lines[1:]:
            if ":" not in line:
                continue
            name, value = line.split(":", 1)
            headers[name.strip().lower()] = value.strip()

        expected_accept = base64.b64encode(
            hashlib.sha1(f"{key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11".encode("ascii")).digest()
        ).decode("ascii")
        if headers.get("sec-websocket-accept") != expected_accept:
            raise QDexStreamError(f"QDex WebSocket upgrade returned an invalid accept header for {self.channel}.")

    def _read_exact(self, size):
        if size == 0:
            return b""

        chunks = []
        remaining = size
        if self._buffer:
            chunk = self._buffer[:remaining]
            self._buffer = self._buffer[remaining:]
            chunks.append(chunk)
            remaining -= len(chunk)

        while remaining > 0:
            chunk = self._socket.recv(remaining)
            if chunk == b"":
                raise QDexStreamError(f"QDex WebSocket stream closed while reading {self.channel}.")
            chunks.append(chunk)
            remaining -= len(chunk)

        return b"".join(chunks)

    def _send_frame(self, opcode, payload=b""):
        payload = bytes(payload)
        header = bytearray([0x80 | opcode])
        mask_bit = 0x80
        if len(payload) <= 125:
            header.append(mask_bit | len(payload))
        elif len(payload) <= 65_535:
            header.append(mask_bit | 126)
            header.extend(len(payload).to_bytes(2, "big"))
        else:
            header.append(mask_bit | 127)
            header.extend(len(payload).to_bytes(8, "big"))

        mask_key = os.urandom(4)
        masked_payload = bytes(byte ^ mask_key[index % 4] for index, byte in enumerate(payload))
        self._socket.sendall(bytes(header) + mask_key + masked_payload)


def create_mock_signed_order(**overrides):
    order_type = overrides.pop("type", "limit")
    owner = overrides.pop("owner", DEFAULT_OWNER)
    delegate = overrides.pop("delegate", ZERO_DELEGATE)
    nonce = overrides.pop("nonce", "1")
    time_in_force = overrides.pop("time_in_force", None)
    if time_in_force is None:
        time_in_force = overrides.pop("timeInForce", "IOC" if order_type == "market_ioc" else "GTC")
    max_slippage_bps = overrides.pop("max_slippage_bps", None)
    if max_slippage_bps is None:
        max_slippage_bps = overrides.pop("maxSlippageBps", 50 if order_type == "market_ioc" else 0)
    signature_overrides = overrides.pop("signature", {})

    order = {
        "marketId": "QI-QUAI",
        "side": "sell",
        "type": order_type,
        "baseToken": "mock:QI",
        "quoteToken": "mock:QUAI",
        "amount": "100",
        "price": "5",
        "timeInForce": time_in_force,
        "maxSlippageBps": max_slippage_bps,
        "owner": owner,
        "delegate": delegate,
        "nonce": nonce,
        "expiresAt": DEFAULT_EXPIRES_AT,
        "chainId": 0,
        "settlementContract": DEFAULT_SETTLEMENT_CONTRACT,
        "clientOrderId": f"sdk-python-mock-order-{nonce}",
    }
    order.update(overrides)
    order["signature"] = {
        "scheme": "mock",
        "signer": order["owner"],
        "value": f"0xmock-{order['nonce']}",
        "signedAt": MOCK_SIGNED_AT,
        **signature_overrides,
    }
    return order


class _MarketsApi:
    def __init__(self, client):
        self._client = client

    def list(self):
        return self._client._request_ok("/v1/markets")["markets"]


class _TickersApi:
    def __init__(self, client):
        self._client = client

    def list(self):
        return self._client._request_ok("/v1/tickers")["tickers"]

    def get(self, market_id):
        return self._client._request_ok(f"/v1/tickers/{_encode_path_value(market_id)}")

    def open_stream(self, *, timeout=None):
        return self._client._open_stream("global.tickers", timeout=timeout)

    def stream(self, *, limit=1, timeout=None):
        return self._client._read_stream("global.tickers", limit=limit, timeout=timeout)


class _OrderbookApi:
    def __init__(self, client):
        self._client = client

    def get(self, market_id):
        return self._client._request_ok(f"/v1/orderbook/{_encode_path_value(market_id)}")

    def open_stream(self, market_id, *, timeout=None):
        return self._client._open_stream(_market_depth_channel(market_id), timeout=timeout)

    def stream(self, market_id, *, limit=1, timeout=None):
        return self._client._read_stream(_market_depth_channel(market_id), limit=limit, timeout=timeout)


class _ContractsApi:
    def __init__(self, client):
        self._client = client

    def get(self):
        return self._client._request_ok("/v1/contracts")


class _FeesApi:
    def __init__(self, client):
        self._client = client

    def get(self):
        return self._client._request_ok("/v1/fees")

    def open_stream(self, *, timeout=None):
        return self._client._open_stream("fees", timeout=timeout)

    def stream(self, *, limit=1, timeout=None):
        return self._client._read_stream("fees", limit=limit, timeout=timeout)


class _AccountApi:
    def __init__(self, client):
        self._client = client

    def get(self):
        return self._client._request_ok("/v1/account")

    def balances(self):
        return self._client._request_ok("/v1/account/balances")


class _VaultDepositsApi:
    def __init__(self, client):
        self._client = client

    def list(self):
        return self._client._request_ok("/v1/vault/deposits")

    def open_stream(self, *, timeout=None):
        return self._client._open_stream("deposits", timeout=timeout)

    def stream(self, *, limit=1, timeout=None):
        return self._client._read_stream("deposits", limit=limit, timeout=timeout)

    def prepare(self, request):
        return self._client._request_expected_status(
            "/v1/vault/deposits/prepare",
            expected_status=501,
            method="POST",
            body={**request, "operation": "deposit"},
        )


class _VaultWithdrawalsApi:
    def __init__(self, client):
        self._client = client

    def list(self):
        return self._client._request_ok("/v1/vault/withdrawals")

    def open_stream(self, *, timeout=None):
        return self._client._open_stream("withdrawals", timeout=timeout)

    def stream(self, *, limit=1, timeout=None):
        return self._client._read_stream("withdrawals", limit=limit, timeout=timeout)

    def prepare(self, request):
        return self._client._request_expected_status(
            "/v1/vault/withdrawals/prepare",
            expected_status=501,
            method="POST",
            body={**request, "operation": "withdrawal"},
        )


class _VaultApi:
    def __init__(self, client):
        self.deposits = _VaultDepositsApi(client)
        self.withdrawals = _VaultWithdrawalsApi(client)


class _ListingPolicyApi:
    def __init__(self, client):
        self._client = client

    def get(self):
        return self._client._request_ok("/v1/listings/policy")


class _ListingReviewFlowApi:
    def __init__(self, client):
        self._client = client

    def get(self):
        return self._client._request_ok("/v1/listings/review-flow")


class _ListingRequestsApi:
    def __init__(self, client):
        self._client = client

    def prepare_submit(self, request):
        return self._client._request_expected_status(
            "/v1/listings/requests",
            expected_status=501,
            method="POST",
            body=request,
        )

    def list_local_review_queue(self):
        return self._client._request_ok("/v1/listings/requests")

    def enqueue_local_review(self, request):
        body = {**request, "requestMode": "local_review_queue"}
        return self._client._request_expected_status(
            "/v1/listings/requests",
            expected_status=202,
            method="POST",
            body=body,
        )

    def decide_local_review(self, request_id, decision):
        body = {**decision, "decisionMode": "local_review_decision"}
        return self._client._request_expected_status(
            f"/v1/listings/requests/{_encode_path_value(request_id)}/decision",
            expected_status=200,
            method="POST",
            body=body,
        )


class _ListingsApi:
    def __init__(self, client):
        self.policy = _ListingPolicyApi(client)
        self.review_flow = _ListingReviewFlowApi(client)
        self.requests = _ListingRequestsApi(client)


class _SettlementModeGateApi:
    def __init__(self, client):
        self._client = client

    def get(self):
        return self._client._request_ok("/v1/relayer/settlement-mode-gate")


class _RelayerApi:
    def __init__(self, client):
        self.settlement_mode_gate = _SettlementModeGateApi(client)


class _NoncesApi:
    def __init__(self, client):
        self._client = client

    def prepare_cancel(self, request):
        return self._client._request_expected_status(
            "/v1/nonces/cancel",
            expected_status=501,
            method="POST",
            body=request,
        )


class _OrdersApi:
    def __init__(self, client):
        self._client = client

    def list(self):
        return self._client._request_ok("/v1/orders")

    def submit_signed_order(self, order):
        return self._client._request_ok("/v1/orders", method="POST", body={"order": order})

    def cancel(self, order_hash):
        return self._client._request_ok(f"/v1/orders/{_encode_path_value(order_hash)}", method="DELETE")

    def cancel_all(self, *, market_id=None, owner=None):
        body = {key: value for key, value in {"marketId": market_id, "owner": owner}.items() if value is not None}
        return self._client._request_ok("/v1/orders/cancel-all", method="POST", body=body or None)


class _FillsApi:
    def __init__(self, client):
        self._client = client

    def list(self):
        return self._client._request_ok("/v1/fills")


class _TradesApi:
    def __init__(self, client):
        self._client = client

    def list(self, market_id):
        return self._client._request_ok(f"/v1/trades/{_encode_path_value(market_id)}")

    def open_stream(self, market_id, *, timeout=None):
        return self._client._open_stream(_market_trades_channel(market_id), timeout=timeout)

    def stream(self, market_id, *, limit=1, timeout=None):
        return self._client._read_stream(_market_trades_channel(market_id), limit=limit, timeout=timeout)


class _ProofsApi:
    def __init__(self, client):
        self._client = client

    def trade(self, trade_id):
        return self._client._request_ok(f"/v1/proofs/trades/{_encode_path_value(trade_id)}")


class _DelegateKeyRegistrationsApi:
    def __init__(self, client):
        self._client = client

    def open_stream(self, *, timeout=None):
        return self._client._open_stream("delegate-key-registrations", timeout=timeout)

    def stream(self, *, limit=1, timeout=None):
        return self._client._read_stream("delegate-key-registrations", limit=limit, timeout=timeout)


class _DelegateKeyRevocationsApi:
    def __init__(self, client):
        self._client = client

    def open_stream(self, *, timeout=None):
        return self._client._open_stream("delegate-key-revocations", timeout=timeout)

    def stream(self, *, limit=1, timeout=None):
        return self._client._read_stream("delegate-key-revocations", limit=limit, timeout=timeout)


class _DelegateKeysApi:
    def __init__(self, client):
        self._client = client
        self.registrations = _DelegateKeyRegistrationsApi(client)
        self.revocations = _DelegateKeyRevocationsApi(client)

    def list(self):
        return self._client._request_ok("/v1/delegate-keys")

    def list_registrations(self):
        return self._client._request_ok("/v1/delegate-keys/registrations")

    def list_revocations(self):
        return self._client._request_ok("/v1/delegate-keys/revocations")

    def prepare_register(self, request):
        return self._client._request_expected_status(
            "/v1/delegate-keys",
            expected_status=501,
            method="POST",
            body=request,
        )

    def prepare_revoke(self, key_id, request=None):
        return self._client._request_expected_status(
            f"/v1/delegate-keys/{_encode_path_value(key_id)}",
            expected_status=501,
            method="DELETE",
            body=request or {},
        )


class QDexClient:
    def __init__(self, *, base_url=DEFAULT_BASE_URL, timeout=5):
        self.base_url = _trim_trailing_slash(base_url)
        self.timeout = timeout
        self.markets = _MarketsApi(self)
        self.tickers = _TickersApi(self)
        self.orderbook = _OrderbookApi(self)
        self.contracts = _ContractsApi(self)
        self.fees = _FeesApi(self)
        self.account = _AccountApi(self)
        self.vault = _VaultApi(self)
        self.listings = _ListingsApi(self)
        self.relayer = _RelayerApi(self)
        self.nonces = _NoncesApi(self)
        self.orders = _OrdersApi(self)
        self.fills = _FillsApi(self)
        self.trades = _TradesApi(self)
        self.proofs = _ProofsApi(self)
        self.delegate_keys = _DelegateKeysApi(self)

    def _stream_url(self, channel):
        parts = urlsplit(self.base_url)
        scheme = "wss" if parts.scheme == "https" else "ws"
        return urlunsplit((scheme, parts.netloc, "/v1/ws", urlencode({"channel": channel}), ""))

    def _open_stream(self, channel, *, timeout=None):
        return QDexStream(
            channel=channel,
            url=self._stream_url(channel),
            timeout=self.timeout if timeout is None else timeout,
        )

    def _read_stream(self, channel, *, limit=1, timeout=None):
        if not isinstance(limit, int) or limit < 1:
            raise TypeError("QDex stream read limit must be a positive integer.")

        stream = self._open_stream(channel, timeout=timeout)
        messages = []
        try:
            while len(messages) < limit:
                messages.append(stream.next(timeout=timeout))
        finally:
            stream.close()
        return messages

    def _request_ok(self, path, *, method="GET", body=None):
        response = self._request(path, method=method, body=body)
        status = response["status"]
        if status < 200 or status >= 300:
            raise QDexHttpError(
                f"QDex API request failed for {path}: HTTP {status}",
                status=status,
                body=response["body"],
            )
        return response["body"]

    def _request_expected_status(self, path, *, expected_status, method="GET", body=None):
        response = self._request(path, method=method, body=body)
        status = response["status"]
        if status != expected_status:
            raise QDexHttpError(
                f"QDex API request for {path} returned HTTP {status}, expected HTTP {expected_status}",
                status=status,
                body=response["body"],
            )
        return response

    def _request(self, path, *, method="GET", body=None):
        data = None
        headers = {}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["content-type"] = "application/json"

        request = Request(f"{self.base_url}{path}", data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return {
                    "status": response.status,
                    "body": _read_json(response),
                }
        except HTTPError as exc:
            return {
                "status": exc.code,
                "body": _read_json(exc),
            }


def _read_json(response):
    raw = response.read().decode("utf-8").strip()
    if raw == "":
        return None
    return json.loads(raw)


def _first_fill_from(order_response):
    fills = order_response.get("fills") or []
    if len(fills) == 0:
        raise RuntimeError("Mock cross smoke expected the crossing order to produce one fill.")
    return fills[0]


def run_mock_cross_smoke(client, *, resting_sell=None, crossing_buy=None):
    if resting_sell is None:
        resting_sell = create_mock_signed_order(
            side="sell",
            amount="100",
            price="5",
            nonce="1001",
            owner=DEFAULT_OWNER,
        )
    if crossing_buy is None:
        crossing_buy = create_mock_signed_order(
            side="buy",
            amount="100",
            price="6",
            nonce="1002",
            owner="0x3333333333333333333333333333333333333333",
        )

    market_id = resting_sell["marketId"]
    book_before = client.orderbook.get(market_id)
    resting_order_initial = client.orders.submit_signed_order(resting_sell)
    book_with_resting = client.orderbook.get(market_id)
    crossing_order = client.orders.submit_signed_order(crossing_buy)
    fill = _first_fill_from(crossing_order)
    orders = client.orders.list()
    resting_order = next(
        (
            order
            for order in orders["orders"]
            if order["orderHash"] == resting_order_initial["orderHash"]
        ),
        resting_order_initial,
    )
    fills = client.fills.list()
    trades = client.trades.list(market_id)
    proof_envelope = client.proofs.trade(fill["tradeId"])
    book_after = client.orderbook.get(market_id)

    return {
        "market_id": market_id,
        "book_before": book_before,
        "book_with_resting": book_with_resting,
        "book_after": book_after,
        "resting_order": resting_order,
        "crossing_order": crossing_order,
        "fill": fill,
        "fills": fills,
        "trades": trades,
        "proof_envelope": proof_envelope,
        "proof": proof_envelope["proof"],
    }
