from __future__ import annotations

import json
import re
import urllib.parse
from dataclasses import dataclass
from typing import Any, Callable


TextCoercer = Callable[[Any], str]
FirstText = Callable[..., str]
JsonRequester = Callable[..., dict[str, Any]]
BaseUrlNormalizer = Callable[[str], str]
BaseUrlValidator = Callable[[str], None]
StatusMessageBuilder = Callable[[Any, Any, str], tuple[str, str]]
LifecycleStatusLabel = Callable[[str], str]
LifecycleRefresher = Callable[[dict[str, Any]], dict[str, Any]]
LifecycleSummary = Callable[..., dict[str, Any]]
ProtocolLoginRunner = Callable[[str, dict[str, Any]], dict[str, Any]]
SessionAuthBuilder = Callable[..., dict[str, Any]]


@dataclass(frozen=True)
class CpaClient:
    coerce_text: TextCoercer
    first_text: FirstText
    http_request_json: JsonRequester
    normalize_cpa_base_url: BaseUrlNormalizer
    validate_cpa_base_url: BaseUrlValidator
    cpa_status_message: StatusMessageBuilder
    lifecycle_status_label: LifecycleStatusLabel
    refresh_lifecycle_item: LifecycleRefresher
    lifecycle_summary: LifecycleSummary
    run_chatgpt_login_with_protocol: ProtocolLoginRunner
    session_to_cpa_auth: SessionAuthBuilder
    probe_user_agent: str

    def headers(self, management_key: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {management_key}",
            "X-Management-Key": management_key,
            "Accept": "application/json",
        }

    def management_config(self, payload: dict[str, Any]) -> tuple[str, str]:
        base_url = self.normalize_cpa_base_url(
            self.coerce_text(payload.get("base_url") or payload.get("baseUrl")) or "http://localhost:8317"
        )
        management_key = self.coerce_text(payload.get("management_key") or payload.get("managementKey"))
        if not management_key:
            raise RuntimeError("缺少 CPA 管理密钥")
        self.validate_cpa_base_url(base_url)
        return base_url, management_key

    def extract_state_from_auth_url(self, auth_url: str) -> str:
        try:
            return urllib.parse.parse_qs(urllib.parse.urlparse(auth_url).query).get("state", [""])[0]
        except Exception:
            return ""

    def oauth_value(self, payload: dict[str, Any], *keys: str) -> str:
        current: Any = payload
        for key in keys:
            if not isinstance(current, dict):
                return ""
            current = current.get(key)
        return self.coerce_text(current)

    def direct_oauth_start(self, payload: dict[str, Any]) -> dict[str, Any]:
        base_url, management_key = self.management_config(payload)
        result = self.http_request_json(
            f"{base_url}/v0/management/codex-auth-url",
            headers=self.headers(management_key),
            timeout=30,
        )
        authorize_url = self.first_text(
            self.oauth_value(result, "url"),
            self.oauth_value(result, "auth_url"),
            self.oauth_value(result, "authUrl"),
            self.oauth_value(result, "data", "url"),
            self.oauth_value(result, "data", "auth_url"),
            self.oauth_value(result, "data", "authUrl"),
        )
        if not authorize_url.startswith(("http://", "https://")):
            raise RuntimeError("CPA 管理接口没有返回有效的 OAuth 授权链接")
        oauth_state = self.first_text(
            self.oauth_value(result, "state"),
            self.oauth_value(result, "auth_state"),
            self.oauth_value(result, "authState"),
            self.oauth_value(result, "data", "state"),
            self.oauth_value(result, "data", "auth_state"),
            self.oauth_value(result, "data", "authState"),
            self.extract_state_from_auth_url(authorize_url),
        )
        return {
            "success": True,
            "authorize_url": authorize_url,
            "oauth_url": authorize_url,
            "state": oauth_state,
            "cpa_management_origin": base_url,
            "message": "CPA 已生成 OAuth 授权链接",
        }

    def parse_localhost_oauth_callback(self, callback_url: str, expected_state: str = "") -> dict[str, str]:
        raw = self.coerce_text(callback_url)
        try:
            parsed = urllib.parse.urlparse(raw)
        except Exception as exc:
            raise RuntimeError("localhost OAuth 回调地址格式无效") from exc
        if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"localhost", "127.0.0.1"}:
            raise RuntimeError("只接受真实的 localhost / 127.0.0.1 OAuth 回调地址")
        query = urllib.parse.parse_qs(parsed.query)
        error = self.first_text(query.get("error", [""])[0], query.get("error_description", [""])[0])
        if error:
            raise RuntimeError(f"OAuth 授权失败：{error}")
        code = self.first_text(query.get("code", [""])[0])
        state = self.first_text(query.get("state", [""])[0])
        if not code or not state:
            raise RuntimeError("localhost OAuth 回调地址缺少 code 或 state")
        if expected_state and expected_state != state:
            raise RuntimeError("localhost 回调中的 state 与本轮 CPA 授权链接不一致，请重新生成授权链接")
        return {
            "url": urllib.parse.urlunparse(parsed),
            "code": code,
            "state": state,
        }

    def direct_oauth_callback(self, payload: dict[str, Any]) -> dict[str, Any]:
        base_url, management_key = self.management_config(payload)
        callback = self.parse_localhost_oauth_callback(
            self.coerce_text(
                payload.get("callback_url")
                or payload.get("callbackUrl")
                or payload.get("redirect_url")
                or payload.get("redirectUrl")
            ),
            self.coerce_text(payload.get("state") or payload.get("oauth_state") or payload.get("oauthState")),
        )
        result = self.http_request_json(
            f"{base_url}/v0/management/oauth-callback",
            method="POST",
            json_data={
                "provider": "codex",
                "redirect_url": callback["url"],
            },
            headers=self.headers(management_key),
            timeout=45,
        )
        return {
            "success": True,
            "cpa_update": True,
            "localhost_url": callback["url"],
            "state": callback["state"],
            "result": result,
            "message": self.first_text(
                self.oauth_value(result, "message"),
                self.oauth_value(result, "status_message"),
                self.oauth_value(result, "data", "message"),
                "CPA 已接受 OAuth 回调",
            ),
        }

    def item_type(self, item: dict[str, Any]) -> str:
        return self.coerce_text(item.get("type") or item.get("typo")).lower()

    def looks_like_openai_auth_file(self, item: dict[str, Any], auth_file: dict[str, Any] | None = None) -> bool:
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
        text = " ".join(self.coerce_text(part).lower() for part in parts if part)
        return bool(
            "codex" in text
            or "openai" in text
            or "chatgpt" in text
            or auth_file.get("access_token")
            or auth_file.get("accessToken")
            or (
                isinstance(auth_file.get("tokens"), dict)
                and (auth_file["tokens"].get("access_token") or auth_file["tokens"].get("accessToken"))
            )
        )

    def infer_auth_email(self, item: dict[str, Any], auth_file: dict[str, Any] | None = None) -> str:
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
            match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", self.coerce_text(value), flags=re.I)
            if match:
                return match.group(0).lower()
        return ""

    def item_chatgpt_account_id(self, item: dict[str, Any]) -> str:
        for key in ("chatgpt_account_id", "chatgptAccountId", "account_id", "accountId"):
            value = self.coerce_text(item.get(key))
            if value:
                return value
        id_token = item.get("id_token")
        if isinstance(id_token, dict):
            return self.coerce_text(id_token.get("chatgpt_account_id") or id_token.get("account_id"))
        return ""

    def list_auth_files(self, base_url: str, management_key: str) -> list[dict[str, Any]]:
        payload = self.http_request_json(
            f"{base_url}/v0/management/auth-files",
            headers=self.headers(management_key),
            timeout=30,
        )
        files = payload.get("files") or payload.get("data") or payload.get("items") or []
        if not isinstance(files, list):
            return []
        return [item for item in files if isinstance(item, dict)]

    def download_auth_file(self, base_url: str, management_key: str, name: str) -> dict[str, Any]:
        if not name:
            return {}
        payload = self.http_request_json(
            f"{base_url}/v0/management/auth-files/download?name={urllib.parse.quote(name, safe='')}",
            headers=self.headers(management_key),
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
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict):
                return parsed
        return payload if isinstance(payload, dict) else {}

    def probe_payload(self, item: dict[str, Any]) -> dict[str, Any]:
        call_headers = {
            "Authorization": "Bearer $TOKEN$",
            "Content-Type": "application/json",
            "User-Agent": self.probe_user_agent,
        }
        account_id = self.item_chatgpt_account_id(item)
        if account_id:
            call_headers["Chatgpt-Account-Id"] = account_id
        return {
            "authIndex": item.get("auth_index"),
            "method": "GET",
            "url": "https://chatgpt.com/backend-api/wham/usage",
            "header": call_headers,
        }

    def probe_status(self, base_url: str, management_key: str, item: dict[str, Any]) -> dict[str, Any]:
        auth_index = item.get("auth_index")
        name = self.coerce_text(item.get("name") or item.get("id"))
        email_addr = self.coerce_text(item.get("email") or item.get("account"))
        result = {
            "name": name,
            "email": email_addr,
            "auth_index": auth_index,
            "type": self.item_type(item),
            "provider": item.get("provider"),
            "status_code": None,
            "ok": None,
            "action": "scanned",
            "message": "",
        }
        if not auth_index:
            message, raw_message = self.cpa_status_message("missing auth_index", action="skipped")
            result.update({"ok": False, "action": "skipped", "message": message, "raw_message": raw_message})
            return result
        try:
            payload = self.http_request_json(
                f"{base_url}/v0/management/api-call",
                method="POST",
                json_data=self.probe_payload(item),
                headers=self.headers(management_key),
                timeout=30,
            )
            status_code = payload.get("status_code")
            if status_code is None and isinstance(payload.get("body"), str):
                try:
                    status_code = json.loads(payload["body"]).get("status")
                except Exception:
                    status_code = None
            result["status_code"] = status_code
            status_code_text = self.coerce_text(status_code)
            if status_code_text == "200":
                message, raw_message = self.cpa_status_message(payload, status_code=status_code, action="ready")
                result.update({"ok": True, "action": "ready", "message": message, "raw_message": raw_message})
            elif status_code_text == "401":
                message, raw_message = self.cpa_status_message(payload, status_code=status_code, action="401")
                result.update({"ok": False, "action": "401", "message": message, "raw_message": raw_message})
            elif status_code_text == "403":
                message, raw_message = self.cpa_status_message(payload, status_code=status_code, action="risk_blocked")
                result.update({"ok": False, "action": "risk_blocked", "message": message, "raw_message": raw_message})
            elif status_code_text == "429":
                message, raw_message = self.cpa_status_message(
                    payload,
                    status_code=status_code,
                    action="usage_limit_reached",
                )
                result.update({"ok": False, "action": "usage_limit_reached", "message": message, "raw_message": raw_message})
            elif status_code_text:
                message, raw_message = self.cpa_status_message(payload, status_code=status_code, action="http_error")
                result.update({"ok": False, "action": "http_error", "message": message, "raw_message": raw_message})
            else:
                message, raw_message = self.cpa_status_message(payload, action="probe_failed")
                result.update({"ok": False, "action": "probe_failed", "message": message, "raw_message": raw_message})
        except Exception as exc:
            message, raw_message = self.cpa_status_message(str(exc), action="probe_failed")
            result.update({"ok": False, "action": "probe_failed", "message": message, "raw_message": raw_message})
        return result

    def is_401_item(self, item: dict[str, Any]) -> bool:
        status_code = item.get("status_code") or item.get("statusCode")
        if str(status_code) == "401":
            return True
        text = " ".join(
            self.coerce_text(item.get(key))
            for key in ("status", "status_message", "error", "message", "action")
        ).lower()
        return bool(re.search(r"\b401\b", text) or "unauthorized" in text)

    def delete_auth_file(self, base_url: str, management_key: str, name: str) -> dict[str, Any]:
        if not name:
            return {"deleted": False, "error": "missing name"}
        url = f"{base_url}/v0/management/auth-files?name={urllib.parse.quote(name, safe='')}"
        try:
            payload = self.http_request_json(url, method="DELETE", headers=self.headers(management_key), timeout=30)
            ok = payload.get("status") == "ok" or payload.get("success") is True or payload == {"status": "ok"}
            return {"deleted": ok, "payload": payload, "error": "" if ok else "delete failed"}
        except Exception as exc:
            return {"deleted": False, "error": str(exc)[:240]}

    def auth_filename(self, value: str, auth_file: dict[str, Any]) -> str:
        name = self.coerce_text(value)
        if not name:
            name = self.coerce_text(
                auth_file.get("name") or auth_file.get("email") or auth_file.get("account_id") or "chatgpt-auth"
            )
        name = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].strip()
        name = re.sub(r"[^A-Za-z0-9._@+-]+", "-", name).strip(".-")
        if not name:
            name = "chatgpt-auth"
        if not name.lower().endswith(".json"):
            name = f"{name}.json"
        return name

    def upload_auth_file(self, base_url: str, management_key: str, name: str, auth_file: dict[str, Any]) -> dict[str, Any]:
        filename = self.auth_filename(name, auth_file)
        url = f"{base_url}/v0/management/auth-files?name={urllib.parse.quote(filename, safe='')}"
        payload = self.http_request_json(
            url,
            method="POST",
            json_data=auth_file,
            headers=self.headers(management_key),
            timeout=30,
        )
        ok = payload.get("status") == "ok" or payload.get("success") is True or payload == {"status": "ok"}
        return {
            "uploaded": ok,
            "name": filename,
            "payload": payload,
            "error": "" if ok else "upload failed",
        }

    def candidates(self, payload: dict[str, Any]) -> tuple[str, str, int, list[dict[str, Any]], int]:
        base_url = self.normalize_cpa_base_url(
            self.coerce_text(payload.get("base_url") or payload.get("baseUrl")) or "http://localhost:8317"
        )
        management_key = self.coerce_text(payload.get("management_key") or payload.get("managementKey"))
        if not management_key:
            raise RuntimeError("CPA 管理密钥不能为空")
        self.validate_cpa_base_url(base_url)
        max_items = max(1, min(int(payload.get("max_items") or payload.get("maxItems") or 20), 50))
        files = self.list_auth_files(base_url, management_key)
        filtered = [
            item for item in files
            if self.item_type(item) in {"", "codex", "chatgpt", "openai"}
        ]
        candidates = filtered[:max_items]
        return base_url, management_key, max_items, candidates, len(filtered)

    @staticmethod
    def diagnosis_action_hint(status: str) -> str:
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

    @staticmethod
    def status_refreshable(status: str) -> bool:
        return status in {"rt_invalid", "session_expired", "needs_login", "risk_blocked", "probe_failed"}

    def diagnose_candidate(self, base_url: str, management_key: str, item: dict[str, Any]) -> dict[str, Any]:
        row = dict(item)
        name = self.coerce_text(row.get("name") or row.get("id"))
        auth_file: dict[str, Any] = {}
        if name and not row.get("runtime_only"):
            try:
                auth_file = self.download_auth_file(base_url, management_key, name)
            except Exception as exc:
                status = "probe_failed"
                message = f"下载 CPA auth 失败：{str(exc)[:220]}"
                return {
                    **row,
                    "name": name,
                    "email": self.coerce_text(row.get("email") or row.get("account")),
                    "status": status,
                    "status_label": self.lifecycle_status_label(status),
                    "diagnosis": self.lifecycle_status_label(status),
                    "message": message,
                    "action_hint": "请检查 CPA 管理密钥、auth 文件名或 CPA 服务状态",
                    "refreshable": False,
                    "ok": False,
                    "action": "diagnosis_failed",
                }
        if not row.get("runtime_only") and not self.looks_like_openai_auth_file(row, auth_file):
            status = "not_openai_auth"
            return {
                **row,
                "name": name,
                "email": self.infer_auth_email(row, auth_file) or self.coerce_text(row.get("email") or row.get("account")),
                "status": status,
                "status_label": self.lifecycle_status_label(status),
                "diagnosis": self.lifecycle_status_label(status),
                "message": "不是 OpenAI/Codex 凭证，已跳过",
                "action_hint": self.diagnosis_action_hint(status),
                "refreshable": False,
                "ok": False,
                "action": "skipped",
            }
        try:
            diagnosis = self.refresh_lifecycle_item({
                "auth_file": auth_file or row,
                "row": row,
                "name": name or self.coerce_text(row.get("email") or row.get("account")),
            })
        except Exception as exc:
            status = "probe_failed"
            diagnosis = {
                "status": status,
                "status_label": self.lifecycle_status_label(status),
                "message": f"OpenAI 深度探测失败：{str(exc)[:220]}",
                "ok": False,
                "email": self.infer_auth_email(row, auth_file) or self.coerce_text(row.get("email") or row.get("account")),
                "name": name,
            }
        status = self.coerce_text(diagnosis.get("status") or "probe_failed")
        status_label = self.coerce_text(diagnosis.get("status_label") or self.lifecycle_status_label(status))
        return {
            **row,
            "name": name or diagnosis.get("name") or row.get("name"),
            "email": diagnosis.get("email") or self.infer_auth_email(row, auth_file) or self.coerce_text(row.get("email") or row.get("account")),
            "status": status,
            "status_label": status_label,
            "diagnosis": status_label,
            "message": self.coerce_text(diagnosis.get("message") or row.get("message") or status_label),
            "action_hint": self.diagnosis_action_hint(status),
            "refreshable": self.status_refreshable(status),
            "ok": bool(diagnosis.get("ok")),
            "plan_type": self.coerce_text(diagnosis.get("plan_type")),
            "expires_at": diagnosis.get("expires_at", ""),
            "action": "diagnosed",
        }

    def scan_401(self, payload: dict[str, Any]) -> dict[str, Any]:
        base_url, management_key, max_items, candidates, available_total = self.candidates(payload)
        results = []
        for item in candidates:
            if self.is_401_item(item):
                status_source = item.get("status_message") or item.get("message") or item.get("error") or "401 Unauthorized"
                message, raw_message = self.cpa_status_message(status_source, status_code=401, action="401")
                results.append({
                    **item,
                    "email": self.infer_auth_email(item),
                    "status_code": 401,
                    "ok": False,
                    "action": "401",
                    "message": message,
                    "raw_message": raw_message,
                })
            else:
                results.append(self.probe_status(base_url, management_key, item))
        diagnosis_targets = [
            item for item in results
            if item.get("action") != "ready" or self.coerce_text(item.get("status_code")) in {"401", "403", "429"}
        ]
        diagnosed = [self.diagnose_candidate(base_url, management_key, item) for item in diagnosis_targets]
        surfaced = [
            item for item in diagnosed
            if item.get("refreshable")
            or item.get("status") in {
                "active",
                "refreshed",
                "rt_rotated",
                "banned",
                "risk_blocked",
                "usage_limit_reached",
                "rt_invalid",
                "session_expired",
                "needs_login",
                "probe_failed",
                "not_openai_auth",
            }
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
                "credential_ok": len([
                    item for item in diagnosed
                    if item.get("status") in {"active", "refreshed", "rt_rotated"}
                ]),
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

    def repair_401(self, payload: dict[str, Any]) -> dict[str, Any]:
        if isinstance(payload.get("items"), list) and payload["items"]:
            scanned = {"candidates": payload["items"], "summary": {"total": len(payload["items"])}}
        else:
            scanned = self.scan_401(payload)
        base_url = self.normalize_cpa_base_url(
            self.coerce_text(payload.get("base_url") or payload.get("baseUrl")) or "http://localhost:8317"
        )
        management_key = self.coerce_text(payload.get("management_key") or payload.get("managementKey"))
        self.validate_cpa_base_url(base_url)
        results = []
        uploaded = 0
        deleted = 0
        failed = 0
        for item in scanned.get("candidates", []):
            row = dict(item)
            name = self.coerce_text(row.get("name") or row.get("id"))
            auth_file: dict[str, Any] = {}
            try:
                if name and not row.get("runtime_only"):
                    auth_file = self.download_auth_file(base_url, management_key, name)
            except Exception as exc:
                row["download_error"] = str(exc)[:240]
            email_addr = self.infer_auth_email(row, auth_file)
            row["email"] = email_addr or self.coerce_text(row.get("email") or row.get("account"))
            if not row.get("runtime_only") and not self.looks_like_openai_auth_file(row, auth_file):
                results.append({**row, "ok": False, "action": "skipped", "message": "不是 Codex/OpenAI 凭证，已跳过"})
                continue
            if "@" not in row["email"]:
                results.append({**row, "ok": False, "action": "skipped", "message": "无法从 CPA 凭证识别邮箱"})
                continue
            try:
                login_payload = self.build_repair_login_payload(payload, row)
                session_payload = self.run_chatgpt_login_with_protocol(
                    "_warehouse_sync",
                    {**login_payload, "login_strategy": "protocol"},
                )
                new_auth = self.session_to_cpa_auth(
                    session_payload,
                    {"email": row["email"], "name": name or row["email"], "auth_index": row.get("auth_index")},
                    require_refresh_token=True,
                )
                upload = self.upload_auth_file(base_url, management_key, name or row["email"], new_auth)
                if not upload.get("uploaded"):
                    raise RuntimeError(upload.get("error") or "上传失败")
                uploaded += 1
                results.append({
                    **row,
                    "ok": True,
                    "action": "uploaded",
                    "message": "重登成功，已上传新 CPA 凭证",
                    "auth_file": new_auth,
                    "upload": upload,
                })
            except Exception as exc:
                failed += 1
                message = str(exc)[:500]
                lowered = message.lower()
                if any(word in lowered for word in ["deactivated", "disabled", "banned", "suspended", "账号已停用", "deleted or deactivated"]):
                    delete_result = self.delete_auth_file(base_url, management_key, name)
                    if delete_result.get("deleted"):
                        deleted += 1
                        results.append({
                            **row,
                            "ok": True,
                            "action": "deleted_deactivated",
                            "message": "账号已停用，已删除 CPA 凭证",
                        })
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

    def delete_items(self, payload: dict[str, Any]) -> dict[str, Any]:
        base_url = self.normalize_cpa_base_url(
            self.coerce_text(payload.get("base_url") or payload.get("baseUrl")) or "http://localhost:8317"
        )
        management_key = self.coerce_text(payload.get("management_key") or payload.get("managementKey"))
        if not management_key:
            raise RuntimeError("CPA 管理密钥不能为空")
        self.validate_cpa_base_url(base_url)
        items = payload.get("items") if isinstance(payload.get("items"), list) else []
        results = []
        deleted = 0
        for item in items:
            if not isinstance(item, dict):
                continue
            name = self.coerce_text(item.get("name") or item.get("id"))
            row = dict(item)
            if not name:
                results.append({**row, "ok": False, "action": "delete_failed", "message": "缺少 CPA 凭证名称"})
                continue
            outcome = self.delete_auth_file(base_url, management_key, name)
            if outcome.get("deleted"):
                deleted += 1
                results.append({**row, "ok": True, "action": "deleted", "message": "已删除 CPA 凭证"})
            else:
                results.append({
                    **row,
                    "ok": False,
                    "action": "delete_failed",
                    "message": outcome.get("error") or "删除失败",
                })
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

    def build_repair_login_payload(self, base_payload: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
        email_addr = self.coerce_text(row.get("email") or row.get("account"))
        accounts = [
            item for item in base_payload.get("accounts", [])
            if isinstance(item, dict) and self.coerce_text(item.get("email")).lower() == email_addr.lower()
        ]
        temp_addresses = [
            item for item in base_payload.get("temp_addresses", [])
            if isinstance(item, dict) and self.coerce_text(item.get("email")).lower() == email_addr.lower()
        ]
        generic_accounts = [
            item for item in base_payload.get("generic_accounts", [])
            if isinstance(item, dict) and self.coerce_text(item.get("email")).lower() == email_addr.lower()
        ]
        force_email_code = str(self.first_text(
            base_payload.get("force_email_code"),
            base_payload.get("forceEmailCode"),
            base_payload.get("email_code_login"),
            base_payload.get("emailCodeLogin"),
        )).lower() in {"1", "true", "yes", "on"}
        password = "" if force_email_code else self.first_text(
            base_payload.get("password"),
            row.get("password"),
            *(item.get("password") for item in accounts),
        )
        if not accounts and not temp_addresses and not generic_accounts:
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
            "generic_accounts": generic_accounts,
        }

    def replace_auth_file(self, payload: dict[str, Any]) -> dict[str, Any]:
        base_url = self.normalize_cpa_base_url(
            self.coerce_text(payload.get("base_url") or payload.get("baseUrl")) or "http://localhost:8317"
        )
        management_key = self.coerce_text(payload.get("management_key") or payload.get("managementKey"))
        if not management_key:
            raise RuntimeError("CPA 管理密钥不能为空")
        self.validate_cpa_base_url(base_url)
        auth_file = payload.get("auth_file") or payload.get("authFile")
        if not isinstance(auth_file, dict):
            raise RuntimeError("新的 CPA auth JSON 不能为空")
        name = self.coerce_text(
            payload.get("name")
            or payload.get("filename")
            or payload.get("old_name")
            or payload.get("oldName")
        )
        upload = self.upload_auth_file(base_url, management_key, name, auth_file)
        if not upload.get("uploaded"):
            return {
                "success": False,
                "error": upload.get("error") or "上传失败",
                "upload": upload,
            }
        files = self.list_auth_files(base_url, management_key)
        uploaded_name = self.coerce_text(upload.get("name"))
        email_addr = self.coerce_text(auth_file.get("email"))
        matched = next((
            item for item in files
            if self.coerce_text(item.get("name") or item.get("id")).lower() == uploaded_name.lower()
        ), None)
        if matched is None and email_addr:
            matched = next((
                item for item in files
                if self.coerce_text(item.get("email") or item.get("account")).lower() == email_addr.lower()
            ), None)
        probe = self.probe_status(base_url, management_key, matched) if matched else {}
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

    def refresh_lifecycle(self, payload: dict[str, Any]) -> dict[str, Any]:
        base_url, management_key, max_items, candidates, _available_total = self.candidates(payload)
        upload_success = bool(payload.get("upload_success") or payload.get("uploadSuccess"))
        only_401 = bool(payload.get("only_401", True))
        rows = candidates
        if only_401:
            probe_rows = [self.probe_status(base_url, management_key, item) for item in candidates]
            by_name = {self.coerce_text(item.get("name")).lower(): item for item in probe_rows}
            rows = []
            for item in candidates:
                name = self.coerce_text(item.get("name") or item.get("id"))
                probe = by_name.get(name.lower())
                if probe and probe.get("status_code") != 401:
                    continue
                rows.append({**item, **(probe or {})})
        results: list[dict[str, Any]] = []
        uploaded = 0
        for row in rows[:max_items]:
            name = self.coerce_text(row.get("name") or row.get("id"))
            auth_file: dict[str, Any] = {}
            if name:
                try:
                    auth_file = self.download_auth_file(base_url, management_key, name)
                except Exception as exc:
                    results.append({
                        "name": name,
                        "email": self.coerce_text(row.get("email") or row.get("account")),
                        "status": "probe_failed",
                        "status_label": self.lifecycle_status_label("probe_failed"),
                        "message": f"下载 CPA auth 失败：{str(exc)[:220]}",
                        "ok": False,
                        "auth_file": None,
                    })
                    continue
            merged = {"auth_file": auth_file or row, "row": row, "name": name or self.coerce_text(row.get("email"))}
            result = self.refresh_lifecycle_item(merged)
            result["name"] = name or result.get("name")
            if upload_success and result.get("ok") and isinstance(result.get("auth_file"), dict):
                upload = self.upload_auth_file(base_url, management_key, name or result.get("name", ""), result["auth_file"])
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
            "summary": self.lifecycle_summary(results, uploaded=uploaded),
        }
