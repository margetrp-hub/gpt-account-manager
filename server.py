from __future__ import annotations

import base64
import hashlib
import http.cookiejar
import email as email_lib
import html
import io
import imaplib
import ipaddress
import json
import os
import re
import secrets
import shutil
import socket
import ssl
import subprocess
import threading
import time
import contextlib
import http.client
import http.cookies
import hmac
import inspect
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from email.header import decode_header
from email.utils import parsedate_to_datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


def normalize_base_url(value: str) -> str:
    clean = str(value or "").strip()
    if clean and not re.match(r"^https?://", clean, flags=re.I):
        clean = f"https://{clean}"
    return clean.rstrip("/")


def normalize_cpa_base_url(value: str) -> str:
    clean = normalize_base_url(value)
    if not clean:
        return ""
    parsed = urllib.parse.urlparse(clean)
    if not parsed.scheme or not parsed.netloc:
        return clean
    path = parsed.path or ""
    if path in {"", "/"}:
        return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "", "", "", ""))
    if "management.html" in path or path.startswith("/management"):
        return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "", "", "", ""))
    return clean


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
DATA_DIR = ROOT / "data"
WORKSPACES_DIR = DATA_DIR / "workspaces"
ACCOUNTS_FILE = DATA_DIR / "accounts.json"
MESSAGES_FILE = DATA_DIR / "messages.json"
TEMP_ADDRESSES_FILE = DATA_DIR / "temp_addresses.json"
REFRESH_RESULTS_FILE = DATA_DIR / "refresh_results.json"
LOGIN_HISTORY_FILE = DATA_DIR / "login_history.json"
LOGIN_DEBUG_DIR = DATA_DIR / "login_debug"
UPGRADE_REQUEST_FILE = DATA_DIR / "upgrade_request.json"
UPGRADE_RESULT_FILE = DATA_DIR / "upgrade_result.json"
APP_VERSION = "20260601-fetch-background"

DEFAULT_HOST = os.environ.get("MAIL_PICKUP_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.environ.get("MAIL_PICKUP_PORT", "8765"))
ADMIN_TOKEN = os.environ.get("MAIL_PICKUP_ADMIN_TOKEN", "").strip()
ADMIN_COOKIE_NAME = "ctgptm_admin_token"
PUBLIC_STORE_URL = (os.environ.get("GPT_ACCOUNT_MANAGER_STORE_URL") or os.environ.get("CTGPTM_STORE_URL", "")).strip()
PUBLIC_RELAY_URL = (os.environ.get("GPT_ACCOUNT_MANAGER_RELAY_URL") or os.environ.get("CTGPTM_RELAY_URL", "")).strip()
PUBLIC_POOL_URL = (os.environ.get("GPT_ACCOUNT_MANAGER_PUBLIC_POOL_URL") or os.environ.get("CTGPTM_PUBLIC_POOL_URL", "")).strip()
PUBLIC_POOL_API_URL = (os.environ.get("GPT_ACCOUNT_MANAGER_PUBLIC_POOL_API_URL") or os.environ.get("CTGPTM_PUBLIC_POOL_API_URL", "")).strip()
PUBLIC_POOL_TOKEN = (os.environ.get("GPT_ACCOUNT_MANAGER_PUBLIC_POOL_TOKEN") or os.environ.get("CTGPTM_PUBLIC_POOL_TOKEN", "")).strip()
PUBLIC_APP_TITLE = (os.environ.get("GPT_ACCOUNT_MANAGER_APP_TITLE") or os.environ.get("CTGPTM_APP_TITLE", "GPT账号管理助手")).strip()
DEFAULT_TEMP_WORKER_URL = ""
TEMP_WORKER_DNS_FALLBACK_IPS = [
    item.strip()
    for item in os.environ.get("GPT_ACCOUNT_MANAGER_TEMP_WORKER_FALLBACK_IPS", "").split(",")
    if item.strip()
]
TEMP_WORKER_DNS_FALLBACK_HOST = urllib.parse.urlparse(DEFAULT_TEMP_WORKER_URL).hostname or ""
OPENAI_STATIC_FALLBACK_IPS = {
    "chatgpt.com": ["104.18.32.47", "172.64.155.209"],
    "auth.openai.com": ["104.18.41.241", "172.64.146.15"],
    "auth0.openai.com": ["172.65.90.20", "172.65.90.21", "172.65.90.22", "172.65.90.23"],
}
MICROSOFT_DNS_FALLBACK_HOSTS = {
    "login.microsoftonline.com",
    "graph.microsoft.com",
    "outlook.office.com",
    "outlook.live.com",
    "outlook.office365.com",
    "login.live.com",
}
MICROSOFT_STATIC_FALLBACK_IPS = {
    "login.microsoftonline.com": ["20.190.151.131", "20.190.151.132", "20.190.151.133", "20.190.151.134"],
    "graph.microsoft.com": ["20.190.132.105", "20.190.132.106", "20.190.132.40", "20.190.132.42"],
    "login.live.com": ["20.190.151.131", "20.190.151.132", "20.190.151.67", "20.190.151.68"],
}
STATIC_DNS_FALLBACK_IPS = {
    **({TEMP_WORKER_DNS_FALLBACK_HOST: TEMP_WORKER_DNS_FALLBACK_IPS} if TEMP_WORKER_DNS_FALLBACK_HOST and TEMP_WORKER_DNS_FALLBACK_IPS else {}),
    **OPENAI_STATIC_FALLBACK_IPS,
    **MICROSOFT_STATIC_FALLBACK_IPS,
}
DNS_FALLBACK_HOSTS = set(STATIC_DNS_FALLBACK_IPS) | MICROSOFT_DNS_FALLBACK_HOSTS
DNS_FALLBACK_CACHE: dict[str, list[str]] = {}
DNS_OVERRIDE_LOCK = threading.RLock()
LEGACY_TEMP_WORKER_URLS: set[str] = set()


def normalize_temp_worker_url(value: str) -> str:
    clean = normalize_base_url(value or DEFAULT_TEMP_WORKER_URL)
    return DEFAULT_TEMP_WORKER_URL if clean in LEGACY_TEMP_WORKER_URLS else clean


TEMP_WORKER_URL = normalize_temp_worker_url(os.environ.get("GPT_ACCOUNT_MANAGER_TEMP_WORKER_URL") or os.environ.get("CTGPTM_TEMP_WORKER_URL", DEFAULT_TEMP_WORKER_URL))
TEMP_SITE_PASSWORD = (os.environ.get("GPT_ACCOUNT_MANAGER_TEMP_SITE_PASSWORD") or os.environ.get("CTGPTM_TEMP_SITE_PASSWORD", "")).strip()
ALLOW_PRIVATE_URLS = os.environ.get("MAIL_PICKUP_ALLOW_PRIVATE_URLS", "").lower() in {"1", "true", "yes"}
CPA_ALLOW_REMOTE = os.environ.get("MAIL_PICKUP_CPA_ALLOW_REMOTE", "").lower() in {"1", "true", "yes"}
LOGIN_STRATEGY = "protocol"
LOGIN_FALLBACK_PLAYWRIGHT = False
LOGIN_NODE_BIN = os.environ.get("MAIL_PICKUP_NODE_BIN", "node").strip() or "node"
OPENAI_SENTINEL_HELPER = ROOT / "openai_sentinel_token.cjs"
OPENAI_OAUTH_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize"
OPENAI_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token"
OPENAI_CODEX_CLIENT_ID = os.environ.get("OPENAI_CODEX_CLIENT_ID", "app_EMoamEEZ73f0CkXaXp7hrann").strip()
OPENAI_OAUTH_SCOPE = os.environ.get("OPENAI_OAUTH_SCOPE", "openid profile email offline_access").strip()
OPENAI_OAUTH_REFRESH_SCOPE = os.environ.get("OPENAI_OAUTH_REFRESH_SCOPE", "openid profile email").strip()
OPENAI_OAUTH_REDIRECT_URI = os.environ.get(
    "OPENAI_OAUTH_REDIRECT_URI",
    "http://localhost:1455/auth/callback",
).strip() or "http://localhost:1455/auth/callback"
CHATGPT_CHECK_URL = "https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27?timezone_offset_min=-480"
CHATGPT_SESSION_URL = "https://chatgpt.com/api/auth/session"
CHATGPT_LOGIN_URL = os.environ.get("MAIL_PICKUP_CHATGPT_LOGIN_URL", "https://chatgpt.com/auth/login").strip() or "https://chatgpt.com/auth/login"

GRAPH_FOLDERS = ["inbox", "junkemail"]
IMAP_FOLDERS = ["INBOX", "Junk", "Junk Email"]
CODE_PATTERNS = [
    r"(?<!\d)(\d{6})(?!\d)",
    r"(?<![A-Za-z0-9])([A-Z0-9]{6,8})(?![A-Za-z0-9])",
]
MAIL_TYPE_LABELS = {
    "verification": "verification",
    "invite": "invite",
    "security": "security",
    "reset": "reset",
    "billing": "billing",
    "newsletter": "newsletter",
    "banned": "banned",
    "other": "other",
}
DEFAULT_HTTP_HEADERS = {
    "Accept": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/145.0.0.0 Safari/537.36"
    ),
}
OPENAI_SEC_CH_UA = '"Google Chrome";v="145", "Not?A_Brand";v="8", "Chromium";v="145"'
OPENAI_SEC_CH_UA_FULL_VERSION_LIST = '"Chromium";v="145.0.0.0", "Not:A-Brand";v="99.0.0.0", "Google Chrome";v="145.0.0.0"'
CPA_PROBE_USER_AGENT = "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal"
LOGIN_JOBS: dict[str, dict[str, Any]] = {}
LOGIN_JOBS_LOCK = threading.Lock()
LOGIN_LOG_LIMIT = 400
MAIL_FETCH_JOBS: dict[str, dict[str, Any]] = {}
MAIL_FETCH_JOBS_LOCK = threading.Lock()
MAIL_FETCH_JOB_LIMIT = 120
LOCAL_OAUTH_FLOWS: dict[str, dict[str, Any]] = {}
LOCAL_OAUTH_LOCK = threading.Lock()
LOCAL_OAUTH_SERVER: ThreadingHTTPServer | None = None
LOCAL_OAUTH_THREAD: threading.Thread | None = None
LOCAL_OAUTH_PORT = int(os.environ.get("MAIL_PICKUP_LOCAL_OAUTH_PORT", "1455") or 1455)
PLAYWRIGHT_MAX_CONCURRENCY = max(1, min(int(os.environ.get("MAIL_PICKUP_PLAYWRIGHT_MAX_CONCURRENCY", "2") or 2), 2))
PLAYWRIGHT_SEMAPHORE = threading.BoundedSemaphore(PLAYWRIGHT_MAX_CONCURRENCY)
MAIL_FETCH_MAX_CONCURRENCY = max(1, min(int(os.environ.get("MAIL_PICKUP_FETCH_CONCURRENCY", "8") or 8), 16))


@dataclass
class MailAccount:
    email: str
    client_id: str
    refresh_token: str
    password: str = ""
    label: str = ""
    created_at: str = field(default_factory=lambda: iso_now())
    updated_at: str = field(default_factory=lambda: iso_now())
    last_check_at: str = ""
    last_status: str = "idle"
    last_error: str = ""
    last_error_code: str = ""
    last_error_label: str = ""
    last_error_hint: str = ""
    last_message_count: int = 0

    def public(self) -> dict[str, Any]:
        data = asdict(self)
        data["password"] = mask_secret(self.password)
        data["refresh_token"] = mask_secret(self.refresh_token)
        data["client_id"] = mask_secret(self.client_id, keep=8)
        return data


@dataclass
class TempAddress:
    email: str
    jwt: str = ""
    base_url: str = ""
    site_password: str = ""
    label: str = ""
    created_at: str = field(default_factory=lambda: iso_now())
    updated_at: str = field(default_factory=lambda: iso_now())
    last_check_at: str = ""
    last_status: str = "idle"
    last_error: str = ""
    last_error_code: str = ""
    last_error_label: str = ""
    last_error_hint: str = ""
    last_message_count: int = 0

    def public(self) -> dict[str, Any]:
        data = asdict(self)
        data["jwt"] = mask_secret(self.jwt)
        data["site_password"] = mask_secret(self.site_password)
        return data


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


STARTED_AT = iso_now()


def mask_secret(value: str, keep: int = 4) -> str:
    if not value:
        return ""
    if len(value) <= keep * 2:
        return "*" * len(value)
    return f"{value[:keep]}...{value[-keep:]}"


def is_masked_secret(value: Any) -> bool:
    text = coerce_text(value)
    return bool(text and (set(text) <= {"*"} or "..." in text))


def usable_secret(value: Any) -> bool:
    text = coerce_text(value)
    return bool(text and not is_masked_secret(text))


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
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


WORKSPACE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{5,63}$")


def normalize_workspace_id(value: Any) -> str:
    text = coerce_text(value)
    if not text or not WORKSPACE_ID_PATTERN.fullmatch(text):
        return "public"
    return text


def workspace_dir(workspace_id: str) -> Path:
    workspace = normalize_workspace_id(workspace_id)
    return WORKSPACES_DIR / workspace


def workspace_file(workspace_id: str, filename: str) -> Path:
    return workspace_dir(workspace_id) / filename


def workspace_counts(workspace_id: str) -> dict[str, int]:
    return {
        "microsoft_accounts": file_item_count(workspace_file(workspace_id, "accounts.json"), "accounts"),
        "temp_addresses": file_item_count(workspace_file(workspace_id, "temp_addresses.json"), "addresses"),
        "messages": file_item_count(workspace_file(workspace_id, "messages.json"), "messages"),
    }


def health_payload() -> dict[str, Any]:
    return {
        "ok": True,
        "app": "gpt-account-manager",
        "version": APP_VERSION,
        "started_at": STARTED_AT,
        "now": iso_now(),
        "host": DEFAULT_HOST,
        "port": DEFAULT_PORT,
        "admin_token_set": bool(ADMIN_TOKEN),
        "urls": {
            "store": PUBLIC_STORE_URL,
            "relay": PUBLIC_RELAY_URL,
            "public_pool": PUBLIC_POOL_URL,
            "temp_worker": TEMP_WORKER_URL,
        },
        "features": {
            "public_pool_api": bool(PUBLIC_POOL_API_URL),
            "private_urls_allowed": ALLOW_PRIVATE_URLS,
            "cpa_private_remote_allowed": CPA_ALLOW_REMOTE,
            "login_strategy": LOGIN_STRATEGY,
            "playwright_fallback": LOGIN_FALLBACK_PLAYWRIGHT,
        },
        "data_counts": {
            "microsoft_accounts": file_item_count(ACCOUNTS_FILE, "accounts"),
            "temp_addresses": file_item_count(TEMP_ADDRESSES_FILE, "addresses"),
            "messages": file_item_count(MESSAGES_FILE, "messages"),
        },
        "storage": {
            "workspace_scoped": True,
            "workspace_root": str(WORKSPACES_DIR),
        },
        "paths": {
            "root": str(ROOT),
            "static": str(STATIC_DIR),
            "data": str(DATA_DIR),
        },
    }


def public_top_links() -> list[dict[str, str]]:
    candidates = [
        ("商城", PUBLIC_STORE_URL),
        ("中转站", PUBLIC_RELAY_URL),
        ("公益站", PUBLIC_POOL_URL),
    ]
    links = []
    for label, url in candidates:
        normalized = normalize_base_url(url)
        if normalized:
            links.append({"label": label, "url": normalized})
    return links


def upgrade_status_payload() -> dict[str, Any]:
    request = load_json_file(UPGRADE_REQUEST_FILE, {})
    result = load_json_file(UPGRADE_RESULT_FILE, {})
    return {
        "success": True,
        "version": APP_VERSION,
        "request_file": str(UPGRADE_REQUEST_FILE),
        "result_file": str(UPGRADE_RESULT_FILE),
        "agent": {
            "mode": "host-timer",
            "enabled_by": "deploy/gpt-account-manager-upgrade-agent.timer",
        },
        "request": request if isinstance(request, dict) else {},
        "result": result if isinstance(result, dict) else {},
    }


def create_upgrade_request(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    now = iso_now()
    request_id = f"upgrade-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{secrets.token_hex(4)}"
    existing = load_json_file(UPGRADE_REQUEST_FILE, {})
    if isinstance(existing, dict) and existing.get("status") in {"requested", "running"}:
        return {
            "success": True,
            "already_pending": True,
            "request": existing,
            "status": upgrade_status_payload(),
        }
    request = {
        "id": request_id,
        "status": "requested",
        "requested_at": now,
        "current_version": APP_VERSION,
        "target": coerce_text((payload or {}).get("target") or "origin/main"),
        "note": "host upgrade agent will run git pull and docker compose rebuild",
    }
    write_json_file(UPGRADE_REQUEST_FILE, request)
    return {
        "success": True,
        "already_pending": False,
        "request": request,
        "status": upgrade_status_payload(),
    }


def load_accounts(path: Path = ACCOUNTS_FILE) -> dict[str, MailAccount]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError:
        return {}
    rows = raw.get("accounts", []) if isinstance(raw, dict) else raw
    if not isinstance(rows, list):
        return {}
    accounts: dict[str, MailAccount] = {}
    for item in rows:
        if not isinstance(item, dict):
            continue
        try:
            account = MailAccount(**item)
            accounts[account.email.lower()] = account
        except TypeError:
            continue
    return accounts


def save_accounts(accounts: dict[str, MailAccount], path: Path = ACCOUNTS_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updated_at": iso_now(),
        "accounts": [asdict(acc) for acc in sorted(accounts.values(), key=lambda a: a.email.lower())],
    }
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def load_temp_addresses(path: Path = TEMP_ADDRESSES_FILE) -> dict[str, TempAddress]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError:
        return {}
    rows = raw.get("addresses", []) if isinstance(raw, dict) else raw
    if not isinstance(rows, list):
        return {}
    addresses: dict[str, TempAddress] = {}
    for item in rows:
        if not isinstance(item, dict):
            continue
        try:
            item = dict(item)
            item["base_url"] = normalize_temp_worker_url(item.get("base_url") or item.get("baseUrl") or TEMP_WORKER_URL)
            address = TempAddress(**item)
            addresses[address.email.lower()] = address
        except TypeError:
            continue
    return addresses


def save_temp_addresses(addresses: dict[str, TempAddress], path: Path = TEMP_ADDRESSES_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updated_at": iso_now(),
        "addresses": [asdict(addr) for addr in sorted(addresses.values(), key=lambda a: a.email.lower())],
    }
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def message_key(message: dict[str, Any]) -> str:
    return "|".join([
        str(message.get("source", "")),
        str(message.get("account", "")),
        str(message.get("folder", "")),
        str(message.get("mid", "")),
        str(message.get("subject", "")),
        str(message.get("received_at", "")),
    ])


def load_messages(path: Path = MESSAGES_FILE) -> list[dict[str, Any]]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError:
        return []
    rows = raw.get("messages", []) if isinstance(raw, dict) else raw
    return [item for item in rows if isinstance(item, dict)] if isinstance(rows, list) else []


def save_messages(messages: list[dict[str, Any]], path: Path = MESSAGES_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    trimmed = sorted(messages, key=message_sort_value, reverse=True)[:2000]
    payload = {
        "updated_at": iso_now(),
        "messages": trimmed,
    }
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def upsert_messages(incoming: list[dict[str, Any]], path: Path = MESSAGES_FILE) -> None:
    if not incoming:
        return
    cache = {message_key(message): message for message in load_messages(path)}
    now = iso_now()
    for message in incoming:
        message.setdefault("cached_at", now)
        cache[message_key(message)] = message
    save_messages(list(cache.values()), path)


def parse_message_datetime(value: Any) -> datetime | None:
    text = coerce_text(value)
    if not text:
        return None
    try:
        parsed = parsedate_to_datetime(text)
        if parsed:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
    except Exception:
        pass
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def message_sort_value(message: dict[str, Any]) -> str:
    value = message.get("received_at") or message.get("cached_at") or ""
    parsed = parse_message_datetime(value)
    return parsed.isoformat() if parsed else str(value)


REFRESH_RESULTS_LIMIT = 500
LOGIN_HISTORY_LIMIT = 300


def load_refresh_results(path: Path = REFRESH_RESULTS_FILE) -> list[dict[str, Any]]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, OSError):
        return []
    rows = raw.get("results") if isinstance(raw, dict) else raw
    return [item for item in rows if isinstance(item, dict)] if isinstance(rows, list) else []


def save_refresh_results(results: list[dict[str, Any]], path: Path = REFRESH_RESULTS_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    trimmed = results[-REFRESH_RESULTS_LIMIT:]
    payload = {"updated_at": iso_now(), "results": trimmed}
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def append_refresh_result(auth_file: dict[str, Any], email: str = "", job_id: str = "", path: Path = REFRESH_RESULTS_FILE) -> None:
    """Persist a successful login refresh result to disk."""
    entry = {
        "email": email or auth_file.get("email", ""),
        "name": auth_file.get("name", ""),
        "job_id": job_id,
        "refreshed_at": iso_now(),
        "plan_type": auth_file.get("plan_type", ""),
        "auth_file": auth_file,
    }
    results = load_refresh_results(path)
    email_lower = entry["email"].lower()
    results = [r for r in results if r.get("email", "").lower() != email_lower]
    results.append(entry)
    save_refresh_results(results, path)


def load_login_history(path: Path = LOGIN_HISTORY_FILE) -> list[dict[str, Any]]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, OSError):
        return []
    rows = raw.get("history") if isinstance(raw, dict) else raw
    return [item for item in rows if isinstance(item, dict)] if isinstance(rows, list) else []


def save_login_history(history: list[dict[str, Any]], path: Path = LOGIN_HISTORY_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    trimmed = history[-LOGIN_HISTORY_LIMIT:]
    payload = {"updated_at": iso_now(), "history": trimmed}
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def append_login_history_entry(job: dict[str, Any], path: Path = LOGIN_HISTORY_FILE) -> None:
    """Persist a completed login job summary to disk."""
    entry = {
        "job_id": job.get("job_id"),
        "email": job.get("email"),
        "started_at": job.get("started_at"),
        "finished_at": job.get("finished_at"),
        "status": job.get("status"),
        "error": job.get("error"),
        "login_only": job.get("login_only"),
        "site_url": job.get("site_url"),
    }
    history = load_login_history(path)
    history = [h for h in history if h.get("job_id") != entry["job_id"]]
    history.append(entry)
    save_login_history(history, path)


def parse_account_lines(text: str) -> tuple[list[MailAccount], list[str]]:
    accounts: list[MailAccount] = []
    errors: list[str] = []
    for idx, line in enumerate(text.splitlines(), start=1):
        clean = line.strip().lstrip("\ufeff")
        if not clean or clean.startswith("#"):
            continue
        if "----" in clean:
            parts = [part.strip() for part in clean.split("----")]
        else:
            parts = [part.strip() for part in clean.split(",")]
        if len(parts) < 4:
            errors.append(f"Line {idx}: expected email----password----client_id----refresh_token")
            continue
        email_addr, password, client_id, refresh_token = parts[:4]
        if "@" not in email_addr or not client_id or not refresh_token:
            errors.append(f"Line {idx}: invalid account fields")
            continue
        accounts.append(MailAccount(
            email=email_addr,
            password=password,
            client_id=client_id,
            refresh_token=refresh_token,
            label=parts[4] if len(parts) >= 5 else "",
        ))
    return accounts, errors


def parse_temp_address_lines(text: str) -> tuple[list[TempAddress], list[str]]:
    addresses: list[TempAddress] = []
    errors: list[str] = []
    for idx, line in enumerate(text.splitlines(), start=1):
        clean = line.strip().lstrip("\ufeff")
        if not clean or clean.startswith("#"):
            continue
        if "----" in clean:
            parts = [part.strip() for part in clean.split("----")]
        else:
            parts = [part.strip() for part in clean.split(",")]
        email_addr = parts[0] if parts else ""
        if "@" not in email_addr:
            errors.append(f"Line {idx}: invalid temp email")
            continue
        addresses.append(TempAddress(
            email=email_addr,
            jwt=parts[1] if len(parts) >= 2 else "",
            base_url=parts[2] if len(parts) >= 3 else "",
            site_password=parts[3] if len(parts) >= 4 else "",
            label=parts[4] if len(parts) >= 5 else "",
        ))
    return addresses, errors


def http_json(url: str, *, method: str = "GET", data: dict[str, Any] | None = None,
              headers: dict[str, str] | None = None, timeout: int = 30) -> dict[str, Any]:
    body = None
    final_headers = dict(DEFAULT_HTTP_HEADERS)
    if headers:
        final_headers.update(headers)
    if data is not None:
        body = urllib.parse.urlencode(data).encode("utf-8")
        final_headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=body, headers=final_headers, method=method)
    try:
        with urlopen_with_dns_retry(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = {"error": text}
        message = payload.get("detail") or payload.get("error_description") or payload.get("error") or text
        raise RuntimeError(str(message)[:300]) from exc
    except urllib.error.URLError as exc:
        if is_dns_error(exc):
            try:
                return http_json_via_cached_ip_fallback(url, method=method, body=body, headers=final_headers, timeout=timeout)
            except Exception:
                pass
        raise RuntimeError(network_error_message(url, exc)) from exc


def http_text(url: str, *, headers: dict[str, str] | None = None, timeout: int = 30) -> tuple[int, str]:
    final_headers = dict(DEFAULT_HTTP_HEADERS)
    final_headers["Accept"] = "application/json,text/plain,*/*"
    if headers:
        final_headers.update(headers)
    req = urllib.request.Request(url, headers=final_headers, method="GET")
    try:
        with urlopen_with_dns_retry(req, timeout=timeout) as resp:
            raw = resp.read()
            return int(getattr(resp, "status", 200) or 200), raw.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {text[:240]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(network_error_message(url, exc)) from exc


SMS_CODE_PATTERN = re.compile(r"\b\d{4,8}\b")
SMS_EMPTY_PATTERN = re.compile(r"^(?:no\s*(?:sms|message)|empty|none|null|暂无|没有|未收到)$", re.I)
SMS_GENERIC_OK_PATTERN = re.compile(r"^(?:ok|success|successful|true|请求成功|成功)$", re.I)
SMS_MESSAGE_FIELDS = {
    "data",
    "message",
    "msg",
    "content",
    "text",
    "body",
    "sms",
    "otp",
    "code",
    "verifycode",
    "verificationcode",
    "captcha",
    "result",
    "value",
}
SMS_IGNORE_FIELDS = {"status", "statuscode", "httpstatus", "ret", "errno", "errorcode"}


def normalize_sms_field_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def collect_sms_candidates(value: Any, key: str = "", depth: int = 0) -> list[dict[str, Any]]:
    if value is None or depth > 6:
        return []
    key_norm = normalize_sms_field_name(key)
    if key_norm in SMS_IGNORE_FIELDS:
        return []
    if isinstance(value, str):
        text = value.strip()
        candidates = []
        if text and len(text) <= 800:
            candidates.append({
                "text": text,
                "key": key_norm,
                "depth": depth,
                "preferred": key_norm in SMS_MESSAGE_FIELDS,
            })
        if text and text[:1] in "{[":
            try:
                candidates.extend(collect_sms_candidates(json.loads(text), key, depth + 1))
            except Exception:
                pass
        return candidates
    if isinstance(value, (int, float)):
        if key_norm in {"otp", "smscode", "verifycode", "verificationcode", "captcha", "code"}:
            return [{
                "text": str(int(value)),
                "key": key_norm,
                "depth": depth,
                "preferred": True,
            }]
        return []
    if isinstance(value, list):
        out: list[dict[str, Any]] = []
        for item in value:
            out.extend(collect_sms_candidates(item, key, depth + 1))
        return out
    if isinstance(value, dict):
        out: list[dict[str, Any]] = []
        for child_key, child_value in value.items():
            out.extend(collect_sms_candidates(child_value, str(child_key), depth + 1))
        return out
    return []


def extract_sms_code_payload(raw_payload: Any) -> dict[str, str]:
    candidates = collect_sms_candidates(raw_payload)
    scored: list[tuple[int, dict[str, Any], str]] = []
    for candidate in candidates:
        text = coerce_text(candidate.get("text"))
        if not text or SMS_EMPTY_PATTERN.fullmatch(text) or SMS_GENERIC_OK_PATTERN.fullmatch(text):
            continue
        code_match = SMS_CODE_PATTERN.search(text)
        code = code_match.group(0) if code_match else ""
        score = (100 if code else 0) + (30 if candidate.get("preferred") else 0)
        if re.search(r"code|verify|verification|otp|openai|chatgpt|验证码|安全", text, re.I):
            score += 20
        score -= int(candidate.get("depth") or 0)
        scored.append((score, candidate, code))
    if scored:
        scored.sort(key=lambda item: item[0], reverse=True)
        _, candidate, code = scored[0]
        return {"code": code, "message": coerce_text(candidate.get("text"))}
    fallback = next((coerce_text(item.get("text")) for item in candidates if coerce_text(item.get("text"))), "")
    return {"code": "", "message": fallback}


def phone_api_url(template: str, *, phone: str, account_email: str, since: str = "") -> str:
    raw = coerce_text(template)
    if not raw:
        raise RuntimeError("接码 API URL 不能为空")
    replacements = {
        "{phone}": urllib.parse.quote(phone, safe=""),
        "{email}": urllib.parse.quote(account_email, safe=""),
        "{account}": urllib.parse.quote(account_email, safe=""),
        "{since}": urllib.parse.quote(since),
        "{ts}": str(int(time.time())),
    }
    for token, value in replacements.items():
        raw = raw.replace(token, value)
    parsed = urllib.parse.urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise RuntimeError("接码 API URL 必须是 http/https 地址")
    validate_remote_base_url(raw)
    return raw


def poll_phone_code(payload: dict[str, Any]) -> dict[str, Any]:
    phone = coerce_text(payload.get("phone") or payload.get("phone_number") or payload.get("phoneNumber"))
    account_email = coerce_text(payload.get("account_email") or payload.get("email") or payload.get("account"))
    api_url = coerce_text(payload.get("api_url") or payload.get("apiUrl"))
    since = coerce_text(payload.get("since"))
    if not phone:
        raise RuntimeError("手机号不能为空")
    url = phone_api_url(api_url, phone=phone, account_email=account_email, since=since)
    status, text = http_text(url, timeout=30)
    try:
        raw_payload: Any = json.loads(text)
    except Exception:
        raw_payload = text
    extracted = extract_sms_code_payload(raw_payload)
    code = extracted.get("code", "")
    return {
        "success": True,
        "found": bool(code),
        "code": code,
        "phone": phone,
        "account_email": account_email,
        "message": extracted.get("message", "")[:500],
        "status": status,
        "checked_at": iso_now(),
    }


def normalize_phone_digits(value: Any) -> str:
    return re.sub(r"\D+", "", coerce_text(value))


def extract_phone_hint_from_text(value: Any) -> str:
    text = coerce_text(value)
    if not text:
        return ""
    patterns = [
        r"(?:ending\s+in|ends\s+in|last\s+\d*\s*digits?|尾号|末尾|手机|手机号|电话|phone|mobile|sms)[^\d+*xX•]{0,40}(\+?\d[\d\s().-]{1,22}\d|[*xX•]{2,}\s*\d{2,6}|\d{2,6})",
        r"(\+\d[\d\s().-]{6,22}\d)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.I)
        if match:
            digits = normalize_phone_digits(match.group(1))
            if len(digits) >= 2:
                return digits
    return ""


def extract_phone_hint_from_step(data: Any, continue_url: str = "") -> str:
    texts: list[str] = []
    seen = 0

    def visit(value: Any, key_hint: str = "") -> None:
        nonlocal seen
        if seen > 120:
            return
        seen += 1
        if isinstance(value, dict):
            for key, item in value.items():
                key_text = coerce_text(key)
                if re.search(r"phone|mobile|sms|mfa|factor|verification|otp|channel|手机|号码", key_text, re.I):
                    texts.append(f"{key_text}: {coerce_text(item)}")
                visit(item, key_text)
        elif isinstance(value, list):
            for item in value[:80]:
                visit(item, key_hint)
        elif isinstance(value, str):
            if key_hint or re.search(r"phone|mobile|sms|mfa|otp|channel|手机|号码|\+\d|尾号|ending\s+in", value, re.I):
                texts.append(value)

    visit(data)
    if continue_url:
        texts.append(continue_url)
    for text in texts:
        hint = extract_phone_hint_from_text(text)
        if hint:
            return hint
    return ""


def phone_pool_entries_from_payload(payload: dict[str, Any]) -> list[dict[str, str]]:
    raw_entries = payload.get("phone_pool") or payload.get("phonePool") or []
    if not isinstance(raw_entries, list):
        return []
    entries: list[dict[str, str]] = []
    for item in raw_entries:
        if not isinstance(item, dict):
            continue
        phone = coerce_text(item.get("phone") or item.get("phone_number") or item.get("phoneNumber"))
        api_url = coerce_text(item.get("api_url") or item.get("apiUrl") or item.get("phone_api_url") or item.get("phoneApiUrl"))
        if not phone or not api_url:
            continue
        entries.append({
            "id": coerce_text(item.get("id")),
            "mode": coerce_text(item.get("mode")),
            "phone": phone,
            "phone_digits": normalize_phone_digits(phone),
            "api_url": api_url,
            "account_email": coerce_text(item.get("account_email") or item.get("accountEmail")).lower(),
        })
    return entries


def phone_pool_match_by_hint(entries: list[dict[str, str]], hint: str) -> dict[str, str] | None:
    hint_digits = normalize_phone_digits(hint)
    if len(hint_digits) < 2:
        return None
    exact = [entry for entry in entries if entry["phone_digits"] == hint_digits]
    if len(exact) == 1:
        return exact[0]
    if len(hint_digits) >= 4:
        suffix = [entry for entry in entries if entry["phone_digits"].endswith(hint_digits)]
        if len(suffix) == 1:
            return suffix[0]
    if len(hint_digits) >= 2:
        suffix = [entry for entry in entries if entry["phone_digits"].endswith(hint_digits)]
        if len(suffix) == 1:
            return suffix[0]
    return None


def manual_phone_code_for_payload(payload: dict[str, Any]) -> str:
    code = clean_manual_email_code(first_text(
        payload.get("manual_phone_code"),
        payload.get("phone_code"),
        payload.get("sms_code"),
    ))
    if code:
        return code
    job_id = coerce_text(payload.get("job_id"))
    if not job_id:
        return ""
    with LOGIN_JOBS_LOCK:
        job = LOGIN_JOBS.get(job_id)
        if not job:
            return ""
        return clean_manual_email_code(job.get("manual_phone_code"))


def set_login_manual_phone_code(payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
    job_id = coerce_text(payload.get("job_id") or payload.get("jobId"))
    code = clean_manual_email_code(first_text(
        payload.get("manual_phone_code"),
        payload.get("phone_code"),
        payload.get("sms_code"),
    ))
    if not job_id:
        raise RuntimeError("登录任务不存在")
    if not code:
        raise RuntimeError("请输入 4-8 位手机验证码")
    expected_workspace = normalize_workspace_id(workspace_id)
    with LOGIN_JOBS_LOCK:
        job = LOGIN_JOBS.get(job_id)
        if not job:
            raise RuntimeError("登录任务不存在")
        job_workspace = normalize_workspace_id(job.get("workspace_id"))
        if expected_workspace and job_workspace != expected_workspace:
            raise RuntimeError("登录任务不属于当前工作区")
        job["manual_phone_code"] = code
        job["updated_at"] = iso_now()
    append_login_log(job_id, "已收到手动手机验证码", "info", "manual_phone_code")
    return {"success": True, "job_id": job_id}


def network_error_message(url: str, exc: BaseException) -> str:
    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname or url
    reason = getattr(exc, "reason", exc)
    text = str(reason or exc)
    lowered = text.lower()
    if "Temporary failure in name resolution" in text or "Name or service not known" in text:
        return f"服务器 DNS 解析失败：{host}。服务端请求由 VPS 发起，不是用户浏览器直接访问；请检查 VPS DNS、代理或目标 API 域名。原始错误：{text}"
    if "nodename nor servname provided" in text or "getaddrinfo failed" in text:
        return f"服务器 DNS 解析失败：{host}。服务端请求由 VPS 发起，不是用户浏览器直接访问；请检查 VPS DNS、代理或目标 API 域名。原始错误：{text}"
    if "unexpected_eof_while_reading" in lowered or "eof occurred in violation of protocol" in lowered:
        return f"代理 TLS 连接被中断：{host}。当前代理出口没有稳定完成 HTTPS 握手，请更换代理或稍后重试。原始错误：{text}"
    if "connection reset" in lowered or "connection refused" in lowered or "remote end closed connection" in lowered:
        return f"代理连接失败：{host}。当前代理出口连接被关闭或拒绝，请更换代理。原始错误：{text}"
    if "timed out" in lowered or "timeout" in lowered:
        return f"代理连接超时：{host}。当前代理出口响应太慢，请更换代理或降低批量。原始错误：{text}"
    return f"服务器网络请求失败：{host}。原始错误：{text}"


def is_dns_error(exc: BaseException) -> bool:
    """Check if an exception is caused by DNS resolution failure."""
    text = str(getattr(exc, "reason", exc))
    return any(phrase in text for phrase in [
        "Temporary failure in name resolution",
        "Name or service not known",
        "nodename nor servname provided",
        "getaddrinfo failed",
    ])


def set_dns_fallback_cache(host: str, addresses: list[str]) -> None:
    clean_host = str(host or "").strip().lower()
    if not clean_host:
        return
    ipv4_first = sorted(set(addresses), key=lambda value: (":" in value, value))
    if ipv4_first:
        DNS_FALLBACK_CACHE[clean_host] = ipv4_first[:8]


def cached_fallback_ips(host: str) -> list[str]:
    clean_host = str(host or "").strip().lower()
    if clean_host not in DNS_FALLBACK_HOSTS:
        return []
    cached = DNS_FALLBACK_CACHE.get(clean_host, [])
    if cached:
        return cached
    static = STATIC_DNS_FALLBACK_IPS.get(clean_host, [])
    if static:
        return static
    resolved = resolve_host_with_doh(clean_host)
    if resolved:
        set_dns_fallback_cache(clean_host, resolved)
        return resolved
    return []


def resolve_host_with_doh(host: str) -> list[str]:
    clean_host = str(host or "").strip().lower()
    if clean_host not in DNS_FALLBACK_HOSTS:
        return []
    query = urllib.parse.urlencode({"name": clean_host, "type": "A"})
    queries = [
        ("cloudflare-dns.com", "1.1.1.1", f"/dns-query?{query}"),
        ("cloudflare-dns.com", "1.0.0.1", f"/dns-query?{query}"),
        ("dns.google", "8.8.8.8", f"/resolve?{query}"),
        ("dns.google", "8.8.4.4", f"/resolve?{query}"),
    ]
    addresses: list[str] = []
    for doh_host, doh_ip, path in queries:
        conn: HostHeaderHTTPSConnection | None = None
        try:
            conn = HostHeaderHTTPSConnection(doh_ip, doh_host, timeout=8)
            conn.request("GET", path, headers={**DEFAULT_HTTP_HEADERS, "Accept": "application/dns-json", "Host": doh_host})
            resp = conn.getresponse()
            payload = json.loads(resp.read().decode("utf-8"))
        except Exception:
            continue
        finally:
            if conn:
                conn.close()
        answers = payload.get("Answer") or []
        for item in answers:
            if item.get("type") == 1 and item.get("data"):
                addresses.append(str(item["data"]))
    return sorted(set(addresses))


def dns_overrides_for_url(url: str) -> dict[str, list[str]]:
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").strip().lower()
    ips = cached_fallback_ips(host)
    return {host: ips} if host and ips else {}


@contextlib.contextmanager
def temporary_dns_overrides(overrides: dict[str, list[str]]):
    clean_overrides = {
        host.lower(): list(ips)
        for host, ips in overrides.items()
        if host and ips
    }
    if not clean_overrides:
        yield
        return

    original_getaddrinfo = socket.getaddrinfo

    def fast_getaddrinfo(host: str, port: int, family: int = 0, type: int = 0, proto: int = 0, flags: int = 0):
        clean_host = str(host or "").strip().lower()
        ips = clean_overrides.get(clean_host)
        if not ips:
            return original_getaddrinfo(host, port, family, type, proto, flags)
        rows = []
        for ip in ips:
            socket_family = socket.AF_INET6 if ":" in ip else socket.AF_INET
            if family not in {0, socket.AF_UNSPEC, socket_family}:
                continue
            sockaddr = (ip, port, 0, 0) if socket_family == socket.AF_INET6 else (ip, port)
            rows.append((socket_family, type or socket.SOCK_STREAM, proto or socket.IPPROTO_TCP, "", sockaddr))
        return rows or original_getaddrinfo(host, port, family, type, proto, flags)

    with DNS_OVERRIDE_LOCK:
        socket.getaddrinfo = fast_getaddrinfo
        try:
            yield
        finally:
            socket.getaddrinfo = original_getaddrinfo


def open_with_fast_dns(open_call: Any, req: urllib.request.Request, *, timeout: int = 30, use_cache: bool = True):
    if not use_cache:
        return open_call(req, timeout=timeout)
    with temporary_dns_overrides(dns_overrides_for_url(req.full_url)):
        return open_call(req, timeout=timeout)


def urlopen_with_dns_retry(req: urllib.request.Request, *, timeout: int = 30, retries: int = 1):
    """urlopen with automatic retry on transient DNS failures (e.g. Cloudflare domains on VPS)."""
    last_exc: BaseException | None = None
    for attempt in range(1 + retries):
        try:
            return open_with_fast_dns(urllib.request.urlopen, req, timeout=timeout)
        except urllib.error.URLError as exc:
            if attempt < retries and is_dns_error(exc):
                time.sleep(1.5)
                last_exc = exc
                continue
            raise
    raise last_exc  # type: ignore[misc]


def create_ip_connection(host: str, port: int, timeout: float | None, source_address: tuple[str, int] | None = None):
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return socket.create_connection((host, port), timeout, source_address)
    family = socket.AF_INET6 if ip.version == 6 else socket.AF_INET
    sock = socket.socket(family, socket.SOCK_STREAM)
    try:
        if timeout is not None:
            sock.settimeout(timeout)
        if source_address:
            sock.bind(source_address)
        sockaddr = (host, port, 0, 0) if family == socket.AF_INET6 else (host, port)
        sock.connect(sockaddr)
        return sock
    except Exception:
        sock.close()
        raise


class HostHeaderHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, ip: str, host_header: str, *args: Any, **kwargs: Any):
        self._host_header = host_header
        super().__init__(ip, *args, **kwargs)

    def connect(self) -> None:
        sock = create_ip_connection(self.host, self.port, self.timeout, self.source_address)
        context = self._context
        self.sock = context.wrap_socket(sock, server_hostname=self._host_header)


class HostHeaderIMAP4SSL(imaplib.IMAP4_SSL):
    def __init__(self, host: str, connect_host: str, port: int = 993, *, timeout: int = 30):
        self._sni_host = host
        super().__init__(connect_host, port, ssl_context=ssl.create_default_context(), timeout=timeout)

    def _create_socket(self, timeout: float | None):
        sock = create_ip_connection(self.host, self.port, timeout)
        return self.ssl_context.wrap_socket(sock, server_hostname=self._sni_host)


def http_json_via_ip_fallback(url: str, *, headers: dict[str, str], timeout: int = 30) -> dict[str, Any]:
    parsed = urllib.parse.urlparse(url)
    if (
        parsed.scheme != "https"
        or not TEMP_WORKER_DNS_FALLBACK_HOST
        or parsed.hostname != TEMP_WORKER_DNS_FALLBACK_HOST
        or not TEMP_WORKER_DNS_FALLBACK_IPS
    ):
        raise RuntimeError("No IP fallback configured for this host")
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    last_error = ""
    for ip in TEMP_WORKER_DNS_FALLBACK_IPS:
        conn: HostHeaderHTTPSConnection | None = None
        try:
            conn = HostHeaderHTTPSConnection(ip, parsed.hostname, timeout=timeout, context=ssl.create_default_context())
            conn.request("GET", path, headers={**headers, "Host": parsed.hostname})
            resp = conn.getresponse()
            text = resp.read().decode("utf-8", errors="ignore")
            if resp.status >= 400:
                raise urllib.error.HTTPError(url, resp.status, resp.reason, resp.headers, None)
            return json.loads(text)
        except Exception as exc:
            last_error = str(exc)
        finally:
            if conn:
                conn.close()
    raise RuntimeError(f"临时邮箱 API DNS 兜底也失败：{last_error}")


def http_json_via_cached_ip_fallback(
    url: str,
    *,
    method: str = "GET",
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 30,
) -> dict[str, Any]:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise RuntimeError("No cached IP fallback configured for this URL")
    ips = cached_fallback_ips(parsed.hostname)
    if not ips:
        raise RuntimeError("No cached IP fallback available for this host")
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    last_error = ""
    for ip in ips:
        conn: HostHeaderHTTPSConnection | None = None
        try:
            conn = HostHeaderHTTPSConnection(ip, parsed.hostname, timeout=timeout, context=ssl.create_default_context())
            conn.request(method, path, body=body, headers={**(headers or {}), "Host": parsed.hostname})
            resp = conn.getresponse()
            data = resp.read()
            text = data.decode("utf-8", errors="ignore")
            if resp.status >= 400:
                raise urllib.error.HTTPError(url, resp.status, resp.reason, resp.headers, io.BytesIO(data))
            return json.loads(text)
        except Exception as exc:
            last_error = str(exc)
        finally:
            if conn:
                conn.close()
    raise RuntimeError(f"DNS IP fallback failed: {last_error}")


def mail_network_probe_hosts() -> list[tuple[str, int, str]]:
    hosts = [
        ("auth.openai.com", 443, "OpenAI 授权"),
        ("chatgpt.com", 443, "ChatGPT 登录"),
        ("login.microsoftonline.com", 443, "Microsoft Graph 登录"),
        ("graph.microsoft.com", 443, "Microsoft Graph 收件"),
        ("outlook.office.com", 443, "Microsoft IMAP token"),
        ("outlook.live.com", 993, "Microsoft IMAP 收件"),
        ("outlook.office365.com", 993, "Microsoft IMAP 备用"),
        ("login.live.com", 443, "Microsoft Live 备用"),
    ]
    temp_host = urllib.parse.urlparse(TEMP_WORKER_URL).hostname
    if temp_host:
        hosts.append((temp_host, 443 if TEMP_WORKER_URL.startswith("https://") else 80, "临时邮箱 API"))
    return hosts


def network_health_payload() -> dict[str, Any]:
    checks = []
    for host, port, label in mail_network_probe_hosts():
        started = time.perf_counter()
        try:
            infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
            addresses = sorted({item[4][0] for item in infos})[:4]
            set_dns_fallback_cache(host, addresses)
            checks.append({
                "label": label,
                "host": host,
                "port": port,
                "ok": True,
                "addresses": addresses,
                "elapsed_ms": round((time.perf_counter() - started) * 1000),
            })
        except OSError as exc:
            checks.append({
                "label": label,
                "host": host,
                "port": port,
                "ok": False,
                "error": network_error_message(f"tcp://{host}:{port}", exc),
                "elapsed_ms": round((time.perf_counter() - started) * 1000),
            })
    return {
        "ok": all(item.get("ok") for item in checks),
        "version": APP_VERSION,
        "now": iso_now(),
        "checks": checks,
    }


def get_graph_token(account: MailAccount) -> str:
    attempts = [
        ("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
            "client_id": account.client_id,
            "grant_type": "refresh_token",
            "refresh_token": account.refresh_token,
            "scope": "https://graph.microsoft.com/Mail.Read offline_access",
        }),
        ("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
            "client_id": account.client_id,
            "grant_type": "refresh_token",
            "refresh_token": account.refresh_token,
            "scope": "https://graph.microsoft.com/.default",
        }),
    ]
    last_error = ""
    for url, data in attempts:
        try:
            payload = http_json(url, method="POST", data=data)
            token = payload.get("access_token")
            if token:
                return token
            last_error = str(payload)
        except Exception as exc:
            last_error = str(exc)
    raise RuntimeError(f"Graph token failed: {last_error}")


def refresh_microsoft_access_token(
    account: MailAccount,
    attempts: list[tuple[str, dict[str, str]]],
    label: str,
) -> str:
    last_error = ""
    for url, data in attempts:
        try:
            payload = http_json(url, method="POST", data=data)
            token = payload.get("access_token")
            if token:
                return token
            last_error = str(payload)
        except Exception as exc:
            last_error = str(exc)
    raise RuntimeError(f"{label} token failed: {last_error}")


def get_imap_token(account: MailAccount) -> tuple[str, str]:
    attempts = [
        ("https://login.live.com/oauth20_token.srf", {
            "client_id": account.client_id,
            "grant_type": "refresh_token",
            "refresh_token": account.refresh_token,
        }, "outlook.office365.com"),
        ("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
            "client_id": account.client_id,
            "grant_type": "refresh_token",
            "refresh_token": account.refresh_token,
            "scope": "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read",
        }, "outlook.live.com"),
        ("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
            "client_id": account.client_id,
            "grant_type": "refresh_token",
            "refresh_token": account.refresh_token,
            "scope": "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read",
        }, "outlook.office365.com"),
    ]
    last_error = ""
    for url, data, server in attempts:
        try:
            return refresh_microsoft_access_token(account, [(url, data)], "IMAP"), server
        except Exception as exc:
            last_error = str(exc)
    raise RuntimeError(f"IMAP token failed: {last_error}")


def fetch_graph_messages(account: MailAccount, *, limit: int, sender_filter: str = "") -> list[dict[str, Any]]:
    token = get_graph_token(account)
    messages: list[dict[str, Any]] = []
    for folder in GRAPH_FOLDERS:
        params = urllib.parse.urlencode({
            "$select": "id,subject,bodyPreview,from,receivedDateTime,webLink",
            "$orderby": "receivedDateTime desc",
            "$top": str(max(limit, 1)),
        })
        url = f"https://graph.microsoft.com/v1.0/me/mailFolders/{folder}/messages?{params}"
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        })
        try:
            with urlopen_with_dns_retry(req, timeout=30) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 404 and folder == "junkemail":
                continue
            text = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Graph fetch failed: {exc.code} {text[:220]}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(network_error_message(url, exc)) from exc
        for item in payload.get("value", []):
            sender = item.get("from", {}).get("emailAddress", {}).get("address", "")
            subject = item.get("subject", "")
            body = item.get("bodyPreview", "")
            if sender_filter and sender_filter.lower() not in f"{sender} {subject} {body}".lower():
                continue
            messages.append(normalize_message(
                account=account.email,
                provider="graph",
                folder=folder,
                mid=item.get("id", ""),
                sender=sender,
                subject=subject,
                body=body,
                received_at=item.get("receivedDateTime", ""),
                web_link=item.get("webLink", ""),
            ))
    return messages[:limit]


def fetch_outlook_api_messages(account: MailAccount, *, limit: int, sender_filter: str = "") -> list[dict[str, Any]]:
    token = refresh_microsoft_access_token(account, [
        ("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
            "client_id": account.client_id,
            "grant_type": "refresh_token",
            "refresh_token": account.refresh_token,
        }),
        ("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
            "client_id": account.client_id,
            "grant_type": "refresh_token",
            "refresh_token": account.refresh_token,
            "scope": "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read",
        }),
    ], "Outlook API")
    messages: list[dict[str, Any]] = []
    for folder in GRAPH_FOLDERS:
        params = urllib.parse.urlencode({
            "$select": "Id,Subject,BodyPreview,From,ReceivedDateTime,WebLink",
            "$orderby": "ReceivedDateTime desc",
            "$top": str(max(limit, 1)),
        })
        url = f"https://outlook.office.com/api/v2.0/me/mailfolders/{folder}/messages?{params}"
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        })
        try:
            with urlopen_with_dns_retry(req, timeout=30) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 404 and folder == "junkemail":
                continue
            text = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Outlook API fetch failed: {exc.code} {text[:220]}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(network_error_message(url, exc)) from exc
        for item in payload.get("value", []):
            sender_info = item.get("From") or item.get("from") or {}
            sender_addr = sender_info.get("EmailAddress") or sender_info.get("emailAddress") or {}
            sender = sender_addr.get("Address") or sender_addr.get("address") or ""
            subject = item.get("Subject") or item.get("subject") or ""
            body = item.get("BodyPreview") or item.get("bodyPreview") or ""
            if sender_filter and sender_filter.lower() not in f"{sender} {subject} {body}".lower():
                continue
            messages.append(normalize_message(
                account=account.email,
                provider="outlook",
                folder=folder,
                mid=item.get("Id") or item.get("id") or "",
                sender=sender,
                subject=subject,
                body=body,
                received_at=item.get("ReceivedDateTime") or item.get("receivedDateTime") or "",
                web_link=item.get("WebLink") or item.get("webLink") or "",
            ))
    return messages[:limit]


def fetch_imap_messages(account: MailAccount, *, limit: int, sender_filter: str = "") -> list[dict[str, Any]]:
    token, server = get_imap_token(account)
    auth = f"user={account.email}\x01auth=Bearer {token}\x01\x01"
    messages: list[dict[str, Any]] = []
    try:
        with open_imap_ssl(server) as imap:
            return fetch_imap_messages_with_connection(imap, account, auth, limit, sender_filter)
    except OSError as exc:
        if is_dns_error(exc):
            for ip in cached_fallback_ips(server):
                try:
                    with HostHeaderIMAP4SSL(server, ip, 993, timeout=30) as imap:
                        return fetch_imap_messages_with_connection(imap, account, auth, limit, sender_filter)
                except OSError:
                    continue
                except imaplib.IMAP4.error:
                    continue
        raise RuntimeError(network_error_message(f"imaps://{server}:993", exc)) from exc
    return messages


def open_imap_ssl(server: str):
    return imaplib.IMAP4_SSL(server, 993, ssl_context=ssl.create_default_context(), timeout=30)


def fetch_imap_messages_with_connection(
    imap: imaplib.IMAP4_SSL,
    account: MailAccount,
    auth: str,
    limit: int,
    sender_filter: str,
) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    imap.authenticate("XOAUTH2", lambda _: auth.encode("utf-8"))
    for folder in IMAP_FOLDERS:
        try:
            status, _ = imap.select(f'"{folder}"', readonly=True)
            if status != "OK":
                continue
            if sender_filter:
                status, ids_raw = imap.uid("search", None, f'(OR FROM "{sender_filter}" TEXT "{sender_filter}")')
            else:
                status, ids_raw = imap.uid("search", None, "ALL")
            if status != "OK" or not ids_raw or not ids_raw[0]:
                continue
            ids = ids_raw[0].split()[-limit:]
            for mid in reversed(ids):
                status, msg_data = imap.uid("fetch", mid, "(RFC822)")
                if status != "OK" or not msg_data or not msg_data[0]:
                    continue
                raw = msg_data[0][1]
                msg = email_lib.message_from_bytes(raw)
                subject = decode_mime_header(msg.get("Subject", ""))
                sender = decode_mime_header(msg.get("From", ""))
                body, html_body = extract_body_parts(msg)
                if not body and html_body:
                    body = strip_html(html_body)
                received_at = msg.get("Date", "")
                messages.append(normalize_message(
                    account=account.email,
                    provider="imap",
                    folder=folder,
                    mid=mid.decode("utf-8", errors="ignore"),
                    imap_id_type="uid",
                    sender=sender,
                    subject=subject,
                    body=body,
                    html_body=html_body,
                    received_at=received_at,
                ))
                if len(messages) >= limit:
                    return messages
        except imaplib.IMAP4.error:
            continue
    return messages


def decode_mime_header(value: str) -> str:
    pieces: list[str] = []
    for part, enc in decode_header(value):
        if isinstance(part, bytes):
            pieces.append(decode_bytes(part, enc))
        else:
            pieces.append(part)
    return "".join(pieces)


def decode_bytes(payload: bytes, charset: str | None = None) -> str:
    candidates = []
    if charset:
        candidates.append(charset)
    candidates.extend(["utf-8", "gb18030", "gbk", "big5", "latin-1"])
    seen: set[str] = set()
    for encoding in candidates:
        normalized = encoding.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        try:
            return payload.decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue
    return payload.decode(charset or "utf-8", errors="replace")


def decode_message_part(part: email_lib.message.Message) -> str:
    payload = part.get_payload(decode=True)
    if isinstance(payload, bytes):
        return decode_bytes(payload, part.get_content_charset())
    fallback = part.get_payload()
    return fallback if isinstance(fallback, str) else ""


def extract_body_parts(msg: email_lib.message.Message) -> tuple[str, str]:
    plain_chunks: list[str] = []
    html_chunks: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type not in ("text/plain", "text/html"):
                continue
            text = decode_message_part(part)
            if not text:
                continue
            if content_type == "text/plain":
                plain_chunks.append(text)
            else:
                html_chunks.append(text)
    else:
        text = decode_message_part(msg)
        if msg.get_content_type() == "text/html":
            html_chunks.append(text)
        else:
            plain_chunks.append(text)
    return "\n".join(plain_chunks), "\n".join(html_chunks)


def extract_body(msg: email_lib.message.Message) -> str:
    plain, html_body = extract_body_parts(msg)
    return plain or strip_html(html_body)


def normalize_raw_email(raw: str) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    if "\\r\\n" in text and "\r\n" not in text:
        text = text.replace("\\r\\n", "\r\n").replace("\\n", "\n")
    if re.search(r"^[A-Za-z0-9_-]+:", text, flags=re.M):
        return text
    compact = re.sub(r"\s+", "", text)
    if len(compact) >= 24 and len(compact) % 4 == 0 and re.fullmatch(r"[A-Za-z0-9+/=]+", compact):
        try:
            decoded = base64.b64decode(compact, validate=True)
            decoded_text = decode_bytes(decoded)
            if re.search(r"^[A-Za-z0-9_-]+:", decoded_text, flags=re.M):
                return decoded_text
        except Exception:
            pass
    return text


def parse_raw_email(raw: str) -> tuple[str, str, str, str, str]:
    normalized = normalize_raw_email(raw)
    if not normalized:
        return "", "", "", "", ""
    try:
        msg = email_lib.message_from_string(normalized)
    except Exception:
        return "", "", "", "", ""
    plain, html_body = extract_body_parts(msg)
    return (
        decode_mime_header(msg.get("Subject", "")),
        decode_mime_header(msg.get("From", "")),
        plain or strip_html(html_body),
        sanitize_email_html(html_body),
        msg.get("Date", ""),
    )


def first_text(*values: Any) -> str:
    for value in values:
        text = coerce_text(value)
        if text:
            return text
    return ""


def normalize_message(**kwargs: Any) -> dict[str, Any]:
    subject = coerce_text(kwargs.get("subject"))
    body_text = strip_html(coerce_text(kwargs.get("body")))
    html_body = sanitize_email_html(coerce_text(kwargs.get("html_body")))
    if not body_text and html_body:
        body_text = strip_html(html_body)
    text = strip_html(f"{subject}\n{body_text}")
    links = extract_links(text)
    codes = extract_codes(text)
    mail_type = classify_mail(
        f"{kwargs.get('sender', '')} {subject} {text}"
    )
    return {
        **kwargs,
        "source": kwargs.get("source", "microsoft"),
        "mail_type": mail_type,
        "mail_type_label": MAIL_TYPE_LABELS.get(mail_type, "other"),
        "body": body_text[:6000],
        "html_body": html_body[:200000],
        "preview": " ".join((body_text or subject).split())[:260],
        "codes": codes,
        "links": links[:12],
    }


def sanitize_email_html(value: str) -> str:
    text = str(value or "")
    if not text:
        return ""
    text = re.sub(r"<\s*(script|iframe|object|embed|form|input|button|select|textarea)\b.*?</\s*\1\s*>", "", text, flags=re.I | re.S)
    text = re.sub(r"<\s*(script|iframe|object|embed|form|input|button|select|textarea|meta)\b[^>]*>", "", text, flags=re.I | re.S)
    text = re.sub(r"\s+on[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", text, flags=re.I)
    text = re.sub(r"\s+(href|src)\s*=\s*(['\"])\s*javascript:[^'\"]*\2", "", text, flags=re.I)
    text = re.sub(r"\s+(href|src)\s*=\s*javascript:[^\s>]+", "", text, flags=re.I)
    return text


def strip_html(text: str) -> str:
    text = re.sub(r"<(script|style).*?</\1>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    return html.unescape(text)


def extract_links(text: str) -> list[str]:
    links = re.findall(r"https?://[^\s<>'\")]+", text)
    clean: list[str] = []
    seen: set[str] = set()
    for link in links:
        link = link.rstrip(".,;]")
        if link not in seen:
            seen.add(link)
            clean.append(link)
    return clean


def extract_codes(text: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for pattern in CODE_PATTERNS:
        for match in re.finditer(pattern, text, flags=re.I):
            code = match.group(1)
            if code.lower() in {"ffffff", "000000"}:
                continue
            if not code.isdigit() and not (re.search(r"[A-Za-z]", code) and re.search(r"\d", code)):
                continue
            if code not in seen:
                seen.add(code)
                found.append(code)
    return found[:10]


def classify_mail(text: str) -> str:
    value = text.lower()
    if any(word in value for word in [
        "access deactivated",
        "account deactivated",
        "deleted or deactivated",
        "deactivated",
        "disabled",
        "banned",
        "suspended",
        "封禁",
        "停用",
        "禁用",
    ]):
        return "banned"
    if any(word in value for word in ["verify", "verification", "code", "otp", "confirm", "验证码", "安全代码"]):
        return "verification"
    if any(word in value for word in ["invite", "invitation", "join", "team", "邀请"]):
        return "invite"
    if any(word in value for word in ["security", "alert", "sign-in", "login", "unusual", "安全", "登录"]):
        return "security"
    if any(word in value for word in ["reset", "recover", "password", "重置", "找回密码"]):
        return "reset"
    if any(word in value for word in ["invoice", "receipt", "payment", "billing", "账单", "付款", "收据"]):
        return "billing"
    if any(word in value for word in ["newsletter", "digest", "update", "通知", "订阅"]):
        return "newsletter"
    return "other"



def filter_messages(messages: list[dict[str, Any]], payload: dict[str, Any]) -> list[dict[str, Any]]:
    query = str(payload.get("query", "")).strip().lower()
    sender = str(payload.get("sender", "")).strip().lower()
    source = str(payload.get("source", "all")).strip().lower()
    mail_type = str(payload.get("mail_type", "all")).strip().lower()
    account = str(payload.get("account", "")).strip().lower()
    filtered = []
    for message in messages:
        haystack = " ".join(str(message.get(key, "")) for key in [
            "account", "sender", "subject", "preview", "body", "folder", "provider", "mail_type_label"
        ]).lower()
        if query and query not in haystack:
            continue
        if sender and sender not in str(message.get("sender", "")).lower():
            continue
        if source != "all" and source != str(message.get("source", "")).lower():
            continue
        if mail_type != "all" and mail_type != str(message.get("mail_type", "")).lower():
            continue
        if account and account not in str(message.get("account", "")).lower():
            continue
        filtered.append(message)
    return sorted(filtered, key=message_sort_value, reverse=True)


def temp_headers(address: TempAddress) -> dict[str, str]:
    headers = {
        **DEFAULT_HTTP_HEADERS,
        "Authorization": f"Bearer {address.jwt}",
    }
    if address.site_password:
        headers["x-custom-auth"] = address.site_password
    return headers


def fetch_temp_messages(address: TempAddress, *, limit: int, sender_filter: str = "") -> list[dict[str, Any]]:
    if not address.base_url or not address.jwt:
        raise RuntimeError("Temp address requires base_url and jwt")
    base_url = normalize_temp_worker_url(address.base_url).rstrip("/")
    params = urllib.parse.urlencode({
        "limit": str(max(limit, 1)),
        "offset": "0",
    })
    url = f"{base_url}/api/mails?{params}"
    req = urllib.request.Request(url, headers=temp_headers(address))
    try:
        with urlopen_with_dns_retry(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="ignore")
        if exc.code in {401, 403} and "Invalid address credential" in text:
            raise RuntimeError("临时邮箱 JWT/地址凭证无效：Invalid address credential") from exc
        raise RuntimeError(f"临时邮箱 API 返回 HTTP {exc.code}：{text[:220]}") from exc
    except urllib.error.URLError as exc:
        if is_dns_error(exc):
            try:
                payload = http_json_via_ip_fallback(url, headers=temp_headers(address), timeout=30)
            except urllib.error.HTTPError as fallback_http:
                text = fallback_http.read().decode("utf-8", errors="ignore")
                if fallback_http.code in {401, 403} and "Invalid address credential" in text:
                    raise RuntimeError("临时邮箱 JWT/地址凭证无效：Invalid address credential") from fallback_http
                raise RuntimeError(f"临时邮箱 API 返回 HTTP {fallback_http.code}：{text[:220]}") from fallback_http
            except Exception as fallback_exc:
                raise RuntimeError(f"{network_error_message(url, exc)}；IP 兜底也失败：{fallback_exc}") from fallback_exc
        else:
            raise RuntimeError(network_error_message(url, exc)) from exc
    rows = payload.get("results", []) if isinstance(payload, dict) else []
    messages: list[dict[str, Any]] = []
    for item in rows:
        raw = str(item.get("raw") or item.get("raw_blob") or "")
        parsed_subject, parsed_sender, parsed_body, parsed_html, parsed_date = parse_raw_email(raw)
        subject = first_text(parsed_subject, item.get("subject"))
        sender = first_text(parsed_sender, item.get("source"), item.get("from"))
        body = first_text(parsed_body, item.get("body"), item.get("content"), item.get("html"), item.get("text"))
        html_body = first_text(parsed_html, item.get("html"))
        if not body:
            body = json.dumps(item, ensure_ascii=False)
        if sender_filter and sender_filter.lower() not in f"{sender} {subject} {body}".lower():
            continue
        messages.append(normalize_message(
            source="temp",
            account=address.email,
            provider="cf-temp",
            folder="inbox",
            mid=str(item.get("id", "")),
            sender=decode_mime_header(sender),
            subject=decode_mime_header(subject),
            body=body,
            html_body=html_body,
            received_at=first_text(item.get("created_at"), item.get("date"), parsed_date),
            web_link=f"{base_url}/?jwt={urllib.parse.quote(address.jwt)}",
        ))
    return messages[:limit]


def remove_cached_message(message: dict[str, Any], path: Path = MESSAGES_FILE) -> bool:
    key = message_key(message)
    messages = load_messages(path)
    kept = [item for item in messages if message_key(item) != key]
    if len(kept) == len(messages):
        return False
    save_messages(kept, path)
    return True


def delete_cached_mail_message(message: dict[str, Any], path: Path = MESSAGES_FILE) -> dict[str, Any]:
    if not isinstance(message, dict):
        raise RuntimeError("缺少要删除的邮件")
    email_addr = coerce_text(message.get("account"))
    if "@" not in email_addr:
        raise RuntimeError("邮件缺少所属邮箱，无法定位缓存")
    cache_removed = remove_cached_message(message, path)
    return {
        "success": True,
        "deleted": cache_removed,
        "cache_removed": cache_removed,
        "message": "已从工具缓存清理，不会删除远端真实邮箱邮件",
    }


def delete_transient_client_mail_message(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "success": True,
        "deleted": False,
        "cache_removed": False,
        "message": "当前浏览器缓存已在前端清理，不会删除远端真实邮箱邮件",
    }


def delete_stored_mail_message(payload: dict[str, Any], path: Path = MESSAGES_FILE) -> dict[str, Any]:
    return delete_cached_mail_message(payload.get("message") or {}, path)


def extract_header_value(raw: str, header: str) -> str:
    if not raw:
        return ""
    match = re.search(rf"^{re.escape(header)}:\s*(.+?)(?:\r?\n(?![ \t])|\Z)", raw, flags=re.I | re.M | re.S)
    if not match:
        return ""
    return re.sub(r"\s+", " ", match.group(1)).strip()


MAIL_FETCH_ERROR_LABELS = {
    "dns_failed": "DNS 解析失败",
    "temp_invalid_credential": "临时邮箱 JWT 无效",
    "temp_config_missing": "临时邮箱配置缺失",
    "temp_api_http_error": "临时邮箱 API 异常",
    "outlook_credential_format": "Outlook 凭证格式错误",
    "outlook_client_mismatch": "Outlook client_id 不匹配",
    "outlook_refresh_expired": "Outlook RT 过期",
    "graph_token_failed": "Graph 授权失败",
    "imap_token_failed": "IMAP 授权失败",
    "graph_fetch_failed": "Graph 收信失败",
    "imap_fetch_failed": "IMAP 收信失败",
    "network_tls_eof": "网络连接被截断",
    "network_failed": "网络请求失败",
    "mail_fetch_timeout": "单个邮箱取信超时",
    "mail_fetch_failed": "收信失败",
}


def classify_mail_fetch_error(raw: str, source: str = "") -> dict[str, Any]:
    message = str(raw or "").strip()
    lowered = message.lower()
    code = "mail_fetch_failed"
    hint = "请检查该邮箱对应的取信凭证和网络出口后重试。"
    retryable = True
    if "invalid address credential" in lowered or "jwt/地址凭证无效" in message or ("401" in lowered and source == "temp"):
        code = "temp_invalid_credential"
        hint = "导入的 JWT 不是这个临时邮箱对应的地址凭证，或已经过期；请从临时邮箱后台重新提取该邮箱的 JWT。"
        retryable = False
    elif "temp address requires" in lowered or "missing jwt" in lowered or "缺少 api 地址" in message:
        code = "temp_config_missing"
        hint = "临时邮箱需要同时有邮箱、JWT 和 API 地址；请补齐后再刷新。"
        retryable = False
    elif "临时邮箱 api 返回 http" in lowered or ("http" in lowered and source == "temp" and any(token in lowered for token in ["401", "403", "404", "500"])):
        code = "temp_api_http_error"
        hint = "目标 API 拒绝了本次取信请求；请检查 API 地址、站点密码或该邮箱的 JWT。"
    elif (
        "服务器 dns 解析失败" in message
        or "temporary failure in name resolution" in lowered
        or "name or service not known" in lowered
        or "getaddrinfo failed" in lowered
        or "dns lookup failed" in lowered
    ):
        code = "dns_failed"
        hint = "请求由服务器发起，不是用户浏览器发起；请检查 VPS DNS、代理 DNS 或目标域名是否正确。"
    elif "aadsts9002313" in lowered or "malformed or invalid" in lowered or "invalid_request" in lowered:
        code = "outlook_credential_format"
        hint = "Outlook 导入应为：邮箱----密码----client_id----refresh_token；请确认没有少段、串行或复制到错误字段。"
        retryable = False
    elif "client does not exist" in lowered or "not enabled for consumers" in lowered or "invalid_client" in lowered:
        code = "outlook_client_mismatch"
        hint = "client_id 与 refresh_token 不是同一套，或这个 client_id 不支持个人微软邮箱。"
        retryable = False
    elif "invalid_grant" in lowered or "expired" in lowered or "revoked" in lowered:
        code = "outlook_refresh_expired"
        hint = "Outlook refresh_token 已过期或被撤销，需要重新生成后导入。"
        retryable = False
    elif "graph token failed" in lowered:
        code = "graph_token_failed"
        hint = "Graph 获取访问令牌失败；如果自动模式会继续尝试 IMAP，仍失败时请重建 Outlook OAuth 凭证。"
    elif "imap token failed" in lowered:
        code = "imap_token_failed"
        hint = "IMAP 获取访问令牌失败；请确认 Outlook 凭证支持 IMAP.AccessAsUser.All 或换新凭证。"
    elif "graph:" in lowered:
        code = "graph_fetch_failed"
        hint = "Graph 收信链路失败；自动模式可继续看 IMAP 是否成功。"
    elif "imap:" in lowered:
        code = "imap_fetch_failed"
        hint = "IMAP 收信链路失败；请确认微软邮箱 IMAP 权限和网络可用。"
    elif "unexpected_eof_while_reading" in lowered or "incompleteread" in lowered or "eof occurred" in lowered:
        code = "network_tls_eof"
        hint = "TLS/代理连接中途断开；通常是代理或目标网络不稳定，建议换出口后重试。"
    elif "mail fetch timeout" in lowered or "取信超时" in lowered:
        code = "mail_fetch_timeout"
        hint = "这个邮箱单独取信超时，已跳过并继续处理其它邮箱；请稍后单独重试或检查该邮箱网络/凭证。"
    elif "timed out" in lowered or "connection reset" in lowered or "connection refused" in lowered or "urlopen error" in lowered:
        code = "network_failed"
        hint = "服务器到目标站的网络请求失败；请检查 VPS 网络或代理。"
    return {
        "error_code": code,
        "error_label": MAIL_FETCH_ERROR_LABELS.get(code, "收信失败"),
        "error_hint": hint,
        "retryable": retryable,
        "error_detail": message[:500],
    }


def apply_mail_fetch_result_fields(target: MailAccount | TempAddress, result: dict[str, Any]) -> None:
    target.last_status = "ok" if result.get("ok") else "error"
    target.last_check_at = coerce_text(result.get("checked_at") or iso_now())
    target.last_message_count = int(result.get("message_count") or 0)
    target.last_error = coerce_text(result.get("error") or "")
    target.last_error_code = coerce_text(result.get("error_code") or "")
    target.last_error_label = coerce_text(result.get("error_label") or "")
    target.last_error_hint = coerce_text(result.get("error_hint") or "")


def mail_fetch_error_result(kind: str, target: MailAccount | TempAddress, message: str, *, elapsed_ms: int = 0) -> dict[str, Any]:
    detail = classify_mail_fetch_error(f"{kind}: {message}", kind)
    result = {
        "source": kind,
        "provider": "temp" if kind == "temp" else "auto",
        "email": getattr(target, "email", ""),
        "ok": False,
        "checked_at": iso_now(),
        "elapsed_ms": elapsed_ms,
        "message_count": 0,
        "messages": [],
        "errors": [f"{kind}: {message}"],
        "error": detail["error_detail"],
        "error_code": detail["error_code"],
        "error_label": detail["error_label"],
        "error_hint": detail["error_hint"],
        "retryable": detail["retryable"],
    }
    apply_mail_fetch_result_fields(target, result)
    return result


def fetch_for_account(account: MailAccount, provider: str, limit: int, sender_filter: str) -> dict[str, Any]:
    started = time.perf_counter()
    errors: list[str] = []
    messages: list[dict[str, Any]] = []
    checked_at = iso_now()
    used_provider = ""
    providers = ["imap", "graph", "outlook"] if provider == "auto" else [provider]
    for current in providers:
        try:
            if current == "graph":
                messages = fetch_graph_messages(account, limit=limit, sender_filter=sender_filter)
            elif current == "imap":
                messages = fetch_imap_messages(account, limit=limit, sender_filter=sender_filter)
            elif current == "outlook":
                messages = fetch_outlook_api_messages(account, limit=limit, sender_filter=sender_filter)
            else:
                raise RuntimeError(f"Unsupported provider: {current}")
            account.last_status = "ok"
            account.last_error = ""
            used_provider = current
            break
        except Exception as exc:
            errors.append(f"{current}: {exc}")
            account.last_status = "error"
            account.last_error = str(exc)[:500]
    account.last_check_at = checked_at
    detail = classify_mail_fetch_error("; ".join(errors), "microsoft") if account.last_status != "ok" else {}
    result = {
        "source": "microsoft",
        "provider": used_provider or provider,
        "email": account.email,
        "ok": account.last_status == "ok",
        "checked_at": checked_at,
        "elapsed_ms": round((time.perf_counter() - started) * 1000),
        "message_count": len(messages),
        "messages": messages,
        "errors": errors,
    }
    if detail:
        result.update({
            "error": detail["error_detail"],
            "error_code": detail["error_code"],
            "error_label": detail["error_label"],
            "error_hint": detail["error_hint"],
            "retryable": detail["retryable"],
        })
    apply_mail_fetch_result_fields(account, result)
    return result


def fetch_for_temp_address(address: TempAddress, limit: int, sender_filter: str) -> dict[str, Any]:
    started = time.perf_counter()
    checked_at = iso_now()
    try:
        messages = fetch_temp_messages(address, limit=limit, sender_filter=sender_filter)
        address.last_status = "ok"
        address.last_error = ""
    except Exception as exc:
        messages = []
        address.last_status = "error"
        address.last_error = str(exc)[:500]
    address.last_check_at = checked_at
    detail = classify_mail_fetch_error(address.last_error, "temp") if address.last_status != "ok" else {}
    result = {
        "source": "temp",
        "provider": "temp",
        "email": address.email,
        "ok": address.last_status == "ok",
        "checked_at": checked_at,
        "elapsed_ms": round((time.perf_counter() - started) * 1000),
        "message_count": len(messages),
        "messages": messages,
        "errors": [] if address.last_status == "ok" else [address.last_error],
    }
    if detail:
        result.update({
            "error": detail["error_detail"],
            "error_code": detail["error_code"],
            "error_label": detail["error_label"],
            "error_hint": detail["error_hint"],
            "retryable": detail["retryable"],
        })
    apply_mail_fetch_result_fields(address, result)
    return result


def run_mail_fetch_jobs(jobs: list[tuple[str, MailAccount | TempAddress, str, int, str]]) -> list[dict[str, Any]]:
    if not jobs:
        return []
    results: list[dict[str, Any] | None] = [None] * len(jobs)
    workers = max(1, min(MAIL_FETCH_MAX_CONCURRENCY, len(jobs)))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(fetch_for_account, target, provider, limit, sender_filter)
            if kind == "microsoft"
            else executor.submit(fetch_for_temp_address, target, limit, sender_filter): index
            for index, (kind, target, provider, limit, sender_filter) in enumerate(jobs)
        }
        for future in as_completed(futures):
            index = futures[future]
            try:
                results[index] = future.result()
            except Exception as exc:
                kind, target, *_ = jobs[index]
                results[index] = mail_fetch_error_result(kind, target, str(exc))
    return [result for result in results if result is not None]


def coerce_text(value: Any) -> str:
    return str(value or "").strip()


def parse_nested_json_value(value: Any, depth: int = 4) -> Any:
    current = value
    for _ in range(depth):
        if not isinstance(current, str):
            break
        text = current.strip()
        if not text or text[0] not in "{[\"":
            break
        try:
            current = json.loads(text)
        except json.JSONDecodeError:
            break
    return current


def collect_nested_error_texts(value: Any, texts: list[str] | None = None, depth: int = 0) -> list[str]:
    if texts is None:
        texts = []
    if depth > 6 or len(texts) >= 12:
        return texts
    current = parse_nested_json_value(value)
    if isinstance(current, dict):
        priority = ("detail", "message", "error_description", "error", "status", "body", "raw")
        for key in priority:
            if key in current:
                collect_nested_error_texts(current[key], texts, depth + 1)
        for key, item in current.items():
            if key not in priority:
                collect_nested_error_texts(item, texts, depth + 1)
        return texts
    if isinstance(current, list):
        for item in current[:8]:
            collect_nested_error_texts(item, texts, depth + 1)
        return texts
    text = coerce_text(current)
    if text and text not in texts:
        texts.append(text)
    return texts


def compact_raw_status(value: Any) -> str:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)[:600]
    return coerce_text(value)[:600]


def cpa_status_message(value: Any, status_code: Any = None, action: str = "") -> tuple[str, str]:
    raw_parts = collect_nested_error_texts(value)
    raw_text = first_text(*raw_parts, compact_raw_status(value))
    haystack = " ".join(raw_parts + [coerce_text(status_code), coerce_text(action)]).lower()
    code = coerce_text(status_code)
    if action == "skipped" or "missing auth_index" in haystack:
        message = "缺少 auth_index，无法探测"
    elif "access deactivated" in haystack or "account deactivated" in haystack or "deactivated" in haystack:
        message = "Access Deactivated：账号已停用/封禁"
    elif code == "401" or re.search(r"\b401\b", haystack) or "unauthorized" in haystack:
        message = "授权已失效，需要重新登录"
    elif code == "403" or "forbidden" in haystack:
        message = "CPA 拒绝访问，检查管理密钥或权限"
    elif code == "422" or "unprocessable entity" in haystack:
        message = "CPA 请求参数不完整或格式不对"
    elif "invalid api key" in haystack or ("management" in haystack and "key" in haystack and "invalid" in haystack):
        message = "CPA 管理密钥无效或无权限"
    elif "temporary failure in name resolution" in haystack or "name or service not known" in haystack or "getaddrinfo" in haystack:
        message = "域名解析失败，检查服务器 DNS 或 CPA 地址"
    elif "connection refused" in haystack:
        message = "CPA 接口连接被拒绝，检查地址和端口"
    elif "network unreachable" in haystack:
        message = "网络不可达，检查 VPS 网络或代理"
    elif "timed out" in haystack or "timeout" in haystack:
        message = "CPA 请求超时"
    elif "missing status_code" in haystack:
        message = "CPA 探测没有返回状态码"
    elif "non-json" in haystack:
        message = "CPA 接口返回非 JSON"
    elif code:
        message = f"HTTP {code}"
    else:
        message = raw_text[:180] if raw_text else "-"
    return message, raw_text


def is_private_host(hostname: str) -> bool:
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        return hostname.lower() in {"localhost"}
    return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast


def is_loopback_host(hostname: str) -> bool:
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        return hostname.lower() in {"localhost"}
    return ip.is_loopback


def validate_remote_base_url(base_url: str) -> None:
    parsed = urllib.parse.urlparse(base_url)
    if parsed.scheme not in {"http", "https"}:
        raise RuntimeError("base_url must use http or https")
    hostname = parsed.hostname or ""
    if not hostname:
        raise RuntimeError("base_url host missing")
    if ALLOW_PRIVATE_URLS:
        return
    if is_private_host(hostname):
        raise RuntimeError("private or local base_url is blocked")
    try:
        infos = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except OSError:
        return
    for info in infos:
        address = info[4][0]
        try:
            ip = ipaddress.ip_address(address)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise RuntimeError("private or local base_url is blocked")


def validate_configured_base_url(base_url: str) -> None:
    parsed = urllib.parse.urlparse(base_url)
    if parsed.scheme not in {"http", "https"}:
        raise RuntimeError("configured temp worker URL must use http or https")
    if not parsed.hostname:
        raise RuntimeError("configured temp worker URL host missing")


def validate_cpa_base_url(base_url: str) -> None:
    parsed = urllib.parse.urlparse(base_url)
    if parsed.scheme not in {"http", "https"}:
        raise RuntimeError("CPA 地址必须使用 http 或 https")
    hostname = parsed.hostname or ""
    if not hostname:
        raise RuntimeError("CPA 地址缺少主机名")
    if CPA_ALLOW_REMOTE or is_loopback_host(hostname):
        return
    if is_private_host(hostname):
        raise RuntimeError("CPA 内网地址默认关闭；如需访问内网 CPA，请设置 MAIL_PICKUP_CPA_ALLOW_REMOTE=1")
    try:
        infos = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except OSError:
        return
    for info in infos:
        address = info[4][0]
        if is_private_host(address):
            raise RuntimeError("CPA 地址解析到内网地址；如需访问内网 CPA，请设置 MAIL_PICKUP_CPA_ALLOW_REMOTE=1")


def normalize_proxy_url(value: str) -> str:
    raw = coerce_text(value)
    if not raw or raw.lower() in {"none", "direct", "off", "false", "0", "no_proxy", "noproxy"}:
        return ""
    if not re.match(r"^[a-z][a-z0-9+.-]*://", raw, flags=re.I):
        raw = f"http://{raw}"
    parsed = urllib.parse.urlparse(raw)
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https", "socks4", "socks5", "socks5h"}:
        raise RuntimeError("代理只支持 http/https/socks4/socks5/socks5h")
    try:
        port = parsed.port
    except ValueError as exc:
        if "@" not in parsed.netloc and parsed.netloc.count(":") >= 3:
            raise RuntimeError("代理格式错误：请使用 http://用户名:密码@host:port，不能写成 http://host:port:用户名:密码") from exc
        raise RuntimeError("代理端口格式错误：端口必须是数字。正确格式是 http://用户名:密码@host:port") from exc
    if not parsed.hostname or not port:
        raise RuntimeError("代理地址需要包含主机和端口。正确格式是 http://用户名:密码@host:port")
    return raw


def sticky_proxy_url(proxy_url: str, job_id: str = "") -> str:
    raw = coerce_text(proxy_url)
    if not raw:
        return ""
    session_id = re.sub(r"[^a-zA-Z0-9]", "", job_id or uuid.uuid4().hex)[:12] or uuid.uuid4().hex[:12]
    for marker in ("{session}", "{SESSION}", "{{session}}", "{{SESSION}}", "$SESSION"):
        if marker in raw:
            raw = raw.replace(marker, session_id)
    parsed = urllib.parse.urlparse(raw)
    username = urllib.parse.unquote(parsed.username or "")
    if (
        parsed.scheme.lower() in {"http", "https"}
        and parsed.hostname
        and parsed.port
        and "rrp.bestgo.work" in parsed.hostname.lower()
        and "-session-" not in username
    ):
        username = f"{username}-session-{session_id}" if username else f"session-{session_id}"
        netloc = urllib.parse.quote(username, safe="-._~")
        if parsed.password is not None:
            netloc += f":{urllib.parse.quote(urllib.parse.unquote(parsed.password), safe='')}"
        netloc += f"@{parsed.hostname}:{parsed.port}"
        return urllib.parse.urlunparse((parsed.scheme, netloc, parsed.path, parsed.params, parsed.query, parsed.fragment))
    return raw


def socks_dependency_error() -> RuntimeError:
    return RuntimeError("SOCKS 代理需要安装 PySocks：sudo apt-get install -y python3-socks")


def request_proxy_url(payload: dict[str, Any] | None = None) -> str:
    payload = payload or {}
    enabled = bool(payload.get("use_proxy") or payload.get("useProxy"))
    raw = coerce_text(payload.get("proxy_url") or payload.get("proxyUrl"))
    if not enabled and not raw:
        return ""
    if enabled and not raw:
        raw = first_text(
            os.environ.get("HTTPS_PROXY"),
            os.environ.get("HTTP_PROXY"),
            os.environ.get("ALL_PROXY"),
        )
    return sticky_proxy_url(normalize_proxy_url(raw), coerce_text(
        payload.get("proxy_session")
        or payload.get("proxySession")
        or payload.get("job_id")
        or payload.get("jobId")
    ))


def require_login_proxy_url(payload: dict[str, Any]) -> str:
    raw = coerce_text(payload.get("proxy_url") or payload.get("proxyUrl"))
    if not raw:
        raise RuntimeError("凭证刷新必须填写代理 URL")
    payload["use_proxy"] = True
    payload["proxy_url"] = raw
    return request_proxy_url(payload)


def proxy_opener(proxy_url: str) -> urllib.request.OpenerDirector:
    parsed = urllib.parse.urlparse(proxy_url)
    scheme = parsed.scheme.lower()
    if scheme in {"http", "https"}:
        return urllib.request.build_opener(urllib.request.ProxyHandler({
            "http": proxy_url,
            "https": proxy_url,
        }))
    try:
        import socks  # type: ignore
        import sockshandler  # type: ignore
    except Exception as exc:
        raise socks_dependency_error() from exc
    proxy_type = socks.SOCKS4 if scheme == "socks4" else socks.SOCKS5
    rdns = scheme == "socks5h"
    opener = urllib.request.build_opener(sockshandler.SocksiPyHandler(
        proxy_type,
        parsed.hostname,
        parsed.port,
        rdns,
        parsed.username,
        parsed.password,
    ))
    return opener


def playwright_proxy_options(proxy_url: str) -> dict[str, str]:
    parsed = urllib.parse.urlparse(proxy_url)
    scheme = "socks5" if parsed.scheme.lower() == "socks5h" else parsed.scheme.lower()
    host = parsed.hostname or ""
    port = parsed.port
    if not host or not port:
        raise RuntimeError("代理地址需要包含主机和端口")
    options = {"server": f"{scheme}://{host}:{port}"}
    if parsed.username:
        options["username"] = urllib.parse.unquote(parsed.username)
    if parsed.password:
        options["password"] = urllib.parse.unquote(parsed.password)
    return options


@contextlib.contextmanager
def temporary_socket_proxy(proxy_url: str):
    if not proxy_url:
        yield
        return
    parsed = urllib.parse.urlparse(proxy_url)
    scheme = parsed.scheme.lower()
    if scheme not in {"socks4", "socks5", "socks5h"}:
        yield
        return
    try:
        import socks  # type: ignore
    except Exception as exc:
        raise socks_dependency_error() from exc
    proxy_type = socks.SOCKS4 if scheme == "socks4" else socks.SOCKS5
    original_socket = socket.socket
    original_default = socks.get_default_proxy()
    socks.set_default_proxy(
        proxy_type,
        parsed.hostname,
        parsed.port,
        rdns=scheme == "socks5h",
        username=urllib.parse.unquote(parsed.username) if parsed.username else None,
        password=urllib.parse.unquote(parsed.password) if parsed.password else None,
    )
    socket.socket = socks.socksocket
    try:
        yield
    finally:
        socket.socket = original_socket
        if original_default:
            socks.set_default_proxy(*original_default)
        else:
            socks.set_default_proxy()


def http_request_json(
    url: str,
    *,
    method: str = "GET",
    json_data: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 30,
    proxy_url: str = "",
) -> dict[str, Any]:
    body = None
    final_headers = dict(DEFAULT_HTTP_HEADERS)
    if headers:
        final_headers.update(headers)
    if json_data is not None:
        body = json.dumps(json_data, ensure_ascii=False).encode("utf-8")
        final_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=final_headers, method=method)
    try:
        opener = proxy_opener(proxy_url) if proxy_url else None
        open_call = opener.open if opener else urllib.request.urlopen
        with temporary_socket_proxy(proxy_url), open_with_fast_dns(open_call, req, timeout=timeout, use_cache=not bool(proxy_url)) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw.strip():
                return {"status": "ok"}
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {"body": raw}
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = {"error": text}
        message = payload.get("detail") or payload.get("error_description") or payload.get("error") or text
        raise RuntimeError(f"HTTP {exc.code}: {str(message)[:260]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(network_error_message(url, exc)) from exc


def probe_egress_trace(proxy_url: str = "") -> dict[str, str]:
    url = "https://www.cloudflare.com/cdn-cgi/trace"
    req = urllib.request.Request(url, headers=DEFAULT_HTTP_HEADERS, method="GET")
    opener = proxy_opener(proxy_url) if proxy_url else None
    open_call = opener.open if opener else urllib.request.urlopen
    with temporary_socket_proxy(proxy_url), open_with_fast_dns(open_call, req, timeout=12, use_cache=not bool(proxy_url)) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    data: dict[str, str] = {}
    for line in raw.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip()
    return data


def check_proxy_egress(payload: dict[str, Any]) -> dict[str, Any]:
    proxy_url = require_login_proxy_url(dict(payload))
    trace = probe_egress_trace(proxy_url)
    ip = coerce_text(trace.get("ip"))
    if not ip:
        raise RuntimeError("代理出口检测失败：没有返回出口 IP")
    return {
        "success": True,
        "ip": ip,
        "loc": coerce_text(trace.get("loc")),
        "colo": coerce_text(trace.get("colo")),
        "proxy_session": coerce_text(payload.get("proxy_session") or payload.get("proxySession")),
    }


def http_request_form_json(
    url: str,
    *,
    method: str = "POST",
    form_data: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 30,
    proxy_url: str = "",
) -> tuple[int, dict[str, Any], str]:
    body = urllib.parse.urlencode(form_data or {}).encode("utf-8")
    final_headers = dict(DEFAULT_HTTP_HEADERS)
    final_headers["Content-Type"] = "application/x-www-form-urlencoded"
    if headers:
        final_headers.update(headers)
    req = urllib.request.Request(url, data=body, headers=final_headers, method=method)
    try:
        opener = proxy_opener(proxy_url) if proxy_url else None
        open_call = opener.open if opener else urllib.request.urlopen
        with temporary_socket_proxy(proxy_url), open_with_fast_dns(open_call, req, timeout=timeout, use_cache=not bool(proxy_url)) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw) if raw.strip() else {}
            except json.JSONDecodeError:
                payload = {"raw": raw}
            return int(resp.status), payload if isinstance(payload, dict) else {"data": payload}, raw
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            payload = {"raw": raw}
        return int(exc.code), payload if isinstance(payload, dict) else {"data": payload}, raw
    except urllib.error.URLError as exc:
        raise RuntimeError(network_error_message(url, exc)) from exc


def http_get_json_status(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: int = 30,
    proxy_url: str = "",
) -> tuple[int, dict[str, Any], str]:
    final_headers = dict(DEFAULT_HTTP_HEADERS)
    if headers:
        final_headers.update(headers)
    req = urllib.request.Request(url, headers=final_headers, method="GET")
    try:
        opener = proxy_opener(proxy_url) if proxy_url else None
        open_call = opener.open if opener else urllib.request.urlopen
        with temporary_socket_proxy(proxy_url), open_with_fast_dns(open_call, req, timeout=timeout, use_cache=not bool(proxy_url)) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw) if raw.strip() else {}
            except json.JSONDecodeError:
                payload = {"raw": raw}
            return int(resp.status), payload if isinstance(payload, dict) else {"data": payload}, raw
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            payload = {"raw": raw}
        return int(exc.code), payload if isinstance(payload, dict) else {"data": payload}, raw
    except urllib.error.URLError as exc:
        raise RuntimeError(network_error_message(url, exc)) from exc


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        return None


class LoginFlowError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        code: str = "login_failed",
        hint: str = "",
        status: int | None = None,
        retryable: bool = True,
    ):
        super().__init__(message)
        self.code = code
        self.hint = hint
        self.status = status
        self.retryable = retryable


def openai_turnstile_error(hint: str = "") -> LoginFlowError:
    detail = coerce_text(hint).strip()
    message = "OpenAI 登录入口停在人机验证页，邮箱验证码尚未发送。"
    if detail:
        message = f"{message} 当前页面：{detail[:220]}"
    return LoginFlowError(
        message,
        code="openai_turnstile_challenge",
        hint="协议登录还没有进入邮箱输入/验证码阶段，也没有发码请求。请检查当前 CPA OAuth 授权入口、代理出口和 auth.openai.com 会话状态。",
        retryable=True,
    )


@dataclass
class ProtocolResponse:
    status: int
    url: str
    headers: Any
    text: str

    def json(self) -> dict[str, Any]:
        if not self.text.strip():
            return {}
        try:
            data = json.loads(self.text)
        except json.JSONDecodeError:
            return {"raw": self.text[:5000]}
        return data if isinstance(data, dict) else {"data": data}

    def location(self) -> str:
        return self.headers.get("Location") or self.headers.get("location") or ""


def read_response_text(resp: Any) -> tuple[str, bool]:
    try:
        return resp.read().decode("utf-8", errors="replace"), False
    except http.client.IncompleteRead as exc:
        partial = exc.partial or b""
        return partial.decode("utf-8", errors="replace"), True


def protocol_compact_error(data: Any) -> str:
    def auth_block_hint(value: str) -> str:
        if "Unable to load site" not in value and "using a VPN" not in value:
            return ""
        ip_match = re.search(r"\[IP:([^\]|]+)", value)
        ray_match = re.search(r"Ray ID:([a-zA-Z0-9]+)", value)
        suffix = []
        if ip_match:
            suffix.append(f"IP {ip_match.group(1).strip()}")
        if ray_match:
            suffix.append(f"Ray {ray_match.group(1).strip()}")
        extra = f" ({', '.join(suffix)})" if suffix else ""
        return f"OpenAI 登录端点拒绝了当前服务器/IP。协议登录不会自动切换其他方案，请换出口 IP 或配置稳定代理后重试。{extra}"

    if not data:
        return "empty response"
    if isinstance(data, str):
        hint = auth_block_hint(data)
        if hint:
            return hint
        if looks_like_html_challenge(data):
            return html_challenge_hint(data)
        clean = strip_html(data).strip()
        return (clean or data)[:260]
    if isinstance(data, dict):
        raw = coerce_text(data.get("raw"))
        if raw:
            hint = auth_block_hint(raw)
            if hint:
                return hint
            if looks_like_html_challenge(raw):
                return html_challenge_hint(raw)
            clean = strip_html(raw).strip()
        err = data.get("error")
        if isinstance(err, str):
            if looks_like_html_challenge(err):
                return html_challenge_hint(err)
            return err[:260]
        if isinstance(err, dict):
            parts = [err.get("message"), err.get("code"), err.get("type")]
            return " / ".join(str(item) for item in parts if item)[:260] or json.dumps(err, ensure_ascii=False)[:260]
        for key in ("message", "detail", "error_description", "raw"):
            if data.get(key):
                value = str(data.get(key))
                hint = auth_block_hint(value)
                if hint:
                    return hint
                if looks_like_html_challenge(value):
                    return html_challenge_hint(value)
                clean = strip_html(value).strip()
                return (clean or value)[:260]
    try:
        return json.dumps(data, ensure_ascii=False)[:260]
    except Exception:
        return str(data)[:260]


def looks_like_html_challenge(value: str) -> bool:
    text = coerce_text(value)
    if not text:
        return False
    lowered = text.lower()
    return bool(
        "<html" in lowered
        or "<body" in lowered
        or "body{font-family" in lowered
        or "cf-ray" in lowered
        or "cloudflare" in lowered
        or "csrf request failed" in lowered
        or "could not validate your token" in lowered
        or "access denied" in lowered
        or "unable to load site" in lowered
    )


def html_challenge_hint(value: str) -> str:
    clean = re.sub(r"<style.*?</style>", " ", value, flags=re.I | re.S)
    clean = re.sub(r"<script.*?</script>", " ", clean, flags=re.I | re.S)
    clean = strip_html(clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    lowered = value.lower()
    if "body{font-family" in lowered or "@keyframes" in lowered or ".container{" in lowered:
        return "ChatGPT 登录入口返回了风控/拒绝页。当前 VPS 或代理出口被目标站拦截，请更换稳定代理或干净出口后重试。"
    if "csrf request failed" in lowered or "could not validate your token" in lowered:
        return "CSRF 校验失败：登录会话的 cookie/state/token 不匹配或已失效。请保持同一代理出口后重试协议登录。"
    if "cloudflare" in lowered or "cf-ray" in lowered or "access denied" in lowered:
        return "目标站点返回了风控/Cloudflare 拒绝页。协议登录不会自动切换其他方案，请换干净出口 IP 或稳定代理后重试。"
    if "unable to load site" in lowered or "using a vpn" in lowered:
        return "目标站点拒绝当前网络出口。请换 VPS 出口 IP 或使用稳定代理。"
    return clean[:260] or "目标站点返回 HTML 拒绝页，未返回可用 JSON。"


def classify_login_exception(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, LoginFlowError):
        return {
            "message": str(exc),
            "code": exc.code,
            "hint": exc.hint,
            "status": exc.status,
            "retryable": exc.retryable,
        }
    message = str(exc)
    lowered = message.lower()
    code = "login_failed"
    hint = ""
    retryable = True
    status = None
    match = re.search(r"http\s+(\d{3})", lowered)
    if match:
        try:
            status = int(match.group(1))
        except ValueError:
            status = None
    if (
        "凭证刷新必须填写代理" in message
        or "proxy required" in lowered
    ):
        return {
            "message": "凭证刷新必须填写代理 URL",
            "code": "proxy_required",
            "hint": "示例：http://USER:PASS@host:port 或 socks5://USER:PASS@host:port；VPS 部署时要填 VPS 能访问到的代理地址。",
            "status": status,
            "retryable": False,
        }
    if (
        "代理格式错误" in message
        or "代理端口格式错误" in message
        or "port could not be cast" in lowered
        or "failed to parse" in lowered and "proxy" in lowered
    ):
        code = "proxy_format_invalid"
        message = "代理格式错误：请使用 http://用户名:密码@host:port，不能写成 http://host:port:用户名:密码。"
        hint = "例如：http://USER:PASS@us.rrp.bestgo.work:10000；如果用 SOCKS，则写 socks5://USER:PASS@host:port。"
        retryable = False
        return {
            "message": message,
            "code": code,
            "hint": hint,
            "status": status,
            "retryable": retryable,
        }
    if (
        "服务器 dns 解析失败" in lowered
        or "temporary failure in name resolution" in lowered
        or "name or service not known" in lowered
        or "getaddrinfo failed" in lowered
    ):
        return {
            "message": "DNS 解析失败：VPS 或代理无法解析目标域名。",
            "code": "dns_failed",
            "hint": "这是网络基础问题，不是账号或邮箱问题。请检查 VPS DNS、代理 DNS 转发，或更换可解析 auth.openai.com / chatgpt.com 的代理出口。",
            "status": status,
            "retryable": True,
        }
    if (
        "unexpected_eof_while_reading" in lowered
        or "eof occurred in violation of protocol" in lowered
        or "代理 tls 连接被中断" in lowered
    ):
        return {
            "message": "代理 TLS 中断：代理出口没有稳定完成 HTTPS 握手。",
            "code": "proxy_tls_eof",
            "hint": "这不是账号失败，也不是邮箱收不到码；是代理到目标站的 TLS 连接被截断。请换代理出口，或检查代理协议/账号是否稳定。",
            "status": status,
            "retryable": True,
        }
    if (
        "代理连接超时" in lowered
        or "timed out" in lowered
        or "timeout" in lowered
        or "winerror 10060" in lowered
        or "没有正确答复" in message
        or "连接尝试失败" in message
    ):
        return {
            "message": "代理超时：代理出口响应太慢或不可用。",
            "code": "proxy_timeout",
            "hint": "请更换更稳定的代理，或降低批量数量后重试。",
            "status": status,
            "retryable": True,
        }
    if (
        "代理连接失败" in lowered
        or "connection reset" in lowered
        or "connection refused" in lowered
        or "remote end closed connection" in lowered
        or "without response" in lowered
        or "tunnel connection failed" in lowered
        or "cannot connect to proxy" in lowered
        or "proxy error" in lowered
        or "socks" in lowered and ("failed" in lowered or "error" in lowered)
    ):
        return {
            "message": "代理连接失败：当前代理出口不可用或被目标站断开。",
            "code": "proxy_connection_failed",
            "hint": "请确认代理 URL、用户名密码、协议类型正确，并更换稳定出口后重试。",
            "status": status,
            "retryable": True,
        }
    if "invalid_auth_step" in lowered or "invalid authorization step" in lowered:
        code = "oauth_invalid_auth_step"
        message = "OpenAI OAuth 步骤状态不匹配：授权会话还没有进入可提交邮箱的步骤。"
        hint = "这不是邮箱收信问题；请使用当前版本重新执行。若仍出现，请保留前面的 OAuth 跳转日志，用来确认是否继续跟随了 continue_url。"
        retryable = True
        return {
            "message": message,
            "code": code,
            "hint": hint,
            "status": status,
            "retryable": retryable,
        }
    if "did not return callback code" in lowered or "no continue url returned" in lowered or "没有返回可继续的 oauth 地址" in lowered:
        if any(marker in lowered for marker in [
            "phone_otp",
            "phone-otp",
            "phone verification",
            "phone-verification",
            "select-channel",
            "mfa",
            "sms",
            "手机",
        ]):
            return {
                "message": "手机二次验证未完成，已按失败处理。",
                "code": "phone_2fa_failed",
                "hint": "邮箱验证码已经通过，但 OAuth 后续进入了手机短信二次验证；需要长效手机 API 或手动输入本轮短信验证码。",
                "status": status,
                "retryable": False,
            }
        return {
            "message": "OAuth 授权回调未完成，已按失败处理。",
            "code": "oauth_callback_missing",
            "hint": "邮箱验证码已经提交，但授权链路没有拿到 callback code。通常是代理会话中途失效、账号进入额外验证，或授权页面没有继续跳转。",
            "status": status,
            "retryable": True,
        }
    if "unauthorized" in lowered or status == 401:
        return {
            "message": "授权失败或凭证已失效，已按失败处理。",
            "code": "authorization_failed",
            "hint": "目标接口返回 Unauthorized。请检查 CPA 管理密钥、OAuth 授权会话或已保存凭证是否已失效。",
            "status": status,
            "retryable": True,
        }
    if (
        "mfa_required" in lowered
        or "phone_2fa" in lowered
        or "two-factor" in lowered
        or "second factor" in lowered
        or "phone verification" in lowered
        or "phone number" in lowered
        or "mobile" in lowered
        or "手机号" in message
        or "手机验证" in message
        or "二次验证" in message
        or "接码" in message
    ):
        return {
            "message": "手机二次验证失败，已按失败处理。",
            "code": "phone_2fa_failed",
            "hint": "账号进入了手机二次验证，但没有完成短信验证码校验。请绑定长效手机 API，或在任务运行时手动输入手机验证码后重试。",
            "status": status,
            "retryable": False,
        }
    if (
        "deactivated" in lowered
        or "account disabled" in lowered
        or "disabled account" in lowered
        or "banned" in lowered
        or "suspended" in lowered
        or "deleted account" in lowered
        or "account deleted" in lowered
        or "账号被封" in message
        or "账号封禁" in message
        or "账号停用" in message
        or "已停用" in message
        or "被禁用" in message
    ):
        return {
            "message": "账号被封禁或停用，已按失败处理。",
            "code": "account_banned",
            "hint": "目标站返回账号停用/封禁/禁用信号，这类账号不再继续自动刷新。",
            "status": status,
            "retryable": False,
        }
    if (
        "invalid verification code" in lowered
        or "invalid email code" in lowered
        or "invalid otp" in lowered
        or "incorrect code" in lowered
        or "code expired" in lowered
        or "expired code" in lowered
        or "email code verify failed" in lowered
        or "验证码无效" in message
        or "验证码错误" in message
        or "验证码已过期" in message
        or "验证码过期" in message
    ):
        return {
            "message": "验证码无效或已过期，已按失败处理。",
            "code": "verification_code_invalid",
            "hint": "已经进入邮箱验证码阶段，但提交的验证码被目标站拒绝；通常是验证码过期、重复使用或邮箱里取到旧码。",
            "status": status,
            "retryable": True,
        }
    if (
        "user not found" in lowered
        or "account not found" in lowered
        or "no account" in lowered
        or "账号不存在" in message
        or "账户不存在" in message
    ):
        return {
            "message": "账号不存在或未注册，已按失败处理。",
            "code": "account_not_found",
            "hint": "目标站没有识别出这个邮箱对应的登录账号。",
            "status": status,
            "retryable": False,
        }
    if (
        "openai_turnstile_challenge" in lowered
        or "人机验证页" in message
        or "turnstile" in lowered
        or "performing security verification" in lowered
        or "protect against malicious bots" in lowered
    ):
        code = "openai_turnstile_challenge"
        hint = "当前真实浏览器被 OpenAI/Cloudflare 人机验证拦住，邮箱验证码尚未发送；请查看页面快照。自动查邮箱只有在出现验证码输入框或捕捉到发码请求后才会开始。"
        retryable = True
        return {
            "message": message[:800],
            "code": code,
            "hint": hint,
            "status": status,
            "retryable": retryable,
        }
    if "还没有发送验证码" in message or "没有渲染出邮箱输入框" in message:
        code = "login_page_not_ready"
        hint = "OpenAI 登录页还没有进入可发送邮箱验证码的状态；请查看页面快照确认是空白加载、安全验证，还是代理出口拦截。"
        retryable = True
        return {
            "message": message[:800],
            "code": code,
            "hint": hint,
            "status": status,
            "retryable": retryable,
        }
    if "安全验证页" in message or "没有进入邮箱验证码页" in message:
        code = "openai_security_verification"
        hint = "OpenAI 登录入口还停在安全验证页，没有发送邮箱验证码。协议登录不会自动切换其他方案，请更换可通过 auth.openai.com 安全验证的出口后重试。"
        retryable = True
        return {
            "message": "OpenAI 登录入口停在安全验证页，没有发送邮箱验证码。",
            "code": code,
            "hint": hint,
            "status": status,
            "retryable": retryable,
        }
    if "openai 登录邮箱提交接口被当前" in message or "未进入邮箱验证码页" in message:
        code = "openai_auth_risk_blocked"
        hint = "OpenAI 登录页在提交邮箱时返回风控/拒绝页；请更换能通过 auth.openai.com 的代理或出口后重试。"
        retryable = True
        return {
            "message": message[:800],
            "code": code,
            "hint": hint,
            "status": status,
            "retryable": retryable,
        }
    if "csrf" in lowered or "could not validate your token" in lowered:
        code = "csrf_or_risk_blocked"
        if looks_like_html_challenge(message):
            message = html_challenge_hint(message)
        hint = "ChatGPT 拒绝了当前服务端出口。请使用 VPS 可访问的稳定代理后重试；如果是 socks5://，VPS 还需要安装 PySocks。"
    elif "cloudflare" in lowered or "access denied" in lowered or "unable to load site" in lowered or "vpn" in lowered:
        code = "risk_blocked"
        if looks_like_html_challenge(message):
            message = html_challenge_hint(message)
        hint = "目标站点拒绝当前网络出口。协议登录不会自动切换其他方案，请更换干净代理或 VPS 出口后重试。"
    elif "unsupported_country_region_territory" in lowered or "country, region, or territory not supported" in lowered:
        code = "unsupported_country_region_territory"
        message = "OpenAI OAuth 拒绝当前后端出口：所在国家/地区不受支持。"
        hint = "这一步还没有到邮箱验证码，也不是邮箱/JWT问题。请看“当前后端出口”日志，换成 OpenAI 支持地区的 HTTP 代理或 VPS 出口后重试。"
    elif "err_connection_closed" in lowered or "connection closed" in lowered or "net::err" in lowered:
        code = "login_network_blocked"
        message = "ChatGPT 登录入口连接被中途断开，当前 VPS/代理出口没有稳定打开登录页。"
        hint = "这一步还没到邮箱验证码；请换一个 VPS 能直连的代理出口，再重试浏览器验证码模式。"
    elif "incompleteread" in lowered or "incomplete read" in lowered or "响应没有读完整" in message:
        code = "network_incomplete_read"
        message = "代理或目标站连接中途断开，响应没有读完整。请重试；如果连续出现，请更换更稳定的代理出口。"
        hint = "这不是邮箱收不到验证码，而是 ChatGPT 登录请求的网络连接被截断。"
    elif (
        "没安装 playwright" in message
        or "缺少 playwright" in message
        or "vps 还没安装 playwright" in message.lower()
        or "browserType.launch" in message
        or "executable doesn't exist" in lowered
        or "chromium" in lowered
    ):
        code = "playwright_unavailable"
        hint = "服务器缺少 Playwright/Chromium，安装后才能走浏览器登录。"
        retryable = False
    elif "playwright" in lowered:
        code = "playwright_login_failed"
        hint = "浏览器登录已经启动，但没有走到可提交验证码的页面。请检查代理出口是否稳定、账号是否被要求额外验证。"
    elif "password" in lowered or "密码" in message:
        code = "password_or_login_failed"
        hint = "请确认导入的是 OpenAI 登录密码，不是邮箱客户端密钥。"
    elif "verification code" in lowered or "验证码" in message:
        code = "verification_code_missing"
        hint = "登录已进入验证码阶段，但本地邮箱没有取到新验证码。请先确认邮箱同步可收信。"
    return {
        "message": message[:800],
        "code": code,
        "hint": hint,
        "status": status,
        "retryable": retryable,
    }


class ChatGPTProtocolLogin:
    def __init__(self, job_id: str, payload: dict[str, Any]):
        self.job_id = job_id
        self.payload = payload
        self.proxy_url = request_proxy_url(payload)
        self.cookie_jar = http.cookiejar.CookieJar()
        handlers: list[Any] = [
            urllib.request.HTTPCookieProcessor(self.cookie_jar),
            NoRedirectHandler(),
        ]
        if self.proxy_url and urllib.parse.urlparse(self.proxy_url).scheme.lower() in {"http", "https"}:
            handlers.append(urllib.request.ProxyHandler({
                "http": self.proxy_url,
                "https": self.proxy_url,
            }))
        elif not self.proxy_url:
            handlers.append(urllib.request.ProxyHandler({}))
        self.opener = urllib.request.build_opener(
            *handlers,
        )
        self.auth_url = ""
        self.login_url = ""
        self.state = ""
        self.device_id = ""
        self.sentinel_token = ""
        self.oauth_state = ""
        self.oauth_code_verifier = ""
        self.oauth_redirect_uri = OPENAI_OAUTH_REDIRECT_URI
        self.oauth_client_id = OPENAI_CODEX_CLIENT_ID
        self.oauth_authorize_url = ""
        self.oauth_authorize_source = "local"
        self.oauth_cpa_state = ""

    def log(self, step: str, message: str, level: str = "info") -> None:
        append_login_log(self.job_id, message, level, step)

    def trace_headers(self) -> dict[str, str]:
        parent_id = secrets.randbits(63) or 1
        return {
            "traceparent": f"00-{secrets.token_hex(16)}-{parent_id:016x}-01",
            "tracestate": "dd=s:1;o:rum",
            "x-datadog-origin": "rum",
            "x-datadog-parent-id": str(parent_id),
            "x-datadog-sampling-priority": "1",
            "x-datadog-trace-id": str(secrets.randbits(63) or 1),
        }

    def headers(self, url: str, extra: dict[str, str] | None = None) -> dict[str, str]:
        parsed = urllib.parse.urlparse(url)
        path = parsed.path or ""
        accept = "application/json"
        if extra and extra.get("Accept"):
            accept = extra["Accept"]
        is_navigation = "text/html" in accept
        final_headers = {
            "User-Agent": DEFAULT_HTTP_HEADERS["User-Agent"],
            "Accept": accept,
            "Accept-Language": "en-US,en;q=0.9",
            "sec-ch-ua": OPENAI_SEC_CH_UA,
            "sec-ch-ua-arch": '"x86_64"',
            "sec-ch-ua-bitness": '"64"',
            "sec-ch-ua-full-version-list": OPENAI_SEC_CH_UA_FULL_VERSION_LIST,
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-model": '""',
            "sec-ch-ua-platform": '"Windows"',
            "sec-ch-ua-platform-version": '"10.0.0"',
            "sec-fetch-dest": "document" if is_navigation else "empty",
            "sec-fetch-mode": "navigate" if is_navigation else "cors",
            "sec-fetch-site": "same-origin",
            "oai-device-id": self.device_id or "",
        }
        if is_navigation:
            final_headers["sec-fetch-user"] = "?1"
        else:
            final_headers.update(self.trace_headers())
            final_headers.setdefault("Origin", f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else "https://auth.openai.com")
            if path.startswith("/api/") or "/api/" in path:
                final_headers.setdefault("Content-Type", "application/json")
        if not final_headers["oai-device-id"]:
            final_headers.pop("oai-device-id", None)
        if extra:
            final_headers.update(extra)
        return final_headers

    def request(
        self,
        url: str,
        *,
        method: str = "GET",
        json_data: dict[str, Any] | None = None,
        form_data: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int = 60,
    ) -> ProtocolResponse:
        body = None
        final_headers = dict(headers or {})
        if json_data is not None:
            body = json.dumps(json_data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            final_headers.setdefault("Content-Type", "application/json")
        elif form_data is not None:
            body = urllib.parse.urlencode(form_data).encode("utf-8")
            final_headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
        req = urllib.request.Request(url, data=body, headers=final_headers, method=method)
        last_incomplete = ""
        attempts = 3 if self.proxy_url else 2
        for attempt in range(attempts):
            try:
                with temporary_socket_proxy(self.proxy_url), open_with_fast_dns(self.opener.open, req, timeout=timeout, use_cache=not bool(self.proxy_url)) as resp:
                    self.cookie_jar.extract_cookies(resp, req)
                    raw, incomplete = read_response_text(resp)
                    if incomplete and attempt + 1 < attempts:
                        last_incomplete = raw
                        time.sleep(0.6 + attempt * 0.7)
                        continue
                    if incomplete:
                        raise RuntimeError("代理或目标站连接中途断开，响应没有读完整。请重试；如果连续出现，请更换更稳定的代理出口。")
                    return ProtocolResponse(int(resp.status), resp.geturl(), resp.headers, raw)
            except urllib.error.HTTPError as exc:
                try:
                    self.cookie_jar.extract_cookies(exc, req)
                except Exception:
                    pass
                raw, incomplete = read_response_text(exc)
                if incomplete and attempt + 1 < attempts:
                    last_incomplete = raw
                    time.sleep(0.6 + attempt * 0.7)
                    continue
                return ProtocolResponse(int(exc.code), exc.geturl(), exc.headers, raw)
            except http.client.IncompleteRead:
                if attempt + 1 < attempts:
                    time.sleep(0.6 + attempt * 0.7)
                    continue
                raise RuntimeError("代理或目标站连接中途断开，响应没有读完整。请重试；如果连续出现，请更换更稳定的代理出口。")
            except urllib.error.URLError as exc:
                raise RuntimeError(f"network error: {network_error_message(url, exc)}") from exc
        raise RuntimeError(last_incomplete or "代理或目标站连接中途断开，响应没有读完整。")

    def login(self) -> dict[str, Any]:
        email_addr = coerce_text(self.payload.get("email"))
        password = coerce_text(self.payload.get("password"))
        force_email_code = str(first_text(
            self.payload.get("force_email_code"),
            self.payload.get("forceEmailCode"),
            self.payload.get("email_code_login"),
            self.payload.get("emailCodeLogin"),
        )).lower() in {"1", "true", "yes", "on"}
        if force_email_code:
            password = ""
        if not email_addr:
            raise RuntimeError("protocol login needs email")

        self.device_id = self.device_id or uuid.uuid4().hex
        self.set_cookie("oai-did", self.device_id, "auth.openai.com")
        self.set_cookie("oai-did", self.device_id, ".auth.openai.com")
        self.set_cookie("oai-did", self.device_id, "chatgpt.com")
        self.set_cookie("oai-did", self.device_id, ".chatgpt.com")

        self.log("oauth_init", "后端协议：生成 OpenAI OAuth 授权会话")
        self.auth_url = self.prepare_oauth_authorize_url()
        self.log("authorize", "后端协议：打开 OAuth 授权入口并建立 login_session")
        login_state = self.bootstrap_oauth_session(self.auth_url)
        if not login_state.get("ok"):
            raw_error = login_state.get("error") or "OAuth 授权入口没有建立 auth.openai.com 登录会话。"
            raw_hint = login_state.get("hint") or "CPA 已返回授权链接，但协议链路没有拿到 auth.openai.com 的 login_session；请看 authorize 日志里的最终 URL、HTTP 状态和响应摘要。"
            error_code = "oauth_session_missing"
            lowered_error = f"{raw_error} {raw_hint}".lower()
            if "unsupported_country_region_territory" in lowered_error or "country, region, or territory not supported" in lowered_error:
                error_code = "unsupported_country_region_territory"
                raw_hint = "OpenAI OAuth 明确拒绝当前后端出口：所在国家/地区不受支持。这一步还没有到邮箱验证码，也不是邮箱/JWT问题；请看“当前后端出口”日志，换成 OpenAI 支持地区的 HTTP 代理或 VPS 出口后重试。"
            raise LoginFlowError(
                raw_error,
                code=error_code,
                hint=raw_hint,
                status=login_state.get("status") if isinstance(login_state.get("status"), int) else None,
                retryable=True,
            )

        issued_after = time.time()
        self.log("sentinel", "Protocol login: generate Sentinel token")
        self.sentinel_token = generate_openai_sentinel_token(self.device_id, "authorize_continue", self.proxy_url)
        if not self.sentinel_token:
            self.log("sentinel", "Sentinel token helper returned empty token; continuing once", "warning")

        self.log("identifier", "Protocol login: submit email")
        step = self.authorize_continue(email_addr)
        continue_url = self.complete_modern_login(step, password, issued_after)
        self.log("callback", "后端协议：跟随 OAuth 后续页面并捕获 callback code")
        callback_url, final_url = self.capture_oauth_callback(continue_url or self.auth_url)
        if not callback_url and continue_url:
            callback_url, final_url = self.capture_oauth_callback(self.auth_url)
        if not callback_url:
            raise RuntimeError(f"OAuth flow did not return callback code; final={final_url[:220] if final_url else 'empty'}")

        if self.payload_has_cpa_config() and self.oauth_authorize_source == "cpa":
            self.log("cpa_callback", "后端协议：把 OAuth callback 直接提交给 CPA")
            cpa_result = cpa_direct_oauth_callback({
                **self.payload,
                "callback_url": callback_url,
                "state": self.oauth_cpa_state or self.oauth_state,
            })
            session = self.session_from_cpa_callback_result(cpa_result, email_addr)
            self.log("success", "Protocol login succeeded", "success")
            return session

        self.log("token", "后端协议：交换 OpenAI OAuth token")
        session = self.exchange_oauth_callback(callback_url)
        email_from_token = access_token_email(session.get("access_token", ""))
        if email_from_token:
            session["email"] = email_from_token
        else:
            session["email"] = email_addr
        session["user"] = {**(session.get("user") if isinstance(session.get("user"), dict) else {}), "email": session["email"]}
        self.log("success", "Protocol login succeeded", "success")
        return session

    def session_from_cpa_callback_result(self, cpa_result: dict[str, Any], email_addr: str) -> dict[str, Any]:
        auth_file = (
            cpa_result.get("auth_file")
            or (cpa_result.get("result", {}).get("auth_file") if isinstance(cpa_result.get("result"), dict) else {})
            or (cpa_result.get("result", {}).get("data", {}).get("auth_file") if isinstance(cpa_result.get("result", {}).get("data"), dict) else {})
        )
        if isinstance(auth_file, dict) and first_text(auth_file.get("access_token"), auth_file.get("accessToken")):
            return {
                "access_token": first_text(auth_file.get("access_token"), auth_file.get("accessToken")),
                "accessToken": first_text(auth_file.get("access_token"), auth_file.get("accessToken")),
                "refresh_token": first_text(auth_file.get("refresh_token"), auth_file.get("refreshToken"), "cpa-managed"),
                "refreshToken": first_text(auth_file.get("refresh_token"), auth_file.get("refreshToken"), "cpa-managed"),
                "id_token": first_text(auth_file.get("id_token"), auth_file.get("idToken")),
                "idToken": first_text(auth_file.get("id_token"), auth_file.get("idToken")),
                "email": first_text(auth_file.get("email"), email_addr),
                "user": {"email": first_text(auth_file.get("email"), email_addr)},
                "cpa_oauth_result": cpa_result,
            }
        return {
            "access_token": "cpa-managed",
            "accessToken": "cpa-managed",
            "refresh_token": "cpa-managed",
            "refreshToken": "cpa-managed",
            "email": email_addr,
            "user": {"email": email_addr},
            "cpa_callback_only": True,
            "cpa_oauth_result": cpa_result,
        }

    def payload_has_cpa_config(self) -> bool:
        return bool(coerce_text(self.payload.get("base_url") or self.payload.get("baseUrl")) and coerce_text(self.payload.get("management_key") or self.payload.get("managementKey")))

    def set_cookie(self, name: str, value: str, domain: str, path: str = "/") -> None:
        if not value:
            return
        cookie = http.cookiejar.Cookie(
            version=0,
            name=name,
            value=value,
            port=None,
            port_specified=False,
            domain=domain,
            domain_specified=True,
            domain_initial_dot=domain.startswith("."),
            path=path,
            path_specified=True,
            secure=True,
            expires=None,
            discard=True,
            comment=None,
            comment_url=None,
            rest={},
            rfc2109=False,
        )
        self.cookie_jar.set_cookie(cookie)

    def prepare_oauth_authorize_url(self) -> str:
        if self.payload_has_cpa_config():
            data = cpa_direct_oauth_start(self.payload)
            authorize_url = coerce_text(data.get("authorize_url") or data.get("oauth_url"))
            if not authorize_url.startswith(("http://", "https://")):
                raise RuntimeError("CPA did not return a valid OAuth authorize URL")
            self.oauth_authorize_source = "cpa"
            self.oauth_cpa_state = coerce_text(data.get("state"))
            self.remember_oauth_params_from_authorize_url(authorize_url)
            return authorize_url
        self.oauth_authorize_source = "local"
        self.oauth_state = secrets.token_urlsafe(32)
        self.oauth_code_verifier = generate_openai_code_verifier()
        authorize_url = build_openai_oauth_authorize_url(self.oauth_state, openai_code_challenge(self.oauth_code_verifier))
        self.remember_oauth_params_from_authorize_url(authorize_url)
        return authorize_url

    def remember_oauth_params_from_authorize_url(self, authorize_url: str) -> None:
        parsed = urllib.parse.urlparse(authorize_url)
        query = urllib.parse.parse_qs(parsed.query)
        self.oauth_authorize_url = authorize_url
        self.oauth_state = first_text(query.get("state", [""])[0], self.oauth_state, self.oauth_cpa_state)
        self.oauth_redirect_uri = first_text(query.get("redirect_uri", [""])[0], self.oauth_redirect_uri, OPENAI_OAUTH_REDIRECT_URI)
        self.oauth_client_id = first_text(query.get("client_id", [""])[0], self.oauth_client_id, OPENAI_CODEX_CLIENT_ID)
        if not self.oauth_code_verifier and self.oauth_authorize_source == "local":
            self.oauth_code_verifier = generate_openai_code_verifier()

    def bootstrap_oauth_session(self, authorize_url: str) -> dict[str, Any]:
        attempts = [
            ("CPA 授权链接", authorize_url, "https://chatgpt.com/"),
            ("OpenAI OAuth API", self.oauth2_auth_url_from_authorize(authorize_url), authorize_url),
        ]
        best: dict[str, Any] = {"ok": False, "final_url": "", "status": None, "hint": ""}
        seen_starts: set[str] = set()
        for label, start_url, referer in attempts:
            if not start_url or start_url in seen_starts:
                continue
            seen_starts.add(start_url)
            state = self.follow_oauth_authorize_chain(start_url, referer, label)
            if state.get("ok"):
                return state
            if state.get("final_url") or state.get("status") is not None or state.get("hint"):
                best = state
        final_url = coerce_text(best.get("final_url"))
        if final_url:
            self.login_url = final_url if "auth.openai.com" in final_url else "https://auth.openai.com/log-in"
        ok = self.has_auth_session_cookie()
        if ok:
            return {"ok": True, "final_url": final_url}
        cookie_names = self.auth_cookie_names()
        final_label = self.safe_url_for_log(final_url) if final_url else "空"
        status = best.get("status")
        hint = coerce_text(best.get("hint")) or "没有收到 login_session / oai-client-auth-session cookie"
        error = f"OAuth 授权入口没有建立 auth.openai.com 登录会话：final={final_label}，HTTP {status or '-'}，cookies={cookie_names or '无'}，摘要：{hint}"
        self.log("authorize", error[:700], "error")
        return {**best, "ok": False, "error": error, "hint": hint}

    def follow_oauth_authorize_chain(self, start_url: str, referer: str, label: str, max_hops: int = 12) -> dict[str, Any]:
        current_url = self.normalize_auth_url(start_url)
        last_url = current_url
        last_status: int | None = None
        last_hint = ""
        visited: set[str] = set()
        for hop in range(max_hops):
            if not current_url or current_url in visited:
                break
            visited.add(current_url)
            try:
                resp = self.request(
                    current_url,
                    headers=self.headers(current_url, {
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
                        "Referer": referer or last_url or "https://chatgpt.com/",
                        "Upgrade-Insecure-Requests": "1",
                    }),
                    timeout=45,
                )
            except Exception as exc:
                last_hint = str(exc)[:260]
                self.log("authorize", f"OAuth {label} 第 {hop + 1} 跳请求异常：{last_hint}", "warning")
                return {"ok": False, "final_url": current_url, "status": last_status, "hint": last_hint}

            last_status = resp.status
            last_url = resp.url or current_url
            last_hint = self.oauth_response_hint(resp)
            next_url = self.next_oauth_authorize_url(resp, current_url)
            log_parts = [
                f"OAuth {label} 第 {hop + 1} 跳：HTTP {resp.status}",
                self.safe_url_for_log(last_url),
            ]
            if next_url:
                log_parts.append(f"-> {self.safe_url_for_log(next_url)}")
            elif last_hint:
                log_parts.append(f"摘要：{last_hint[:180]}")
            self.log("authorize", " ".join(log_parts), "info" if next_url or self.has_auth_session_cookie() else "warning")

            if self.has_auth_session_cookie() and not next_url:
                final_url = last_url
                self.login_url = final_url if "auth.openai.com" in final_url else "https://auth.openai.com/log-in"
                return {"ok": True, "final_url": final_url, "status": resp.status, "hint": last_hint}

            if not next_url:
                break
            referer = current_url
            current_url = self.normalize_auth_url(next_url)

        return {"ok": False, "final_url": last_url, "status": last_status, "hint": last_hint}

    def next_oauth_authorize_url(self, resp: ProtocolResponse, current_url: str) -> str:
        if resp.status in {301, 302, 303, 307, 308} and resp.location():
            return urllib.parse.urljoin(current_url, resp.location())
        data = resp.json()
        candidates: list[str] = []
        if isinstance(data, dict):
            nested = data.get("data") if isinstance(data.get("data"), dict) else {}
            candidates.extend([
                coerce_text(data.get("continue_url")),
                coerce_text(data.get("continueUrl")),
                coerce_text(data.get("url")),
                coerce_text(data.get("redirect_url")),
                coerce_text(data.get("redirectUrl")),
                coerce_text(data.get("authorize_url")),
                coerce_text(data.get("auth_url")),
                coerce_text(nested.get("continue_url")),
                coerce_text(nested.get("continueUrl")),
                coerce_text(nested.get("url")),
                coerce_text(nested.get("redirect_url")),
                coerce_text(nested.get("redirectUrl")),
                coerce_text(nested.get("authorize_url")),
                coerce_text(nested.get("auth_url")),
            ])
        text = resp.text or ""
        patterns = [
            r"window\.location(?:\.href)?\s*=\s*['\"]([^'\"]+)['\"]",
            r"location\.replace\(\s*['\"]([^'\"]+)['\"]",
            r"<a\b[^>]+href=['\"]([^'\"]+)['\"]",
            r"<form\b[^>]+action=['\"]([^'\"]+)['\"]",
        ]
        for pattern in patterns:
            for match in re.finditer(pattern, text, flags=re.I):
                candidates.append(html.unescape(match.group(1)))
        for candidate in candidates:
            candidate = coerce_text(candidate)
            if not candidate:
                continue
            joined = urllib.parse.urljoin(current_url, candidate)
            parsed = urllib.parse.urlparse(joined)
            if parsed.scheme in {"http", "https"} and parsed.netloc and self.is_oauth_chain_url(joined, current_url):
                return joined
        return ""

    @staticmethod
    def is_oauth_chain_url(candidate_url: str, current_url: str) -> bool:
        try:
            parsed = urllib.parse.urlparse(candidate_url)
            host = (parsed.hostname or "").lower()
            marker = f"{parsed.path}?{parsed.query}".lower()
            oauth_markers = ("oauth", "auth", "callback", "login", "log-in", "authorize", "accounts", "session", "email-verification", "consent", "workspace", "organization", "codex")
            if host in {"auth.openai.com", "auth0.openai.com", "chatgpt.com"}:
                return any(part in marker for part in oauth_markers)
            if "auth" in host and "openai.com" in host:
                return any(part in marker for part in oauth_markers)
            current = urllib.parse.urlparse(current_url)
            if host and host == (current.hostname or "").lower():
                return any(part in marker for part in oauth_markers)
        except Exception:
            return False
        return False

    def oauth_response_hint(self, resp: ProtocolResponse) -> str:
        content_type = coerce_text(resp.headers.get("Content-Type") or resp.headers.get("content-type")).lower()
        text = resp.text or ""
        if "json" in content_type or text.lstrip().startswith(("{", "[")):
            return protocol_compact_error(resp.json())
        return protocol_compact_error(text)

    def has_auth_session_cookie(self) -> bool:
        return self.has_cookie("login_session") or self.has_cookie("oai-client-auth-session")

    def auth_cookie_names(self) -> str:
        names = sorted({cookie.name for cookie in self.cookie_jar if "openai.com" in coerce_text(cookie.domain)})
        return ",".join(names)

    @staticmethod
    def safe_url_for_log(value: str) -> str:
        raw = coerce_text(value)
        if not raw:
            return ""
        try:
            parsed = urllib.parse.urlparse(raw)
            if not parsed.scheme or not parsed.netloc:
                return raw[:220]
            query = urllib.parse.parse_qs(parsed.query)
            safe_items: list[tuple[str, str]] = []
            for key in ("response_type", "client_id", "redirect_uri", "state", "screen_hint", "email"):
                if key not in query:
                    continue
                item = coerce_text(query.get(key, [""])[0])
                if key == "state" and len(item) > 10:
                    item = f"...{item[-8:]}"
                elif key == "email" and item:
                    item = "***"
                elif key == "redirect_uri" and item:
                    p = urllib.parse.urlparse(item)
                    item = urllib.parse.urlunparse((p.scheme, p.netloc, p.path, "", "", ""))
                safe_items.append((key, item))
            safe_query = urllib.parse.urlencode(safe_items)
            return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", safe_query, ""))[:260]
        except Exception:
            return raw[:220]

    def oauth2_auth_url_from_authorize(self, authorize_url: str) -> str:
        parsed = urllib.parse.urlparse(authorize_url)
        if not parsed.query:
            return ""
        return urllib.parse.urlunparse(("https", "auth.openai.com", "/api/oauth/oauth2/auth", "", parsed.query, ""))

    def has_cookie(self, name: str) -> bool:
        return bool(self.cookie_value(name))

    def get_csrf_token(self) -> str:
        url = "https://chatgpt.com/api/auth/csrf"
        resp = self.request(url, headers=self.headers(url, {"Referer": "https://chatgpt.com/auth/login"}))
        data = resp.json()
        csrf_token = coerce_text(data.get("csrfToken"))
        if resp.status != 200 or not csrf_token:
            compact = protocol_compact_error(data)
            proxy_text = "已启用代理" if self.proxy_url else "未启用代理"
            raise LoginFlowError(
                f"CSRF 校验失败：HTTP {resp.status} - {compact}",
                code="csrf_or_risk_blocked",
                hint=f"{proxy_text}。请确认整轮登录使用同一出口 IP/cookie 会话，然后重试协议登录。",
                status=resp.status,
                retryable=True,
            )
        return csrf_token

    def signin_openai(self, csrf_token: str) -> str:
        attempts = [
            {
                "url": "https://chatgpt.com/api/auth/signin/openai",
                "callbackUrl": "https://chatgpt.com/",
                "referer": "https://chatgpt.com/auth/login",
            },
            {
                "url": "https://chatgpt.com/api/auth/signin/login-web?callbackUrl=%2F",
                "callbackUrl": "/",
                "referer": "https://chatgpt.com/",
            },
        ]
        last_url = ""
        for attempt in attempts:
            url = attempt["url"]
            resp = self.request(
                url,
                method="POST",
                form_data={"callbackUrl": attempt["callbackUrl"], "csrfToken": csrf_token, "json": "true"},
                headers=self.headers(url, {
                    "Origin": "https://chatgpt.com",
                    "Referer": attempt["referer"],
                }),
            )
            data = resp.json()
            last_url = coerce_text(data.get("url") or resp.location())
            if last_url and "/api/auth/signin?csrf=true" not in last_url:
                return urllib.parse.urljoin(url, last_url)
        raise RuntimeError(f"signin did not return authorize URL: {last_url or 'empty'}")

    def follow_authorize(self, auth_url: str) -> dict[str, Any]:
        state = {"is_modern": False, "login_url": "", "last_url": auth_url}
        current_url = auth_url
        for _ in range(12):
            parsed = urllib.parse.urlparse(current_url)
            if parsed.query:
                qs = urllib.parse.parse_qs(parsed.query)
                self.state = first_text(qs.get("state", [""])[0], self.state)
            if parsed.hostname == "auth.openai.com" and (
                "/api/accounts/authorize" in parsed.path or parsed.path == "/log-in"
            ):
                state["is_modern"] = True

            resp = self.request(
                current_url,
                headers=self.headers(current_url, {
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Referer": "https://chatgpt.com/",
                }),
            )
            state["last_url"] = current_url
            if 300 <= resp.status < 400 and resp.location():
                current_url = urllib.parse.urljoin(current_url, resp.location())
                state["last_url"] = current_url
                loc = urllib.parse.urlparse(current_url)
                if loc.query:
                    qs = urllib.parse.parse_qs(loc.query)
                    self.state = first_text(qs.get("state", [""])[0], self.state)
                if loc.hostname == "auth.openai.com" and loc.path == "/log-in":
                    state["is_modern"] = True
                    state["login_url"] = current_url
                    self.login_url = current_url
                    self.request(
                        current_url,
                        headers=self.headers(current_url, {
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                            "Referer": "https://chatgpt.com/auth/login",
                        }),
                    )
                    return state
                if "/u/login/identifier" in current_url or "/u/login/password" in current_url:
                    state["login_url"] = current_url
                    self.login_url = current_url
                    return state
                continue
            if parsed.hostname in {"auth.openai.com", "auth0.openai.com"}:
                state["login_url"] = current_url
                self.login_url = current_url
                return state
            break
        return state

    def authorize_continue(self, email_addr: str) -> dict[str, Any]:
        url = "https://auth.openai.com/api/accounts/authorize/continue"
        headers = self.headers(url, {
            "Accept": "application/json",
            "Origin": "https://auth.openai.com",
            "Referer": "https://auth.openai.com/log-in?usernameKind=email",
        })
        if self.sentinel_token:
            headers["openai-sentinel-token"] = self.sentinel_token
        payload = {"username": {"kind": "email", "value": email_addr}}
        resp = self.request(
            url,
            method="POST",
            json_data=payload,
            headers=headers,
        )
        data = resp.json()
        if resp.status == 400 and "invalid_auth_step" in json.dumps(data, ensure_ascii=False):
            self.log("authorize", "OAuth login_session 失效，重新建立授权会话后重试", "warning")
            self.bootstrap_oauth_session(self.auth_url)
            headers = self.headers(url, {
                "Accept": "application/json",
                "Origin": "https://auth.openai.com",
                "Referer": "https://auth.openai.com/log-in?usernameKind=email",
            })
            self.sentinel_token = generate_openai_sentinel_token(self.device_id, "authorize_continue", self.proxy_url)
            if self.sentinel_token:
                headers["openai-sentinel-token"] = self.sentinel_token
            resp = self.request(
                url,
                method="POST",
                json_data=payload,
                headers=headers,
            )
            data = resp.json()
        if resp.status != 200:
            raise RuntimeError(f"submit email failed: HTTP {resp.status} - {protocol_compact_error(data)}")
        return data

    def complete_modern_login(self, step: dict[str, Any], password: str, issued_after: float) -> str:
        current_step = step or {}
        continue_url = self.normalize_auth_url(self.extract_continue_url(current_step))
        page_type = self.extract_page_type(current_step)
        mode = self.extract_email_verification_mode(current_step)
        self.log("identifier", f"登录步骤：page={page_type or '-'}，mode={mode or '-'}", "info")

        if (page_type == "login_password" or "/log-in/password" in continue_url) and password:
            self.log("password", "Protocol login: submit password")
            self.sentinel_token = generate_openai_sentinel_token(self.device_id, "password_verify", self.proxy_url)
            current_step = self.submit_modern_password(password)
            continue_url = self.normalize_auth_url(self.extract_continue_url(current_step))
            page_type = self.extract_page_type(current_step)
            mode = self.extract_email_verification_mode(current_step) or mode
        elif page_type == "login_password" or "/log-in/password" in continue_url:
            self.log("send_code", "Protocol login: use email code path", "info")
            self.sentinel_token = generate_openai_sentinel_token(self.device_id, "email_verification", self.proxy_url)
            if not self.kickoff_modern_otp(mode):
                self.log("send_code", "OpenAI 发码接口没有返回确认，继续等待邮箱新验证码", "warning")
            continue_url = ""
            page_type = "email_otp_verification"

        if continue_url and not self.needs_modern_otp(page_type, continue_url):
            return continue_url

        self.log("waiting_code", "Protocol login: waiting for email code")
        code = manual_email_code_for_payload(self.payload)
        if code:
            self.log("waiting_code", "使用手动填写的邮箱验证码", "info")
        else:
            code = fetch_login_verification_code(self.payload, since=issued_after, attempts=12, delay=5)
        if not code:
            self.log("send_code", "Protocol login: request a fresh email code", "warning")
            resent_after = time.time()
            self.sentinel_token = generate_openai_sentinel_token(self.device_id, "email_verification", self.proxy_url)
            self.kickoff_modern_otp(mode)
            code = fetch_login_verification_code(self.payload, since=resent_after, attempts=20, delay=5)
        if not code:
            raise RuntimeError("no verification code was found in local mailbox credentials")

        self.log("verify_code", "Protocol login: submit email code")
        current_step = self.submit_modern_code(code)
        continue_url = self.normalize_auth_url(self.extract_continue_url(current_step))
        if self.needs_phone_verification(current_step, continue_url):
            continue_url = self.complete_phone_verification(current_step, continue_url)
        if not continue_url:
            raise RuntimeError(f"email code accepted but no continue URL returned: {protocol_compact_error(current_step)}")
        return continue_url

    def complete_phone_verification(self, step: dict[str, Any], continue_url: str = "") -> str:
        self.log("phone_code", "账号要求手机二次验证", "warning")
        phone_hint = extract_phone_hint_from_step(step, continue_url)
        if phone_hint:
            self.payload["_detected_phone_hint"] = phone_hint
            self.log("phone_pool", f"检测到账号使用手机号尾号 {phone_hint[-4:]}", "info")
        if self.needs_add_phone(step, continue_url):
            continue_url = self.submit_phone_number_for_verification(continue_url, phone_hint)
        elif self.needs_phone_channel_selection(step, continue_url):
            continue_url = self.select_phone_otp_channel(step, continue_url)
        code = self.fetch_phone_verification_code(phone_hint)
        if not code:
            raise LoginFlowError(
                "手机二次验证失败：没有收到手机验证码。",
                code="phone_2fa_failed",
                hint="账号已经通过邮箱验证码，但后续要求手机短信二次验证。请绑定长效手机 API，或在任务运行时手动输入手机验证码。",
                retryable=False,
            )
        self.log("phone_code", "已取到手机验证码，正在提交", "info")
        current_step = self.submit_phone_verification_code(code, continue_url)
        next_url = self.normalize_auth_url(self.extract_continue_url(current_step))
        if not next_url and self.needs_phone_verification(current_step, ""):
            raise LoginFlowError(
                "手机二次验证失败：验证码无效或仍停留在手机验证步骤。",
                code="phone_2fa_failed",
                hint="手机验证码提交后仍未进入授权回调，通常是验证码无效、过期或该号码无法完成验证。",
                retryable=False,
            )
        if not next_url:
            raise LoginFlowError(
                f"手机二次验证失败：没有返回继续授权地址。{protocol_compact_error(current_step)}",
                code="phone_2fa_failed",
                hint="手机验证码已提交，但 OpenAI 没有返回可继续的 OAuth 地址；请保留日志用于确认返回结构。",
                retryable=False,
            )
        return next_url

    def resolve_phone_code_source(self, phone_hint: str = "", *, allow_batch: bool = False) -> dict[str, str]:
        entries = phone_pool_entries_from_payload(self.payload)
        account_email = coerce_text(self.payload.get("email")).lower()
        hint = phone_hint or coerce_text(self.payload.get("_detected_phone_hint"))
        by_hint = phone_pool_match_by_hint(entries, hint)
        if by_hint:
            return by_hint
        bound = [entry for entry in entries if account_email and entry["account_email"] == account_email]
        if len(bound) == 1:
            return bound[0]
        phone = coerce_text(self.payload.get("phone_number") or self.payload.get("phoneNumber"))
        api_url = coerce_text(self.payload.get("phone_api_url") or self.payload.get("phoneApiUrl"))
        if phone and api_url:
            return {
                "id": coerce_text(self.payload.get("phone_binding_id") or self.payload.get("phoneBindingId")),
                "mode": "payload",
                "phone": phone,
                "phone_digits": normalize_phone_digits(phone),
                "api_url": api_url,
                "account_email": account_email,
            }
        if allow_batch:
            batch = [entry for entry in entries if not entry["account_email"] or entry["mode"] == "batch"]
            if batch:
                return batch[0]
        return {}

    def submit_phone_number_for_verification(self, continue_url: str = "", phone_hint: str = "") -> str:
        source = self.resolve_phone_code_source(phone_hint, allow_batch=True)
        phone = coerce_text(source.get("phone"))
        if not phone:
            raise LoginFlowError(
                "手机二次验证失败：账号要求绑定手机号，但当前账号没有绑定长效手机。",
                code="phone_2fa_failed",
                hint="这个提示窗需要先提交手机号，再收短信验证码。请在长效手机池给该账号绑定手机号和 API URL 后重试。",
                retryable=False,
            )
        self.payload["phone_number"] = phone
        self.payload["phone_api_url"] = coerce_text(source.get("api_url"))
        self.log("phone_pool", "提交绑定手机号", "info")
        referer = continue_url or "https://auth.openai.com/add-phone"
        form_url = self.normalize_auth_url(referer)
        attempts = [
            (form_url if "/add-phone" in urllib.parse.urlparse(form_url).path else "https://auth.openai.com/add-phone", {"phoneNumber": phone}),
            ("https://auth.openai.com/api/accounts/phone-number", {"phone_number": phone, "phoneNumber": phone}),
            ("https://auth.openai.com/api/accounts/phone-verification/send", {"phone_number": phone, "phoneNumber": phone}),
        ]
        last_status = 0
        last_data: dict[str, Any] = {}
        for url, body in attempts:
            if not url:
                continue
            is_form = "/api/" not in urllib.parse.urlparse(url).path
            resp = self.request(
                url,
                method="POST",
                form_data={"phoneNumber": phone} if is_form else None,
                json_data=None if is_form else body,
                headers=self.headers(url, {
                    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8" if is_form else "application/json",
                    "Origin": "https://auth.openai.com",
                    "Referer": referer,
                }),
                timeout=45,
            )
            last_status = resp.status
            if resp.status in {301, 302, 303, 307, 308} and resp.location():
                return urllib.parse.urljoin(url, resp.location())
            data = resp.json()
            last_data = data
            next_url = self.normalize_auth_url(self.extract_continue_url(data))
            if resp.status == 200 and next_url:
                return next_url
            if resp.status == 200 and self.needs_phone_verification(data, resp.url):
                return resp.url or "https://auth.openai.com/phone-verification"
        raise LoginFlowError(
            f"手机二次验证失败：手机号提交失败 HTTP {last_status or '-'} - {protocol_compact_error(last_data)}",
            code="phone_2fa_failed",
            hint="账号要求先提交手机号，但目标站没有接受当前号码。请更换绑定手机或检查号码格式。",
            status=last_status or None,
            retryable=False,
        )

    def select_phone_otp_channel(self, step: dict[str, Any], continue_url: str = "") -> str:
        referer = self.normalize_auth_url(continue_url) or "https://auth.openai.com/phone-otp/select-channel"
        phone_hint = extract_phone_hint_from_step(step, continue_url)
        source = self.resolve_phone_code_source(phone_hint, allow_batch=True)
        phone = coerce_text(source.get("phone"))
        self.log("phone_code", "进入手机验证码通道，尝试发送短信", "info")
        try:
            page_resp = self.request(
                referer,
                headers=self.headers(referer, {
                    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
                    "Referer": "https://auth.openai.com/email-verification",
                }),
                timeout=45,
            )
            if page_resp.status in {301, 302, 303, 307, 308} and page_resp.location():
                return urllib.parse.urljoin(referer, page_resp.location())
            page_data = page_resp.json()
            page_hint = extract_phone_hint_from_step(page_data, page_resp.url or referer)
            if page_hint and not phone_hint:
                phone_hint = page_hint
                self.payload["_detected_phone_hint"] = phone_hint
        except Exception as exc:
            self.log("phone_code", f"读取手机验证页失败，继续尝试发码：{str(exc)[:120]}", "warning")

        attempts = [
            ("https://auth.openai.com/api/accounts/phone-otp/select-channel", {"channel": "sms"}),
            ("https://auth.openai.com/api/accounts/phone-otp/select-channel", {"type": "sms"}),
            ("https://auth.openai.com/api/accounts/phone-otp/send", {"channel": "sms"}),
            ("https://auth.openai.com/api/accounts/phone-otp/resend", {}),
            ("https://auth.openai.com/api/accounts/add-phone/send", {"channel": "sms"}),
            ("https://auth.openai.com/api/accounts/phone-verification/send", {"channel": "sms"}),
        ]
        last_status = 0
        last_data: dict[str, Any] = {}
        for url, body in attempts:
            request_body = dict(body)
            if phone and ("/add-phone/" in url or "/phone-verification/" in url):
                request_body.update({"phone_number": phone, "phoneNumber": phone})
            headers = self.headers(url, {
                "Accept": "application/json",
                "Origin": "https://auth.openai.com",
                "Referer": referer,
            })
            if self.sentinel_token:
                headers["openai-sentinel-token"] = self.sentinel_token
            resp = self.request(url, method="POST", json_data=request_body, headers=headers, timeout=45)
            last_status = resp.status
            if resp.status in {301, 302, 303, 307, 308} and resp.location():
                self.log("phone_code", "已请求手机验证码，等待接码", "info")
                return urllib.parse.urljoin(url, resp.location())
            data = resp.json()
            last_data = data
            next_url = self.normalize_auth_url(self.extract_continue_url(data))
            if resp.status == 200:
                self.log("phone_code", "已请求手机验证码，等待接码", "info")
                return next_url or "https://auth.openai.com/phone-otp"
            if resp.status in {400, 401, 403} and re.search(r"invalid|expired|incorrect|验证码", protocol_compact_error(data), re.I):
                continue
        if last_status:
            self.log("phone_code", f"手机短信通道请求未确认：HTTP {last_status}", "warning")
            if last_data:
                self.log("phone_code", protocol_compact_error(last_data), "warning")
        return referer or "https://auth.openai.com/phone-otp"

    def fetch_phone_verification_code(self, phone_hint: str = "", attempts: int = 24, delay: float = 5) -> str:
        source = self.resolve_phone_code_source(phone_hint, allow_batch=False)
        phone = coerce_text(source.get("phone"))
        api_url = coerce_text(source.get("api_url"))
        if phone and api_url:
            self.payload["phone_number"] = phone
            self.payload["phone_api_url"] = api_url
            self.log("phone_pool", f"按手机号匹配长效手机尾号 {normalize_phone_digits(phone)[-4:]}", "info")
        since = str(int(time.time()))
        for attempt in range(1, max(1, attempts) + 1):
            raise_if_login_job_cancelled(self.job_id)
            manual_code = manual_phone_code_for_payload(self.payload)
            if manual_code:
                self.log("manual_phone_code", "使用手动填写的手机验证码", "info")
                return manual_code
            if phone and api_url:
                try:
                    result = poll_phone_code({
                        "phone": phone,
                        "api_url": api_url,
                        "account_email": self.payload.get("email", ""),
                        "since": since,
                    })
                    if result.get("code"):
                        self.log("phone_code", "已从长效手机 API 收到验证码", "success")
                        return coerce_text(result.get("code"))
                    if attempt == 1 or attempt % 4 == 0:
                        self.log("phone_code", "等待手机验证码", "warning")
                except Exception as exc:
                    if attempt == 1 or attempt % 4 == 0:
                        self.log("phone_code", f"手机取码失败：{str(exc)[:180]}", "warning")
            elif attempt == 1:
                self.log("phone_code", "未绑定长效手机，等待手动输入手机验证码", "warning")
            time.sleep(max(1, delay))
        return ""

    def submit_phone_verification_code(self, code: str, referer_url: str = "") -> dict[str, Any]:
        referer = referer_url or "https://auth.openai.com/phone-verification"
        form_url = self.normalize_auth_url(referer)
        form_path = urllib.parse.urlparse(form_url).path
        if form_url and ("/phone-verification" in form_path or "/phone-otp" in form_path):
            resp = self.request(
                form_url,
                method="POST",
                form_data={"code": code},
                headers=self.headers(form_url, {
                    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
                    "Origin": "https://auth.openai.com",
                    "Referer": referer,
                }),
                timeout=45,
            )
            if resp.status in {301, 302, 303, 307, 308} and resp.location():
                return {"continue_url": urllib.parse.urljoin(form_url, resp.location())}
            if resp.status == 200:
                data = resp.json()
                if self.extract_continue_url(data):
                    return data
                if not self.needs_phone_verification(data, resp.url or form_url):
                    return {"continue_url": resp.url or form_url}
        attempts = [
            ("POST", "https://auth.openai.com/api/accounts/phone-verification/validate", {"code": code}),
            ("POST", "https://auth.openai.com/api/accounts/phone-otp/validate", {"code": code}),
            ("POST", "https://auth.openai.com/api/accounts/sms/validate", {"code": code}),
        ]
        last_status = 0
        last_data: dict[str, Any] = {}
        for method, url, body in attempts:
            headers = self.headers(url, {
                "Accept": "application/json",
                "Origin": "https://auth.openai.com",
                "Referer": referer,
            })
            if self.sentinel_token:
                headers["openai-sentinel-token"] = self.sentinel_token
            resp = self.request(url, method=method, json_data=body, headers=headers, timeout=45)
            last_status = resp.status
            if resp.status in {301, 302, 303, 307, 308} and resp.location():
                return {"continue_url": urllib.parse.urljoin(url, resp.location())}
            data = resp.json()
            last_data = data
            if resp.status == 200:
                return data
            compact = protocol_compact_error(data)
            if resp.status in {400, 401, 403} and re.search(r"invalid|expired|incorrect|code|验证码", compact, re.I):
                break
        raise LoginFlowError(
            f"手机二次验证失败：HTTP {last_status or '-'} - {protocol_compact_error(last_data)}",
            code="phone_2fa_failed",
            hint="账号要求手机二次验证，但短信验证码提交未通过。请确认收到的是本轮最新验证码。",
            status=last_status or None,
            retryable=False,
        )

    def submit_modern_password(self, password: str) -> dict[str, Any]:
        url = "https://auth.openai.com/api/accounts/password/verify"
        headers = self.headers(url, {
            "Accept": "application/json",
            "Origin": "https://auth.openai.com",
            "Referer": "https://auth.openai.com/log-in/password",
        })
        if self.sentinel_token:
            headers["openai-sentinel-token"] = self.sentinel_token
        resp = self.request(url, method="POST", json_data={"password": password}, headers=headers)
        data = resp.json()
        if resp.status != 200:
            raise RuntimeError(f"password verify failed: HTTP {resp.status} - {protocol_compact_error(data)}")
        return data

    def kickoff_modern_otp(self, mode: str = "") -> bool:
        mode_lc = coerce_text(mode).lower()
        payload_mode = coerce_text(self.payload.get("mode") or "login").lower()
        existing = (
            payload_mode != "signup"
            or "passwordless_login" in mode_lc
            or "existing" in mode_lc
        )
        attempts = (
            [
                ("POST", "https://auth.openai.com/api/accounts/email-otp/resend", "https://auth.openai.com/email-verification", None),
                ("GET", "https://auth.openai.com/api/accounts/email-otp/send", "https://auth.openai.com/email-verification", None),
                ("POST", "https://auth.openai.com/api/accounts/passwordless/send-otp", "https://auth.openai.com/email-verification", {}),
            ]
            if existing
            else [
                ("POST", "https://auth.openai.com/api/accounts/passwordless/send-otp", "https://auth.openai.com/create-account/password", {}),
                ("POST", "https://auth.openai.com/api/accounts/email-otp/resend", "https://auth.openai.com/email-verification", None),
                ("GET", "https://auth.openai.com/api/accounts/email-otp/send", "https://auth.openai.com/email-verification", None),
            ]
        )
        for method, url, referer, body in attempts:
            headers = self.headers(url, {
                "Accept": "application/json",
                "Origin": "https://auth.openai.com",
                "Referer": referer,
            })
            if self.sentinel_token:
                headers["openai-sentinel-token"] = self.sentinel_token
            try:
                resp = self.request(url, method=method, json_data=body, headers=headers, timeout=30)
                if resp.status == 200:
                    self.log("send_code", f"OpenAI 已返回发送/重发验证码请求：{urllib.parse.urlparse(url).path}", "info")
                    return True
            except Exception:
                continue
        return False

    def submit_modern_code(self, code: str) -> dict[str, Any]:
        url = "https://auth.openai.com/api/accounts/email-otp/validate"
        headers = self.headers(url, {
            "Accept": "application/json",
            "Origin": "https://auth.openai.com",
            "Referer": "https://auth.openai.com/email-verification",
        })
        if self.sentinel_token:
            headers["openai-sentinel-token"] = self.sentinel_token
        resp = self.request(url, method="POST", json_data={"code": code}, headers=headers)
        data = resp.json()
        if resp.status != 200:
            raise RuntimeError(f"email code verify failed: HTTP {resp.status} - {protocol_compact_error(data)}")
        next_url = self.normalize_auth_url(self.extract_continue_url(data))
        self.log("verify_code", f"验证码提交响应：page={self.extract_page_type(data) or '-'}，next={self.safe_url_for_log(next_url) if next_url else '-'}", "info")
        return data

    def capture_oauth_callback(self, start_url: str, max_hops: int = 18) -> tuple[str, str]:
        current_url = self.normalize_auth_url(start_url)
        last_url = current_url
        chose_account = False
        for hop in range(max_hops):
            if self.callback_has_code(current_url):
                return current_url, current_url
            try:
                resp = self.request(
                    current_url,
                    headers=self.headers(current_url, {
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Referer": last_url if hop else "https://chatgpt.com/",
                        "Upgrade-Insecure-Requests": "1",
                    }),
                    timeout=45,
                )
            except Exception as exc:
                maybe = re.search(r"(https?://(?:localhost|127\.0\.0\.1):1455/auth/callback[^\s'\"<>]+)", str(exc))
                if maybe and self.callback_has_code(maybe.group(1)):
                    return maybe.group(1), maybe.group(1)
                raise
            last_url = resp.url or current_url
            if self.callback_has_code(last_url):
                return last_url, last_url
            if resp.status == 200:
                if self.is_workspace_or_consent_url(current_url):
                    next_url = self.submit_workspace_and_org(current_url)
                    if next_url:
                        if self.callback_has_code(next_url):
                            return next_url, next_url
                        current_url = self.normalize_auth_url(next_url)
                        continue
                if "/choose-an-account" in current_url and not chose_account:
                    chose_account = True
                    next_url = self.choose_account_from_html(resp.text, current_url)
                    if next_url:
                        current_url = self.normalize_auth_url(next_url)
                        continue
            if resp.status not in {301, 302, 303, 307, 308}:
                break
            loc = resp.location()
            if not loc:
                break
            loc = urllib.parse.urljoin(current_url, loc)
            if self.callback_has_code(loc):
                return loc, loc
            current_url = loc
        return "", last_url

    def callback_has_code(self, url: str) -> bool:
        if not url:
            return False
        try:
            parsed = urllib.parse.urlparse(url)
            redirect = urllib.parse.urlparse(self.oauth_redirect_uri)
            if parsed.scheme != redirect.scheme or parsed.hostname != redirect.hostname:
                return False
            if (parsed.port or (443 if parsed.scheme == "https" else 80)) != (redirect.port or (443 if redirect.scheme == "https" else 80)):
                return False
            if parsed.path.rstrip("/") != redirect.path.rstrip("/"):
                return False
            query = urllib.parse.parse_qs(parsed.query)
            return bool(first_text(query.get("code", [""])[0]))
        except Exception:
            return False

    @staticmethod
    def is_workspace_or_consent_url(url: str) -> bool:
        lowered = coerce_text(url).lower()
        return any(part in lowered for part in ["/workspace", "/sign-in-with-chatgpt/", "/consent", "/organization"])

    def submit_workspace_and_org(self, referer_url: str) -> str:
        session_data = self.decode_oauth_session_cookie()
        workspace_id = self.first_workspace_id(session_data)
        if not workspace_id:
            return ""
        url = "https://auth.openai.com/api/accounts/workspace/select"
        headers = self.headers(url, {
            "Accept": "application/json",
            "Origin": "https://auth.openai.com",
            "Referer": referer_url,
        })
        resp = self.request(url, method="POST", json_data={"workspace_id": workspace_id}, headers=headers, timeout=45)
        if resp.status in {301, 302, 303, 307, 308} and resp.location():
            return urllib.parse.urljoin(url, resp.location())
        data = resp.json()
        next_url = self.extract_continue_url(data)
        if next_url:
            return self.normalize_auth_url(next_url)
        orgs = data.get("data", {}).get("orgs", []) if isinstance(data.get("data"), dict) else []
        if not orgs and isinstance(session_data, dict):
            orgs = session_data.get("orgs") if isinstance(session_data.get("orgs"), list) else []
        if not orgs:
            return ""
        org = orgs[0] if isinstance(orgs[0], dict) else {}
        org_id = coerce_text(org.get("id"))
        projects = org.get("projects") if isinstance(org.get("projects"), list) else []
        body = {"org_id": org_id}
        if projects and isinstance(projects[0], dict) and projects[0].get("id"):
            body["project_id"] = projects[0]["id"]
        if not org_id:
            return ""
        org_url = "https://auth.openai.com/api/accounts/organization/select"
        org_resp = self.request(
            org_url,
            method="POST",
            json_data=body,
            headers=self.headers(org_url, {
                "Accept": "application/json",
                "Origin": "https://auth.openai.com",
                "Referer": self.normalize_auth_url(next_url) or referer_url,
            }),
            timeout=45,
        )
        if org_resp.status in {301, 302, 303, 307, 308} and org_resp.location():
            return urllib.parse.urljoin(org_url, org_resp.location())
        return self.normalize_auth_url(self.extract_continue_url(org_resp.json()))

    def choose_account_from_html(self, html_text: str, referer_url: str) -> str:
        match = re.search(r"us_[A-Za-z0-9_-]{12,}", html_text or "")
        if not match:
            return ""
        session_id = match.group(0)
        url = "https://auth.openai.com/api/accounts/session/select"
        resp = self.request(
            url,
            method="POST",
            json_data={"session_id": session_id},
            headers=self.headers(url, {
                "Accept": "application/json",
                "Origin": "https://auth.openai.com",
                "Referer": referer_url,
            }),
            timeout=45,
        )
        if resp.status in {301, 302, 303, 307, 308} and resp.location():
            return urllib.parse.urljoin(url, resp.location())
        data = resp.json()
        next_url = self.extract_continue_url(data)
        return self.normalize_auth_url(next_url) if next_url else referer_url

    def decode_oauth_session_cookie(self) -> dict[str, Any]:
        raw_value = self.cookie_value("oai-client-auth-session")
        if not raw_value:
            return {}
        values = [raw_value]
        try:
            decoded = urllib.parse.unquote(raw_value)
            if decoded != raw_value:
                values.append(decoded)
        except Exception:
            pass
        for value in values:
            clean = value.strip().strip("\"'")
            parts = clean.split(".") if "." in clean else [clean]
            for part in parts[:2]:
                try:
                    padded = part + "=" * (-len(part) % 4)
                    data = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8", errors="replace"))
                    if isinstance(data, dict):
                        return data
                except Exception:
                    continue
        return {}

    @staticmethod
    def first_workspace_id(data: dict[str, Any]) -> str:
        if not isinstance(data, dict):
            return ""
        direct = first_text(data.get("workspace_id"), data.get("workspaceId"))
        if direct:
            return direct
        workspaces = data.get("workspaces") if isinstance(data.get("workspaces"), list) else []
        for item in workspaces:
            if isinstance(item, dict) and item.get("id"):
                return coerce_text(item.get("id"))
        return ""

    def exchange_oauth_callback(self, callback_url: str) -> dict[str, Any]:
        query = urllib.parse.parse_qs(urllib.parse.urlparse(callback_url).query)
        error = first_text(query.get("error", [""])[0], query.get("error_description", [""])[0])
        if error:
            raise RuntimeError(f"OpenAI OAuth authorization failed: {error}")
        returned_state = first_text(query.get("state", [""])[0])
        expected_state = self.oauth_state or self.oauth_cpa_state
        if expected_state and returned_state and returned_state != expected_state:
            raise RuntimeError("OpenAI OAuth state mismatch")
        code = first_text(query.get("code", [""])[0])
        if not code:
            raise RuntimeError("OAuth callback missing authorization code")
        if not self.oauth_code_verifier:
            raise RuntimeError("OAuth callback captured, but code_verifier is unavailable; CPA callback was submitted but local token exchange cannot run")
        status, data, raw = exchange_openai_oauth_code(code, self.oauth_code_verifier, proxy_url=self.proxy_url)
        if status != 200:
            compact = protocol_compact_error(data) or raw[:260]
            raise RuntimeError(f"OpenAI OAuth token exchange failed: HTTP {status} - {compact}")
        if not coerce_text(data.get("access_token")):
            raise RuntimeError("OpenAI OAuth token exchange succeeded but returned no access_token")
        if not coerce_text(data.get("refresh_token")):
            raise RuntimeError("OpenAI OAuth token exchange succeeded but returned no refresh_token")
        return merge_session_with_oauth({}, data)

    def follow_callback(self, callback_url: str) -> None:
        current_url = self.normalize_auth_url(callback_url)
        for _ in range(12):
            resp = self.request(
                current_url,
                headers=self.headers(current_url, {
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                }),
            )
            if 300 <= resp.status < 400 and resp.location():
                current_url = urllib.parse.urljoin(current_url, resp.location())
                parsed = urllib.parse.urlparse(current_url)
                if parsed.hostname == "chatgpt.com" and not parsed.path.startswith("/api/auth/"):
                    return
                continue
            return

    def get_session(self) -> dict[str, Any]:
        url = "https://chatgpt.com/api/auth/session"
        resp = self.request(url, headers=self.headers(url, {"Referer": "https://chatgpt.com/"}))
        data = resp.json()
        if resp.status != 200:
            raise RuntimeError(f"session request failed: HTTP {resp.status} - {protocol_compact_error(data)}")
        return data

    def get_session_cookie(self) -> str:
        names = [
            "__Secure-next-auth.session-token",
            "__Secure-authjs.session-token",
            "next-auth.session-token",
            "authjs.session-token",
        ]
        for name in names:
            direct = self.cookie_value(name)
            if direct:
                return direct
            chunks: list[tuple[int, str]] = []
            for cookie in self.cookie_jar:
                if cookie.name.startswith(f"{name}."):
                    try:
                        idx = int(cookie.name.rsplit(".", 1)[1])
                    except ValueError:
                        continue
                    chunks.append((idx, cookie.value))
            if chunks:
                return "".join(value for _, value in sorted(chunks))
        return ""

    def cookie_value(self, name: str) -> str:
        for cookie in self.cookie_jar:
            if cookie.name == name:
                return coerce_text(cookie.value)
        return ""

    @staticmethod
    def extract_continue_url(data: dict[str, Any]) -> str:
        page = data.get("page") if isinstance(data.get("page"), dict) else {}
        payload = page.get("payload") if isinstance(page.get("payload"), dict) else {}
        return first_text(
            data.get("continue_url"),
            data.get("continueUrl"),
            data.get("redirect_url"),
            data.get("redirectUrl"),
            data.get("url"),
            payload.get("continue_url"),
        )

    @staticmethod
    def extract_page_type(data: dict[str, Any]) -> str:
        page = data.get("page") if isinstance(data.get("page"), dict) else {}
        return coerce_text(page.get("type") or data.get("page_type"))

    @staticmethod
    def needs_phone_verification(data: dict[str, Any], continue_url: str = "") -> bool:
        page = data.get("page") if isinstance(data.get("page"), dict) else {}
        payload = page.get("payload") if isinstance(page.get("payload"), dict) else {}
        markers = " ".join([
            coerce_text(page.get("type")),
            coerce_text(data.get("page_type")),
            coerce_text(data.get("step")),
            coerce_text(data.get("state")),
            coerce_text(data.get("error")),
            coerce_text(data.get("message")),
            coerce_text(payload.get("type")),
            coerce_text(payload.get("step")),
            coerce_text(payload.get("state")),
            coerce_text(continue_url),
        ]).lower()
        return any(marker in markers for marker in [
            "phone_verification",
            "phone-verification",
            "phone_otp",
            "phone-otp",
            "phone otp",
            "select-channel",
            "select_channel",
            "add-phone",
            "mfa",
            "sms",
            "phone_number",
            "phone number",
            "mobile",
        ])

    @staticmethod
    def needs_phone_channel_selection(data: dict[str, Any], continue_url: str = "") -> bool:
        page = data.get("page") if isinstance(data.get("page"), dict) else {}
        markers = " ".join([
            coerce_text(page.get("type")),
            coerce_text(data.get("page_type")),
            coerce_text(data.get("step")),
            coerce_text(data.get("state")),
            coerce_text(continue_url),
        ]).lower()
        return any(marker in markers for marker in [
            "phone_otp_select_channel",
            "phone-otp/select-channel",
            "select-channel",
            "select_channel",
        ])

    @staticmethod
    def needs_add_phone(data: dict[str, Any], continue_url: str = "") -> bool:
        page = data.get("page") if isinstance(data.get("page"), dict) else {}
        markers = " ".join([
            coerce_text(page.get("type")),
            coerce_text(data.get("page_type")),
            coerce_text(data.get("step")),
            coerce_text(data.get("state")),
            coerce_text(continue_url),
        ]).lower()
        return "add-phone" in markers or "add_phone" in markers

    @staticmethod
    def extract_email_verification_mode(data: dict[str, Any]) -> str:
        page = data.get("page") if isinstance(data.get("page"), dict) else {}
        payload = page.get("payload") if isinstance(page.get("payload"), dict) else {}
        return coerce_text(payload.get("email_verification_mode"))

    @staticmethod
    def needs_modern_otp(page_type: str, continue_url: str) -> bool:
        page = page_type.lower()
        url = continue_url.lower()
        return page == "email_otp_verification" or "/email-verification" in url or not continue_url

    @staticmethod
    def normalize_auth_url(value: str) -> str:
        if not value:
            return ""
        return urllib.parse.urljoin("https://auth.openai.com", value)

    @staticmethod
    def extract_query_param(url: str, name: str) -> str:
        try:
            return urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get(name, [""])[0]
        except Exception:
            return ""


def generate_openai_sentinel_token(device_id: str, flow: str, proxy_url: str = "") -> str:
    node_bin = LOGIN_NODE_BIN
    if os.path.sep not in node_bin and (os.path.altsep is None or os.path.altsep not in node_bin):
        node_bin = shutil.which(node_bin) or node_bin
    if not OPENAI_SENTINEL_HELPER.exists():
        return ""
    try:
        env = os.environ.copy()
        if proxy_url:
            env["HTTPS_PROXY"] = proxy_url
            env["HTTP_PROXY"] = proxy_url
            env["ALL_PROXY"] = proxy_url
        completed = subprocess.run(
            [node_bin, str(OPENAI_SENTINEL_HELPER)],
            input=json.dumps({"deviceId": device_id, "flow": flow}, ensure_ascii=False),
            text=True,
            capture_output=True,
            timeout=75,
            check=False,
            env=env,
        )
    except Exception:
        return ""
    if completed.returncode != 0:
        return ""
    try:
        data = json.loads(completed.stdout or "{}")
    except json.JSONDecodeError:
        return ""
    return coerce_text(data.get("token"))


def run_chatgpt_login_with_protocol(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    return ChatGPTProtocolLogin(job_id, payload).login()


def cpa_headers(management_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {management_key}",
        "X-Management-Key": management_key,
        "Accept": "application/json",
    }


def cpa_management_config(payload: dict[str, Any]) -> tuple[str, str]:
    base_url = normalize_cpa_base_url(coerce_text(payload.get("base_url") or payload.get("baseUrl")) or "http://localhost:8317")
    management_key = coerce_text(payload.get("management_key") or payload.get("managementKey"))
    if not management_key:
        raise RuntimeError("缺少 CPA 管理密钥")
    validate_cpa_base_url(base_url)
    return base_url, management_key


def extract_state_from_auth_url(auth_url: str) -> str:
    try:
        return urllib.parse.parse_qs(urllib.parse.urlparse(auth_url).query).get("state", [""])[0]
    except Exception:
        return ""


def cpa_oauth_value(payload: dict[str, Any], *keys: str) -> str:
    current: Any = payload
    for key in keys:
        if not isinstance(current, dict):
            return ""
        current = current.get(key)
    return coerce_text(current)


def cpa_direct_oauth_start(payload: dict[str, Any]) -> dict[str, Any]:
    base_url, management_key = cpa_management_config(payload)
    result = http_request_json(
        f"{base_url}/v0/management/codex-auth-url",
        headers=cpa_headers(management_key),
        timeout=30,
    )
    authorize_url = first_text(
        cpa_oauth_value(result, "url"),
        cpa_oauth_value(result, "auth_url"),
        cpa_oauth_value(result, "authUrl"),
        cpa_oauth_value(result, "data", "url"),
        cpa_oauth_value(result, "data", "auth_url"),
        cpa_oauth_value(result, "data", "authUrl"),
    )
    if not authorize_url.startswith(("http://", "https://")):
        raise RuntimeError("CPA 管理接口没有返回有效的 OAuth 授权链接")
    oauth_state = first_text(
        cpa_oauth_value(result, "state"),
        cpa_oauth_value(result, "auth_state"),
        cpa_oauth_value(result, "authState"),
        cpa_oauth_value(result, "data", "state"),
        cpa_oauth_value(result, "data", "auth_state"),
        cpa_oauth_value(result, "data", "authState"),
        extract_state_from_auth_url(authorize_url),
    )
    return {
        "success": True,
        "authorize_url": authorize_url,
        "oauth_url": authorize_url,
        "state": oauth_state,
        "cpa_management_origin": base_url,
        "message": "CPA 已生成 OAuth 授权链接",
    }


def parse_localhost_oauth_callback(callback_url: str, expected_state: str = "") -> dict[str, str]:
    raw = coerce_text(callback_url)
    try:
        parsed = urllib.parse.urlparse(raw)
    except Exception as exc:
        raise RuntimeError("localhost OAuth 回调地址格式无效") from exc
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("只接受真实的 localhost / 127.0.0.1 OAuth 回调地址")
    query = urllib.parse.parse_qs(parsed.query)
    error = first_text(query.get("error", [""])[0], query.get("error_description", [""])[0])
    if error:
        raise RuntimeError(f"OAuth 授权失败：{error}")
    code = first_text(query.get("code", [""])[0])
    state = first_text(query.get("state", [""])[0])
    if not code or not state:
        raise RuntimeError("localhost OAuth 回调地址缺少 code 或 state")
    if expected_state and expected_state != state:
        raise RuntimeError("localhost 回调中的 state 与本轮 CPA 授权链接不一致，请重新生成授权链接")
    return {
        "url": urllib.parse.urlunparse(parsed),
        "code": code,
        "state": state,
    }


def cpa_direct_oauth_callback(payload: dict[str, Any]) -> dict[str, Any]:
    base_url, management_key = cpa_management_config(payload)
    callback = parse_localhost_oauth_callback(
        coerce_text(payload.get("callback_url") or payload.get("callbackUrl") or payload.get("redirect_url") or payload.get("redirectUrl")),
        coerce_text(payload.get("state") or payload.get("oauth_state") or payload.get("oauthState")),
    )
    result = http_request_json(
        f"{base_url}/v0/management/oauth-callback",
        method="POST",
        json_data={
            "provider": "codex",
            "redirect_url": callback["url"],
        },
        headers=cpa_headers(management_key),
        timeout=45,
    )
    return {
        "success": True,
        "cpa_update": True,
        "localhost_url": callback["url"],
        "state": callback["state"],
        "result": result,
        "message": first_text(
            cpa_oauth_value(result, "message"),
            cpa_oauth_value(result, "status_message"),
            cpa_oauth_value(result, "data", "message"),
            "CPA 已接受 OAuth 回调",
        ),
    }


def cpa_item_type(item: dict[str, Any]) -> str:
    return coerce_text(item.get("type") or item.get("typo")).lower()


def looks_like_openai_auth_file(item: dict[str, Any], auth_file: dict[str, Any] | None = None) -> bool:
    auth_file = auth_file or {}
    parts = [
        item.get("provider"),
        item.get("type"),
        item.get("account_type"),
        item.get("name"),
        item.get("label"),
        auth_file.get("type"),
        auth_file.get("auth_mode"),
    ]
    text = " ".join(coerce_text(part).lower() for part in parts if part)
    return bool(
        "codex" in text
        or "openai" in text
        or "chatgpt" in text
        or auth_file.get("access_token")
        or auth_file.get("accessToken")
        or (isinstance(auth_file.get("tokens"), dict) and (auth_file["tokens"].get("access_token") or auth_file["tokens"].get("accessToken")))
    )


def infer_auth_email(item: dict[str, Any], auth_file: dict[str, Any] | None = None) -> str:
    auth_file = auth_file or {}
    candidates = [
        item.get("email"),
        item.get("account"),
        auth_file.get("email"),
        auth_file.get("account"),
        auth_file.get("name"),
        item.get("name"),
        item.get("id"),
    ]
    for value in candidates:
        match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", coerce_text(value), flags=re.I)
        if match:
            return match.group(0).lower()
    return ""


def cpa_item_chatgpt_account_id(item: dict[str, Any]) -> str:
    for key in ("chatgpt_account_id", "chatgptAccountId", "account_id", "accountId"):
        value = coerce_text(item.get(key))
        if value:
            return value
    id_token = item.get("id_token")
    if isinstance(id_token, dict):
        return coerce_text(id_token.get("chatgpt_account_id") or id_token.get("account_id"))
    return ""


def cpa_list_auth_files(base_url: str, management_key: str) -> list[dict[str, Any]]:
    payload = http_request_json(
        f"{base_url}/v0/management/auth-files",
        headers=cpa_headers(management_key),
        timeout=30,
    )
    files = payload.get("files") or payload.get("data") or payload.get("items") or []
    if not isinstance(files, list):
        return []
    return [item for item in files if isinstance(item, dict)]


def cpa_download_auth_file(base_url: str, management_key: str, name: str) -> dict[str, Any]:
    if not name:
        return {}
    payload = http_request_json(
        f"{base_url}/v0/management/auth-files/download?name={urllib.parse.quote(name, safe='')}",
        headers=cpa_headers(management_key),
        timeout=30,
    )
    if isinstance(payload.get("auth_file"), dict):
        return payload["auth_file"]
    if isinstance(payload.get("authFile"), dict):
        return payload["authFile"]
    if isinstance(payload.get("data"), dict):
        return payload["data"]
    body = payload.get("body")
    if isinstance(body, str) and body.strip():
        try:
            parsed = json.loads(body)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
    return payload if isinstance(payload, dict) else {}


def cpa_probe_payload(item: dict[str, Any]) -> dict[str, Any]:
    call_headers = {
        "Authorization": "Bearer $TOKEN$",
        "Content-Type": "application/json",
        "User-Agent": CPA_PROBE_USER_AGENT,
    }
    account_id = cpa_item_chatgpt_account_id(item)
    if account_id:
        call_headers["Chatgpt-Account-Id"] = account_id
    return {
        "authIndex": item.get("auth_index"),
        "method": "GET",
        "url": "https://chatgpt.com/backend-api/wham/usage",
        "header": call_headers,
    }


def cpa_probe_status(base_url: str, management_key: str, item: dict[str, Any]) -> dict[str, Any]:
    auth_index = item.get("auth_index")
    name = coerce_text(item.get("name") or item.get("id"))
    email_addr = coerce_text(item.get("email") or item.get("account"))
    result = {
        "name": name,
        "email": email_addr,
        "auth_index": auth_index,
        "type": cpa_item_type(item),
        "provider": item.get("provider"),
        "status_code": None,
        "ok": None,
        "action": "scanned",
        "message": "",
    }
    if not auth_index:
        message, raw_message = cpa_status_message("missing auth_index", action="skipped")
        result.update({"ok": False, "action": "skipped", "message": message, "raw_message": raw_message})
        return result

    try:
        payload = http_request_json(
            f"{base_url}/v0/management/api-call",
            method="POST",
            json_data=cpa_probe_payload(item),
            headers=cpa_headers(management_key),
            timeout=30,
        )
        status_code = payload.get("status_code")
        if status_code is None and isinstance(payload.get("body"), str):
            try:
                status_code = json.loads(payload["body"]).get("status")
            except Exception:
                status_code = None
        result["status_code"] = status_code
        status_code_text = coerce_text(status_code)
        if status_code_text == "200":
            message, raw_message = cpa_status_message(payload, status_code=status_code, action="ready")
            result.update({"ok": True, "action": "ready", "message": message, "raw_message": raw_message})
        elif status_code_text == "401":
            message, raw_message = cpa_status_message(payload, status_code=status_code, action="401")
            result.update({"ok": False, "action": "401", "message": message, "raw_message": raw_message})
        elif status_code_text == "403":
            message, raw_message = cpa_status_message(payload, status_code=status_code, action="risk_blocked")
            result.update({"ok": False, "action": "risk_blocked", "message": message, "raw_message": raw_message})
        elif status_code_text == "429":
            message, raw_message = cpa_status_message(payload, status_code=status_code, action="usage_limit_reached")
            result.update({"ok": False, "action": "usage_limit_reached", "message": message, "raw_message": raw_message})
        elif status_code_text:
            message, raw_message = cpa_status_message(payload, status_code=status_code, action="http_error")
            result.update({"ok": False, "action": "http_error", "message": message, "raw_message": raw_message})
        else:
            message, raw_message = cpa_status_message(payload, action="probe_failed")
            result.update({"ok": False, "action": "probe_failed", "message": message, "raw_message": raw_message})
    except Exception as exc:
        message, raw_message = cpa_status_message(str(exc), action="probe_failed")
        result.update({"ok": False, "action": "probe_failed", "message": message, "raw_message": raw_message})
    return result


def cpa_is_401_item(item: dict[str, Any]) -> bool:
    status_code = item.get("status_code") or item.get("statusCode")
    if str(status_code) == "401":
        return True
    text = " ".join(coerce_text(item.get(key)) for key in ("status", "status_message", "error", "message", "action")).lower()
    return bool(re.search(r"\b401\b", text) or "unauthorized" in text)


def cpa_delete_auth_file(base_url: str, management_key: str, name: str) -> dict[str, Any]:
    if not name:
        return {"deleted": False, "error": "missing name"}
    url = f"{base_url}/v0/management/auth-files?name={urllib.parse.quote(name, safe='')}"
    try:
        payload = http_request_json(url, method="DELETE", headers=cpa_headers(management_key), timeout=30)
        ok = payload.get("status") == "ok" or payload.get("success") is True or payload == {"status": "ok"}
        return {"deleted": ok, "payload": payload, "error": "" if ok else "delete failed"}
    except Exception as exc:
        return {"deleted": False, "error": str(exc)[:240]}


def cpa_auth_filename(value: str, auth_file: dict[str, Any]) -> str:
    name = coerce_text(value)
    if not name:
        name = coerce_text(auth_file.get("name") or auth_file.get("email") or auth_file.get("account_id") or "chatgpt-auth")
    name = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].strip()
    name = re.sub(r"[^A-Za-z0-9._@+-]+", "-", name).strip(".-")
    if not name:
        name = "chatgpt-auth"
    if not name.lower().endswith(".json"):
        name = f"{name}.json"
    return name


def cpa_upload_auth_file(base_url: str, management_key: str, name: str, auth_file: dict[str, Any]) -> dict[str, Any]:
    filename = cpa_auth_filename(name, auth_file)
    url = f"{base_url}/v0/management/auth-files?name={urllib.parse.quote(filename, safe='')}"
    payload = http_request_json(
        url,
        method="POST",
        json_data=auth_file,
        headers=cpa_headers(management_key),
        timeout=30,
    )
    ok = payload.get("status") == "ok" or payload.get("success") is True or payload == {"status": "ok"}
    return {
        "uploaded": ok,
        "name": filename,
        "payload": payload,
        "error": "" if ok else "upload failed",
    }


def cpa_candidates(payload: dict[str, Any]) -> tuple[str, str, int, list[dict[str, Any]], int]:
    base_url = normalize_cpa_base_url(coerce_text(payload.get("base_url") or payload.get("baseUrl")) or "http://localhost:8317")
    management_key = coerce_text(payload.get("management_key") or payload.get("managementKey"))
    if not management_key:
        raise RuntimeError("CPA 管理密钥不能为空")
    validate_cpa_base_url(base_url)
    max_items = max(1, min(int(payload.get("max_items") or payload.get("maxItems") or 20), 50))
    files = cpa_list_auth_files(base_url, management_key)
    filtered = [
        item for item in files
        if cpa_item_type(item) in {"", "codex", "chatgpt", "openai"}
    ]
    candidates = filtered[:max_items]
    return base_url, management_key, max_items, candidates, len(filtered)


def cpa_diagnosis_action_hint(status: str) -> str:
    return {
        "active": "凭证可用，可以跳过刷新",
        "refreshed": "RT 可用，已能刷新 access_token",
        "rt_rotated": "RT 可用且已轮换，建议保存新 auth",
        "rt_invalid": "RT 已失效，需要走邮箱登录重新授权",
        "session_expired": "会话已过期，需要走邮箱登录重新授权",
        "banned": "账号封禁或停用，不建议继续刷新",
        "risk_blocked": "目标站风控或地区受限，请换干净代理出口后再处理",
        "usage_limit_reached": "额度耗尽但凭证有效，暂不需要重新登录",
        "needs_login": "缺少可用 token，需要导入取码邮箱后重新授权",
        "probe_failed": "探测失败，请检查网络、CPA auth_file 或稍后重试",
        "not_openai_auth": "不是 OpenAI/Codex 凭证，已跳过",
    }.get(status, "请查看诊断详情")


def cpa_status_refreshable(status: str) -> bool:
    return status in {"rt_invalid", "session_expired", "needs_login", "risk_blocked", "probe_failed"}


def diagnose_cpa_candidate(base_url: str, management_key: str, item: dict[str, Any]) -> dict[str, Any]:
    row = dict(item)
    name = coerce_text(row.get("name") or row.get("id"))
    auth_file: dict[str, Any] = {}
    if name and not row.get("runtime_only"):
        try:
            auth_file = cpa_download_auth_file(base_url, management_key, name)
        except Exception as exc:
            status = "probe_failed"
            message = f"下载 CPA auth 失败：{str(exc)[:220]}"
            return {
                **row,
                "name": name,
                "email": coerce_text(row.get("email") or row.get("account")),
                "status": status,
                "status_label": lifecycle_status_label(status),
                "diagnosis": lifecycle_status_label(status),
                "message": message,
                "action_hint": "请检查 CPA 管理密钥、auth 文件名或 CPA 服务状态",
                "refreshable": False,
                "ok": False,
                "action": "diagnosis_failed",
            }
    if not row.get("runtime_only") and not looks_like_openai_auth_file(row, auth_file):
        status = "not_openai_auth"
        return {
            **row,
            "name": name,
            "email": infer_auth_email(row, auth_file) or coerce_text(row.get("email") or row.get("account")),
            "status": status,
            "status_label": lifecycle_status_label(status),
            "diagnosis": lifecycle_status_label(status),
            "message": "不是 OpenAI/Codex 凭证，已跳过",
            "action_hint": cpa_diagnosis_action_hint(status),
            "refreshable": False,
            "ok": False,
            "action": "skipped",
        }
    try:
        diagnosis = refresh_lifecycle_item({
            "auth_file": auth_file or row,
            "row": row,
            "name": name or coerce_text(row.get("email") or row.get("account")),
        })
    except Exception as exc:
        status = "probe_failed"
        diagnosis = {
            "status": status,
            "status_label": lifecycle_status_label(status),
            "message": f"OpenAI 深度探测失败：{str(exc)[:220]}",
            "ok": False,
            "email": infer_auth_email(row, auth_file) or coerce_text(row.get("email") or row.get("account")),
            "name": name,
        }
    status = coerce_text(diagnosis.get("status") or "probe_failed")
    status_label = coerce_text(diagnosis.get("status_label") or lifecycle_status_label(status))
    return {
        **row,
        "name": name or diagnosis.get("name") or row.get("name"),
        "email": diagnosis.get("email") or infer_auth_email(row, auth_file) or coerce_text(row.get("email") or row.get("account")),
        "status": status,
        "status_label": status_label,
        "diagnosis": status_label,
        "message": coerce_text(diagnosis.get("message") or row.get("message") or status_label),
        "action_hint": cpa_diagnosis_action_hint(status),
        "refreshable": cpa_status_refreshable(status),
        "ok": bool(diagnosis.get("ok")),
        "plan_type": coerce_text(diagnosis.get("plan_type")),
        "expires_at": diagnosis.get("expires_at", ""),
        "action": "diagnosed",
    }


def scan_cpa_401(payload: dict[str, Any]) -> dict[str, Any]:
    base_url, management_key, max_items, candidates, available_total = cpa_candidates(payload)
    results = []
    for item in candidates:
        if cpa_is_401_item(item):
            status_source = item.get("status_message") or item.get("message") or item.get("error") or "401 Unauthorized"
            message, raw_message = cpa_status_message(status_source, status_code=401, action="401")
            results.append({
                **item,
                "email": infer_auth_email(item),
                "status_code": 401,
                "ok": False,
                "action": "401",
                "message": message,
                "raw_message": raw_message,
            })
        else:
            results.append(cpa_probe_status(base_url, management_key, item))
    diagnosis_targets = [
        item for item in results
        if item.get("action") != "ready" or coerce_text(item.get("status_code")) in {"401", "403", "429"}
    ]
    diagnosed = [diagnose_cpa_candidate(base_url, management_key, item) for item in diagnosis_targets]
    surfaced = [
        item for item in diagnosed
        if item.get("refreshable")
        or item.get("status") in {"active", "refreshed", "rt_rotated", "banned", "risk_blocked", "usage_limit_reached", "rt_invalid", "session_expired", "needs_login", "probe_failed", "not_openai_auth"}
    ]
    refreshable_count = len([item for item in diagnosed if item.get("refreshable")])
    error_count = len([
        item for item in surfaced
        if item.get("status") not in {"active", "refreshed", "rt_rotated", "not_openai_auth"}
    ])
    return {
        "success": True,
        "total": len(candidates),
        "available_total": available_total,
        "max_items": max_items,
        "candidates": surfaced,
        "results": results,
        "diagnostics": diagnosed,
        "summary": {
            "total": len(candidates),
            "available_total": available_total,
            "candidates": len(surfaced),
            "error_accounts": error_count,
            "diagnosed": len(diagnosed),
            "credential_ok": len([item for item in diagnosed if item.get("status") in {"active", "refreshed", "rt_rotated"}]),
            "needs_login": refreshable_count,
            "refreshable": refreshable_count,
            "unscanned": max(0, available_total - len(candidates)),
            "banned": len([item for item in diagnosed if item.get("status") == "banned"]),
            "risk": len([item for item in diagnosed if item.get("status") == "risk_blocked"]),
            "limited": len([item for item in diagnosed if item.get("status") == "usage_limit_reached"]),
            "uploaded": 0,
            "deleted": 0,
            "failed": len([item for item in results if item.get("action") == "probe_failed"]),
            "skipped": len([item for item in results if item.get("action") == "skipped"]),
        },
    }


def repair_cpa_401(payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(payload.get("items"), list) and payload["items"]:
        scanned = {"candidates": payload["items"], "summary": {"total": len(payload["items"])}}
    else:
        scanned = scan_cpa_401(payload)
    base_url = normalize_cpa_base_url(coerce_text(payload.get("base_url") or payload.get("baseUrl")) or "http://localhost:8317")
    management_key = coerce_text(payload.get("management_key") or payload.get("managementKey"))
    validate_cpa_base_url(base_url)
    results = []
    uploaded = 0
    deleted = 0
    failed = 0
    for item in scanned.get("candidates", []):
        row = dict(item)
        name = coerce_text(row.get("name") or row.get("id"))
        auth_file: dict[str, Any] = {}
        try:
            if name and not row.get("runtime_only"):
                auth_file = cpa_download_auth_file(base_url, management_key, name)
        except Exception as exc:
            row["download_error"] = str(exc)[:240]
        email_addr = infer_auth_email(row, auth_file)
        row["email"] = email_addr or coerce_text(row.get("email") or row.get("account"))
        if not row.get("runtime_only") and not looks_like_openai_auth_file(row, auth_file):
            results.append({**row, "ok": False, "action": "skipped", "message": "不是 Codex/OpenAI 凭证，已跳过"})
            continue
        if "@" not in row["email"]:
            results.append({**row, "ok": False, "action": "skipped", "message": "无法从 CPA 凭证识别邮箱"})
            continue
        try:
            login_payload = build_cpa_repair_login_payload(payload, row)
            session_payload = run_chatgpt_login_with_protocol("_warehouse_sync", {**login_payload, "login_strategy": "protocol"})
            new_auth = session_to_cpa_auth(
                session_payload,
                {"email": row["email"], "name": name or row["email"], "auth_index": row.get("auth_index")},
                require_refresh_token=True,
            )
            upload = cpa_upload_auth_file(base_url, management_key, name or row["email"], new_auth)
            if not upload.get("uploaded"):
                raise RuntimeError(upload.get("error") or "上传失败")
            uploaded += 1
            results.append({**row, "ok": True, "action": "uploaded", "message": "重登成功，已上传新 CPA 凭证", "auth_file": new_auth, "upload": upload})
        except Exception as exc:
            failed += 1
            message = str(exc)[:500]
            lowered = message.lower()
            if any(word in lowered for word in ["deactivated", "disabled", "banned", "suspended", "账号已停用", "deleted or deactivated"]):
                delete_result = cpa_delete_auth_file(base_url, management_key, name)
                if delete_result.get("deleted"):
                    deleted += 1
                    results.append({**row, "ok": True, "action": "deleted_deactivated", "message": "账号已停用，已删除 CPA 凭证"})
                    continue
            results.append({**row, "ok": False, "action": "login_failed", "message": f"重新登录失败：{message}"})
    return {
        "success": True,
        "results": results,
        "summary": {
            "total": scanned.get("summary", {}).get("total", 0),
            "candidates": len(scanned.get("candidates", [])),
            "uploaded": uploaded,
            "deleted": deleted,
            "failed": failed,
            "skipped": 0,
        },
    }


def delete_cpa_items(payload: dict[str, Any]) -> dict[str, Any]:
    base_url = normalize_cpa_base_url(coerce_text(payload.get("base_url") or payload.get("baseUrl")) or "http://localhost:8317")
    management_key = coerce_text(payload.get("management_key") or payload.get("managementKey"))
    if not management_key:
        raise RuntimeError("CPA 管理密钥不能为空")
    validate_cpa_base_url(base_url)
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    results = []
    deleted = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        name = coerce_text(item.get("name") or item.get("id"))
        row = dict(item)
        if not name:
            results.append({**row, "ok": False, "action": "delete_failed", "message": "缺少 CPA 凭证名称"})
            continue
        outcome = cpa_delete_auth_file(base_url, management_key, name)
        if outcome.get("deleted"):
            deleted += 1
            results.append({**row, "ok": True, "action": "deleted", "message": "已删除 CPA 凭证"})
        else:
            results.append({**row, "ok": False, "action": "delete_failed", "message": outcome.get("error") or "删除失败"})
    return {
        "success": True,
        "results": results,
        "summary": {
            "total": len(items),
            "candidates": len(items),
            "uploaded": 0,
            "deleted": deleted,
            "failed": len(items) - deleted,
            "skipped": 0,
        },
    }


def build_cpa_repair_login_payload(base_payload: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    email_addr = coerce_text(row.get("email") or row.get("account"))
    accounts = [item for item in base_payload.get("accounts", []) if isinstance(item, dict) and coerce_text(item.get("email")).lower() == email_addr.lower()]
    temp_addresses = [item for item in base_payload.get("temp_addresses", []) if isinstance(item, dict) and coerce_text(item.get("email")).lower() == email_addr.lower()]
    force_email_code = str(first_text(
        base_payload.get("force_email_code"),
        base_payload.get("forceEmailCode"),
        base_payload.get("email_code_login"),
        base_payload.get("emailCodeLogin"),
    )).lower() in {"1", "true", "yes", "on"}
    password = "" if force_email_code else first_text(
        base_payload.get("password"),
        row.get("password"),
        *(item.get("password") for item in accounts),
    )
    if not accounts and not temp_addresses:
        raise RuntimeError("本地没有匹配的邮箱取件凭证")
    return {
        **base_payload,
        "login_only": True,
        "email": email_addr,
        "password": password,
        "force_email_code": force_email_code,
        "email_code_login": force_email_code,
        "name": row.get("name") or email_addr,
        "row": row,
        "accounts": accounts,
        "temp_addresses": temp_addresses,
    }


def replace_cpa_auth_file(payload: dict[str, Any]) -> dict[str, Any]:
    base_url = normalize_cpa_base_url(coerce_text(payload.get("base_url") or payload.get("baseUrl")) or "http://localhost:8317")
    management_key = coerce_text(payload.get("management_key") or payload.get("managementKey"))
    if not management_key:
        raise RuntimeError("CPA 管理密钥不能为空")
    validate_cpa_base_url(base_url)
    auth_file = payload.get("auth_file") or payload.get("authFile")
    if not isinstance(auth_file, dict):
        raise RuntimeError("新的 CPA auth JSON 不能为空")
    name = coerce_text(payload.get("name") or payload.get("filename") or payload.get("old_name") or payload.get("oldName"))
    upload = cpa_upload_auth_file(base_url, management_key, name, auth_file)
    if not upload.get("uploaded"):
        return {
            "success": False,
            "error": upload.get("error") or "上传失败",
            "upload": upload,
        }

    files = cpa_list_auth_files(base_url, management_key)
    uploaded_name = coerce_text(upload.get("name"))
    email_addr = coerce_text(auth_file.get("email"))
    matched = next((
        item for item in files
        if coerce_text(item.get("name") or item.get("id")).lower() == uploaded_name.lower()
    ), None)
    if matched is None and email_addr:
        matched = next((
            item for item in files
            if coerce_text(item.get("email") or item.get("account")).lower() == email_addr.lower()
        ), None)
    probe = cpa_probe_status(base_url, management_key, matched) if matched else {}
    return {
        "success": True,
        "upload": upload,
        "result": {
            "name": uploaded_name,
            "email": email_addr,
            "action": "replaced",
            "message": "已上传并覆盖 auth file",
            "ok": True,
            "probe": probe,
        },
        "summary": {
            "total": 1,
            "candidates": 0 if probe.get("status_code") != 401 else 1,
            "uploaded": 1,
            "deleted": 0,
            "failed": 0,
            "skipped": 0,
        },
    }


def normal_plan_type(value: str) -> str:
    raw = coerce_text(value).lower()
    if not raw:
        return ""
    if "team" in raw:
        return "team"
    if "pro" in raw and "plus" not in raw:
        return "pro"
    if "plus" in raw:
        return "plus"
    if "free" in raw:
        return "free"
    return raw[:40]


def access_token_email(token: str) -> str:
    payload = jwt_payload(token)
    profile = payload.get("https://api.openai.com/profile")
    if isinstance(profile, dict):
        return coerce_text(profile.get("email")).lower()
    return coerce_text(payload.get("email")).lower()


def access_token_plan_type(token: str) -> str:
    payload = jwt_payload(token)
    auth = payload.get("https://api.openai.com/auth")
    if isinstance(auth, dict):
        return normal_plan_type(auth.get("chatgpt_plan_type"))
    return ""


def access_token_expires_at(token: str) -> str:
    payload = jwt_payload(token)
    exp = payload.get("exp")
    if isinstance(exp, (int, float)):
        return datetime.fromtimestamp(exp, timezone.utc).isoformat(timespec="seconds")
    return ""


def openai_error_fields(data: dict[str, Any], raw: str) -> dict[str, Any]:
    err_obj = data.get("error") if isinstance(data, dict) else {}
    if not isinstance(err_obj, dict):
        err_obj = {}
    return {
        "code": first_text(err_obj.get("code"), data.get("code") if isinstance(data, dict) else ""),
        "type": first_text(err_obj.get("type"), data.get("type") if isinstance(data, dict) else ""),
        "message": first_text(err_obj.get("message"), data.get("message") if isinstance(data, dict) else "", raw),
        "plan_type": normal_plan_type(first_text(err_obj.get("plan_type"), data.get("plan_type") if isinstance(data, dict) else "")),
        "resets_at": err_obj.get("resets_at"),
        "resets_in_seconds": err_obj.get("resets_in_seconds"),
    }


def usage_limit_message(fields: dict[str, Any]) -> str:
    plan = fields.get("plan_type") or "unknown"
    parts = [f"OpenAI 已接受凭证，但账号额度已用完（{plan}）"]
    resets_at = fields.get("resets_at")
    try:
        reset_seconds = int(resets_at)
    except (TypeError, ValueError):
        reset_seconds = 0
    if reset_seconds > 0:
        reset_time = datetime.fromtimestamp(reset_seconds, timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        parts.append(f"重置时间：{reset_time}")
    resets_in = fields.get("resets_in_seconds")
    try:
        wait_seconds = int(resets_in)
    except (TypeError, ValueError):
        wait_seconds = 0
    if wait_seconds > 0:
        hours = wait_seconds // 3600
        minutes = (wait_seconds % 3600) // 60
        if hours:
            parts.append(f"约 {hours} 小时 {minutes} 分钟后重置")
        else:
            parts.append(f"约 {minutes} 分钟后重置")
    return "；".join(parts)


def refresh_openai_with_rt(refresh_token: str) -> tuple[int, dict[str, Any], str]:
    return http_request_form_json(
        OPENAI_OAUTH_TOKEN_URL,
        form_data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": OPENAI_CODEX_CLIENT_ID,
            "scope": OPENAI_OAUTH_REFRESH_SCOPE,
        },
        headers={"Accept": "application/json"},
        timeout=45,
    )


def oauth_base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def generate_openai_code_verifier() -> str:
    return secrets.token_hex(64)


def openai_code_challenge(code_verifier: str) -> str:
    return oauth_base64url(hashlib.sha256(code_verifier.encode("ascii")).digest())


def build_openai_oauth_authorize_url(state: str, code_challenge: str) -> str:
    params = urllib.parse.urlencode({
        "response_type": "code",
        "client_id": OPENAI_CODEX_CLIENT_ID,
        "redirect_uri": OPENAI_OAUTH_REDIRECT_URI,
        "scope": OPENAI_OAUTH_SCOPE,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "id_token_add_organizations": "true",
        "codex_cli_simplified_flow": "true",
    })
    return f"{OPENAI_OAUTH_AUTHORIZE_URL}?{params}"


def build_chatgpt_login_url(email_addr: str = "") -> str:
    if not email_addr:
        return CHATGPT_LOGIN_URL
    separator = "&" if "?" in CHATGPT_LOGIN_URL else "?"
    return f"{CHATGPT_LOGIN_URL}{separator}{urllib.parse.urlencode({'email': email_addr})}"


def create_manual_oauth_login(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    state = secrets.token_urlsafe(32)
    code_verifier = generate_openai_code_verifier()
    authorize_url = build_openai_oauth_authorize_url(state, openai_code_challenge(code_verifier))
    return {
        "success": True,
        "authorize_url": authorize_url,
        "state": state,
        "code_verifier": code_verifier,
        "redirect_uri": OPENAI_OAUTH_REDIRECT_URI,
        "email": coerce_text(payload.get("email")),
    }


def extract_oauth_callback_code(callback_url: str, expected_state: str = "") -> str:
    parsed = urllib.parse.urlparse(coerce_text(callback_url))
    query = urllib.parse.parse_qs(parsed.query)
    error = first_text(query.get("error", [""])[0], query.get("error_description", [""])[0])
    if error:
        raise RuntimeError(f"OpenAI OAuth 授权失败：{error}")
    returned_state = first_text(query.get("state", [""])[0])
    if expected_state and returned_state and returned_state != expected_state:
        raise RuntimeError("OpenAI OAuth state 校验失败，请重新生成授权链接")
    code = first_text(query.get("code", [""])[0])
    if not code:
        raise RuntimeError("回调 URL 里没有 code，请确认粘贴的是 http://localhost:1455/auth/callback?... 完整地址")
    return code


def complete_manual_oauth_login(payload: dict[str, Any]) -> dict[str, Any]:
    code = extract_oauth_callback_code(coerce_text(payload.get("callback_url") or payload.get("callbackUrl")), coerce_text(payload.get("state")))
    code_verifier = coerce_text(payload.get("code_verifier") or payload.get("codeVerifier"))
    result = complete_oauth_code_payload(payload, code, code_verifier)
    result["manual_oauth"] = True
    if isinstance(result.get("result"), dict):
        result["result"]["manual_oauth"] = True
    return result


def complete_oauth_code_payload(payload: dict[str, Any], code: str, code_verifier: str) -> dict[str, Any]:
    if not code:
        raise RuntimeError("缺少 OAuth authorization code")
    if not code_verifier:
        raise RuntimeError("缺少 code_verifier，请重新生成授权链接")
    proxy_url = request_proxy_url(payload)
    status, data, raw = exchange_openai_oauth_code(code, code_verifier, proxy_url=proxy_url)
    if status != 200:
        compact = protocol_compact_error(data) or raw[:260]
        raise RuntimeError(f"OpenAI OAuth token exchange 失败：HTTP {status} - {compact}")
    if not coerce_text(data.get("refresh_token")):
        raise RuntimeError("OpenAI OAuth token exchange 成功，但返回里没有 refresh_token")
    session = merge_session_with_oauth({}, data)
    email_addr = coerce_text(payload.get("email")) or access_token_email(session.get("access_token", ""))
    if email_addr:
        session["email"] = email_addr
        session["user"] = {**(session.get("user") if isinstance(session.get("user"), dict) else {}), "email": email_addr}
    auth_file = session_to_cpa_auth(
        session,
        payload.get("row") if isinstance(payload.get("row"), dict) else {"email": email_addr},
        require_refresh_token=True,
    )
    append_refresh_result(auth_file, email=auth_file.get("email") or email_addr, job_id=coerce_text(payload.get("job_id")))
    row = payload.get("row") if isinstance(payload.get("row"), dict) else {}
    base_url = coerce_text(payload.get("base_url") or payload.get("baseUrl") or row.get("cpa_base_url") or row.get("base_url"))
    management_key = coerce_text(
        payload.get("management_key")
        or payload.get("managementKey")
        or row.get("cpa_management_key")
        or row.get("management_key")
    )
    if payload.get("require_cpa_update") and not (base_url and management_key):
        raise RuntimeError("缺少 CPA 地址或管理密钥，无法直接导出到 CPA")
    if base_url and management_key:
        cpa_name = first_text(
            payload.get("name"),
            row.get("cpa_name"),
            row.get("name"),
            row.get("auth_index"),
            auth_file.get("name"),
            auth_file.get("email"),
        )
        result = replace_cpa_auth_file({
            "base_url": base_url,
            "management_key": management_key,
            "name": cpa_name,
            "auth_file": auth_file,
        })
        if not result.get("success"):
            raise RuntimeError(result.get("error") or "CPA 上传失败")
        result["auth_file"] = auth_file
        result["cpa_update"] = True
        result["local_oauth"] = True
        if isinstance(result.get("result"), dict):
            result["result"]["auth_file"] = auth_file
            result["result"]["local_oauth"] = True
        return result
    return {
        "success": True,
        "cpa_update": False,
        "auth_file": auth_file,
        "result": {
            "email": auth_file.get("email"),
            "name": auth_file.get("name"),
            "auth_file": auth_file,
            "message": "已生成 OAuth RT；未配置 CPA，未上传",
            "ok": True,
        },
    }


def create_local_oauth_flow(payload: dict[str, Any]) -> dict[str, Any]:
    start_local_oauth_callback_server()
    state = secrets.token_urlsafe(32)
    code_verifier = generate_openai_code_verifier()
    authorize_url = build_openai_oauth_authorize_url(state, openai_code_challenge(code_verifier))
    with LOCAL_OAUTH_LOCK:
        LOCAL_OAUTH_FLOWS[state] = {
            "state": state,
            "code_verifier": code_verifier,
            "payload": payload,
            "status": "pending",
            "created_at": iso_now(),
            "updated_at": iso_now(),
            "authorize_url": authorize_url,
            "result": None,
            "error": "",
        }
    return {
        "success": True,
        "state": state,
        "code_verifier": code_verifier,
        "authorize_url": authorize_url,
        "redirect_uri": OPENAI_OAUTH_REDIRECT_URI,
        "callback_port": LOCAL_OAUTH_PORT,
    }


def get_local_oauth_flow(state: str) -> dict[str, Any]:
    with LOCAL_OAUTH_LOCK:
        flow = LOCAL_OAUTH_FLOWS.get(coerce_text(state))
        if not flow:
            raise RuntimeError("本机 OAuth 流程不存在或已过期")
        return {
            "success": True,
            "flow": {
                "state": flow.get("state"),
                "status": flow.get("status"),
                "created_at": flow.get("created_at"),
                "updated_at": flow.get("updated_at"),
                "authorize_url": flow.get("authorize_url"),
                "result": flow.get("result"),
                "error": flow.get("error", ""),
            },
        }


def handle_local_oauth_callback(path: str) -> tuple[int, str]:
    parsed = urllib.parse.urlparse(path)
    query = urllib.parse.parse_qs(parsed.query)
    state = first_text(query.get("state", [""])[0])
    code = first_text(query.get("code", [""])[0])
    error = first_text(query.get("error", [""])[0], query.get("error_description", [""])[0])
    with LOCAL_OAUTH_LOCK:
        flow = LOCAL_OAUTH_FLOWS.get(state)
    if not flow:
        return 400, "授权回调未匹配到工具中的流程，请回到工具重新生成链接。"
    if error:
        with LOCAL_OAUTH_LOCK:
            flow["status"] = "failed"
            flow["error"] = error
            flow["updated_at"] = iso_now()
        return 400, f"OpenAI OAuth 授权失败：{error}"
    try:
        result = complete_oauth_code_payload(flow.get("payload") or {}, code, coerce_text(flow.get("code_verifier")))
        with LOCAL_OAUTH_LOCK:
            flow["status"] = "success"
            flow["result"] = result
            flow["error"] = ""
            flow["updated_at"] = iso_now()
        return 200, "授权完成，refresh_token 已换取并导出到 CPA。可以关闭这个页面，回到工具查看结果。"
    except Exception as exc:
        with LOCAL_OAUTH_LOCK:
            flow["status"] = "failed"
            flow["error"] = str(exc)[:500]
            flow["updated_at"] = iso_now()
        return 500, f"授权回调处理失败：{str(exc)[:500]}"


class LocalOAuthCallbackHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        return

    def do_GET(self) -> None:
        if urllib.parse.urlparse(self.path).path != "/auth/callback":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        status, message = handle_local_oauth_callback(self.path)
        body = f"""<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>OAuth 回调</title>
<style>body{{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0f172a;color:#e5e7eb;display:grid;place-items:center;min-height:100vh;margin:0}}main{{max-width:720px;padding:32px;border:1px solid #334155;border-radius:12px;background:#111827}}h1{{font-size:22px}}p{{line-height:1.7;color:#cbd5e1}}</style></head>
<body><main><h1>{'授权完成' if status < 400 else '授权失败'}</h1><p>{html.escape(message)}</p></main></body></html>""".encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_local_oauth_callback_server() -> None:
    global LOCAL_OAUTH_SERVER, LOCAL_OAUTH_THREAD
    with LOCAL_OAUTH_LOCK:
        if LOCAL_OAUTH_SERVER:
            return
        server = ThreadingHTTPServer(("127.0.0.1", LOCAL_OAUTH_PORT), LocalOAuthCallbackHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        LOCAL_OAUTH_SERVER = server
        LOCAL_OAUTH_THREAD = thread


def exchange_openai_oauth_code(
    code: str,
    code_verifier: str,
    *,
    proxy_url: str = "",
) -> tuple[int, dict[str, Any], str]:
    return http_request_form_json(
        OPENAI_OAUTH_TOKEN_URL,
        form_data={
            "grant_type": "authorization_code",
            "client_id": OPENAI_CODEX_CLIENT_ID,
            "code": code,
            "redirect_uri": OPENAI_OAUTH_REDIRECT_URI,
            "code_verifier": code_verifier,
        },
        headers={
            "Accept": "application/json",
            "User-Agent": CPA_PROBE_USER_AGENT,
        },
        timeout=60,
        proxy_url=proxy_url,
    )


def refresh_openai_with_session_token(session_token: str) -> tuple[int, dict[str, Any], str]:
    cookie = f"__Secure-next-auth.session-token={session_token}; __Secure-authjs.session-token={session_token}"
    return http_get_json_status(
        CHATGPT_SESSION_URL,
        headers={
            "Accept": "application/json",
            "Cookie": cookie,
            "Referer": "https://chatgpt.com/",
        },
        timeout=45,
    )


def probe_openai_access_token(access_token: str) -> dict[str, Any]:
    if not access_token:
        return {"status": "needs_login", "message": "缺少 access_token"}
    status, data, raw = http_get_json_status(
        CHATGPT_CHECK_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Referer": "https://chatgpt.com/",
        },
        timeout=35,
    )
    result: dict[str, Any] = {
        "http_status": status,
        "status": "unknown",
        "plan_type": access_token_plan_type(access_token),
        "message": f"HTTP {status}",
    }
    if status == 200:
        account = data.get("accounts", {}).get("default") if isinstance(data.get("accounts"), dict) else {}
        entitlement = account.get("entitlement") if isinstance(account, dict) else {}
        plan = ""
        if isinstance(entitlement, dict):
            plan = normal_plan_type(entitlement.get("subscription_plan"))
            if not plan and entitlement.get("has_active_subscription") is False:
                plan = "free"
        result.update({
            "status": "active",
            "plan_type": plan or result["plan_type"] or "unknown",
            "message": "账号可用",
        })
    elif status == 401:
        result.update({"status": "session_expired", "message": "access_token 已过期或被撤销"})
    elif status == 403:
        text = json.dumps(data, ensure_ascii=False) if data else raw
        lowered = text.lower()
        state = "banned" if any(word in lowered for word in ["banned", "deactivated", "disabled", "封禁", "停用"]) else "risk_blocked"
        result.update({"status": state, "message": "账号封禁/停用或触发风控"})
    elif status == 429:
        fields = openai_error_fields(data, raw)
        lowered = " ".join(coerce_text(fields.get(key)).lower() for key in ("code", "type", "message"))
        if "usage_limit_reached" in lowered or "usage limit has been reached" in lowered:
            result.update({
                "status": "usage_limit_reached",
                "plan_type": fields.get("plan_type") or result["plan_type"] or "free",
                "message": usage_limit_message(fields),
                "credential_ok": True,
                "usable": False,
                "resets_at": fields.get("resets_at"),
                "resets_in_seconds": fields.get("resets_in_seconds"),
            })
        else:
            result.update({"status": "probe_failed", "message": f"OpenAI 探测暂不可用：HTTP {status}"})
    elif status in {500, 502, 503, 504}:
        result.update({"status": "probe_failed", "message": f"OpenAI 探测暂不可用：HTTP {status}"})
    else:
        result.update({"status": "probe_failed", "message": f"OpenAI 探测失败：HTTP {status}"})
    return result


def lifecycle_status_label(status: str) -> str:
    return {
        "active": "可用",
        "refreshed": "已刷新",
        "rt_rotated": "已刷新并轮换 RT",
        "rt_invalid": "RT 失效",
        "session_expired": "会话失效",
        "banned": "封禁/停用",
        "risk_blocked": "风控/受限",
        "usage_limit_reached": "额度耗尽",
        "needs_login": "需要重新授权",
        "probe_failed": "探测失败",
        "not_openai_auth": "非 OpenAI 凭证",
        "mail_ok": "邮箱可用",
        "mail_dead": "邮箱不可用",
    }.get(status, status or "未知")


def classify_oauth_error(status: int, data: dict[str, Any], raw: str) -> tuple[str, str]:
    err_obj = data.get("error")
    if isinstance(err_obj, dict):
        err = first_text(err_obj.get("code"), err_obj.get("type"), err_obj.get("error"))
        desc = first_text(err_obj.get("message"), data.get("error_description"), data.get("message"), data.get("detail"), raw)
    else:
        err = coerce_text(err_obj)
        desc = first_text(data.get("error_description"), data.get("message"), data.get("detail"), raw)
    lowered = f"{err} {desc}".lower()
    if err in {"invalid_grant", "invalid_client", "unauthorized_client", "invalid_request", "token_expired"} or status in {400, 401}:
        if any(word in lowered for word in ["deactivated", "disabled", "banned", "suspended", "封禁", "停用"]):
            return "banned", desc or err or f"HTTP {status}"
        return "rt_invalid", desc or err or f"HTTP {status}"
    if status == 403:
        return "risk_blocked", desc or "OpenAI 拒绝刷新请求"
    return "probe_failed", desc or f"HTTP {status}"


def lifecycle_source_auth(source: dict[str, Any]) -> dict[str, Any]:
    auth = source.get("auth_file") if isinstance(source.get("auth_file"), dict) else {}
    if not auth and isinstance(source.get("authFile"), dict):
        auth = source["authFile"]
    if not auth and isinstance(source.get("session_json"), dict):
        auth = source["session_json"]
    if not auth:
        auth = source
    return auth if isinstance(auth, dict) else {}


def normalize_lifecycle_item(item: dict[str, Any]) -> dict[str, Any]:
    auth = lifecycle_source_auth(item)
    tokens = auth.get("tokens") if isinstance(auth.get("tokens"), dict) else {}
    credentials = auth.get("credentials") if isinstance(auth.get("credentials"), dict) else {}
    token = auth.get("token") if isinstance(auth.get("token"), dict) else {}
    row = item.get("row") if isinstance(item.get("row"), dict) else {}
    email_addr = first_text(
        item.get("email"),
        auth.get("email"),
        auth.get("account"),
        auth.get("name"),
        credentials.get("email"),
        row.get("email"),
        row.get("account"),
    )
    name = first_text(item.get("name"), row.get("name"), auth.get("name"), email_addr)
    return {
        "email": email_addr,
        "name": name,
        "source": coerce_text(item.get("source") or auth.get("source") or "manual"),
        "row": row,
        "auth_index": first_text(item.get("auth_index"), row.get("auth_index"), auth.get("auth_index")),
        "access_token": first_text(
            item.get("access_token"),
            item.get("accessToken"),
            auth.get("access_token"),
            auth.get("accessToken"),
            tokens.get("access_token"),
            tokens.get("accessToken"),
            token.get("access_token"),
            credentials.get("access_token"),
        ),
        "refresh_token": first_text(
            item.get("chatgpt_refresh_token"),
            item.get("openai_refresh_token"),
            item.get("codex_refresh_token"),
            item.get("refresh_token"),
            item.get("refreshToken"),
            auth.get("chatgpt_refresh_token"),
            auth.get("openai_refresh_token"),
            auth.get("codex_refresh_token"),
            auth.get("refresh_token"),
            auth.get("refreshToken"),
            tokens.get("refresh_token"),
            tokens.get("refreshToken"),
            token.get("refresh_token"),
            credentials.get("refresh_token"),
        ),
        "session_token": first_text(
            item.get("session_token"),
            item.get("sessionToken"),
            auth.get("session_token"),
            auth.get("sessionToken"),
            tokens.get("session_token"),
            tokens.get("sessionToken"),
            token.get("session_token"),
            credentials.get("session_token"),
        ),
        "id_token": first_text(
            item.get("id_token"),
            item.get("idToken"),
            auth.get("id_token"),
            auth.get("idToken"),
            tokens.get("id_token"),
            tokens.get("idToken"),
            token.get("id_token"),
            credentials.get("id_token"),
        ),
        "original_auth": auth,
    }


def refresh_lifecycle_item(item: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_lifecycle_item(item)
    email_addr = normalized["email"]
    result: dict[str, Any] = {
        "email": email_addr,
        "name": normalized["name"],
        "source": normalized["source"],
        "auth_index": normalized["auth_index"],
        "status": "needs_login",
        "status_label": lifecycle_status_label("needs_login"),
        "message": "缺少 ChatGPT/Codex refresh_token、session_token 或 access_token",
        "ok": False,
        "plan_type": "",
        "access_token_updated": False,
        "refresh_token_rotated": False,
        "auth_file": None,
    }

    session_payload: dict[str, Any] | None = None
    if normalized["refresh_token"]:
        status, data, raw = refresh_openai_with_rt(normalized["refresh_token"])
        if status == 200 and data.get("access_token"):
            new_rt = coerce_text(data.get("refresh_token")) or normalized["refresh_token"]
            session_payload = {
                "email": email_addr,
                "access_token": coerce_text(data.get("access_token")),
                "refresh_token": new_rt,
                "id_token": first_text(data.get("id_token"), normalized["id_token"]),
                "session_token": normalized["session_token"],
                "expires_at": access_token_expires_at(coerce_text(data.get("access_token"))),
            }
            result.update({
                "status": "rt_rotated" if new_rt != normalized["refresh_token"] else "refreshed",
                "message": "refresh_token 已刷新出新的 access_token",
                "ok": True,
                "access_token_updated": True,
                "refresh_token_rotated": new_rt != normalized["refresh_token"],
            })
        else:
            status_name, message = classify_oauth_error(status, data, raw)
            result.update({
                "status": status_name,
                "message": message,
                "ok": False,
            })
    elif normalized["session_token"]:
        status, data, raw = refresh_openai_with_session_token(normalized["session_token"])
        if status == 200 and first_text(data.get("accessToken"), data.get("access_token")):
            session_payload = dict(data)
            session_payload.setdefault("session_token", normalized["session_token"])
            session_payload.setdefault("refresh_token", normalized["refresh_token"])
            session_payload.setdefault("id_token", normalized["id_token"])
            session_payload.setdefault("email", email_addr)
            result.update({
                "status": "refreshed",
                "message": "session_token 已刷新出新的 access_token",
                "ok": True,
                "access_token_updated": True,
            })
        elif status == 401:
            result.update({"status": "session_expired", "message": "session_token 已失效", "ok": False})
        elif status == 403:
            result.update({"status": "risk_blocked", "message": "session_token 探测触发风控或被拒绝", "ok": False})
        else:
            result.update({"status": "probe_failed", "message": first_text(data.get("error"), data.get("message"), raw, f"HTTP {status}"), "ok": False})
    elif normalized["access_token"]:
        probe = probe_openai_access_token(normalized["access_token"])
        result.update({
            "status": probe["status"],
            "message": probe["message"],
            "ok": bool(probe.get("credential_ok")) or probe["status"] == "active",
            "plan_type": probe.get("plan_type") or "",
        })
        if result["ok"]:
            session_payload = {
                "email": email_addr,
                "access_token": normalized["access_token"],
                "refresh_token": normalized["refresh_token"],
                "id_token": normalized["id_token"],
                "session_token": normalized["session_token"],
                "expires_at": access_token_expires_at(normalized["access_token"]),
            }

    if session_payload:
        try:
            fallback = dict(normalized["row"] or {})
            fallback.setdefault("email", email_addr)
            fallback.setdefault("name", normalized["name"])
            auth_file = session_to_cpa_auth(session_payload, fallback)
            if normalized["original_auth"]:
                auth_file = {**normalized["original_auth"], **auth_file}
            probe = probe_openai_access_token(coerce_text(auth_file.get("access_token")))
            result["probe"] = probe
            if probe.get("status") in {"active", "risk_blocked", "banned", "session_expired", "usage_limit_reached"}:
                result["plan_type"] = probe.get("plan_type") or auth_file.get("plan_type") or result.get("plan_type") or ""
                if probe["status"] == "banned":
                    result.update({"status": probe["status"], "message": probe["message"], "ok": False})
                elif probe["status"] == "usage_limit_reached":
                    result.update({"status": probe["status"], "message": probe["message"], "ok": True})
            result["auth_file"] = auth_file
            result["email"] = auth_file.get("email") or result["email"]
            result["name"] = auth_file.get("name") or result["name"]
            result["expires_at"] = auth_file.get("expired", "")
        except Exception as exc:
            result.update({
                "status": "probe_failed",
                "message": f"刷新成功但转换 CPA auth 失败：{str(exc)[:220]}",
                "ok": False,
            })

    result["status_label"] = lifecycle_status_label(result["status"])
    return result


def lifecycle_summary(results: list[dict[str, Any]], uploaded: int = 0) -> dict[str, Any]:
    return {
        "total": len(results),
        "active": sum(1 for item in results if item.get("ok")),
        "refreshed": sum(1 for item in results if item.get("status") in {"refreshed", "rt_rotated", "active"}),
        "invalid": sum(1 for item in results if item.get("status") in {"rt_invalid", "session_expired"}),
        "banned": sum(1 for item in results if item.get("status") == "banned"),
        "risk": sum(1 for item in results if item.get("status") == "risk_blocked"),
        "needs_login": sum(1 for item in results if item.get("status") == "needs_login"),
        "failed": sum(1 for item in results if not item.get("ok")),
        "uploaded": uploaded,
    }


def refresh_lifecycle(payload: dict[str, Any]) -> dict[str, Any]:
    items = payload.get("items")
    if not isinstance(items, list):
        items = []
    if isinstance(payload.get("auth_file"), dict):
        items.append({"auth_file": payload["auth_file"], "row": payload.get("row") if isinstance(payload.get("row"), dict) else {}})
    if isinstance(payload.get("session_json"), dict):
        items.append({"session_json": payload["session_json"], "row": payload.get("row") if isinstance(payload.get("row"), dict) else {}})
    if not items:
        return {"success": True, "results": [], "summary": lifecycle_summary([])}

    max_items = max(1, min(int(payload.get("max_items") or payload.get("maxItems") or len(items) or 1), 100))
    results = [refresh_lifecycle_item(item) for item in items[:max_items] if isinstance(item, dict)]
    return {"success": True, "results": results, "summary": lifecycle_summary(results)}


def refresh_cpa_lifecycle(payload: dict[str, Any]) -> dict[str, Any]:
    base_url, management_key, max_items, candidates, _available_total = cpa_candidates(payload)
    upload_success = bool(payload.get("upload_success") or payload.get("uploadSuccess"))
    only_401 = bool(payload.get("only_401", True))
    rows = candidates
    if only_401:
        probe_rows = [cpa_probe_status(base_url, management_key, item) for item in candidates]
        by_name = {coerce_text(item.get("name")).lower(): item for item in probe_rows}
        rows = []
        for item in candidates:
            name = coerce_text(item.get("name") or item.get("id"))
            probe = by_name.get(name.lower())
            if probe and probe.get("status_code") != 401:
                continue
            rows.append({**item, **(probe or {})})

    results: list[dict[str, Any]] = []
    uploaded = 0
    for row in rows[:max_items]:
        name = coerce_text(row.get("name") or row.get("id"))
        auth_file: dict[str, Any] = {}
        if name:
            try:
                auth_file = cpa_download_auth_file(base_url, management_key, name)
            except Exception as exc:
                results.append({
                    "name": name,
                    "email": coerce_text(row.get("email") or row.get("account")),
                    "status": "probe_failed",
                    "status_label": lifecycle_status_label("probe_failed"),
                    "message": f"下载 CPA auth 失败：{str(exc)[:220]}",
                    "ok": False,
                    "auth_file": None,
                })
                continue
        merged = {"auth_file": auth_file or row, "row": row, "name": name or coerce_text(row.get("email"))}
        result = refresh_lifecycle_item(merged)
        result["name"] = name or result.get("name")
        if upload_success and result.get("ok") and isinstance(result.get("auth_file"), dict):
            upload = cpa_upload_auth_file(base_url, management_key, name or result.get("name", ""), result["auth_file"])
            result["upload"] = upload
            if upload.get("uploaded"):
                uploaded += 1
                result["action"] = "uploaded"
                result["message"] = f"{result.get('message', '刷新成功')}，已推送 CPA"
            else:
                result["ok"] = False
                result["status"] = "probe_failed"
                result["message"] = upload.get("error") or "推送 CPA 失败"
        results.append(result)

    return {
        "success": True,
        "results": results,
        "summary": lifecycle_summary(results, uploaded=uploaded),
    }


def login_job_public(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": job.get("job_id"),
        "status": job.get("status"),
        "email": job.get("email", ""),
        "name": job.get("name", ""),
        "logs": list(job.get("logs", []))[-LOGIN_LOG_LIMIT:],
        "result": job.get("result"),
        "error": job.get("error", ""),
        "error_code": job.get("error_code", ""),
        "error_hint": job.get("error_hint", ""),
        "retryable": job.get("retryable", True),
        "http_status": job.get("http_status"),
        "created_at": job.get("created_at", ""),
        "updated_at": job.get("updated_at", ""),
    }


def append_login_log(job_id: str, message: str, level: str = "info", step: str = "") -> None:
    entry = {
        "time": iso_now(),
        "level": level,
        "step": step,
        "message": str(message)[:600],
    }
    with LOGIN_JOBS_LOCK:
        job = LOGIN_JOBS.get(job_id)
        if not job:
            return
        logs = job.setdefault("logs", [])
        logs.append(entry)
        if len(logs) > LOGIN_LOG_LIMIT:
            del logs[:len(logs) - LOGIN_LOG_LIMIT]
        job["updated_at"] = entry["time"]


def set_login_job_status(job_id: str, status: str, **updates: Any) -> None:
    with LOGIN_JOBS_LOCK:
        job = LOGIN_JOBS.get(job_id)
        if not job:
            return
        job["status"] = status
        job["updated_at"] = iso_now()
        job.update(updates)
        if status in {"success", "failed"}:
            job["finished_at"] = job["updated_at"]
            try:
                append_login_history_entry(
                    job,
                    workspace_file(job.get("workspace_id", "public"), "login_history.json"),
                )
            except Exception:
                pass


def login_job_cancel_requested(job_id: str) -> bool:
    if not job_id:
        return False
    with LOGIN_JOBS_LOCK:
        job = LOGIN_JOBS.get(job_id)
        return bool(job and job.get("cancel_requested"))


def raise_if_login_job_cancelled(job_id: str) -> None:
    if login_job_cancel_requested(job_id):
        raise LoginFlowError(
            "任务已终止",
            code="login_cancelled",
            hint="用户已手动终止这个刷新任务。",
            retryable=False,
        )


def cancel_login_job(payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
    job_id = coerce_text(payload.get("job_id") or payload.get("jobId"))
    if not job_id:
        raise RuntimeError("登录任务不存在")
    expected_workspace = normalize_workspace_id(workspace_id)
    with LOGIN_JOBS_LOCK:
        job = LOGIN_JOBS.get(job_id)
        if not job:
            raise RuntimeError("登录任务不存在")
        job_workspace = normalize_workspace_id(job.get("workspace_id"))
        if expected_workspace and job_workspace != expected_workspace:
            raise RuntimeError("登录任务不属于当前工作区")
        job["cancel_requested"] = True
        job["updated_at"] = iso_now()
        if job.get("status") in {"queued", "running"}:
            job["status"] = "failed"
            job["error"] = "任务已终止"
            job["error_code"] = "login_cancelled"
            job["error_hint"] = "用户已手动终止这个刷新任务。"
            job["retryable"] = False
            job["finished_at"] = job["updated_at"]
    append_login_log(job_id, "任务已终止", "warning", "cancel")
    return {"success": True, "job": login_job_public(LOGIN_JOBS.get(job_id, {}))}


def clean_manual_email_code(value: Any) -> str:
    code = coerce_text(value)
    return code if re.fullmatch(r"\d{4,8}", code) else ""


def manual_email_code_for_payload(payload: dict[str, Any]) -> str:
    code = clean_manual_email_code(first_text(
        payload.get("manual_email_code"),
        payload.get("email_code"),
        payload.get("verification_code"),
    ))
    if code:
        return code
    job_id = coerce_text(payload.get("job_id"))
    if not job_id:
        return ""
    with LOGIN_JOBS_LOCK:
        job = LOGIN_JOBS.get(job_id)
        if not job:
            return ""
        return clean_manual_email_code(job.get("manual_email_code"))


def set_login_manual_email_code(payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
    job_id = coerce_text(payload.get("job_id") or payload.get("jobId"))
    code = clean_manual_email_code(first_text(
        payload.get("manual_email_code"),
        payload.get("email_code"),
        payload.get("verification_code"),
    ))
    if not job_id:
        raise RuntimeError("登录任务不存在")
    if not code:
        raise RuntimeError("请输入 4-8 位邮箱验证码")
    expected_workspace = normalize_workspace_id(workspace_id)
    with LOGIN_JOBS_LOCK:
        job = LOGIN_JOBS.get(job_id)
        if not job:
            raise RuntimeError("登录任务不存在")
        job_workspace = normalize_workspace_id(job.get("workspace_id"))
        if expected_workspace and job_workspace != expected_workspace:
            raise RuntimeError("登录任务不属于当前工作区")
        job["manual_email_code"] = code
        job["updated_at"] = iso_now()
    append_login_log(job_id, "已收到手动邮箱验证码", "info", "manual_email_code")
    return {"success": True, "job_id": job_id}


def find_latest_code(messages: list[dict[str, Any]], *, after_ts: float = 0) -> str:
    sorted_messages = sorted(messages, key=message_sort_value, reverse=True)
    for message in sorted_messages:
        received_at = coerce_text(message.get("received_at"))
        if after_ts and received_at:
            parsed = parse_message_datetime(received_at)
            if parsed and parsed.timestamp() + 10 < after_ts:
                continue
        for code in message.get("codes") or []:
            clean = coerce_text(code)
            if re.fullmatch(r"\d{6}", clean):
                return clean
    return ""


def fetch_login_verification_code(payload: dict[str, Any], *, since: float = 0, attempts: int = 12, delay: float = 5) -> str:
    job_id = coerce_text(payload.get("job_id"))
    total_attempts = max(1, attempts)
    last_summary = ""
    for attempt in range(1, total_attempts + 1):
        raise_if_login_job_cancelled(job_id)
        manual_code = manual_email_code_for_payload(payload)
        if manual_code:
            if job_id:
                append_login_log(job_id, "使用手动填写的邮箱验证码", "info", "manual_email_code")
            return manual_code
        data = fetch_transient_client_mail({
            "source": "all",
            "provider": "auto",
            "sender_filter": payload.get("sender_filter", ""),
            "limit": payload.get("limit", 20),
            "emails": [payload.get("email", "")],
            "accounts": payload.get("accounts", []),
            "temp_addresses": payload.get("temp_addresses", []),
        })
        results = data.get("results", []) if isinstance(data.get("results"), list) else []
        errors = data.get("errors", []) if isinstance(data.get("errors"), list) else []
        message_count = len(data.get("messages", []) if isinstance(data.get("messages"), list) else [])
        result_parts = []
        for result in results:
            if not isinstance(result, dict):
                continue
            result_parts.append(
                f"{result.get('email') or '-'}:{'ok' if result.get('ok') else 'error'}/{len(result.get('messages') or [])}"
            )
        latest = (data.get("messages") or [{}])[0] if data.get("messages") else {}
        latest_subject = coerce_text(latest.get("subject"))[:80] if isinstance(latest, dict) else ""
        latest_codes = latest.get("codes") if isinstance(latest, dict) else []
        last_summary = (
            f"attempt {attempt}/{total_attempts}, sources={'; '.join(result_parts) or 'none'}, "
            f"messages={message_count}, latest={latest_subject or '-'}, codes={len(latest_codes or [])}, "
            f"errors={'; '.join(coerce_text(error)[:120] for error in errors[:2]) or '-'}"
        )
        if job_id and (attempt == 1 or attempt == total_attempts or attempt % 4 == 0 or errors):
            append_login_log(job_id, f"邮箱验证码查收：{last_summary}", "info" if message_count else "warning", "mail_code_poll")
        code = find_latest_code(data.get("messages", []), after_ts=since)
        if code:
            if job_id:
                append_login_log(job_id, "已从邮箱取到 6 位验证码", "success", "mail_code_poll")
            return code
        time.sleep(max(1, delay))
    if job_id and last_summary:
        append_login_log(job_id, f"邮箱验证码查收结束，仍未找到可提交的 6 位验证码：{last_summary}", "warning", "mail_code_missing")
    return ""


def cpa_companion_wait_code(payload: dict[str, Any]) -> dict[str, Any]:
    email_addr = coerce_text(payload.get("email"))
    if not email_addr:
        raise RuntimeError("缺少邮箱地址")
    attempts = max(1, min(int(payload.get("attempts") or 20), 60))
    delay = max(1, min(float(payload.get("delay") or 5), 20))
    since = 0.0
    if payload.get("since"):
        try:
            since = float(payload.get("since"))
        except Exception:
            since = 0.0
    code = fetch_login_verification_code(
        {
            **payload,
            "email": email_addr,
            "limit": max(1, min(int(payload.get("limit") or 20), 50)),
        },
        since=since,
        attempts=attempts,
        delay=delay,
    )
    if not code:
        return {
            "success": False,
            "error": "没有在邮箱里找到 6 位验证码",
        }
    return {
        "success": True,
        "code": code,
    }


def session_to_cpa_auth(
    session: dict[str, Any],
    fallback: dict[str, Any] | None = None,
    *,
    require_refresh_token: bool = False,
) -> dict[str, Any]:
    fallback = fallback or {}
    access_token = first_text(
        session.get("accessToken"),
        session.get("access_token"),
        session.get("tokens", {}).get("accessToken") if isinstance(session.get("tokens"), dict) else "",
        session.get("tokens", {}).get("access_token") if isinstance(session.get("tokens"), dict) else "",
        session.get("token", {}).get("accessToken") if isinstance(session.get("token"), dict) else "",
        session.get("token", {}).get("access_token") if isinstance(session.get("token"), dict) else "",
        session.get("credentials", {}).get("access_token") if isinstance(session.get("credentials"), dict) else "",
    )
    if not access_token:
        raise RuntimeError("Session JSON 缺少 accessToken")
    session_token = first_text(
        session.get("sessionToken"),
        session.get("session_token"),
        session.get("tokens", {}).get("sessionToken") if isinstance(session.get("tokens"), dict) else "",
        session.get("tokens", {}).get("session_token") if isinstance(session.get("tokens"), dict) else "",
    )
    refresh_token = first_text(
        session.get("refreshToken"),
        session.get("refresh_token"),
        session.get("tokens", {}).get("refreshToken") if isinstance(session.get("tokens"), dict) else "",
        session.get("tokens", {}).get("refresh_token") if isinstance(session.get("tokens"), dict) else "",
    )
    if require_refresh_token and not refresh_token:
        raise RuntimeError("已登录 ChatGPT，但没有拿到 OpenAI OAuth refresh_token，不能作为可刷新 CPA 凭证")
    id_token = first_text(
        session.get("idToken"),
        session.get("id_token"),
        session.get("tokens", {}).get("idToken") if isinstance(session.get("tokens"), dict) else "",
        session.get("tokens", {}).get("id_token") if isinstance(session.get("tokens"), dict) else "",
    )
    payload = jwt_payload(access_token)
    id_payload = jwt_payload(id_token)
    auth = payload.get("https://api.openai.com/auth") if isinstance(payload.get("https://api.openai.com/auth"), dict) else {}
    id_auth = id_payload.get("https://api.openai.com/auth") if isinstance(id_payload.get("https://api.openai.com/auth"), dict) else {}
    profile = payload.get("https://api.openai.com/profile") if isinstance(payload.get("https://api.openai.com/profile"), dict) else {}
    user = session.get("user") if isinstance(session.get("user"), dict) else {}
    account = session.get("account") if isinstance(session.get("account"), dict) else {}
    email_addr = first_text(
        user.get("email"),
        session.get("email"),
        session.get("credentials", {}).get("email") if isinstance(session.get("credentials"), dict) else "",
        profile.get("email"),
        id_payload.get("email"),
        payload.get("email"),
        fallback.get("email"),
    )
    account_id = first_text(
        account.get("id"),
        session.get("account_id"),
        session.get("chatgptAccountId"),
        session.get("chatgpt_account_id"),
        auth.get("chatgpt_account_id"),
        id_auth.get("chatgpt_account_id"),
        fallback.get("auth_index"),
    )
    plan_type = first_text(
        account.get("planType"),
        session.get("planType"),
        session.get("plan_type"),
        auth.get("chatgpt_plan_type"),
        id_auth.get("chatgpt_plan_type"),
    )
    exp = payload.get("exp")
    expires_at = ""
    if isinstance(exp, (int, float)):
        expires_at = datetime.fromtimestamp(exp, timezone.utc).isoformat(timespec="seconds")
    else:
        expires_at = first_text(session.get("expires"), session.get("expiresAt"), session.get("expires_at"))
    if not id_token:
        id_token = build_synthetic_id_token(email_addr, account_id, plan_type, expires_at)
    return {
        key: value for key, value in {
            "type": "codex",
            "account_id": account_id,
            "chatgpt_account_id": account_id,
            "email": email_addr,
            "name": first_text(email_addr, fallback.get("name"), "ChatGPT Account"),
            "plan_type": plan_type,
            "chatgpt_plan_type": plan_type,
            "id_token": id_token,
            "id_token_synthetic": not first_text(
                session.get("idToken"),
                session.get("id_token"),
                session.get("tokens", {}).get("idToken") if isinstance(session.get("tokens"), dict) else "",
                session.get("tokens", {}).get("id_token") if isinstance(session.get("tokens"), dict) else "",
            ),
            "access_token": access_token,
            "refresh_token": refresh_token,
            "session_token": session_token,
            "last_refresh": iso_now(),
            "expired": expires_at,
        }.items() if value not in {"", None}
    }


def jwt_payload(token: str) -> dict[str, Any]:
    try:
        part = str(token or "").split(".")[1]
        padded = part.replace("-", "+").replace("_", "/")
        padded += "=" * (-len(padded) % 4)
        payload = json.loads(base64.b64decode(padded).decode("utf-8", errors="replace"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def build_synthetic_id_token(email_addr: str, account_id: str, plan_type: str, expires_at: str) -> str:
    def encode(value: dict[str, Any]) -> str:
        raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    now = int(time.time())
    exp = now + 3600
    if expires_at:
        try:
            exp = int(datetime.fromisoformat(expires_at.replace("Z", "+00:00")).timestamp())
        except Exception:
            pass
    return ".".join([
        encode({"alg": "none", "typ": "JWT", "cpa_synthetic": True}),
        encode({
            "iss": "ctgptm-mail-assistant",
            "aud": "chatgpt",
            "email": email_addr,
            "chatgpt_account_id": account_id,
            "account_id": account_id,
            "chatgpt_plan_type": plan_type,
            "iat": now,
            "exp": exp,
        }),
        "synthetic",
    ])


def run_chatgpt_login_with_playwright(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        raise RuntimeError(
            "VPS 还没安装 Playwright/Chromium，不能真正一键自动填 ChatGPT 登录。"
            "安装：python3 -m pip install playwright && python3 -m playwright install chromium"
        ) from exc

    email_addr = coerce_text(payload.get("email"))
    password = coerce_text(payload.get("password"))
    if not email_addr:
        raise RuntimeError("Playwright 登录需要邮箱")

    headless = str(payload.get("headless", "1")).lower() not in {"0", "false", "no"}
    proxy_url = request_proxy_url(payload)
    code_since = time.time()
    append_login_log(job_id, f"等待浏览器槽位（最多并发 {PLAYWRIGHT_MAX_CONCURRENCY}）", "info", "browser_queue")
    acquired = PLAYWRIGHT_SEMAPHORE.acquire(timeout=180)
    if not acquired:
        raise RuntimeError("浏览器登录队列繁忙，请稍后重试")
    try:
        append_login_log(job_id, "已获得浏览器槽位", "info", "browser_queue")
        return run_chatgpt_login_with_playwright_unlocked(
            job_id,
            payload,
            sync_playwright,
            PlaywrightTimeoutError,
            email_addr=email_addr,
            headless=headless,
            proxy_url=proxy_url,
            code_since=code_since,
        )
    finally:
        PLAYWRIGHT_SEMAPHORE.release()


def run_chatgpt_login_with_playwright_unlocked(
    job_id: str,
    payload: dict[str, Any],
    sync_playwright: Any,
    PlaywrightTimeoutError: Any,
    *,
    email_addr: str,
    headless: bool,
    proxy_url: str,
    code_since: float,
) -> dict[str, Any]:
    password = coerce_text(payload.get("password"))
    oauth_state = secrets.token_urlsafe(32)
    oauth_code_verifier = generate_openai_code_verifier()
    oauth_authorize_url = build_openai_oauth_authorize_url(
        oauth_state,
        openai_code_challenge(oauth_code_verifier),
    )
    captured_oauth: dict[str, str] = {}
    otp_request_seen = False
    otp_sent_at = 0.0
    with sync_playwright() as playwright:
        launch_options: dict[str, Any] = {
            "headless": headless,
            "args": ["--no-sandbox"],
        }
        if proxy_url:
            launch_options["proxy"] = playwright_proxy_options(proxy_url)
        browser = playwright.chromium.launch(
            **launch_options,
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 860},
            locale="en-US",
            timezone_id="America/New_York",
        )
        page = context.new_page()

        def remember_oauth_callback(value: str) -> None:
            parsed = urllib.parse.urlparse(value)
            if parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1"}:
                return
            if parsed.port != 1455 or parsed.path != "/auth/callback":
                return
            query = urllib.parse.parse_qs(parsed.query)
            returned_state = first_text(query.get("state", [""])[0])
            if returned_state and returned_state != oauth_state:
                raise RuntimeError("OpenAI OAuth state 校验失败")
            error = first_text(query.get("error", [""])[0], query.get("error_description", [""])[0])
            if error:
                raise RuntimeError(f"OpenAI OAuth 授权失败：{error}")
            code = first_text(query.get("code", [""])[0])
            if code:
                captured_oauth["code"] = code

        def on_oauth_request(request: Any) -> None:
            try:
                remember_oauth_callback(request.url)
            except Exception:
                pass

        def on_login_response(response: Any) -> None:
            nonlocal otp_request_seen, otp_sent_at
            try:
                url = response.url
                if "/email-otp/" in url or "/passwordless/send-otp" in url:
                    otp_request_seen = True
                    if int(response.status) < 400:
                        otp_sent_at = time.time() - 2
                        append_login_log(job_id, f"OpenAI 已返回发送验证码请求：HTTP {response.status}", "info", "send_code")
                    else:
                        append_login_log(job_id, f"发送验证码请求返回 HTTP {response.status}", "warning", "send_code")
            except Exception:
                pass

        page.on("request", on_oauth_request)
        page.on("response", on_login_response)
        try:
            append_login_log(job_id, "打开 ChatGPT 登录页", "info", "identifier")
            try:
                page.goto(build_chatgpt_login_url(email_addr), wait_until="domcontentloaded", timeout=60000)
            except Exception:
                raise
            page.wait_for_timeout(1500)
            append_login_snapshot_log(job_id, page, "login-page-loaded")
            login_input_selectors = [
                "input[type=email]",
                "input[name=username]",
                "input[name=email]",
                "input#username",
                "input[autocomplete=username]",
                "input[type=text]",
            ]
            if not captured_oauth.get("code"):
                append_login_log(job_id, "等待 OpenAI 登录页加载或安全验证通过", "info", "security_check")
                wait_for_openai_login_ready(page, login_input_selectors, timeout=90000, job_id=job_id)

            if not captured_oauth.get("code"):
                append_login_log(job_id, "提交邮箱", "info", "identifier")
                email_selector = first_visible_selector(page, login_input_selectors, timeout=45000)
                email_input = page.locator(email_selector).first
                email_input.click(timeout=10000)
                try:
                    email_input.fill(email_addr, timeout=10000)
                except Exception:
                    page.keyboard.press("Control+A")
                    page.keyboard.type(email_addr, delay=35)
                page.wait_for_timeout(400)
                click_first_available(page, [
                    "button[type=submit]",
                    "button:has-text('Continue')",
                    "button:has-text('继续')",
                    "button:has-text('下一步')",
                    "button:has-text('Log in')",
                    "button:has-text('登录')",
                ])
                page.wait_for_timeout(1800)
                remember_oauth_callback(coerce_text(getattr(page, "url", "")))
                append_login_snapshot_log(job_id, page, "after-email-submit")
                raise_if_playwright_auth_blocked(page)

            code_selectors = [
                "input[autocomplete='one-time-code']",
                "input[name*='code' i]",
                "input[id*='code' i]",
                "input[placeholder*='code' i]",
                "input[inputmode='numeric']",
                "input[type='tel']",
                "input[type='text'][maxlength='6']",
            ]
            password_selectors = [
                "input[type=password]",
                "input[name=password]",
                "input#password",
                "input[autocomplete=current-password]",
            ]
            email_code_actions = [
                "button:has-text('Email code')",
                "button:has-text('Use email')",
                "button:has-text('Send code')",
                "button:has-text('Continue with email')",
                "button:has-text('Try another method')",
                "button:has-text('Use email code')",
                "button:has-text('Email me a code')",
                "button:has-text('Send email code')",
                "a:has-text('Email code')",
                "a:has-text('Use email')",
                "a:has-text('Use email code')",
                "a:has-text('Send code')",
                "button:has-text('邮箱验证码')",
                "button:has-text('发送验证码')",
                "button:has-text('使用邮箱')",
                "a:has-text('邮箱验证码')",
                "a:has-text('发送验证码')",
                "a:has-text('使用邮箱')",
                "text=/email code/i",
                "text=/send.*code/i",
                "text=/use.*email/i",
            ]

            code_selector = "" if captured_oauth.get("code") else optional_visible_selector(page, code_selectors, timeout=8000)
            if password and not code_selector and not captured_oauth.get("code"):
                append_login_log(job_id, "提交密码", "info", "password")
                password_selector = first_visible_selector(page, password_selectors, timeout=45000)
                page.fill(password_selector, password)
                click_first_available(page, [
                    "button[type=submit]",
                    "button:has-text('Continue')",
                    "button:has-text('Log in')",
                    "button:has-text('登录')",
                    "button:has-text('继续')",
                ])
                page.wait_for_timeout(2500)
                remember_oauth_callback(coerce_text(getattr(page, "url", "")))
            elif not password and not code_selector and not captured_oauth.get("code"):
                password_selector = optional_visible_selector(page, password_selectors, timeout=1500)
                if password_selector:
                    append_login_log(job_id, "页面要求密码，尝试切换邮箱验证码", "warning", "send_code")
                    if wait_and_click_first_available(page, email_code_actions, timeout=10000, fallback_enter=False):
                        append_login_log(job_id, "已点击发送邮箱验证码", "info", "send_code")
                else:
                    append_login_log(job_id, "邮箱已提交，查找发送验证码入口", "info", "send_code")
                    if wait_and_click_first_available(page, email_code_actions, timeout=10000, fallback_enter=False):
                        append_login_log(job_id, "已点击发送邮箱验证码", "info", "send_code")
                    else:
                        append_login_log(job_id, "未看到单独发送验证码按钮，等待验证码输入框", "info", "send_code")
            page.wait_for_timeout(2500)
            remember_oauth_callback(coerce_text(getattr(page, "url", "")))
            append_login_snapshot_log(job_id, page, "before-code-detect")
            if not captured_oauth.get("code"):
                raise_if_playwright_auth_blocked(page)

            append_login_log(job_id, "等待页面进入邮箱验证码步骤", "info", "waiting_code")
            if not code_selector:
                code_selector = "" if captured_oauth.get("code") else optional_visible_selector(page, code_selectors, timeout=10000 if password else 60000)
            if not code_selector and not password and not captured_oauth.get("code") and optional_visible_selector(page, password_selectors, timeout=1000):
                append_login_log(job_id, "页面仍在要求密码，继续尝试切换邮箱验证码", "warning", "send_code")
                if wait_and_click_first_available(page, email_code_actions, timeout=10000, fallback_enter=False):
                    append_login_log(job_id, "已再次点击发送邮箱验证码", "info", "send_code")
                code_selector = optional_visible_selector(page, code_selectors, timeout=45000)
            if not password and not code_selector and not captured_oauth.get("code"):
                append_login_snapshot_log(job_id, page, "no-code-page", "warning")
                hint = playwright_page_hint(page)
                raise RuntimeError(f"Playwright 没有进入邮箱验证码页，无法继续无密码登录。当前页面提示：{hint}")
            if code_selector:
                if otp_sent_at:
                    code_since = otp_sent_at
                elif not otp_request_seen:
                    append_login_log(job_id, "已出现验证码输入框，但没有捕捉到发码接口；仍将尝试查收邮箱", "warning", "send_code")
                append_login_log(job_id, "正在查收邮箱验证码", "warning", "waiting_code")
                code = fetch_login_verification_code(payload, since=code_since, attempts=20, delay=5)
                if not code:
                    raise RuntimeError("没有从本地邮箱凭证里收到验证码")
                append_login_log(job_id, "已取到验证码，自动提交", "info", "verify_code")
                fill_login_code(page, code_selector, code)
                click_first_available(page, [
                    "button[type=submit]",
                    "button:has-text('Continue')",
                    "button:has-text('Verify')",
                    "button:has-text('验证')",
                    "button:has-text('继续')",
                ])
                page.wait_for_timeout(3000)
                remember_oauth_callback(coerce_text(getattr(page, "url", "")))

            if not captured_oauth.get("code"):
                append_login_log(job_id, "确认 ChatGPT 已登录，准备打开 OAuth 授权页", "info", "oauth")
                if not wait_for_chatgpt_logged_in(page, timeout=90000):
                    hint = playwright_page_hint(page)
                    raise RuntimeError(f"验证码提交后没有进入 ChatGPT 登录态，无法继续 OAuth 授权。当前页面提示：{hint}")
                append_login_log(job_id, "打开 OpenAI OAuth 授权页获取 RT", "info", "oauth")
                try:
                    page.goto(oauth_authorize_url, wait_until="domcontentloaded", timeout=60000)
                except Exception as exc:
                    remember_oauth_callback(coerce_text(getattr(page, "url", "")))
                    message = str(exc)
                    if not captured_oauth.get("code") and "ERR_CONNECTION_REFUSED" not in message and OPENAI_OAUTH_REDIRECT_URI not in message:
                        raise
                page.wait_for_timeout(1500)
                remember_oauth_callback(coerce_text(getattr(page, "url", "")))

            append_login_log(job_id, "换取 OpenAI OAuth refresh_token", "info", "oauth")
            oauth_payload = fetch_openai_oauth_from_captured_code(
                captured_oauth,
                oauth_code_verifier,
                page,
                proxy_url=proxy_url,
            )
            session: dict[str, Any] = {}
            try:
                append_login_log(job_id, "读取 ChatGPT Session", "info", "session")
                session = read_playwright_session(context)
            except Exception as exc:
                append_login_log(job_id, f"ChatGPT Session 暂不可读，使用 OAuth token 继续转换：{str(exc)[:180]}", "warning", "session")
            session = merge_session_with_oauth(session, oauth_payload)
            if not first_text(session.get("email"), session.get("user", {}).get("email") if isinstance(session.get("user"), dict) else ""):
                session["email"] = email_addr
                session["user"] = {**(session.get("user") if isinstance(session.get("user"), dict) else {}), "email": email_addr}
            return session
        except PlaywrightTimeoutError as exc:
            try:
                append_login_snapshot_log(job_id, page, "playwright-timeout", "warning")
            except Exception:
                pass
            raise RuntimeError(f"登录页面等待超时：{exc}") from exc
        except Exception:
            try:
                append_login_snapshot_log(job_id, page, "playwright-error", "warning")
            except Exception:
                pass
            raise
        finally:
            try:
                page.remove_listener("request", on_oauth_request)
            except Exception:
                pass
            try:
                page.remove_listener("response", on_login_response)
            except Exception:
                pass
            context.close()
            browser.close()


def first_visible_selector(page: Any, selectors: list[str], *, timeout: int = 30000) -> str:
    deadline = time.monotonic() + (timeout / 1000)
    last_error = ""
    while time.monotonic() < deadline:
        for selector in selectors:
            try:
                locator = page.locator(selector).first
                if locator.count() and locator.is_visible(timeout=500):
                    return selector
            except Exception as exc:
                last_error = str(exc)
        time.sleep(0.35)
    body_text = ""
    try:
        body_text = page.locator("body").inner_text(timeout=2000)
    except Exception:
        pass
    hint = strip_html(body_text).strip().replace("\n", " ")[:220]
    if hint:
        lowered_hint = hint.lower()
        if is_openai_security_verification_text(lowered_hint):
            raise openai_turnstile_error(hint)
        raise RuntimeError(f"登录页没有出现可填写输入框，页面提示：{hint}")
    raise RuntimeError(f"登录页没有出现可填写输入框。{last_error[:160]}")


def optional_visible_selector(page: Any, selectors: list[str], *, timeout: int = 30000) -> str:
    try:
        return first_visible_selector(page, selectors, timeout=timeout)
    except RuntimeError:
        return ""


def playwright_page_hint(page: Any) -> str:
    try:
        text = page.locator("body").inner_text(timeout=3000)
    except Exception:
        text = ""
    hint = strip_html(text).strip().replace("\n", " ")
    return hint[:260] or coerce_text(getattr(page, "url", ""))


def login_page_snapshot(page: Any) -> dict[str, Any]:
    try:
        controls = page.locator("input,button,a").evaluate_all(
            """els => els.slice(0, 80).map((el, index) => ({
                index,
                tag: el.tagName,
                type: el.getAttribute('type') || '',
                name: el.getAttribute('name') || '',
                id: el.id || '',
                text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 80),
                value: (el.value || '').slice(0, 80),
                disabled: !!el.disabled,
                visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
            }))"""
        )
    except Exception as exc:
        controls = [{"error": str(exc)[:180]}]
    try:
        title = page.title(timeout=2000)
    except Exception:
        title = ""
    try:
        has_turnstile = page.locator("input[name='cf-turnstile-response'], iframe[src*='turnstile'], iframe[src*='challenges.cloudflare.com']").count() > 0
    except Exception:
        has_turnstile = False
    try:
        has_email_input = page.locator("input[type=email], input[name=username], input[name=email], input#username, input[autocomplete=username]").count() > 0
    except Exception:
        has_email_input = False
    try:
        has_code_input = page.locator("input[autocomplete='one-time-code'], input[name*='code' i], input[id*='code' i], input[inputmode='numeric']").count() > 0
    except Exception:
        has_code_input = False
    return {
        "url": coerce_text(getattr(page, "url", "")),
        "title": coerce_text(title),
        "hint": playwright_page_hint(page),
        "has_turnstile": bool(has_turnstile),
        "has_email_input": bool(has_email_input),
        "has_code_input": bool(has_code_input),
        "controls": controls,
    }


def save_login_debug_snapshot(page: Any, job_id: str, label: str) -> dict[str, str]:
    LOGIN_DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    safe_label = re.sub(r"[^a-zA-Z0-9_-]+", "-", label).strip("-") or "snapshot"
    stem = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{job_id[:10]}-{safe_label}"
    png_path = LOGIN_DEBUG_DIR / f"{stem}.png"
    json_path = LOGIN_DEBUG_DIR / f"{stem}.json"
    snapshot = login_page_snapshot(page)
    try:
        page.screenshot(path=str(png_path), full_page=True, timeout=10000)
    except Exception as exc:
        snapshot["screenshot_error"] = str(exc)[:300]
    json_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "screenshot": str(png_path),
        "json": str(json_path),
        "screenshot_url": f"/login-debug/{png_path.name}",
        "json_url": f"/login-debug/{json_path.name}",
        "url": coerce_text(snapshot.get("url")),
        "hint": coerce_text(snapshot.get("hint")),
    }


def append_login_snapshot_log(job_id: str, page: Any, label: str, level: str = "info") -> None:
    try:
        snapshot = save_login_debug_snapshot(page, job_id, label)
        message = f"页面快照[{label}] URL={snapshot['url']} 提示={snapshot['hint'][:180]} 截图={snapshot['screenshot_url']}"
        append_login_log(job_id, message, level, "snapshot")
        with LOGIN_JOBS_LOCK:
            job = LOGIN_JOBS.get(job_id)
            if job and job.get("logs"):
                job["logs"][-1]["snapshot_url"] = snapshot["screenshot_url"]
                job["logs"][-1]["snapshot_json_url"] = snapshot["json_url"]
                job["logs"][-1]["page_url"] = snapshot["url"]
                job["logs"][-1]["snapshot_file"] = snapshot["screenshot"]
    except Exception as exc:
        append_login_log(job_id, f"页面快照保存失败[{label}]：{str(exc)[:180]}", "warning", "snapshot")


def is_openai_security_verification_text(value: str) -> bool:
    lowered = coerce_text(value).lower()
    return any(
        marker in lowered
        for marker in [
            "performing security verification",
            "security service to protect against malicious bots",
            "this page is displayed while the website verifies",
            "ray id:",
            "just a moment",
        ]
    )


def openai_security_verification_message(hint: str) -> str:
    raise openai_turnstile_error(hint)


def wait_for_openai_login_ready(
    page: Any,
    selectors: list[str],
    *,
    timeout: int = 90000,
    job_id: str = "",
) -> None:
    deadline = time.monotonic() + (timeout / 1000)
    last_hint = ""
    next_log_at = time.monotonic()
    while time.monotonic() < deadline:
        try:
            if page.locator("input[name='cf-turnstile-response'], iframe[src*='turnstile'], iframe[src*='challenges.cloudflare.com']").count() > 0:
                if job_id:
                    append_login_snapshot_log(job_id, page, "turnstile-challenge", "warning")
                raise openai_turnstile_error("页面出现 Cloudflare Turnstile 组件，还没有发送邮箱验证码")
        except LoginFlowError:
            raise
        except Exception:
            pass
        for selector in selectors:
            try:
                locator = page.locator(selector).first
                if locator.count() and locator.is_visible(timeout=500):
                    if job_id:
                        append_login_log(job_id, "登录页已可输入邮箱", "info", "login_ready")
                    return
            except Exception:
                pass
        hint = playwright_page_hint(page)
        if hint:
            last_hint = hint
            if hint.startswith("http"):
                if job_id and time.monotonic() >= next_log_at:
                    append_login_log(job_id, f"登录页仍在加载，当前 URL：{hint[:180]}", "info", "login_loading")
                    next_log_at = time.monotonic() + 10
                page.wait_for_timeout(1500)
                continue
            if not is_openai_security_verification_text(hint):
                if job_id and time.monotonic() >= next_log_at:
                    append_login_log(job_id, f"登录页已有内容但未出现输入框：{hint[:180]}", "warning", "login_loading")
                    next_log_at = time.monotonic() + 10
                page.wait_for_timeout(1500)
                continue
            if job_id and time.monotonic() >= next_log_at:
                append_login_log(job_id, "等待 OpenAI 安全验证通过，还未发送邮箱验证码", "warning", "security_check")
                next_log_at = time.monotonic() + 10
        page.wait_for_timeout(1500)
    if last_hint and is_openai_security_verification_text(last_hint):
        if job_id:
            append_login_snapshot_log(job_id, page, "security-verification-timeout", "warning")
        raise openai_turnstile_error(last_hint)
    if last_hint:
        raise RuntimeError(f"OpenAI 登录页没有渲染出邮箱输入框，还没有发送验证码。当前页面提示：{last_hint[:220]}")
    raise RuntimeError("OpenAI 登录页没有渲染出邮箱输入框，还没有发送验证码。")


def fill_login_code(page: Any, selector: str, code: str) -> None:
    locator = page.locator(selector)
    visible_inputs = []
    try:
        count = locator.count()
    except Exception:
        count = 0
    for index in range(min(count, 12)):
        item = locator.nth(index)
        try:
            if item.is_visible(timeout=500):
                visible_inputs.append(item)
        except Exception:
            continue
    if len(visible_inputs) >= min(len(code), 4):
        for item, char in zip(visible_inputs, code):
            item.fill(char)
        return
    page.fill(selector, code)


def wait_for_chatgpt_logged_in(page: Any, *, timeout: int = 90000) -> bool:
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        current_url = coerce_text(getattr(page, "url", ""))
        if (
            "chatgpt.com" in current_url
            and "/auth/login" not in current_url
            and "/api/auth/error" not in current_url
        ):
            return True
        try:
            text = page.locator("body").inner_text(timeout=1000).lower()
        except Exception:
            text = ""
        if any(marker in text for marker in ["message chatgpt", "new chat", "what can i help with", "有什么可以帮"]):
            return True
        page.wait_for_timeout(1000)
    return False


def build_playwright_login_url() -> str:
    return CHATGPT_LOGIN_URL


def raise_if_playwright_auth_blocked(page: Any) -> None:
    current_url = coerce_text(getattr(page, "url", ""))
    hint = playwright_page_hint(page)
    lowered_hint = hint.lower()
    if any(
        marker in lowered_hint
        for marker in [
            "operation timed out",
            "unexpected token '<'",
            "cloudflare",
            "cf-ray",
            "糟糕",
        ]
    ):
        if is_openai_security_verification_text(hint):
            raise openai_turnstile_error(hint or current_url)
        raise RuntimeError(
            "OpenAI 登录邮箱提交接口被当前 VPS/代理出口风控拦截，未进入邮箱验证码页。"
            "这不是邮箱收件失败，也不是临时邮箱 JWT 问题；请更换能通过 auth.openai.com 的干净代理或出口后重试。"
            f"当前页面提示：{hint[:220]}"
        )
    if "/api/auth/error" in current_url:
        raise RuntimeError(
            "ChatGPT 登录入口进入 /api/auth/error。当前 VPS 或代理出口被 OpenAI/Cloudflare 风控拦截，"
            "还没有进入邮箱验证码阶段；请更换干净出口或使用可通过挑战的登录环境。"
        )
    lowered_url = current_url.lower()
    if any(marker in lowered_url for marker in ["challenge", "turnstile", "captcha"]):
        raise RuntimeError(
            "ChatGPT 登录入口出现人机验证/挑战页。当前自动刷新不能继续；请更换稳定代理或干净出口。"
        )
    try:
        has_turnstile = page.locator("input[name='cf-turnstile-response'], iframe[src*='turnstile']").count() > 0
    except Exception:
        has_turnstile = False
    if has_turnstile:
        raise openai_turnstile_error(playwright_page_hint(page) or current_url)


def read_playwright_session(context: Any) -> dict[str, Any]:
    response = context.request.get(
        "https://chatgpt.com/api/auth/session",
        headers={"Accept": "application/json"},
        timeout=60000,
    )
    content = response.text()
    try:
        session = json.loads(content)
    except Exception as exc:
        hint = html_challenge_hint(content) or strip_html(content).strip().replace("\n", " ")[:260]
        raise RuntimeError(f"Session 接口没有返回 JSON：HTTP {response.status} - {hint}") from exc
    if not isinstance(session, dict) or not first_text(session.get("accessToken"), session.get("access_token")):
        raise RuntimeError("Session 接口没有返回有效 accessToken")
    return session


def fetch_openai_oauth_with_playwright(page: Any, *, proxy_url: str = "") -> dict[str, Any]:
    state = secrets.token_urlsafe(32)
    code_verifier = generate_openai_code_verifier()
    authorize_url = build_openai_oauth_authorize_url(state, openai_code_challenge(code_verifier))
    captured: dict[str, str] = {}

    def remember_callback(value: str) -> None:
        parsed = urllib.parse.urlparse(value)
        if parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1"}:
            return
        if parsed.port != 1455 or parsed.path != "/auth/callback":
            return
        query = urllib.parse.parse_qs(parsed.query)
        returned_state = first_text(query.get("state", [""])[0])
        if returned_state and returned_state != state:
            raise RuntimeError("OpenAI OAuth state 校验失败")
        error = first_text(query.get("error", [""])[0], query.get("error_description", [""])[0])
        if error:
            raise RuntimeError(f"OpenAI OAuth 授权失败：{error}")
        code = first_text(query.get("code", [""])[0])
        if code:
            captured["code"] = code

    def on_request(request: Any) -> None:
        try:
            remember_callback(request.url)
        except Exception:
            pass

    page.on("request", on_request)
    try:
        try:
            page.goto(authorize_url, wait_until="domcontentloaded", timeout=60000)
        except Exception as exc:
            remember_callback(coerce_text(getattr(page, "url", "")))
            message = str(exc)
            if not captured.get("code") and "ERR_CONNECTION_REFUSED" not in message and OPENAI_OAUTH_REDIRECT_URI not in message:
                raise
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline and not captured.get("code"):
            remember_callback(coerce_text(getattr(page, "url", "")))
            if captured.get("code"):
                break
            page.wait_for_timeout(500)
    finally:
        try:
            page.remove_listener("request", on_request)
        except Exception:
            pass

    code = captured.get("code")
    if not code:
        hint = playwright_page_hint(page)
        raise RuntimeError(f"已登录 ChatGPT，但没有拿到 OpenAI OAuth authorization code。当前页面：{hint}")

    status, data, raw = exchange_openai_oauth_code(code, code_verifier, proxy_url=proxy_url)
    if status != 200:
        compact = protocol_compact_error(data) or raw[:260]
        raise RuntimeError(f"OpenAI OAuth token exchange 失败：HTTP {status} - {compact}")
    if not coerce_text(data.get("refresh_token")):
        raise RuntimeError("OpenAI OAuth token exchange 成功，但返回里没有 refresh_token")
    if not coerce_text(data.get("access_token")):
        raise RuntimeError("OpenAI OAuth token exchange 成功，但返回里没有 access_token")
    return data


def fetch_openai_oauth_from_captured_code(
    captured: dict[str, str],
    code_verifier: str,
    page: Any,
    *,
    proxy_url: str = "",
) -> dict[str, Any]:
    code = coerce_text(captured.get("code"))
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline and not code:
        current_url = coerce_text(getattr(page, "url", ""))
        parsed = urllib.parse.urlparse(current_url)
        if parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"} and parsed.port == 1455 and parsed.path == "/auth/callback":
            query = urllib.parse.parse_qs(parsed.query)
            error = first_text(query.get("error", [""])[0], query.get("error_description", [""])[0])
            if error:
                raise RuntimeError(f"OpenAI OAuth 授权失败：{error}")
            code = first_text(query.get("code", [""])[0])
            if code:
                captured["code"] = code
                break
        page.wait_for_timeout(500)
        code = coerce_text(captured.get("code"))
    if not code:
        hint = playwright_page_hint(page)
        raise RuntimeError(f"没有拿到 OpenAI OAuth authorization code。当前页面：{hint}")

    status, data, raw = exchange_openai_oauth_code(code, code_verifier, proxy_url=proxy_url)
    if status != 200:
        compact = protocol_compact_error(data) or raw[:260]
        raise RuntimeError(f"OpenAI OAuth token exchange 失败：HTTP {status} - {compact}")
    if not coerce_text(data.get("refresh_token")):
        raise RuntimeError("OpenAI OAuth token exchange 成功，但返回里没有 refresh_token")
    if not coerce_text(data.get("access_token")):
        raise RuntimeError("OpenAI OAuth token exchange 成功，但返回里没有 access_token")
    return data


def merge_session_with_oauth(session: dict[str, Any], oauth_payload: dict[str, Any]) -> dict[str, Any]:
    merged = dict(session or {})
    merged["access_token"] = coerce_text(oauth_payload.get("access_token")) or first_text(
        session.get("access_token"),
        session.get("accessToken"),
    )
    merged["accessToken"] = merged["access_token"]
    merged["refresh_token"] = coerce_text(oauth_payload.get("refresh_token"))
    merged["refreshToken"] = merged["refresh_token"]
    merged["id_token"] = coerce_text(oauth_payload.get("id_token")) or first_text(
        session.get("id_token"),
        session.get("idToken"),
    )
    if merged["id_token"]:
        merged["idToken"] = merged["id_token"]
    if oauth_payload.get("expires_in"):
        try:
            expires_at = datetime.fromtimestamp(
                time.time() + int(oauth_payload["expires_in"]),
                timezone.utc,
            ).isoformat(timespec="seconds")
            merged["expires_at"] = expires_at
            merged["expires"] = expires_at
        except Exception:
            pass
    merged["oauth_token_type"] = coerce_text(oauth_payload.get("token_type"))
    merged["oauth_scope"] = coerce_text(oauth_payload.get("scope"))
    return merged


def click_first_available(page: Any, selectors: list[str], *, fallback_enter: bool = True) -> bool:
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() and locator.is_visible(timeout=1200):
                locator.click(timeout=5000, no_wait_after=True)
                return True
        except Exception:
            continue
    if fallback_enter:
        page.keyboard.press("Enter")
        return True
    return False


def wait_and_click_first_available(page: Any, selectors: list[str], *, timeout: int = 10000, fallback_enter: bool = False) -> bool:
    deadline = time.monotonic() + (timeout / 1000)
    while time.monotonic() < deadline:
        if click_first_available(page, selectors, fallback_enter=False):
            return True
        page.wait_for_timeout(500)
    if fallback_enter:
        page.keyboard.press("Enter")
        return True
    return False


def fetch_registration_verification_link(payload: dict[str, Any], *, since: float = 0, attempts: int = 15, delay: float = 6) -> str:
    """自动从收件箱获取 OpenAI 注册验证邮件并解析出验证链接"""
    import secrets
    pattern = re.compile(r'https://[a-zA-Z0-9.-]*openai\.com/[^\s"\'<>]*email-verification[^\s"\'<>]*')
    for _ in range(max(1, attempts)):
        try:
            data = fetch_transient_client_mail({
                "source": "all",
                "provider": "auto",
                "sender_filter": "openai",
                "limit": payload.get("limit", 20),
                "emails": [payload.get("email", "")],
                "accounts": payload.get("accounts", []),
                "temp_addresses": payload.get("temp_addresses", []),
            })
            messages = data.get("messages") or []
            sorted_messages = sorted(messages, key=message_sort_value, reverse=True)
            for msg in sorted_messages:
                received_at = coerce_text(msg.get("received_at"))
                if since and received_at:
                    parsed = parse_message_datetime(received_at)
                    if parsed and parsed.timestamp() + 30 < since:
                        continue
                
                body_content = coerce_text(msg.get("html") or msg.get("body") or "")
                match = pattern.search(body_content)
                if match:
                    link = match.group(0)
                    link = link.replace("&amp;", "&")
                    return link
        except Exception:
            pass
        time.sleep(delay)
    return ""


def run_chatgpt_signup_with_playwright(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        raise RuntimeError(
            "VPS 还没安装 Playwright/Chromium，不能进行自动化注册。"
            "安装：python3 -m pip install playwright && python3 -m playwright install chromium"
        ) from exc

    import secrets
    email_addr = coerce_text(payload.get("email"))
    password = coerce_text(payload.get("password"))
    if not email_addr:
        raise RuntimeError("一键注册需要邮箱账号")
    if not password:
        # 自动生成随机强密码
        password = secrets.token_urlsafe(10) + "aA1!"

    headless = str(payload.get("headless", "1")).lower() not in {"0", "false", "no"}
    proxy_url = request_proxy_url(payload)
    code_since = time.time()

    with sync_playwright() as playwright:
        launch_options: dict[str, Any] = {
            "headless": headless,
            "args": ["--no-sandbox"],
        }
        if proxy_url:
            launch_options["proxy"] = playwright_proxy_options(proxy_url)
        browser = playwright.chromium.launch(**launch_options)
        context = browser.new_context(
            viewport={"width": 1280, "height": 860},
            user_agent=DEFAULT_HTTP_HEADERS["User-Agent"],
            locale="zh-CN",
        )
        page = context.new_page()
        try:
            append_login_log(job_id, "打开 ChatGPT 注册页", "info", "signup_start")
            page.goto("https://chatgpt.com/auth/signup", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(1500)

            append_login_log(job_id, f"填入注册邮箱: {email_addr}", "info", "email_input")
            email_selector = first_visible_selector(page, [
                "input[type=email]",
                "input[name=username]",
                "input[name=email]",
                "input#username",
                "input[autocomplete=username]",
                "input[type=text]",
            ], timeout=45000)
            page.fill(email_selector, email_addr)
            
            click_first_available(page, [
                "button[type=submit]",
                "button:has-text('Continue')",
                "button:has-text('继续')",
                "button:has-text('下一步')",
            ])
            page.wait_for_timeout(2000)

            append_login_log(job_id, "设置并提交密码", "info", "password_input")
            password_selector = first_visible_selector(page, [
                "input[type=password]",
                "input[name=password]",
                "input#password",
                "input[autocomplete=new-password]",
            ], timeout=45000)
            page.fill(password_selector, password)
            
            click_first_available(page, [
                "button[type=submit]",
                "button:has-text('Continue')",
                "button:has-text('继续')",
            ])
            page.wait_for_timeout(3000)

            append_login_log(job_id, "等待注册确认邮件...", "warning", "waiting_email")
            verification_link = fetch_registration_verification_link(payload, since=code_since)
            if not verification_link:
                raise RuntimeError("超时未收到注册确认邮件，请检查邮箱是否能正常收件")
            
            append_login_log(job_id, "收到确认邮件，正在打开验证链接", "info", "email_verified")
            page.goto(verification_link, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(2500)

            # 完善个人资料
            try:
                first_name_sel = "input[name='firstName'], input[placeholder*='First' i]"
                page.wait_for_selector(first_name_sel, timeout=10000)
                append_login_log(job_id, "正在完善个人基本信息...", "info", "profile_input")
                page.fill(first_name_sel, "Aiden")
                page.fill("input[name='lastName'], input[placeholder*='Last' i]", "Smith")
                
                birthday_sel = "input[name='birthday'], input[placeholder*='Birthday' i], input[type='date']"
                if page.locator(birthday_sel).count():
                    page.fill(birthday_sel, "1995-05-15")
                
                click_first_available(page, [
                    "button[type=submit]",
                    "button:has-text('Agree')",
                    "button:has-text('Continue')",
                    "button:has-text('继续')",
                    "button:has-text('同意')",
                ])
                page.wait_for_timeout(3000)
            except Exception:
                pass

            # 检测是否强制要求手机号接码
            phone_sel = "input[type='tel'], input[placeholder*='phone' i], input[name*='phone' i]"
            if page.locator(phone_sel).count() and page.locator(phone_sel).first.is_visible():
                append_login_log(job_id, "需要手机验证，已按失败处理。", "error", "phone_verification_required")
                raise RuntimeError("需要手机验证，已按失败处理。")

            append_login_log(job_id, "读取注册成功后的会话...", "info", "fetch_session")
            page.goto("https://chatgpt.com/api/auth/session", wait_until="networkidle", timeout=60000)
            content = page.locator("body").inner_text(timeout=15000)
            session = json.loads(content)
            if not isinstance(session, dict) or not session.get("accessToken"):
                raise RuntimeError("注册成功但未能自动获取 accessToken 会话")
            
            append_login_log(job_id, "换取 OpenAI OAuth refresh_token", "info", "oauth")
            oauth_payload = fetch_openai_oauth_with_playwright(page, proxy_url=proxy_url)
            session = merge_session_with_oauth(session, oauth_payload)
            session["registration_password"] = password
            return session
        except PlaywrightTimeoutError as exc:
            raise RuntimeError(f"注册页面操作超时：{exc}") from exc
        finally:
            context.close()
            browser.close()


def run_cpa_login_job(job_id: str, payload: dict[str, Any]) -> None:
    set_login_job_status(job_id, "running")
    append_login_log(job_id, "任务启动", "info", "start")
    try:
        session_payload = payload.get("session_json") if isinstance(payload.get("session_json"), dict) else None
        if session_payload:
            append_login_log(job_id, "使用传入 Session JSON 转换 CPA", "info", "session")
        elif payload.get("mode") == "signup":
            raise RuntimeError("当前凭证刷新只走已有账号协议登录；注册新账号不是这条刷新链路。")
        else:
            proxy_url = require_login_proxy_url(payload)
            proxy_label = "已启用代理" if proxy_url else "未启用代理"
            append_login_log(job_id, f"使用 CPA OAuth 协议登录（{proxy_label}）", "info", "strategy")
            proxy_session = coerce_text(payload.get("proxy_session") or payload.get("proxySession") or payload.get("job_id") or payload.get("jobId"))
            if proxy_session:
                append_login_log(job_id, f"本轮代理粘性会话：{proxy_session[-8:]}", "info", "egress")
            try:
                trace = probe_egress_trace(proxy_url)
                ip = trace.get("ip") or "-"
                loc = trace.get("loc") or "-"
                colo = trace.get("colo") or "-"
                append_login_log(job_id, f"当前后端出口：ip={ip}，地区={loc}，节点={colo}（{proxy_label}）", "info", "egress")
                try:
                    time.sleep(0.8)
                    confirm_trace = probe_egress_trace(proxy_url)
                    confirm_ip = confirm_trace.get("ip") or ""
                    if confirm_ip and ip != "-" and confirm_ip != ip:
                        raise LoginFlowError(
                            f"代理出口不稳定：同一账号会话检测到 {ip} -> {confirm_ip}",
                            code="proxy_ip_unstable",
                            hint="同一个账号的一轮 OAuth 需要稳定出口。已在发码前停止，请换一个新的代理 session 后重试。",
                            retryable=True,
                        )
                except Exception as confirm_exc:
                    if isinstance(confirm_exc, LoginFlowError):
                        raise
                    raise LoginFlowError(
                        f"代理出口复检失败：{str(confirm_exc)[:140]}",
                        code="proxy_ip_unstable",
                        hint="同一个账号的一轮 OAuth 需要稳定出口。已在发码前停止，请换一个新的代理 session 后重试。",
                        retryable=True,
                    ) from confirm_exc
            except Exception as exc:
                if isinstance(exc, LoginFlowError):
                    raise
                append_login_log(job_id, f"出口探测失败：{str(exc)[:180]}", "warning", "egress")
            session_payload = run_chatgpt_login_with_protocol(job_id, {**payload, "login_strategy": "protocol"})
        auth_file = session_to_cpa_auth(
            session_payload,
            payload.get("row") if isinstance(payload.get("row"), dict) else {},
            require_refresh_token=not bool(payload.get("session_json")) and not bool(session_payload.get("cpa_callback_only")),
        )
        append_login_log(job_id, "Session 已转换为 CPA auth", "success", "convert")

        # 保存刷新结果到磁盘
        try:
            append_refresh_result(
                auth_file,
                email=auth_file.get("email") or payload.get("email"),
                job_id=job_id,
                path=workspace_file(payload.get("_workspace_id", "public"), "refresh_results.json"),
            )
            append_login_log(job_id, "已保存登录凭证至服务器", "info", "persist_success")
        except Exception as e:
            append_login_log(job_id, f"持久化凭证失败: {str(e)}", "warning", "persist_failed")

        # 检查是否配置了 CPA，如果配置了，则无论是否 login_only 都上传 CPA
        has_cpa = bool(coerce_text(payload.get("base_url")) and coerce_text(payload.get("management_key")))
        reg_password = session_payload.get("registration_password") if isinstance(session_payload, dict) else None

        if session_payload.get("cpa_callback_only"):
            append_login_log(job_id, "CPA 已通过 OAuth callback 自行更新凭证，跳过本地 auth JSON 覆盖", "success", "done")
            set_login_job_status(job_id, "success", result={
                "success": True,
                "cpa_update": True,
                "auth_file": auth_file,
                "result": {
                    "email": auth_file.get("email"),
                    "name": auth_file.get("name"),
                    "auth_file": auth_file,
                    "action": "cpa_oauth_callback",
                    "message": "CPA OAuth 回调已提交",
                    "ok": True,
                    "cpa_oauth_result": session_payload.get("cpa_oauth_result"),
                },
            })
            return

        if payload.get("login_only") and not has_cpa:
            append_login_log(job_id, "账号登录完成（未配置 CPA，跳过上传）", "success", "done")
            success_result = {
                "success": True,
                "login_only": True,
                "auth_file": auth_file,
                "result": {
                    "email": auth_file.get("email"),
                    "name": auth_file.get("name"),
                    "auth_file": auth_file,
                    "action": "login_success",
                    "message": "登录成功",
                    "ok": True,
                },
            }
            if reg_password:
                success_result["registration_password"] = reg_password
                success_result["result"]["registration_password"] = reg_password
            set_login_job_status(job_id, "success", result=success_result)
            return

        cpa_payload = {
            "base_url": payload.get("base_url"),
            "management_key": payload.get("management_key"),
            "name": payload.get("name") or auth_file.get("email"),
            "auth_file": auth_file,
        }
        append_login_log(job_id, "正在上传凭证至 CPA...", "info", "uploading")
        result = replace_cpa_auth_file(cpa_payload)
        if not result.get("success"):
            raise RuntimeError(result.get("error") or "CPA 上传失败")
        result["auth_file"] = auth_file
        if isinstance(result.get("result"), dict):
            result["result"]["auth_file"] = auth_file
        
        # 记录是否为带 CPA 上传的 login_only
        if payload.get("login_only"):
            result["login_only"] = True
            append_login_log(job_id, "账号登录完成并已自动上传更新 CPA", "success", "done")
        else:
            append_login_log(job_id, "已上传 CPA auth，并完成探测", "success", "upload")
            
        if reg_password:
            result["registration_password"] = reg_password
            if isinstance(result.get("result"), dict):
                result["result"]["registration_password"] = reg_password
        set_login_job_status(job_id, "success", result=result)
    except Exception as exc:
        details = classify_login_exception(exc)
        message = details["message"][:800]
        append_login_log(job_id, message, "error", details.get("code") or "failed")
        if details.get("hint") and details.get("hint") != message:
            append_login_log(job_id, details["hint"], "warning", "hint")
        set_login_job_status(
            job_id,
            "failed",
            error=message,
            error_code=details.get("code"),
            error_hint=details.get("hint"),
            retryable=details.get("retryable", True),
            http_status=details.get("status"),
        )


def start_cpa_login_job(payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
    email_addr = coerce_text(payload.get("email"))
    if "@" not in email_addr:
        raise RuntimeError("请选择带邮箱的账号")
    require_login_proxy_url(payload)
    login_only = bool(payload.get("login_only") or payload.get("loginOnly"))
    if not login_only and not coerce_text(payload.get("base_url") or payload.get("baseUrl")):
        raise RuntimeError("CPA 地址不能为空")
    if not login_only and not coerce_text(payload.get("management_key") or payload.get("managementKey")):
        raise RuntimeError("CPA 管理密钥不能为空")
    job_id = uuid.uuid4().hex
    payload = dict(payload)
    if coerce_text(payload.get("mode") or "login").lower() != "signup":
        payload.setdefault("force_email_code", True)
        payload.setdefault("email_code_login", True)
        if str(first_text(payload.get("force_email_code"), payload.get("email_code_login"))).lower() in {"1", "true", "yes", "on"}:
            payload["password"] = ""
    payload["_workspace_id"] = normalize_workspace_id(workspace_id)
    payload["login_only"] = login_only
    payload["base_url"] = normalize_cpa_base_url(coerce_text(payload.get("base_url") or payload.get("baseUrl")) or "http://localhost:8317")
    payload["management_key"] = coerce_text(payload.get("management_key") or payload.get("managementKey"))
    payload["job_id"] = job_id
    job = {
        "job_id": job_id,
        "status": "queued",
        "email": email_addr,
        "name": coerce_text(payload.get("name")),
        "logs": [],
        "result": None,
        "error": "",
        "created_at": iso_now(),
        "updated_at": iso_now(),
        "started_at": iso_now(),
        "workspace_id": payload["_workspace_id"],
        "login_only": login_only,
        "site_url": payload.get("base_url") if not login_only or coerce_text(payload.get("base_url")) else "",
    }
    with LOGIN_JOBS_LOCK:
        LOGIN_JOBS[job_id] = job
    if payload.pop("_allow_stored_mail_credentials", False):
        summary = hydrate_login_mail_credentials(payload, payload["_workspace_id"])
        if summary.get("added") or summary.get("updated"):
            append_login_log(
                job_id,
                (
                    "邮箱取码凭证已从服务端补齐："
                    f"Outlook {summary.get('microsoft', 0)}，临时邮箱 {summary.get('temp', 0)}"
                ),
                "info",
                "mail_credentials",
            )
    counts = login_mail_credential_counts(payload)
    append_login_log(
        job_id,
        f"邮箱取码凭证：Outlook {counts.get('microsoft', 0)}，临时邮箱 {counts.get('temp', 0)}",
        "info" if counts.get("total", 0) else "warning",
        "mail_credentials",
    )
    thread = threading.Thread(target=run_cpa_login_job, args=(job_id, payload), daemon=True)
    thread.start()
    return {"success": True, "job": login_job_public(job)}


def get_cpa_login_job(job_id: str, workspace_id: str = "") -> dict[str, Any]:
    with LOGIN_JOBS_LOCK:
        job = LOGIN_JOBS.get(job_id)
        if not job:
            raise RuntimeError("登录任务不存在")
        expected_workspace = normalize_workspace_id(workspace_id)
        job_workspace = normalize_workspace_id(job.get("workspace_id"))
        if expected_workspace and job_workspace != expected_workspace:
            raise RuntimeError("登录任务不属于当前工作区")
        return {"success": True, "job": login_job_public(job)}


def login_mail_credential_counts(payload: dict[str, Any]) -> dict[str, int]:
    microsoft = 0
    for item in payload.get("accounts", []):
        if not isinstance(item, dict):
            continue
        if usable_secret(item.get("client_id")) and usable_secret(item.get("refresh_token")):
            microsoft += 1
    temp = 0
    for item in payload.get("temp_addresses", []):
        if not isinstance(item, dict):
            continue
        if usable_secret(item.get("jwt")):
            temp += 1
    return {"microsoft": microsoft, "temp": temp, "total": microsoft + temp}


def hydrate_login_mail_credentials(payload: dict[str, Any], workspace_id: str = "public") -> dict[str, int]:
    email_addr = coerce_text(payload.get("email")).lower()
    if "@" not in email_addr:
        return {"microsoft": 0, "temp": 0, "added": 0, "updated": 0}
    accounts = [item for item in payload.get("accounts", []) if isinstance(item, dict)]
    temp_addresses = [item for item in payload.get("temp_addresses", []) if isinstance(item, dict)]
    added = 0
    updated = 0

    def same_email(item: dict[str, Any]) -> bool:
        return coerce_text(item.get("email")).lower() == email_addr

    if not any(same_email(item) and usable_secret(item.get("client_id")) and usable_secret(item.get("refresh_token")) for item in accounts):
        stored = load_accounts(workspace_file(workspace_id, "accounts.json")).get(email_addr)
        if stored and usable_secret(stored.client_id) and usable_secret(stored.refresh_token):
            stored_item = {
                "email": stored.email,
                "password": stored.password,
                "client_id": stored.client_id,
                "refresh_token": stored.refresh_token,
                "label": stored.label,
            }
            replaced = False
            for index, item in enumerate(accounts):
                if same_email(item):
                    accounts[index] = {**item, **stored_item}
                    replaced = True
                    updated += 1
                    break
            if not replaced:
                accounts.append(stored_item)
                added += 1

    if not any(same_email(item) and usable_secret(item.get("jwt")) for item in temp_addresses):
        stored_temp = load_temp_addresses(workspace_file(workspace_id, "temp_addresses.json")).get(email_addr)
        if stored_temp and usable_secret(stored_temp.jwt):
            stored_item = {
                "email": stored_temp.email,
                "jwt": stored_temp.jwt,
                "base_url": stored_temp.base_url or TEMP_WORKER_URL,
                "site_password": stored_temp.site_password,
                "label": stored_temp.label,
            }
            replaced = False
            for index, item in enumerate(temp_addresses):
                if same_email(item):
                    temp_addresses[index] = {**item, **stored_item}
                    replaced = True
                    updated += 1
                    break
            if not replaced:
                temp_addresses.append(stored_item)
                added += 1

    payload["accounts"] = accounts
    payload["temp_addresses"] = temp_addresses
    counts = login_mail_credential_counts(payload)
    return {**counts, "added": added, "updated": updated}


def transient_mail_accounts(payload: dict[str, Any]) -> tuple[list[MailAccount], list[str]]:
    accounts: list[MailAccount] = []
    errors: list[str] = []
    if payload.get("accounts_text"):
        parsed, parsed_errors = parse_account_lines(str(payload.get("accounts_text", "")))
        accounts.extend(parsed)
        errors.extend(parsed_errors)
    for idx, item in enumerate(payload.get("accounts", []), start=1):
        if not isinstance(item, dict):
            errors.append(f"Account {idx}: invalid object")
            continue
        email_addr = coerce_text(item.get("email"))
        client_id = coerce_text(item.get("client_id"))
        refresh_token = coerce_text(item.get("refresh_token"))
        if "@" not in email_addr or not usable_secret(client_id) or not usable_secret(refresh_token):
            errors.append(f"Account {idx}: missing email/client_id/refresh_token")
            continue
        accounts.append(MailAccount(
            email=email_addr,
            password=coerce_text(item.get("password")),
            client_id=client_id,
            refresh_token=refresh_token,
            label=coerce_text(item.get("label") or item.get("category")),
        ))
    return accounts, errors


def transient_temp_addresses(payload: dict[str, Any]) -> tuple[list[TempAddress], list[str]]:
    addresses: list[TempAddress] = []
    errors: list[str] = []
    if payload.get("temp_text"):
        parsed, parsed_errors = parse_temp_address_lines(str(payload.get("temp_text", "")))
        addresses.extend(parsed)
        errors.extend(parsed_errors)
    for idx, item in enumerate(payload.get("temp_addresses", []), start=1):
        if not isinstance(item, dict):
            errors.append(f"Temp address {idx}: invalid object")
            continue
        email_addr = coerce_text(item.get("email"))
        if "@" not in email_addr:
            errors.append(f"Temp address {idx}: invalid email")
            continue
        if not usable_secret(item.get("jwt")):
            errors.append(f"Temp address {idx}: missing jwt")
            continue
        base_url = normalize_temp_worker_url(coerce_text(item.get("base_url") or item.get("baseUrl") or TEMP_WORKER_URL))
        site_password = coerce_text(item.get("site_password") or item.get("sitePassword") or TEMP_SITE_PASSWORD)
        addresses.append(TempAddress(
            email=email_addr,
            jwt=coerce_text(item.get("jwt")),
            base_url=base_url,
            site_password=site_password,
            label=coerce_text(item.get("label") or item.get("category")),
        ))
    return addresses, errors


def fetch_transient_client_mail(payload: dict[str, Any]) -> dict[str, Any]:
    accounts, account_errors = transient_mail_accounts(payload)
    temp_addresses, temp_errors = transient_temp_addresses(payload)
    if temp_addresses and not TEMP_WORKER_URL and any(not address.base_url for address in temp_addresses):
        raise RuntimeError("GPT_ACCOUNT_MANAGER_TEMP_WORKER_URL is required for temp mailbox refresh")
    if temp_addresses:
        for address in temp_addresses:
            validate_configured_base_url(normalize_temp_worker_url(address.base_url or TEMP_WORKER_URL))
    selected = {email.lower() for email in payload.get("emails", []) if isinstance(email, str)}
    source = coerce_text(payload.get("source") or "all").lower()
    provider = coerce_text(payload.get("provider") or "auto").lower()
    sender_filter = coerce_text(payload.get("sender_filter"))
    limit = max(1, min(int(payload.get("limit", 20) or 20), 50))
    jobs: list[tuple[str, MailAccount | TempAddress, str, int, str]] = []

    if source in {"all", "microsoft"}:
        for account in accounts:
            if selected and account.email.lower() not in selected:
                continue
            jobs.append(("microsoft", account, provider, limit, sender_filter))
    if source in {"all", "temp"}:
        for address in temp_addresses:
            if selected and address.email.lower() not in selected:
                continue
            jobs.append(("temp", address, provider, limit, sender_filter))

    results = run_mail_fetch_jobs(jobs)
    messages = [message for result in results for message in result.get("messages", [])]
    failed_results = [result for result in results if not result.get("ok")]
    return {
        "results": results,
        "messages": sorted(messages, key=message_sort_value, reverse=True),
        "errors": account_errors + temp_errors,
        "summary": {
            "total": len(results),
            "ok": len(results) - len(failed_results),
            "failed": len(failed_results),
            "messages": len(messages),
        },
        "types": MAIL_TYPE_LABELS,
    }


def mail_fetch_job_public(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": job.get("job_id"),
        "status": job.get("status"),
        "workspace_id": job.get("workspace_id"),
        "created_at": job.get("created_at", ""),
        "updated_at": job.get("updated_at", ""),
        "finished_at": job.get("finished_at", ""),
        "total": int(job.get("total") or 0),
        "result": job.get("result"),
        "error": job.get("error", ""),
    }


def set_mail_fetch_job(job_id: str, **updates: Any) -> None:
    with MAIL_FETCH_JOBS_LOCK:
        job = MAIL_FETCH_JOBS.get(job_id)
        if not job:
            return
        job.update(updates)
        job["updated_at"] = iso_now()
        if job.get("status") in {"success", "failed"} and not job.get("finished_at"):
            job["finished_at"] = job["updated_at"]


def trim_mail_fetch_jobs() -> None:
    with MAIL_FETCH_JOBS_LOCK:
        if len(MAIL_FETCH_JOBS) <= MAIL_FETCH_JOB_LIMIT:
            return
        ordered = sorted(
            MAIL_FETCH_JOBS.values(),
            key=lambda item: coerce_text(item.get("updated_at") or item.get("created_at")),
        )
        for job in ordered[:max(0, len(MAIL_FETCH_JOBS) - MAIL_FETCH_JOB_LIMIT)]:
            MAIL_FETCH_JOBS.pop(coerce_text(job.get("job_id")), None)


def run_client_mail_fetch_job(job_id: str, payload: dict[str, Any]) -> None:
    try:
        result = fetch_transient_client_mail(payload)
        set_mail_fetch_job(job_id, status="success", result=result)
    except Exception as exc:
        set_mail_fetch_job(job_id, status="failed", error=str(exc)[:500])


def start_client_mail_fetch_job(payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
    hydrate_login_mail_credentials(payload, workspace_id)
    accounts, account_errors = transient_mail_accounts(payload)
    temp_addresses, temp_errors = transient_temp_addresses(payload)
    total = len(accounts) + len(temp_addresses)
    if total <= 0:
        raise RuntimeError("当前筛选下没有可刷新邮箱")
    job_id = secrets.token_urlsafe(12)
    now = iso_now()
    job = {
        "job_id": job_id,
        "status": "running",
        "workspace_id": normalize_workspace_id(workspace_id),
        "created_at": now,
        "updated_at": now,
        "total": total,
        "result": None,
        "error": "",
        "warnings": account_errors + temp_errors,
    }
    with MAIL_FETCH_JOBS_LOCK:
        MAIL_FETCH_JOBS[job_id] = job
    trim_mail_fetch_jobs()
    thread = threading.Thread(target=run_client_mail_fetch_job, args=(job_id, payload), daemon=True)
    thread.start()
    return {"success": True, "job": mail_fetch_job_public(job)}


def get_client_mail_fetch_job(job_id: str, workspace_id: str = "public") -> dict[str, Any]:
    expected_workspace = normalize_workspace_id(workspace_id)
    with MAIL_FETCH_JOBS_LOCK:
        job = MAIL_FETCH_JOBS.get(coerce_text(job_id))
        if not job:
            raise RuntimeError("收信任务不存在或已过期")
        if normalize_workspace_id(job.get("workspace_id")) != expected_workspace:
            raise RuntimeError("收信任务不属于当前工作区")
        return {"success": True, "job": mail_fetch_job_public(job)}


def admin_worker_headers(admin_password: str, site_password: str = "") -> dict[str, str]:
    headers = {
        **DEFAULT_HTTP_HEADERS,
        "x-lang": "zh",
    }
    if admin_password:
        headers["x-admin-auth"] = admin_password
    if site_password:
        headers["x-custom-auth"] = site_password
    return headers


def payload_rows(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    rows = payload.get("results") or payload.get("data") or payload.get("items") or []
    if not isinstance(rows, list):
        rows = []
    count = payload.get("count") or payload.get("total") or len(rows)
    try:
        count_int = int(count)
    except Exception:
        count_int = len(rows)
    return [row for row in rows if isinstance(row, dict)], count_int


def extract_admin_jwt(base_url: str, headers: dict[str, str], email_addr: str) -> dict[str, Any]:
    query_email = email_addr.strip()
    result: dict[str, Any] = {
        "email": query_email,
        "address": "",
        "id": "",
        "jwt": "",
        "ok": False,
        "error": "",
    }
    if "@" not in query_email:
        result["error"] = "invalid email"
        return result
    for page in range(20):
        params = urllib.parse.urlencode({
            "limit": "100",
            "offset": str(page * 100),
            "query": query_email,
            "sort_by": "id",
            "sort_order": "desc",
        })
        payload = http_json(f"{base_url}/admin/address?{params}", headers=headers, timeout=30)
        rows, count = payload_rows(payload)
        exact = None
        for row in rows:
            name = coerce_text(row.get("name") or row.get("address") or row.get("email"))
            if name.lower() == query_email.lower():
                exact = row
                break
        if exact:
            address_id = coerce_text(exact.get("id"))
            if not address_id:
                result["error"] = "address id missing"
                return result
            credential = http_json(
                f"{base_url}/admin/show_password/{urllib.parse.quote(address_id)}",
                headers=headers,
                timeout=30,
            )
            result.update({
                "address": coerce_text(exact.get("name") or exact.get("address") or exact.get("email")),
                "id": address_id,
                "jwt": coerce_text(credential.get("jwt")),
                "ok": bool(credential.get("jwt")),
                "error": "" if credential.get("jwt") else "jwt missing",
            })
            return result
        if not rows or (page + 1) * 100 >= count:
            break
    result["error"] = "not found"
    return result


def validate_admin_worker_url(base_url: str) -> None:
    parsed = urllib.parse.urlparse(base_url)
    if parsed.scheme not in {"http", "https"}:
        raise RuntimeError("Worker URL must start with http:// or https://")
    if not parsed.hostname:
        raise RuntimeError("Worker URL host missing")
    try:
        socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except OSError as exc:
        raise RuntimeError(network_error_message(base_url, exc)) from exc


def extract_admin_jwts(payload: dict[str, Any]) -> dict[str, Any]:
    base_url = coerce_text(payload.get("base_url")).rstrip("/")
    admin_password = coerce_text(payload.get("admin_password"))
    site_password = coerce_text(payload.get("site_password"))
    emails = [line.strip() for line in str(payload.get("emails", "")).splitlines() if line.strip()]
    if isinstance(payload.get("email_list"), list):
        emails.extend(str(item).strip() for item in payload["email_list"] if str(item).strip())
    unique_emails = list(dict.fromkeys(email.lower() for email in emails))
    if not base_url:
        raise RuntimeError("base_url is required")
    if not unique_emails:
        return {"results": [], "count": 0}

    validate_admin_worker_url(base_url)
    headers = admin_worker_headers(admin_password, site_password)
    results: list[dict[str, Any]] = []
    for email_addr in unique_emails:
        try:
            results.append(extract_admin_jwt(base_url, headers, email_addr))
        except Exception as exc:
            error = str(exc)[:300]
            if "Temporary failure in name resolution" in error or "Name or service not known" in error:
                error = f"Temp API DNS lookup failed. Check the Worker URL: {error}"
            results.append({
                "email": email_addr,
                "address": "",
                "id": "",
                "jwt": "",
                "ok": False,
                "error": error,
            })
    return {"results": results, "count": len(results)}


def sync_temp_jwts_from_worker(payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
    result = extract_admin_jwts(payload)
    base_url = normalize_temp_worker_url(coerce_text(payload.get("base_url")).rstrip("/"))
    site_password = coerce_text(payload.get("site_password"))
    addresses_path = workspace_file(workspace_id, "temp_addresses.json")
    addresses = load_temp_addresses(addresses_path)
    imported = 0
    updated = 0
    for item in result.get("results", []):
        if not isinstance(item, dict) or not item.get("ok") or not usable_secret(item.get("jwt")):
            continue
        email_addr = coerce_text(item.get("address") or item.get("email")).lower()
        if "@" not in email_addr:
            continue
        existing = addresses.get(email_addr)
        addresses[email_addr] = TempAddress(
            email=email_addr,
            jwt=coerce_text(item.get("jwt")),
            base_url=base_url,
            site_password=site_password,
            label="临时邮箱",
            created_at=existing.created_at if existing else iso_now(),
            updated_at=iso_now(),
        )
        if existing:
            updated += 1
        else:
            imported += 1
    if imported or updated:
        save_temp_addresses(addresses, addresses_path)
    return {
        **result,
        "success": True,
        "imported": imported,
        "updated": updated,
        "addresses": [addr.public() for addr in addresses.values()],
    }


def import_pickup_accounts(payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
    incoming, errors = parse_account_lines(str(payload.get("text", "")))
    accounts_path = workspace_file(workspace_id, "accounts.json")
    accounts = load_accounts(accounts_path)
    imported = 0
    updated = 0
    skipped = 0
    replace_existing = True
    for account in incoming:
        key = account.email.lower()
        existing = accounts.get(key)
        if existing:
            if not replace_existing:
                skipped += 1
                continue
            account.created_at = existing.created_at
            updated += 1
        else:
            imported += 1
        accounts[key] = account
    if imported or updated:
        save_accounts(accounts, accounts_path)
    return {
        "success": True,
        "imported": imported,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "accounts": [acc.public() for acc in accounts.values()],
    }


def import_temp_addresses(payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
    incoming, errors = parse_temp_address_lines(str(payload.get("text", "")))
    addresses_path = workspace_file(workspace_id, "temp_addresses.json")
    addresses = load_temp_addresses(addresses_path)
    imported = 0
    updated = 0
    skipped = 0
    replace_existing = True
    default_base_url = normalize_temp_worker_url(
        coerce_text(payload.get("base_url") or payload.get("baseUrl") or TEMP_WORKER_URL)
    )
    default_site_password = coerce_text(payload.get("site_password") or payload.get("sitePassword"))
    for address in incoming:
        key = address.email.lower()
        existing = addresses.get(key)
        if existing:
            if not replace_existing:
                skipped += 1
                continue
            address.created_at = existing.created_at
            if not usable_secret(address.jwt):
                address.jwt = existing.jwt
            if not address.base_url:
                address.base_url = existing.base_url
            if not address.site_password:
                address.site_password = existing.site_password
            updated += 1
        else:
            imported += 1
        address.base_url = normalize_temp_worker_url(address.base_url or default_base_url)
        address.site_password = address.site_password or default_site_password
        address.updated_at = iso_now()
        addresses[key] = address
    if imported or updated:
        save_temp_addresses(addresses, addresses_path)
    return {
        "success": True,
        "imported": imported,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "addresses": [addr.public() for addr in addresses.values()],
    }


def delete_workspace_mail_credentials(payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
    emails = [
        coerce_text(item).lower()
        for item in payload.get("emails", [])
        if "@" in coerce_text(item)
    ]
    unique = list(dict.fromkeys(emails))
    accounts_path = workspace_file(workspace_id, "accounts.json")
    temp_path = workspace_file(workspace_id, "temp_addresses.json")
    accounts = load_accounts(accounts_path)
    addresses = load_temp_addresses(temp_path)
    deleted_microsoft = 0
    deleted_temp = 0
    for email_addr in unique:
        if accounts.pop(email_addr, None) is not None:
            deleted_microsoft += 1
        if addresses.pop(email_addr, None) is not None:
            deleted_temp += 1
    if deleted_microsoft:
        save_accounts(accounts, accounts_path)
    if deleted_temp:
        save_temp_addresses(addresses, temp_path)
    return {
        "success": True,
        "emails": unique,
        "deleted": {
            "microsoft": deleted_microsoft,
            "temp": deleted_temp,
            "total": deleted_microsoft + deleted_temp,
        },
        "accounts": [acc.public() for acc in accounts.values()],
        "addresses": [addr.public() for addr in addresses.values()],
    }


def public_pool_rows_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = payload.get("items") or payload.get("rows") or payload.get("accounts") or []
    if not isinstance(rows, list):
        rows = []
    clean_rows: list[dict[str, Any]] = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        email_addr = first_text(item.get("email"), item.get("address"), item.get("account"))
        jwt = coerce_text(item.get("jwt") or item.get("token"))
        if "@" not in email_addr or not jwt:
            continue
        clean_rows.append({
            "email": email_addr,
            "jwt": jwt,
            "source": coerce_text(item.get("source") or "temp-mail"),
            "category": coerce_text(item.get("category") or payload.get("category") or "公益池"),
            "note": coerce_text(item.get("note") or payload.get("note")),
        })
    return clean_rows


def push_public_pool(payload: dict[str, Any]) -> dict[str, Any]:
    rows = public_pool_rows_from_payload(payload)
    if not rows:
        return {"success": False, "pushed": 0, "error": "没有可推送的账号"}
    target_url = coerce_text(payload.get("target_url") or payload.get("targetUrl") or PUBLIC_POOL_API_URL)
    package = {
        "source": "gpt-account-manager",
        "kind": "temp-mail-jwt",
        "note": coerce_text(payload.get("note")),
        "items": rows,
        "count": len(rows),
        "created_at": iso_now(),
    }
    if not target_url:
        return {
            "success": True,
            "mode": "prepared",
            "pushed": 0,
            "count": len(rows),
            "package": package,
            "message": "未配置公益池 API，已生成可复制 JSON",
        }
    validate_remote_base_url(target_url)
    headers = {"Content-Type": "application/json"}
    token = coerce_text(payload.get("pool_token") or payload.get("poolToken") or PUBLIC_POOL_TOKEN)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    response = http_request_json(target_url, method="POST", json_data=package, headers=headers, timeout=30)
    return {
        "success": True,
        "mode": "pushed",
        "pushed": len(rows),
        "count": len(rows),
        "response": response,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "MailPickupTool/0.1"

    def do_GET(self) -> None:
        parsed_request = urllib.parse.urlparse(self.path)
        request_path = parsed_request.path
        if request_path == "/public-config":
            self.send_json({
                "title": PUBLIC_APP_TITLE,
                "version": APP_VERSION,
                "store_url": PUBLIC_STORE_URL,
                "relay_url": PUBLIC_RELAY_URL,
                "public_pool_url": PUBLIC_POOL_URL,
                "top_links": public_top_links(),
                "public_pool_api_configured": bool(PUBLIC_POOL_API_URL),
            })
            return
        if request_path.lower() in {"/login", "/login.html"}:
            self.serve_static_file(STATIC_DIR / "login.html")
            return
        if request_path == "/health":
            try:
                self.require_admin_page_auth()
            except ConnectionAbortedError:
                return
            self.send_json(health_payload())
            return
        if request_path == "/network-health":
            try:
                self.require_admin_page_auth()
            except ConnectionAbortedError:
                return
            self.send_json(network_health_payload())
            return
        if request_path == "/admin-api/upgrade/status":
            try:
                self.require_auth()
            except ConnectionAbortedError:
                return
            self.send_json(upgrade_status_payload())
            return
        if request_path.lower() == "/health.html":
            try:
                self.require_admin_page_auth()
            except ConnectionAbortedError:
                return
            self.serve_static_file(STATIC_DIR / "health.html")
            return
        if request_path.lower().startswith("/login-debug/"):
            try:
                self.require_admin_page_auth()
            except ConnectionAbortedError:
                return
            rel = urllib.parse.unquote(request_path[len("/login-debug/"):])
            target = (LOGIN_DEBUG_DIR / rel).resolve()
            if LOGIN_DEBUG_DIR.resolve() not in target.parents and target != LOGIN_DEBUG_DIR.resolve():
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            self.serve_static_file(target)
            return
        if request_path.lower().startswith("/public-pool"):
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", PUBLIC_POOL_URL or PUBLIC_RELAY_URL or "/")
            self.end_headers()
            return
        if request_path.lower() in {"/converter", "/converter/"}:
            self.serve_static_file(STATIC_DIR / "converter.html")
            return
        if request_path.lower() in {"/refresh", "/refresh/"}:
            self.serve_static_file(STATIC_DIR / "refresh.html")
            return
        if request_path.lower() in {"/mailboxes", "/mailboxes/"}:
            self.serve_static_file(STATIC_DIR / "mailboxes.html")
            return
        if request_path.lower() in {"/warehouse", "/warehouse/"}:
            self.serve_static_file(STATIC_DIR / "warehouse.html")
            return
        parsed_client = parsed_request
        if parsed_client.path == "/client-api/cpa/login-status":
            try:
                params = urllib.parse.parse_qs(parsed_client.query)
                self.send_json(get_cpa_login_job(params.get("job_id", [""])[0], self.workspace_id()))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed_client.path == "/client-api/cpa/local-oauth-status":
            try:
                params = urllib.parse.parse_qs(parsed_client.query)
                self.send_json(get_local_oauth_flow(params.get("state", [""])[0]))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed_client.path == "/client-api/fetch-status":
            try:
                params = urllib.parse.parse_qs(parsed_client.query)
                self.send_json(get_client_mail_fetch_job(params.get("job_id", [""])[0], self.workspace_id()))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed_client.path == "/client-api/accounts":
            try:
                accounts = load_accounts(workspace_file(self.workspace_id(), "accounts.json"))
                self.send_json({"accounts": [acc.public() for acc in accounts.values()]})
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed_client.path == "/client-api/temp-addresses":
            try:
                addresses = load_temp_addresses(workspace_file(self.workspace_id(), "temp_addresses.json"))
                self.send_json({"addresses": [addr.public() for addr in addresses.values()]})
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed_client.path == "/client-api/refresh-results":
            try:
                results = load_refresh_results(workspace_file(self.workspace_id(), "refresh_results.json"))
                self.send_json({"results": results})
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path.startswith("/api/"):
            self.require_auth()
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path == "/api/accounts":
                accounts = load_accounts()
                self.send_json({"accounts": [acc.public() for acc in accounts.values()]})
                return
            if parsed.path == "/api/temp-addresses":
                addresses = load_temp_addresses()
                self.send_json({"addresses": [addr.public() for addr in addresses.values()]})
                return
            if parsed.path == "/api/refresh-results":
                results = load_refresh_results()
                self.send_json({"results": results})
                return
            if parsed.path == "/api/login-history":
                history = load_login_history()
                self.send_json({"history": history})
                return
            if parsed.path == "/api/messages":
                params = urllib.parse.parse_qs(parsed.query)
                payload = {
                    "query": params.get("query", [""])[0],
                    "sender": params.get("sender", [""])[0],
                    "source": params.get("source", ["all"])[0],
                    "mail_type": params.get("mail_type", ["all"])[0],
                    "account": params.get("account", [""])[0],
                }
                limit = max(1, min(int(params.get("limit", ["80"])[0] or 80), 500))
                messages = filter_messages(load_messages(), payload)[:limit]
                self.send_json({
                    "messages": messages,
                    "count": len(messages),
                    "types": MAIL_TYPE_LABELS,
                })
                return
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.serve_static()

    def do_POST(self) -> None:
        if self.path == "/auth/login":
            try:
                payload = self.read_json()
                token = str(payload.get("token", "")).strip()
                if not ADMIN_TOKEN:
                    self.send_json({"success": False, "error": "MAIL_PICKUP_ADMIN_TOKEN is not set."}, status=HTTPStatus.SERVICE_UNAVAILABLE)
                    return
                if not hmac.compare_digest(token, ADMIN_TOKEN):
                    self.send_json({"success": False, "error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
                    return
                self.send_json_with_headers(
                    {"success": True},
                    {
                        "Set-Cookie": self.admin_cookie_header(token),
                    },
                )
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/auth/logout":
            self.send_json_with_headers(
                {"success": True},
                {
                    "Set-Cookie": self.clear_admin_cookie_header(),
                },
            )
            return
        if self.path == "/client-api/fetch":
            try:
                payload = self.read_json()
                hydrate_login_mail_credentials(payload, self.workspace_id())
                self.send_json(fetch_transient_client_mail(payload))
            except Exception as exc:
                self.send_json({"error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/fetch-start":
            try:
                self.send_json(start_client_mail_fetch_job(self.read_json(), self.workspace_id()))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/messages/delete":
            try:
                self.send_json(delete_transient_client_mail_message(self.read_json()))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/cpa/scan-401":
            try:
                self.send_json(scan_cpa_401(self.read_json()))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/cpa/repair-401":
            try:
                self.send_json(repair_cpa_401(self.read_json()))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path in {"/client-api/cpa/delete", "/client-api/cpa/delete-selected"}:
            try:
                self.send_json(delete_cpa_items(self.read_json()))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/cpa/replace-auth":
            try:
                self.send_json(replace_cpa_auth_file(self.read_json()))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/accounts/lifecycle-refresh":
            try:
                self.send_json(refresh_lifecycle(self.read_json()))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/cpa/lifecycle-refresh":
            try:
                self.send_json(refresh_cpa_lifecycle(self.read_json()))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/proxy/check":
            try:
                self.send_json(check_proxy_egress(self.read_json()))
            except Exception as exc:
                details = classify_login_exception(exc)
                self.send_json({
                    "success": False,
                    "error": details.get("message", str(exc))[:500],
                    "error_code": details.get("code", "proxy_check_failed"),
                    "error_hint": details.get("hint", ""),
                }, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/temp-addresses/sync-jwts":
            try:
                self.send_json(sync_temp_jwts_from_worker(self.read_json(), self.workspace_id()))
            except Exception as exc:
                self.send_json({
                    "success": False,
                    "error": str(exc)[:500],
                    "error_code": "temp_sync_failed",
                }, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/accounts/import-pickup":
            try:
                self.send_json(import_pickup_accounts(self.read_json(), self.workspace_id()))
            except Exception as exc:
                self.send_json({
                    "success": False,
                    "error": str(exc)[:500],
                    "error_code": "pickup_import_failed",
                }, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/temp-addresses/import":
            try:
                self.send_json(import_temp_addresses(self.read_json(), self.workspace_id()))
            except Exception as exc:
                self.send_json({
                    "success": False,
                    "error": str(exc)[:500],
                    "error_code": "temp_import_failed",
                }, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/accounts/delete":
            try:
                self.send_json(delete_workspace_mail_credentials(self.read_json(), self.workspace_id()))
            except Exception as exc:
                self.send_json({
                    "success": False,
                    "error": str(exc)[:500],
                    "error_code": "delete_failed",
                }, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/phone-code/poll":
            try:
                self.send_json(poll_phone_code(self.read_json()))
            except Exception as exc:
                self.send_json({
                    "success": False,
                    "error": str(exc)[:500],
                    "error_code": "phone_code_fetch_failed",
                }, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/cpa/login-manual-code":
            try:
                self.send_json(set_login_manual_email_code(self.read_json(), self.workspace_id()))
            except Exception as exc:
                self.send_json({
                    "success": False,
                    "error": str(exc)[:500],
                    "error_code": "manual_email_code_failed",
                }, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/cpa/login-manual-phone-code":
            try:
                self.send_json(set_login_manual_phone_code(self.read_json(), self.workspace_id()))
            except Exception as exc:
                self.send_json({
                    "success": False,
                    "error": str(exc)[:500],
                    "error_code": "manual_phone_code_failed",
                }, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/cpa/login-cancel":
            try:
                self.send_json(cancel_login_job(self.read_json(), self.workspace_id()))
            except Exception as exc:
                self.send_json({
                    "success": False,
                    "error": str(exc)[:500],
                    "error_code": "login_cancel_failed",
                }, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/cpa/login-start":
            try:
                payload = self.read_json()
                if payload.get("use_stored_mail_credentials") or payload.get("useStoredMailCredentials"):
                    payload["_allow_stored_mail_credentials"] = True
                self.send_json(start_cpa_login_job(payload, self.workspace_id()))
            except Exception as exc:
                details = classify_login_exception(exc)
                self.send_json({
                    "success": False,
                    "error": details.get("message", str(exc))[:500],
                    "error_code": details.get("code", "login_failed"),
                    "error_hint": details.get("hint", ""),
                    "retryable": details.get("retryable", True),
                }, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/cpa/direct-oauth-start":
            try:
                self.send_json(cpa_direct_oauth_start(self.read_json()))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/cpa/direct-oauth-callback":
            try:
                self.send_json(cpa_direct_oauth_callback(self.read_json()))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/client-api/cpa/companion-wait-code":
            self.send_json({"success": False, "error": "Companion 扩展路径已停用；凭证刷新只走 CPA OAuth 协议登录。"}, status=HTTPStatus.GONE)
            return
        if self.path == "/client-api/cpa/manual-oauth-start":
            self.send_json({"success": False, "error": "手动 OAuth 路径已停用；凭证刷新只走 CPA OAuth 协议登录。"}, status=HTTPStatus.GONE)
            return
        if self.path == "/client-api/cpa/manual-oauth-complete":
            self.send_json({"success": False, "error": "手动 OAuth 路径已停用；凭证刷新只走 CPA OAuth 协议登录。"}, status=HTTPStatus.GONE)
            return
        if self.path == "/client-api/cpa/local-oauth-start":
            self.send_json({"success": False, "error": "本机浏览器 OAuth 路径已停用；凭证刷新只走 CPA OAuth 协议登录。"}, status=HTTPStatus.GONE)
            return
        if self.path.startswith("/admin-api/"):
            try:
                self.require_auth()
            except ConnectionAbortedError:
                return
            if self.path == "/admin-api/extract-jwts":
                try:
                    self.send_json(extract_admin_jwts(self.read_json()))
                except Exception as exc:
                    self.send_json({"error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
                return
            if self.path == "/admin-api/public-pool/push":
                try:
                    self.send_json(push_public_pool(self.read_json()))
                except Exception as exc:
                    self.send_json({"error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
                return
            if self.path == "/admin-api/upgrade/request":
                try:
                    self.send_json(create_upgrade_request(self.read_json()))
                except Exception as exc:
                    self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
                return
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.require_auth()
        if self.path == "/api/import":
            payload = self.read_json()
            incoming, errors = parse_account_lines(str(payload.get("text", "")))
            accounts = load_accounts()
            imported = 0
            skipped = 0
            updated = 0
            replace_existing = bool(payload.get("replace_existing") or payload.get("replaceExisting"))
            for account in incoming:
                key = account.email.lower()
                if key in accounts:
                    if not replace_existing:
                        skipped += 1
                        continue
                    account.created_at = accounts[key].created_at
                    updated += 1
                else:
                    imported += 1
                accounts[key] = account
            save_accounts(accounts)
            self.send_json({
                "imported": imported,
                "skipped": skipped,
                "updated": updated,
                "errors": errors,
                "accounts": [acc.public() for acc in accounts.values()],
            })
            return
        if self.path == "/api/temp-addresses/import":
            payload = self.read_json()
            incoming, errors = parse_temp_address_lines(str(payload.get("text", "")))
            addresses = load_temp_addresses()
            imported = 0
            skipped = 0
            updated = 0
            replace_existing = bool(payload.get("replace_existing") or payload.get("replaceExisting"))
            for address in incoming:
                key = address.email.lower()
                if key in addresses:
                    if not replace_existing:
                        skipped += 1
                        continue
                    address.created_at = addresses[key].created_at
                    updated += 1
                else:
                    imported += 1
                addresses[key] = address
            save_temp_addresses(addresses)
            self.send_json({
                "imported": imported,
                "skipped": skipped,
                "updated": updated,
                "errors": errors,
                "addresses": [addr.public() for addr in addresses.values()],
            })
            return
        if self.path == "/api/fetch":
            payload = self.read_json()
            accounts = load_accounts()
            temp_addresses = load_temp_addresses()
            selected = [email.lower() for email in payload.get("emails", []) if isinstance(email, str)]
            provider = str(payload.get("provider", "auto"))
            sender_filter = str(payload.get("sender_filter", "")).strip()
            limit = max(1, min(int(payload.get("limit", 8)), 30))
            source = str(payload.get("source", "microsoft"))
            targets = [
                account for key, account in accounts.items()
                if not selected or key in selected
            ]
            temp_targets = [
                address for key, address in temp_addresses.items()
                if not selected or key in selected
            ]
            jobs: list[tuple[str, MailAccount | TempAddress, str, int, str]] = []
            if source in {"microsoft", "all"}:
                jobs.extend(("microsoft", account, provider, limit, sender_filter) for account in targets)
            if source in {"temp", "all"}:
                jobs.extend(("temp", address, provider, limit, sender_filter) for address in temp_targets)
            results = run_mail_fetch_jobs(jobs)
            messages = [message for result in results for message in result.get("messages", [])]
            failed_results = [result for result in results if not result.get("ok")]
            upsert_messages(messages)
            save_accounts(accounts)
            save_temp_addresses(temp_addresses)
            self.send_json({
                "results": results,
                "messages": messages,
                "summary": {
                    "total": len(results),
                    "ok": len(results) - len(failed_results),
                    "failed": len(failed_results),
                    "messages": len(messages),
                },
            })
            return
        if self.path == "/api/messages/delete":
            try:
                self.send_json(delete_stored_mail_message(self.read_json()))
            except Exception as exc:
                self.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return
        if self.path == "/api/delete":
            payload = self.read_json()
            emails = [email.lower() for email in payload.get("emails", []) if isinstance(email, str)]
            accounts = load_accounts()
            for email_addr in emails:
                accounts.pop(email_addr, None)
            save_accounts(accounts)
            self.send_json({"deleted": len(emails), "accounts": [acc.public() for acc in accounts.values()]})
            return
        if self.path == "/api/temp-addresses/delete":
            payload = self.read_json()
            emails = [email.lower() for email in payload.get("emails", []) if isinstance(email, str)]
            addresses = load_temp_addresses()
            for email_addr in emails:
                addresses.pop(email_addr, None)
            save_temp_addresses(addresses)
            self.send_json({"deleted": len(emails), "addresses": [addr.public() for addr in addresses.values()]})
            return
        if self.path == "/api/messages/search":
            payload = self.read_json()
            limit = max(1, min(int(payload.get("limit", 80)), 500))
            messages = filter_messages(load_messages(), payload)[:limit]
            self.send_json({"messages": messages, "count": len(messages), "types": MAIL_TYPE_LABELS})
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def is_local_request(self) -> bool:
        host = self.headers.get("Host", "").split(":", 1)[0].lower()
        local_hosts = {"127.0.0.1", "localhost", "::1", "[::1]"}
        return self.client_address[0] in {"127.0.0.1", "::1"} and host in local_hosts

    def require_auth(self) -> None:
        if not ADMIN_TOKEN:
            if self.path.startswith("/admin-api/") and not self.is_local_request():
                self.send_json({
                    "error": "MAIL_PICKUP_ADMIN_TOKEN is required for admin APIs on this server."
                }, status=HTTPStatus.SERVICE_UNAVAILABLE)
                raise ConnectionAbortedError("admin token missing")
            return
        auth = self.headers.get("Authorization", "")
        if auth != f"Bearer {ADMIN_TOKEN}" and not self.has_admin_cookie():
            self.send_json({"error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
            raise ConnectionAbortedError("unauthorized")

    def require_admin_page_auth(self) -> None:
        if self.admin_request_authorized():
            return
        if not ADMIN_TOKEN:
            self.send_error(HTTPStatus.FORBIDDEN)
            raise ConnectionAbortedError("admin page local only")
        else:
            self.send_error(HTTPStatus.NOT_FOUND)
            raise ConnectionAbortedError("admin page unauthorized")

    def admin_request_authorized(self) -> bool:
        if not ADMIN_TOKEN:
            return self.is_local_request()
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        token = query.get("token", [""])[0]
        auth = self.headers.get("Authorization", "")
        return token == ADMIN_TOKEN or auth == f"Bearer {ADMIN_TOKEN}" or self.has_admin_cookie()

    def workspace_id(self) -> str:
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        header_value = self.headers.get("X-Workspace-Id", "")
        query_value = query.get("workspace_id", [""])[0] or query.get("workspaceId", [""])[0]
        return normalize_workspace_id(header_value or query_value)

    def has_admin_cookie(self) -> bool:
        if not ADMIN_TOKEN:
            return False
        try:
            cookies = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
        except http.cookies.CookieError:
            return False
        morsel = cookies.get(ADMIN_COOKIE_NAME)
        return bool(morsel and hmac.compare_digest(urllib.parse.unquote(morsel.value), ADMIN_TOKEN))

    def admin_cookie_header(self, token: str) -> str:
        return f"{ADMIN_COOKIE_NAME}={urllib.parse.quote(token, safe='')}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax"

    def clear_admin_cookie_header(self) -> str:
        return f"{ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8-sig"))

    def send_json(self, payload: dict[str, Any], status: int = HTTPStatus.OK) -> None:
        self.send_json_with_headers(payload, status=status)

    def send_json_with_headers(self, payload: dict[str, Any], headers: dict[str, str] | None = None, status: int = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        if path == "/favicon.ico":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return
        if path in {"/admin", "/admin.html"}:
            if not self.admin_request_authorized():
                self.send_response(HTTPStatus.FOUND)
                self.send_header("Location", "/login.html?next=/admin.html")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return
            target = STATIC_DIR / "admin.html"
            self.serve_static_file(target)
            return
        if path in {"", "/"}:
            target = STATIC_DIR / "index.html"
        elif path in {"/converter", "/converter/"}:
            target = STATIC_DIR / "converter.html"
        elif path in {"/refresh", "/refresh/"}:
            target = STATIC_DIR / "refresh.html"
        elif path in {"/mailboxes", "/mailboxes/"}:
            target = STATIC_DIR / "mailboxes.html"
        elif path in {"/warehouse", "/warehouse/"}:
            target = STATIC_DIR / "warehouse.html"
        else:
            target = (STATIC_DIR / path.lstrip("/")).resolve()
            if STATIC_DIR.resolve() not in target.parents and target != STATIC_DIR.resolve():
                self.send_error(HTTPStatus.FORBIDDEN)
                return
        self.serve_static_file(target)

    def serve_static_file(self, target: Path) -> None:
        if not target.exists() or not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_type = "text/plain; charset=utf-8"
        if target.suffix == ".html":
            content_type = "text/html; charset=utf-8"
        elif target.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif target.suffix == ".js":
            content_type = "application/javascript; charset=utf-8"
        body = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {self.address_string()} {fmt % args}", flush=True)


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        history = load_login_history()
        with LOGIN_JOBS_LOCK:
            for entry in history:
                job_id = entry.get("job_id")
                if job_id:
                    LOGIN_JOBS[job_id] = {
                        "job_id": job_id,
                        "status": entry.get("status", "success"),
                        "email": entry.get("email"),
                        "name": entry.get("name") or "",
                        "logs": [{"time": entry.get("finished_at") or entry.get("started_at") or iso_now(), "level": "info", "message": "从历史记录恢复任务"}],
                        "result": {"success": True, "login_only": entry.get("login_only"), "site_url": entry.get("site_url")} if entry.get("status") == "success" else None,
                        "error": entry.get("error") or "",
                        "created_at": entry.get("started_at") or iso_now(),
                        "updated_at": entry.get("finished_at") or iso_now(),
                    }
    except Exception as e:
        print(f"Failed to load login history on startup: {e}", flush=True)

    server = ThreadingHTTPServer((DEFAULT_HOST, DEFAULT_PORT), Handler)
    print(f"Mail pickup tool running at http://{DEFAULT_HOST}:{DEFAULT_PORT}", flush=True)
    if not ADMIN_TOKEN:
        print("Warning: MAIL_PICKUP_ADMIN_TOKEN is not set. Bind to 127.0.0.1 or protect with a reverse proxy.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.", flush=True)


if __name__ == "__main__":
    main()
