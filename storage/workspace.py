from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from storage.file_lock import atomic_write_json


WORKSPACE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{5,63}$")


def file_item_count(path: Path, key: str) -> int:
    if not path.exists():
        return 0
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return -1
    value = payload.get(key) if isinstance(payload, dict) else None
    return len(value) if isinstance(value, list) else 0


def load_json_file(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return fallback


def write_json_file(path: Path, payload: Any) -> None:
    atomic_write_json(path, payload)


def parse_workspace_id(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if not WORKSPACE_ID_PATTERN.fullmatch(text):
        raise ValueError("invalid workspace_id")
    return text


def normalize_workspace_id(value: Any) -> str:
    try:
        text = parse_workspace_id(value)
    except ValueError:
        text = None
    if not text:
        return "public"
    return text


def workspace_dir(workspaces_root: Path, workspace_id: Any) -> Path:
    return workspaces_root / normalize_workspace_id(workspace_id)


def workspace_file(workspaces_root: Path, workspace_id: Any, filename: str) -> Path:
    return workspace_dir(workspaces_root, workspace_id) / filename


def workspace_counts(workspaces_root: Path, workspace_id: Any) -> dict[str, int]:
    return {
        "microsoft_accounts": file_item_count(workspace_file(workspaces_root, workspace_id, "accounts.json"), "accounts"),
        "temp_addresses": file_item_count(workspace_file(workspaces_root, workspace_id, "temp_addresses.json"), "addresses"),
        "generic_accounts": file_item_count(workspace_file(workspaces_root, workspace_id, "generic_accounts.json"), "accounts"),
        "messages": file_item_count(workspace_file(workspaces_root, workspace_id, "messages.json"), "messages"),
    }
