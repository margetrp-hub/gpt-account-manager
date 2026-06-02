const STORAGE_KEYS = {
  accounts: "ctgptm.mail.accounts",
  categories: "ctgptm.mail.categories",
  tempSettings: "ctgptm.mail.tempSettings",
  workspaceId: "ctgptm.workspaceId",
};

const SERVICE_LABELS = {
  microsoft: "Outlook",
  temp: "临时邮箱",
};

const els = {
  workspaceText: document.querySelector("#workspaceText"),
  sideTotal: document.querySelector("#sideTotal"),
  sideMicrosoft: document.querySelector("#sideMicrosoft"),
  sideTemp: document.querySelector("#sideTemp"),
  sideError: document.querySelector("#sideError"),
  sideBanned: document.querySelector("#sideBanned"),
  statTotal: document.querySelector("#statTotal"),
  statMicrosoft: document.querySelector("#statMicrosoft"),
  statTemp: document.querySelector("#statTemp"),
  searchInput: document.querySelector("#mailboxSearchInput"),
  sourceFilter: document.querySelector("#mailboxSourceFilter"),
  groupFilter: document.querySelector("#mailboxGroupFilter"),
  syncBtn: document.querySelector("#syncMailboxesBtn"),
  openImportBtn: document.querySelector("#openMailboxImportBtn"),
  selectAll: document.querySelector("#selectAllMailboxes"),
  copySelected: document.querySelector("#copySelectedMailboxes"),
  groupSelected: document.querySelector("#groupSelectedMailboxes"),
  exportBtn: document.querySelector("#exportMailboxesBtn"),
  exportBackupBtn: document.querySelector("#exportMailboxBackupBtn"),
  deleteSelected: document.querySelector("#deleteSelectedMailboxes"),
  actionStatus: document.querySelector("#mailboxActionStatus"),
  tableBody: document.querySelector("#mailboxTableBody"),
  pageSummary: document.querySelector("#mailboxPageSummary"),
  pageSize: document.querySelector("#mailboxPageSize"),
  prevPage: document.querySelector("#mailboxPrevPage"),
  nextPage: document.querySelector("#mailboxNextPage"),
  pageText: document.querySelector("#mailboxPageText"),
  sideFilters: document.querySelectorAll("[data-manager-filter]"),
  importModal: document.querySelector("#mailboxImportModal"),
  importSource: document.querySelector("#mailboxImportSource"),
  tempApiField: document.querySelector("#mailboxTempApiField"),
  tempSitePasswordField: document.querySelector("#mailboxTempSitePasswordField"),
  tempApi: document.querySelector("#mailboxTempApi"),
  tempSitePassword: document.querySelector("#mailboxTempSitePassword"),
  importFile: document.querySelector("#mailboxImportFile"),
  importFileName: document.querySelector("#mailboxImportFileName"),
  importText: document.querySelector("#mailboxImportText"),
  importPreview: document.querySelector("#mailboxImportPreview"),
  closeImport: document.querySelector("#closeMailboxImport"),
  cancelImport: document.querySelector("#cancelMailboxImport"),
  confirmImport: document.querySelector("#confirmMailboxImport"),
  toast: document.querySelector("#toast"),
};

const authQueryToken = new URLSearchParams(window.location.search).get("token") || "";
if (authQueryToken) localStorage.setItem("ctgptm.admin.toolToken", authQueryToken);

const workspaceId = getWorkspaceId();
const state = {
  accounts: normalizeStoredAccounts(loadJson(STORAGE_KEYS.accounts, [])),
  categories: normalizeStoredCategories(loadJson(STORAGE_KEYS.categories, [])),
  selected: new Set(),
  page: 1,
  sourceView: "all",
};

const tempSettings = loadJson(STORAGE_KEYS.tempSettings, {});
els.tempApi.value = normalizeTempWorkerUrl(tempSettings.base_url || "");
els.tempSitePassword.value = tempSettings.site_password || "";
els.workspaceText.textContent = workspaceId;
saveAll();

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (/quota|exceeded/i.test(String(error?.name || error?.message || ""))) {
      console.warn("localStorage quota exceeded; skipped", key);
      toast("浏览器本地存储已满，已跳过本地缓存写入");
      return false;
    }
    throw error;
  }
}

