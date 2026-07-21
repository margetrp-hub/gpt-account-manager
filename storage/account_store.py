from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, TypeVar

from storage.file_lock import atomic_write_json


AccountT = TypeVar("AccountT")


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _read_rows(path: Path, list_key: str) -> list[dict[str, Any]]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, OSError):
        return []
    rows = raw.get(list_key, []) if isinstance(raw, dict) else raw
    return [item for item in rows if isinstance(item, dict)] if isinstance(rows, list) else []


def _write_rows(path: Path, list_key: str, rows: list[dict[str, Any]]) -> None:
    payload = {
        "updated_at": _iso_now(),
        list_key: rows,
    }
    atomic_write_json(path, payload)


def _load_dataclass_map(
    path: Path,
    *,
    list_key: str,
    item_cls: type[AccountT],
    row_mutator: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
) -> dict[str, AccountT]:
    records: dict[str, AccountT] = {}
    allowed = set(item_cls.__dataclass_fields__.keys())
    for item in _read_rows(path, list_key):
        try:
            row = dict(item)
            if row_mutator:
                row = row_mutator(row)
            clean = {key: row.get(key) for key in allowed if key in row}
            record = item_cls(**clean)
            email = str(getattr(record, "email", "") or "").lower()
            if email:
                records[email] = record
        except TypeError:
            continue
    return records


def _save_dataclass_map(path: Path, *, list_key: str, records: dict[str, AccountT]) -> None:
    rows = [
        asdict(record)
        for record in sorted(records.values(), key=lambda item: str(getattr(item, "email", "") or "").lower())
    ]
    _write_rows(path, list_key, rows)


def load_accounts(path: Path, *, account_cls: type[AccountT]) -> dict[str, AccountT]:
    return _load_dataclass_map(path, list_key="accounts", item_cls=account_cls)


def save_accounts(path: Path, accounts: dict[str, AccountT]) -> None:
    _save_dataclass_map(path, list_key="accounts", records=accounts)


def load_temp_addresses(
    path: Path,
    *,
    address_cls: type[AccountT],
    default_base_url: str,
    normalize_temp_worker_url: Callable[[str], str],
) -> dict[str, AccountT]:
    def mutate(row: dict[str, Any]) -> dict[str, Any]:
        row["base_url"] = normalize_temp_worker_url(
            row.get("base_url") or row.get("baseUrl") or default_base_url
        )
        return row

    return _load_dataclass_map(path, list_key="addresses", item_cls=address_cls, row_mutator=mutate)


def save_temp_addresses(path: Path, addresses: dict[str, AccountT]) -> None:
    _save_dataclass_map(path, list_key="addresses", records=addresses)


def load_generic_accounts(
    path: Path,
    *,
    account_cls: type[AccountT],
    normalize_generic_mail_mode: Callable[[Any], str],
    coerce_port: Callable[[Any, int], int],
    normalize_generic_account: Callable[[AccountT], AccountT],
) -> dict[str, AccountT]:
    def mutate(row: dict[str, Any]) -> dict[str, Any]:
        row["mode"] = normalize_generic_mail_mode(row.get("mode") or row.get("provider"))
        row["imap_port"] = coerce_port(row.get("imap_port") or row.get("imapPort"), 993)
        row["pop3_port"] = coerce_port(row.get("pop3_port") or row.get("pop3Port"), 995)
        return row

    records = _load_dataclass_map(path, list_key="accounts", item_cls=account_cls, row_mutator=mutate)
    return {
        email: normalize_generic_account(account)
        for email, account in records.items()
    }


def save_generic_accounts(path: Path, accounts: dict[str, AccountT]) -> None:
    _save_dataclass_map(path, list_key="accounts", records=accounts)
