from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


TextCoercer = Callable[[Any], str]
PortCoercer = Callable[[Any, int], int]
SecretUsable = Callable[[Any], bool]
BaseUrlNormalizer = Callable[[str], str]
MailModeNormalizer = Callable[[Any], str]
BaseUrlValidator = Callable[[str], None]
ParseImportRows = Callable[[str], tuple[list[Any], list[str]]]
AccountFactory = Callable[..., Any]
AccountNormalizer = Callable[[Any], Any]
JobsRunner = Callable[[list[tuple[str, Any, str, int, str]], Callable[[dict[str, Any]], None] | None], list[dict[str, Any]]]
MessageSortKey = Callable[[dict[str, Any]], Any]


@dataclass
class PreparedMailFetchRequest:
    accounts: list[Any]
    temp_addresses: list[Any]
    generic_accounts: list[Any]
    jobs: list[tuple[str, Any, str, int, str]]
    errors: list[str]
    source: str
    provider: str
    sender_filter: str
    limit: int
    selected_emails: list[str]

    @property
    def total_targets(self) -> int:
        return len(self.jobs)


@dataclass
class PreparedSavedWorkspaceMailFetch:
    accounts: dict[str, Any]
    temp_addresses: dict[str, Any]
    generic_accounts: dict[str, Any]
    jobs: list[tuple[str, Any, str, int, str]]

    @property
    def total_targets(self) -> int:
        return len(self.jobs)


@dataclass
class SavedWorkspaceMailFetchResult:
    accounts: dict[str, Any]
    temp_addresses: dict[str, Any]
    generic_accounts: dict[str, Any]
    result: dict[str, Any]