function getWorkspaceId() {
  const existing = localStorage.getItem(STORAGE_KEYS.workspaceId) || "";
  if (/^[A-Za-z0-9][A-Za-z0-9_.-]{5,63}$/.test(existing)) return existing;
  const next = `ws_${crypto.randomUUID().replace(/-/g, "")}`;
  localStorage.setItem(STORAGE_KEYS.workspaceId, next);
  return next;
}

function rememberedAdminToken() {
  return authQueryToken || localStorage.getItem("ctgptm.admin.toolToken") || "";
}

function apiHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "X-Workspace-Id": workspaceId,
  };
  const token = rememberedAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} 返回了非 JSON：${text.replace(/\s+/g, " ").slice(0, 180)}`);
  }
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

function setStatus(text, tone = "") {
  els.actionStatus.textContent = text;
  els.actionStatus.dataset.tone = tone;
}

function isMaskedSecret(value) {
  const text = String(value || "");
  return Boolean(text && (text.includes("...") || /^[*]+$/.test(text)));
}

function usableSecret(value) {
  return Boolean(String(value || "").trim()) && !isMaskedSecret(value);
}

function preferRealSecret(next, current) {
  if (usableSecret(next)) return String(next);
  if (usableSecret(current)) return String(current);
  return String(next || current || "");
}

function normalizeTempWorkerUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeStoredCategories(value) {
  const rows = Array.isArray(value) ? value : [];
  return [...new Set(rows.map((item) => String(item || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function sortableTime(value) {
  const time = new Date(String(value || "").replace(" ", "T")).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortAccounts(accounts) {
  return [...accounts].sort((a, b) => {
    const batchDiff = sortableTime(b.imported_at || b.created_at || b.updated_at)
      - sortableTime(a.imported_at || a.created_at || a.updated_at);
    if (batchDiff) return batchDiff;
    const orderDiff = Number(a.import_order ?? 0) - Number(b.import_order ?? 0);
    if (orderDiff) return orderDiff;
    return String(a.email || "").localeCompare(String(b.email || ""));
  });
}

function importDateCategory(value) {
  const date = new Date(String(value || "").replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function applyImportBatch(rows, importedAt = new Date().toISOString()) {
  const category = importDateCategory(importedAt);
  rows.forEach((row, index) => {
    row.imported_at = importedAt;
    row.import_order = index + 1;
    row.category = row.category || category;
  });
  if (category) ensureCategory(category);
  return category;
}

function normalizeStoredAccount(account) {
  if (!account || typeof account !== "object") return null;
  const email = String(account.email || "").trim();
  if (!email.includes("@")) return null;
  const source = account.source === "temp" || String(account.id || "").startsWith("temp:") ? "temp" : "microsoft";
  if (source === "temp") {
    return {
      ...account,
      id: `temp:${email.toLowerCase()}`,
      source: "temp",
      service: SERVICE_LABELS.temp,
      email,
      jwt: String(account.jwt || account.token || ""),
      base_url: normalizeTempWorkerUrl(account.base_url || account.baseUrl || ""),
      site_password: String(account.site_password || account.sitePassword || ""),
      password: "",
      client_id: "",
      refresh_token: "",
      category: String(account.category || account.label || "").trim(),
      selected: account.selected !== false,
    };
  }
  return {
    ...account,
    id: `microsoft:${email.toLowerCase()}`,
    source: "microsoft",
    service: SERVICE_LABELS.microsoft,
    email,
    password: String(account.password || ""),
    client_id: String(account.client_id || account.clientId || ""),
    refresh_token: String(account.refresh_token || account.refreshToken || ""),
    category: String(account.category || account.label || "").trim(),
    selected: account.selected !== false,
  };
}

function normalizeStoredAccounts(value) {
  const byId = new Map();
  (Array.isArray(value) ? value : []).forEach((account) => {
    const normalized = normalizeStoredAccount(account);
    if (!normalized) return;
    if (normalized.source === "temp") byId.delete(`microsoft:${normalized.email.toLowerCase()}`);
    byId.set(normalized.id, normalized);
  });
  return sortAccounts(byId.values());
}

function normalizeServerMailbox(item, source) {
  const email = String(item?.email || "").trim();
  if (!email.includes("@")) return null;
  const category = String(item?.label || item?.category || "").trim();
  if (source === "temp") {
    return normalizeStoredAccount({
      id: `temp:${email.toLowerCase()}`,
      source: "temp",
      email,
      jwt: item?.jwt || "",
      base_url: item?.base_url || item?.baseUrl || "",
      site_password: item?.site_password || item?.sitePassword || "",
      category,
      created_at: item?.created_at || "",
      updated_at: item?.updated_at || "",
      last_status: item?.last_status || "",
      last_error_label: item?.last_error_label || "",
      last_error_code: item?.last_error_code || "",
      last_error_hint: item?.last_error_hint || "",
    });
  }
  return normalizeStoredAccount({
    id: `microsoft:${email.toLowerCase()}`,
    source: "microsoft",
    email,
    password: item?.password || "",
    client_id: item?.client_id || "",
    refresh_token: item?.refresh_token || "",
    category,
    created_at: item?.created_at || "",
    updated_at: item?.updated_at || "",
    last_status: item?.last_status || "",
    last_error_label: item?.last_error_label || "",
    last_error_code: item?.last_error_code || "",
    last_error_hint: item?.last_error_hint || "",
  });
}

function saveAll() {
  saveJson(STORAGE_KEYS.accounts, state.accounts);
  saveJson(STORAGE_KEYS.categories, state.categories);
}

function saveTempSettings() {
  saveJson(STORAGE_KEYS.tempSettings, {
    base_url: normalizeTempWorkerUrl(els.tempApi.value),
    site_password: els.tempSitePassword.value.trim(),
  });
}

function ensureCategory(name) {
  const text = String(name || "").trim();
  if (!text || state.categories.includes(text)) return;
  state.categories.push(text);
  state.categories.sort((a, b) => a.localeCompare(b));
}

function accountMissingCredential(account) {
  if (account.source === "temp") return !usableSecret(account.jwt);
  return !usableSecret(account.client_id) || !usableSecret(account.refresh_token);
}

function accountKindLabel(account) {
  if (account.source === "temp") return "JWT";
  return usableSecret(account.password) ? "Graph+IMAP+密码" : "Graph/IMAP";
}

function accountHasError(account) {
  const status = String(account.last_status || "").toLowerCase();
  return ["error", "failed"].includes(status) || Boolean(account.last_error || account.last_error_code || account.last_error_label);
}

function accountIsBanned(account) {
  const text = [
    account.last_status,
    account.last_error,
    account.last_error_code,
    account.last_error_label,
    account.last_error_hint,
  ].join(" ").toLowerCase();
  return /banned|deactivated|disabled|suspended|封禁|停用|禁用|已停用/.test(text);
}

function secretPreview(value, empty = "未填写") {
  const text = String(value || "");
  if (!text) return `<span class="mailbox-secret missing">${empty}</span>`;
  if (isMaskedSecret(text)) return `<span class="mailbox-secret masked">${escapeHtml(text)}</span>`;
  return `<span class="mailbox-secret">${escapeHtml(text.length > 18 ? `${text.slice(0, 8)}...${text.slice(-6)}` : text)}</span>`;
}

function csvPartsFlexible(line) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out;
}

function pickValue(item, keys) {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function looksLikeUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function looksLikeJwt(value) {
  return String(value || "").split(".").length >= 3;
}

function parseStructuredText(text, source) {
  const clean = String(text || "").trim();
  if (!clean || !/^[\[{]/.test(clean)) return null;
  try {
    const parsed = JSON.parse(clean);
    const rows = Array.isArray(parsed)
      ? parsed
      : (parsed.accounts || parsed.addresses || parsed.items || parsed.data || []);
    return structuredRowsFromObjects(Array.isArray(rows) ? rows : [], source);
  } catch {
    return null;
  }
}

function structuredRowsFromObjects(items, source) {
  const rows = [];
  const errors = [];
  items.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`第 ${index + 1} 项不是对象`);
      return;
    }
    const email = pickValue(item, ["email", "mail", "email_address", "address", "username"]);
    if (!email.includes("@")) {
      errors.push(`第 ${index + 1} 项缺少有效邮箱`);
      return;
    }
    const hasMicrosoft = pickValue(item, ["client_id", "clientId"]) || pickValue(item, ["refresh_token", "refreshToken"]);
    const rowSource = source === "auto" ? (hasMicrosoft ? "microsoft" : "temp") : source;
    const category = pickValue(item, ["category", "label", "group", "tag"]);
    rows.push(rowSource === "temp" ? normalizeStoredAccount({
      source: "temp",
      email,
      jwt: pickValue(item, ["jwt", "token", "access_token", "credential"]),
      base_url: normalizeTempWorkerUrl(pickValue(item, ["base_url", "baseUrl", "api", "api_url", "worker_url"])),
      site_password: pickValue(item, ["site_password", "sitePassword", "x-custom-auth", "custom_auth"]),
      category,
    }) : normalizeStoredAccount({
      source: "microsoft",
      email,
      password: pickValue(item, ["password", "pass"]),
      client_id: pickValue(item, ["client_id", "clientId"]),
      refresh_token: pickValue(item, ["refresh_token", "refreshToken"]),
      category,
    }));
  });
  return { rows: rows.filter(Boolean), errors };
}

function parseLines(text, source) {
  const structured = parseStructuredText(text, source);
  if (structured) return structured;
  const rows = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((line, index) => {
    const clean = line.trim().replace(/^\ufeff/, "");
    if (!clean || clean.startsWith("#")) return;
    const parts = clean.includes("----")
      ? clean.split("----").map((part) => part.trim())
      : csvPartsFlexible(clean);
    const email = parts[0] || "";
    if (!email.includes("@")) {
      errors.push(`第 ${index + 1} 行邮箱格式不对`);
      return;
    }
    const looksMicrosoft = parts.length >= 4
      && !looksLikeUrl(parts[2])
      && !looksLikeJwt(parts[1])
      && String(parts[3] || "").length > 20;
    const rowSource = source === "auto" ? (looksMicrosoft ? "microsoft" : "temp") : source;
    rows.push(rowSource === "temp" ? normalizeStoredAccount({
      source: "temp",
      email,
      jwt: parts[1] || "",
      base_url: normalizeTempWorkerUrl(parts[2] || ""),
      site_password: parts[3] || "",
      category: parts[4] || "",
    }) : normalizeStoredAccount({
      source: "microsoft",
      email,
      password: parts[1] || "",
      client_id: parts[2] || "",
      refresh_token: parts[3] || "",
      category: parts[4] || "",
    }));
  });
  return { rows: rows.filter(Boolean), errors };
}

function upsertAccounts(incoming) {
  const byId = new Map(state.accounts.map((account) => [account.id, account]));
  let imported = 0;
  let updated = 0;
  incoming.forEach((account) => {
    if (!account) return;
    if (account.source === "temp") byId.delete(`microsoft:${account.email.toLowerCase()}`);
    const existing = byId.get(account.id);
    if (existing) {
      Object.assign(existing, account, {
        password: preferRealSecret(account.password, existing.password),
        client_id: preferRealSecret(account.client_id, existing.client_id),
        refresh_token: preferRealSecret(account.refresh_token, existing.refresh_token),
        jwt: preferRealSecret(account.jwt, existing.jwt),
        site_password: preferRealSecret(account.site_password, existing.site_password),
        category: account.category || existing.category || "",
        updated_at: new Date().toISOString(),
      });
      updated += 1;
    } else {
      byId.set(account.id, { ...account, updated_at: new Date().toISOString() });
      imported += 1;
    }
    if (account.category) ensureCategory(account.category);
  });
  state.accounts = sortAccounts(byId.values());
  saveAll();
  return { imported, updated };
}

function mergeServerAccounts(items) {
  const byId = new Map(state.accounts.map((account) => [account.id, account]));
  items.forEach((item) => {
    if (!item?.id) return;
    if (item.source === "temp") byId.delete(`microsoft:${item.email.toLowerCase()}`);
    const existing = byId.get(item.id);
    if (existing) {
      Object.assign(existing, item, {
        password: preferRealSecret(item.password, existing.password),
        client_id: preferRealSecret(item.client_id, existing.client_id),
        refresh_token: preferRealSecret(item.refresh_token, existing.refresh_token),
        jwt: preferRealSecret(item.jwt, existing.jwt),
        site_password: preferRealSecret(item.site_password, existing.site_password),
        category: item.category || existing.category || "",
      });
    } else {
      byId.set(item.id, item);
    }
    if (item.category) ensureCategory(item.category);
  });
  state.accounts = sortAccounts(byId.values());
  saveAll();
}

function selectedRows() {
  return state.accounts.filter((account) => state.selected.has(account.id));
}

function filteredAccounts() {
  const query = els.searchInput.value.trim().toLowerCase();
  const selectedSource = els.sourceFilter.value || "all";
  const source = selectedSource === "all" ? state.sourceView : selectedSource;
  const group = els.groupFilter.value;
  return state.accounts.filter((account) => {
    if (source === "microsoft" && account.source !== "microsoft") return false;
    if (source === "temp" && account.source !== "temp") return false;
    if (source === "error" && !accountHasError(account)) return false;
    if (source === "banned" && !accountIsBanned(account)) return false;
    if (group !== "all" && (account.category || "") !== group) return false;
    if (!query) return true;
    const haystack = [account.email, account.category, accountKindLabel(account), account.source].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function renderGroupFilter() {
  const current = els.groupFilter.value || "all";
  const groups = [...new Set([
    ...state.categories,
    ...state.accounts.map((account) => account.category).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b));
  els.groupFilter.innerHTML = `<option value="all">全部分组</option>${groups.map((group) =>
    `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`
  ).join("")}`;
  els.groupFilter.value = groups.includes(current) ? current : "all";
}

function renderStats(rows) {
  const total = state.accounts.length;
  const microsoft = state.accounts.filter((account) => account.source === "microsoft").length;
  const temp = state.accounts.filter((account) => account.source === "temp").length;
  const error = state.accounts.filter(accountHasError).length;
  const banned = state.accounts.filter(accountIsBanned).length;
  els.sideTotal.textContent = total;
  els.sideMicrosoft.textContent = microsoft;
  els.sideTemp.textContent = temp;
  if (els.sideError) els.sideError.textContent = error;
  if (els.sideBanned) els.sideBanned.textContent = banned;
  els.statTotal.textContent = total;
  els.statMicrosoft.textContent = microsoft;
  els.statTemp.textContent = temp;
  els.pageSummary.textContent = `${rows.length} 条 / 共 ${total} 条`;
}

function renderSideFilters() {
  els.sideFilters.forEach((button) => {
    button.classList.toggle("active", button.dataset.managerFilter === state.sourceView);
  });
}

function renderTable() {
  const rows = filteredAccounts();
  const pageSize = Number(els.pageSize.value || 50);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const start = (state.page - 1) * pageSize;
  const visible = rows.slice(start, start + pageSize);

  if (!visible.length) {
    els.tableBody.innerHTML = `<tr><td colspan="8" class="mailbox-empty-row">没有匹配的邮箱。</td></tr>`;
  } else {
    els.tableBody.innerHTML = visible.map((account, index) => {
      const selected = state.selected.has(account.id);
      const hasError = accountHasError(account);
      const tokenValue = account.source === "temp" ? account.jwt : account.refresh_token;
      const passwordValue = account.source === "temp" ? account.site_password : account.password;
      const group = account.category || "未分组";
      return `
        <tr data-id="${escapeHtml(account.id)}" class="${hasError ? "has-mail-error" : ""}">
          <td><input class="mailbox-row-check" type="checkbox" ${selected ? "checked" : ""} aria-label="选择 ${escapeHtml(account.email)}"></td>
          <td>${start + index + 1}</td>
          <td>
            <strong class="mailbox-email">${escapeHtml(account.email)}${hasError ? `<em>（错误）</em>` : ""}</strong>
          </td>
          <td>${secretPreview(passwordValue, account.source === "temp" ? "无站点密钥" : "未保存密码")}</td>
          <td><span class="mailbox-group-pill">${escapeHtml(group)}</span></td>
          <td>${secretPreview(tokenValue, "缺少令牌")}</td>
          <td><span class="source-badge ${account.source === "microsoft" ? "ms" : "temp"}">${escapeHtml(accountKindLabel(account))}</span></td>
          <td class="mailbox-row-actions">
            <button type="button" data-action="copy">复制</button>
            <button class="danger" type="button" data-action="delete">删除</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  const visibleIds = visible.map((account) => account.id);
  const selectedOnPage = visibleIds.filter((id) => state.selected.has(id)).length;
  els.selectAll.checked = Boolean(visible.length && selectedOnPage === visible.length);
  els.selectAll.indeterminate = Boolean(selectedOnPage && selectedOnPage < visible.length);
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= totalPages;
  els.pageText.textContent = `${state.page} / ${totalPages}`;
  renderStats(rows);
}

