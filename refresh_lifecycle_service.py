from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


TextCoercer = Callable[[Any], str]
FirstText = Callable[..., str]
TokenRefresher = Callable[[str], tuple[int, dict[str, Any], str]]
AccessTokenProbe = Callable[[str], dict[str, Any]]
ExpiresAtResolver = Callable[[str], str]
SessionAuthBuilder = Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]


@dataclass(frozen=True)
class RefreshLifecycleService:
    coerce_text: TextCoercer
    first_text: FirstText
    refresh_openai_with_rt: TokenRefresher
    refresh_openai_with_session_token: TokenRefresher
    probe_openai_access_token: AccessTokenProbe
    access_token_expires_at: ExpiresAtResolver
    session_to_cpa_auth: SessionAuthBuilder

    def status_label(self, status: str) -> str:
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

    def classify_oauth_error(self, status: int, data: dict[str, Any], raw: str) -> tuple[str, str]:
        err_obj = data.get("error")
        if isinstance(err_obj, dict):
            err = self.first_text(err_obj.get("code"), err_obj.get("type"), err_obj.get("error"))
            desc = self.first_text(
                err_obj.get("message"),
                data.get("error_description"),
                data.get("message"),
                data.get("detail"),
                raw,
            )
        else:
            err = self.coerce_text(err_obj)
            desc = self.first_text(data.get("error_description"), data.get("message"), data.get("detail"), raw)
        lowered = f"{err} {desc}".lower()
        if err in {"invalid_grant", "invalid_client", "unauthorized_client", "invalid_request", "token_expired"} or status in {400, 401}:
            if any(word in lowered for word in ["deactivated", "disabled", "banned", "suspended", "封禁", "停用"]):
                return "banned", desc or err or f"HTTP {status}"
            return "rt_invalid", desc or err or f"HTTP {status}"
        if status == 403:
            return "risk_blocked", desc or "OpenAI 拒绝刷新请求"
        return "probe_failed", desc or f"HTTP {status}"

    def source_auth(self, source: dict[str, Any]) -> dict[str, Any]:
        auth = source.get("auth_file") if isinstance(source.get("auth_file"), dict) else {}
        if not auth and isinstance(source.get("authFile"), dict):
            auth = source["authFile"]
        if not auth and isinstance(source.get("session_json"), dict):
            auth = source["session_json"]
        if not auth:
            auth = source
        return auth if isinstance(auth, dict) else {}

    def normalize_item(self, item: dict[str, Any]) -> dict[str, Any]:
        auth = self.source_auth(item)
        tokens = auth.get("tokens") if isinstance(auth.get("tokens"), dict) else {}
        credentials = auth.get("credentials") if isinstance(auth.get("credentials"), dict) else {}
        token = auth.get("token") if isinstance(auth.get("token"), dict) else {}
        row = item.get("row") if isinstance(item.get("row"), dict) else {}
        email_addr = self.first_text(
            item.get("email"),
            auth.get("email"),
            auth.get("account"),
            auth.get("name"),
            credentials.get("email"),
            row.get("email"),
            row.get("account"),
        )
        name = self.first_text(item.get("name"), row.get("name"), auth.get("name"), email_addr)
        return {
            "email": email_addr,
            "name": name,
            "source": self.coerce_text(item.get("source") or auth.get("source") or "manual"),
            "row": row,
            "auth_index": self.first_text(item.get("auth_index"), row.get("auth_index"), auth.get("auth_index")),
            "access_token": self.first_text(
                item.get("access_token"),
                item.get("accessToken"),
                auth.get("access_token"),
                auth.get("accessToken"),
                tokens.get("access_token"),
                tokens.get("accessToken"),
                token.get("access_token"),
                credentials.get("access_token"),
            ),
            "refresh_token": self.first_text(
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
            "session_token": self.first_text(
                item.get("session_token"),
                item.get("sessionToken"),
                auth.get("session_token"),
                auth.get("sessionToken"),
                tokens.get("session_token"),
                tokens.get("sessionToken"),
                token.get("session_token"),
                credentials.get("session_token"),
            ),
            "id_token": self.first_text(
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

    def refresh_item(self, item: dict[str, Any]) -> dict[str, Any]:
        normalized = self.normalize_item(item)
        email_addr = normalized["email"]
        result: dict[str, Any] = {
            "email": email_addr,
            "name": normalized["name"],
            "source": normalized["source"],
            "auth_index": normalized["auth_index"],
            "status": "needs_login",
            "status_label": self.status_label("needs_login"),
            "message": "缺少 ChatGPT/Codex refresh_token、session_token 或 access_token",
            "ok": False,
            "plan_type": "",
            "access_token_updated": False,
            "refresh_token_rotated": False,
            "auth_file": None,
        }

        session_payload: dict[str, Any] | None = None
        if normalized["refresh_token"]:
            status, data, raw = self.refresh_openai_with_rt(normalized["refresh_token"])
            if status == 200 and data.get("access_token"):
                new_rt = self.coerce_text(data.get("refresh_token")) or normalized["refresh_token"]
                session_payload = {
                    "email": email_addr,
                    "access_token": self.coerce_text(data.get("access_token")),
                    "refresh_token": new_rt,
                    "id_token": self.first_text(data.get("id_token"), normalized["id_token"]),
                    "session_token": normalized["session_token"],
                    "expires_at": self.access_token_expires_at(self.coerce_text(data.get("access_token"))),
                }
                result.update({
                    "status": "rt_rotated" if new_rt != normalized["refresh_token"] else "refreshed",
                    "message": "refresh_token 已刷新出新的 access_token",
                    "ok": True,
                    "access_token_updated": True,
                    "refresh_token_rotated": new_rt != normalized["refresh_token"],
                })
            else:
                status_name, message = self.classify_oauth_error(status, data, raw)
                result.update({
                    "status": status_name,
                    "message": message,
                    "ok": False,
                })
        elif normalized["session_token"]:
            status, data, raw = self.refresh_openai_with_session_token(normalized["session_token"])
            if status == 200 and self.first_text(data.get("accessToken"), data.get("access_token")):
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
                result.update({
                    "status": "probe_failed",
                    "message": self.first_text(data.get("error"), data.get("message"), raw, f"HTTP {status}"),
                    "ok": False,
                })
        elif normalized["access_token"]:
            probe = self.probe_openai_access_token(normalized["access_token"])
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
                    "expires_at": self.access_token_expires_at(normalized["access_token"]),
                }

        if session_payload:
            try:
                fallback = dict(normalized["row"] or {})
                fallback.setdefault("email", email_addr)
                fallback.setdefault("name", normalized["name"])
                auth_file = self.session_to_cpa_auth(session_payload, fallback)
                if normalized["original_auth"]:
                    auth_file = {**normalized["original_auth"], **auth_file}
                probe = self.probe_openai_access_token(self.coerce_text(auth_file.get("access_token")))
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

        result["status_label"] = self.status_label(result["status"])
        return result

    def summary(self, results: list[dict[str, Any]], uploaded: int = 0) -> dict[str, Any]:
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

    def refresh(self, payload: dict[str, Any]) -> dict[str, Any]:
        items = payload.get("items")
        if not isinstance(items, list):
            items = []
        row = payload.get("row") if isinstance(payload.get("row"), dict) else {}
        if isinstance(payload.get("auth_file"), dict):
            items.append({"auth_file": payload["auth_file"], "row": row})
        if isinstance(payload.get("session_json"), dict):
            items.append({"session_json": payload["session_json"], "row": row})
        if not items:
            return {"success": True, "results": [], "summary": self.summary([])}

        max_items = max(1, min(int(payload.get("max_items") or payload.get("maxItems") or len(items) or 1), 100))
        results = [self.refresh_item(item) for item in items[:max_items] if isinstance(item, dict)]
        return {"success": True, "results": results, "summary": self.summary(results)}
