from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs


RowsLoader = Callable[[str], list[dict[str, Any]]]
MessageFilter = Callable[[list[dict[str, Any]], dict[str, Any]], list[dict[str, Any]]]
PathRowsLoader = Callable[[Path], list[dict[str, Any]]]


@dataclass(frozen=True)
class MessageQueryService:
    load_workspace_messages: RowsLoader
    filter_messages: MessageFilter
    mail_type_labels: dict[str, str]
    load_messages_from_path: PathRowsLoader | None = None

    def workspace_messages_response(
        self,
        workspace_id: str,
        payload: dict[str, Any],
        *,
        limit: int = 80,
        offset: int = 0,
    ) -> dict[str, Any]:
        all_messages = self.load_workspace_messages(workspace_id)
        messages = self.filter_messages(all_messages, payload)
        return self._paged_response(messages, limit=limit, offset=offset, activity_messages=all_messages)

    def workspace_messages_response_from_params(
        self,
        workspace_id: str,
        params: dict[str, list[str]],
    ) -> dict[str, Any]:
        payload, limit, offset = self.parse_query_params(params)
        return self.workspace_messages_response(
            workspace_id,
            payload,
            limit=limit,
            offset=offset,
        )

    def workspace_messages_response_from_request_payload(
        self,
        workspace_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return self.workspace_messages_response(
            workspace_id,
            payload,
            limit=payload.get("limit", 80),
            offset=payload.get("offset", 0),
        )

    def workspace_messages_response_from_query_string(
        self,
        workspace_id: str,
        query: str,
    ) -> dict[str, Any]:
        return self.workspace_messages_response_from_params(
            workspace_id,
            parse_qs(query),
        )

    def workspace_messages(
        self,
        workspace_id: str,
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        return self.filter_messages(self.load_workspace_messages(workspace_id), payload)

    def path_messages_response(
        self,
        path: Path,
        payload: dict[str, Any],
        *,
        limit: int = 80,
        offset: int = 0,
    ) -> dict[str, Any]:
        if self.load_messages_from_path is None:
            raise RuntimeError("load_messages_from_path is not configured")
        all_messages = self.load_messages_from_path(path)
        messages = self.filter_messages(all_messages, payload)
        return self._paged_response(messages, limit=limit, offset=offset, activity_messages=all_messages)

    @staticmethod
    def parse_query_params(params: dict[str, list[str]]) -> tuple[dict[str, Any], str, str]:
        accounts = [item for item in params.get("accounts", []) if str(item or "").strip()]
        payload = {
            "query": params.get("query", [""])[0],
            "sender": params.get("sender", [""])[0],
            "source": params.get("source", ["all"])[0],
            "mail_type": params.get("mail_type", ["all"])[0],
            "service": params.get("service", ["all"])[0],
            "category": params.get("category", ["all"])[0],
            "account": params.get("account", [""])[0],
            "accounts": accounts,
        }
        return payload, params.get("limit", ["80"])[0], params.get("offset", ["0"])[0]

    def _paged_response(
        self,
        messages: list[dict[str, Any]],
        *,
        limit: int = 80,
        offset: int = 0,
        activity_messages: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        limit = self._coerce_limit(limit)
        offset = self._coerce_offset(offset)
        return {
            "success": True,
            "messages": messages[offset:offset + limit],
            "count": len(messages),
            "offset": offset,
            "limit": limit,
            "types": self.mail_type_labels,
            "account_activity": self._account_activity(activity_messages if activity_messages is not None else messages),
        }

    @staticmethod
    def _account_activity(messages: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        activity: dict[str, dict[str, Any]] = {}
        latest_keys: dict[str, tuple[int, float | str]] = {}
        for message in messages:
            account = str(message.get("account") or "").strip().lower()
            if not account:
                continue
            row = activity.setdefault(account, {"count": 0, "last_received_at": ""})
            row["count"] += 1
            received_at = str(message.get("received_at") or message.get("cached_at") or "").strip()
            received_key = MessageQueryService._received_at_key(received_at)
            if received_at and (account not in latest_keys or received_key > latest_keys[account]):
                latest_keys[account] = received_key
                row["last_received_at"] = received_at
        return activity

    @staticmethod
    def _received_at_key(value: str) -> tuple[int, float | str]:
        text = str(value or "").strip()
        if not text:
            return (0, "")
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            try:
                parsed = parsedate_to_datetime(text)
            except (TypeError, ValueError, OverflowError):
                return (0, text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return (1, parsed.timestamp())

    @staticmethod
    def _coerce_limit(value: Any) -> int:
        try:
            return max(1, min(int(value or 80), 500))
        except (TypeError, ValueError):
            return 80

    @staticmethod
    def _coerce_offset(value: Any) -> int:
        try:
            return max(0, int(value or 0))
        except (TypeError, ValueError):
            return 0
