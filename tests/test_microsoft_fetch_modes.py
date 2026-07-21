import unittest
from unittest import mock

import server as s


class MicrosoftFetchModeTests(unittest.TestCase):
    def make_account(self) -> s.MailAccount:
        return s.MailAccount(
            email="user@outlook.com",
            password="pw",
            client_id="client",
            refresh_token="rt",
        )

    def test_specific_graph_mode_does_not_fallback(self) -> None:
        account = self.make_account()

        with mock.patch.object(s, "fetch_graph_messages", side_effect=RuntimeError("interaction_required")), \
             mock.patch.object(s, "fetch_imap_messages") as imap_mock, \
             mock.patch.object(s, "fetch_outlook_api_messages") as outlook_mock:
            result = s.fetch_for_account(account, "graph", 5, "")

        self.assertFalse(result["ok"])
        self.assertEqual(result["provider"], "graph")
        self.assertEqual(result["error_code"], "outlook_reauth_required")
        imap_mock.assert_not_called()
        outlook_mock.assert_not_called()

    def test_auto_mode_falls_back_and_reports_attempts(self) -> None:
        account = self.make_account()

        with mock.patch.object(s, "fetch_imap_messages", side_effect=RuntimeError("insufficient_scope")), \
             mock.patch.object(s, "fetch_graph_messages", side_effect=RuntimeError("interaction_required")), \
             mock.patch.object(s, "fetch_outlook_api_messages", side_effect=RuntimeError("timed out")):
            result = s.fetch_for_account(account, "auto", 5, "")

        self.assertFalse(result["ok"])
        self.assertEqual(result["error_code"], "outlook_reauth_required")
        self.assertIn("已尝试 IMAP / Graph / Outlook API。", result["error_hint"])


if __name__ == "__main__":
    unittest.main()
