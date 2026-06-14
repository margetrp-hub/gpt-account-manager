import sqlite3
import tempfile
import unittest
from pathlib import Path

from storage import activity_store
from storage.activity_sqlite_store import sqlite_path_for_json


class ActivityStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def fetch_count(self, db_path: Path, table: str) -> int:
        conn = sqlite3.connect(str(db_path))
        try:
            row = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
            return int(row[0] if row else 0)
        finally:
            conn.close()

    def test_save_refresh_results_creates_sqlite_sidecar(self):
        json_path = self.root / "refresh_results.json"

        activity_store.save_refresh_results(
            json_path,
            [{"email": "a@example.com", "job_id": "job-a"}, {"email": "b@example.com", "job_id": "job-b"}],
            limit=100,
        )

        db_path = sqlite_path_for_json(json_path)
        self.assertTrue(db_path.exists())
        self.assertEqual(self.fetch_count(db_path, "refresh_results"), 2)

    def test_append_refresh_result_updates_json_and_sqlite(self):
        json_path = self.root / "refresh_results.json"

        activity_store.append_refresh_result(
            json_path,
            {"email": "a@example.com", "name": "A", "plan_type": "plus"},
            email="a@example.com",
            job_id="job-a",
            limit=100,
        )
        activity_store.append_refresh_result(
            json_path,
            {"email": "a@example.com", "name": "A2", "plan_type": "pro"},
            email="a@example.com",
            job_id="job-a2",
            limit=100,
        )

        rows = activity_store.load_refresh_results(json_path)
        db_path = sqlite_path_for_json(json_path)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["job_id"], "job-a2")
        self.assertEqual(self.fetch_count(db_path, "refresh_results"), 1)

    def test_save_login_history_creates_sqlite_sidecar(self):
        json_path = self.root / "login_history.json"

        activity_store.save_login_history(
            json_path,
            [{"job_id": "job-a", "status": "success"}, {"job_id": "job-b", "status": "failed"}],
            limit=100,
        )

        db_path = sqlite_path_for_json(json_path)
        self.assertTrue(db_path.exists())
        self.assertEqual(self.fetch_count(db_path, "login_history"), 2)

    def test_append_login_history_updates_json_and_sqlite(self):
        json_path = self.root / "login_history.json"

        activity_store.append_login_history_entry(
            json_path,
            {"job_id": "job-a", "status": "running", "started_at": "2026-06-14T10:00:00+00:00"},
            limit=100,
        )
        activity_store.append_login_history_entry(
            json_path,
            {"job_id": "job-a", "status": "success", "finished_at": "2026-06-14T10:05:00+00:00"},
            limit=100,
        )

        rows = activity_store.load_login_history(json_path)
        db_path = sqlite_path_for_json(json_path)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "success")
        self.assertEqual(self.fetch_count(db_path, "login_history"), 1)


if __name__ == "__main__":
    unittest.main()
