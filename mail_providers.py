from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable


GENERIC_MAIL_HOSTS: dict[str, dict[str, Any]] = {
    "gmail.com": {"imap_host": "imap.gmail.com", "pop3_host": "pop.gmail.com"},
    "googlemail.com": {"imap_host": "imap.gmail.com", "pop3_host": "pop.gmail.com"},
    "icloud.com": {"imap_host": "imap.mail.me.com", "pop3_host": "pop.mail.me.com"},
    "me.com": {"imap_host": "imap.mail.me.com", "pop3_host": "pop.mail.me.com"},
    "mac.com": {"imap_host": "imap.mail.me.com", "pop3_host": "pop.mail.me.com"},
    "qq.com": {"imap_host": "imap.qq.com", "pop3_host": "pop.qq.com"},
    "foxmail.com": {"imap_host": "imap.qq.com", "pop3_host": "pop.qq.com"},
    "163.com": {"imap_host": "imap.163.com", "pop3_host": "pop.163.com"},
    "126.com": {"imap_host": "imap.126.com", "pop3_host": "pop.126.com"},
    "yeah.net": {"imap_host": "imap.yeah.net", "pop3_host": "pop.yeah.net"},
    "sina.com": {"imap_host": "imap.sina.com", "pop3_host": "pop.sina.com"},
    "sina.cn": {"imap_host": "imap.sina.cn", "pop3_host": "pop.sina.cn"},
    "sohu.com": {"imap_host": "imap.sohu.com", "pop3_host": "pop3.sohu.com"},
    "yahoo.com": {"imap_host": "imap.mail.yahoo.com", "pop3_host": "pop.mail.yahoo.com"},
    "zoho.com": {"imap_host": "imap.zoho.com", "pop3_host": "pop.zoho.com"},
    "2925.com": {"imap_host": "imap.2925.com", "pop3_host": "pop.2925.com"},
}

GENERIC_MAIL_MODES = {"auto", "imap", "pop3", "cloudmail", "luckmail", "inbucket"}

MAIL_FETCH_ERROR_LABELS = {
    "dns_failed": "DNS 解析失败",
    "temp_invalid_credential": "临时邮箱 JWT 无效",
    "temp_config_missing": "临时邮箱配置缺失",
    "temp_api_http_error": "临时邮箱 API 异常",
    "outlook_credential_format": "Outlook 凭证格式错误",
    "outlook_client_mismatch": "Outlook client_id 不匹配",
    "outlook_refresh_expired": "Outlook 收信授权失效",
    "outlook_reauth_required": "Outlook 需要重新授权",
    "outlook_scope_missing": "Outlook 权限不足",
    "graph_token_failed": "Graph 授权失败",
    "imap_token_failed": "IMAP 授权失败",
    "graph_fetch_failed": "Graph 收信失败",
    "imap_fetch_failed": "IMAP 收信失败",
    "generic_config_missing": "普通邮箱配置缺失",
    "generic_auth_failed": "普通邮箱认证失败",
    "generic_imap_failed": "普通邮箱 IMAP 失败",
    "generic_pop3_failed": "普通邮箱 POP3 失败",
    "generic_api_failed": "普通邮箱 API 失败",
    "network_tls_eof": "网络连接被截断",
    "network_failed": "网络请求失败",
    "mail_fetch_timeout": "单个邮箱取信超时",
    "mail_fetch_failed": "收信失败",
}


def normalize_generic_mail_mode(value: Any) -> str:
    text = str(value or "").strip().lower().replace("_", "-")
    aliases = {
        "pop": "pop3",
        "mail-pop": "pop3",
        "mail-pop3": "pop3",
        "mail-imap": "imap",
        "cloud-mail": "cloudmail",
        "skymail": "cloudmail",
        "luck-mail": "luckmail",
        "luckmail-api": "luckmail",
        "luckyous": "luckmail",
        "mail2925": "auto",
        "2925": "auto",
        "mail-pickup-tool": "auto",
    }
    normalized = aliases.get(text, text)
    return normalized if normalized in GENERIC_MAIL_MODES else "auto"


def infer_generic_mail_config(email_addr: str) -> dict[str, Any]:
    domain = email_addr.rsplit("@", 1)[1].lower() if "@" in email_addr else ""
    direct = GENERIC_MAIL_HOSTS.get(domain)
    if direct:
        return dict(direct)
    parts = domain.split(".")
    if len(parts) > 2:
        parent = ".".join(parts[-2:])
        if parent in GENERIC_MAIL_HOSTS:
            return dict(GENERIC_MAIL_HOSTS[parent])
    if domain:
        return {
            "imap_host": f"imap.{domain}",
            "pop3_host": f"pop.{domain}",
        }
    return {}


