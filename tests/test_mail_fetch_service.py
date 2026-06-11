import unittest

from mail_fetch_service import MailFetchService


class DummyAccount:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


def simple_parse_accounts(text: str):
    rows = []
    errors = []
    for line in [item.strip() for item in text.splitlines() if item.strip()]:
        parts = line.split("----")
        if len(parts) < 4:
            errors.append("bad account")
            continue
        rows.append(DummyAccount(
            email=parts[0],
            password=parts[1],
            client_id=parts[2],
            refresh_token=parts[3],
            label=parts[4] if len(parts) > 4 else "",
        ))
    return rows, errors


def simple_parse_temp(text: str):
    rows = []
    errors = []
    for line in [item.strip() for item in text.splitlines() if item.strip()]:
        parts = line.split("----")
        if len(parts) < 2:
            errors.append("bad temp")
            continue
        rows.append(DummyAccount(
            email=parts[0],
            jwt=parts[1],
            base_url=parts[2] if len(parts) > 2 else "",
            site_password=parts[3] if len(parts) > 3 else "",
            label=parts[4] if len(parts) > 4 else "",
        ))
    return rows, errors


def simple_parse_generic(text: str):
    rows = []
    errors = []
    for line in [item.strip() for item in text.splitlines() if item.strip()]:
        parts = line.split("----")
        if len(parts) < 2:
            errors.append("bad generic")
            continue
        rows.append(DummyAccount(
            email=parts[0],
            password=parts[1],
            username="",
            mode=parts[2] if len(parts) > 2 else "auto",
            imap_host=parts[3] if len(parts) > 3 else "",
            imap_port=993,
            pop3_host="",
            pop3_port=995,
            label=parts[4] if len(parts) > 4 else "",
        ))
    return rows, errors