function renderAll() {
  renderSideFilters();
  renderGroupFilter();
  renderTable();
}

function mailboxCopyLine(account) {
  if (account.source === "temp") {
    return [account.email, account.jwt || "", account.base_url || "", account.site_password || "", account.category || ""].join("----");
  }
  return [account.email, account.password || "", account.client_id || "", account.refresh_token || "", account.category || ""].join("----");
}

async function copyText(text, message) {
  await navigator.clipboard.writeText(text);
  toast(message);
}

function downloadJsonFile(fileName, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  downloadBlob(fileName, blob);
}

function downloadTextFile(fileName, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  downloadBlob(fileName, blob);
}

function downloadBlob(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportableRows() {
  const selected = selectedRows();
  return selected.length ? selected : filteredAccounts();
}

async function syncMailboxes({ quiet = false } = {}) {
  try {
    setStatus("正在同步工作空间邮箱。");
    const [accountsResponse, tempResponse] = await Promise.all([
      fetch("/client-api/accounts", { headers: apiHeaders(), cache: "no-store" }),
      fetch("/client-api/temp-addresses", { headers: apiHeaders(), cache: "no-store" }),
    ]);
    const [accountsData, tempData] = await Promise.all([
      readJsonResponse(accountsResponse, "/client-api/accounts"),
      readJsonResponse(tempResponse, "/client-api/temp-addresses"),
    ]);
    if (!accountsResponse.ok) throw new Error(accountsData.error || "Outlook 邮箱同步失败");
    if (!tempResponse.ok) throw new Error(tempData.error || "临时邮箱同步失败");
    const rows = [
      ...(accountsData.accounts || []).map((item) => normalizeServerMailbox(item, "microsoft")).filter(Boolean),
      ...(tempData.addresses || []).map((item) => normalizeServerMailbox(item, "temp")).filter(Boolean),
    ];
    mergeServerAccounts(rows);
    setStatus(`已同步 ${rows.length} 个邮箱。`, "ok");
    if (!quiet) toast(`已同步 ${rows.length} 个邮箱`);
  } catch (error) {
    setStatus(error.message || "同步失败", "error");
    if (!quiet) toast(error.message || "同步失败");
  } finally {
    renderAll();
  }
}

async function persistImportedRows(rows) {
  const microsoftRows = rows.filter((row) => row.source === "microsoft");
  const tempRows = rows.filter((row) => row.source === "temp");
  const results = [];
  if (microsoftRows.length) {
    const response = await fetch("/client-api/accounts/import-pickup", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ text: microsoftRows.map(mailboxCopyLine).join("\n") }),
    });
    const data = await readJsonResponse(response, "/client-api/accounts/import-pickup");
    if (!response.ok) throw new Error(data.error || "Outlook 导入失败");
    results.push(data);
  }
  if (tempRows.length) {
    const response = await fetch("/client-api/temp-addresses/import", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        text: tempRows.map(mailboxCopyLine).join("\n"),
        base_url: normalizeTempWorkerUrl(els.tempApi.value),
        site_password: els.tempSitePassword.value.trim(),
      }),
    });
    const data = await readJsonResponse(response, "/client-api/temp-addresses/import");
    if (!response.ok) throw new Error(data.error || "临时邮箱导入失败");
    results.push(data);
  }
  return results;
}

