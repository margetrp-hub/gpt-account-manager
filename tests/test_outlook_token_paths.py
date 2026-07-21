import unittest
from unittest import mock

import server as s


class OutlookTokenPathTests(unittest.TestCase):
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
        self.assertIn(host, {"outlook.live.com", "outlook.office365.com"})
        self.assertTrue(any("IMAP.AccessAsUser.All" in scope for scope in seen_scopes))
        self.assertFalse(any("Mail.Read" in scope for scope in seen_scopes if scope))


if __name__ == "__main__":
    unittest.main()
