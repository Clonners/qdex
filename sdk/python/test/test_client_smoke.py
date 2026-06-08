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

    def test_python_sdk_exposes_read_only_local_account_overview_without_wallet_or_custody_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            account = client.account.get()

            self.assertIsNone(account["account"])
            self.assertEqual(account["source"], "mock-account-overview")
            self.assertEqual(account["custody"], "non-custodial-contract-vault")
            self.assertEqual(account["session"]["mode"], "mock-local-no-wallet-session")
            self.assertFalse(account["session"]["authenticated"])
            self.assertFalse(account["session"]["walletRequired"])
            self.assertEqual(account["permissions"], ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"])
            self.assertEqual(account["balances"]["source"], "mock-vault-projection")
            self.assertEqual(account["balances"]["balances"], [])
            self.assertEqual(account["orders"]["source"], "mock-order-projection")
            self.assertTrue(account["orders"]["matcherLocalOnly"])
            self.assertEqual(account["orders"]["open"], [])
            self.assertEqual(account["fills"]["source"], "in-memory-indexer-projection")
            self.assertEqual(account["fills"]["projectionType"], "IndexedFillProjection")
            self.assertTrue(account["fills"]["confirmedOnly"])
            self.assertEqual(account["fills"]["items"], [])
            self.assertEqual(account["settlementMode"], "mock")
            self.assertFalse(account["realQuaiTransactions"])
            self.assertFalse(account["walletRequired"])
            self.assertFalse(account["fundsMoved"])
            self.assertFalse(account["tradingVaultMutation"])
            self.assertTrue(account["safety"]["noWalletLoading"])
            self.assertTrue(account["safety"]["noRpcUrlAccess"])
            self.assertTrue(account["safety"]["noSigning"])
            self.assertTrue(account["safety"]["noBroadcast"])
            self.assertTrue(account["safety"]["noDeploys"])
            self.assertTrue(account["safety"]["noTransactionSubmission"])
            self.assertTrue(account["safety"]["noFundsMovement"])
            self.assertFalse(account["safety"]["delegateCanWithdraw"])
            self.assertFalse(account["safety"]["delegateCanAdmin"])
            self.assertIn("no real Quai transaction, no wallet loaded, no funds moved", account["safety"]["notice"])

    def test_python_sdk_exposes_prepare_only_owner_wallet_vault_operation_placeholders_without_tx_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)
            base_request = {
                "owner": "0x1111111111111111111111111111111111111111",
                "assetSymbol": "WQI",
                "amount": "10",
                "chainId": 0,
                "vaultContractRef": "local-only-not-deployed",
            }

            deposit = client.vault.deposits.prepare(base_request)
            self.assertEqual(deposit["status"], 501)
            body = deposit["body"]
            self.assertEqual(body["error"], "owner_wallet_vault_deposit_not_implemented")
            self.assertEqual(body["source"], "owner-wallet-vault-operation-placeholder")
            self.assertEqual(body["custody"], "non-custodial-contract-vault")
            self.assertEqual(body["vaultOperation"], "deposit")
            self.assertEqual(body["operationStatus"], "prepare-only-not-implemented")
            self.assertEqual(body["ownerAuthorization"], "owner-wallet-required")
            self.assertEqual(body["permissions"], ["NO_WITHDRAW", "NO_ADMIN"])
            self.assertEqual(body["delegateAuthority"], "delegates-cannot-deposit-or-withdraw")
            self.assertFalse(body["realQuaiTransactions"])
            self.assertFalse(body["walletRequired"])
            self.assertFalse(body["fundsMoved"])
            self.assertFalse(body["tradingVaultMutation"])
            self.assertTrue(body["safety"]["noWalletLoading"])
            self.assertTrue(body["safety"]["noRpcUrlAccess"])
            self.assertTrue(body["safety"]["noSigning"])
            self.assertTrue(body["safety"]["noBroadcast"])
            self.assertTrue(body["safety"]["noTransactionSubmission"])
            self.assertTrue(body["safety"]["noFundsMovement"])
            self.assertTrue(body["safety"]["noDelegateWithdrawalAuthority"])
            self.assertTrue(body["safety"]["noAdminWithdrawalAuthority"])
            self.assertIn("owner-wallet-only", body["message"])
            self.assertIn("does not load wallets, sign, broadcast, submit transactions, mutate TradingVault, or move funds", body["message"])

            withdrawal = client.vault.withdrawals.prepare({**base_request, "assetSymbol": "WQUAI", "amount": "1.5"})
            self.assertEqual(withdrawal["status"], 501)
            withdrawal_body = withdrawal["body"]
            self.assertEqual(withdrawal_body["error"], "owner_wallet_vault_withdrawal_not_implemented")
            self.assertEqual(withdrawal_body["vaultOperation"], "withdrawal")
            self.assertEqual(withdrawal_body["ownerAuthorization"], "owner-wallet-required")
            self.assertEqual(withdrawal_body["permissions"], ["NO_WITHDRAW", "NO_ADMIN"])
            self.assertEqual(withdrawal_body["delegateAuthority"], "delegates-cannot-deposit-or-withdraw")
            self.assertFalse(withdrawal_body["realQuaiTransactions"])
            self.assertFalse(withdrawal_body["walletRequired"])
            self.assertFalse(withdrawal_body["fundsMoved"])
            self.assertFalse(withdrawal_body["tradingVaultMutation"])
            self.assertIn(
                "no wallet is loaded, no signature is created, no RPC URL is read, no transaction is submitted, and no funds move",
                withdrawal_body["safety"]["notice"],
            )

    def test_python_sdk_exposes_prepare_only_delegate_key_registration_and_revocation_clients_without_wallet_or_admin_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)
            delegate_request = {
                "owner": "0x1111111111111111111111111111111111111111",
                "delegate": "0x3333333333333333333333333333333333333333",
                "allowedMarkets": ["QI-QUAI"],
                "maxNotional": "1000",
                "permissions": ["PLACE_ORDER", "CANCEL_ORDER", "CANCEL_ALL", "NO_WITHDRAW", "NO_ADMIN"],
                "expiresAt": 1780003600,
                "signature": "0xowner-signed-placeholder",
            }

            registration = client.delegate_keys.prepare_register(delegate_request)
            self.assertEqual(registration["status"], 501)
            body = registration["body"]
            self.assertEqual(body["error"], "delegate_key_registration_not_implemented")
            self.assertEqual(body["source"], "delegate-key-owner-signed-prepare-boundary")
            self.assertEqual(body["operation"], "register_delegate_key")
            self.assertEqual(body["operationStatus"], "prepare-only-owner-signed-required")
            self.assertEqual(body["ownerAuthorization"], "owner-wallet-signature-required")
            self.assertEqual(body["permissions"], ["PLACE_ORDER", "CANCEL_ORDER", "CANCEL_ALL", "NO_WITHDRAW", "NO_ADMIN"])
            self.assertFalse(body["delegateCanWithdraw"])
            self.assertFalse(body["delegateCanAdmin"])
            self.assertFalse(body["realQuaiTransactions"])
            self.assertFalse(body["walletRequired"])
            self.assertFalse(body["fundsMoved"])
            self.assertFalse(body["tradingVaultMutation"])
            self.assertIn("No delegate key is registered", body["message"])
            self.assertIn(
                "not wired to wallet loading, signing, broadcast, deploy, transaction helpers, live DelegateKeyRegistry mutation, TradingVault mutation, or funds movement",
                body["message"],
            )

            revocation = client.delegate_keys.prepare_revoke(
                "bot-mm-1",
                {"owner": delegate_request["owner"], "signature": delegate_request["signature"]},
            )
            self.assertEqual(revocation["status"], 501)
            revoke_body = revocation["body"]
            self.assertEqual(revoke_body["error"], "delegate_key_revocation_not_implemented")
            self.assertEqual(revoke_body["source"], "delegate-key-owner-signed-prepare-boundary")
            self.assertEqual(revoke_body["operation"], "revoke_delegate_key")
            self.assertEqual(revoke_body["keyId"], "bot-mm-1")
            self.assertEqual(revoke_body["permissions"], ["NO_WITHDRAW", "NO_ADMIN"])
            self.assertFalse(revoke_body["delegateCanWithdraw"])
            self.assertFalse(revoke_body["delegateCanAdmin"])
            self.assertFalse(revoke_body["realQuaiTransactions"])
            self.assertFalse(revoke_body["walletRequired"])
            self.assertFalse(revoke_body["fundsMoved"])
            self.assertFalse(revoke_body["tradingVaultMutation"])
            self.assertIn("No delegate key is revoked", revoke_body["message"])

    def test_python_sdk_lists_read_only_delegatekeyregistry_registration_and_revocation_histories_without_wallet_or_mutation_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            registrations = client.delegate_keys.list_registrations()
            self.assertEqual(registrations["registrations"], [])
            self.assertEqual(registrations["source"], "delegatekeyregistry-event-projection")
            self.assertEqual(registrations["projectionType"], "DelegateKeyRegisteredProjection")
            self.assertEqual(registrations["eventName"], "DelegateKeyRegistered")
            self.assertEqual(registrations["custody"], "non-custodial-no-withdrawal-authority")
            self.assertEqual(registrations["permissions"], ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"])
            self.assertEqual(registrations["settlementMode"], "mock")
            self.assertIsNone(registrations["settlementTx"])
            self.assertIsNone(registrations["blockNumber"])
            self.assertIsNone(registrations["blockHash"])
            self.assertIsNone(registrations["eventIndex"])
            self.assertIsNone(registrations["explorerUrl"])
            self.assertFalse(registrations["realQuaiTransactions"])
            self.assertFalse(registrations["walletRequired"])
            self.assertFalse(registrations["fundsMoved"])
            self.assertFalse(registrations["tradingVaultMutation"])
            self.assertFalse(registrations["delegateKeyRegistryMutation"])
            self.assertFalse(registrations["delegateCanWithdraw"])
            self.assertFalse(registrations["delegateCanAdmin"])
            self.assertIn("Read-only DelegateKeyRegistry DelegateKeyRegistered history projection", registrations["safetyNotice"])

            revocations = client.delegate_keys.list_revocations()
            self.assertEqual(revocations["revocations"], [])
            self.assertEqual(revocations["source"], "delegatekeyregistry-event-projection")
            self.assertEqual(revocations["projectionType"], "DelegateKeyRevokedProjection")
            self.assertEqual(revocations["eventName"], "DelegateKeyRevoked")
            self.assertEqual(revocations["custody"], "non-custodial-no-withdrawal-authority")
            self.assertEqual(revocations["permissions"], ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"])
            self.assertEqual(revocations["settlementMode"], "mock")
            self.assertIsNone(revocations["settlementTx"])
            self.assertIsNone(revocations["blockNumber"])
            self.assertIsNone(revocations["blockHash"])
            self.assertIsNone(revocations["eventIndex"])
            self.assertIsNone(revocations["explorerUrl"])
            self.assertFalse(revocations["realQuaiTransactions"])
            self.assertFalse(revocations["walletRequired"])
            self.assertFalse(revocations["fundsMoved"])
            self.assertFalse(revocations["tradingVaultMutation"])
            self.assertFalse(revocations["delegateKeyRegistryMutation"])
            self.assertFalse(revocations["delegateCanWithdraw"])
            self.assertFalse(revocations["delegateCanAdmin"])
            self.assertIn("Read-only DelegateKeyRegistry DelegateKeyRevoked history projection", revocations["safetyNotice"])

    def test_python_sdk_consumes_private_delegatekeyregistry_registration_and_revocation_history_streams_without_wallet_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)
            registrations_stream = client.delegate_keys.registrations.open_stream(timeout=2)

            try:
                registration_message = registrations_stream.next()
                self.assertEqual(registration_message["type"], "snapshot")
                self.assertEqual(registration_message["transport"], "websocket")
                registration_snapshot = registration_message["snapshot"]
                self.assertEqual(registration_snapshot["channel"], "delegate-key-registrations")
                self.assertEqual(registration_snapshot["visibility"], "private")
                self.assertEqual(registration_snapshot["payload"], "delegate_key_registration_projection")
                self.assertEqual(registration_snapshot["source"], "delegatekeyregistry-event-projection")
                self.assertEqual(registration_snapshot["custody"], "non-custodial-no-withdrawal-authority")
                self.assertEqual(registration_snapshot["permissions"], ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"])
                self.assertEqual(
                    registration_snapshot["safetyNotice"],
                    "Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.",
                )
                self.assertEqual(registration_snapshot["data"]["registrations"], [])
                self.assertEqual(registration_snapshot["data"]["projectionType"], "DelegateKeyRegisteredProjection")
                self.assertEqual(registration_snapshot["data"]["eventName"], "DelegateKeyRegistered")
                self.assertEqual(registration_snapshot["data"]["settlementMode"], "mock")
                self.assertIsNone(registration_snapshot["data"]["settlementTx"])
                self.assertIsNone(registration_snapshot["data"]["blockNumber"])
                self.assertIsNone(registration_snapshot["data"]["blockHash"])
                self.assertIsNone(registration_snapshot["data"]["eventIndex"])
                self.assertIsNone(registration_snapshot["data"]["explorerUrl"])
                self.assertFalse(registration_snapshot["data"]["realQuaiTransactions"])
                self.assertFalse(registration_snapshot["data"]["walletRequired"])
                self.assertFalse(registration_snapshot["data"]["fundsMoved"])
                self.assertFalse(registration_snapshot["data"]["tradingVaultMutation"])
                self.assertFalse(registration_snapshot["data"]["delegateKeyRegistryMutation"])
                self.assertFalse(registration_snapshot["data"]["delegateCanWithdraw"])
                self.assertFalse(registration_snapshot["data"]["delegateCanAdmin"])
            finally:
                registrations_stream.close()

            revocation_messages = client.delegate_keys.revocations.stream(limit=1, timeout=2)
            self.assertEqual(len(revocation_messages), 1)
            revocation_message = revocation_messages[0]
            self.assertEqual(revocation_message["type"], "snapshot")
            revocation_snapshot = revocation_message["snapshot"]
            self.assertEqual(revocation_snapshot["channel"], "delegate-key-revocations")
            self.assertEqual(revocation_snapshot["visibility"], "private")
            self.assertEqual(revocation_snapshot["payload"], "delegate_key_revocation_projection")
            self.assertEqual(revocation_snapshot["source"], "delegatekeyregistry-event-projection")
            self.assertEqual(revocation_snapshot["permissions"], ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"])
            self.assertEqual(revocation_snapshot["data"]["revocations"], [])
            self.assertEqual(revocation_snapshot["data"]["projectionType"], "DelegateKeyRevokedProjection")
            self.assertEqual(revocation_snapshot["data"]["eventName"], "DelegateKeyRevoked")
            self.assertEqual(revocation_snapshot["data"]["settlementMode"], "mock")
            self.assertIsNone(revocation_snapshot["data"]["settlementTx"])
            self.assertIsNone(revocation_snapshot["data"]["explorerUrl"])
            self.assertFalse(revocation_snapshot["data"]["realQuaiTransactions"])
            self.assertFalse(revocation_snapshot["data"]["walletRequired"])
            self.assertFalse(revocation_snapshot["data"]["fundsMoved"])
            self.assertFalse(revocation_snapshot["data"]["tradingVaultMutation"])
            self.assertFalse(revocation_snapshot["data"]["delegateKeyRegistryMutation"])
            self.assertFalse(revocation_snapshot["data"]["delegateCanWithdraw"])
            self.assertFalse(revocation_snapshot["data"]["delegateCanAdmin"])

    def test_python_sdk_lists_read_only_tradingvault_deposit_and_withdrawal_history_without_wallet_or_mutation_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            deposits = client.vault.deposits.list()
            self.assertEqual(deposits["deposits"], [])
            self.assertEqual(deposits["source"], "tradingvault-event-projection")
            self.assertEqual(deposits["projectionType"], "TradingVaultDepositProjection")
            self.assertEqual(deposits["eventName"], "Deposit")
            self.assertEqual(deposits["custody"], "non-custodial-contract-vault")
            self.assertEqual(deposits["permissions"], ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"])
            self.assertEqual(deposits["settlementMode"], "mock")
            self.assertIsNone(deposits["settlementTx"])
            self.assertIsNone(deposits["blockNumber"])
            self.assertIsNone(deposits["blockHash"])
            self.assertIsNone(deposits["eventIndex"])
            self.assertIsNone(deposits["explorerUrl"])
            self.assertFalse(deposits["realQuaiTransactions"])
            self.assertFalse(deposits["walletRequired"])
            self.assertFalse(deposits["fundsMoved"])
            self.assertFalse(deposits["tradingVaultMutation"])
            self.assertIn("mock rows have no real Quai transaction, no wallet loaded, no funds moved", deposits["safetyNotice"])

            withdrawals = client.vault.withdrawals.list()
            self.assertEqual(withdrawals["withdrawals"], [])
            self.assertEqual(withdrawals["source"], "tradingvault-event-projection")
            self.assertEqual(withdrawals["projectionType"], "TradingVaultWithdrawalProjection")
            self.assertEqual(withdrawals["eventName"], "Withdraw")
            self.assertEqual(withdrawals["permissions"], ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"])
            self.assertEqual(withdrawals["settlementMode"], "mock")
            self.assertIsNone(withdrawals["settlementTx"])
            self.assertIsNone(withdrawals["blockNumber"])
            self.assertIsNone(withdrawals["blockHash"])
            self.assertIsNone(withdrawals["eventIndex"])
            self.assertIsNone(withdrawals["explorerUrl"])
            self.assertFalse(withdrawals["realQuaiTransactions"])
            self.assertFalse(withdrawals["walletRequired"])
            self.assertFalse(withdrawals["fundsMoved"])
            self.assertFalse(withdrawals["tradingVaultMutation"])

    def test_python_sdk_exposes_read_only_feemanager_fee_schedule_metadata_without_fee_authority_or_tx_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)

            fees = client.fees.get()

            self.assertEqual(fees["source"], "feemanager-policy-projection")
            self.assertEqual(fees["status"], "local-only-not-deployed")
            self.assertEqual(fees["custody"], "non-custodial-fee-policy")
            self.assertEqual(fees["permissions"], ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"])
            self.assertEqual(fees["hardMaxFeeBps"], 1000)
            self.assertIsNone(fees["feeRecipient"])
            self.assertFalse(fees["feeManagerMutation"])
            self.assertFalse(fees["realQuaiTransactions"])
            self.assertFalse(fees["walletRequired"])
            self.assertFalse(fees["fundsMoved"])
            self.assertFalse(fees["tradingVaultMutation"])
            self.assertEqual(
                fees["feeSchedules"],
                [
                    {
                        "marketId": "QI-QUAI",
                        "projectionType": "FeeScheduleProjection",
                        "eventName": "FeesUpdated",
                        "makerFeeBps": 0,
                        "takerFeeBps": 0,
                        "maxFeeBps": 1000,
                        "feeRecipient": None,
                        "settlementMode": "mock",
                        "settlementTx": None,
                        "blockNumber": None,
                        "blockHash": None,
                        "eventIndex": None,
                        "explorerUrl": None,
                    }
                ],
            )
            self.assertTrue(fees["safety"]["noWalletLoading"])
            self.assertTrue(fees["safety"]["noRpcUrlAccess"])
            self.assertTrue(fees["safety"]["noSigning"])
            self.assertTrue(fees["safety"]["noBroadcast"])
            self.assertTrue(fees["safety"]["noDeploys"])
            self.assertTrue(fees["safety"]["noTransactionSubmission"])
            self.assertTrue(fees["safety"]["noFundsMovement"])
            self.assertTrue(fees["safety"]["noFeeAuthorityRuntimeKeys"])
            self.assertIn("Read-only FeeManager schedule metadata", fees["safety"]["notice"])

    def test_python_sdk_consumes_public_feemanager_fee_schedule_stream_without_fee_authority_or_tx_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)
            fees_stream = client.fees.open_stream(timeout=2)

            try:
                message = fees_stream.next()
                self.assertEqual(message["type"], "snapshot")
                self.assertEqual(message["transport"], "websocket")
                snapshot = message["snapshot"]
                self.assertEqual(snapshot["channel"], "fees")
                self.assertEqual(snapshot["visibility"], "public")
                self.assertEqual(snapshot["payload"], "fee_schedule_projection")
                self.assertEqual(snapshot["custody"], "public-read-only-no-custody")
                self.assertEqual(snapshot["source"], "feemanager-policy-projection")
                self.assertEqual(snapshot["data"]["source"], "feemanager-policy-projection")
                self.assertEqual(snapshot["data"]["status"], "local-only-not-deployed")
                self.assertEqual(snapshot["data"]["custody"], "non-custodial-fee-policy")
                self.assertEqual(snapshot["data"]["feeSchedules"][0]["projectionType"], "FeeScheduleProjection")
                self.assertEqual(snapshot["data"]["feeSchedules"][0]["eventName"], "FeesUpdated")
                self.assertEqual(snapshot["data"]["feeSchedules"][0]["maxFeeBps"], 1000)
                self.assertEqual(snapshot["data"]["hardMaxFeeBps"], 1000)
                self.assertIsNone(snapshot["data"]["feeRecipient"])
                self.assertFalse(snapshot["data"]["feeManagerMutation"])
                self.assertFalse(snapshot["data"]["realQuaiTransactions"])
                self.assertFalse(snapshot["data"]["walletRequired"])
                self.assertFalse(snapshot["data"]["fundsMoved"])
                self.assertFalse(snapshot["data"]["tradingVaultMutation"])
                self.assertTrue(snapshot["data"]["safety"]["noFeeAuthorityRuntimeKeys"])
                self.assertIn("no fee-authority key", snapshot["data"]["safety"]["notice"])
            finally:
                fees_stream.close()

            messages = client.fees.stream(limit=1, timeout=2)
            self.assertEqual(len(messages), 1)
            bounded_snapshot = messages[0]["snapshot"]
            self.assertEqual(bounded_snapshot["channel"], "fees")
            self.assertEqual(bounded_snapshot["payload"], "fee_schedule_projection")
            self.assertEqual(bounded_snapshot["custody"], "public-read-only-no-custody")
            self.assertEqual(bounded_snapshot["data"]["feeSchedules"][0]["projectionType"], "FeeScheduleProjection")
            self.assertEqual(bounded_snapshot["data"]["permissions"], ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"])
            self.assertFalse(bounded_snapshot["data"]["feeManagerMutation"])
            self.assertFalse(bounded_snapshot["data"]["tradingVaultMutation"])

    def test_python_sdk_consumes_public_market_data_streams_without_wallet_or_custody_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)
            ticker_stream = client.tickers.open_stream(timeout=2)

            try:
                ticker_message = ticker_stream.next()
                self.assertEqual(ticker_message["type"], "snapshot")
                self.assertEqual(ticker_message["transport"], "websocket")
                ticker_snapshot = ticker_message["snapshot"]
                self.assertEqual(ticker_snapshot["channel"], "global.tickers")
                self.assertEqual(ticker_snapshot["visibility"], "public")
                self.assertEqual(ticker_snapshot["payload"], "ticker_snapshot")
                self.assertEqual(ticker_snapshot["source"], "mock-market-data")
                self.assertEqual(ticker_snapshot["custody"], "public-read-only-no-custody")
                self.assertEqual(ticker_snapshot["data"]["tickers"][0]["marketId"], "QI-QUAI")
                self.assertEqual(ticker_snapshot["data"]["tickers"][0]["source"], "mock-market-data")
                self.assertEqual(ticker_snapshot["data"]["tickers"][0]["volume24h"], "0")
                self.assertIsNone(ticker_snapshot["data"]["tickers"][0]["lastPrice"])
                self.assertIsNone(ticker_snapshot["data"]["tickers"][0]["bestBid"])
                self.assertIsNone(ticker_snapshot["data"]["tickers"][0]["bestAsk"])
            finally:
                ticker_stream.close()

            bounded_ticker_messages = client.tickers.stream(limit=1, timeout=2)
            self.assertEqual(len(bounded_ticker_messages), 1)
            self.assertEqual(bounded_ticker_messages[0]["snapshot"]["channel"], "global.tickers")
            self.assertEqual(bounded_ticker_messages[0]["snapshot"]["custody"], "public-read-only-no-custody")

            depth_stream = client.orderbook.open_stream("QI-QUAI", timeout=2)
            try:
                depth_message = depth_stream.next()
                depth_snapshot = depth_message["snapshot"]
                self.assertEqual(depth_snapshot["channel"], "market.QI-QUAI.depth")
                self.assertEqual(depth_snapshot["visibility"], "public")
                self.assertEqual(depth_snapshot["payload"], "orderbook_depth")
                self.assertEqual(depth_snapshot["source"], "mock-orderbook")
                self.assertEqual(depth_snapshot["custody"], "public-read-only-no-custody")
                self.assertEqual(depth_snapshot["data"]["marketId"], "QI-QUAI")
                self.assertEqual(depth_snapshot["data"]["source"], "mock-orderbook")
                self.assertEqual(depth_snapshot["data"]["bids"], [])
                self.assertEqual(depth_snapshot["data"]["asks"], [])
            finally:
                depth_stream.close()

            bounded_depth_messages = client.orderbook.stream("QI-QUAI", limit=1, timeout=2)
            self.assertEqual(len(bounded_depth_messages), 1)
            self.assertEqual(bounded_depth_messages[0]["snapshot"]["channel"], "market.QI-QUAI.depth")
            self.assertEqual(bounded_depth_messages[0]["snapshot"]["payload"], "orderbook_depth")

            trades_stream = client.trades.open_stream("QI-QUAI", timeout=2)
            try:
                trade_message = trades_stream.next()
                trade_snapshot = trade_message["snapshot"]
                self.assertEqual(trade_snapshot["channel"], "market.QI-QUAI.trades")
                self.assertEqual(trade_snapshot["visibility"], "public")
                self.assertEqual(trade_snapshot["payload"], "trade_projection")
                self.assertEqual(trade_snapshot["source"], "in-memory-indexer-projection")
                self.assertEqual(trade_snapshot["custody"], "public-read-only-no-custody")
                self.assertEqual(trade_snapshot["data"]["marketId"], "QI-QUAI")
                self.assertEqual(trade_snapshot["data"]["trades"], [])
                self.assertEqual(trade_snapshot["data"]["source"], "in-memory-indexer-projection")
            finally:
                trades_stream.close()

            bounded_trade_messages = client.trades.stream("QI-QUAI", limit=1, timeout=2)
            self.assertEqual(len(bounded_trade_messages), 1)
            self.assertEqual(bounded_trade_messages[0]["snapshot"]["channel"], "market.QI-QUAI.trades")
            self.assertEqual(bounded_trade_messages[0]["snapshot"]["payload"], "trade_projection")
            self.assertEqual(bounded_trade_messages[0]["snapshot"]["custody"], "public-read-only-no-custody")

            one_minute_klines = client.klines.get("QI-QUAI", interval="1m")
            self.assertEqual(one_minute_klines["marketId"], "QI-QUAI")
            self.assertEqual(one_minute_klines["interval"], "1m")
            self.assertEqual(one_minute_klines["candles"], [])
            self.assertEqual(one_minute_klines["source"], "mock-candle-projection")

            kline_stream = client.klines.open_stream("QI-QUAI", interval="1m", timeout=2)
            try:
                kline_message = kline_stream.next()
                self.assertEqual(kline_message["type"], "snapshot")
                self.assertEqual(kline_message["transport"], "websocket")
                kline_snapshot = kline_message["snapshot"]
                self.assertEqual(kline_snapshot["channel"], "market.QI-QUAI.klines.1m")
                self.assertEqual(kline_snapshot["visibility"], "public")
                self.assertEqual(kline_snapshot["payload"], "kline_snapshot")
                self.assertEqual(kline_snapshot["source"], "mock-candle-projection")
                self.assertEqual(kline_snapshot["custody"], "public-read-only-no-custody")
                self.assertEqual(kline_snapshot["data"]["marketId"], "QI-QUAI")
                self.assertEqual(kline_snapshot["data"]["interval"], "1m")
                self.assertEqual(kline_snapshot["data"]["candles"], [])
                self.assertEqual(kline_snapshot["data"]["source"], "mock-candle-projection")
            finally:
                kline_stream.close()

            bounded_kline_messages = client.klines.stream("QI-QUAI", interval="15m", limit=1, timeout=2)
            self.assertEqual(len(bounded_kline_messages), 1)
            self.assertEqual(bounded_kline_messages[0]["snapshot"]["channel"], "market.QI-QUAI.klines.15m")
            self.assertEqual(bounded_kline_messages[0]["snapshot"]["payload"], "kline_snapshot")
            self.assertEqual(bounded_kline_messages[0]["snapshot"]["source"], "mock-candle-projection")
            self.assertEqual(bounded_kline_messages[0]["snapshot"]["custody"], "public-read-only-no-custody")
            self.assertEqual(bounded_kline_messages[0]["snapshot"]["data"]["interval"], "15m")
            self.assertEqual(bounded_kline_messages[0]["snapshot"]["data"]["candles"], [])

    def test_python_sdk_consumes_private_tradingvault_deposit_and_withdrawal_history_streams_without_wallet_authority(self):
        with ApiServer() as server:
            client = QDexClient(base_url=server.base_url)
            deposits_stream = client.vault.deposits.open_stream(timeout=2)

            try:
                deposit_message = deposits_stream.next()
                self.assertEqual(deposit_message["type"], "snapshot")
                self.assertEqual(deposit_message["transport"], "websocket")
                deposit_snapshot = deposit_message["snapshot"]
                self.assertEqual(deposit_snapshot["channel"], "deposits")
                self.assertEqual(deposit_snapshot["visibility"], "private")
                self.assertEqual(deposit_snapshot["payload"], "deposit_projection")
                self.assertEqual(deposit_snapshot["source"], "tradingvault-event-projection")
                self.assertEqual(deposit_snapshot["custody"], "non-custodial-no-withdrawal-authority")
                self.assertEqual(deposit_snapshot["permissions"], ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"])
                self.assertEqual(
                    deposit_snapshot["safetyNotice"],
                    "Mock stream payload only: no real Quai transaction, no explorer URL, no funds moved.",
                )
                self.assertEqual(deposit_snapshot["data"]["deposits"], [])
                self.assertEqual(deposit_snapshot["data"]["projectionType"], "TradingVaultDepositProjection")
                self.assertEqual(deposit_snapshot["data"]["eventName"], "Deposit")
                self.assertEqual(deposit_snapshot["data"]["settlementMode"], "mock")
                self.assertIsNone(deposit_snapshot["data"]["settlementTx"])
                self.assertIsNone(deposit_snapshot["data"]["blockNumber"])
                self.assertIsNone(deposit_snapshot["data"]["blockHash"])
                self.assertIsNone(deposit_snapshot["data"]["eventIndex"])
                self.assertIsNone(deposit_snapshot["data"]["explorerUrl"])
                self.assertFalse(deposit_snapshot["data"]["realQuaiTransactions"])
                self.assertFalse(deposit_snapshot["data"]["walletRequired"])
                self.assertFalse(deposit_snapshot["data"]["fundsMoved"])
                self.assertFalse(deposit_snapshot["data"]["tradingVaultMutation"])
            finally:
                deposits_stream.close()

            withdrawal_messages = client.vault.withdrawals.stream(limit=1, timeout=2)
            self.assertEqual(len(withdrawal_messages), 1)
            withdrawal_message = withdrawal_messages[0]
            self.assertEqual(withdrawal_message["type"], "snapshot")
            withdrawal_snapshot = withdrawal_message["snapshot"]
            self.assertEqual(withdrawal_snapshot["channel"], "withdrawals")
            self.assertEqual(withdrawal_snapshot["visibility"], "private")
            self.assertEqual(withdrawal_snapshot["payload"], "withdrawal_projection")
            self.assertEqual(withdrawal_snapshot["source"], "tradingvault-event-projection")
            self.assertEqual(withdrawal_snapshot["permissions"], ["READ_ONLY", "NO_WITHDRAW", "NO_ADMIN"])
            self.assertEqual(withdrawal_snapshot["data"]["withdrawals"], [])
            self.assertEqual(withdrawal_snapshot["data"]["projectionType"], "TradingVaultWithdrawalProjection")
            self.assertEqual(withdrawal_snapshot["data"]["eventName"], "Withdraw")
            self.assertEqual(withdrawal_snapshot["data"]["settlementMode"], "mock")
            self.assertIsNone(withdrawal_snapshot["data"]["settlementTx"])
            self.assertIsNone(withdrawal_snapshot["data"]["explorerUrl"])
            self.assertFalse(withdrawal_snapshot["data"]["realQuaiTransactions"])
            self.assertFalse(withdrawal_snapshot["data"]["walletRequired"])
            self.assertFalse(withdrawal_snapshot["data"]["fundsMoved"])
            self.assertFalse(withdrawal_snapshot["data"]["tradingVaultMutation"])

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