function updateImportPreview() {
  const source = els.importSource.value || "auto";
  const text = els.importText.value;
  const tempMode = source === "temp" || source === "auto";
  els.tempApiField.hidden = !tempMode;
  els.tempSitePasswordField.hidden = !tempMode;
  if (!text.trim()) {
    els.importPreview.className = "import-preview";
    els.importPreview.textContent = "粘贴后会先预检格式。";
    return;
  }
  const { rows, errors } = parseLines(text, source);
  const microsoft = rows.filter((row) => row.source === "microsoft").length;
  const temp = rows.filter((row) => row.source === "temp").length;
  els.importPreview.className = `import-preview ${errors.length ? "warning" : "ok"}`;
  els.importPreview.textContent = [
    `识别 ${rows.length} 个邮箱`,
    microsoft ? `Outlook ${microsoft}` : "",
    temp ? `临时邮箱 ${temp}` : "",
    errors.length ? `格式错误 ${errors.length}` : "",
  ].filter(Boolean).join(" · ") || "没有识别到邮箱。";
}

function openImportModal() {
  els.importModal.hidden = false;
  document.body.classList.add("modal-open");
  updateImportPreview();
  setTimeout(() => els.importText.focus(), 0);
}

function closeImportModal() {
  els.importModal.hidden = true;
  document.body.classList.remove("modal-open");
  els.importText.value = "";
  els.importFile.value = "";
  els.importFileName.textContent = "也可以直接粘贴到下面";
  updateImportPreview();
}

