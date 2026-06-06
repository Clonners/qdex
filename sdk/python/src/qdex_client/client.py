import json
from urllib.error import HTTPError
from urllib.parse import quote
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


def _trim_trailing_slash(value):
    return value.rstrip("/")


def _encode_path_value(value):
    return quote(value, safe="")


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


class _OrderbookApi:
    def __init__(self, client):
        self._client = client

    def get(self, market_id):
        return self._client._request_ok(f"/v1/orderbook/{_encode_path_value(market_id)}")


class _ContractsApi:
    def __init__(self, client):
        self._client = client

    def get(self):
        return self._client._request_ok("/v1/contracts")


class _OrdersApi:
    def __init__(self, client):
        self._client = client

    def list(self):
        return self._client._request_ok("/v1/orders")

    def submit_signed_order(self, order):
        return self._client._request_ok("/v1/orders", method="POST", body={"order": order})

    def cancel_all(self):
        return self._client._request("/v1/orders/cancel-all", method="POST")


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


class _ProofsApi:
    def __init__(self, client):
        self._client = client

    def trade(self, trade_id):
        return self._client._request_ok(f"/v1/proofs/trades/{_encode_path_value(trade_id)}")


class _DelegateKeysApi:
    def __init__(self, client):
        self._client = client

    def list(self):
        return self._client._request_ok("/v1/delegate-keys")


class QDexClient:
    def __init__(self, *, base_url=DEFAULT_BASE_URL, timeout=5):
        self.base_url = _trim_trailing_slash(base_url)
        self.timeout = timeout
        self.markets = _MarketsApi(self)
        self.tickers = _TickersApi(self)
        self.orderbook = _OrderbookApi(self)
        self.contracts = _ContractsApi(self)
        self.orders = _OrdersApi(self)
        self.fills = _FillsApi(self)
        self.trades = _TradesApi(self)
        self.proofs = _ProofsApi(self)
        self.delegate_keys = _DelegateKeysApi(self)

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
