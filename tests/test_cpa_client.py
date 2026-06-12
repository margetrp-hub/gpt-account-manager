import unittest

from cpa_client import CpaClient


class CpaClientTests(unittest.TestCase):
    def make_client(self, *, http_request_json=None, refresh_lifecycle_item=None, run_chatgpt_login_with_protocol=None, session_to_cpa_auth=None):
        requests = []

        def fake_http_request_json(url, **kwargs):
            requests.append((url, kwargs))
            if http_request_json:
                return http_request_json(url, **kwargs)
            return {}

        def fake_refresh_lifecycle_item(payload):
            if refresh_lifecycle_item:
                return refresh_lifecycle_item(payload)
            return {"status": "active", "status_label": "可用", "message": "账号可用", "ok": True}

        def fake_run_chatgpt_login_with_protocol(job_id, payload):
            if run_chatgpt_login_with_protocol:
                return run_chatgpt_login_with_protocol(job_id, payload)
            return {"refresh_token": "rt-new"}

        def fake_session_to_cpa_auth(session_payload, row, require_refresh_token=False):
            if session_to_cpa_auth:
                return session_to_cpa_auth(session_payload, row, require_refresh_token=require_refresh_token)
            return {"email": row.get("email"), "refresh_token": session_payload.get("refresh_token", "rt-new")}

        client = CpaClient(
            coerce_text=lambda value: str(value or "").strip(),
            first_text=lambda *values: next((str(value).strip() for value in values if str(value or "").strip()), ""),
            http_request_json=fake_http_request_json,
            normalize_cpa_base_url=lambda value: str(value or "").strip().rstrip("/"),
            validate_cpa_base_url=lambda value: None,
            cpa_status_message=lambda value, status_code=None, action="": (f"{action or status_code or 'status'}", str(value)),
            lifecycle_status_label=lambda status: {"active": "可用", "probe_failed": "探测失败", "not_openai_auth": "非 OpenAI 凭证"}.get(status, status),
            refresh_lifecycle_item=fake_refresh_lifecycle_item,
            lifecycle_summary=lambda results, uploaded=0: {"total": len(results), "uploaded": uploaded},
            run_chatgpt_login_with_protocol=fake_run_chatgpt_login_with_protocol,
            session_to_cpa_auth=fake_session_to_cpa_auth,
            probe_user_agent="probe-agent",
        )
        return client, requests

    def test_direct_oauth_start_reads_authorize_url_and_state(self):
        def fake_http(url, **kwargs):
            self.assertTrue(url.endswith("/v0/management/codex-auth-url"))
            return {
                "data": {
                    "authUrl": "https://auth.openai.com/oauth/authorize?state=abc123",
                }
            }

        client, _requests = self.make_client(http_request_json=fake_http)

        result = client.direct_oauth_start({"base_url": "http://localhost:8317", "management_key": "key"})

        self.assertTrue(result["success"])
        self.assertEqual(result["authorize_url"], "https://auth.openai.com/oauth/authorize?state=abc123")
        self.assertEqual(result["state"], "abc123")

    def test_replace_auth_file_uploads_and_probes_uploaded_item(self):
        calls = []

        def fake_http(url, **kwargs):
            calls.append((url, kwargs))
            if url.endswith("/v0/management/auth-files?name=user%40example.com.json"):
                return {"status": "ok"}
            if url.endswith("/v0/management/auth-files"):
                return {"files": [{"name": "user@example.com.json", "email": "user@example.com", "auth_index": "idx"}]}
            if url.endswith("/v0/management/api-call"):
                return {"status_code": 200}
            raise AssertionError(f"unexpected url {url}")

        client, _requests = self.make_client(http_request_json=fake_http)

        result = client.replace_auth_file({
            "base_url": "http://localhost:8317",
            "management_key": "key",
            "name": "user@example.com",
            "auth_file": {"email": "user@example.com", "access_token": "token"},
        })

        self.assertTrue(result["success"])
        self.assertEqual(result["result"]["action"], "replaced")
        self.assertEqual(result["result"]["probe"]["status_code"], 200)
        self.assertEqual(result["upload"]["name"], "user@example.com.json")
        self.assertEqual(len(calls), 3)

    def test_refresh_lifecycle_only_keeps_401_when_requested(self):
        def fake_http(url, **kwargs):
            if url.endswith("/v0/management/auth-files"):
                return {
                    "files": [
                        {"name": "a.json", "email": "a@example.com", "auth_index": "a1"},
                        {"name": "b.json", "email": "b@example.com", "auth_index": "b1"},
                    ]
                }
            if "download?name=a.json" in url:
                return {"email": "a@example.com", "refresh_token": "rta", "access_token": "token-a"}
            if "download?name=b.json" in url:
                return {"email": "b@example.com", "refresh_token": "rtb", "access_token": "token-b"}
            if url.endswith("/v0/management/api-call"):
                auth_index = kwargs["json_data"]["authIndex"]
                return {"status_code": 401 if auth_index == "a1" else 200}
            raise AssertionError(f"unexpected url {url}")

        seen_payloads = []

        def fake_refresh(payload):
            seen_payloads.append(payload)
            auth_file = payload["auth_file"]
            return {
                "status": "active",
                "status_label": "可用",
                "message": f"{auth_file.get('email')} ok",
                "ok": True,
                "auth_file": auth_file,
                "email": auth_file.get("email"),
            }

        client, _requests = self.make_client(http_request_json=fake_http, refresh_lifecycle_item=fake_refresh)

        result = client.refresh_lifecycle({
            "base_url": "http://localhost:8317",
            "management_key": "key",
            "only_401": True,
        })

        self.assertTrue(result["success"])
        self.assertEqual(len(result["results"]), 1)
        self.assertEqual(result["results"][0]["email"], "a@example.com")
        self.assertEqual(len(seen_payloads), 1)


if __name__ == "__main__":
    unittest.main()
