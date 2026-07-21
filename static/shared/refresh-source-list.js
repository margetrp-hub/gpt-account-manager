(function initRefreshSourceList() {
  function createRefreshSourceListHelper(config = {}) {
    const {
      state,
      els,
      helpers,
      actions,
    } = config;

    const {
      escapeHtml,
      accountEmailKey,
      sourceRefreshState,
      sourceTone,
      sourceLabel,
      normalizeGenericMode,
      genericAccountPayload,
      inferErrorCode,
      errorCodeLabel,
      compactText,
      apiHeaders,
      readJsonResponse,
      saveJson,
      saveQueue,
      renderQueue,
      addLog,
      toast,
      renderRefreshStateViews,
    } = helpers;

    const {
      storageKeys,
      mergeSelectedAccountsIntoQueue,
    } = actions;
    const lineLabels = window.GAM?.appShell?.LINE_LABELS || {};

    function accountOptions(active) {
      const options = [
        ["all", "全部状态"],
        ["success", "成功"],
        ["failed", "失败"],
        ["needs_code", "需要接码"],
      ];
      return options.map(([value, label]) =>
        `<option value="${escapeHtml(value)}"${value === active ? " selected" : ""}>${escapeHtml(label)}</option>`
      ).join("");
    }

    function invalidateSourceAccountsCache() {
      state.filteredAccountsCacheKey = "";
      state.filteredAccountsCacheRows = [];
    }

    function sourceAccountsCacheKey() {
      return JSON.stringify([
        state.accounts.length,
        state.accounts[0]?.id || "",
        state.accounts[state.accounts.length - 1]?.id || "",
        els.sourceSearch?.value.trim().toLowerCase() || "",
        els.sourceType?.value || "all",
        els.sourceCategory?.value || "all",
        state.queue.length,
        state.queue.map((row) => `${accountEmailKey(row.email || row.name)}:${helpers.rowState(row).status || "idle"}:${Boolean(row.auth_file)}`).join("|"),
        Array.from(state.savedRefreshResults.keys()).sort().join("|"),
      ]);
    }

    function filteredAccounts() {
      const cacheKey = sourceAccountsCacheKey();
      if (cacheKey === state.filteredAccountsCacheKey) return state.filteredAccountsCacheRows;
      const query = els.sourceSearch.value.trim().toLowerCase();
      const type = els.sourceType.value;
      const category = els.sourceCategory.value;
      const rows = state.accounts.filter((account) => {
        if (type !== "all" && account.source !== type) return false;
        const refreshState = sourceRefreshState(account);
        if (category !== "all" && refreshState.status !== category) return false;
        if (query && !String(account.email || "").toLowerCase().includes(query)) return false;
        return true;
      });
      state.filteredAccountsCacheKey = cacheKey;
      state.filteredAccountsCacheRows = rows;
      return rows;
    }

    function visibleSourceAccountsForCurrentPage() {
      const accounts = filteredAccounts();
      const size = Number(els.sourcePageSize.value || 20);
      const pages = Math.max(1, Math.ceil(accounts.length / size));
      const page = Math.min(Math.max(1, state.sourcePage), pages);
      return accounts.slice((page - 1) * size, page * size);
    }

    function renderSources() {
      els.sourceCategory.innerHTML = accountOptions(els.sourceCategory.value || "all");
      const accounts = filteredAccounts();
      els.sourceTotal.textContent = String(accounts.length);
      const size = Number(els.sourcePageSize.value || 20);
      const pages = Math.max(1, Math.ceil(accounts.length / size));
      state.sourcePage = Math.min(Math.max(1, state.sourcePage), pages);
      const pageItems = accounts.slice((state.sourcePage - 1) * size, state.sourcePage * size);
      const selectedVisible = pageItems.filter((account) => state.selectedAccounts.has(account.id)).length;
      if (els.sourceSelectAll) {
        els.sourceSelectAll.textContent = pageItems.length && selectedVisible === pageItems.length ? "取消全选" : "全选当前页";
      }
      els.sourcePageText.textContent = `${state.sourcePage} / ${pages}`;
      els.sourcePrev.disabled = state.sourcePage <= 1;
      els.sourceNext.disabled = state.sourcePage >= pages;
      if (!pageItems.length) {
        els.sourceList.className = "mailbox-list empty";
        els.sourceList.textContent = state.accounts.length ? "没有匹配的邮箱" : `请先在${lineLabels.subscriptionsPage || "订阅管理页"}导入邮箱`;
        return;
      }
      els.sourceList.className = "mailbox-list";
      els.sourceList.innerHTML = pageItems.map((account) => {
        const refreshState = sourceRefreshState(account);
        return `
          <div class="mailbox-row refresh-source-row refresh-state-${escapeHtml(refreshState.tone)}" data-id="${escapeHtml(account.id)}" title="${escapeHtml(refreshState.message)}">
            <label class="refresh-source-check">
              <input type="checkbox" ${state.selectedAccounts.has(account.id) ? "checked" : ""}>
              <span class="refresh-source-main">
                <strong>${escapeHtml(account.email)}</strong>
                <em><b class="source-badge ${escapeHtml(sourceTone(account))}">${escapeHtml(sourceLabel(account))}</b></em>
              </span>
            </label>
            <span class="source-badge refresh-badge ${escapeHtml(refreshState.tone)}">${escapeHtml(refreshState.label)}</span>
          </div>
        `;
      }).join("");
    }

    function sourceFilterScopeActive() {
      return Boolean(
        els.sourceSearch?.value.trim()
        || (els.sourceType?.value || "all") !== "all"
        || (els.sourceCategory?.value || "all") !== "all"
      );
    }

    function selectedSourceAccounts() {
      const visibleAccounts = filteredAccounts();
      const visibleSelected = visibleAccounts.filter((account) => state.selectedAccounts.has(account.id));
      if (visibleSelected.length) return visibleSelected;
      return [];
    }

    function accountMailVerified(account) {
      return ["ok", "no_code"].includes(String(account.mail_verify_status || account.last_status || "").toLowerCase());
    }

    function accountMailFailed(account) {
      return ["error", "failed"].includes(String(account.mail_verify_status || account.last_status || "").toLowerCase());
    }

    function accountFetchPayload(account) {
      if (account.source === "generic") {
        return {
          source: "generic",
          provider: normalizeGenericMode(account.mode || account.provider),
          limit: 12,
          email: account.email,
          emails: [account.email],
          accounts: [],
          temp_addresses: [],
          generic_accounts: [genericAccountPayload(account)],
        };
      }
      if (account.source === "temp") {
        return {
          source: "temp",
          provider: "auto",
          limit: 12,
          email: account.email,
          emails: [account.email],
          temp_addresses: [{
            email: account.email,
            jwt: account.jwt,
            base_url: account.base_url,
            site_password: account.site_password,
          }],
          accounts: [],
          generic_accounts: [],
        };
      }
      return {
        source: "microsoft",
        provider: "auto",
        limit: 12,
        email: account.email,
        emails: [account.email],
        accounts: [{
          email: account.email,
          password: account.password,
          client_id: account.client_id,
          refresh_token: account.refresh_token,
        }],
        temp_addresses: [],
        generic_accounts: [],
      };
    }

    function applyMailboxVerifyResult(account, result) {
      const codes = Array.isArray(result?.codes) ? result.codes.filter(Boolean) : [];
      const hasCode = Boolean(result?.has_verification_code || result?.first_code || codes.length);
      account.last_check_at = result?.checked_at || new Date().toISOString();
      account.last_message_count = Number(result?.message_count ?? 0);
      account.last_error = "";
      account.last_error_code = "";
      account.last_error_label = "";
      account.last_error_hint = "";
      if (!result?.ok) {
        const rawError = (result?.errors || []).filter(Boolean).join("；") || result?.error || "收信失败";
        const code = result?.error_code || inferErrorCode({ error: rawError, error_hint: result?.error_hint || "" }) || "mail_pickup_unavailable";
        account.mail_verify_status = "error";
        account.last_status = "error";
        account.last_error = compactText(rawError, 180);
        account.last_error_code = code;
        account.last_error_label = result?.error_label || errorCodeLabel(code);
        account.last_error_hint = result?.error_hint || account.last_error_label;
        return { status: "failed", code, label: account.last_error_label };
      }
      account.mail_verify_status = hasCode ? "ok" : "no_code";
      account.last_status = account.mail_verify_status;
      return {
        status: hasCode ? "ok" : "no_code",
        code: hasCode ? "" : "mail_verify_no_code",
        label: hasCode ? "可收件，已发现验证码邮件" : "可收件，未发现验证码邮件",
      };
    }

    async function verifySelectedMailboxes() {
      const selected = selectedSourceAccounts();
      if (!selected.length) {
        toast("先在左侧选择邮箱");
        return;
      }
      const oldText = els.verifySelectedSources?.textContent || "验证邮箱";
      if (els.verifySelectedSources) {
        els.verifySelectedSources.disabled = true;
        els.verifySelectedSources.textContent = "验证中";
      }
      addLog(`验证邮箱：${selected.length} 个`, "info", { step: "mail_verify" });
      let ok = 0;
      let noCode = 0;
      let failed = 0;
      try {
        for (const account of selected) {
          addLog(`${account.email} 验证邮箱`, "info", { step: "mail_verify", email: account.email });
          try {
            const response = await fetch("/client-api/fetch", {
              method: "POST",
              headers: apiHeaders(),
              body: JSON.stringify(accountFetchPayload(account)),
            });
            const data = await readJsonResponse(response, "验证邮箱失败");
            const result = (data.results || []).find((item) => accountEmailKey(item?.email) === accountEmailKey(account.email)) || (data.results || [])[0];
            const applied = applyMailboxVerifyResult(account, result || {
              ok: false,
              error_code: "mail_pickup_unavailable",
              error_label: "收信失败",
              error: "邮箱没有返回取信结果",
              messages: [],
            });
            if (applied.status === "ok") {
              ok += 1;
              addLog(`${account.email} 可收件，已发现验证码邮件`, "success", { step: "mail_verify", email: account.email });
            } else if (applied.status === "no_code") {
              noCode += 1;
              addLog(`${account.email} 可收件，未发现验证码邮件`, "warning", { error_code: "mail_verify_no_code", email: account.email });
            } else {
              failed += 1;
              addLog(`${account.email} ${applied.label}`, "error", { error_code: applied.code || "mail_pickup_unavailable", email: account.email });
            }
          } catch (error) {
            failed += 1;
            const details = error.details || { error: error.message || "验证邮箱失败", error_code: "mail_pickup_unavailable" };
            applyMailboxVerifyResult(account, {
              ok: false,
              error: details.error,
              error_code: details.error_code || "mail_pickup_unavailable",
              error_label: errorCodeLabel(details.error_code || "mail_pickup_unavailable"),
              error_hint: details.error_hint || "",
              messages: [],
            });
            addLog(`${account.email} ${errorCodeLabel(details.error_code || "mail_pickup_unavailable")}`, "error", {
              error_code: details.error_code || "mail_pickup_unavailable",
              email: account.email,
            });
          }
        }
        invalidateSourceAccountsCache();
        saveJson(storageKeys.accounts, state.accounts);
        renderSources();
        toast(`验证完成：可用 ${ok + noCode}，失败 ${failed}`);
        addLog(`验证完成：有验证码 ${ok}，未发现验证码 ${noCode}，失败 ${failed}`, failed ? "warning" : "success", { step: "mail_verify" });
      } finally {
        if (els.verifySelectedSources) {
          els.verifySelectedSources.disabled = false;
          els.verifySelectedSources.textContent = oldText;
        }
      }
    }

    function addSelectedToQueue() {
      const selected = selectedSourceAccounts();
      if (!selected.length) {
        toast("先在左侧选择邮箱");
        return;
      }
      const failed = selected.filter(accountMailFailed);
      const unverified = selected.filter((account) => !accountMailVerified(account) && !accountMailFailed(account));
      if (failed.length || unverified.length) {
        failed.forEach((account) => addLog(`${account.email} ${account.last_error_label || "取码邮箱不可用"}`, "error", {
          error_code: account.last_error_code || "mail_pickup_unavailable",
          email: account.email,
        }));
        if (unverified.length) {
          addLog(`有 ${unverified.length} 个邮箱还没有验证，先点“验证邮箱”`, "warning", { error_code: "mail_verification_required" });
        }
        toast("请先验证邮箱，失败邮箱不会加入队列");
        renderSources();
        return;
      }
      const merged = mergeSelectedAccountsIntoQueue(selected);
      renderQueue();
      addLog(`加入刷新队列：${selected.length} 个账号，新增 ${merged.added} 个`, "info");
    }

    async function removeSelectedSources() {
      const selected = selectedSourceAccounts();
      if (!selected.length) {
        toast("先选择要从队列移除的邮箱");
        return;
      }
      const emails = [...new Set(selected.map((account) => accountEmailKey(account.email)).filter(Boolean))];
      if (!emails.length) return;
      if (!confirm(`从凭证刷新队列移除 ${emails.length} 个邮箱？不会删除邮箱管理里的邮箱资料，也不会从左侧邮箱库移除。`)) return;
      const emailSet = new Set(emails);
      selected.forEach((account) => state.selectedAccounts.delete(account.id));
      const removedRows = state.queue.filter((row) => emailSet.has(accountEmailKey(row.email || row.name)));
      const removedRowIds = new Set(removedRows.map((row) => row.id));
      removedRows.forEach((row) => {
        state.jobs.delete(row.id);
        state.selectedQueue.delete(row.id);
      });
      state.queue = state.queue.filter((row) => !removedRowIds.has(row.id));
      state.selectedQueue = new Set([...state.selectedQueue].filter((id) => state.queue.some((row) => row.id === id)));
      saveQueue();
      renderRefreshStateViews();
      toast(`已移出队列 ${removedRows.length} 个账号`);
      addLog(`移出刷新队列：${removedRows.length} 个，邮箱管理资料未删除`, "success");
    }

    return {
      accountOptions,
      invalidateSourceAccountsCache,
      sourceAccountsCacheKey,
      filteredAccounts,
      visibleSourceAccountsForCurrentPage,
      renderSources,
      sourceFilterScopeActive,
      selectedSourceAccounts,
      accountMailVerified,
      accountMailFailed,
      accountFetchPayload,
      applyMailboxVerifyResult,
      verifySelectedMailboxes,
      addSelectedToQueue,
      removeSelectedSources,
    };
  }

  window.GAM = window.GAM || {};
  window.GAM.refreshSourceList = { createRefreshSourceListHelper };
}());
