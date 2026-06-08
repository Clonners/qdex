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


def local_listing_review_request(**overrides):
    request = {
        "baseSymbol": "COMMUNITY",
        "quoteSymbol": "WQI",
        "tokenModel": "erc20-style-vault-token",
        "requestedMarketId": "COMMUNITY-WQI",
        "pricePrecision": 8,
        "amountPrecision": 8,
        "minAmount": "1",
        "reviewNotes": "metadata-only local queue request from Python SDK",
    }
    request.update(overrides)
    return request


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

    def test_python_sdk_exposes_read_only_mock_vault_balances_without_wallet_or_withdrawal_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            balances = client.account.balances()

            self.assertEqual(balances["balances"], [])
            self.assertEqual(balances["source"], "mock-vault-projection")
            self.assertEqual(balances["custody"], "non-custodial-contract-vault")
            self.assertEqual(balances["permissions"], ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"])
            self.assertEqual(balances["withdrawalAuthority"], "owner-wallet-only")
            self.assertEqual(balances["settlementMode"], "mock")
            self.assertFalse(balances["realQuaiTransactions"])
            self.assertFalse(balances["walletRequired"])
            self.assertIn("no wallet loaded, no funds moved", balances["safetyNotice"])

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

    def test_python_sdk_exposes_read_only_listing_review_flow_metadata_without_marketregistry_mutation_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            review_flow = client.listings.review_flow.get()

            self.assertEqual(review_flow["source"], "listed-asset-marketregistry-review-flow")
            self.assertEqual(review_flow["status"], "design-only-local-metadata")
            self.assertEqual(review_flow["phase"], "clonners-managed-local-review-before-dao")
            self.assertEqual(
                review_flow["requestSurface"],
                "prepare-only POST /v1/listings/requests; POST /v1/listings/requests with requestMode=local_review_queue; GET /v1/listings/requests inspection; POST /v1/listings/requests/{requestId}/decision with decisionMode=local_review_decision",
            )
            self.assertEqual(
                review_flow["clientSurface"],
                "TypeScript/Python/qdex listing policy, review-flow, local queue, and local decision clients",
            )
            self.assertEqual(
                [stage["id"] for stage in review_flow["stages"]],
                [
                    "metadata_intake",
                    "token_safety_review",
                    "market_parameter_review",
                    "clonners_local_approval",
                    "marketregistry_admin_gate",
                ],
            )
            self.assertEqual(review_flow["approvalOutcome"]["approvedStatus"], "approved-local-metadata-only")
            self.assertEqual(review_flow["approvalOutcome"]["rejectedStatus"], "rejected-local-metadata-only")
            self.assertFalse(review_flow["approvalOutcome"]["marketRegistryMutation"])
            self.assertFalse(review_flow["approvalOutcome"]["realQuaiTransactions"])
            self.assertEqual(review_flow["safety"]["permissions"], ["NO_WITHDRAW", "NO_ADMIN"])
            self.assertFalse(review_flow["safety"]["marketRegistryMutation"])
            self.assertFalse(review_flow["safety"]["realQuaiTransactions"])
            self.assertFalse(review_flow["safety"]["walletRequired"])
            self.assertTrue(review_flow["safety"]["noWalletLoading"])
            self.assertTrue(review_flow["safety"]["noRpcUrlAccess"])
            self.assertTrue(review_flow["safety"]["noSigning"])
            self.assertTrue(review_flow["safety"]["noBroadcast"])
            self.assertTrue(review_flow["safety"]["noDeploys"])
            self.assertTrue(review_flow["safety"]["noTransactionSubmission"])
            self.assertTrue(review_flow["safety"]["noListingAdminKeys"])
            self.assertTrue(review_flow["safety"]["noRealTokenAddresses"])
            self.assertTrue(review_flow["safety"]["noFundsMovement"])
            self.assertIn(
                "approved in-memory queue/decision state only; it does not mutate MarketRegistry, move TradingVault balances, grant withdrawal/admin authority",
                review_flow["safety"]["notice"],
            )

    def test_python_sdk_queues_and_inspects_local_listing_review_requests_without_marketregistry_mutation_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            empty_queue = client.listings.requests.list_local_review_queue()
            self.assertEqual(empty_queue["source"], "listed-asset-marketregistry-review-flow")
            self.assertEqual(empty_queue["status"], "design-only-local-metadata")
            self.assertEqual(empty_queue["phase"], "clonners-managed-local-review-before-dao")
            self.assertEqual(empty_queue["queueStatus"], "local-in-memory-review-queue")
            self.assertEqual(empty_queue["persistence"], "in-memory-local-server-only")
            self.assertEqual(empty_queue["count"], 0)
            self.assertEqual(empty_queue["requests"], [])
            self.assertEqual(empty_queue["safety"]["permissions"], ["NO_WITHDRAW", "NO_ADMIN"])
            self.assertFalse(empty_queue["safety"]["marketRegistryMutation"])
            self.assertFalse(empty_queue["safety"]["realQuaiTransactions"])
            self.assertFalse(empty_queue["safety"]["walletRequired"])

            queued_result = client.listings.requests.enqueue_local_review(local_listing_review_request())
            self.assertEqual(queued_result["status"], 202)

            queued = queued_result["body"]
            self.assertEqual(queued["source"], "listed-asset-marketregistry-review-flow")
            self.assertEqual(queued["status"], "design-only-local-metadata")
            self.assertEqual(queued["requestStatus"], "queued-local-review")
            self.assertEqual(queued["phase"], "clonners-managed-local-review-before-dao")
            self.assertEqual(queued["requestMode"], "local_review_queue")
            self.assertEqual(queued["reviewStage"], "metadata_intake")
            self.assertEqual(queued["reviewDecision"], "pending-local-review")
            self.assertFalse(queued["marketRegistry"]["marketRegistryMutation"])
            self.assertFalse(queued["marketRegistry"]["canMoveTradingVaultBalances"])
            self.assertFalse(queued["marketRegistry"]["canGrantWithdrawalAuthority"])
            self.assertEqual(queued["permissions"], ["NO_WITHDRAW", "NO_ADMIN"])
            self.assertFalse(queued["realQuaiTransactions"])
            self.assertFalse(queued["walletRequired"])
            self.assertTrue(queued["safety"]["noWalletLoading"])
            self.assertTrue(queued["safety"]["noRpcUrlAccess"])
            self.assertTrue(queued["safety"]["noSigning"])
            self.assertTrue(queued["safety"]["noBroadcast"])
            self.assertTrue(queued["safety"]["noDeploys"])
            self.assertTrue(queued["safety"]["noTransactionSubmission"])
            self.assertTrue(queued["safety"]["noListingAdminKeys"])
            self.assertTrue(queued["safety"]["noRealTokenAddresses"])
            self.assertTrue(queued["safety"]["noFundsMovement"])
            self.assertIn("in-memory local review queue", queued["message"])
            self.assertIn("does not mutate MarketRegistry", queued["message"])
            self.assertEqual(queued["request"], local_listing_review_request())

            queue = client.listings.requests.list_local_review_queue()
            self.assertEqual(queue["count"], 1)
            self.assertEqual(queue["requests"], [queued])

    def test_python_sdk_records_local_listing_review_decisions_without_marketregistry_mutation_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)
            queued_result = client.listings.requests.enqueue_local_review(
                local_listing_review_request(reviewNotes="metadata-only local decision request from Python SDK")
            )
            queued = queued_result["body"]

            decision_result = client.listings.requests.decide_local_review(
                queued["requestId"],
                {
                    "decision": "reject",
                    "reviewStage": "token_safety_review",
                    "decisionNotes": "rejected locally for metadata-only smoke coverage",
                    "rejectionReason": "metadata-incomplete-local-only",
                },
            )

            self.assertEqual(decision_result["status"], 200)
            decision = decision_result["body"]
            self.assertEqual(decision["requestId"], queued["requestId"])
            self.assertEqual(decision["source"], "listed-asset-marketregistry-review-flow")
            self.assertEqual(decision["status"], "design-only-local-metadata")
            self.assertEqual(decision["requestStatus"], "reviewed-local-metadata-only")
            self.assertEqual(decision["phase"], "clonners-managed-local-review-before-dao")
            self.assertEqual(decision["decisionMode"], "local_review_decision")
            self.assertEqual(decision["reviewStage"], "token_safety_review")
            self.assertEqual(decision["reviewDecision"], "rejected-local-metadata-only")
            self.assertEqual(
                decision["nextMutationGate"],
                "explicit Clonners approval required before MarketRegistry.addMarket",
            )
            self.assertEqual(
                decision["decision"],
                {
                    "decision": "reject",
                    "rejectionReason": "metadata-incomplete-local-only",
                    "decisionNotes": "rejected locally for metadata-only smoke coverage",
                },
            )
            self.assertEqual(decision["permissions"], ["NO_WITHDRAW", "NO_ADMIN"])
            self.assertFalse(decision["realQuaiTransactions"])
            self.assertFalse(decision["walletRequired"])
            self.assertFalse(decision["marketRegistry"]["marketRegistryMutation"])
            self.assertFalse(decision["marketRegistry"]["canMoveTradingVaultBalances"])
            self.assertFalse(decision["marketRegistry"]["canGrantWithdrawalAuthority"])
            self.assertTrue(decision["safety"]["noWalletLoading"])
            self.assertTrue(decision["safety"]["noRpcUrlAccess"])
            self.assertTrue(decision["safety"]["noSigning"])
            self.assertTrue(decision["safety"]["noBroadcast"])
            self.assertTrue(decision["safety"]["noDeploys"])
            self.assertTrue(decision["safety"]["noTransactionSubmission"])
            self.assertTrue(decision["safety"]["noListingAdminKeys"])
            self.assertTrue(decision["safety"]["noRealTokenAddresses"])
            self.assertTrue(decision["safety"]["noFundsMovement"])
            self.assertIn("Recorded local rejection metadata only", decision["message"])
            self.assertIn("does not mutate MarketRegistry", decision["message"])

            queue = client.listings.requests.list_local_review_queue()
            self.assertEqual(queue["requests"][0]["requestId"], queued["requestId"])
            self.assertEqual(queue["requests"][0]["reviewDecision"], "rejected-local-metadata-only")

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
