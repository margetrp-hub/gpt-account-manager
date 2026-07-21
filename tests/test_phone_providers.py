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
