import unittest
from unittest.mock import patch

import server as s


class PhoneProviderTests(unittest.TestCase):
    def setUp(self):
        self.validate_remote_base_url = patch.object(s, "validate_remote_base_url")
        self.validate_remote_base_url.start()

    def tearDown(self):
        self.validate_remote_base_url.stop()

    def test_herosms_status_ok_returns_code(self):
        with patch.object(s, "http_text", return_value=(200, "STATUS_OK:123456")) as http_text:
            result = s.poll_phone_code({
                "phone": "+12025550123",
                "provider": "herosms",
                "api_key": "test-key",
                "activation_id": "activation-1",
            })

        self.assertTrue(result["found"])
        self.assertEqual(result["code"], "123456")
        self.assertEqual(result["provider"], "herosms")
        self.assertEqual(result["status"], "found")
        self.assertIn("action=getStatusV2", http_text.call_args.args[0])

    def test_smbower_waiting_returns_pending(self):
        with patch.object(s, "http_text", return_value=(200, "STATUS_WAIT_CODE")):
            result = s.poll_phone_code({
                "phone": "+12025550123",
                "provider": "smsbower",
                "api_key": "test-key",
                "activation_id": "activation-2",
            })

        self.assertFalse(result["found"])
        self.assertEqual(result["status"], "pending")
        self.assertEqual(result["message"], "等待验证码")

    def test_standard_provider_reads_json_sms_code(self):
        with patch.object(s, "http_text", return_value=(200, '{"sms":{"code":"654321"}}')):
            result = s.poll_phone_code({
                "phone": "+12025550123",
                "provider": "herosms",
                "api_key": "test-key",
                "activation_id": "activation-3",
            })

        self.assertTrue(result["found"])
        self.assertEqual(result["code"], "654321")

    def test_standard_provider_classifies_key_and_activation_errors(self):
        with patch.object(s, "http_text", return_value=(200, "BAD_KEY")):
            with self.assertRaisesRegex(s.PhoneProviderError, "密钥无效") as key_error:
                s.poll_phone_code({
                    "phone": "+12025550123",
                    "provider": "smsbower",
                    "api_key": "test-key",
                    "activation_id": "activation-4",
                })
        self.assertEqual(key_error.exception.error_code, "phone_provider_key_invalid")

        with patch.object(s, "http_text", return_value=(200, "NO_ACTIVATION")):
            with self.assertRaisesRegex(s.PhoneProviderError, "订单不存在") as activation_error:
                s.poll_phone_code({
                    "phone": "+12025550123",
                    "provider": "herosms",
                    "api_key": "test-key",
                    "activation_id": "activation-5",
                })
        self.assertEqual(activation_error.exception.error_code, "phone_activation_missing")

    def test_smbower_json_no_access_is_classified_as_invalid_key(self):
        with patch.object(s, "http_text", return_value=(200, '{"status":0,"message":"No access","data":[]}')):
            with self.assertRaisesRegex(s.PhoneProviderError, "密钥无效") as error:
                s.phone_provider_balance({"provider": "smsbower", "api_key": "test-key"})

        self.assertEqual(error.exception.error_code, "phone_provider_key_invalid")

    def test_provider_balance_and_active_orders_use_documented_actions(self):
        with patch.object(s, "http_text", return_value=(200, '{"balance":"12.50"}')) as http_text:
            balance = s.phone_provider_balance({"provider": "herosms", "api_key": "test-key"})

        self.assertEqual(balance["balance"], "12.50")
        self.assertIn("action=getBalance", http_text.call_args.args[0])

        payload = '{"1001":{"activationId":"1001","phoneNumber":"+12025550123","activationStatus":"STATUS_WAIT_CODE","serviceCode":"service","countryName":"United States"}}'
        with patch.object(s, "http_text", return_value=(200, payload)) as http_text:
            activations = s.phone_provider_active_activations({"provider": "herosms", "api_key": "test-key"})

        self.assertEqual(activations["items"], [{
            "activation_id": "1001",
            "phone": "+12025550123",
            "status": "STATUS_WAIT_CODE",
            "service": "service",
            "country": "United States",
            "created_at": "",
        }])
        self.assertIn("action=getActiveActivations", http_text.call_args.args[0])

    def test_activation_metadata_is_not_mistaken_for_an_sms_code(self):
        payload = '{"activationId":123456,"phoneNumber":"+12025550123","status":"STATUS_WAIT_CODE"}'
        with patch.object(s, "http_text", return_value=(200, payload)):
            result = s.poll_phone_code({
                "phone": "+12025550123",
                "provider": "herosms",
                "api_key": "test-key",
                "activation_id": "123456",
            })

        self.assertFalse(result["found"])
        self.assertEqual(result["code"], "")
        self.assertEqual(result["status"], "pending")

    def test_phone_pool_keeps_legacy_custom_and_standard_entries(self):
        entries = s.phone_pool_entries_from_payload({
            "phone_pool": [
                {"phone": "+12025550123", "api_url": "https://example.test/sms?phone={phone}"},
                {"phone": "+12025550124", "provider": "smsbower", "api_key": "key", "activation_id": "order"},
            ],
        })

        self.assertEqual([entry["provider"] for entry in entries], ["custom", "smsbower"])


if __name__ == "__main__":
    unittest.main()
