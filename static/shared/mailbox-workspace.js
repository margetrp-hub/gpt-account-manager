(function initMailboxWorkspace() {
  function createMailboxWorkspace(deps) {
    const {
      state,
      els,
      constants,
      helpers,
      callbacks,
    } = deps;

    const {
      SOURCE_FILTER_LABELS,
      EMPTY_CATEGORY_LABEL,
    } = constants;

    const {
      escapeHtml,
      accountSourceGroup,
      statusClass,
      statusLabel,
      isAllowedCategory,
      saveJson,
      applyMailboxControlsState,
      loadServerMessages,
      sortAccounts,
      dedupeAccounts,
      accountCategoryOptionsBase,
      activityForAccount,
    } = helpers;

    const {
      storageKeys,
      renderAll,
    } = callbacks;

    function ensureCategory(name) {
      const clean = String(name || "").trim();
      if (isAllowedCategory(clean) && !state.categories.includes(clean)) {
        state.categories.push(clean);
      }
    }

    function invalidateFilteredAccountsCache() {
      state.filteredAccountsCacheKey = "";
      state.filteredAccountsCacheRows = [];
    }

    function accountSignature(account) {
      return [
        account?.id || "",
        account?.email || "",
        account?.source || "",
        account?.category || "",
        account?.last_status || "",
        account?.last_error_code || "",
        account?.last_error_label || "",
        account?.mail_verify_status || "",
      ].join("|");
    }

    function accountsSignature(accounts) {
      return (Array.isArray(accounts) ? accounts : []).map((account) => accountSignature(account)).join("~");
    }

    function removeCategory(name) {
      const clean = String(name || "").trim();
      if (!clean) return;
      state.categories = state.categories.filter((category) => category !== clean);
      state.accounts.forEach((account) => {
        if (account.category === clean) account.category = "";
      });
      invalidateFilteredAccountsCache();
      saveJson(storageKeys.accounts, state.accounts);
      saveJson(storageKeys.categories, state.categories);
    }

    function accountCategoryOptions(active) {
      return accountCategoryOptionsBase(active, state.categories, EMPTY_CATEGORY_LABEL);
    }

    function filterAccounts() {
      const category = els.mailboxCategoryFilter.value;
      const query = els.mailboxSearch.value.trim().toLowerCase();
      const source = state.mailboxSourceFilter || "all";
      const activityFilter = els.mailboxActivityFilter?.value || "all";
      return state.accounts.filter((account) => {
        if (source !== "all" && accountSourceGroup(account) !== source) return false;
        if (category !== "all" && account.category !== category) return false;
        if (activityFilter !== "all" && activityForAccount?.(account)?.key !== activityFilter) return false;
        if (query && !account.email.toLowerCase().includes(query)) return false;
        return true;
      });
    }

    function filteredAccountsCacheKey() {
      return JSON.stringify([
        accountsSignature(state.accounts),
        els.mailboxCategoryFilter?.value || "all",
        els.mailboxSearch?.value.trim().toLowerCase() || "",
        state.mailboxSourceFilter || "all",
        els.mailboxActivityFilter?.value || "all",
      ]);
    }

    function filteredAccounts() {
      const cacheKey = filteredAccountsCacheKey();
      if (cacheKey === state.filteredAccountsCacheKey) return state.filteredAccountsCacheRows;
      const rows = filterAccounts();
      state.filteredAccountsCacheKey = cacheKey;
      state.filteredAccountsCacheRows = rows;
      return rows;
    }

    function renderCategories() {
      state.categories = state.categories.filter((category) => isAllowedCategory(category));
      const categoryList = ["all", ...state.categories];
      const options = categoryList.map((category) => {
        if (category === "all") return `<option value="all">全部分类</option>`;
        return `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`;
      }).join("");
      const mailboxValue = els.mailboxCategoryFilter.value || "all";
      const mailValue = els.categoryFilter.value || "all";
      els.mailboxCategoryFilter.innerHTML = options;
      els.categoryFilter.innerHTML = options;
      els.mailboxCategoryFilter.value = categoryList.includes(mailboxValue) ? mailboxValue : "all";
      els.categoryFilter.value = categoryList.includes(mailValue) ? mailValue : "all";
    }

    function renderAccounts() {
      const before = Array.isArray(state.accounts) ? state.accounts.slice() : [];
      const beforeSignature = accountsSignature(before);
      const deduped = typeof dedupeAccounts === "function" ? dedupeAccounts(state.accounts) : state.accounts;
      const afterSignature = accountsSignature(deduped);
      if (afterSignature !== beforeSignature) {
        const selectedEmails = new Set(
          [...state.selected]
            .map((id) => before.find((account) => account.id === id)?.email?.toLowerCase() || "")
            .filter(Boolean),
        );
        const activeEmail = (before.find((account) => account.id === state.activeMailboxId)?.email || state.activeMailboxEmail || "").toLowerCase();
        const validIds = new Set(deduped.map((account) => account.id));
        state.accounts = deduped;
        state.selected = new Set(
          deduped
            .filter((account) => selectedEmails.has(String(account.email || "").toLowerCase()) || validIds.has(account.id) && state.selected.has(account.id))
            .map((account) => account.id),
        );
        if (activeEmail) {
          const replacement = deduped.find((account) => String(account.email || "").toLowerCase() === activeEmail);
          state.activeMailboxId = replacement?.id || "";
          state.activeMailboxEmail = replacement?.email || "";
        } else if (state.activeMailboxId && !validIds.has(state.activeMailboxId)) {
          state.activeMailboxId = "";
          state.activeMailboxEmail = "";
        }
        invalidateFilteredAccountsCache();
        saveJson(storageKeys.accounts, state.accounts);
      }
      applyMailboxControlsState();
      const tempCount = state.accounts.filter((account) => accountSourceGroup(account) === "temp").length;
      const msCount = state.accounts.filter((account) => accountSourceGroup(account) === "microsoft").length;
      const genericCount = state.accounts.filter((account) => accountSourceGroup(account) === "generic").length;
      els.tempCount.textContent = String(tempCount);
      els.msCount.textContent = String(msCount);
      if (els.genericCount) els.genericCount.textContent = String(genericCount);
      els.mailboxSourceFilter?.querySelectorAll("button[data-source]").forEach((button) => {
        const isActive = button.dataset.source === (state.mailboxSourceFilter || "all");
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
      const accounts = filteredAccounts();
      els.mailboxTotal.textContent = String(state.accounts.length);
      const size = Number(els.mailboxPageSize.value || 20);
      const pages = Math.max(1, Math.ceil(accounts.length / size));
      state.mailboxPage = Math.min(Math.max(1, state.mailboxPage), pages);
      const start = (state.mailboxPage - 1) * size;
      const pageAccounts = accounts.slice(start, start + size);
      els.mailboxPageText.textContent = `${state.mailboxPage} / ${pages}`;
      els.mailboxPrevPage.disabled = state.mailboxPage <= 1;
      els.mailboxNextPage.disabled = state.mailboxPage >= pages;
      if (!pageAccounts.length) {
        els.mailboxList.className = "mailbox-list empty";
        const sourceLabel = SOURCE_FILTER_LABELS[state.mailboxSourceFilter || "all"] || "当前";
        els.mailboxList.textContent = state.activeView === "login" ? "暂无凭证" : `${sourceLabel}筛选下暂无邮箱`;
        return;
      }
      els.mailboxList.className = "mailbox-list";
      els.mailboxList.innerHTML = pageAccounts.map((account) => {
        const stateClass = statusClass(account.last_status);
        const sourceText = SOURCE_FILTER_LABELS[accountSourceGroup(account)] || "其他";
        const category = account.category || EMPTY_CATEGORY_LABEL;
        const activity = activityForAccount?.(account) || { key: "pending", label: "" };
        const title = [
          account.email,
          `分组：${category}`,
          sourceText,
          activity.detail || activity.label,
          statusLabel(account),
          account.last_error_label || account.last_error || "",
        ].filter(Boolean).join(" · ");
        return `
        <div class="mailbox-row refresh-state-${escapeHtml(stateClass)} activity-${escapeHtml(activity.key)}${state.activeMailboxId === account.id ? " active" : ""}" data-id="${escapeHtml(account.id)}">
          <input class="mailbox-check" type="checkbox" ${state.selected.has(account.id) ? "checked" : ""} title="${escapeHtml(title)}">
          <button class="mailbox-row-main" type="button" title="${escapeHtml(title)}">
            <strong>${escapeHtml(account.email)}</strong>
            <span class="mailbox-meta"><em>${escapeHtml(category)}</em>${activity.label ? `<i>${escapeHtml(activity.label)}</i>` : ""}</span>
          </button>
          <button class="icon danger" type="button" aria-label="删除">×</button>
        </div>
      `;
      }).join("");
    }

    function syncActiveMailboxSelection() {
      if (!state.activeMailboxId) {
        state.activeMailboxEmail = "";
        return;
      }
      const account = state.accounts.find((item) => item.id === state.activeMailboxId);
      if (!account) {
        state.activeMailboxId = "";
        state.activeMailboxEmail = "";
        return;
      }
      state.activeMailboxEmail = account.email || "";
    }

    function pruneSelectedMailboxesToCurrentFilter() {
      const visibleIds = new Set(filteredAccounts().map((account) => account.id));
      state.selected.forEach((id) => {
        if (!visibleIds.has(id)) state.selected.delete(id);
      });
    }

    function toggleMailboxFilter(account) {
      if (!account) return;
      if (state.activeMailboxId === account.id) {
        state.activeMailboxId = "";
        state.activeMailboxEmail = "";
      } else {
        state.activeMailboxId = account.id;
        state.activeMailboxEmail = account.email || "";
      }
      state.selected.clear();
      state.page = 1;
      state.activeMessageKey = "";
      renderAccounts();
      loadServerMessages({ silent: true });
    }

    function groupAccountsByImportDate(importDateCategory) {
      if (!state.accounts.length) return { changed: 0, message: "还没有可分组的邮箱" };
      let changed = 0;
      state.accounts.forEach((account) => {
        const nextCategory = importDateCategory(account.created_at || account.updated_at);
        if (!nextCategory || account.category === nextCategory) return;
        account.category = nextCategory;
        ensureCategory(nextCategory);
        changed += 1;
      });
      invalidateFilteredAccountsCache();
      saveJson(storageKeys.accounts, state.accounts);
      saveJson(storageKeys.categories, state.categories);
      renderAll();
      return {
        changed,
        message: changed ? `已按导入日期分组 ${changed} 个邮箱` : "当前邮箱已经按导入日期分组",
      };
    }

    function mergeServerAccountsSnapshot(items) {
      if (!Array.isArray(items) || !items.length) return { imported: 0, updated: 0 };
      const byId = new Map(state.accounts.map((account) => [account.id, account]));
      let imported = 0;
      let updated = 0;
      items.forEach((item) => {
        if (!item?.id) return;
        const existing = byId.get(item.id);
        if (existing) {
          Object.assign(existing, item, {
            password: helpers.preferRealSecret(item.password, existing.password),
            client_id: helpers.preferRealSecret(item.client_id, existing.client_id),
            refresh_token: helpers.preferRealSecret(item.refresh_token, existing.refresh_token),
            jwt: helpers.preferRealSecret(item.jwt, existing.jwt),
            site_password: helpers.preferRealSecret(item.site_password, existing.site_password),
            username: item.username || existing.username || "",
            mode: item.mode || existing.mode || "auto",
            imap_host: item.imap_host || existing.imap_host || "",
            imap_port: item.imap_port || existing.imap_port || 993,
            pop3_host: item.pop3_host || existing.pop3_host || "",
            pop3_port: item.pop3_port || existing.pop3_port || 995,
            base_url: item.base_url || existing.base_url || "",
            category: item.category || existing.category || "",
            updated_at: item.updated_at || existing.updated_at || new Date().toISOString(),
          });
          updated += 1;
        } else {
          byId.set(item.id, {
            ...item,
            updated_at: item.updated_at || new Date().toISOString(),
          });
          imported += 1;
        }
        state.selected.add(item.id);
        if (item.category) ensureCategory(item.category);
      });
      state.accounts = typeof dedupeAccounts === "function" ? dedupeAccounts(byId.values()) : sortAccounts(byId.values());
      invalidateFilteredAccountsCache();
      saveJson(storageKeys.accounts, state.accounts);
      saveJson(storageKeys.categories, state.categories);
      return { imported, updated };
    }

    return {
      ensureCategory,
      removeCategory,
      accountCategoryOptions,
      filteredAccounts,
      renderCategories,
      renderAccounts,
      syncActiveMailboxSelection,
      pruneSelectedMailboxesToCurrentFilter,
      invalidateFilteredAccountsCache,
      toggleMailboxFilter,
      groupAccountsByImportDate,
      mergeServerAccountsSnapshot,
    };
  }

  window.GAM = window.GAM || {};
  window.GAM.mailboxWorkspace = { createMailboxWorkspace };
})();
