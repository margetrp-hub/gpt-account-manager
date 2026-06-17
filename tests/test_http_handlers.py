import unittest
from http import HTTPStatus

from http_handlers import HttpHandlers


class DummyItem:
    def __init__(self, email: str):
        self.email = email

    def public(self):
        return {"email": self.email}


class DummyMailboxService:
    def import_pickup_accounts_for_workspace(self, payload, workspace, replace_existing=False):
        return {"kind": "import", "payload": payload, "workspace": workspace, "replace_existing": replace_existing}

    def import_temp_addresses_for_workspace(self, payload, workspace, replace_existing=False):
        return {"kind": "temp-import", "payload": payload, "workspace": workspace, "replace_existing": replace_existing}

    def import_generic_accounts_for_workspace(self, payload, workspace, replace_existing=False):
        return {"kind": "generic-import", "payload": payload, "workspace": workspace, "replace_existing": replace_existing}

    def delete_pickup_accounts_for_workspace(self, payload, workspace):
        return {"kind": "delete", "payload": payload, "workspace": workspace}

    def delete_temp_addresses_for_workspace(self, payload, workspace):
        return {"kind": "temp-delete", "payload": payload, "workspace": workspace}

    def delete_generic_accounts_for_workspace(self, payload, workspace):
        return {"kind": "generic-delete", "payload": payload, "workspace": workspace}


class DummyCpaHandlers:
    def __init__(self):
        self.get_calls = []
        self.post_calls = []

    def handle_client_get(self, handler, parsed_request):
        self.get_calls.append(parsed_request.path)
        return parsed_request.path == "/client-api/cpa/test"

    def handle_client_post(self, handler):
        self.post_calls.append(handler.path)
        return handler.path == "/client-api/cpa/test"


class DummyHandler:
    def __init__(self, *, path="/", payload=None, workspace_id="ws_demo"):
        self.path = path
        self._payload = payload if payload is not None else {}
        self._workspace_id = workspace_id
        self.sent = []
        self.errors = []
        self.static_files = []
        self.headers_sent = []
        self.response_status = None
        self.response_headers = []
        self.ended = False
        self.auth_required = 0
        self.admin_required = 0

    def workspace_id(self):
        return self._workspace_id

    def read_json(self):
        return dict(self._payload)

    def send_json(self, payload, status=HTTPStatus.OK):
        self.sent.append((payload, status))

    def send_json_with_headers(self, payload, headers, status=HTTPStatus.OK):
        self.headers_sent.append((payload, headers, status))

    def serve_static(self):
        self.static_files.append("serve_static")

    def serve_static_file(self, target):
        self.static_files.append(str(target))

    def require_auth(self):
        self.auth_required += 1

    def require_admin_page_auth(self):
        self.admin_required += 1

    def admin_cookie_header(self, token):
        return f"cookie={token}"

    def clear_admin_cookie_header(self):
        return "cookie=;"

    def send_response(self, status):
        self.response_status = status

    def send_header(self, key, value):
        self.response_headers.append((key, value))

    def end_headers(self):
        self.ended = True

    def send_error(self, status):
        self.errors.append(status)


