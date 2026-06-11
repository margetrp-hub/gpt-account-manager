import unittest
from http import HTTPStatus
from unittest import mock

import server as s


class WorkspaceRequestIdTests(unittest.TestCase):
    def test_missing_workspace_defaults_to_public(self) -> None:
        self.assertEqual(s.request_workspace_id("", ""), "public")

    def test_valid_header_takes_priority(self) -> None:
        self.assertEqual(
            s.request_workspace_id("ws_alpha01", "ws_beta02"),
            "ws_alpha01",
        )

    def test_invalid_header_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            s.request_workspace_id("bad id", "")

    def test_invalid_query_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            s.request_workspace_id("", "bad id")

    def test_valid_query_is_used_when_header_missing(self) -> None:
        self.assertEqual(s.request_workspace_id("", "ws_query1"), "ws_query1")


class MessageQueryParamTests(unittest.TestCase):
    def test_parse_message_query_params_uses_existing_defaults(self) -> None:
        payload, limit, offset = s.parse_message_query_params({})

        self.assertEqual(payload, {
            "query": "",
            "sender": "",
            "source": "all",
            "mail_type": "all",
            "category": "all",
            "account": "",
            "accounts": [],
        })
        self.assertEqual(limit, "80")
        self.assertEqual(offset, "0")

    def test_parse_message_query_params_returns_first_values(self) -> None:
        payload, limit, offset = s.parse_message_query_params({
            "query": ["hello", "ignored"],
            "sender": ["ops@example.com"],
            "source": ["microsoft"],
            "mail_type": ["verification"],
            "category": ["inbox"],
            "account": ["user@example.com"],
            "accounts": ["a@example.com", "", "b@example.com"],
            "limit": ["25"],
            "offset": ["50"],
        })

        self.assertEqual(payload, {
            "query": "hello",
            "sender": "ops@example.com",
            "source": "microsoft",
            "mail_type": "verification",
            "category": "inbox",
            "account": "user@example.com",
            "accounts": ["a@example.com", "b@example.com"],
        })
        self.assertEqual(limit, "25")
        self.assertEqual(offset, "50")

    def test_workspace_messages_response_from_params_delegates_existing_contract(self) -> None:
        seen = {}
        fake_service = mock.Mock()
        fake_service.workspace_messages_response_from_params.side_effect = lambda workspace_id, params: seen.update({
            "workspace_id": workspace_id,
            "params": params,
        }) or {"success": True, "messages": []}
        with mock.patch.object(s, "MESSAGE_QUERY_SERVICE", fake_service):
            result = s.workspace_messages_response_from_params("ws_demo", {
                "query": ["hello"],
                "sender": ["ops@example.com"],
                "source": ["microsoft"],
                "mail_type": ["verification"],
                "category": ["inbox"],
                "account": ["user@example.com"],
                "accounts": ["a@example.com", "b@example.com"],
                "limit": ["25"],
                "offset": ["50"],
            })

        self.assertEqual(result, {"success": True, "messages": []})
        self.assertEqual(seen, {
            "workspace_id": "ws_demo",
            "params": {
                "query": ["hello"],
                "sender": ["ops@example.com"],
                "source": ["microsoft"],
                "mail_type": ["verification"],
                "category": ["inbox"],
                "account": ["user@example.com"],
                "accounts": ["a@example.com", "b@example.com"],
                "limit": ["25"],
                "offset": ["50"],
            },
        })

    def test_workspace_messages_response_from_payload_delegates_existing_contract(self) -> None:
        seen = {}
        original = s.cached_workspace_messages_response

        def fake_cached_workspace_messages_response(workspace_id, payload, *, limit=80, offset=0):
            seen["workspace_id"] = workspace_id
            seen["payload"] = payload
            seen["limit"] = limit
            seen["offset"] = offset
            return {"success": True, "messages": []}

        s.cached_workspace_messages_response = fake_cached_workspace_messages_response
        try:
            result = s.workspace_messages_response_from_payload(
                "ws_demo",
                {"query": "hello", "account": "user@example.com"},
                limit=25,
                offset=50,
            )
        finally:
            s.cached_workspace_messages_response = original

        self.assertEqual(result, {"success": True, "messages": []})
        self.assertEqual(seen, {
            "workspace_id": "ws_demo",
            "payload": {"query": "hello", "account": "user@example.com"},
            "limit": 25,
            "offset": 50,
        })

    def test_workspace_messages_response_from_request_payload_uses_existing_limit_offset_fields(self) -> None:
        seen = {}
        fake_service = mock.Mock()
        fake_service.workspace_messages_response_from_request_payload.side_effect = lambda workspace_id, payload: seen.update({
            "workspace_id": workspace_id,
            "payload": payload,
        }) or {"success": True, "messages": []}
        with mock.patch.object(s, "MESSAGE_QUERY_SERVICE", fake_service):
            result = s.workspace_messages_response_from_request_payload(
                "ws_demo",
                {"query": "hello", "account": "user@example.com", "limit": 25, "offset": 50},
            )

        self.assertEqual(result, {"success": True, "messages": []})
        self.assertEqual(seen, {
            "workspace_id": "ws_demo",
            "payload": {"query": "hello", "account": "user@example.com", "limit": 25, "offset": 50},
        })

    def test_send_workspace_messages_json_uses_params_path(self) -> None:
        seen = {}
        original = s.workspace_messages_response_from_params

        class DummyHandler:
            def send_json(self, payload):
                seen["sent"] = payload

        def fake_workspace_messages_response_from_params(workspace_id, params):
            seen["workspace_id"] = workspace_id
            seen["params"] = params
            return {"success": True, "messages": ["params"]}

        s.workspace_messages_response_from_params = fake_workspace_messages_response_from_params
        try:
            s.send_workspace_messages_json(DummyHandler(), "ws_demo", params={"query": ["hello"]})
        finally:
            s.workspace_messages_response_from_params = original

        self.assertEqual(seen, {
            "workspace_id": "ws_demo",
            "params": {"query": ["hello"]},
            "sent": {"success": True, "messages": ["params"]},
        })

    def test_send_workspace_messages_json_uses_payload_path(self) -> None:
        seen = {}
        original = s.workspace_messages_response_from_request_payload

        class DummyHandler:
            def send_json(self, payload):
                seen["sent"] = payload

        def fake_workspace_messages_response_from_request_payload(workspace_id, payload):
            seen["workspace_id"] = workspace_id
            seen["payload"] = payload
            return {"success": True, "messages": ["payload"]}

        s.workspace_messages_response_from_request_payload = fake_workspace_messages_response_from_request_payload
        try:
            s.send_workspace_messages_json(DummyHandler(), "ws_demo", payload={"query": "hello"})
        finally:
            s.workspace_messages_response_from_request_payload = original

        self.assertEqual(seen, {
            "workspace_id": "ws_demo",
            "payload": {"query": "hello"},
            "sent": {"success": True, "messages": ["payload"]},
        })

    def test_search_workspace_messages_response_preserves_search_contract(self) -> None:
        original = s.workspace_messages_response_from_request_payload
        seen = {}

        def fake_workspace_messages_response_from_request_payload(workspace_id, payload):
            seen["workspace_id"] = workspace_id
            seen["payload"] = payload
            return {
                "success": True,
                "messages": [{"subject": "hello"}],
                "count": 99,
                "offset": 10,
                "limit": 1,
                "types": {"verification": "verification"},
            }

        s.workspace_messages_response_from_request_payload = fake_workspace_messages_response_from_request_payload
        try:
            result = s.search_workspace_messages_response("ws_demo", {"query": "hello", "limit": 5, "offset": 10})
        finally:
            s.workspace_messages_response_from_request_payload = original

        self.assertEqual(result, {
            "messages": [{"subject": "hello"}],
            "count": 1,
            "types": {"verification": "verification"},
        })
        self.assertEqual(seen, {
            "workspace_id": "ws_demo",
            "payload": {"query": "hello", "limit": 5},
        })

    def test_fetch_saved_workspace_mail_filters_selected_source_and_saves_results(self) -> None:
        original_load_accounts = s.load_workspace_accounts
        original_load_temp = s.load_workspace_temp_addresses
        original_load_generic = s.load_workspace_generic_accounts
        original_save_accounts = s.save_workspace_accounts_state
        original_save_temp = s.save_workspace_temp_addresses_state
        original_save_generic = s.save_workspace_generic_accounts_state
        original_workspace_state = s.workspace_state
        original_mail_fetch_service = s.MAIL_FETCH_SERVICE

        saved = {}

        class DummyWorkspaceState:
            def upsert_messages_state(self, workspace_id, messages):
                saved["workspace_id"] = workspace_id
                saved["messages"] = messages

        s.load_workspace_accounts = lambda workspace_id: {
            "a@example.com": object(),
            "b@example.com": object(),
        }
        s.load_workspace_temp_addresses = lambda workspace_id: {
            "t@example.com": object(),
        }
        s.load_workspace_generic_accounts = lambda workspace_id: {
            "g@example.com": object(),
        }
        def fake_fetch_saved_workspace(payload, *, accounts, temp_addresses, generic_accounts, progress_callback=None):
            self.assertEqual(payload["source"], "microsoft")
            self.assertEqual(payload["emails"], ["a@example.com"])
            self.assertEqual(sorted(accounts.keys()), ["a@example.com", "b@example.com"])
            self.assertEqual(list(temp_addresses.keys()), ["t@example.com"])
            self.assertEqual(list(generic_accounts.keys()), ["g@example.com"])
            return type("Fetched", (), {
                "accounts": accounts,
                "temp_addresses": temp_addresses,
                "generic_accounts": generic_accounts,
                "result": {
                    "results": [
                        {"ok": True, "messages": [{"account": "a@example.com", "subject": "ok"}]},
                        {"ok": False, "messages": []},
                    ],
                    "messages": [{"account": "a@example.com", "subject": "ok"}],
                    "summary": {
                        "total": 2,
                        "ok": 1,
                        "failed": 1,
                        "messages": 1,
                    },
                },
            })()

        class DummyMailFetchService:
            def fetch_saved_workspace(self, payload, *, accounts, temp_addresses, generic_accounts, progress_callback=None):
                return fake_fetch_saved_workspace(
                    payload,
                    accounts=accounts,
                    temp_addresses=temp_addresses,
                    generic_accounts=generic_accounts,
                    progress_callback=progress_callback,
                )

        s.MAIL_FETCH_SERVICE = DummyMailFetchService()
        s.save_workspace_accounts_state = lambda workspace_id, accounts: saved.setdefault("saved_accounts", workspace_id)
        s.save_workspace_temp_addresses_state = lambda workspace_id, addresses: saved.setdefault("saved_temp", workspace_id)
        s.save_workspace_generic_accounts_state = lambda workspace_id, accounts: saved.setdefault("saved_generic", workspace_id)
        s.workspace_state = lambda: DummyWorkspaceState()
        try:
            result = s.fetch_saved_workspace_mail(
                {
                    "source": "microsoft",
                    "emails": ["a@example.com"],
                    "provider": "auto",
                    "sender_filter": "",
                    "limit": 5,
                },
                "ws_demo",
            )
        finally:
            s.load_workspace_accounts = original_load_accounts
            s.load_workspace_temp_addresses = original_load_temp
            s.load_workspace_generic_accounts = original_load_generic
            s.save_workspace_accounts_state = original_save_accounts
            s.save_workspace_temp_addresses_state = original_save_temp
            s.save_workspace_generic_accounts_state = original_save_generic
            s.workspace_state = original_workspace_state
            s.MAIL_FETCH_SERVICE = original_mail_fetch_service

        self.assertEqual(result["summary"]["ok"], 1)
        self.assertEqual(result["summary"]["total"], 2)
        self.assertEqual(result["summary"]["failed"], 1)
        self.assertEqual(result["summary"]["messages"], 1)
        self.assertEqual(saved["workspace_id"], "ws_demo")
        self.assertEqual(saved["messages"], [{"account": "a@example.com", "subject": "ok"}])
        self.assertEqual(saved["saved_accounts"], "ws_demo")
        self.assertEqual(saved["saved_temp"], "ws_demo")
        self.assertEqual(saved["saved_generic"], "ws_demo")


class HandlerWorkspaceRequestTests(unittest.TestCase):
    def test_handler_workspace_id_rejects_invalid_value(self) -> None:
        sent = {}

        class DummyHeaders:
            def get(self, key, default=""):
                if key == "X-Workspace-Id":
                    return "bad id"
                return default

        handler = s.Handler.__new__(s.Handler)
        handler.path = "/client-api/accounts"
        handler.headers = DummyHeaders()

        def fake_send_json(payload, status=HTTPStatus.OK):
            sent["payload"] = payload
            sent["status"] = status

        handler.send_json = fake_send_json

        with self.assertRaises(s.RequestHandled):
            handler.workspace_id()

        self.assertEqual(sent["status"], HTTPStatus.BAD_REQUEST)
        self.assertEqual(sent["payload"]["error_code"], "invalid_workspace_id")


if __name__ == "__main__":
    unittest.main()
