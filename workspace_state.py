from __future__ import annotations

import threading
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from storage.file_lock import atomic_write_json
from workspace_views import WorkspaceViews, json_row_fallback_key


MapSaver = Callable[[dict[str, Any], Path], None]
TextCoercer = Callable[[Any], str]
RowKeyBuilder = Callable[[dict[str, Any]], str]
RowsSaver = Callable[[list[dict[str, Any]], Path], None]
ActivityAppender = Callable[[Path, dict[str, Any]], None]
RefreshAppender = Callable[[Path, dict[str, Any], str, str], None]
MessageFilter = Callable[[list[dict[str, Any]], dict[str, Any]], list[dict[str, Any]]]
ActivityRowsSaver = Callable[[Path, list[dict[str, Any]]], None]
IsoNowFn = Callable[[], str]


@dataclass(frozen=True)
class WorkspaceState:
    workspaces_dir: Path
    views: WorkspaceViews
    save_accounts_map: MapSaver
    save_temp_addresses_map: MapSaver
    save_generic_accounts_map: MapSaver
    save_messages_rows: RowsSaver
    append_refresh_result_row: RefreshAppender
    append_login_history_row: ActivityAppender
    save_refresh_results_rows: ActivityRowsSaver
    save_login_history_rows: ActivityRowsSaver
    message_key: RowKeyBuilder
    coerce_text: TextCoercer
    iso_now: IsoNowFn
    row_fallback_key: RowKeyBuilder = json_row_fallback_key

    def _activity_lock(self) -> threading.RLock:
        state = self.__dict__.get("_activity_write_lock")
        if state is None:
            state = threading.RLock()
            object.__setattr__(self, "_activity_write_lock", state)
        return state

    def _message_lock(self) -> threading.RLock:
        state = self.__dict__.get("_message_write_lock")
        if state is None:
            state = threading.RLock()
            object.__setattr__(self, "_message_write_lock", state)
        return state

    def _safe_activity_rows(
        self,
        path: Path,
        *,
        list_key: str,
    ) -> list[dict[str, Any]]:
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            return []
        try:
            raw = json.loads(path.read_text(encoding="utf-8-sig"))
        except (json.JSONDecodeError, OSError) as exc:
            raise RuntimeError(f"activity file is unreadable: {path}") from exc
        rows = raw.get(list_key) if isinstance(raw, dict) else raw
        return [item for item in rows if isinstance(item, dict)] if isinstance(rows, list) else []

    def _load_public_refresh_results_for_write(self) -> list[dict[str, Any]]:
        merged: dict[str, dict[str, Any]] = {}
        for path in self.refresh_results_write_paths("public"):
            for row in self._safe_activity_rows(path, list_key="results"):
                key = (
                    self.coerce_text(row.get("email")).lower()
                    or self.coerce_text(row.get("job_id"))
                    or self.row_fallback_key(row)
                )
                merged[key] = row
        return list(merged.values())

    def _load_public_login_history_for_write(self) -> list[dict[str, Any]]:
        merged: dict[str, dict[str, Any]] = {}
        for path in self.login_history_write_paths("public"):
            for row in self._safe_activity_rows(path, list_key="history"):
                key = self.coerce_text(row.get("job_id")) or self.row_fallback_key(row)
                merged[key] = row
        return list(merged.values())

    def normalize_workspace_id(self, workspace_id: Any) -> str:
        return self.views.normalize_workspace_id(workspace_id)

    def accounts_path(self, workspace_id: str) -> Path:
        return self.views.workspace_file(workspace_id, "accounts.json")

    def temp_addresses_path(self, workspace_id: str) -> Path:
        return self.views.workspace_file(workspace_id, "temp_addresses.json")

    def generic_accounts_path(self, workspace_id: str) -> Path:
        return self.views.workspace_file(workspace_id, "generic_accounts.json")

    def messages_path(self, workspace_id: str) -> Path:
        return self.views.workspace_file(workspace_id, "messages.json")

    def ignored_messages_path(self, workspace_id: str) -> Path:
        return self.views.workspace_file(workspace_id, "ignored_messages.json")

    def load_ignored_message_keys(self, workspace_id: str) -> list[str]:
        path = self.ignored_messages_path(workspace_id)
        if not path.exists():
            return []
        try:
            raw = json.loads(path.read_text(encoding="utf-8-sig"))
        except (json.JSONDecodeError, OSError):
            return []
        rows = raw.get("keys", []) if isinstance(raw, dict) else raw
        return [str(item) for item in rows if str(item or "").strip()] if isinstance(rows, list) else []

    def save_ignored_message_keys(self, workspace_id: str, keys: list[str]) -> None:
        unique = list(dict.fromkeys(str(item) for item in keys if str(item or "").strip()))[-5000:]
        atomic_write_json(self.ignored_messages_path(workspace_id), {
            "updated_at": self.iso_now(),
            "keys": unique,
        })

    def refresh_results_path(self, workspace_id: str) -> Path:
        return self.views.workspace_file(workspace_id, "refresh_results.json")

    def login_history_path(self, workspace_id: str) -> Path:
        return self.views.workspace_file(workspace_id, "login_history.json")

    def message_write_paths(self, workspace_id: str) -> list[Path]:
        workspace = self.normalize_workspace_id(workspace_id)
        paths = [self.messages_path(workspace)]
        if workspace == "public":
            paths.insert(0, self.views.public_messages_file)
        return paths

    def refresh_results_write_paths(self, workspace_id: str) -> list[Path]:
        workspace = self.normalize_workspace_id(workspace_id)
        paths = [self.refresh_results_path(workspace)]
        if workspace == "public":
            paths.insert(0, self.views.public_refresh_results_file)
        return paths

    def login_history_write_paths(self, workspace_id: str) -> list[Path]:
        workspace = self.normalize_workspace_id(workspace_id)
        paths = [self.login_history_path(workspace)]
        if workspace == "public":
            paths.insert(0, self.views.public_login_history_file)
        return paths

    def load_accounts(self, workspace_id: str) -> dict[str, Any]:
        return self.views.accounts(workspace_id)

    def load_temp_addresses(self, workspace_id: str) -> dict[str, Any]:
        return self.views.temp_addresses(workspace_id)

    def load_generic_accounts(self, workspace_id: str) -> dict[str, Any]:
        return self.views.generic_accounts(workspace_id)

    def load_messages(self, workspace_id: str) -> list[dict[str, Any]]:
        return self.views.messages(workspace_id)

    def save_messages_state(self, workspace_id: str, messages: list[dict[str, Any]]) -> None:
        with self._message_lock():
            for path in self.message_write_paths(workspace_id):
                self.save_messages_rows(messages, path)

    def upsert_messages_state(self, workspace_id: str, incoming: list[dict[str, Any]]) -> int:
        if not incoming:
            return 0
        with self._message_lock():
            ignored = set(self.load_ignored_message_keys(workspace_id))
            cache = {
                self.message_key(message): message
                for message in self.load_messages(workspace_id)
                if self.message_key(message) not in ignored
            }
            now = self.iso_now()
            for message in incoming:
                message.setdefault("cached_at", now)
                key = self.message_key(message)
                if key not in ignored:
                    cache[key] = message
            merged = list(cache.values())
            self.save_messages_state(workspace_id, merged)
            return len(merged)

    def delete_messages_state(
        self,
        workspace_id: str,
        payload: dict[str, Any],
        *,
        filter_messages: MessageFilter,
    ) -> dict[str, Any]:
        with self._message_lock():
            messages = self.load_messages(workspace_id)
            raw_messages = payload.get("messages")
            if isinstance(raw_messages, list) and raw_messages:
                targets = [item for item in raw_messages if isinstance(item, dict)]
            else:
                filter_payload = payload.get("filter")
                if isinstance(filter_payload, dict):
                    targets = filter_messages(messages, filter_payload)
                else:
                    message = payload.get("message")
                    if not isinstance(message, dict):
                        raise RuntimeError("缺少要删除的邮件")
                    targets = [message]
            target_keys = {self.message_key(item) for item in targets if isinstance(item, dict)}
            if not target_keys:
                return {
                    "success": True,
                    "deleted": 0,
                    "cache_removed": 0,
                    "deleted_keys": [],
                    "message": "没有匹配到需要清理的缓存邮件",
                }
            kept = [item for item in messages if self.message_key(item) not in target_keys]
            deleted = len(messages) - len(kept)
            ignored = self.load_ignored_message_keys(workspace_id)
            self.save_ignored_message_keys(workspace_id, [*ignored, *sorted(target_keys)])
            if deleted:
                self.save_messages_state(workspace_id, kept)
            return {
                "success": True,
                "deleted": deleted,
                "cache_removed": deleted,
                "deleted_keys": sorted(target_keys),
                "message": "已从工具缓存批量清理，后续收信不会重新写入这些邮件",
            }

    def load_refresh_results(self, workspace_id: str) -> list[dict[str, Any]]:
        return self.views.refresh_results(
            workspace_id,
            row_key=lambda row: (
                self.coerce_text(row.get("email")).lower()
                or self.coerce_text(row.get("job_id"))
                or self.row_fallback_key(row)
            ),
        )

    def load_login_history(self, workspace_id: str) -> list[dict[str, Any]]:
        return self.views.login_history(
            workspace_id,
            row_key=lambda row: self.coerce_text(row.get("job_id")) or self.row_fallback_key(row),
        )

    def append_refresh_result(self, workspace_id: str, auth_file: dict[str, Any], *, email: str = "", job_id: str = "") -> None:
        workspace = self.normalize_workspace_id(workspace_id)
        with self._activity_lock():
            if workspace != "public":
                self.append_refresh_result_row(self.refresh_results_path(workspace), auth_file, email, job_id)
                return
            merged = self._load_public_refresh_results_for_write()
            entry = {
                "email": email or auth_file.get("email", ""),
                "name": auth_file.get("name", ""),
                "job_id": job_id,
                "refreshed_at": self.iso_now(),
                "plan_type": auth_file.get("plan_type", ""),
                "auth_file": auth_file,
            }
            email_lower = self.coerce_text(entry.get("email")).lower()
            merged = [row for row in merged if self.coerce_text(row.get("email")).lower() != email_lower]
            merged.append(entry)
            for path in self.refresh_results_write_paths(workspace):
                self.save_refresh_results_rows(path, merged)

    def append_login_history_entry(self, workspace_id: str, job: dict[str, Any]) -> None:
        workspace = self.normalize_workspace_id(workspace_id)
        with self._activity_lock():
            if workspace != "public":
                self.append_login_history_row(self.login_history_path(workspace), job)
                return
            merged = self._load_public_login_history_for_write()
            entry = {
                "job_id": job.get("job_id"),
                "email": job.get("email"),
                "name": job.get("name"),
                "started_at": job.get("started_at"),
                "finished_at": job.get("finished_at"),
                "state": job.get("state"),
                "status": job.get("status"),
                "error": job.get("error"),
                "workspace_id": job.get("workspace_id"),
                "login_only": job.get("login_only"),
                "site_url": job.get("site_url"),
            }
            merged = [row for row in merged if row.get("job_id") != entry.get("job_id")]
            merged.append(entry)
            for path in self.login_history_write_paths(workspace):
                self.save_login_history_rows(path, merged)

    def save_accounts_state(self, workspace_id: str, accounts: dict[str, Any]) -> None:
        workspace = self.normalize_workspace_id(workspace_id)
        self.save_accounts_map(accounts, self.accounts_path(workspace))
        if workspace == "public":
            self.save_accounts_map(accounts, self.views.public_accounts_file)

    def save_temp_addresses_state(self, workspace_id: str, addresses: dict[str, Any]) -> None:
        workspace = self.normalize_workspace_id(workspace_id)
        self.save_temp_addresses_map(addresses, self.temp_addresses_path(workspace))
        if workspace == "public":
            self.save_temp_addresses_map(addresses, self.views.public_temp_addresses_file)

    def save_generic_accounts_state(self, workspace_id: str, accounts: dict[str, Any]) -> None:
        workspace = self.normalize_workspace_id(workspace_id)
        self.save_generic_accounts_map(accounts, self.generic_accounts_path(workspace))
        if workspace == "public":
            self.save_generic_accounts_map(accounts, self.views.public_generic_accounts_file)

    def startup_login_history_entries(self) -> list[dict[str, Any]]:
        history_paths = [self.views.public_login_history_file]
        if self.workspaces_dir.exists():
            history_paths.extend(sorted(self.workspaces_dir.glob("*/login_history.json")))
        history_by_job: dict[str, dict[str, Any]] = {}
        for path in history_paths:
            for entry in self.views.load_login_history_rows(path):
                job_id = self.coerce_text(entry.get("job_id"))
                if not job_id:
                    continue
                workspace_id = self.normalize_workspace_id(entry.get("workspace_id"))
                if workspace_id == "public" and path.parent.parent == self.workspaces_dir:
                    workspace_id = self.normalize_workspace_id(path.parent.name)
                history_by_job[job_id] = {**entry, "workspace_id": workspace_id}
        return list(history_by_job.values())
