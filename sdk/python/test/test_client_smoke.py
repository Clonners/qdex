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
        for pipe in (self.process.stdout, self.process.stderr):
            if pipe is not None and not pipe.closed:
                pipe.close()


class QDexPythonSdkSmokeTest(unittest.TestCase):
    def test_python_sdk_exposes_local_only_contract_registry_metadata_without_wallet_or_deploy_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            registry = client.contracts.get()

            self.assertEqual(registry["deploymentStatus"], "local-only-not-deployed")
            self.assertFalse(registry["realQuaiTransactions"])
            self.assertFalse(registry["walletRequired"])
            self.assertIn("WQUAI, WQI", registry["assetListingCaveat"])
            self.assertEqual(registry["listedAssetStatus"]["status"], "wrapped-token-listing")
            self.assertEqual(registry["listedAssetStatus"]["primaryQuoteAssets"], ["WQUAI", "WQI"])
            self.assertEqual(registry["listedAssetStatus"]["supportedAssetModel"], "erc20-style-vault-token")
            self.assertTrue(registry["listedAssetStatus"]["userListedTokens"])
            self.assertEqual(registry["listedAssetStatus"]["listingFlowStatus"], "design-required")
            self.assertEqual(registry["listedAssetStatus"]["nativeQiTreatment"], "out-of-scope-direct-settlement-use-WQI")
            self.assertFalse(registry["listedAssetStatus"]["nativeQiDirectSettlement"])
            self.assertFalse(registry["listedAssetStatus"]["realQuaiTransactions"])
            self.assertFalse(registry["listedAssetStatus"]["walletRequired"])
            self.assertIn(
                "WQUAI, WQI, and approved community tokens",
                registry["listedAssetStatus"]["safetyNotice"],
            )
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

    def test_python_sdk_exposes_read_only_relayer_settlement_mode_gate_metadata_without_wallet_or_tx_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            gate = client.relayer.settlement_mode_gate.get()

            self.assertEqual(gate["source"], "relayer-approval-gate")
            self.assertEqual(gate["currentSettlementMode"], "mock")
            self.assertEqual(gate["custody"], "non-custodial-relayer-gate")
            self.assertFalse(gate["realQuaiTransactions"])
            self.assertFalse(gate["walletRequired"])
            self.assertEqual(
                gate["requiredEventTruthFields"],
                [
                    "settlementTx",
                    "blockNumber",
                    "blockHash",
                    "eventIndex",
                    "explorerUrl",
                ],
            )
            self.assertTrue(gate["modes"]["mock"]["allowed"])
            self.assertEqual(gate["modes"]["mock"]["reason"], "mock_mode_local_only")
            self.assertFalse(gate["modes"]["quai_contract"]["allowed"])
            self.assertEqual(gate["modes"]["quai_contract"]["reason"], "real_quai_approval_gate_blocked")
            self.assertIn("approval.explicitApproval", gate["modes"]["quai_contract"]["missingFields"])
            self.assertIn("eventTruth.requiredFields.settlementTx", gate["modes"]["quai_contract"]["missingFields"])
            self.assertTrue(gate["safety"]["noWalletLoading"])
            self.assertTrue(gate["safety"]["noSigning"])
            self.assertTrue(gate["safety"]["noBroadcast"])
            self.assertTrue(gate["safety"]["noRpcUrlAccess"])
            self.assertTrue(gate["safety"]["noTransactionSubmission"])
            self.assertEqual(gate["safety"]["proofTrigger"], "TradeSettled")

    def test_python_sdk_exposes_read_only_listing_policy_metadata_without_listing_admin_or_tx_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            policy = client.listings.policy.get()

            self.assertEqual(policy["source"], "listed-asset-marketregistry-policy")
            self.assertEqual(policy["status"], "design-only-local-metadata")
            self.assertEqual(policy["assetModel"], "erc20-style-vault-token")
            self.assertEqual(policy["primaryQuoteAssets"], ["WQUAI", "WQI"])
            self.assertEqual(
                [asset["symbol"] for asset in policy["supportedAssets"]],
                ["WQUAI", "WQI", "community-created-erc20-style-token"],
            )
            self.assertIsNone(policy["supportedAssets"][0]["address"])
            self.assertIsNone(policy["supportedAssets"][1]["address"])
            self.assertEqual(policy["supportedAssets"][2]["listingStatus"], "listable-after-review")
            self.assertEqual(policy["exampleMarkets"][0]["marketId"], "WQI-WQUAI")
            self.assertFalse(policy["exampleMarkets"][0]["custodyAuthority"])
            self.assertEqual(policy["marketRegistry"]["truthSource"], "MarketRegistry-enabled-pair-metadata")
            self.assertFalse(policy["marketRegistry"]["balanceMovement"])
            self.assertFalse(policy["marketRegistry"]["operatorWithdrawalAuthority"])
            self.assertEqual(policy["safety"]["delegatePermissions"], ["NO_WITHDRAW", "NO_ADMIN"])
            self.assertFalse(policy["safety"]["realQuaiTransactions"])
            self.assertFalse(policy["safety"]["walletRequired"])
            self.assertTrue(policy["safety"]["noWalletLoading"])
            self.assertTrue(policy["safety"]["noSigning"])
            self.assertTrue(policy["safety"]["noBroadcast"])
            self.assertTrue(policy["safety"]["noRpcUrlAccess"])
            self.assertTrue(policy["safety"]["noTransactionSubmission"])
            self.assertIn(
                "no wallet loading, signing, broadcast, RPC URL access, transaction submission, deploy, or real funds",
                policy["safety"]["notice"],
            )
            self.assertIn(
                "cannot move TradingVault balances or grant withdrawal/admin power",
                policy["marketRegistry"]["notes"],
            )

    def test_python_sdk_exposes_prepare_only_listing_request_placeholder_without_treating_501_as_submission_success(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            result = client.listings.requests.prepare_submit(
                {
                    "baseSymbol": "COMMUNITY",
                    "quoteSymbol": "WQUAI",
                    "tokenModel": "erc20-style-vault-token",
                    "requestedMarketId": "COMMUNITY-WQUAI",
                    "pricePrecision": 8,
                    "amountPrecision": 8,
                    "minAmount": "1",
                    "reviewNotes": "metadata-only local request",
                }
            )

            self.assertEqual(result["status"], 501)
            body = result["body"]
            self.assertEqual(body["error"], "listing_request_not_implemented")
            self.assertEqual(body["source"], "listed-asset-marketregistry-policy")
            self.assertEqual(body["status"], "design-only-local-metadata")
            self.assertEqual(body["requestStatus"], "not-implemented-approval-required")
            self.assertEqual(body["approvalGate"], "listing-submission-approval-gate")
            self.assertEqual(body["primaryQuoteAssets"], ["WQUAI", "WQI"])
            self.assertEqual(body["supportedAsset"], "community-created-erc20-style-token")
            self.assertEqual(body["permissions"], ["NO_WITHDRAW", "NO_ADMIN"])
            self.assertFalse(body["realQuaiTransactions"])
            self.assertFalse(body["walletRequired"])
            self.assertFalse(body["marketRegistry"]["marketRegistryMutation"])
            self.assertFalse(body["marketRegistry"]["canMoveTradingVaultBalances"])
            self.assertFalse(body["marketRegistry"]["canGrantWithdrawalAuthority"])
            self.assertTrue(body["safety"]["noRuntimeListingQueue"])
            self.assertTrue(body["safety"]["noListingAdminKeys"])
            self.assertTrue(body["safety"]["noRealTokenAddresses"])
            self.assertTrue(body["safety"]["noFundsMovement"])
            self.assertIn("no listing request was submitted", body["safety"]["notice"])
            self.assertIn(
                "does not submit listings, mutate MarketRegistry, move TradingVault balances, or grant withdrawal/admin authority",
                body["message"],
            )

    def test_python_sdk_exposes_owner_signed_nonce_cancel_prepare_placeholder_without_wallet_or_tx_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            result = client.nonces.prepare_cancel(
                {
                    "action": "cancelNonce",
                    "owner": "0x1111111111111111111111111111111111111111",
                    "nonce": "77",
                    "chainId": 0,
                    "nonceManagerContract": "0x0000000000000000000000000000000000000000",
                    "expiresAt": 1780003600,
                    "signature": "0xowner-signed-placeholder",
                }
            )

            self.assertEqual(result["status"], 501)
            body = result["body"]
            self.assertEqual(body["error"], "owner_signed_nonce_cancel_not_implemented")
            self.assertEqual(body["source"], "owner-signed-nonce-cancel-placeholder")
            self.assertEqual(body["custody"], "non-custodial")
            self.assertEqual(body["nonceManager"], "owner-signed-required")
            self.assertEqual(body["permissions"], ["NO_WITHDRAW", "NO_ADMIN"])
            self.assertNotIn("CANCEL_ORDER", body["permissions"])
            self.assertIn("Matcher-local cancellation does not mutate on-chain NonceManager nonces", body["message"])
            self.assertFalse(body["realQuaiTransactions"])
            self.assertFalse(body["walletRequired"])
            self.assertEqual(
                body["approvalGate"],
                "explicit-approval-required-before-wallet-signing-or-quai-broadcast",
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

    def test_python_sdk_cancel_all_cancels_mock_resting_orders_without_nonce_or_withdrawal_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)
            accepted_order = client.orders.submit_signed_order(
                create_mock_signed_order(
                    side="sell",
                    amount="100",
                    price="5",
                    nonce="1904",
                    owner="0x1111111111111111111111111111111111111111",
                )
            )
            self.assertEqual(accepted_order["status"], "open")

            cancel_result = client.orders.cancel_all(market_id="QI-QUAI")

            self.assertTrue(cancel_result["cancelled"])
            self.assertEqual(cancel_result["cancelledCount"], 1)
            self.assertEqual(cancel_result["permissions"], ["CANCEL_ALL", "CANCEL_ORDER", "NO_WITHDRAW", "NO_ADMIN"])
            self.assertEqual(cancel_result["nonceManager"], "matcher-local-cancel-only-on-chain-nonce-unchanged")
            self.assertIn("does not cancel the on-chain nonce", cancel_result["message"])
            self.assertEqual(cancel_result["cancelledOrders"][0]["orderHash"], accepted_order["orderHash"])
            self.assertEqual(cancel_result["cancelledOrders"][0]["status"], "cancelled")
            self.assertEqual(cancel_result["cancelledOrders"][0]["remainingAmount"], "0")
            self.assertEqual(cancel_result["cancelledOrders"][0]["nonceCancellation"], "not-implied-matcher-local-only")

            book_after_cancel = client.orderbook.get("QI-QUAI")
            self.assertEqual(book_after_cancel["asks"], [])

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
