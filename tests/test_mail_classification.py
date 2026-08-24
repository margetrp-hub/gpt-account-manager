import unittest

import server as s


class MailClassificationTests(unittest.TestCase):
    def test_common_services_are_classified_from_sender(self):
        cases = {
            "noreply@openai.com": "openai",
            "account-security-noreply@accountprotection.microsoft.com": "microsoft",
            "no-reply@accounts.google.com": "google",
            "no_reply@apple.com": "apple",
            "noreply@github.com": "github",
            "noreply@cloudflare.com": "cloudflare",
        }
        for sender, expected in cases.items():
            with self.subTest(sender=sender):
                self.assertEqual(s.normalize_mail_service("", sender), expected)

    def test_message_filter_supports_service(self):
        messages = [
            {"sender": "noreply@openai.com", "subject": "Code 123456"},
            {"sender": "noreply@github.com", "subject": "Security alert"},
        ]

        result = s.filter_messages(messages, {"service": "github"})

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["mail_service"], "github")

    def test_message_keyword_search_covers_mailbox_sender_subject_and_body(self):
        messages = [
            {
                "account": "owner@example.com",
                "sender": "billing@stripe.com",
                "subject": "Your monthly receipt",
                "body": "Invoice reference ZK-2048",
            },
            {
                "account": "other@example.com",
                "sender": "noreply@github.com",
                "subject": "Security alert",
                "body": "A new sign-in was detected",
            },
        ]

        for keyword in ["owner@example.com", "billing@stripe.com", "monthly receipt", "zk-2048"]:
            with self.subTest(keyword=keyword):
                result = s.filter_messages([dict(item) for item in messages], {"query": keyword})
                self.assertEqual([item["account"] for item in result], ["owner@example.com"])


if __name__ == "__main__":
    unittest.main()