@dataclass(frozen=True)
class MailFetchService:
    coerce_text: TextCoercer
    coerce_port: PortCoercer
    usable_secret: SecretUsable
    normalize_temp_worker_url: BaseUrlNormalizer
    normalize_base_url: BaseUrlNormalizer
    normalize_generic_mail_mode: MailModeNormalizer
    validate_configured_base_url: BaseUrlValidator
    parse_account_lines: ParseImportRows
    parse_temp_address_lines: ParseImportRows
    parse_generic_account_lines: ParseImportRows
    mail_account_factory: AccountFactory
    temp_address_factory: AccountFactory
    generic_account_factory: AccountFactory
    normalize_generic_account: AccountNormalizer
    temp_worker_url: str
    temp_site_password: str
    run_mail_fetch_jobs: JobsRunner
    message_sort_value: MessageSortKey
    mail_type_labels: dict[str, Any]

    def transient_mail_accounts(self, payload: dict[str, Any]) -> tuple[list[Any], list[str]]:
        accounts: list[Any] = []
        errors: list[str] = []
        if payload.get("accounts_text"):
            parsed, parsed_errors = self.parse_account_lines(str(payload.get("accounts_text", "")))
            accounts.extend(parsed)
            errors.extend(parsed_errors)
        for idx, item in enumerate(payload.get("accounts", []), start=1):
            if not isinstance(item, dict):
                errors.append(f"Account {idx}: invalid object")
                continue
            email_addr = self.coerce_text(item.get("email"))
            client_id = self.coerce_text(item.get("client_id"))
            refresh_token = self.coerce_text(item.get("refresh_token"))
            if "@" not in email_addr or not self.usable_secret(client_id) or not self.usable_secret(refresh_token):
                errors.append(f"Account {idx}: missing email/client_id/refresh_token")
                continue
            accounts.append(self.mail_account_factory(
                email=email_addr,
                password=self.coerce_text(item.get("password")),
                client_id=client_id,
                refresh_token=refresh_token,
                label=self.coerce_text(item.get("label") or item.get("category")),
            ))
        return accounts, errors

    def transient_temp_addresses(self, payload: dict[str, Any]) -> tuple[list[Any], list[str]]:
        addresses: list[Any] = []
        errors: list[str] = []
        if payload.get("temp_text"):
            parsed, parsed_errors = self.parse_temp_address_lines(str(payload.get("temp_text", "")))
            addresses.extend(parsed)
            errors.extend(parsed_errors)
        for idx, item in enumerate(payload.get("temp_addresses", []), start=1):
            if not isinstance(item, dict):
                errors.append(f"Temp address {idx}: invalid object")
                continue
            email_addr = self.coerce_text(item.get("email"))
            if "@" not in email_addr:
                errors.append(f"Temp address {idx}: invalid email")
                continue
            if not self.usable_secret(item.get("jwt")):
                errors.append(f"Temp address {idx}: missing jwt")
                continue
            base_url = self.normalize_temp_worker_url(
                self.coerce_text(item.get("base_url") or item.get("baseUrl") or self.temp_worker_url)
            )
            site_password = self.coerce_text(item.get("site_password") or item.get("sitePassword") or self.temp_site_password)
            addresses.append(self.temp_address_factory(
                email=email_addr,
                jwt=self.coerce_text(item.get("jwt")),
                base_url=base_url,
                site_password=site_password,
                label=self.coerce_text(item.get("label") or item.get("category")),
            ))
        return addresses, errors

    def transient_generic_accounts(self, payload: dict[str, Any]) -> tuple[list[Any], list[str]]:
        accounts: list[Any] = []
        errors: list[str] = []
        if payload.get("generic_text"):
            parsed, parsed_errors = self.parse_generic_account_lines(str(payload.get("generic_text", "")))
            accounts.extend(parsed)
            errors.extend(parsed_errors)
        for idx, item in enumerate(payload.get("generic_accounts", []), start=1):
            if not isinstance(item, dict):
                errors.append(f"Generic account {idx}: invalid object")
                continue
            email_addr = self.coerce_text(item.get("email"))
            password = self.coerce_text(item.get("password") or item.get("token"))
            if "@" not in email_addr:
                errors.append(f"Generic account {idx}: invalid email")
                continue
            if not self.usable_secret(password):
                errors.append(f"Generic account {idx}: missing password/token")
                continue
            account = self.generic_account_factory(
                email=email_addr,
                password=password,
                username=self.coerce_text(item.get("username") or item.get("user")),
                mode=self.coerce_text(item.get("mode") or item.get("provider")),
                imap_host=self.coerce_text(
                    item.get("imap_host")
                    or item.get("imapHost")
                    or item.get("base_url")
                    or item.get("baseUrl")
                    or item.get("api_url")
                    or item.get("apiUrl")
                ),
                imap_port=self.coerce_port(item.get("imap_port") or item.get("imapPort"), 993),
                pop3_host=self.coerce_text(item.get("pop3_host") or item.get("pop3Host")),
                pop3_port=self.coerce_port(item.get("pop3_port") or item.get("pop3Port"), 995),
                label=self.coerce_text(item.get("label") or item.get("category")),
            )
            accounts.append(self.normalize_generic_account(account))
        return accounts, errors

    def prepare_request(self, payload: dict[str, Any]) -> PreparedMailFetchRequest:
        accounts, account_errors = self.transient_mail_accounts(payload)
        temp_addresses, temp_errors = self.transient_temp_addresses(payload)
        generic_accounts, generic_errors = self.transient_generic_accounts(payload)

        if temp_addresses and not self.temp_worker_url and any(not getattr(address, "base_url", "") for address in temp_addresses):
            raise RuntimeError("GPT_ACCOUNT_MANAGER_TEMP_WORKER_URL is required for temp mailbox refresh")
        for address in temp_addresses:
            self.validate_configured_base_url(self.normalize_temp_worker_url(getattr(address, "base_url", "") or self.temp_worker_url))
        for account in generic_accounts:
            if self.normalize_generic_mail_mode(getattr(account, "mode", "")) in {"cloudmail", "luckmail", "inbucket"} and getattr(account, "imap_host", ""):
                self.validate_configured_base_url(self.normalize_base_url(getattr(account, "imap_host", "")))

        selected = [
            self.coerce_text(email).lower()
            for email in payload.get("emails", [])
            if "@" in self.coerce_text(email)
        ]
        source = self.coerce_text(payload.get("source") or "all").lower()
        provider = self.coerce_text(payload.get("provider") or "auto").lower()
        sender_filter = self.coerce_text(payload.get("sender_filter"))
        limit = max(1, min(int(payload.get("limit", 20) or 20), 50))
        jobs: list[tuple[str, Any, str, int, str]] = []

        if source in {"all", "microsoft"}:
            for account in accounts:
                if selected and getattr(account, "email", "").lower() not in selected:
                    continue
                jobs.append(("microsoft", account, provider, limit, sender_filter))
        if source in {"all", "temp"}:
            for address in temp_addresses:
                if selected and getattr(address, "email", "").lower() not in selected:
                    continue
                jobs.append(("temp", address, provider, limit, sender_filter))
        if source in {"all", "generic"}:
            for account in generic_accounts:
                if selected and getattr(account, "email", "").lower() not in selected:
                    continue
                jobs.append(("generic", account, provider, limit, sender_filter))

        return PreparedMailFetchRequest(
            accounts=accounts,
            temp_addresses=temp_addresses,
            generic_accounts=generic_accounts,
            jobs=jobs,
            errors=account_errors + temp_errors + generic_errors,
            source=source,
            provider=provider,
            sender_filter=sender_filter,
            limit=limit,
            selected_emails=selected,
        )

    def fetch_prepared(
        self,
        prepared: PreparedMailFetchRequest,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        results = self.run_mail_fetch_jobs(prepared.jobs, progress_callback=progress_callback)
        return self.build_fetch_result(results, errors=prepared.errors)

    def build_fetch_result(
        self,
        results: list[dict[str, Any]],
        *,
        errors: list[str] | None = None,
    ) -> dict[str, Any]:
        messages = [message for result in results for message in result.get("messages", [])]
        failed_results = [result for result in results if not result.get("ok")]
        return {
            "results": results,
            "messages": sorted(messages, key=self.message_sort_value, reverse=True),
            "errors": list(errors or []),
            "summary": {
                "total": len(results),
                "ok": len(results) - len(failed_results),
                "failed": len(failed_results),
                "messages": len(messages),
            },
            "types": self.mail_type_labels,
        }

    def fetch(
        self,
        payload: dict[str, Any],
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        return self.fetch_prepared(self.prepare_request(payload), progress_callback=progress_callback)

    def fetch_prepared_saved_workspace(
        self,
        prepared: PreparedSavedWorkspaceMailFetch,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        results = self.run_mail_fetch_jobs(prepared.jobs, progress_callback=progress_callback)
        return self.build_fetch_result(results)

    def fetch_saved_workspace(
        self,
        payload: dict[str, Any],
        *,
        accounts: dict[str, Any],
        temp_addresses: dict[str, Any],
        generic_accounts: dict[str, Any],
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> SavedWorkspaceMailFetchResult:
        prepared = self.prepare_saved_workspace_request(
            payload,
            accounts=accounts,
            temp_addresses=temp_addresses,
            generic_accounts=generic_accounts,
        )
        return SavedWorkspaceMailFetchResult(
            accounts=prepared.accounts,
            temp_addresses=prepared.temp_addresses,
            generic_accounts=prepared.generic_accounts,
            result=self.fetch_prepared_saved_workspace(prepared, progress_callback=progress_callback),
        )

    def prepare_saved_workspace_request(
        self,
        payload: dict[str, Any],
        *,
        accounts: dict[str, Any],
        temp_addresses: dict[str, Any],
        generic_accounts: dict[str, Any],
    ) -> PreparedSavedWorkspaceMailFetch:
        selected = [
            self.coerce_text(email).lower()
            for email in payload.get("emails", [])
            if "@" in self.coerce_text(email)
        ]
        provider = self.coerce_text(payload.get("provider") or "auto").lower()
        sender_filter = self.coerce_text(payload.get("sender_filter"))
        limit = max(1, min(int(payload.get("limit", 8) or 8), 30))
        source = self.coerce_text(payload.get("source") or "microsoft").lower()

        jobs: list[tuple[str, Any, str, int, str]] = []
        if source in {"microsoft", "all"}:
            for key, account in accounts.items():
                if selected and key not in selected:
                    continue
                jobs.append(("microsoft", account, provider, limit, sender_filter))
        if source in {"temp", "all"}:
            for key, address in temp_addresses.items():
                if selected and key not in selected:
                    continue
                jobs.append(("temp", address, provider, limit, sender_filter))
        if source in {"generic", "all"}:
            for key, account in generic_accounts.items():
                if selected and key not in selected:
                    continue
                jobs.append(("generic", account, provider, limit, sender_filter))

        return PreparedSavedWorkspaceMailFetch(
            accounts=accounts,
            temp_addresses=temp_addresses,
            generic_accounts=generic_accounts,
            jobs=jobs,
        )