class MailFetchServiceTests(unittest.TestCase):
    def make_service(self, *, temp_worker_url="https://temp.example", run_result=None):
        captured = {"jobs": None}

        def run_jobs(jobs, progress_callback=None):
            captured["jobs"] = jobs
            if progress_callback:
                for index, (_, target, *_rest) in enumerate(jobs, start=1):
                    progress_callback({
                        "processed": index,
                        "total": len(jobs),
                        "current_email": getattr(target, "email", ""),
                        "current_index": index - 1,
                    })
            return run_result if run_result is not None else []

        validations = []

        service = MailFetchService(
            coerce_text=lambda value: str(value or "").strip(),
            coerce_port=lambda value, default: int(value or default),
            usable_secret=lambda value: bool(str(value or "").strip()),
            normalize_temp_worker_url=lambda value: str(value or "").strip(),
            normalize_base_url=lambda value: str(value or "").strip(),
            normalize_generic_mail_mode=lambda value: str(value or "auto").strip().lower() or "auto",
            validate_configured_base_url=lambda value: validations.append(value),
            parse_account_lines=simple_parse_accounts,
            parse_temp_address_lines=simple_parse_temp,
            parse_generic_account_lines=simple_parse_generic,
            mail_account_factory=lambda **kwargs: DummyAccount(**kwargs),
            temp_address_factory=lambda **kwargs: DummyAccount(**kwargs),
            generic_account_factory=lambda **kwargs: DummyAccount(**kwargs),
            normalize_generic_account=lambda account: account,
            temp_worker_url=temp_worker_url,
            temp_site_password="site-key",
            run_mail_fetch_jobs=run_jobs,
            message_sort_value=lambda row: row.get("received_at", ""),
            mail_type_labels={"verification": "verification"},
        )
        return service, captured, validations

    def test_prepare_request_filters_jobs_to_selected_emails(self):
        service, captured, validations = self.make_service()
        payload = {
            "emails": ["user2@example.com"],
            "accounts": [
                {"email": "user1@example.com", "password": "pw", "client_id": "cid1", "refresh_token": "rt1"},
                {"email": "user2@example.com", "password": "pw", "client_id": "cid2", "refresh_token": "rt2"},
            ],
            "temp_addresses": [
                {"email": "user2@example.com", "jwt": "jwt-2", "base_url": "https://temp.example"},
                {"email": "user3@example.com", "jwt": "jwt-3", "base_url": "https://temp.example"},
            ],
            "generic_accounts": [
                {"email": "user2@example.com", "password": "token-2", "mode": "imap"},
                {"email": "user4@example.com", "password": "token-4", "mode": "imap"},
            ],
            "source": "all",
            "provider": "auto",
            "limit": 9,
        }

        prepared = service.prepare_request(payload)

        self.assertEqual(prepared.total_targets, 3)
        self.assertEqual([job[0] for job in prepared.jobs], ["microsoft", "temp", "generic"])
        self.assertEqual([getattr(job[1], "email", "") for job in prepared.jobs], ["user2@example.com"] * 3)
        self.assertEqual(validations, ["https://temp.example", "https://temp.example"])
        self.assertIsNone(captured["jobs"])

    def test_prepare_request_requires_temp_worker_url_when_temp_entry_has_no_base_url(self):
        service, _captured, _validations = self.make_service(temp_worker_url="")
        payload = {
            "temp_addresses": [{"email": "user@example.com", "jwt": "jwt-only", "base_url": ""}],
            "source": "temp",
        }

        with self.assertRaises(RuntimeError):
            service.prepare_request(payload)

    def test_fetch_prepared_runs_jobs_and_sorts_messages(self):
        run_result = [
            {
                "ok": True,
                "messages": [{"received_at": "2026-06-08T02:00:00+00:00", "subject": "older"}],
            },
            {
                "ok": False,
                "messages": [{"received_at": "2026-06-08T03:00:00+00:00", "subject": "newer"}],
            },
        ]
        service, captured, _validations = self.make_service(run_result=run_result)
        prepared = service.prepare_request({
            "accounts": [{"email": "user@example.com", "password": "pw", "client_id": "cid", "refresh_token": "rt"}],
            "source": "microsoft",
        })

        progress = []
        result = service.fetch_prepared(prepared, progress_callback=lambda item: progress.append(item))

        self.assertEqual(len(captured["jobs"]), 1)
        self.assertEqual(result["summary"]["total"], 2)
        self.assertEqual(result["summary"]["failed"], 1)
        self.assertEqual([item["subject"] for item in result["messages"]], ["newer", "older"])
        self.assertEqual(progress[0]["current_email"], "user@example.com")

    def test_prepare_request_validates_base_url_for_cloudmail_family(self):
        service, _captured, validations = self.make_service()

        prepared = service.prepare_request({
            "source": "generic",
            "generic_accounts": [
                {"email": "cloud@example.com", "password": "pw", "mode": "cloudmail", "imap_host": "https://cloud.example"},
                {"email": "luck@example.com", "password": "pw", "mode": "luckmail", "imap_host": "https://luck.example"},
                {"email": "bucket@example.com", "password": "pw", "mode": "inbucket", "imap_host": "https://bucket.example"},
                {"email": "imap@example.com", "password": "pw", "mode": "imap", "imap_host": "imap.example.com"},
            ],
        })

        self.assertEqual(prepared.total_targets, 4)
        self.assertEqual(
            validations,
            ["https://cloud.example", "https://luck.example", "https://bucket.example"],
        )

    def test_fetch_runs_prepare_and_reports_progress_for_direct_payload(self):
        run_result = [{
            "ok": True,
            "messages": [{"received_at": "2026-06-08T04:00:00+00:00", "subject": "hello"}],
        }]
        service, captured, _validations = self.make_service(run_result=run_result)

        progress = []
        result = service.fetch({
            "source": "microsoft",
            "accounts": [{"email": "user@example.com", "password": "pw", "client_id": "cid", "refresh_token": "rt"}],
        }, progress_callback=lambda item: progress.append(item))

        self.assertEqual(len(captured["jobs"]), 1)
        self.assertEqual(captured["jobs"][0][0], "microsoft")
        self.assertEqual(captured["jobs"][0][1].email, "user@example.com")
        self.assertEqual(result["summary"]["ok"], 1)
        self.assertEqual(result["messages"][0]["subject"], "hello")
        self.assertEqual(progress[0]["processed"], 1)
        self.assertEqual(progress[0]["current_email"], "user@example.com")

    def test_prepare_saved_workspace_request_filters_jobs_and_preserves_tuple_fields(self):
        service, captured, _validations = self.make_service()

        prepared = service.prepare_saved_workspace_request(
            {
                "emails": ["user2@example.com"],
                "source": "all",
                "provider": "graph",
                "sender_filter": "openai",
                "limit": 9,
            },
            accounts={
                "user1@example.com": DummyAccount(email="user1@example.com"),
                "user2@example.com": DummyAccount(email="user2@example.com"),
            },
            temp_addresses={
                "user2@example.com": DummyAccount(email="user2@example.com"),
                "user3@example.com": DummyAccount(email="user3@example.com"),
            },
            generic_accounts={
                "user2@example.com": DummyAccount(email="user2@example.com"),
                "user4@example.com": DummyAccount(email="user4@example.com"),
            },
        )

        self.assertEqual(prepared.total_targets, 3)
        self.assertEqual([job[0] for job in prepared.jobs], ["microsoft", "temp", "generic"])
        self.assertEqual([getattr(job[1], "email", "") for job in prepared.jobs], ["user2@example.com"] * 3)
        self.assertEqual([job[2] for job in prepared.jobs], ["graph", "graph", "graph"])
        self.assertEqual([job[3] for job in prepared.jobs], [9, 9, 9])
        self.assertEqual([job[4] for job in prepared.jobs], ["openai", "openai", "openai"])
        self.assertIsNone(captured["jobs"])

    def test_fetch_saved_workspace_wraps_prepared_state_and_result(self):
        run_result = [{
            "ok": True,
            "messages": [{"received_at": "2026-06-08T05:00:00+00:00", "subject": "saved"}],
        }]
        service, captured, _validations = self.make_service(run_result=run_result)
        accounts = {"user@example.com": DummyAccount(email="user@example.com")}

        progress = []
        fetched = service.fetch_saved_workspace(
            {"source": "microsoft", "emails": ["user@example.com"], "provider": "auto", "limit": 5},
            accounts=accounts,
            temp_addresses={},
            generic_accounts={},
            progress_callback=lambda item: progress.append(item),
        )

        self.assertIs(fetched.accounts, accounts)
        self.assertEqual(len(captured["jobs"]), 1)
        self.assertEqual(captured["jobs"][0][0], "microsoft")
        self.assertEqual(captured["jobs"][0][1].email, "user@example.com")
        self.assertEqual(captured["jobs"][0][2], "auto")
        self.assertEqual(captured["jobs"][0][3], 5)
        self.assertEqual(fetched.result["summary"]["ok"], 1)
        self.assertEqual(fetched.result["messages"][0]["subject"], "saved")
        self.assertEqual(progress[0]["current_email"], "user@example.com")

    def test_prepare_request_keeps_parse_errors_alongside_valid_rows(self):
        service, _captured, _validations = self.make_service()

        prepared = service.prepare_request({
            "source": "all",
            "accounts_text": "bad-line\nuser@example.com----pw----cid----rt",
            "temp_addresses": ["bad-object"],
            "generic_accounts": [
                {"email": "generic@example.com", "password": "pw", "mode": "imap"},
                "bad-generic",
            ],
        })

        self.assertEqual(prepared.total_targets, 2)
        self.assertEqual([job[0] for job in prepared.jobs], ["microsoft", "generic"])
        self.assertIn("bad account", prepared.errors)
        self.assertIn("Temp address 1: invalid object", prepared.errors)
        self.assertIn("Generic account 2: invalid object", prepared.errors)


if __name__ == "__main__":
    unittest.main()
