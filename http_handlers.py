from __future__ import annotations

import hmac
import urllib.parse
from dataclasses import dataclass
from http import HTTPStatus
from pathlib import Path
from typing import Any, Callable


PayloadHandler = Callable[[dict[str, Any]], dict[str, Any]]
WorkspacePayloadHandler = Callable[[dict[str, Any], str], dict[str, Any]]
WorkspaceLoader = Callable[[str], Any]
WorkspaceMessagesSender = Callable[..., None]
DashboardStatsBuilder = Callable[..., dict[str, Any]]
LoginExceptionClassifier = Callable[[Exception], dict[str, Any]]


@dataclass(frozen=True)
class HttpHandlers:
    app_version: str
    public_app_title: str
    public_store_url: str
    public_relay_url: str
    public_pool_url: str
    public_pool_api_url: str
    public_top_links: Callable[[], list[dict[str, Any]]]
    static_dir: Path
    login_debug_dir: Path
    admin_token: str
    cpa_http_handlers: Any
    health_payload: Callable[[], dict[str, Any]]
    network_health_payload: Callable[[], dict[str, Any]]
    upgrade_status_payload: Callable[[], dict[str, Any]]
    get_client_mail_fetch_job: Callable[[str, str], dict[str, Any]]
    send_workspace_messages_json: WorkspaceMessagesSender
    dashboard_stats_response: DashboardStatsBuilder
    load_workspace_accounts: WorkspaceLoader
    load_workspace_temp_addresses: WorkspaceLoader
    load_workspace_generic_accounts: WorkspaceLoader
    load_refresh_results_for_workspace: WorkspaceLoader
    load_login_history_for_workspace: WorkspaceLoader
    hydrate_login_mail_credentials: Callable[[dict[str, Any], str], None]
    fetch_transient_client_mail: PayloadHandler
    persist_workspace_mail_fetch_result: WorkspacePayloadHandler
    start_client_mail_fetch_job: WorkspacePayloadHandler
    delete_workspace_mail_messages: WorkspacePayloadHandler
    check_proxy_egress: PayloadHandler
    classify_login_exception: LoginExceptionClassifier
    sync_temp_jwts_from_worker: WorkspacePayloadHandler
    import_pickup_accounts: WorkspacePayloadHandler
    import_temp_addresses: WorkspacePayloadHandler
    import_generic_accounts: WorkspacePayloadHandler
    delete_workspace_mail_credentials: WorkspacePayloadHandler
    poll_phone_code: PayloadHandler
    extract_admin_jwts: PayloadHandler
    push_public_pool: PayloadHandler
    create_upgrade_request: PayloadHandler
    mailbox_workspace_service: Any
    fetch_saved_workspace_mail: WorkspacePayloadHandler
    search_workspace_messages_response: WorkspacePayloadHandler

    def handle_get(self, handler: Any) -> bool:
        parsed_request = urllib.parse.urlparse(handler.path)
        for router in (
            self._handle_public_get,
            self._handle_admin_get,
            self._handle_client_get,
            self._handle_workspace_get,
        ):
            if router(handler, parsed_request):
                return True
        handler.serve_static()
        return True

    def handle_post(self, handler: Any) -> bool:
        for router in (
            self._handle_auth_post,
            self._handle_client_post,
            self._handle_admin_post,
            self._handle_workspace_post,
        ):
            if router(handler):
                return True
        handler.send_error(HTTPStatus.NOT_FOUND)
        return True

    def _bad_request(self, handler: Any, exc: Exception, *, code: str = "") -> bool:
        payload = {"success": False, "error": str(exc)[:500]}
        if code:
            payload["error_code"] = code
        handler.send_json(payload, status=HTTPStatus.BAD_REQUEST)
        return True

    def _classified_bad_request(
        self,
        handler: Any,
        exc: Exception,
        *,
        default_code: str,
        include_retryable: bool = False,
    ) -> bool:
        details = self.classify_login_exception(exc)
        payload = {
            "success": False,
            "error": details.get("message", str(exc))[:500],
            "error_code": details.get("code", default_code),
            "error_hint": details.get("hint", ""),
        }
        if include_retryable:
            payload["retryable"] = details.get("retryable", True)
        handler.send_json(payload, status=HTTPStatus.BAD_REQUEST)
        return True

    def _public_rows(self, items: Any) -> list[dict[str, Any]]:
        if isinstance(items, dict):
            values = items.values()
        else:
            values = items or []
        rows: list[dict[str, Any]] = []
        for item in values:
            if hasattr(item, "public"):
                rows.append(item.public())
        return rows

    def _handle_public_get(self, handler: Any, parsed_request: urllib.parse.ParseResult) -> bool:
        request_path = parsed_request.path
        if request_path == "/public-config":
            handler.send_json({
                "title": self.public_app_title,
                "version": self.app_version,
                "store_url": self.public_store_url,
                "relay_url": self.public_relay_url,
                "public_pool_url": self.public_pool_url,
                "top_links": self.public_top_links(),
                "public_pool_api_configured": bool(self.public_pool_api_url),
            })
            return True
        if request_path.lower() in {"/login", "/login.html"}:
            handler.serve_static_file(self.static_dir / "login.html")
            return True
        if request_path.lower().startswith("/public-pool"):
            handler.send_response(HTTPStatus.FOUND)
            handler.send_header("Location", self.public_pool_url or self.public_relay_url or "/")
            handler.end_headers()
            return True
        static_aliases = {
            "/converter": "converter.html",
            "/dashboard": "dashboard.html",
            "/refresh": "refresh.html",
            "/mailboxes": "mailboxes.html",
            "/warehouse": "warehouse.html",
        }
        normalized = request_path.lower().rstrip("/")
        if normalized in static_aliases:
            handler.serve_static_file(self.static_dir / static_aliases[normalized])
            return True
        return False

    def _handle_admin_get(self, handler: Any, parsed_request: urllib.parse.ParseResult) -> bool:
        request_path = parsed_request.path
        if request_path == "/health":
            handler.require_admin_page_auth()
            handler.send_json(self.health_payload())
            return True
        if request_path == "/network-health":
            handler.require_admin_page_auth()
            handler.send_json(self.network_health_payload())
            return True
        if request_path == "/admin-api/upgrade/status":
            handler.require_auth()
            handler.send_json(self.upgrade_status_payload())
            return True
        if request_path.lower() == "/health.html":
            handler.require_admin_page_auth()
            handler.serve_static_file(self.static_dir / "health.html")
            return True
        if request_path.lower().startswith("/login-debug/"):
            handler.require_admin_page_auth()
            rel = urllib.parse.unquote(request_path[len("/login-debug/"):])
            root = self.login_debug_dir.resolve()
            target = (self.login_debug_dir / rel).resolve()
            if root not in target.parents and target != root:
                handler.send_error(HTTPStatus.FORBIDDEN)
                return True
            handler.serve_static_file(target)
            return True
        return False

    def _handle_client_get(self, handler: Any, parsed_request: urllib.parse.ParseResult) -> bool:
        if self.cpa_http_handlers.handle_client_get(handler, parsed_request):
            return True
        if parsed_request.path == "/client-api/fetch-status":
            try:
                params = urllib.parse.parse_qs(parsed_request.query)
                handler.send_json(self.get_client_mail_fetch_job(params.get("job_id", [""])[0], handler.workspace_id()))
            except Exception as exc:
                return self._bad_request(handler, exc)
            return True
        if parsed_request.path == "/client-api/messages":
            try:
                params = urllib.parse.parse_qs(parsed_request.query)
                self.send_workspace_messages_json(handler, handler.workspace_id(), params=params)
            except Exception as exc:
                return self._bad_request(handler, exc)
            return True
        if parsed_request.path == "/client-api/dashboard-stats":
            try:
                params = urllib.parse.parse_qs(parsed_request.query)
                handler.send_json(self.dashboard_stats_response(
                    handler.workspace_id(),
                    days=params.get("days", ["30"])[0],
                    limit=params.get("limit", ["300"])[0],
                    tz_offset_minutes=params.get("tz_offset", ["480"])[0],
                ))
            except Exception as exc:
                return self._bad_request(handler, exc)
            return True
        if parsed_request.path == "/client-api/accounts":
            try:
                handler.send_json({"accounts": self._public_rows(self.load_workspace_accounts(handler.workspace_id()))})
            except Exception as exc:
                return self._bad_request(handler, exc)
            return True
        if parsed_request.path == "/client-api/temp-addresses":
            try:
                handler.send_json({"addresses": self._public_rows(self.load_workspace_temp_addresses(handler.workspace_id()))})
            except Exception as exc:
                return self._bad_request(handler, exc)
            return True
        if parsed_request.path == "/client-api/generic-accounts":
            try:
                handler.send_json({"accounts": self._public_rows(self.load_workspace_generic_accounts(handler.workspace_id()))})
            except Exception as exc:
                return self._bad_request(handler, exc)
            return True
        if parsed_request.path == "/client-api/refresh-results":
            try:
                handler.send_json({"results": self.load_refresh_results_for_workspace(handler.workspace_id())})
            except Exception as exc:
                return self._bad_request(handler, exc)
            return True
        return False

    def _handle_workspace_get(self, handler: Any, parsed_request: urllib.parse.ParseResult) -> bool:
        if not parsed_request.path.startswith("/api/"):
            return False
        handler.require_auth()
        workspace = handler.workspace_id()
        if parsed_request.path == "/api/accounts":
            handler.send_json({"accounts": self._public_rows(self.load_workspace_accounts(workspace))})
            return True
        if parsed_request.path == "/api/temp-addresses":
            handler.send_json({"addresses": self._public_rows(self.load_workspace_temp_addresses(workspace))})
            return True
        if parsed_request.path == "/api/generic-accounts":
            handler.send_json({"accounts": self._public_rows(self.load_workspace_generic_accounts(workspace))})
            return True
        if parsed_request.path == "/api/refresh-results":
            handler.send_json({"results": self.load_refresh_results_for_workspace(workspace)})
            return True
        if parsed_request.path == "/api/login-history":
            handler.send_json({"history": self.load_login_history_for_workspace(workspace)})
            return True
        if parsed_request.path == "/api/messages":
            params = urllib.parse.parse_qs(parsed_request.query)
            self.send_workspace_messages_json(handler, workspace, params=params)
            return True
        handler.send_error(HTTPStatus.NOT_FOUND)
        return True

    def _handle_auth_post(self, handler: Any) -> bool:
        if handler.path == "/auth/login":
            try:
                payload = handler.read_json()
                token = str(payload.get("token", "")).strip()
                if not self.admin_token:
                    handler.send_json({"success": False, "error": "MAIL_PICKUP_ADMIN_TOKEN is not set."}, status=HTTPStatus.SERVICE_UNAVAILABLE)
                    return True
                if not hmac.compare_digest(token, self.admin_token):
                    handler.send_json({"success": False, "error": "Unauthorized"}, status=HTTPStatus.UNAUTHORIZED)
                    return True
                handler.send_json_with_headers(
                    {"success": True},
                    {"Set-Cookie": handler.admin_cookie_header(token)},
                )
            except Exception as exc:
                return self._bad_request(handler, exc)
            return True
        if handler.path == "/auth/logout":
            handler.send_json_with_headers(
                {"success": True},
                {"Set-Cookie": handler.clear_admin_cookie_header()},
            )
            return True
        return False

    def _handle_client_post(self, handler: Any) -> bool:
        if handler.path == "/client-api/fetch":
            try:
                payload = handler.read_json()
                workspace = handler.workspace_id()
                self.hydrate_login_mail_credentials(payload, workspace)
                result = self.fetch_transient_client_mail(payload)
                handler.send_json(self.persist_workspace_mail_fetch_result(workspace, result))
            except Exception as exc:
                handler.send_json({"error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return True
        if handler.path == "/client-api/fetch-start":
            try:
                handler.send_json(self.start_client_mail_fetch_job(handler.read_json(), handler.workspace_id()))
            except Exception as exc:
                return self._bad_request(handler, exc)
            return True
        if handler.path == "/client-api/messages/delete":
            try:
                handler.send_json(self.delete_workspace_mail_messages(handler.read_json(), handler.workspace_id()))
            except Exception as exc:
                return self._bad_request(handler, exc)
            return True
        if self.cpa_http_handlers.handle_client_post(handler):
            return True
        if handler.path == "/client-api/proxy/check":
            try:
                handler.send_json(self.check_proxy_egress(handler.read_json()))
            except Exception as exc:
                return self._classified_bad_request(handler, exc, default_code="proxy_check_failed")
            return True
        if handler.path == "/client-api/temp-addresses/sync-jwts":
            try:
                handler.send_json(self.sync_temp_jwts_from_worker(handler.read_json(), handler.workspace_id()))
            except Exception as exc:
                return self._bad_request(handler, exc, code="temp_sync_failed")
            return True
        if handler.path == "/client-api/accounts/import-pickup":
            try:
                handler.send_json(self.import_pickup_accounts(handler.read_json(), handler.workspace_id()))
            except Exception as exc:
                return self._bad_request(handler, exc, code="pickup_import_failed")
            return True
        if handler.path == "/client-api/temp-addresses/import":
            try:
                handler.send_json(self.import_temp_addresses(handler.read_json(), handler.workspace_id()))
            except Exception as exc:
                return self._bad_request(handler, exc, code="temp_import_failed")
            return True
        if handler.path == "/client-api/generic-accounts/import":
            try:
                handler.send_json(self.import_generic_accounts(handler.read_json(), handler.workspace_id()))
            except Exception as exc:
                return self._bad_request(handler, exc, code="generic_import_failed")
            return True
        if handler.path == "/client-api/accounts/delete":
            try:
                handler.send_json(self.delete_workspace_mail_credentials(handler.read_json(), handler.workspace_id()))
            except Exception as exc:
                return self._bad_request(handler, exc, code="delete_failed")
            return True
        if handler.path == "/client-api/phone-code/poll":
            try:
                handler.send_json(self.poll_phone_code(handler.read_json()))
            except Exception as exc:
                return self._bad_request(handler, exc, code="phone_code_fetch_failed")
            return True
        return False

    def _handle_admin_post(self, handler: Any) -> bool:
        if not handler.path.startswith("/admin-api/"):
            return False
        handler.require_auth()
        if handler.path == "/admin-api/extract-jwts":
            try:
                handler.send_json(self.extract_admin_jwts(handler.read_json()))
            except Exception as exc:
                handler.send_json({"error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return True
        if handler.path == "/admin-api/public-pool/push":
            try:
                handler.send_json(self.push_public_pool(handler.read_json()))
            except Exception as exc:
                handler.send_json({"error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return True
        if handler.path == "/admin-api/upgrade/request":
            try:
                handler.send_json(self.create_upgrade_request(handler.read_json()))
            except Exception as exc:
                handler.send_json({"success": False, "error": str(exc)[:500]}, status=HTTPStatus.BAD_REQUEST)
            return True
        handler.send_error(HTTPStatus.NOT_FOUND)
        return True

    def _handle_workspace_post(self, handler: Any) -> bool:
        if not handler.path.startswith("/api/"):
            return False
        handler.require_auth()
        workspace = handler.workspace_id()
        if handler.path == "/api/import":
            payload = handler.read_json()
            replace_existing = bool(payload.get("replace_existing") or payload.get("replaceExisting"))
            handler.send_json(
                self.mailbox_workspace_service.import_pickup_accounts_for_workspace(
                    payload,
                    workspace,
                    replace_existing=replace_existing,
                )
            )
            return True
        if handler.path == "/api/temp-addresses/import":
            payload = handler.read_json()
            replace_existing = bool(payload.get("replace_existing") or payload.get("replaceExisting"))
            handler.send_json(
                self.mailbox_workspace_service.import_temp_addresses_for_workspace(
                    payload,
                    workspace,
                    replace_existing=replace_existing,
                )
            )
            return True
        if handler.path == "/api/generic-accounts/import":
            payload = handler.read_json()
            replace_existing = bool(payload.get("replace_existing") or payload.get("replaceExisting"))
            handler.send_json(
                self.mailbox_workspace_service.import_generic_accounts_for_workspace(
                    payload,
                    workspace,
                    replace_existing=replace_existing,
                )
            )
            return True
        if handler.path == "/api/fetch":
            handler.send_json(self.fetch_saved_workspace_mail(handler.read_json(), workspace))
            return True
        if handler.path == "/api/messages/delete":
            try:
                handler.send_json(self.delete_workspace_mail_messages(handler.read_json(), workspace))
            except Exception as exc:
                return self._bad_request(handler, exc)
            return True
        if handler.path == "/api/delete":
            handler.send_json(
                self.mailbox_workspace_service.delete_pickup_accounts_for_workspace(
                    handler.read_json(),
                    workspace,
                )
            )
            return True
        if handler.path == "/api/temp-addresses/delete":
            handler.send_json(
                self.mailbox_workspace_service.delete_temp_addresses_for_workspace(
                    handler.read_json(),
                    workspace,
                )
            )
            return True
        if handler.path == "/api/generic-accounts/delete":
            handler.send_json(
                self.mailbox_workspace_service.delete_generic_accounts_for_workspace(
                    handler.read_json(),
                    workspace,
                )
            )
            return True
        if handler.path == "/api/messages/search":
            handler.send_json(self.search_workspace_messages_response(workspace, handler.read_json()))
            return True
        handler.send_error(HTTPStatus.NOT_FOUND)
        return True
