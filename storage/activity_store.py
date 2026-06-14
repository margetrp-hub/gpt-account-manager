from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from storage.activity_sqlite_store import (
    append_login_history_entry as sqlite_append_login_history_entry,
    append_refresh_result_entry as sqlite_append_refresh_result_entry,
    save_login_history_snapshot as sqlite_save_login_history_snapshot,
    save_refresh_results_snapshot as sqlite_save_refresh_results_snapshot,
)


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _load_rows(path: Path, list_key: str) -> list[dict[str, Any]]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, OSError):
        return []
    rows = raw.get(list_key) if isinstance(raw, dict) else raw
    return [item for item in rows if isinstance(item, dict)] if isinstance(rows, list) else []


def _save_rows(path: Path, list_key: str, rows: list[dict[str, Any]], *, limit: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updated_at": _iso_now(),
        list_key: rows[-limit:],
    }
    tmp = path.with_suffix(".json.tmp")
    try:
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)
    except OSError:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        raise


def load_refresh_results(path: Path) -> list[dict[str, Any]]:
    return _load_rows(path, "results")


def save_refresh_results(path: Path, results: list[dict[str, Any]], *, limit: int) -> None:
    _save_rows(path, "results", results, limit=limit)
    sqlite_save_refresh_results_snapshot(path, results, limit=limit)


def append_refresh_result(
    path: Path,
    auth_file: dict[str, Any],
    *,
    email: str = "",
    job_id: str = "",
    limit: int,
) -> None:
    entry = {
        "email": email or auth_file.get("email", ""),
        "name": auth_file.get("name", ""),
        "job_id": job_id,
        "refreshed_at": _iso_now(),
        "plan_type": auth_file.get("plan_type", ""),
        "auth_file": auth_file,
    }
    results = load_refresh_results(path)
    email_lower = str(entry["email"] or "").lower()
    results = [row for row in results if str(row.get("email", "") or "").lower() != email_lower]
    results.append(entry)
    save_refresh_results(path, results, limit=limit)
    sqlite_append_refresh_result_entry(path, entry, limit=limit)


def load_login_history(path: Path) -> list[dict[str, Any]]:
    return _load_rows(path, "history")


def save_login_history(path: Path, history: list[dict[str, Any]], *, limit: int) -> None:
    _save_rows(path, "history", history, limit=limit)
    sqlite_save_login_history_snapshot(path, history, limit=limit)


def append_login_history_entry(path: Path, job: dict[str, Any], *, limit: int) -> None:
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
    history = load_login_history(path)
    history = [row for row in history if row.get("job_id") != entry["job_id"]]
    history.append(entry)
    save_login_history(path, history, limit=limit)
    sqlite_append_login_history_entry(path, entry, limit=limit)
