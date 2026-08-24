import json
import tempfile
import unittest
from pathlib import Path

import server as s


def microsoft_row(email: str, *, password: str, client_id: str, refresh_token: str) -> dict[str, str]:
    return {
        "email": email,
        "password": password,
        "client_id": client_id,
        "refresh_token": refresh_token,
    }


class WorkspaceViewsIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.originals = {
            "WORKSPACES_DIR": s.WORKSPACES_DIR,
            "ACCOUNTS_FILE": s.ACCOUNTS_FILE,
            "TEMP_ADDRESSES_FILE": s.TEMP_ADDRESSES_FILE,
            "GENERIC_ACCOUNTS_FILE": s.GENERIC_ACCOUNTS_FILE,
            "MESSAGES_FILE": s.MESSAGES_FILE,
            "REFRESH_RESULTS_FILE": s.REFRESH_RESULTS_FILE,
            "LOGIN_HISTORY_FILE": s.LOGIN_HISTORY_FILE,
            "WORKSPACE_VIEWS": s.WORKSPACE_VIEWS,
            "WORKSPACE_STATE": s.WORKSPACE_STATE,
        }
        s.WORKSPACES_DIR = self.root / "workspaces"
        s.ACCOUNTS_FILE = self.root / "accounts.json"
        s.TEMP_ADDRESSES_FILE = self.root / "temp_addresses.json"
        s.GENERIC_ACCOUNTS_FILE = self.root / "generic_accounts.json"
        s.MESSAGES_FILE = self.root / "messages.json"
        s.REFRESH_RESULTS_FILE = self.root / "refresh_results.json"
        s.LOGIN_HISTORY_FILE = self.root / "login_history.json"
        s.WORKSPACE_VIEWS = s.WorkspaceViews(
            normalize_workspace_id=s.normalize_workspace_id,
            workspace_file=s.workspace_file,
            public_accounts_file=s.ACCOUNTS_FILE,
            public_temp_addresses_file=s.TEMP_ADDRESSES_FILE,
            public_generic_accounts_file=s.GENERIC_ACCOUNTS_FILE,
            public_messages_file=s.MESSAGES_FILE,
            public_refresh_results_file=s.REFRESH_RESULTS_FILE,
            public_login_history_file=s.LOGIN_HISTORY_FILE,
            load_accounts_map=s.load_accounts,
            load_temp_addresses_map=s.load_temp_addresses,
            load_generic_accounts_map=s.load_generic_accounts,
            load_messages_rows=s.load_messages,
            load_refresh_results_rows=s.load_refresh_results,
            load_login_history_rows=s.load_login_history,
            message_row_key=s.workspace_message_row_key,
            row_fallback_key=s.json_row_fallback_key,
        )
        s.WORKSPACE_STATE = s.WorkspaceState(
            workspaces_dir=s.WORKSPACES_DIR,
            views=s.WORKSPACE_VIEWS,
            save_accounts_map=s.save_accounts,
            save_temp_addresses_map=s.save_temp_addresses,
            save_generic_accounts_map=s.save_generic_accounts,
            save_messages_rows=s.save_messages,
            append_refresh_result_row=lambda path, auth_file, email, job_id: s.storage_append_refresh_result(
                path,
                auth_file,
                email=email,
                job_id=job_id,
                limit=s.REFRESH_RESULTS_LIMIT,
            ),
            append_login_history_row=lambda path, job: s.storage_append_login_history_entry(
                path,
                job,
                limit=s.LOGIN_HISTORY_LIMIT,
            ),
            save_refresh_results_rows=lambda path, rows: s.storage_save_refresh_result_rows(
                path,
                rows,
                limit=s.REFRESH_RESULTS_LIMIT,
            ),
            save_login_history_rows=lambda path, rows: s.storage_save_login_history_rows(
                path,
                rows,
                limit=s.LOGIN_HISTORY_LIMIT,
            ),
            message_key=s.message_key,
            coerce_text=s.coerce_text,
            iso_now=s.iso_now,
            row_fallback_key=s.json_row_fallback_key,
        )

    def tearDown(self) -> None:
        for key, value in self.originals.items():
            setattr(s, key, value)
        self.tmp.cleanup()

    def write_json(self, path: Path, payload: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    def public_workspace_dir(self) -> Path:
        return s.workspace_file("public", "dummy").parent

    def test_public_workspace_merges_root_and_public_files(self) -> None:
        self.write_json(s.ACCOUNTS_FILE, {
            "accounts": [
                microsoft_row("root@example.com", password="root-pass", client_id="root-client", refresh_token="root-rt"),
                microsoft_row("same@example.com", password="old-pass", client_id="old-client", refresh_token="old-rt"),
            ]
        })
        self.write_json(s.MESSAGES_FILE, {
            "messages": [
                {
                    "source": "root",
                    "account": "root@example.com",
                    "folder": "inbox",
                    "mid": "1",
                    "subject": "hello",
                    "received_at": "2026-06-08T00:00:00+00:00",
                }
            ]
        })
        self.write_json(s.REFRESH_RESULTS_FILE, {
            "results": [
                {"email": "root@example.com", "job_id": "job-root"},
                {"email": "same@example.com", "job_id": "job-old"},
            ]
        })
        self.write_json(s.LOGIN_HISTORY_FILE, {
            "history": [
                {"job_id": "job-root", "status": "success"},
                {"job_id": "job-old", "status": "failed"},
            ]
        })

        public_dir = self.public_workspace_dir()
        self.write_json(public_dir / "accounts.json", {
            "accounts": [
                microsoft_row("public@example.com", password="public-pass", client_id="public-client", refresh_token="public-rt"),
                microsoft_row("same@example.com", password="new-pass", client_id="new-client", refresh_token="new-rt"),
            ]
        })
        self.write_json(public_dir / "messages.json", {
            "messages": [
                {
                    "source": "public",
                    "account": "public@example.com",
                    "folder": "inbox",
                    "mid": "2",
                    "subject": "world",
                    "received_at": "2026-06-08T01:00:00+00:00",
                }
            ]
        })
        self.write_json(public_dir / "refresh_results.json", {
            "results": [
                {"email": "public@example.com", "job_id": "job-public"},
                {"email": "same@example.com", "job_id": "job-new"},
            ]
        })
        self.write_json(public_dir / "login_history.json", {
            "history": [
                {"job_id": "job-public", "status": "success"},
                {"job_id": "job-old", "status": "success"},
            ]
        })

        accounts = s.load_workspace_accounts("public")
        messages = s.load_workspace_messages("public")
        refresh_rows = s.load_workspace_refresh_results("public")
        history_rows = s.load_workspace_login_history("public")

        self.assertEqual(set(accounts.keys()), {"root@example.com", "public@example.com", "same@example.com"})
        self.assertEqual(accounts["same@example.com"].password, "new-pass")
        self.assertEqual(len(messages), 2)
        refresh_map = {row["email"]: row for row in refresh_rows}
        self.assertEqual(set(refresh_map.keys()), {"root@example.com", "public@example.com", "same@example.com"})
        self.assertEqual(refresh_map["same@example.com"]["job_id"], "job-new")
        history_map = {row["job_id"]: row for row in history_rows}
        self.assertEqual(set(history_map.keys()), {"job-root", "job-public", "job-old"})
        self.assertEqual(history_map["job-old"]["status"], "success")

    def test_non_public_workspace_does_not_fall_back_to_root_public_files(self) -> None:
        self.write_json(s.ACCOUNTS_FILE, {
            "accounts": [microsoft_row("root@example.com", password="root-pass", client_id="root-client", refresh_token="root-rt")]
        })
        self.write_json(s.workspace_file("team-a1", "accounts.json"), {
            "accounts": [microsoft_row("workspace@example.com", password="ws-pass", client_id="ws-client", refresh_token="ws-rt")]
        })

        accounts = s.load_workspace_accounts("team-a1")

        self.assertEqual(set(accounts.keys()), {"workspace@example.com"})
        self.assertNotIn("root@example.com", accounts)

    def test_public_save_helpers_keep_root_and_workspace_paths_in_sync(self) -> None:
        self.write_json(s.ACCOUNTS_FILE, {
            "accounts": [microsoft_row("root@example.com", password="root-pass", client_id="root-client", refresh_token="root-rt")]
        })
        public_dir = self.public_workspace_dir()
        self.write_json(public_dir / "accounts.json", {
            "accounts": [microsoft_row("public@example.com", password="public-pass", client_id="public-client", refresh_token="public-rt")]
        })

        accounts = s.load_workspace_accounts("public")
        accounts.pop("root@example.com", None)
        accounts["new@example.com"] = s.MailAccount(
            email="new@example.com",
            password="new-pass",
            client_id="new-client",
            refresh_token="new-rt",
        )
        s.save_workspace_accounts_state("public", accounts)

        workspace_accounts = s.load_accounts(s.workspace_accounts_path("public"))
        root_accounts = s.load_accounts(s.ACCOUNTS_FILE)
        self.assertEqual(set(workspace_accounts.keys()), {"public@example.com", "new@example.com"})
        self.assertEqual(set(root_accounts.keys()), {"public@example.com", "new@example.com"})

    def test_public_workspace_dedupes_same_message_across_root_and_workspace_files(self) -> None:
        duplicated = {
            "source": "microsoft",
            "account": "dup@example.com",
            "folder": "inbox",
            "mid": "msg-1",
            "subject": "same subject",
            "received_at": "2026-06-08T02:00:00+00:00",
            "cached_at": "2026-06-08T02:10:00+00:00",
        }
        self.write_json(s.MESSAGES_FILE, {"messages": [duplicated]})
        public_dir = self.public_workspace_dir()
        self.write_json(public_dir / "messages.json", {
            "messages": [
                {
                    **duplicated,
                    "cached_at": "2026-06-08T02:20:00+00:00",
                    "mail_type_label": "verification",
                }
            ]
        })

        messages = s.load_workspace_messages("public")

        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["account"], "dup@example.com")

    def test_startup_login_history_uses_workspace_path_when_entry_marks_public(self) -> None:
        public_dir = self.public_workspace_dir()
        self.write_json(public_dir / "login_history.json", {
            "history": [
                {"job_id": "job-public", "status": "success", "workspace_id": "public"},
            ]
        })

        history_rows = s.startup_login_history_entries()

        self.assertEqual(len(history_rows), 1)
        self.assertEqual(history_rows[0]["workspace_id"], "public")

    def test_public_workspace_upsert_messages_syncs_root_and_workspace_files(self) -> None:
        root_message = {
            "source": "microsoft",
            "account": "root@example.com",
            "folder": "inbox",
            "mid": "root-1",
            "subject": "root",
            "received_at": "2026-06-08T00:00:00+00:00",
        }
        workspace_message = {
            "source": "temp",
            "account": "temp@example.com",
            "folder": "inbox",
            "mid": "temp-1",
            "subject": "temp",
            "received_at": "2026-06-08T01:00:00+00:00",
        }
        incoming = {
            "source": "generic",
            "account": "new@example.com",
            "folder": "inbox",
            "mid": "new-1",
            "subject": "new",
            "received_at": "2026-06-08T02:00:00+00:00",
        }
        self.write_json(s.MESSAGES_FILE, {"messages": [root_message]})
        public_dir = self.public_workspace_dir()
        self.write_json(public_dir / "messages.json", {"messages": [workspace_message]})

        s.workspace_state().upsert_messages_state("public", [incoming])

        root_messages = s.load_messages(s.MESSAGES_FILE)
        workspace_messages = s.load_messages(public_dir / "messages.json")
        expected_accounts = {"root@example.com", "temp@example.com", "new@example.com"}
        self.assertEqual({row["account"] for row in root_messages}, expected_accounts)
        self.assertEqual({row["account"] for row in workspace_messages}, expected_accounts)

    def test_deleted_workspace_message_is_not_reinserted_by_later_fetch(self) -> None:
        message = {
            "source": "microsoft",
            "account": "user@example.com",
            "folder": "inbox",
            "mid": "message-1",
            "subject": "verification code 123456",
            "received_at": "2026-06-08T02:00:00+00:00",
        }
        state = s.workspace_state()
        state.upsert_messages_state("team-a1", [dict(message)])

        result = state.delete_messages_state(
            "team-a1",
            {"message": message},
            filter_messages=s.filter_messages,
        )
        state.upsert_messages_state("team-a1", [dict(message)])

        self.assertEqual(result["deleted"], 1)
        self.assertEqual(result["deleted_keys"], [s.message_key(message)])
        self.assertEqual(state.load_messages("team-a1"), [])
        self.assertIn(s.message_key(message), state.load_ignored_message_keys("team-a1"))

    def test_public_workspace_load_messages_backfills_sqlite_sidecars(self) -> None:
        root_message = {
            "source": "microsoft",
            "account": "root@example.com",
            "folder": "inbox",
            "mid": "root-1",
            "subject": "root code 123456",
            "received_at": "2026-06-08T00:00:00+00:00",
        }
        workspace_message = {
            "source": "temp",
            "account": "temp@example.com",
            "folder": "inbox",
            "mid": "temp-1",
            "subject": "temp promo",
            "received_at": "2026-06-08T01:00:00+00:00",
        }
        self.write_json(s.MESSAGES_FILE, {"messages": [root_message]})
        public_dir = self.public_workspace_dir()
        self.write_json(public_dir / "messages.json", {"messages": [workspace_message]})

        messages = s.load_workspace_messages("public")

        self.assertEqual({row["account"] for row in messages}, {"root@example.com", "temp@example.com"})
        self.assertTrue(s.MESSAGES_FILE.with_suffix(".sqlite3").exists())
        self.assertTrue((public_dir / "messages.sqlite3").exists())

    def test_public_workspace_append_refresh_result_syncs_root_and_workspace_files(self) -> None:
        public_dir = self.public_workspace_dir()
        self.write_json(s.REFRESH_RESULTS_FILE, {"results": [{"email": "root@example.com", "job_id": "job-root"}]})
        self.write_json(public_dir / "refresh_results.json", {"results": [{"email": "public@example.com", "job_id": "job-public"}]})

        auth_file = {"email": "new@example.com", "name": "new@example.com", "plan_type": "plus"}
        s.workspace_state().append_refresh_result("public", auth_file, email="new@example.com", job_id="job-new")

        root_rows = s.load_refresh_results(s.REFRESH_RESULTS_FILE)
        workspace_rows = s.load_refresh_results(public_dir / "refresh_results.json")
        expected = {"root@example.com", "public@example.com", "new@example.com"}
        self.assertEqual({row["email"] for row in root_rows}, expected)
        self.assertEqual({row["email"] for row in workspace_rows}, expected)

    def test_public_workspace_append_login_history_syncs_root_and_workspace_files(self) -> None:
        public_dir = self.public_workspace_dir()
        self.write_json(s.LOGIN_HISTORY_FILE, {"history": [{"job_id": "job-root", "status": "success", "workspace_id": "public"}]})
        self.write_json(public_dir / "login_history.json", {"history": [{"job_id": "job-public", "status": "failed", "workspace_id": "public"}]})

        job = {
            "job_id": "job-new",
            "email": "new@example.com",
            "name": "new@example.com",
            "started_at": "2026-06-08T03:00:00+00:00",
            "finished_at": "2026-06-08T03:05:00+00:00",
            "state": "success",
            "status": "success",
            "workspace_id": "public",
            "login_only": False,
            "site_url": "",
        }
        s.workspace_state().append_login_history_entry("public", job)

        root_rows = s.load_login_history(s.LOGIN_HISTORY_FILE)
        workspace_rows = s.load_login_history(public_dir / "login_history.json")
        expected = {"job-root", "job-public", "job-new"}
        self.assertEqual({row["job_id"] for row in root_rows}, expected)
        self.assertEqual({row["job_id"] for row in workspace_rows}, expected)

    def test_mailbox_service_pickup_import_respects_replace_existing_false(self) -> None:
        existing = s.MailAccount(
            email="same@example.com",
            password="old-pass",
            client_id="old-client",
            refresh_token="old-rt",
        )
        s.save_workspace_accounts_state("public", {existing.email.lower(): existing})

        result = s.MAILBOX_WORKSPACE_SERVICE.import_pickup_accounts_for_workspace(
            {"text": "same@example.com----new-pass----new-client----new-rt"},
            "public",
            replace_existing=False,
        )

        accounts = s.load_workspace_accounts("public")
        self.assertEqual(result["imported"], 0)
        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(accounts["same@example.com"].password, "old-pass")
        self.assertEqual(accounts["same@example.com"].client_id, "old-client")

    def test_mailbox_service_temp_import_uses_default_worker_url(self) -> None:
        service = s.MailboxWorkspaceService(
            coerce_text=s.coerce_text,
            usable_secret=s.usable_secret,
            iso_now=s.iso_now,
            normalize_temp_worker_url=s.normalize_temp_worker_url,
            default_temp_worker_url="https://temp.example",
            load_workspace_accounts=s.load_workspace_accounts,
            load_workspace_temp_addresses=s.load_workspace_temp_addresses,
            load_workspace_generic_accounts=s.load_workspace_generic_accounts,
            save_workspace_accounts_state=s.save_workspace_accounts_state,
            save_workspace_temp_addresses_state=s.save_workspace_temp_addresses_state,
            save_workspace_generic_accounts_state=s.save_workspace_generic_accounts_state,
            parse_account_lines=s.parse_account_lines,
            parse_temp_address_lines=s.parse_temp_address_lines,
            parse_generic_account_lines=s.parse_generic_account_lines,
            normalize_generic_account=s.normalize_generic_account,
            temp_address_from_worker_row=lambda item: s.TempAddress(
                email=s.coerce_text(item.get("address") or item.get("email")).lower(),
                jwt=s.coerce_text(item.get("jwt")),
            ),
        )

        result = service.import_temp_addresses_for_workspace(
            {"text": "temp@example.com----jwt-value"},
            "public",
            replace_existing=True,
        )

        addresses = s.load_workspace_temp_addresses("public")
        self.assertEqual(result["imported"], 1)
        self.assertEqual(addresses["temp@example.com"].base_url, "https://temp.example")

    def test_mailbox_service_delete_workspace_mail_credentials_removes_all_sources(self) -> None:
        s.save_workspace_accounts_state("public", {
            "same@example.com": s.MailAccount(
                email="same@example.com",
                password="ms-pass",
                client_id="ms-client",
                refresh_token="ms-rt",
            )
        })
        s.save_workspace_temp_addresses_state("public", {
            "same@example.com": s.TempAddress(
                email="same@example.com",
                jwt="temp-jwt",
            )
        })
        s.save_workspace_generic_accounts_state("public", {
            "same@example.com": s.GenericMailAccount(
                email="same@example.com",
                password="generic-pass",
            )
        })

        result = s.MAILBOX_WORKSPACE_SERVICE.delete_workspace_mail_credentials_for_workspace(
            {"emails": ["same@example.com"]},
            "public",
        )

        self.assertEqual(result["deleted"]["microsoft"], 1)
        self.assertEqual(result["deleted"]["temp"], 1)
        self.assertEqual(result["deleted"]["generic"], 1)
        self.assertNotIn("same@example.com", s.load_workspace_accounts("public"))
        self.assertNotIn("same@example.com", s.load_workspace_temp_addresses("public"))
        self.assertNotIn("same@example.com", s.load_workspace_generic_accounts("public"))

    def test_mailbox_service_merges_rotated_token_without_replacing_workspace(self) -> None:
        first = s.MailAccount(
            email="first@example.com",
            password="first-pass",
            client_id="first-client",
            refresh_token="old-rt",
            created_at="2026-01-01T00:00:00Z",
        )
        untouched = s.MailAccount(
            email="untouched@example.com",
            password="untouched-pass",
            client_id="untouched-client",
            refresh_token="untouched-rt",
        )
        s.save_workspace_accounts_state("public", {
            first.email.lower(): first,
            untouched.email.lower(): untouched,
        })
        fetched = s.MailAccount(
            email="first@example.com",
            password="first-pass",
            client_id="first-client",
            refresh_token="rotated-rt",
            last_status="ok",
            last_check_at="2026-08-24T06:00:00Z",
            last_message_count=5,
        )

        result = s.MAILBOX_WORKSPACE_SERVICE.merge_fetched_targets_for_workspace(
            "public",
            accounts=[fetched],
        )

        accounts = s.load_workspace_accounts("public")
        self.assertGreaterEqual(result["microsoft"], 1)
        self.assertEqual(len(accounts), 2)
        self.assertEqual(accounts["first@example.com"].refresh_token, "rotated-rt")
        self.assertEqual(accounts["first@example.com"].last_status, "ok")
        self.assertEqual(accounts["first@example.com"].last_message_count, 5)
        self.assertEqual(accounts["first@example.com"].created_at, "2026-01-01T00:00:00Z")
        self.assertEqual(accounts["untouched@example.com"].refresh_token, "untouched-rt")

    def test_mailbox_service_delete_pickup_accounts_keeps_other_sources(self) -> None:
        s.save_workspace_accounts_state("public", {
            "same@example.com": s.MailAccount(
                email="same@example.com",
                password="ms-pass",
                client_id="ms-client",
                refresh_token="ms-rt",
            )
        })
        s.save_workspace_temp_addresses_state("public", {
            "same@example.com": s.TempAddress(
                email="same@example.com",
                jwt="temp-jwt",
            )
        })

        result = s.MAILBOX_WORKSPACE_SERVICE.delete_pickup_accounts_for_workspace(
            {"emails": ["same@example.com"]},
            "public",
        )

        self.assertEqual(result["deleted"], 1)
        self.assertNotIn("same@example.com", s.load_workspace_accounts("public"))
        self.assertIn("same@example.com", s.load_workspace_temp_addresses("public"))

    def test_workspace_state_append_refresh_result_uses_activity_lock_for_non_public(self) -> None:
        target_path = s.workspace_file("team-a1", "refresh_results.json")
        calls: list[tuple[bool, Path, str]] = []

        state = s.WorkspaceState(
            workspaces_dir=s.WORKSPACES_DIR,
            views=s.WORKSPACE_VIEWS,
            save_accounts_map=s.save_accounts,
            save_temp_addresses_map=s.save_temp_addresses,
            save_generic_accounts_map=s.save_generic_accounts,
            save_messages_rows=s.save_messages,
            append_refresh_result_row=lambda path, auth_file, email, job_id: None,
            append_login_history_row=lambda path, job: None,
            save_refresh_results_rows=lambda path, rows: None,
            save_login_history_rows=lambda path, rows: None,
            message_key=s.message_key,
            coerce_text=s.coerce_text,
            iso_now=s.iso_now,
            row_fallback_key=s.json_row_fallback_key,
        )
        real_lock = state._activity_lock()

        def locked_append(path, auth_file, email, job_id):
            calls.append((real_lock._is_owned(), path, email))

        object.__setattr__(state, "append_refresh_result_row", locked_append)

        state.append_refresh_result("team-a1", {"email": "user@example.com"}, email="user@example.com", job_id="job-1")

        self.assertEqual(calls, [(True, target_path, "user@example.com")])

    def test_public_workspace_append_refresh_result_refuses_to_overwrite_when_one_side_is_corrupt(self) -> None:
        public_dir = self.public_workspace_dir()
        self.write_json(s.REFRESH_RESULTS_FILE, {"results": [{"email": "root@example.com", "job_id": "job-root"}]})
        corrupt_path = public_dir / "refresh_results.json"
        corrupt_path.parent.mkdir(parents=True, exist_ok=True)
        corrupt_path.write_text("{bad json", encoding="utf-8")

        with self.assertRaises(RuntimeError):
            s.workspace_state().append_refresh_result(
                "public",
                {"email": "new@example.com", "name": "new@example.com"},
                email="new@example.com",
                job_id="job-new",
            )

        root_rows = s.load_refresh_results(s.REFRESH_RESULTS_FILE)
        self.assertEqual({row["email"] for row in root_rows}, {"root@example.com"})
        self.assertEqual(corrupt_path.read_text(encoding="utf-8"), "{bad json")

    def test_public_workspace_append_login_history_refuses_to_overwrite_when_one_side_is_corrupt(self) -> None:
        public_dir = self.public_workspace_dir()
        self.write_json(s.LOGIN_HISTORY_FILE, {"history": [{"job_id": "job-root", "status": "success", "workspace_id": "public"}]})
        corrupt_path = public_dir / "login_history.json"
        corrupt_path.parent.mkdir(parents=True, exist_ok=True)
        corrupt_path.write_text("{bad json", encoding="utf-8")

        with self.assertRaises(RuntimeError):
            s.workspace_state().append_login_history_entry(
                "public",
                {
                    "job_id": "job-new",
                    "email": "new@example.com",
                    "name": "new@example.com",
                    "started_at": "2026-06-08T03:00:00+00:00",
                    "finished_at": "2026-06-08T03:05:00+00:00",
                    "state": "success",
                    "status": "success",
                    "workspace_id": "public",
                    "login_only": False,
                    "site_url": "",
                },
            )

        root_rows = s.load_login_history(s.LOGIN_HISTORY_FILE)
        self.assertEqual({row["job_id"] for row in root_rows}, {"job-root"})
        self.assertEqual(corrupt_path.read_text(encoding="utf-8"), "{bad json")


if __name__ == "__main__":
    unittest.main()