class HttpHandlersTests(unittest.TestCase):
    def make_handlers(self):
        self.cpa = DummyCpaHandlers()
        return HttpHandlers(
            app_version="1.0.5",
            public_app_title="GPT账号管理助手",
            public_store_url="",
            public_relay_url="https://relay.example.com",
            public_pool_url="https://pool.example.com",
            public_pool_api_url="",
            public_top_links=lambda: [{"label": "Demo"}],
            static_dir=__import__("pathlib").Path("/static"),
            login_debug_dir=__import__("pathlib").Path("/debug"),
            admin_token="token",
            cpa_http_handlers=self.cpa,
            health_payload=lambda: {"ok": True},
            network_health_payload=lambda: {"network": "ok"},
            public_stats_payload=lambda: {"ok": True, "usage": {"workspace_active_24h": 3}},
            upgrade_status_payload=lambda: {"status": "idle"},
            get_client_mail_fetch_job=lambda job_id, workspace: {"job_id": job_id, "workspace": workspace},
            send_workspace_messages_json=lambda handler, workspace_id, **kwargs: handler.send_json({"workspace": workspace_id, "messages": []}),
            dashboard_stats_response=lambda workspace_id, **kwargs: {"workspace": workspace_id, "stats": True},
            load_workspace_accounts=lambda workspace_id: {"a": DummyItem("a@example.com")},
            load_workspace_temp_addresses=lambda workspace_id: {"t": DummyItem("t@example.com")},
            load_workspace_generic_accounts=lambda workspace_id: {"g": DummyItem("g@example.com")},
            load_refresh_results_for_workspace=lambda workspace_id: [{"email": "r@example.com"}],
            load_login_history_for_workspace=lambda workspace_id: [{"job_id": "j1"}],
            hydrate_login_mail_credentials=lambda payload, workspace: payload.update({"hydrated": workspace}),
            fetch_transient_client_mail=lambda payload: {"messages": [], "payload": payload},
            persist_workspace_mail_fetch_result=lambda workspace, result: {"workspace": workspace, "result": result},
            start_client_mail_fetch_job=lambda payload, workspace: {"workspace": workspace, "job": payload},
            delete_workspace_mail_messages=lambda payload, workspace: {"workspace": workspace, "deleted": payload},
            check_proxy_egress=lambda payload: {"proxy": payload},
            classify_login_exception=lambda exc: {"message": str(exc), "code": "bad_request", "hint": "", "retryable": True},
            sync_temp_jwts_from_worker=lambda payload, workspace: {"workspace": workspace, "synced": payload},
            import_pickup_accounts=lambda payload, workspace: {"workspace": workspace, "imported": payload},
            import_temp_addresses=lambda payload, workspace: {"workspace": workspace, "temp": payload},
            import_generic_accounts=lambda payload, workspace: {"workspace": workspace, "generic": payload},
            delete_workspace_mail_credentials=lambda payload, workspace: {"workspace": workspace, "deleted": payload},
            poll_phone_code=lambda payload: {"code": "123456", "payload": payload},
            extract_admin_jwts=lambda payload: {"jwts": payload},
            push_public_pool=lambda payload: {"pushed": payload},
            create_upgrade_request=lambda payload: {"upgrade": payload},
            mailbox_workspace_service=DummyMailboxService(),
            fetch_saved_workspace_mail=lambda payload, workspace: {"workspace": workspace, "fetched": payload},
            search_workspace_messages_response=lambda workspace, payload: {"workspace": workspace, "search": payload},
        )

    def test_public_config_get_returns_public_payload(self):
        handlers = self.make_handlers()
        handler = DummyHandler(path="/public-config")

        handlers.handle_get(handler)

        payload, status = handler.sent[0]
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(payload["version"], "1.0.5")
        self.assertEqual(payload["public_pool_url"], "https://pool.example.com")

    def test_client_accounts_get_returns_public_rows(self):
        handlers = self.make_handlers()
        handler = DummyHandler(path="/client-api/accounts")

        handlers.handle_get(handler)

        self.assertEqual(handler.sent[0][0], {"accounts": [{"email": "a@example.com"}]})

    def test_workspace_messages_get_requires_auth(self):
        handlers = self.make_handlers()
        handler = DummyHandler(path="/api/messages?query=hello")

        handlers.handle_get(handler)

        self.assertEqual(handler.auth_required, 1)
        self.assertEqual(handler.sent[0][0]["workspace"], "ws_demo")

    def test_auth_login_post_sets_cookie(self):
        handlers = self.make_handlers()
        handler = DummyHandler(path="/auth/login", payload={"token": "token"})

        handlers.handle_post(handler)

        payload, headers, status = handler.headers_sent[0]
        self.assertEqual(status, HTTPStatus.OK)
        self.assertTrue(payload["success"])
        self.assertEqual(headers["Set-Cookie"], "cookie=token")

    def test_client_fetch_post_hydrates_and_persists(self):
        handlers = self.make_handlers()
        handler = DummyHandler(path="/client-api/fetch", payload={"email": "user@example.com"})

        handlers.handle_post(handler)

        payload, status = handler.sent[0]
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(payload["workspace"], "ws_demo")
        self.assertEqual(payload["result"]["payload"]["hydrated"], "ws_demo")

    def test_workspace_import_post_routes_to_workspace_service(self):
        handlers = self.make_handlers()
        handler = DummyHandler(path="/api/import", payload={"replaceExisting": True, "items": [1]})

        handlers.handle_post(handler)

        payload, status = handler.sent[0]
        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(payload["kind"], "import")
        self.assertTrue(payload["replace_existing"])

    def test_unknown_path_falls_back_to_static(self):
        handlers = self.make_handlers()
        handler = DummyHandler(path="/unknown")

        handlers.handle_get(handler)

        self.assertEqual(handler.static_files, ["serve_static"])


if __name__ == "__main__":
    unittest.main()
