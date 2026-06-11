import unittest
from pathlib import Path

from message_query_service import MessageQueryService


class MessageQueryServiceTests(unittest.TestCase):
    def test_parse_query_params_uses_existing_defaults(self):
        payload, limit, offset = MessageQueryService.parse_query_params({})

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

    def test_parse_query_params_returns_first_values(self):
        payload, limit, offset = MessageQueryService.parse_query_params({
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

    def test_workspace_messages_response_filters_and_pages(self):
        service = MessageQueryService(
            load_workspace_messages=lambda workspace_id: [
                {"account": "a@example.com", "subject": "hello", "source": "microsoft"},
                {"account": "b@example.com", "subject": "world", "source": "temp"},
                {"account": "a@example.com", "subject": "again", "source": "microsoft"},
            ],
            filter_messages=lambda rows, payload: [
                row for row in rows
                if (not payload.get("account") or payload.get("account") in row.get("account", ""))
            ],
            mail_type_labels={"verification": "verification"},
        )

        result = service.workspace_messages_response(
            "ws_demo",
            {"account": "a@example.com"},
            limit="1",
            offset="1",
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["count"], 2)
        self.assertEqual(result["offset"], 1)
        self.assertEqual(result["limit"], 1)
        self.assertEqual(len(result["messages"]), 1)
        self.assertEqual(result["messages"][0]["subject"], "again")

    def test_workspace_messages_response_clamps_bad_limit_offset(self):
        service = MessageQueryService(
            load_workspace_messages=lambda workspace_id: [{"account": "a@example.com"}],
            filter_messages=lambda rows, payload: rows,
            mail_type_labels={},
        )

        result = service.workspace_messages_response(
            "ws_demo",
            {},
            limit="bad",
            offset="-8",
        )

        self.assertEqual(result["limit"], 80)
        self.assertEqual(result["offset"], 0)

    def test_path_messages_response_clamps_bad_limit_offset(self):
        service = MessageQueryService(
            load_workspace_messages=lambda workspace_id: [],
            filter_messages=lambda rows, payload: rows,
            mail_type_labels={},
            load_messages_from_path=lambda path: [{"account": "a@example.com"}],
        )

        result = service.path_messages_response(
            Path("messages.json"),
            {},
            limit="bad",
            offset="-8",
        )

        self.assertEqual(result["limit"], 80)
        self.assertEqual(result["offset"], 0)

    def test_workspace_messages_returns_filtered_rows(self):
        service = MessageQueryService(
            load_workspace_messages=lambda workspace_id: [
                {"account": "a@example.com", "subject": "keep"},
                {"account": "b@example.com", "subject": "drop"},
            ],
            filter_messages=lambda rows, payload: [
                row for row in rows
                if row["account"] == payload["account"]
            ],
            mail_type_labels={},
        )

        rows = service.workspace_messages("ws_demo", {"account": "a@example.com"})

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["subject"], "keep")

    def test_path_messages_response_uses_shared_paging_rules(self):
        service = MessageQueryService(
            load_workspace_messages=lambda workspace_id: [],
            filter_messages=lambda rows, payload: [
                row for row in rows
                if (not payload.get("account") or row.get("account") == payload["account"])
            ],
            mail_type_labels={"verification": "verification"},
            load_messages_from_path=lambda path: [
                {"account": "a@example.com", "subject": "first"},
                {"account": "b@example.com", "subject": "skip"},
                {"account": "a@example.com", "subject": "last"},
            ],
        )

        result = service.path_messages_response(
            Path("messages.json"),
            {"account": "a@example.com"},
            limit="1",
            offset="1",
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["count"], 2)
        self.assertEqual(result["offset"], 1)
        self.assertEqual(result["limit"], 1)
        self.assertEqual(result["messages"][0]["subject"], "last")

    def test_workspace_and_path_responses_share_contract(self):
        rows = [
            {"account": "a@example.com", "subject": "first"},
            {"account": "b@example.com", "subject": "skip"},
            {"account": "a@example.com", "subject": "last"},
        ]
        service = MessageQueryService(
            load_workspace_messages=lambda workspace_id: rows,
            filter_messages=lambda input_rows, payload: [
                row for row in input_rows
                if (not payload.get("account") or row.get("account") == payload["account"])
            ],
            mail_type_labels={"verification": "verification"},
            load_messages_from_path=lambda path: rows,
        )

        workspace_result = service.workspace_messages_response(
            "ws_demo",
            {"account": "a@example.com"},
            limit="1",
            offset="1",
        )
        path_result = service.path_messages_response(
            Path("messages.json"),
            {"account": "a@example.com"},
            limit="1",
            offset="1",
        )

        self.assertEqual(workspace_result, path_result)

    def test_workspace_messages_response_from_params_uses_shared_parsing(self):
        service = MessageQueryService(
            load_workspace_messages=lambda workspace_id: [
                {"account": "a@example.com", "subject": "first"},
                {"account": "b@example.com", "subject": "skip"},
                {"account": "a@example.com", "subject": "last"},
            ],
            filter_messages=lambda rows, payload: [
                row for row in rows
                if (
                    (not payload.get("account") or row.get("account") == payload["account"])
                    and (not payload.get("accounts") or row.get("account") in payload["accounts"])
                )
            ],
            mail_type_labels={},
        )

        result = service.workspace_messages_response_from_params(
            "ws_demo",
            {
                "account": ["a@example.com"],
                "accounts": ["a@example.com"],
                "limit": ["1"],
                "offset": ["1"],
            },
        )

        self.assertEqual(result["count"], 2)
        self.assertEqual(result["offset"], 1)
        self.assertEqual(result["limit"], 1)
        self.assertEqual(result["messages"][0]["subject"], "last")

    def test_workspace_messages_response_from_request_payload_uses_payload_paging(self):
        service = MessageQueryService(
            load_workspace_messages=lambda workspace_id: [
                {"account": "a@example.com", "subject": "first"},
                {"account": "a@example.com", "subject": "last"},
            ],
            filter_messages=lambda rows, payload: rows,
            mail_type_labels={},
        )

        result = service.workspace_messages_response_from_request_payload(
            "ws_demo",
            {"limit": 1, "offset": 1},
        )

        self.assertEqual(result["count"], 2)
        self.assertEqual(result["offset"], 1)
        self.assertEqual(result["limit"], 1)
        self.assertEqual(result["messages"][0]["subject"], "last")


if __name__ == "__main__":
    unittest.main()