async function importMailboxes() {
  const source = els.importSource.value || "auto";
  const { rows, errors } = parseLines(els.importText.value, source);
  if (!rows.length) {
    toast(errors[0] || "没有识别到邮箱");
    return;
  }
  rows.filter((row) => row.source === "temp").forEach((row) => {
    row.base_url = normalizeTempWorkerUrl(row.base_url || els.tempApi.value);
    row.site_password = row.site_password || els.tempSitePassword.value.trim();
  });
  const importGroup = applyImportBatch(rows);
  saveTempSettings();
  els.confirmImport.disabled = true;
  els.confirmImport.textContent = "导入中";
  try {
    await persistImportedRows(rows);
    const summary = upsertAccounts(rows);
    setStatus(`已导入 ${summary.imported} 个，更新 ${summary.updated} 个，分组：${importGroup || "未分组"}。`, "ok");
    toast(`已导入 ${rows.length} 个邮箱`);
    closeImportModal();
    await syncMailboxes({ quiet: true });
  } catch (error) {
    const summary = upsertAccounts(rows);
    setStatus(`本地已保存 ${summary.imported + summary.updated} 个，但同步失败：${error.message}`, "error");
    toast(error.message || "导入同步失败");
  } finally {
    els.confirmImport.disabled = false;
    els.confirmImport.textContent = "导入并同步";
    renderAll();
  }
}

