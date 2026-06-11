from __future__ import annotations

from dataclasses import dataclass
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
        messages = self.filter_messages(self.load_workspace_messages(workspace_id), payload)
        return self._paged_response(messages, limit=limit, offset=offset)

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
        messages = self.filter_messages(self.load_messages_from_path(path), payload)
        return self._paged_response(messages, limit=limit, offset=offset)

    @staticmethod
    def parse_query_params(params: dict[str, list[str]]) -> tuple[dict[str, Any], str, str]:
        accounts = [item for item in params.get("accounts", []) if str(item or "").strip()]
        payload = {
            "query": params.get("query", [""])[0],
            "sender": params.get("sender", [""])[0],
            "source": params.get("source", ["all"])[0],
            "mail_type": params.get("mail_type", ["all"])[0],
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
        }

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
