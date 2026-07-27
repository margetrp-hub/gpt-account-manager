import json
import unittest
import urllib.parse
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

    def test_graph_fetch_preserves_html_body(self) -> None:
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps({
            "value": [{
                "id": "message-1",
                "subject": "Secure sign-in link",
                "bodyPreview": "Sign in with the secure link below",
                "body": {
                    "contentType": "html",
                    "content": '<p>Sign in <a href="https://example.test/login?id=1">here</a></p><script>bad()</script>',
                },
                "from": {"emailAddress": {"address": "no-reply@example.test"}},
                "receivedDateTime": "2026-07-26T06:50:19Z",
                "webLink": "https://outlook.test/message-1",
            }],
        }).encode("utf-8")

        with mock.patch.object(s, "GRAPH_FOLDERS", ("inbox",)), \
             mock.patch.object(s, "get_graph_token", return_value="access-token"), \
             mock.patch.object(s, "urlopen_with_dns_retry", return_value=response) as open_mock:
            messages = s.fetch_graph_messages(self.make_account(), limit=1)

        request = open_mock.call_args.args[0]
        selected = urllib.parse.parse_qs(urllib.parse.urlparse(request.full_url).query)["$select"][0]
        self.assertIn("body", selected.split(","))
        self.assertEqual(request.get_header("Prefer"), 'outlook.body-content-type="html"')
        self.assertIn("<a href=", messages[0]["html_body"])
        self.assertNotIn("<script", messages[0]["html_body"])
        self.assertEqual(messages[0]["links"], ["https://example.test/login?id=1"])

    def test_outlook_api_fetch_preserves_html_body(self) -> None:
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps({
            "value": [{
                "Id": "message-2",
                "Subject": "Subscription notice",
                "BodyPreview": "Your subscription has changed",
                "Body": {
                    "ContentType": "HTML",
                    "Content": '<div><strong>Subscription updated</strong></div>',
                },
                "From": {"EmailAddress": {"Address": "billing@example.test"}},
                "ReceivedDateTime": "2026-07-26T06:55:00Z",
                "WebLink": "https://outlook.test/message-2",
            }],
        }).encode("utf-8")

        with mock.patch.object(s, "GRAPH_FOLDERS", ("inbox",)), \
             mock.patch.object(s, "refresh_microsoft_access_token", return_value="access-token"), \
             mock.patch.object(s, "urlopen_with_dns_retry", return_value=response) as open_mock:
            messages = s.fetch_outlook_api_messages(self.make_account(), limit=1)

        request = open_mock.call_args.args[0]
        selected = urllib.parse.parse_qs(urllib.parse.urlparse(request.full_url).query)["$select"][0]
        self.assertIn("Body", selected.split(","))
        self.assertEqual(request.get_header("Prefer"), 'outlook.body-content-type="html"')
        self.assertIn("<strong>Subscription updated</strong>", messages[0]["html_body"])


if __name__ == "__main__":
    unittest.main()
