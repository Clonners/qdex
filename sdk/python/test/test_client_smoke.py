import json
import os
import socket
import subprocess
import time
import unittest
from urllib.error import URLError
from urllib.request import urlopen

from qdex_client import QDexClient, create_mock_signed_order, run_mock_cross_smoke


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
API_SERVER = os.path.join(REPO_ROOT, "services", "api", "src", "server.js")


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class ApiServer:
    def __init__(self):
        self.port = find_free_port()
        self.base_url = f"http://127.0.0.1:{self.port}"
        env = os.environ.copy()
        env["PORT"] = str(self.port)
        self.process = subprocess.Popen(
            ["node", API_SERVER],
            cwd=REPO_ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def __enter__(self):
        deadline = time.monotonic() + 5
        last_error = None
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                stdout, stderr = self.process.communicate(timeout=1)
                raise RuntimeError(f"API server exited early\nstdout={stdout}\nstderr={stderr}")
            try:
                with urlopen(f"{self.base_url}/v1/health", timeout=0.2) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                if payload.get("ok") is True:
                    return self
            except (URLError, TimeoutError, OSError) as exc:
                last_error = exc
                time.sleep(0.05)
        self.stop()
        raise RuntimeError(f"API server did not become ready: {last_error}")

    def __exit__(self, exc_type, exc, tb):
        self.stop()

    def stop(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)


class QDexPythonSdkSmokeTest(unittest.TestCase):
    def test_python_sdk_exposes_local_only_contract_registry_metadata_without_wallet_or_deploy_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            registry = client.contracts.get()

            self.assertEqual(registry["deploymentStatus"], "local-only-not-deployed")
            self.assertFalse(registry["realQuaiTransactions"])
            self.assertFalse(registry["walletRequired"])
            self.assertIn("UTXO-model", registry["nativeQiCaveat"])
            self.assertIsNone(registry["contracts"]["tradingVault"]["address"])
            self.assertFalse(registry["contracts"]["tradingVault"]["operatorWithdrawalAuthority"])
            self.assertEqual(registry["contracts"]["settlement"]["proofTrigger"], "TradeSettled")
            self.assertEqual(
                registry["contracts"]["settlement"]["dependencies"],
                [
                    "TradingVault",
                    "NonceManager",
                    "MarketRegistry",
                    "FeeManager",
                    "DelegateKeyRegistry",
                ],
            )
            self.assertEqual(registry["contracts"]["nonceManager"]["nonceTruth"], "external-nonce-manager")
            self.assertEqual(registry["contracts"]["marketRegistry"]["marketTruth"], "external-market-registry")
            self.assertEqual(registry["contracts"]["feeManager"]["feeTruth"], "external-fee-manager")
            self.assertEqual(
                registry["contracts"]["delegateKeyRegistry"]["requiredPermissions"],
                ["PLACE_ORDER", "NO_WITHDRAW", "NO_ADMIN"],
            )
            self.assertEqual(
                registry["safety"]["approvalGate"],
                "explicit-approval-required-before-deploy-or-transaction",
            )

    def test_python_sdk_smoke_drives_mock_api_order_fill_proof_loop_without_custody_shortcuts(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            markets = client.markets.list()
            self.assertEqual(markets[0]["id"], "QI-QUAI")

            book_before = client.orderbook.get("QI-QUAI")
            self.assertEqual(book_before["source"], "mock-orderbook")
            self.assertEqual(book_before["bids"], [])
            self.assertEqual(book_before["asks"], [])

            resting_sell = create_mock_signed_order(
                side="sell",
                amount="100",
                price="5",
                nonce="1901",
                owner="0x1111111111111111111111111111111111111111",
            )
            crossing_buy = create_mock_signed_order(
                side="buy",
                amount="100",
                price="6",
                nonce="1902",
                owner="0x3333333333333333333333333333333333333333",
            )

            smoke = run_mock_cross_smoke(client, resting_sell=resting_sell, crossing_buy=crossing_buy)

            self.assertEqual(smoke["market_id"], "QI-QUAI")
            self.assertEqual(smoke["resting_order"]["status"], "filled")
            self.assertEqual(smoke["crossing_order"]["status"], "filled")
            self.assertEqual(smoke["fill"]["fillId"], "fill-000001")
            self.assertEqual(smoke["fill"]["projectionType"], "IndexedFillProjection")
            self.assertEqual(smoke["fill"]["tradeId"], "trade-000001")
            self.assertEqual(smoke["fill"]["sourceEventId"], "event-000001")
            self.assertEqual(smoke["fill"]["settlementMode"], "mock")
            self.assertEqual(smoke["fill"]["settlementStatus"], "confirmed")
            self.assertNotIn("createdAt", smoke["fill"])

            self.assertEqual(smoke["fills"]["source"], "in-memory-indexer-projection")
            self.assertEqual(smoke["fills"]["fills"], [smoke["fill"]])

            self.assertEqual(smoke["trades"]["source"], "in-memory-indexer-projection")
            self.assertEqual(smoke["trades"]["trades"][0]["proofUrl"], "/v1/proofs/trades/trade-000001")

            self.assertEqual(smoke["proof_envelope"]["source"], "proof-service-indexer-projection")
            proof = smoke["proof"]
            self.assertEqual(proof["settlementMode"], "mock")
            self.assertEqual(proof["mockSettlementReference"], "mock-settlement-fill-000001")
            self.assertIsNone(proof["settlementTx"])
            self.assertIsNone(proof["blockNumber"])
            self.assertIsNone(proof["blockHash"])
            self.assertIsNone(proof["explorerUrl"])
            self.assertIn("no real Quai transaction, no explorer URL, no funds moved", proof["safetyNotice"])

            delegate_keys = client.delegate_keys.list()
            self.assertIn("NO_WITHDRAW", delegate_keys["defaultPermissions"])
            self.assertIn("NO_ADMIN", delegate_keys["defaultPermissions"])

    def test_python_sdk_preserves_market_ioc_as_signed_ioc_limit_order_with_slippage_bounds(self):
        order = create_mock_signed_order(
            side="sell",
            type="market_ioc",
            time_in_force="IOC",
            max_slippage_bps=50,
            nonce="1903",
        )

        self.assertEqual(order["type"], "market_ioc")
        self.assertEqual(order["timeInForce"], "IOC")
        self.assertEqual(order["maxSlippageBps"], 50)
        self.assertEqual(order["signature"]["scheme"], "mock")
        self.assertEqual(order["signature"]["signer"], order["owner"])


if __name__ == "__main__":
    unittest.main()
