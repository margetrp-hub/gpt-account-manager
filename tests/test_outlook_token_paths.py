import unittest
from unittest import mock

import server as s


class OutlookTokenPathTests(unittest.TestCase):
    def test_refresh_token_response_replaces_stored_token(self) -> None:
        account = s.MailAccount(
            email="user@outlook.com",
            password="pw",
            client_id="client-id",
            refresh_token="old-refresh-token",
        )

        with mock.patch.object(s, "http_json", return_value={
            "access_token": "access-token",
            "refresh_token": "new-refresh-token",
        }):
            token = s.refresh_microsoft_access_token(account, [
                ("https://login.example.test/token", {"grant_type": "refresh_token"}),
            ], "Graph")

        self.assertEqual(token, "access-token")
        self.assertEqual(account.refresh_token, "new-refresh-token")
        self.assertTrue(account.updated_at)

    def test_graph_token_response_replaces_stored_token(self) -> None:
        account = s.MailAccount(
            email="user@outlook.com",
            password="pw",
            client_id="client-id",
            refresh_token="old-refresh-token",
        )

        with mock.patch.object(s, "http_json", return_value={
            "access_token": "access-token",
            "refresh_token": "new-refresh-token",
        }):
            token = s.get_graph_token(account)

        self.assertEqual(token, "access-token")
        self.assertEqual(account.refresh_token, "new-refresh-token")

    def test_get_imap_token_uses_imap_scopes_not_mail_read(self) -> None:
        account = s.MailAccount(
            email="user@outlook.com",
            password="pw",
            client_id="client-id",
            refresh_token="refresh-token",
        )
        seen_scopes = []

        def fake_refresh(account_obj, attempts, label):
            self.assertEqual(label, "IMAP")
            self.assertEqual(account_obj.email, "user@outlook.com")
            self.assertEqual(len(attempts), 1)
            _, data = attempts[0]
            seen_scopes.append(data.get("scope", ""))
            if "IMAP.AccessAsUser.All" in str(data.get("scope", "")):
                return "access-token"
            raise RuntimeError("unexpected scope")

        with mock.patch.object(s, "refresh_microsoft_access_token", side_effect=fake_refresh):
            token, host = s.get_imap_token(account)

        self.assertEqual(token, "access-token")
        self.assertEqual(host, "outlook.live.com")
        self.assertEqual(seen_scopes[0], "https://outlook.office.com/IMAP.AccessAsUser.All offline_access")
        self.assertTrue(any("IMAP.AccessAsUser.All" in scope for scope in seen_scopes))
        self.assertFalse(any("Mail.Read" in scope for scope in seen_scopes if scope))

    def test_get_imap_token_keeps_canonical_scope_before_compatibility_fallbacks(self) -> None:
        account = s.MailAccount(
            email="user@outlook.com",
            password="pw",
            client_id="client-id",
            refresh_token="refresh-token",
        )
        seen = []

        def fake_refresh(account_obj, attempts, label):
            _, data = attempts[0]
            seen.append(data.get("scope", ""))
            if len(seen) == 3:
                return "access-token"
            raise RuntimeError("try next compatibility path")

        with mock.patch.object(s, "refresh_microsoft_access_token", side_effect=fake_refresh):
            token, host = s.get_imap_token(account)

        self.assertEqual(token, "access-token")
        self.assertEqual(host, "outlook.office365.com")
        self.assertEqual(seen[:2], [
            "https://outlook.office.com/IMAP.AccessAsUser.All offline_access",
            "https://outlook.office.com/IMAP.AccessAsUser.All offline_access",
        ])
        self.assertNotIn("https://outlook.office365.com/IMAP.AccessAsUser.All", " ".join(seen))


if __name__ == "__main__":
    unittest.main()
