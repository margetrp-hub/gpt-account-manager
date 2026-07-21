import unittest

from mail_providers import classify_mail_fetch_error


class MailProviderErrorClassificationTests(unittest.TestCase):
    def test_classifies_outlook_reauth_required(self) -> None:
        result = classify_mail_fetch_error(
            "Graph token failed: {'error': 'interaction_required', 'error_description': 'AADSTS65001'}",
            "microsoft",
        )

        self.assertEqual(result["error_code"], "outlook_reauth_required")
        self.assertEqual(result["error_label"], "Outlook 需要重新授权")
        self.assertFalse(result["retryable"])

    def test_classifies_outlook_scope_missing(self) -> None:
        result = classify_mail_fetch_error(
            "IMAP token failed: insufficient_scope: missing IMAP.AccessAsUser.All permission",
            "microsoft",
        )

        self.assertEqual(result["error_code"], "outlook_scope_missing")
        self.assertEqual(result["error_label"], "Outlook 权限不足")
        self.assertFalse(result["retryable"])

    def test_classifies_outlook_refresh_expired(self) -> None:
        result = classify_mail_fetch_error(
            "Graph token failed: {'error': 'invalid_grant', 'error_description': 'token revoked'}",
            "microsoft",
        )

        self.assertEqual(result["error_code"], "outlook_refresh_expired")
        self.assertEqual(result["error_label"], "Outlook RT 过期")
        self.assertFalse(result["retryable"])


if __name__ == "__main__":
    unittest.main()
