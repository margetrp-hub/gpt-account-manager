from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


_DB_LOCK = threading.RLock()


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sqlite_path_for_json(activity_path: Path) -> Path:
    return activity_path.with_suffix(".sqlite3")


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS refresh_results (
            dedupe_key TEXT PRIMARY KEY,
            email TEXT NOT NULL DEFAULT '',
            job_id TEXT NOT NULL DEFAULT '',
            refreshed_at TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_refresh_results_refreshed_at
            ON refresh_results(refreshed_at DESC);

        CREATE TABLE IF NOT EXISTS login_history (
            dedupe_key TEXT PRIMARY KEY,
            job_id TEXT NOT NULL DEFAULT '',
            finished_at TEXT NOT NULL DEFAULT '',
            started_at TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_login_history_finished_at
            ON login_history(finished_at DESC, started_at DESC);
        """
    )


def _refresh_dedupe_key(row: dict[str, Any]) -> str:
    email = str(row.get("email") or "").strip().lower()
    if email:
        return f"email:{email}"
    job_id = str(row.get("job_id") or "").strip()
    if job_id:
        return f"job:{job_id}"
    return f"fallback:{json.dumps(row, ensure_ascii=False, sort_keys=True)}"


def _login_dedupe_key(row: dict[str, Any]) -> str:
    job_id = str(row.get("job_id") or "").strip()
    if job_id:
        return f"job:{job_id}"
    email = str(row.get("email") or "").strip().lower()
    started_at = str(row.get("started_at") or "").strip()
    return f"fallback:{email}:{started_at}"


def save_refresh_results_snapshot(path: Path, rows: list[dict[str, Any]], *, limit: int) -> None:
    db_path = sqlite_path_for_json(path)
    trimmed = [row for row in rows if isinstance(row, dict)][-limit:]
    with _DB_LOCK:
        conn = _connect(db_path)
        try:
            _ensure_schema(conn)
            conn.execute("DELETE FROM refresh_results")
            for row in trimmed:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO refresh_results (
                        dedupe_key, email, job_id, refreshed_at, payload_json
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        _refresh_dedupe_key(row),
                        str(row.get("email") or ""),
                        str(row.get("job_id") or ""),
                        str(row.get("refreshed_at") or ""),
                        json.dumps(row, ensure_ascii=False),
                    ),
                )
            conn.commit()
        finally:
            conn.close()


def append_refresh_result_entry(path: Path, row: dict[str, Any], *, limit: int) -> None:
    db_path = sqlite_path_for_json(path)
    with _DB_LOCK:
        conn = _connect(db_path)
        try:
            _ensure_schema(conn)
            conn.execute(
                """
                INSERT OR REPLACE INTO refresh_results (
                    dedupe_key, email, job_id, refreshed_at, payload_json
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    _refresh_dedupe_key(row),
                    str(row.get("email") or ""),
                    str(row.get("job_id") or ""),
                    str(row.get("refreshed_at") or _iso_now()),
                    json.dumps(row, ensure_ascii=False),
                ),
            )
            conn.execute(
                """
                DELETE FROM refresh_results
                WHERE dedupe_key NOT IN (
                    SELECT dedupe_key
                    FROM refresh_results
                    ORDER BY refreshed_at DESC, rowid DESC
                    LIMIT ?
                )
                """,
                (limit,),
            )
            conn.commit()
        finally:
            conn.close()


def save_login_history_snapshot(path: Path, rows: list[dict[str, Any]], *, limit: int) -> None:
    db_path = sqlite_path_for_json(path)
    trimmed = [row for row in rows if isinstance(row, dict)][-limit:]
    with _DB_LOCK:
        conn = _connect(db_path)
        try:
            _ensure_schema(conn)
            conn.execute("DELETE FROM login_history")
            for row in trimmed:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO login_history (
                        dedupe_key, job_id, finished_at, started_at, payload_json
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        _login_dedupe_key(row),
                        str(row.get("job_id") or ""),
                        str(row.get("finished_at") or ""),
                        str(row.get("started_at") or ""),
                        json.dumps(row, ensure_ascii=False),
                    ),
                )
            conn.commit()
        finally:
            conn.close()


def append_login_history_entry(path: Path, row: dict[str, Any], *, limit: int) -> None:
    db_path = sqlite_path_for_json(path)
    with _DB_LOCK:
        conn = _connect(db_path)
        try:
            _ensure_schema(conn)
            conn.execute(
                """
                INSERT OR REPLACE INTO login_history (
                    dedupe_key, job_id, finished_at, started_at, payload_json
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    _login_dedupe_key(row),
                    str(row.get("job_id") or ""),
                    str(row.get("finished_at") or ""),
                    str(row.get("started_at") or ""),
                    json.dumps(row, ensure_ascii=False),
                ),
            )
            conn.execute(
                """
                DELETE FROM login_history
                WHERE dedupe_key NOT IN (
                    SELECT dedupe_key
                    FROM login_history
                    ORDER BY finished_at DESC, started_at DESC, rowid DESC
                    LIMIT ?
                )
                """,
                (limit,),
            )
            conn.commit()
        finally:
            conn.close()
