(() => {
  const WORKSPACE_ID_STORAGE_KEY = "ctgptm.workspaceId";
  const sharedStoragePrefixes = window.GAM?.base?.WORKSPACE_SCOPED_PREFIXES || {};
  const ACCOUNT_RECORDS_KEY_PREFIX = sharedStoragePrefixes.accountRecords || "ctgptm.account.records:";
  const ACCOUNT_SETTINGS_KEY_PREFIX = sharedStoragePrefixes.accountSettings || "ctgptm.account.settings:";
  const ONLINE_CHECK_ENDPOINT = "/client-api/accounts/check-subscription";
  const STATUS_LABELS = {
    free: "FREE",
    plus: "PLUS",
    pro: "PRO",
    team: "TEAM",
    banned: "封禁",
    unregistered: "未注册",
    usage_limit_reached: "额度耗尽",
    token_invalid: "凭证失效",
    risk_blocked: "风控/受限",
    needs_token: "缺少凭证",
    check_failed: "核验失败",
    unknown: "未知",
  };
  const PREMIUM_KEYWORDS = [
    "plus", "pro", "premium", "subscription", "subscribed", "plan", "upgrade", "renewal",
    "新套餐", "套餐", "订阅", "续费", "升级", "会员", "プラン", "サブスクリプション",
    "abonnement", "suscripción", "assinatura", "abbonamento", "구독",
  ];
  const BANNED_KEYWORDS = [
    "banned", "deactivated", "disabled", "suspended", "terminated", "封禁", "停用", "禁用",
    "停止", "停止され", "bloqué", "suspendido", "gesperrt",
  ];
  const UNREGISTERED_KEYWORDS = [
    "unregistered", "not registered", "未注册", "未註冊", "未登录", "未登入", "未激活", "inactive",
    "不存在", "账号不存在", "no account", "does not exist", "不存在する",
  ];

  const base = window.GAM?.base;
  const workspaceId = base?.resolveWorkspaceId?.(WORKSPACE_ID_STORAGE_KEY)
    || base?.getWorkspaceId?.(WORKSPACE_ID_STORAGE_KEY)
    || localStorage.getItem(WORKSPACE_ID_STORAGE_KEY)
    || `ws_${crypto.randomUUID().replace(/-/g, "")}`;
  const authQueryToken = new URLSearchParams(window.location.search).get("token") || "";
  if (authQueryToken) localStorage.setItem("ctgptm.admin.toolToken", authQueryToken);
  const STORAGE_KEYS = {
    records: `${ACCOUNT_RECORDS_KEY_PREFIX}${workspaceId}`,
    settings: `${ACCOUNT_SETTINGS_KEY_PREFIX}${workspaceId}`,
  };
  const els = {
    importText: document.querySelector("#accountImportText"),
    importBtn: document.querySelector("#importAccountsBtn"),
    clearBtn: document.querySelector("#clearAccountsBtn"),
    proxyUrl: document.querySelector("#accountProxyUrl"),
    fingerprint: document.querySelector("#accountFingerprint"),
    riskConfirm: document.querySelector("#accountRiskConfirm"),
    onlineCheckBtn: document.querySelector("#onlineCheckBtn"),
    onlineCheckStatus: document.querySelector("#onlineCheckStatus"),
    search: document.querySelector("#accountSearch"),
    statusFilter: document.querySelector("#accountStatusFilter"),
    groupBy: document.querySelector("#accountGroupBy"),
    selectAllBtn: document.querySelector("#selectAllAccountsBtn"),
    deleteSelectedBtn: document.querySelector("#deleteSelectedAccountsBtn"),
    exportBtn: document.querySelector("#exportAccountsBtn"),
    tableBody: document.querySelector("#accountTableBody"),
    toast: document.querySelector("#toast"),
    total: document.querySelector("#accountTotal"),
    free: document.querySelector("#accountFree"),
    premium: document.querySelector("#accountPremium"),
    banned: document.querySelector("#accountBanned"),
    unregistered: document.querySelector("#accountUnregistered"),
  };
  const initialStoredRecords = loadJson(STORAGE_KEYS.records, []);
  const state = {
    records: dedupeRecords(initialStoredRecords),
    selected: new Set(),
    checking: false,
  };

  function sanitizeSelected() {
    const validIds = new Set(state.records.map((record) => record.id));
    state.selected = new Set([...state.selected].filter((id) => validIds.has(id)));
  }

  function loadJson(key, fallback) {
    if (base?.loadJson) return base.loadJson(key, fallback);
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    if (base?.saveJson) return base.saveJson(key, value);
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function toast(text) {
    els.toast.textContent = text;
    els.toast.classList.add("show");
    clearTimeout(els.toast._timer);
    els.toast._timer = setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  function accountKey(email, token = "") {
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (cleanEmail) return cleanEmail;
    return `token:${String(token || "").slice(0, 18)}`;
  }

  function apiHeaders() {
    return base?.apiHeaders?.({
      workspaceId,
      includeContentType: true,
      token: authQueryToken,
    }) || {
      "Content-Type": "application/json",
      "X-Workspace-Id": workspaceId,
    };
  }

  async function readJsonResponse(response, label) {
    if (base?.readJsonResponse) return base.readJsonResponse(response, label, { snippetLimit: 180 });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(data?.error || label || response.statusText || "请求失败");
    return data;
  }

  function decodeJwtPayload(token) {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return {};
    try {
      const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
      return JSON.parse(atob(padded));
    } catch {
      return {};
    }
  }

  function statusFromText(text) {
    const haystack = String(text || "").toLowerCase();
    if (BANNED_KEYWORDS.some((word) => haystack.includes(word.toLowerCase()))) return "banned";
    if (UNREGISTERED_KEYWORDS.some((word) => haystack.includes(word.toLowerCase()))) return "unregistered";
    if (/\bpro\b/.test(haystack)) return "pro";
    if (/\bplus\b/.test(haystack) || PREMIUM_KEYWORDS.some((word) => haystack.includes(word.toLowerCase()))) return "plus";
    if (/\bfree\b/.test(haystack)) return "free";
    return "unknown";
  }

  function inferSubscriptionDate(text) {
    const match = String(text || "").match(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}/);
    if (!match) return "";
    const normalized = match[0].replace(/[年月/.]/g, "-").replace(/日/g, "");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  function inferExpiryDate(startDate) {
    if (!startDate) return "";
    const date = new Date(startDate);
    if (Number.isNaN(date.getTime())) return "";
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().slice(0, 10);
  }

  function scoreRecord(record) {
    return [
      record?.access_token,
      record?.refresh_token,
      record?.phone,
      record?.plan_type,
      record?.status_source,
      record?.note,
    ].reduce((score, value) => score + Number(Boolean(String(value || "").trim())), 0);
  }

  function filledText(value) {
    return String(value || "").trim();
  }

  function preferFilled(primary, fallback) {
    return filledText(primary) ? primary : fallback;
  }

  function preferKnown(primary, fallback) {
    const primaryText = filledText(primary);
    if (primaryText && primaryText !== "unknown") return primary;
    const fallbackText = filledText(fallback);
    if (fallbackText && fallbackText !== "unknown") return fallback;
    return primaryText ? primary : fallback;
  }

  function newerTimestamp(primary, fallback) {
    const primaryTime = Date.parse(filledText(primary) || "");
    const fallbackTime = Date.parse(filledText(fallback) || "");
    if (Number.isNaN(primaryTime)) return fallback;
    if (Number.isNaN(fallbackTime)) return primary;
    return primaryTime >= fallbackTime ? primary : fallback;
  }

  function dedupeRecords(records) {
    const byEmail = new Map();
    (Array.isArray(records) ? records : []).forEach((record) => {
      if (!record || typeof record !== "object") return;
      const email = String(record.email || "").trim();
      if (!email) return;
      const key = email.toLowerCase();
      const current = byEmail.get(key);
      const normalized = {
        ...record,
        id: record.id || key,
        email,
      };
      if (!current) {
        byEmail.set(key, normalized);
        return;
      }
      const currentScore = scoreRecord(current);
      const normalizedScore = scoreRecord(normalized);
      const preferred = normalizedScore >= currentScore ? normalized : current;
      const fallback = normalizedScore >= currentScore ? current : normalized;
      const merged = {
        ...fallback,
        ...preferred,
        id: current.id || normalized.id || key,
        email,
        access_token: preferFilled(preferred.access_token, fallback.access_token) || "",
        refresh_token: preferFilled(preferred.refresh_token, fallback.refresh_token) || "",
        phone: preferFilled(preferred.phone, fallback.phone) || "",
        token_hint: preferFilled(preferred.token_hint, fallback.token_hint) || "",
        source: preferFilled(preferred.source, fallback.source) || "",
        status_source: preferFilled(preferred.status_source, fallback.status_source) || "",
        note: preferFilled(preferred.note, fallback.note) || "",
        subscription_start: preferFilled(preferred.subscription_start, fallback.subscription_start) || "",
        subscription_expire: preferFilled(preferred.subscription_expire, fallback.subscription_expire) || "",
        updated_at: newerTimestamp(preferred.updated_at, fallback.updated_at) || "",
      };
      merged.status = preferKnown(preferred.status, fallback.status) || "unknown";
      merged.plan_type = preferKnown(preferred.plan_type, fallback.plan_type) || merged.status || "unknown";
      byEmail.set(key, merged);
    });
    return [...byEmail.values()].sort((a, b) => String(a.email).localeCompare(String(b.email)));
  }

  function summarizeRecords(records) {
    return records.reduce((summary, record) => {
      summary.total += 1;
      if (record.status === "free") summary.free += 1;
      if (["plus", "pro", "team", "usage_limit_reached"].includes(record.status)) summary.premium += 1;
      if (record.status === "banned") summary.banned += 1;
      if (record.status === "unregistered") summary.unregistered += 1;
      return summary;
    }, {
      total: 0,
      free: 0,
      premium: 0,
      banned: 0,
      unregistered: 0,
    });
  }

  function parseImportLine(line) {
    const clean = String(line || "").trim();
    if (!clean) return null;
    const parts = clean.includes("----") ? clean.split("----").map((part) => part.trim()) : clean.split(",").map((part) => part.trim());
    const joined = parts.join(" ");
    const token = parts.find((part) => part.split(".").length >= 3) || "";
    const jwt = decodeJwtPayload(token);
    const looksLikeRt = !token && parts.find((part) => /^[-_A-Za-z0-9]{40,}$/.test(part) && !part.includes("@")) || "";
    const rawStatus = parts.map(statusFromText).find((status) => status !== "unknown") || "";
    const explicitStatus = rawStatus === "plus" && /\bpro\b/i.test(joined) ? "pro" : rawStatus;
    const email = parts.find((part) => part.includes("@")) || jwt.email || jwt["https://api.openai.com/profile"]?.email || "";
    const phone = jwt.phone_number || jwt.phone || "";
    const inferredStatus = explicitStatus || statusFromText(joined);
    const subscriptionStart = inferSubscriptionDate(joined);
    return {
      id: accountKey(email, token || clean),
      email: email || "(未识别邮箱)",
      phone,
      status: inferredStatus || "unknown",
      plan_type: inferredStatus || "unknown",
      source: token ? "AT/RT 导入" : "邮件线索",
      status_source: explicitStatus ? "凭证/文本自报" : (inferredStatus !== "unknown" ? "邮件关键词推断" : "待核验"),
      access_token: token || "",
      refresh_token: looksLikeRt || "",
      token_hint: token ? `${token.slice(0, 10)}...${token.slice(-6)}` : "",
      subscription_start: subscriptionStart,
      subscription_expire: inferExpiryDate(subscriptionStart),
      note: clean.slice(0, 180),
      updated_at: new Date().toISOString(),
    };
  }

  function upsertRecords(records) {
    const byId = new Map(state.records.map((record) => [record.id, record]));
    records.forEach((record) => {
      if (!record?.id) return;
      const previous = byId.get(record.id) || {};
      byId.set(record.id, {
        ...previous,
        ...record,
        access_token: record.access_token || previous.access_token || "",
        refresh_token: record.refresh_token || previous.refresh_token || "",
      });
    });
    state.records = dedupeRecords([...byId.values()]);
    saveJson(STORAGE_KEYS.records, state.records);
  }

  function filteredRecords() {
    const query = els.search.value.trim().toLowerCase();
    const status = els.statusFilter.value;
    const rows = state.records.filter((record) => {
      if (status !== "all" && record.status !== status) return false;
      if (!query) return true;
      return [record.email, record.phone, record.status, record.plan_type, record.status_source, record.source, record.note]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
    const groupBy = els.groupBy?.value || "status";
    return rows.sort((a, b) => {
      if (groupBy === "source") return String(a.source || "").localeCompare(String(b.source || "")) || String(a.email).localeCompare(String(b.email));
      if (groupBy === "domain") {
        const domainA = String(a.email || "").split("@")[1] || "";
        const domainB = String(b.email || "").split("@")[1] || "";
        return domainA.localeCompare(domainB) || String(a.email).localeCompare(String(b.email));
      }
      return String(a.status || "").localeCompare(String(b.status || "")) || String(a.email).localeCompare(String(b.email));
    });
  }

  function groupRows(rows) {
    const groupBy = els.groupBy?.value || "status";
    if (groupBy === "none") return [{ label: "", rows }];
    const groups = new Map();
    rows.forEach((row) => {
      let label = row.status || "unknown";
      if (groupBy === "source") label = row.source || "unknown";
      if (groupBy === "domain") label = (String(row.email || "").split("@")[1] || "unknown").toLowerCase();
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    });
    return [...groups.entries()].map(([label, group]) => ({
      label: groupBy === "status" ? (STATUS_LABELS[label] || label || "未知") : (label || "未知"),
      rows: group,
    }));
  }

  function render() {
    sanitizeSelected();
    const rows = filteredRecords();
    const selectedRows = rows.filter((row) => state.selected.has(row.id));
    const allSelected = rows.length > 0 && selectedRows.length === rows.length;
    const summary = summarizeRecords(state.records);
    els.total.textContent = String(summary.total);
    els.free.textContent = String(summary.free);
    els.premium.textContent = String(summary.premium);
    els.banned.textContent = String(summary.banned);
    els.unregistered.textContent = String(summary.unregistered);
    els.selectAllBtn.textContent = allSelected ? "取消全选" : "全选当前";
    els.deleteSelectedBtn.disabled = !selectedRows.length;
    els.onlineCheckBtn.disabled = state.checking;
    els.onlineCheckBtn.textContent = state.checking ? "在线核验中..." : "在线核验选中账号";
    if (!rows.length) {
      els.tableBody.innerHTML = `<tr><td colspan="6">暂无账号，先导入。</td></tr>`;
      return;
    }
    els.tableBody.innerHTML = groupRows(rows).map(({ label, rows: group }) => `
      ${label ? `<tr class="account-group-row"><td colspan="6">${escapeHtml(label)}</td></tr>` : ""}
      ${group.map((record) => `
        <tr data-id="${escapeHtml(record.id)}">
          <td><input class="account-check" type="checkbox" ${state.selected.has(record.id) ? "checked" : ""}></td>
          <td><strong>${escapeHtml(record.email)}</strong><em>${escapeHtml(record.phone || record.token_hint || "-")}</em></td>
          <td><span class="account-status status-${escapeHtml(record.status)}">${escapeHtml(STATUS_LABELS[record.status] || "未知")}</span></td>
          <td>${escapeHtml(record.status_source || record.source || "-")}</td>
          <td><span>${escapeHtml(record.subscription_start || "-")}</span><em>${record.subscription_expire ? `预计到期 ${escapeHtml(record.subscription_expire)}` : "未推断"}</em></td>
          <td>${escapeHtml(record.note || "-")}</td>
        </tr>
      `).join("")}
    `).join("");
  }

  function importAccounts() {
    const rows = els.importText.value.split(/\r?\n/).map(parseImportLine).filter(Boolean);
    if (!rows.length) {
      toast("没有识别到账号");
      return;
    }
    upsertRecords(rows);
    els.importText.value = "";
    toast(`已导入 ${rows.length} 个账号`);
    render();
  }

  function exportAccounts() {
    const blob = new Blob([JSON.stringify({ workspace_id: workspaceId, accounts: state.records }, null, 2)], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `gpt-account-manager-accounts-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  }

  function saveSettings() {
    saveJson(STORAGE_KEYS.settings, {
      proxy_url: els.proxyUrl.value.trim(),
      fingerprint: els.fingerprint.value.trim(),
      risk_confirmed: els.riskConfirm.checked,
    });
  }

  function loadSettings() {
    const settings = loadJson(STORAGE_KEYS.settings, {});
    els.proxyUrl.value = settings.proxy_url || "";
    els.fingerprint.value = settings.fingerprint || "";
    els.riskConfirm.checked = Boolean(settings.risk_confirmed);
  }

  function selectedVisibleRecords() {
    return filteredRecords().filter((row) => state.selected.has(row.id));
  }

  async function runOnlineCheck() {
    saveSettings();
    const selected = selectedVisibleRecords();
    if (!selected.length) {
      els.onlineCheckStatus.textContent = "请先选中要在线核验的账号。";
      toast("请先选中账号");
      return;
    }
    if (!els.proxyUrl.value.trim() || !els.fingerprint.value.trim() || !els.riskConfirm.checked) {
      els.onlineCheckStatus.textContent = "请先填写代理、指纹并勾选风险确认。";
      toast("请先补齐代理、指纹和风险确认");
      return;
    }
    state.checking = true;
    els.onlineCheckStatus.textContent = `正在核验 ${selected.length} 个账号...`;
    render();
    try {
      const response = await fetch(ONLINE_CHECK_ENDPOINT, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          proxy_url: els.proxyUrl.value.trim(),
          fingerprint: els.fingerprint.value.trim(),
          risk_confirmed: els.riskConfirm.checked,
          items: selected.map((row) => ({
            id: row.id,
            email: row.email,
            access_token: row.access_token || "",
            refresh_token: row.refresh_token || "",
          })),
        }),
      });
      const data = await readJsonResponse(response, "账号在线核验失败");
      const results = Array.isArray(data.results) ? data.results : [];
      const updates = results.map((item) => ({
        id: item.id || accountKey(item.email || "", item.email || ""),
        email: item.email || "",
        phone: item.phone || "",
        status: item.status || "unknown",
        plan_type: item.plan_type || "",
        status_source: "在线核验",
        source: "AT/RT 导入",
        note: item.message || "",
        subscription_expire: "",
        updated_at: new Date().toISOString(),
      }));
      upsertRecords(updates);
      const summary = data.summary || {};
      els.onlineCheckStatus.textContent = `在线核验完成：成功 ${summary.checked || 0}，失败 ${summary.failed || 0}。`;
      toast(`在线核验完成：${results.length} 个账号`);
      render();
    } catch (error) {
      const message = error?.message || "账号在线核验失败";
      els.onlineCheckStatus.textContent = message;
      toast(message);
    } finally {
      state.checking = false;
      render();
    }
  }

  els.importBtn.addEventListener("click", importAccounts);
  els.clearBtn.addEventListener("click", () => {
    if (!confirm("确定清空当前工作区账号管理列表吗？")) return;
    state.records = [];
    state.selected.clear();
    saveJson(STORAGE_KEYS.records, state.records);
    render();
  });
  els.search.addEventListener("input", render);
  els.statusFilter.addEventListener("change", render);
  els.groupBy.addEventListener("change", render);
  els.selectAllBtn.addEventListener("click", () => {
    const rows = filteredRecords();
    const allSelected = rows.length && rows.every((row) => state.selected.has(row.id));
    rows.forEach((row) => {
      if (allSelected) state.selected.delete(row.id);
      else state.selected.add(row.id);
    });
    render();
  });
  els.deleteSelectedBtn.addEventListener("click", () => {
    const selectedIds = new Set(filteredRecords().filter((row) => state.selected.has(row.id)).map((row) => row.id));
    if (!selectedIds.size) return;
    if (!confirm(`确定删除已选的 ${selectedIds.size} 个账号吗？`)) return;
    state.records = state.records.filter((row) => !selectedIds.has(row.id));
    state.selected = new Set([...state.selected].filter((id) => !selectedIds.has(id)));
    saveJson(STORAGE_KEYS.records, state.records);
    render();
  });
  els.tableBody.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".account-check");
    if (!checkbox) return;
    const row = checkbox.closest("tr");
    if (!row?.dataset.id) return;
    if (checkbox.checked) state.selected.add(row.dataset.id);
    else state.selected.delete(row.dataset.id);
    render();
  });
  els.exportBtn.addEventListener("click", exportAccounts);
  [els.proxyUrl, els.fingerprint, els.riskConfirm].forEach((el) => el.addEventListener("change", saveSettings));
  els.onlineCheckBtn.addEventListener("click", runOnlineCheck);

  loadSettings();
  if (JSON.stringify(initialStoredRecords) !== JSON.stringify(state.records)) {
    saveJson(STORAGE_KEYS.records, state.records);
  }
  render();
})();