async function deleteAccounts(accounts) {
  if (!accounts.length) {
    toast("先选择邮箱");
    return;
  }
  if (!confirm(`确定删除 ${accounts.length} 个邮箱吗？会从当前工作空间邮箱池移除。`)) return;
  const emails = [...new Set(accounts.map((account) => account.email.toLowerCase()))];
  try {
    const response = await fetch("/client-api/accounts/delete", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ emails }),
    });
    const data = await readJsonResponse(response, "/client-api/accounts/delete");
    if (!response.ok) throw new Error(data.error || "删除失败");
    const removeIds = new Set(accounts.map((account) => account.id));
    state.accounts = state.accounts.filter((account) => !removeIds.has(account.id));
    accounts.forEach((account) => state.selected.delete(account.id));
    saveAll();
    setStatus(`已删除 ${data.deleted?.total ?? accounts.length} 个邮箱。`, "ok");
    toast("已删除");
    renderAll();
  } catch (error) {
    setStatus(error.message || "删除失败", "error");
    toast(error.message || "删除失败");
  }
}

function setSelectedGroup() {
  const rows = selectedRows();
  if (!rows.length) {
    toast("先选择邮箱");
    return;
  }
  const group = prompt("输入新的分组名，留空表示未分组：", rows[0]?.category || "");
  if (group === null) return;
  const next = group.trim();
  rows.forEach((row) => {
    row.category = next;
    if (next) ensureCategory(next);
  });
  saveAll();
  setStatus(`已设置 ${rows.length} 个邮箱的分组。`, "ok");
  renderAll();
}

