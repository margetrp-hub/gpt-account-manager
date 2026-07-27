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
        with patch.object(s, "http_text", return_value=(200, "ACCESS_BALANCE:12.50")) as http_text:
            balance = s.phone_provider_balance({"provider": "herosms", "api_key": "test-key"})

        self.assertEqual(balance["balance"], "12.50")
        self.assertIn("action=getBalance", http_text.call_args.args[0])

        payload = '{"1001":{"activationId":"1001","phoneNumber":"+12025550123","activationStatus":"STATUS_WAIT_CODE","serviceCode":"service","countryName":"United States"}}'
        with patch.object(s, "http_text", return_value=(200, payload)) as http_text:
            activations = s.phone_provider_active_activations({"provider": "herosms", "api_key": "test-key"})

        self.assertEqual(len(activations["items"]), 1)
        self.assertEqual(activations["items"][0]["activation_id"], "1001")
        self.assertEqual(activations["items"][0]["phone"], "+12025550123")
        self.assertEqual(activations["items"][0]["status"], "STATUS_WAIT_CODE")
        self.assertEqual(activations["items"][0]["service"], "service")
        self.assertEqual(activations["items"][0]["country"], "United States")
        self.assertEqual(activations["pages"], 1)
        self.assertIn("action=getActiveActivations", http_text.call_args.args[0])
        self.assertIn("start=0", http_text.call_args.args[0])
        self.assertIn("limit=100", http_text.call_args.args[0])

    def test_activation_action_uses_documented_set_status_values(self):
        with patch.object(s, "http_text", return_value=(200, "ACCESS_RETRY_GET")) as http_text:
            result = s.phone_provider_activation_action({
                "provider": "herosms",
                "api_key": "test-key",
                "activation_id": "activation-6",
                "action": "resend",
            })

        self.assertTrue(result["success"])
        self.assertFalse(result["terminal"])
        self.assertEqual(result["message"], "已请求下一条短信")
        self.assertIn("action=setStatus", http_text.call_args.args[0])
        self.assertIn("id=activation-6", http_text.call_args.args[0])
        self.assertIn("status=3", http_text.call_args.args[0])

    def test_active_orders_paginate_with_documented_limit(self):
        first = {
            "data": [
                {"activationId": str(index), "phoneNumber": f"+1202555{index:04d}"}
                for index in range(100)
            ]
        }
        second = {"data": [{"activationId": "100", "phoneNumber": "+12025550100"}]}
        with patch.object(s, "http_text", side_effect=[
            (200, s.json.dumps(first)),
            (200, s.json.dumps(second)),
        ]) as http_text:
            result = s.phone_provider_active_activations({"provider": "herosms", "api_key": "test-key"})

        self.assertEqual(len(result["items"]), 101)
        self.assertIn("start=0", http_text.call_args_list[0].args[0])
        self.assertIn("start=100", http_text.call_args_list[1].args[0])

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

    def test_active_order_keeps_documented_order_metadata_and_sms(self):
        payload = {
            "activeActivations": [{
                "activationId": "1002",
                "phoneNumber": "+12025550124",
                "activationStatus": "STATUS_OK",
                "serviceCode": "oa",
                "countryName": "United States",
                "activationOperator": "T-Mobile",
                "activationCost": "0.42",
                "currency": "USD",
                "canGetAnotherSms": False,
                "smsCode": "654321",
                "smsText": "Your verification code is 654321",
            }]
        }
        with patch.object(s, "http_text", return_value=(200, s.json.dumps(payload))):
            result = s.phone_provider_active_activations({"provider": "herosms", "api_key": "test-key"})

        item = result["items"][0]
        self.assertEqual(item["operator"], "T-Mobile")
        self.assertEqual(item["cost"], "0.42")
        self.assertEqual(item["currency"], "USD")
        self.assertEqual(item["can_receive_more"], "false")
        self.assertEqual(item["code"], "654321")
        self.assertIn("654321", item["message"])

    def test_provider_response_field_accepts_success_text(self):
        with patch.object(s, "http_text", return_value=(200, '{"response":"ACCESS_BALANCE:7.25"}')):
            result = s.phone_provider_balance({"provider": "smsbower", "api_key": "test-key"})

        self.assertEqual(result["balance"], "7.25")

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
