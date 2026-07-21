from __future__ import annotations

import contextlib
from dataclasses import dataclass, field
from typing import Any, Callable, ContextManager, Iterator


TextCoercer = Callable[[Any], str]
SecretUsable = Callable[[Any], bool]
IsoNowFn = Callable[[], str]
NormalizeTempWorkerUrl = Callable[[str], str]
LoadWorkspaceMap = Callable[[str], dict[str, Any]]
SaveWorkspaceMap = Callable[[str, dict[str, Any]], None]
ParseImportRows = Callable[[str], tuple[list[Any], list[str]]]
AddressExtractor = Callable[[dict[str, Any]], dict[str, Any]]
WorkspaceLock = Callable[[str], ContextManager[Any]]


@contextlib.contextmanager
def _null_workspace_lock(workspace_id: str) -> Iterator[None]:
    """默认的无操作锁：单元测试注入假 load/save 时无需真实文件锁。"""
    yield


@dataclass(frozen=True)
class MailboxWorkspaceService:
    coerce_text: TextCoercer
    usable_secret: SecretUsable
    iso_now: IsoNowFn
    normalize_temp_worker_url: NormalizeTempWorkerUrl
    default_temp_worker_url: str
    load_workspace_accounts: LoadWorkspaceMap
    load_workspace_temp_addresses: LoadWorkspaceMap
    load_workspace_generic_accounts: LoadWorkspaceMap
    save_workspace_accounts_state: SaveWorkspaceMap
    save_workspace_temp_addresses_state: SaveWorkspaceMap
    save_workspace_generic_accounts_state: SaveWorkspaceMap
    parse_account_lines: ParseImportRows
    parse_temp_address_lines: ParseImportRows
    parse_generic_account_lines: ParseImportRows
    normalize_generic_account: Callable[[Any], Any]
    temp_address_from_worker_row: AddressExtractor | None = None
    # 按 workspace 加锁，把 import/delete/sync 的"读-改-写"整段串行化。
    # 默认 no-op，方便单元测试注入假 load/save 回调时无需真实锁。
    workspace_lock: WorkspaceLock = field(default=_null_workspace_lock)

    def selected_emails(self, payload: dict[str, Any]) -> list[str]:
        emails = [
            self.coerce_text(item).lower()
            for item in payload.get("emails", [])
            if "@" in self.coerce_text(item)
        ]
        return list(dict.fromkeys(emails))

    def login_mail_credential_counts(self, payload: dict[str, Any]) -> dict[str, int]:
        microsoft = 0
        for item in payload.get("accounts", []):
            if not isinstance(item, dict):
                continue
            if self.usable_secret(item.get("client_id")) and self.usable_secret(item.get("refresh_token")):
                microsoft += 1
        temp = 0
        for item in payload.get("temp_addresses", []):
            if not isinstance(item, dict):
                continue
            if self.usable_secret(item.get("jwt")):
                temp += 1
        generic = 0
        for item in payload.get("generic_accounts", []):
            if not isinstance(item, dict):
                continue
            if self.usable_secret(item.get("password") or item.get("token")):
                generic += 1
        return {"microsoft": microsoft, "temp": temp, "generic": generic, "total": microsoft + temp + generic}

    def hydrate_payload_with_workspace_mail_credentials(self, payload: dict[str, Any], workspace_id: str = "public") -> dict[str, int]:
        selected_emails = [
            self.coerce_text(item).lower()
            for item in payload.get("emails", [])
            if "@" in self.coerce_text(item)
        ]
        email_addr = self.coerce_text(payload.get("email")).lower()
        if "@" in email_addr:
            selected_emails.append(email_addr)
        selected_emails = list(dict.fromkeys(selected_emails))
        if not selected_emails:
            return {"microsoft": 0, "temp": 0, "generic": 0, "added": 0, "updated": 0}

        accounts = [item for item in payload.get("accounts", []) if isinstance(item, dict)]
        temp_addresses = [item for item in payload.get("temp_addresses", []) if isinstance(item, dict)]
        generic_accounts = [item for item in payload.get("generic_accounts", []) if isinstance(item, dict)]
        added = 0
        updated = 0

        stored_accounts = self.load_workspace_accounts(workspace_id)
        stored_temp_addresses = self.load_workspace_temp_addresses(workspace_id)
        stored_generic_accounts = self.load_workspace_generic_accounts(workspace_id)

        def same_email(item: dict[str, Any], target: str) -> bool:
            return self.coerce_text(item.get("email")).lower() == target

        for target_email in selected_emails:
            if any(same_email(item, target_email) and self.usable_secret(item.get("client_id")) and self.usable_secret(item.get("refresh_token")) for item in accounts):
                continue
            stored = stored_accounts.get(target_email)
            if stored and self.usable_secret(getattr(stored, "client_id", "")) and self.usable_secret(getattr(stored, "refresh_token", "")):
                stored_item = {
                    "email": stored.email,
                    "password": stored.password,
                    "client_id": stored.client_id,
                    "refresh_token": stored.refresh_token,
                    "label": stored.label,
                }
                replaced = False
                for index, item in enumerate(accounts):
                    if same_email(item, target_email):
                        accounts[index] = {**item, **stored_item}
                        replaced = True
                        updated += 1
                        break
                if not replaced:
                    accounts.append(stored_item)
                    added += 1

        for target_email in selected_emails:
            if any(same_email(item, target_email) and self.usable_secret(item.get("jwt")) for item in temp_addresses):
                continue
            stored_temp = stored_temp_addresses.get(target_email)
            if stored_temp and self.usable_secret(getattr(stored_temp, "jwt", "")):
                stored_item = {
                    "email": stored_temp.email,
                    "jwt": stored_temp.jwt,
                    "base_url": stored_temp.base_url or self.default_temp_worker_url,
                    "site_password": stored_temp.site_password,
                    "label": stored_temp.label,
                }
                replaced = False
                for index, item in enumerate(temp_addresses):
                    if same_email(item, target_email):
                        temp_addresses[index] = {**item, **stored_item}
                        replaced = True
                        updated += 1
                        break
                if not replaced:
                    temp_addresses.append(stored_item)
                    added += 1

        for target_email in selected_emails:
            if any(same_email(item, target_email) and self.usable_secret(item.get("password") or item.get("token")) for item in generic_accounts):
                continue
            stored_generic = stored_generic_accounts.get(target_email)
            if stored_generic and self.usable_secret(getattr(stored_generic, "password", "")):
                stored_item = {
                    "email": stored_generic.email,
                    "password": stored_generic.password,
                    "username": stored_generic.username,
                    "mode": stored_generic.mode,
                    "imap_host": stored_generic.imap_host,
                    "imap_port": stored_generic.imap_port,
                    "pop3_host": stored_generic.pop3_host,
                    "pop3_port": stored_generic.pop3_port,
                    "label": stored_generic.label,
                }
                replaced = False
                for index, item in enumerate(generic_accounts):
                    if same_email(item, target_email):
                        generic_accounts[index] = {**item, **stored_item}
                        replaced = True
                        updated += 1
                        break
                if not replaced:
                    generic_accounts.append(stored_item)
                    added += 1

        payload["accounts"] = accounts
        payload["temp_addresses"] = temp_addresses
        payload["generic_accounts"] = generic_accounts
        counts = self.login_mail_credential_counts(payload)
        return {**counts, "added": added, "updated": updated}

    def import_pickup_accounts_for_workspace(self, payload: dict[str, Any], workspace_id: str = "public", *, replace_existing: bool = True) -> dict[str, Any]:
        incoming, errors = self.parse_account_lines(str(payload.get("text", "")))
        with self.workspace_lock(workspace_id):
            accounts = self.load_workspace_accounts(workspace_id)
            imported = 0
            updated = 0
            skipped = 0
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
                self.save_workspace_accounts_state(workspace_id, accounts)
            return {
                "success": True,
                "imported": imported,
                "updated": updated,
                "skipped": skipped,
                "errors": errors,
                "accounts": [acc.public() for acc in accounts.values()],
            }

    def import_temp_addresses_for_workspace(self, payload: dict[str, Any], workspace_id: str = "public", *, replace_existing: bool = True) -> dict[str, Any]:
        incoming, errors = self.parse_temp_address_lines(str(payload.get("text", "")))
        with self.workspace_lock(workspace_id):
            addresses = self.load_workspace_temp_addresses(workspace_id)
            imported = 0
            updated = 0
            skipped = 0
            default_base_url = self.normalize_temp_worker_url(
                self.coerce_text(payload.get("base_url") or payload.get("baseUrl") or self.default_temp_worker_url)
            )
            default_site_password = self.coerce_text(payload.get("site_password") or payload.get("sitePassword"))
            for address in incoming:
                key = address.email.lower()
                existing = addresses.get(key)
                if existing:
                    if not replace_existing:
                        skipped += 1
                        continue
                    address.created_at = existing.created_at
                    if not self.usable_secret(address.jwt):
                        address.jwt = existing.jwt
                    if not address.base_url:
                        address.base_url = existing.base_url
                    if not address.site_password:
                        address.site_password = existing.site_password
                    updated += 1
                else:
                    imported += 1
                address.base_url = self.normalize_temp_worker_url(address.base_url or default_base_url)
                address.site_password = address.site_password or default_site_password
                address.updated_at = self.iso_now()
                addresses[key] = address
            if imported or updated:
                self.save_workspace_temp_addresses_state(workspace_id, addresses)
            return {
                "success": True,
                "imported": imported,
                "updated": updated,
                "skipped": skipped,
                "errors": errors,
                "addresses": [addr.public() for addr in addresses.values()],
            }

    def import_generic_accounts_for_workspace(self, payload: dict[str, Any], workspace_id: str = "public", *, replace_existing: bool = True) -> dict[str, Any]:
        incoming, errors = self.parse_generic_account_lines(str(payload.get("text", "")))
        with self.workspace_lock(workspace_id):
            accounts = self.load_workspace_generic_accounts(workspace_id)
            imported = 0
            updated = 0
            skipped = 0
            for account in incoming:
                key = account.email.lower()
                existing = accounts.get(key)
                if existing:
                    if not replace_existing:
                        skipped += 1
                        continue
                    account.created_at = existing.created_at
                    if not self.usable_secret(account.password):
                        account.password = existing.password
                    if not account.username:
                        account.username = existing.username
                    if not account.imap_host:
                        account.imap_host = existing.imap_host
                    if not account.pop3_host:
                        account.pop3_host = existing.pop3_host
                    updated += 1
                else:
                    imported += 1
                account.updated_at = self.iso_now()
                accounts[key] = self.normalize_generic_account(account)
            if imported or updated:
                self.save_workspace_generic_accounts_state(workspace_id, accounts)
            return {
                "success": True,
                "imported": imported,
                "updated": updated,
                "skipped": skipped,
                "errors": errors,
                "accounts": [acc.public() for acc in accounts.values()],
            }

    def delete_workspace_mail_credentials_for_workspace(self, payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
        unique = self.selected_emails(payload)
        with self.workspace_lock(workspace_id):
            accounts = self.load_workspace_accounts(workspace_id)
            addresses = self.load_workspace_temp_addresses(workspace_id)
            generic_accounts = self.load_workspace_generic_accounts(workspace_id)
            deleted_microsoft = 0
            deleted_temp = 0
            deleted_generic = 0
            for email_addr in unique:
                if accounts.pop(email_addr, None) is not None:
                    deleted_microsoft += 1
                if addresses.pop(email_addr, None) is not None:
                    deleted_temp += 1
                if generic_accounts.pop(email_addr, None) is not None:
                    deleted_generic += 1
            if deleted_microsoft:
                self.save_workspace_accounts_state(workspace_id, accounts)
            if deleted_temp:
                self.save_workspace_temp_addresses_state(workspace_id, addresses)
            if deleted_generic:
                self.save_workspace_generic_accounts_state(workspace_id, generic_accounts)
            return {
                "success": True,
                "emails": unique,
                "deleted": {
                    "microsoft": deleted_microsoft,
                    "temp": deleted_temp,
                    "generic": deleted_generic,
                    "total": deleted_microsoft + deleted_temp + deleted_generic,
                },
                "accounts": [acc.public() for acc in accounts.values()],
                "addresses": [addr.public() for addr in addresses.values()],
                "generic_accounts": [acc.public() for acc in generic_accounts.values()],
            }

    def delete_pickup_accounts_for_workspace(self, payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
        unique = self.selected_emails(payload)
        with self.workspace_lock(workspace_id):
            accounts = self.load_workspace_accounts(workspace_id)
            deleted = 0
            for email_addr in unique:
                if accounts.pop(email_addr, None) is not None:
                    deleted += 1
            if deleted:
                self.save_workspace_accounts_state(workspace_id, accounts)
            return {
                "success": True,
                "emails": unique,
                "deleted": deleted,
                "accounts": [acc.public() for acc in accounts.values()],
            }

    def delete_temp_addresses_for_workspace(self, payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
        unique = self.selected_emails(payload)
        with self.workspace_lock(workspace_id):
            addresses = self.load_workspace_temp_addresses(workspace_id)
            deleted = 0
            for email_addr in unique:
                if addresses.pop(email_addr, None) is not None:
                    deleted += 1
            if deleted:
                self.save_workspace_temp_addresses_state(workspace_id, addresses)
            return {
                "success": True,
                "emails": unique,
                "deleted": deleted,
                "addresses": [addr.public() for addr in addresses.values()],
            }

    def delete_generic_accounts_for_workspace(self, payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
        unique = self.selected_emails(payload)
        with self.workspace_lock(workspace_id):
            accounts = self.load_workspace_generic_accounts(workspace_id)
            deleted = 0
            for email_addr in unique:
                if accounts.pop(email_addr, None) is not None:
                    deleted += 1
            if deleted:
                self.save_workspace_generic_accounts_state(workspace_id, accounts)
            return {
                "success": True,
                "emails": unique,
                "deleted": deleted,
                "accounts": [acc.public() for acc in accounts.values()],
            }

    def sync_temp_jwts_from_worker_result(self, result: dict[str, Any], payload: dict[str, Any], workspace_id: str = "public") -> dict[str, Any]:
        base_url = self.normalize_temp_worker_url(self.coerce_text(payload.get("base_url")).rstrip("/"))
        site_password = self.coerce_text(payload.get("site_password"))
        with self.workspace_lock(workspace_id):
            addresses = self.load_workspace_temp_addresses(workspace_id)
            imported = 0
            updated = 0
            for item in result.get("results", []):
                if not isinstance(item, dict) or not item.get("ok") or not self.usable_secret(item.get("jwt")):
                    continue
                email_addr = self.coerce_text(item.get("address") or item.get("email")).lower()
                if "@" not in email_addr:
                    continue
                existing = addresses.get(email_addr)
                address = self.temp_address_from_worker_row(item) if self.temp_address_from_worker_row else None
                if address is None:
                    continue
                address.base_url = base_url
                address.site_password = site_password
                address.label = "临时邮箱"
                address.created_at = existing.created_at if existing else self.iso_now()
                address.updated_at = self.iso_now()
                addresses[email_addr] = address
                if existing:
                    updated += 1
                else:
                    imported += 1
            if imported or updated:
                self.save_workspace_temp_addresses_state(workspace_id, addresses)
            return {
                **result,
                "success": True,
                "imported": imported,
                "updated": updated,
                "addresses": [addr.public() for addr in addresses.values()],
            }