els.searchInput.addEventListener("input", () => {
  state.page = 1;
  renderTable();
});
els.sourceFilter.addEventListener("change", () => {
  state.page = 1;
  state.sourceView = els.sourceFilter.value;
  renderAll();
});
els.groupFilter.addEventListener("change", () => {
  state.page = 1;
  renderTable();
});
els.pageSize.addEventListener("change", () => {
  state.page = 1;
  renderTable();
});
els.prevPage.addEventListener("click", () => {
  state.page -= 1;
  renderTable();
});
els.nextPage.addEventListener("click", () => {
  state.page += 1;
  renderTable();
});
els.syncBtn.addEventListener("click", () => syncMailboxes());
els.openImportBtn.addEventListener("click", openImportModal);
els.closeImport.addEventListener("click", closeImportModal);
els.cancelImport.addEventListener("click", closeImportModal);
els.importSource.addEventListener("change", updateImportPreview);
els.importText.addEventListener("input", updateImportPreview);
els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files?.[0];
  if (!file) return;
  els.importText.value = await file.text();
  els.importFileName.textContent = file.name;
  updateImportPreview();
});
els.confirmImport.addEventListener("click", importMailboxes);
els.importModal.addEventListener("click", (event) => {
  if (event.target === els.importModal) closeImportModal();
});