def microsoft_provider_sequence(provider: str) -> list[str]:
    value = (provider or "auto").strip().lower()
    if value == "graph":
        return ["graph"]
    if value == "imap":
        return ["imap"]
    if value == "outlook":
        return ["outlook"]
    return ["imap", "graph", "outlook"]


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
    elif source == "generic" and (
        "host missing" in lowered
        or "password missing" in lowered
        or "requires api url" in lowered
        or "requires base url" in lowered
    ):
        code = "generic_config_missing"
        hint = "普通邮箱需要邮箱、密码/令牌，以及可用的 IMAP/POP3 主机或第三方 API 地址；请补齐后重试。"
        retryable = False
    elif source == "generic" and (
        "auth/fetch failed" in lowered
        or "authentication failed" in lowered
        or "login failed" in lowered
        or "invalid credentials" in lowered
        or "invalid password" in lowered
        or "[auth" in lowered
        or " -err " in lowered
    ):
        code = "generic_auth_failed"
        hint = "普通邮箱登录认证失败；请确认使用的是邮箱授权码/应用专用密码，不是网页登录密码。"
        retryable = False
    elif source == "generic" and any(token in lowered for token in ["cloudmail", "luckmail", "inbucket", "api fetch failed", "http 401", "http 403", "http 404"]):
        code = "generic_api_failed"
        hint = "第三方邮箱 API 返回异常；请检查 API URL、Token/API Key 和邮箱是否对应。"
    elif source == "generic" and "pop3:" in lowered:
        code = "generic_pop3_failed"
        hint = "普通邮箱 POP3 收信失败；请确认 POP3 已开启、主机端口正确，并使用授权码。"
    elif source == "generic" and "imap:" in lowered:
        code = "generic_imap_failed"
        hint = "普通邮箱 IMAP 收信失败；请确认 IMAP 已开启、主机端口正确，并使用授权码。"
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
    elif any(token in lowered for token in [
        "interaction_required",
        "consent_required",
        "login_required",
        "authorization_pending",
        "aadsts65001",
        "aadsts50076",
        "aadsts50078",
    ]):
        code = "outlook_reauth_required"
        hint = "这套 Outlook OAuth 凭证需要重新完成微软授权，单靠现有四段资料无法自动恢复。"
        retryable = False
    elif any(token in lowered for token in [
        "insufficient_scope",
        "mail.read",
        "imap.accessasuser.all",
        "permission",
        "forbidden",
    ]) and any(token in lowered for token in ["scope", "graph", "imap", "oauth", "token failed"]):
        code = "outlook_scope_missing"
        hint = "当前 Outlook 凭证缺少 Graph/IMAP 收信权限；请重新生成带收信权限的 OAuth 凭证。"
        retryable = False
    elif "invalid_grant" in lowered or "expired" in lowered or "revoked" in lowered:
        code = "outlook_refresh_expired"
        hint = "邮箱账号本身可能仍然有效，但当前 refresh_token 已过期或被撤销；请重新生成并导入新的 OAuth 收信凭证。"
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


def run_mail_fetch_jobs(
    jobs: list[tuple[str, Any, str, int, str]],
    *,
    max_workers: int,
    submit_job: Callable[[str, Any, str, int, str], Any],
    error_result: Callable[[str, Any, str], dict[str, Any]],
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
) -> list[dict[str, Any]]:
    if not jobs:
        return []
    results: list[dict[str, Any] | None] = [None] * len(jobs)
    workers = max(1, min(max_workers, len(jobs)))
    total = len(jobs)
    processed = 0
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(submit_job, kind, target, provider, limit, sender_filter): index
            for index, (kind, target, provider, limit, sender_filter) in enumerate(jobs)
        }
        for future in as_completed(futures):
            index = futures[future]
            kind, target, *_ = jobs[index]
            current_email = str(getattr(target, "email", "") or "").strip()
            try:
                results[index] = future.result()
            except Exception as exc:
                results[index] = error_result(kind, target, str(exc))
            processed += 1
            if progress_callback:
                progress_callback({
                    "processed": processed,
                    "total": total,
                    "current_email": current_email,
                    "current_index": index,
                })
    return [result for result in results if result is not None]
