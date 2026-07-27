import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from storage import message_store
from storage.message_sqlite_store import save_messages_snapshot, sqlite_path_for_json


MAIL_TYPE_LABELS = {
    "verification": "verification",
    "promotion": "promotion",
    "other": "other",
}


def coerce_text(value):
    return str(value or "").strip()


def normalize_mail_type(value, message_text):
    current = coerce_text(value).lower()
    if current:
        return current
    lowered = coerce_text(message_text).lower()
    if "code" in lowered or "验证码" in lowered:
        return "verification"
    if "sale" in lowered or "promo" in lowered:
        return "promotion"
    return "other"


def sort_key(message):
    return str(message.get("received_at") or message.get("cached_at") or "")


class MessageStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def fetch_count(self, db_path: Path) -> int:
        conn = sqlite3.connect(str(db_path))
        try:
            row = conn.execute("SELECT COUNT(*) FROM messages").fetchone()
            return int(row[0] if row else 0)
        finally:
            conn.close()

    def load_rows(self, path: Path):
        return message_store.load_messages(
            path,
            coerce_text=coerce_text,
            normalize_mail_type=normalize_mail_type,
            mail_type_labels=MAIL_TYPE_LABELS,
        )

    def test_save_messages_creates_sqlite_sidecar(self):
        json_path = self.root / "messages.json"

        message_store.save_messages(
            [
                {"account": "a@example.com", "source": "temp", "mid": "1", "subject": "code 123456", "received_at": "2026-06-14T10:00:00+00:00"},
                {"account": "b@example.com", "source": "microsoft", "mid": "2", "subject": "promo", "received_at": "2026-06-14T09:00:00+00:00"},
            ],
            json_path,
            sort_key=sort_key,
        )

        db_path = sqlite_path_for_json(json_path)
        self.assertTrue(db_path.exists())
        self.assertEqual(self.fetch_count(db_path), 2)

    def test_load_messages_backfills_sqlite_from_json(self):
        json_path = self.root / "messages.json"
        json_path.write_text(
            json.dumps(
                {
                    "updated_at": "2026-06-14T10:00:00+00:00",
                    "messages": [
                        {
                            "account": "legacy@example.com",
                            "source": "temp",
                            "mid": "1",
                            "subject": "your code is 123456",
                            "received_at": "2026-06-14T09:30:00+00:00",
                        }
                    ],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        rows = self.load_rows(json_path)

        db_path = sqlite_path_for_json(json_path)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["account"], "legacy@example.com")
        self.assertEqual(rows[0]["mail_type"], "verification")
        self.assertTrue(db_path.exists())
        self.assertEqual(self.fetch_count(db_path), 1)

    def test_load_messages_prefers_sqlite_when_available(self):
        json_path = self.root / "messages.json"
        json_path.write_text(
            json.dumps(
                {
                    "messages": [
                        {
                            "account": "json@example.com",
                            "source": "temp",
                            "mid": "json-1",
                            "subject": "json old",
                            "received_at": "2026-06-14T08:00:00+00:00",
                        }
                    ]
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        save_messages_snapshot(
            json_path,
            [
                {
                    "account": "sqlite@example.com",
                    "source": "microsoft",
                    "mid": "sqlite-1",
                    "subject": "sqlite fresh",
                    "received_at": "2026-06-14T10:00:00+00:00",
                    "mail_type": "other",
                }
            ],
            dedupe_key=message_store.message_key,
        )

        rows = self.load_rows(json_path)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["account"], "sqlite@example.com")
        self.assertEqual(rows[0]["subject"], "sqlite fresh")

    def test_upsert_dedupes_account_case_and_keeps_new_html(self):
        json_path = self.root / "messages.json"
        original = {
            "source": "microsoft",
            "account": "user@outlook.com",
            "folder": "inbox",
            "mid": "message-1",
            "subject": "Secure sign-in link",
            "received_at": "2026-07-26T06:50:19Z",
            "body": "plain preview",
            "html_body": "",
        }
        message_store.save_messages([original], json_path, sort_key=sort_key)

        message_store.upsert_messages(
            [{
                **original,
                "account": "User@Outlook.com",
                "html_body": '<p><a href="https://example.test/login">Sign in</a></p>',
            }],
            json_path,
            coerce_text=coerce_text,
            normalize_mail_type=normalize_mail_type,
            mail_type_labels=MAIL_TYPE_LABELS,
            sort_key=sort_key,
        )

        rows = self.load_rows(json_path)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["account"], "User@Outlook.com")
        self.assertIn("https://example.test/login", rows[0]["html_body"])


if __name__ == "__main__":
    unittest.main()