els.sideFilters.forEach((button) => {
  button.addEventListener("click", () => {
    state.sourceView = button.dataset.managerFilter || "all";
    els.sourceFilter.value = ["all", "microsoft", "temp"].includes(state.sourceView) ? state.sourceView : "all";
    state.page = 1;
    renderAll();
  });
});

els.selectAll.addEventListener("change", () => {
  const rows = filteredAccounts();
  const pageSize = Number(els.pageSize.value || 50);
  const visible = rows.slice((state.page - 1) * pageSize, state.page * pageSize);
  visible.forEach((account) => {
    if (els.selectAll.checked) state.selected.add(account.id);
    else state.selected.delete(account.id);
  });
  renderTable();
});

els.tableBody.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".mailbox-row-check");
  if (!checkbox) return;
  const row = checkbox.closest("tr");
  if (!row?.dataset.id) return;
  if (checkbox.checked) state.selected.add(row.dataset.id);
  else state.selected.delete(row.dataset.id);
  renderTable();
});

els.tableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest("tr");
  const account = state.accounts.find((item) => item.id === row?.dataset.id);
  if (!account) return;
  if (button.dataset.action === "copy") {
    await copyText(mailboxCopyLine(account), "已复制邮箱资料");
  }
  if (button.dataset.action === "delete") {
    await deleteAccounts([account]);
  }
});

els.copySelected.addEventListener("click", async () => {
  const rows = selectedRows();
  if (!rows.length) {
    toast("先选择邮箱");
    return;
  }
  await copyText(rows.map(mailboxCopyLine).join("\n"), `已复制 ${rows.length} 个邮箱`);
});

els.groupSelected.addEventListener("click", setSelectedGroup);
els.deleteSelected.addEventListener("click", () => deleteAccounts(selectedRows()));
els.exportBtn.addEventListener("click", () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rows = exportableRows();
  if (!rows.length) {
    toast("没有可导出的邮箱");
    return;
  }
  downloadTextFile(`gpt-account-manager-mailboxes-${stamp}.txt`, `${rows.map(mailboxCopyLine).join("\n")}\n`);
  setStatus(`已按一行一个邮箱导出 ${rows.length} 条。`, "ok");
  toast(`已导出 ${rows.length} 个邮箱 TXT`);
});
els.exportBackupBtn.addEventListener("click", () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadJsonFile(`gpt-account-manager-mailboxes-${stamp}.json`, {
    exported_at: new Date().toISOString(),
    workspace_id: workspaceId,
    categories: state.categories,
    accounts: state.accounts,
  });
});

renderAll();
syncMailboxes({ quiet: true });
