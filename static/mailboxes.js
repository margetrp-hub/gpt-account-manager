const WORKSPACE_ID_STORAGE_KEY = "ctgptm.workspaceId";
const sharedStoragePrefixes = window.GAM?.base?.WORKSPACE_SCOPED_PREFIXES || {};
const sharedLegacyKeys = window.GAM?.base?.LEGACY_SHARED_KEYS || {};
const workspaceId = window.GAM?.base?.resolveWorkspaceId?.(WORKSPACE_ID_STORAGE_KEY)
  || window.GAM?.base?.getWorkspaceId?.(WORKSPACE_ID_STORAGE_KEY)
  || localStorage.getItem(WORKSPACE_ID_STORAGE_KEY)
  || `ws_${crypto.randomUUID().replace(/-/g, "")}`;
const LEGACY_STORAGE_KEYS = {
  accounts: sharedLegacyKeys.legacyMailAccounts || "ctgptm.mail.accounts",
  categories: sharedLegacyKeys.legacyMailCategories || "ctgptm.mail.categories",
  tempSettings: sharedLegacyKeys.legacyTempSettings || "ctgptm.mail.tempSettings",
  phonePool: sharedLegacyKeys.legacyPhonePool || "ctgptm.mail.phonePool",
};
const STORAGE_KEYS = {
  accounts: `${LEGACY_STORAGE_KEYS.accounts}:${workspaceId}`,
  categories: `${LEGACY_STORAGE_KEYS.categories}:${workspaceId}`,
  tempSettings: `${LEGACY_STORAGE_KEYS.tempSettings}:${workspaceId}`,
  phonePool: `${LEGACY_STORAGE_KEYS.phonePool}:${workspaceId}`,
  workspaceId: WORKSPACE_ID_STORAGE_KEY,
};

const RESERVED_CATEGORY_NAMES = new Set(["已封禁"]);
const LEGACY_CATEGORY_NAMES = new Set([
  "默认",
  "default",
  "outlook",
  "临时邮箱",
  "temp",
  "microsoft",
  "generic",
  "邮箱",
  "mailbox",
]);
const IMPORT_DATE_CATEGORY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const SERVICE_LABELS = {
  microsoft: "Outlook",
  temp: "临时邮箱",
  generic: "其他邮箱",
};

const IMPORT_PLACEHOLDERS = {
  auto: [
    "user@outlook.com----password----client_id----refresh_token----自定义分组",
    "user@example.com----JWT_TOKEN----自定义分组",
    "user@163.com----授权码或邮箱密码",
    "user@qq.com----授权码",
    "user@icloud.com----App 专用密码",
  ].join("\n"),
  microsoft: "user@outlook.com----password----client_id----refresh_token----自定义分组",
  temp: "user@example.com----JWT_TOKEN\nuser@example.com----JWT_TOKEN----自定义分组",
  generic: [
    "user@163.com----授权码或邮箱密码",
    "user@qq.com----授权码",
    "user@icloud.com----App 专用密码",
    "user@gmail.com----App Password",
    "user@example.com----password----imap.example.com----993----自定义分组",
  ].join("\n"),
};

const els = {
  workspaceText: document.querySelector("#workspaceText"),
  sideTotal: document.querySelector("#sideTotal"),
  sideMicrosoft: document.querySelector("#sideMicrosoft"),
  sideTemp: document.querySelector("#sideTemp"),
  sideGeneric: document.querySelector("#sideGeneric"),
  sideError: document.querySelector("#sideError"),
  sideBanned: document.querySelector("#sideBanned"),
  statTotal: document.querySelector("#statTotal"),
  statMicrosoft: document.querySelector("#statMicrosoft"),
  statTemp: document.querySelector("#statTemp"),
  statGeneric: document.querySelector("#statGeneric"),
  searchInput: document.querySelector("#mailboxSearchInput"),
  sourceFilter: document.querySelector("#mailboxSourceFilter"),
  groupFilter: document.querySelector("#mailboxGroupFilter"),
  syncBtn: document.querySelector("#syncMailboxesBtn"),
  openImportBtn: document.querySelector("#openMailboxImportBtn"),
  selectAll: document.querySelector("#selectAllMailboxes"),
  copySelected: document.querySelector("#copySelectedMailboxes"),
  groupSelected: document.querySelector("#groupSelectedMailboxes"),
  verifySelected: document.querySelector("#verifySelectedMailboxes"),
  enqueueSelected: document.querySelector("#enqueueSelectedMailboxes"),
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

const base = window.GAM?.base;
const scheduler = window.GAM?.scheduler;
const refreshQueueModel = window.GAM?.refreshQueueModel;
const authQueryToken = base?.persistAdminTokenFromQuery?.() || new URLSearchParams(window.location.search).get("token") || "";
if (!base && authQueryToken) localStorage.setItem("ctgptm.admin.toolToken", authQueryToken);

function migrateLegacyStorageKeys(names) {
  if (base?.migrateLegacyStorageKeys) {
    return base.migrateLegacyStorageKeys(LEGACY_STORAGE_KEYS, STORAGE_KEYS, names);
  }
  names.forEach((name) => {
    const legacyKey = LEGACY_STORAGE_KEYS[name];
    const scopedKey = STORAGE_KEYS[name];
    if (!legacyKey || !scopedKey || legacyKey === scopedKey) return;
    if (localStorage.getItem(scopedKey) !== null) return;
    const raw = localStorage.getItem(legacyKey);
    if (raw === null) return;
    localStorage.setItem(scopedKey, raw);
    localStorage.removeItem(legacyKey);
  });
}

migrateLegacyStorageKeys(["accounts", "categories", "phonePool"]);

const mailboxAccountModel = window.GAM?.mailboxAccountModel?.createMailboxAccountModel?.({
  defaultTempWorkerUrl: "",
  importDateCategoryPattern: IMPORT_DATE_CATEGORY_PATTERN,
  reservedCategoryNames: [...RESERVED_CATEGORY_NAMES],
  legacyCategoryNames: [...LEGACY_CATEGORY_NAMES],
  serviceLabels: SERVICE_LABELS,
});
const initialStoredAccounts = loadJson(STORAGE_KEYS.accounts, []);
const initialStoredCategories = loadJson(STORAGE_KEYS.categories, []);
const initialStoredPhonePool = loadJson(STORAGE_KEYS.phonePool, []);
const state = {
  accounts: normalizeStoredAccounts(initialStoredAccounts),
  categories: normalizeStoredCategories(initialStoredCategories),
  phonePool: normalizePhonePool(initialStoredPhonePool),
  selected: new Set(),
  page: 1,
  sourceView: "all",
  syncRequestId: 0,
  filteredCacheKey: "",
  filteredCacheRows: [],
};
const pendingSaveTimers = new Map();
const saveScheduler = base?.createPendingSaveScheduler?.((key, value) => saveJson(key, value)) || null;
const REFRESH_QUEUE_STORAGE_KEY = `ctgptm.mail.refreshQueue:${workspaceId}`;
const mailboxImportHelper = window.GAM?.mailboxImport?.createMailboxImportHelper?.({
  serviceMap: {
    auto: { source: "auto", label: "自动识别" },
    microsoft: { source: "microsoft", label: SERVICE_LABELS.microsoft },
    temp: { source: "temp", label: SERVICE_LABELS.temp },
    generic: { source: "generic", label: SERVICE_LABELS.generic },
  },
  normalizeStoredAccount: (account) => normalizeStoredAccount(account),
  normalizeTempWorkerUrl: (value) => normalizeTempWorkerUrl(value),
  normalizeGenericMode: (value) => normalizeGenericMode(value),
  isGenericApiMode: (value) => isGenericApiMode(value),
  looksLikeJwt: (value) => looksLikeJwt(value),
  requireStructuredStart: true,
});
const mailboxImportUiHelper = window.GAM?.mailboxImportUi?.createMailboxImportUiHelper?.({
  parseLines: (text, source) => parseLines(text, source),
  sourceMeta: {
    auto: { placeholder: IMPORT_PLACEHOLDERS.auto, tempMode: true },
    microsoft: { placeholder: IMPORT_PLACEHOLDERS.microsoft, tempMode: false },
    temp: { placeholder: IMPORT_PLACEHOLDERS.temp, tempMode: true },
    generic: { placeholder: IMPORT_PLACEHOLDERS.generic, tempMode: false },
  },
});
const refreshQueueHelper = refreshQueueModel?.createRefreshQueueModel?.({
  serviceLabels: {
    microsoft: "Outlook",
    temp: "临时邮箱",
    generic: "其他邮箱",
    local: "本地邮箱",
  },
});

const tempSettings = base?.loadScopedJson
  ? base.loadScopedJson(STORAGE_KEYS.tempSettings, LEGACY_STORAGE_KEYS.tempSettings, {})
  : loadJson(STORAGE_KEYS.tempSettings, {});
if (!localStorage.getItem(STORAGE_KEYS.tempSettings) && Object.keys(tempSettings || {}).length) {
  saveJson(STORAGE_KEYS.tempSettings, tempSettings);
}
els.tempApi.value = normalizeTempWorkerUrl(tempSettings.base_url || "");
els.tempSitePassword.value = tempSettings.site_password || "";
els.workspaceText.textContent = workspaceId;

function loadJson(key, fallback) {
  if (base?.loadJson) return base.loadJson(key, fallback);
  try {
    const raw = localStorage.getItem(key);
    return raw ? repairStoredJson(JSON.parse(raw)) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  if (base?.saveJson) {
    return base.saveJson(key, value, {
      onQuotaExceeded() {
        console.warn("localStorage quota exceeded; skipped", key);
        toast("浏览器本地存储已满，已跳过本地缓存写入");
      },
    });
  }
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

function scheduleSaveJson(key, value, delay = 180) {
  if (saveScheduler?.schedule) {
    saveScheduler.schedule(key, value, delay);
    return;
  }
  const existing = pendingSaveTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingSaveTimers.delete(key);
    saveJson(key, value);
  }, delay);
  pendingSaveTimers.set(key, timer);
}

function getWorkspaceId() {
  return workspaceId;
}

function repairMojibakeText(value) {
  if (base?.repairMojibakeText) return base.repairMojibakeText(value, new Map());
  return value;
}

function repairStoredJson(value) {
  if (base?.repairStoredJson) return base.repairStoredJson(value, new Map());
  if (typeof value === "string") return repairMojibakeText(value);
  if (Array.isArray(value)) return value.map((item) => repairStoredJson(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairStoredJson(item)]));
  }
  return value;
}

function rememberedAdminToken() {
  return base?.rememberedAdminToken?.(authQueryToken) || authQueryToken || localStorage.getItem("ctgptm.admin.toolToken") || "";
}

function apiHeaders() {
  return base?.apiHeaders?.({ workspaceId, token: rememberedAdminToken() }) || {
    "Content-Type": "application/json",
    "X-Workspace-Id": workspaceId,
    ...(rememberedAdminToken() ? { Authorization: `Bearer ${rememberedAdminToken()}` } : {}),
  };
}

async function readJsonResponse(response, label) {
  if (base?.readJsonResponse) return base.readJsonResponse(response, label, { snippetLimit: 180 });
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
  if (mailboxAccountModel?.isMaskedSecret) return mailboxAccountModel.isMaskedSecret(value);
  const text = String(value || "");
  return Boolean(text && (text.includes("...") || /^[*]+$/.test(text)));
}

function usableSecret(value) {
  return Boolean(String(value || "").trim()) && !isMaskedSecret(value);
}

function storedSecret(value) {
  return Boolean(String(value || "").trim());
}

function preferRealSecret(next, current) {
  if (mailboxAccountModel?.preferRealSecret) return mailboxAccountModel.preferRealSecret(next, current);
  if (usableSecret(next)) return String(next);
  if (usableSecret(current)) return String(current);
  return String(next || current || "");
}

function normalizeTempWorkerUrl(value) {
  if (mailboxAccountModel?.normalizeTempWorkerUrl) return mailboxAccountModel.normalizeTempWorkerUrl(value);
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeGenericMode(value) {
  if (mailboxAccountModel?.normalizeGenericMode) return mailboxAccountModel.normalizeGenericMode(value);
  const text = String(value || "auto").trim().toLowerCase().replace("_", "-");
  const aliases = {
    pop: "pop3",
    "mail-pop": "pop3",
    "mail-pop3": "pop3",
    "mail-imap": "imap",
    "cloud-mail": "cloudmail",
    skymail: "cloudmail",
    "luck-mail": "luckmail",
    "luckmail-api": "luckmail",
    luckyous: "luckmail",
  };
  const normalized = aliases[text] || text;
  return ["auto", "imap", "pop3", "cloudmail", "luckmail", "inbucket"].includes(normalized) ? normalized : "auto";
}

function isGenericApiMode(value) {
  if (mailboxAccountModel?.isGenericApiMode) return mailboxAccountModel.isGenericApiMode(value);
  return ["cloudmail", "luckmail", "inbucket"].includes(normalizeGenericMode(value));
}

function genericAccountPayload(account) {
  if (mailboxAccountModel?.genericAccountPayload) return mailboxAccountModel.genericAccountPayload(account);
  return {
    email: account.email,
    password: account.password || account.token || "",
    username: account.username || "",
    mode: normalizeGenericMode(account.mode || account.provider),
    imap_host: account.imap_host || account.imapHost || account.base_url || account.baseUrl || "",
    imap_port: Number(account.imap_port || account.imapPort || 993),
    pop3_host: account.pop3_host || account.pop3Host || "",
    pop3_port: Number(account.pop3_port || account.pop3Port || 995),
    category: account.category || account.label || "",
  };
}

function isImportDateCategory(value) {
  return IMPORT_DATE_CATEGORY_PATTERN.test(String(value || "").trim());
}

function isAllowedCategory(value) {
  const clean = String(value || "").trim();
  if (!clean) return false;
  if (RESERVED_CATEGORY_NAMES.has(clean)) return true;
  if (isImportDateCategory(clean)) return true;
  return !LEGACY_CATEGORY_NAMES.has(clean.toLowerCase());
}

function normalizeStoredCategories(value) {
  if (mailboxAccountModel?.normalizeStoredCategories) return mailboxAccountModel.normalizeStoredCategories(value);
  const rows = Array.isArray(value) ? value : [];
  return [...new Set(rows.map((item) => String(item || "").trim()).filter((item) => isAllowedCategory(item)))]
    .sort((a, b) => a.localeCompare(b));
}

function sortableTime(value) {
  const time = new Date(String(value || "").replace(" ", "T")).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortAccounts(accounts) {
  if (mailboxAccountModel?.sortAccounts) return mailboxAccountModel.sortAccounts(accounts);
  return [...accounts].sort((a, b) => {
    const batchDiff = sortableTime(b.imported_at || b.created_at || b.updated_at)
      - sortableTime(a.imported_at || a.created_at || a.updated_at);
    if (batchDiff) return batchDiff;
    const orderDiff = Number(a.import_order ?? 0) - Number(b.import_order ?? 0);
    if (orderDiff) return orderDiff;
    return String(a.email || "").localeCompare(String(b.email || ""));
  });
}

function dedupeAccounts(accounts) {
  return mailboxAccountModel?.dedupeAccounts
    ? mailboxAccountModel.dedupeAccounts(accounts)
    : sortAccounts(accounts);
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
  if (mailboxAccountModel?.normalizeStoredAccount) return mailboxAccountModel.normalizeStoredAccount(account);
  if (!account || typeof account !== "object") return null;
  const email = String(account.email || "").trim();
  if (!email.includes("@")) return null;
  const normalizedCategory = isAllowedCategory(account.category || account.label)
    ? String(account.category || account.label || "").trim()
    : "";
  const source = account.source === "generic" || String(account.id || "").startsWith("generic:")
    ? "generic"
    : account.source === "temp" || String(account.id || "").startsWith("temp:")
      ? "temp"
      : "microsoft";
  if (source === "generic") {
    const payload = genericAccountPayload({ ...account, email });
    return {
      ...account,
      ...payload,
      id: `generic:${email.toLowerCase()}`,
      source: "generic",
      service: SERVICE_LABELS.generic,
      email,
      jwt: "",
      client_id: "",
      refresh_token: "",
      site_password: "",
      category: normalizedCategory,
      selected: account.selected !== false,
    };
  }
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
      category: normalizedCategory,
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
    category: normalizedCategory,
    selected: account.selected !== false,
  };
}

function normalizeStoredAccounts(value) {
  if (mailboxAccountModel?.normalizeStoredAccounts) return mailboxAccountModel.normalizeStoredAccounts(value);
  const byId = new Map();
  (Array.isArray(value) ? value : []).forEach((account) => {
    const normalized = normalizeStoredAccount(account);
    if (!normalized) return;
    byId.set(normalized.id, normalized);
  });
  return sortAccounts(byId.values());
}

function normalizeServerMailbox(item, source) {
  const email = String(item?.email || "").trim();
  if (!email.includes("@")) return null;
  const rawCategory = String(item?.label || item?.category || "").trim();
  const category = isAllowedCategory(rawCategory) ? rawCategory : "";
  if (source === "generic") {
    return normalizeStoredAccount({
      id: `generic:${email.toLowerCase()}`,
      source: "generic",
      email,
      password: item?.password || item?.token || "",
      username: item?.username || item?.user || "",
      mode: item?.mode || item?.provider || "auto",
      imap_host: item?.imap_host || item?.imapHost || item?.base_url || item?.baseUrl || "",
      imap_port: item?.imap_port || item?.imapPort || 993,
      pop3_host: item?.pop3_host || item?.pop3Host || "",
      pop3_port: item?.pop3_port || item?.pop3Port || 995,
      category,
      created_at: item?.created_at || "",
      updated_at: item?.updated_at || "",
      last_status: item?.last_status || "",
      last_error_label: item?.last_error_label || "",
      last_error_code: item?.last_error_code || "",
      last_error_hint: item?.last_error_hint || "",
      last_message_count: item?.last_message_count || 0,
    });
  }
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
  scheduleSaveJson(STORAGE_KEYS.accounts, state.accounts);
  scheduleSaveJson(STORAGE_KEYS.categories, state.categories);
}

function saveTempSettings() {
  saveJson(STORAGE_KEYS.tempSettings, {
    base_url: normalizeTempWorkerUrl(els.tempApi.value),
    site_password: els.tempSitePassword.value.trim(),
  });
}

function ensureCategory(name) {
  const text = String(name || "").trim();
  if (!isAllowedCategory(text) || state.categories.includes(text)) return;
  state.categories.push(text);
  state.categories.sort((a, b) => a.localeCompare(b));
}

function accountMissingCredential(account) {
  if (account.source === "temp") return !storedSecret(account.jwt);
  if (account.source === "generic") return !storedSecret(account.password);
  return !storedSecret(account.client_id) || !storedSecret(account.refresh_token);
}

function accountKindLabel(account) {
  if (account.source === "temp") return "JWT";
  if (account.source === "generic") {
    const mode = normalizeGenericMode(account.mode);
    if (isGenericApiMode(mode)) return `${mode} API`;
    if (mode === "pop3") return "POP3";
    if (mode === "imap") return "IMAP";
    return "IMAP/POP3";
  }
  return storedSecret(account.password) ? "Outlook OAuth + 密码" : "Outlook OAuth";
}

function accountHasError(account) {
  const status = String(account.last_status || "").toLowerCase();
  return ["error", "failed"].includes(status) || Boolean(account.last_error || account.last_error_code || account.last_error_label);
}

function normalizePhonePool(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    phone: String(item?.phone || "").trim(),
    account_email: String(item?.account_email || item?.accountEmail || "").trim().toLowerCase(),
  })).filter((item) => item.phone && item.account_email);
}

function phoneBindingForAccount(account) {
  const email = String(account?.email || "").trim().toLowerCase();
  if (!email) return "";
  return state.phonePool.find((item) => item.account_email === email)?.phone || "";
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

function secretPreview(value, empty = "未填写", options = {}) {
  const text = String(value || "");
  if (!text) return `<span class="mailbox-secret ${options.optional ? "optional" : "missing"}">${empty}</span>`;
  if (isMaskedSecret(text)) return `<span class="mailbox-secret masked">${escapeHtml(text)}</span>`;
  return `<span class="mailbox-secret">${escapeHtml(text.length > 18 ? `${text.slice(0, 8)}...${text.slice(-6)}` : text)}</span>`;
}

function tempSitePasswordForAccount(account) {
  return String(account?.site_password || els.tempSitePassword?.value || "").trim();
}

function csvPartsFlexible(line) {
  if (mailboxImportHelper?.csvParts) return mailboxImportHelper.csvParts(line);
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
  if (mailboxImportHelper?.pickValue) return mailboxImportHelper.pickValue(item, keys);
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function looksLikeUrl(value) {
  if (mailboxImportHelper?.looksLikeUrl) return mailboxImportHelper.looksLikeUrl(value);
  return /^https?:\/\//i.test(String(value || "").trim());
}

function looksLikeJwt(value) {
  return String(value || "").split(".").length >= 3;
}

function parseStructuredText(text, source) {
  if (mailboxImportHelper?.parseStructuredText) return mailboxImportHelper.parseStructuredText(text, source);
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
  if (mailboxImportHelper?.structuredRowsFromObjects) {
    return mailboxImportHelper.structuredRowsFromObjects(items, source);
  }
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
    const hasTempJwt = looksLikeJwt(pickValue(item, ["jwt", "token", "access_token", "credential"]));
    const rowSource = source === "auto" ? (hasMicrosoft ? "microsoft" : (hasTempJwt ? "temp" : "generic")) : source;
    const category = pickValue(item, ["category", "label", "group", "tag"]);
    if (rowSource === "generic") {
      rows.push(normalizeStoredAccount({
        source: "generic",
        email,
        password: pickValue(item, ["password", "pass", "token", "app_password", "appPassword"]),
        username: pickValue(item, ["username", "user", "mailbox"]),
        mode: pickValue(item, ["mode", "provider", "type"]),
        imap_host: pickValue(item, ["imap_host", "imapHost", "base_url", "baseUrl", "api_url", "apiUrl", "host"]),
        imap_port: pickValue(item, ["imap_port", "imapPort", "port"]),
        pop3_host: pickValue(item, ["pop3_host", "pop3Host"]),
        pop3_port: pickValue(item, ["pop3_port", "pop3Port"]),
        category,
      }));
      return;
    }
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

function parseGenericParts(parts, email) {
  if (mailboxImportHelper?.parseGenericParts) {
    return mailboxImportHelper.parseGenericParts(parts, { source: "generic", label: SERVICE_LABELS.generic }, email);
  }
  const password = parts[1] || "";
  const third = parts[2] || "";
  const fourth = parts[3] || "";
  const fifth = parts[4] || "";
  const sixth = parts[5] || "";
  let mode = normalizeGenericMode(fourth && !/^\d+$/.test(fourth) ? fourth : fifth);
  let host = third && !/^\d+$/.test(third) ? third : "";
  let category = "";
  let username = "";
  if (mode === "auto" && isGenericApiMode(third)) {
    mode = normalizeGenericMode(third);
    host = "";
  }
  if (/^\d+$/.test(fourth)) {
    category = isGenericApiMode(fifth) ? sixth : fifth;
  } else if (isGenericApiMode(mode)) {
    username = mode === "luckmail" ? fifth : "";
    category = mode === "luckmail" ? sixth : fifth;
  } else {
    category = fifth;
  }
  return normalizeStoredAccount({
    source: "generic",
    email,
    password,
    username,
    mode,
    imap_host: mode === "pop3" ? "" : host,
    imap_port: /^\d+$/.test(fourth) ? Number(fourth) : 993,
    pop3_host: mode === "pop3" ? host : "",
    pop3_port: /^\d+$/.test(fourth) ? Number(fourth) : 995,
    category,
  });
}

function parseLines(text, source) {
  if (mailboxImportHelper?.parseLines) return mailboxImportHelper.parseLines(text, source);
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
    const rowSource = source === "auto" ? (looksMicrosoft ? "microsoft" : (looksLikeJwt(parts[1]) ? "temp" : "generic")) : source;
    if (rowSource === "generic") {
      rows.push(parseGenericParts(parts, email));
      return;
    }
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
    const existing = byId.get(account.id);
    if (existing) {
      Object.assign(existing, account, {
        password: preferRealSecret(account.password, existing.password),
        client_id: preferRealSecret(account.client_id, existing.client_id),
        refresh_token: preferRealSecret(account.refresh_token, existing.refresh_token),
        jwt: preferRealSecret(account.jwt, existing.jwt),
        site_password: preferRealSecret(account.site_password, existing.site_password),
        username: account.username || existing.username || "",
        mode: account.mode || existing.mode || "auto",
        imap_host: account.imap_host || existing.imap_host || "",
        imap_port: account.imap_port || existing.imap_port || 993,
        pop3_host: account.pop3_host || existing.pop3_host || "",
        pop3_port: account.pop3_port || existing.pop3_port || 995,
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
  state.accounts = dedupeAccounts(byId.values());
  invalidateFilteredAccountsCache();
  saveAll();
  return { imported, updated };
}

function mergeServerAccounts(items) {
  const byId = new Map(state.accounts.map((account) => [account.id, account]));
  items.forEach((item) => {
    if (!item?.id) return;
    const existing = byId.get(item.id);
    if (existing) {
      Object.assign(existing, item, {
        password: preferRealSecret(item.password, existing.password),
        client_id: preferRealSecret(item.client_id, existing.client_id),
        refresh_token: preferRealSecret(item.refresh_token, existing.refresh_token),
        jwt: preferRealSecret(item.jwt, existing.jwt),
        site_password: preferRealSecret(item.site_password, existing.site_password),
        username: item.username || existing.username || "",
        mode: item.mode || existing.mode || "auto",
        imap_host: item.imap_host || existing.imap_host || "",
        imap_port: item.imap_port || existing.imap_port || 993,
        pop3_host: item.pop3_host || existing.pop3_host || "",
        pop3_port: item.pop3_port || existing.pop3_port || 995,
        category: item.category || existing.category || "",
      });
    } else {
      byId.set(item.id, item);
    }
    if (item.category) ensureCategory(item.category);
  });
  state.accounts = dedupeAccounts(byId.values());
  invalidateFilteredAccountsCache();
  saveAll();
}

function selectedRows() {
  const visibleIds = new Set(filteredAccounts().map((account) => account.id));
  return state.accounts.filter((account) => state.selected.has(account.id) && visibleIds.has(account.id));
}

function resolvedMailboxActionRows({ fallback = "none" } = {}) {
  const selected = selectedRows();
  if (selected.length) return selected;
  if (fallback === "page") return visibleAccountsForCurrentPage();
  if (fallback === "filtered") return filteredAccounts();
  return [];
}

function pruneSelectedRowsToCurrentFilter() {
  const visibleIds = new Set(filteredAccounts().map((account) => account.id));
  state.selected.forEach((id) => {
    if (!visibleIds.has(id)) state.selected.delete(id);
  });
}

function mailboxFilterCacheKey() {
  return JSON.stringify([
    accountsSignature(state.accounts),
    els.searchInput.value.trim().toLowerCase(),
    els.sourceFilter.value || "all",
    state.sourceView,
    els.groupFilter.value || "all",
  ]);
}

function filteredAccounts() {
  const cacheKey = mailboxFilterCacheKey();
  if (cacheKey === state.filteredCacheKey) return state.filteredCacheRows;
  const query = els.searchInput.value.trim().toLowerCase();
  const selectedSource = els.sourceFilter.value || "all";
  const source = selectedSource === "all" ? state.sourceView : selectedSource;
  const group = els.groupFilter.value;
  const rows = state.accounts.filter((account) => {
    if (source === "microsoft" && account.source !== "microsoft") return false;
    if (source === "temp" && account.source !== "temp") return false;
    if (source === "generic" && account.source !== "generic") return false;
    if (source === "error" && !accountHasError(account)) return false;
    if (source === "banned" && !accountIsBanned(account)) return false;
    if (group !== "all" && (account.category || "") !== group) return false;
    if (!query) return true;
    const haystack = [account.email, account.category, accountKindLabel(account), account.source].join(" ").toLowerCase();
    return haystack.includes(query);
  });
  state.filteredCacheKey = cacheKey;
  state.filteredCacheRows = rows;
  return rows;
}

function invalidateFilteredAccountsCache() {
  state.filteredCacheKey = "";
  state.filteredCacheRows = [];
}

function visibleAccountsForCurrentPage() {
  const rows = filteredAccounts();
  const pageSize = Number(els.pageSize.value || 50);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, state.page), totalPages);
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

function syncSelectionUi(visible = visibleAccountsForCurrentPage()) {
  const visibleIds = visible.map((account) => account.id);
  const selectedOnPage = visibleIds.filter((id) => state.selected.has(id)).length;
  els.selectAll.checked = Boolean(visible.length && selectedOnPage === visible.length);
  els.selectAll.indeterminate = Boolean(selectedOnPage && selectedOnPage < visible.length);
  if (els.verifySelected) {
    els.verifySelected.disabled = !selectedRows().length;
  }
  if (els.enqueueSelected) {
    els.enqueueSelected.disabled = !selectedRows().length;
  }
}

function renderGroupFilter() {
  const current = els.groupFilter.value || "all";
  const groups = [...new Set([
    ...state.categories,
    ...state.accounts.map((account) => account.category).filter((category) => isAllowedCategory(category)),
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
  const generic = state.accounts.filter((account) => account.source === "generic").length;
  const error = state.accounts.filter(accountHasError).length;
  const banned = state.accounts.filter(accountIsBanned).length;
  els.sideTotal.textContent = total;
  els.sideMicrosoft.textContent = microsoft;
  els.sideTemp.textContent = temp;
  if (els.sideGeneric) els.sideGeneric.textContent = generic;
  if (els.sideError) els.sideError.textContent = error;
  if (els.sideBanned) els.sideBanned.textContent = banned;
  els.statTotal.textContent = total;
  els.statMicrosoft.textContent = microsoft;
  els.statTemp.textContent = temp;
  if (els.statGeneric) els.statGeneric.textContent = generic;
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
      const tokenValue = account.source === "temp"
        ? account.jwt
        : account.source === "generic"
          ? account.imap_host || account.pop3_host || account.mode
          : account.refresh_token;
      const passwordValue = account.source === "temp" ? tempSitePasswordForAccount(account) : account.password;
      const boundPhone = phoneBindingForAccount(account);
      const group = account.category || "未分组";
      const badgeClass = account.source === "microsoft" ? "ms" : account.source === "generic" ? "generic" : "temp";
      return `
        <tr data-id="${escapeHtml(account.id)}" class="${hasError ? "has-mail-error" : ""}">
          <td><input class="mailbox-row-check" type="checkbox" ${selected ? "checked" : ""} aria-label="选择 ${escapeHtml(account.email)}"></td>
          <td>${start + index + 1}</td>
          <td>
            <strong class="mailbox-email">${escapeHtml(account.email)}${hasError ? `<em>（错误）</em>` : ""}</strong>
            ${boundPhone ? `<span class="mailbox-phone-binding">\u7ed1\u5b9a\u624b\u673a ${escapeHtml(boundPhone)}</span>` : ""}
          </td>
          <td>${secretPreview(passwordValue, account.source === "temp" ? "未配置（可选）" : "未保存密码/令牌", { optional: account.source === "temp" })}</td>
          <td><span class="mailbox-group-pill">${escapeHtml(group)}</span></td>
          <td>${secretPreview(tokenValue, account.source === "generic" ? "缺少主机/模式" : "缺少令牌")}</td>
          <td><span class="source-badge ${badgeClass}">${escapeHtml(accountKindLabel(account))}</span></td>
          <td class="mailbox-row-actions">
            <button type="button" data-action="copy">复制</button>
            <button class="danger" type="button" data-action="delete">删除</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  syncSelectionUi(visible);
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

const debouncedRenderTable = scheduler?.debounce
  ? scheduler.debounce(() => {
    state.page = 1;
    renderAll();
  }, 180)
  : () => {
    state.page = 1;
    renderAll();
  };

function mailboxCopyLine(account) {
  if (account.source === "temp") {
    return [account.email, account.jwt || "", account.base_url || "", account.site_password || "", account.category || ""].join("----");
  }
  if (account.source === "generic") {
    const mode = normalizeGenericMode(account.mode);
    const host = mode === "pop3" ? account.pop3_host || "" : account.imap_host || "";
    const port = mode === "pop3" ? account.pop3_port || "" : account.imap_port || "";
    return [account.email, account.password || "", host, port, mode || "auto", account.category || ""].join("----");
  }
  return [account.email, account.password || "", account.client_id || "", account.refresh_token || "", account.category || ""].join("----");
}

function mailboxFetchPayload(account) {
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
      accounts: [],
      temp_addresses: [{
        email: account.email,
        jwt: account.jwt,
        base_url: account.base_url,
        site_password: tempSitePasswordForAccount(account),
      }],
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

function mailboxResultLabel(result) {
  return String(
    result?.error_label
    || result?.last_error_label
    || result?.error_code
    || result?.last_error_code
    || "收信失败"
  ).trim();
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
    const errorCode = String(result?.error_code || "mail_pickup_unavailable");
    const errorLabel = mailboxResultLabel(result);
    account.mail_verify_status = "error";
    account.last_status = "error";
    account.last_error = rawError;
    account.last_error_code = errorCode;
    account.last_error_label = errorLabel;
    account.last_error_hint = String(result?.error_hint || errorLabel);
    return { status: "failed", label: errorLabel };
  }
  account.mail_verify_status = hasCode ? "ok" : "no_code";
  account.last_status = account.mail_verify_status;
  return {
    status: hasCode ? "ok" : "no_code",
    label: hasCode ? "可收件，已发现验证码邮件" : "可收件，未发现验证码邮件",
  };
}

async function copyText(text, message) {
  await navigator.clipboard.writeText(text);
  toast(message);
}

async function verifySelectedMailboxes() {
  const rows = resolvedMailboxActionRows({ fallback: "none" });
  if (!rows.length) {
    toast("请先选择邮箱");
    return;
  }
  const oldText = els.verifySelected?.textContent || "验证邮箱";
  if (els.verifySelected) {
    els.verifySelected.disabled = true;
    els.verifySelected.textContent = "验证中...";
  }
  let ok = 0;
  let noCode = 0;
  let failed = 0;
  setStatus(`正在验证 ${rows.length} 个邮箱...`);
  try {
    for (const account of rows) {
      try {
        const response = await fetch("/client-api/fetch", {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify(mailboxFetchPayload(account)),
        });
        const data = await readJsonResponse(response, "验证邮箱失败");
        const result = (data.results || []).find((item) =>
          String(item?.email || "").toLowerCase() === String(account.email || "").toLowerCase()
        ) || (data.results || [])[0] || {
          ok: false,
          error_code: "mail_pickup_unavailable",
          error_label: response.ok ? "邮箱没有返回取信结果" : (data.error || "验证邮箱失败"),
          error: data.error || "邮箱没有返回取信结果",
        };
        const applied = applyMailboxVerifyResult(account, result);
        if (applied.status === "ok") ok += 1;
        else if (applied.status === "no_code") noCode += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;
        applyMailboxVerifyResult(account, {
          ok: false,
          error_code: "mail_pickup_unavailable",
          error_label: "验证邮箱失败",
          error: error?.message || "验证邮箱失败",
        });
      }
    }
    invalidateFilteredAccountsCache();
    saveAll();
    renderAll();
    setStatus(`验证完成：有验证码 ${ok}，未发现验证码 ${noCode}，失败 ${failed}`, failed ? "error" : "ok");
    toast(`验证完成：可收件 ${ok + noCode}，失败 ${failed}`);
  } finally {
    if (els.verifySelected) {
      els.verifySelected.disabled = false;
      els.verifySelected.textContent = oldText;
    }
  }
}

function enqueueSelectedAccounts() {
  const rows = resolvedMailboxActionRows({ fallback: "none" });
  if (!rows.length) {
    toast("先选择邮箱");
    return;
  }
  if (!refreshQueueHelper?.mergeQueueItems) {
    toast("刷新队列模块未就绪");
    return;
  }
  const existingQueue = loadJson(REFRESH_QUEUE_STORAGE_KEY, []);
  const merged = refreshQueueHelper.mergeQueueItems(existingQueue, rows.map((account) => ({
    account,
    id: `refresh:${account.id}`,
    source_kind: "local",
    email: account.email,
    name: account.email,
    account_id: account.id,
    source: account.source,
    service: account.service || SERVICE_LABELS[account.source] || "本地邮箱",
    status: "idle",
    error: "",
    logs: [],
    auth_file: account.auth_file || null,
  })));
  saveJson(REFRESH_QUEUE_STORAGE_KEY, merged.queue);
  setStatus(`已加入刷新队列 ${rows.length} 个邮箱，新增 ${merged.added} 个。`, "ok");
  toast(merged.added ? `已加入刷新队列 ${merged.added} 个` : "这些邮箱已在刷新队列");
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
  return resolvedMailboxActionRows({ fallback: "none" });
}

async function syncMailboxes({ quiet = false } = {}) {
  const requestId = state.syncRequestId + 1;
  state.syncRequestId = requestId;
  try {
    setStatus("正在同步工作空间邮箱。");
    const [accountsResponse, tempResponse, genericResponse] = await Promise.all([
      fetch("/client-api/accounts", { headers: apiHeaders(), cache: "no-store" }),
      fetch("/client-api/temp-addresses", { headers: apiHeaders(), cache: "no-store" }),
      fetch("/client-api/generic-accounts", { headers: apiHeaders(), cache: "no-store" }),
    ]);
    const [accountsData, tempData, genericData] = await Promise.all([
      readJsonResponse(accountsResponse, "/client-api/accounts"),
      readJsonResponse(tempResponse, "/client-api/temp-addresses"),
      readJsonResponse(genericResponse, "/client-api/generic-accounts"),
    ]);
    if (requestId !== state.syncRequestId) return;
    if (!accountsResponse.ok) throw new Error(accountsData.error || "Outlook 邮箱同步失败");
    if (!tempResponse.ok) throw new Error(tempData.error || "临时邮箱同步失败");
    if (!genericResponse.ok) throw new Error(genericData.error || "其他邮箱同步失败");
    const rows = [
      ...(accountsData.accounts || []).map((item) => normalizeServerMailbox(item, "microsoft")).filter(Boolean),
      ...(tempData.addresses || []).map((item) => normalizeServerMailbox(item, "temp")).filter(Boolean),
      ...(genericData.accounts || []).map((item) => normalizeServerMailbox(item, "generic")).filter(Boolean),
    ];
    if (requestId !== state.syncRequestId) return;
    mergeServerAccounts(rows);
    setStatus(`已同步 ${rows.length} 个邮箱。`, "ok");
    if (!quiet) toast(`已同步 ${rows.length} 个邮箱`);
  } catch (error) {
    if (requestId !== state.syncRequestId) return;
    setStatus(error.message || "同步失败", "error");
    if (!quiet) toast(error.message || "同步失败");
  } finally {
    if (requestId !== state.syncRequestId) return;
    renderAll();
  }
}

async function persistImportedRows(rows) {
  const microsoftRows = rows.filter((row) => row.source === "microsoft");
  const tempRows = rows.filter((row) => row.source === "temp");
  const genericRows = rows.filter((row) => row.source === "generic");
  const results = [];
  const completedSources = [];
  try {
    if (microsoftRows.length) {
      const response = await fetch("/client-api/accounts/import-pickup", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ text: microsoftRows.map(mailboxCopyLine).join("\n") }),
      });
      const data = await readJsonResponse(response, "/client-api/accounts/import-pickup");
      if (!response.ok) throw new Error(data.error || "Outlook 导入失败");
      results.push(data);
      completedSources.push(`Outlook ${microsoftRows.length}`);
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
      completedSources.push(`临时邮箱 ${tempRows.length}`);
    }
    if (genericRows.length) {
      const response = await fetch("/client-api/generic-accounts/import", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ text: genericRows.map(mailboxCopyLine).join("\n") }),
      });
      const data = await readJsonResponse(response, "/client-api/generic-accounts/import");
      if (!response.ok) throw new Error(data.error || "其他邮箱导入失败");
      results.push(data);
      completedSources.push(`其他邮箱 ${genericRows.length}`);
    }
    return { results, completedSources };
  } catch (error) {
    error.completedSources = completedSources;
    throw error;
  }
}

function updateImportPreview() {
  if (mailboxImportUiHelper?.previewState) {
    const source = els.importSource.value || "auto";
    const nextState = mailboxImportUiHelper.previewState({
      source,
      text: els.importText.value,
      options: {
        emptyText: "粘贴后会先预检格式。",
      },
    });
    mailboxImportUiHelper.applyPreviewState({
      previewEl: els.importPreview,
      textInput: els.importText,
      tempApiField: els.tempApiField,
      tempSitePasswordField: els.tempSitePasswordField,
    }, nextState);
    return;
  }
  const source = els.importSource.value || "auto";
  const text = els.importText.value;
  const tempMode = source === "temp" || source === "auto";
  els.tempApiField.hidden = !tempMode;
  els.tempSitePasswordField.hidden = !tempMode;
  els.importText.placeholder = IMPORT_PLACEHOLDERS[source] || IMPORT_PLACEHOLDERS.auto;
  els.importText.dataset.i18nOriginalPlaceholder = els.importText.placeholder;
  if (!text.trim()) {
    els.importPreview.className = "import-preview";
    els.importPreview.textContent = "粘贴后会先预检格式。";
    return;
  }
  const { rows, errors } = parseLines(text, source);
  const microsoft = rows.filter((row) => row.source === "microsoft").length;
  const temp = rows.filter((row) => row.source === "temp").length;
  const generic = rows.filter((row) => row.source === "generic").length;
  els.importPreview.className = `import-preview ${errors.length ? "warning" : "ok"}`;
  els.importPreview.textContent = [
    `识别 ${rows.length} 个邮箱`,
    microsoft ? `Outlook ${microsoft}` : "",
    temp ? `临时邮箱 ${temp}` : "",
    generic ? `其他邮箱 ${generic}` : "",
    errors.length ? `格式错误 ${errors.length}` : "",
  ].filter(Boolean).join(" · ") || "没有识别到邮箱。";
}

function openImportModal() {
  if (mailboxImportUiHelper?.setModalOpen) mailboxImportUiHelper.setModalOpen(els.importModal, true);
  else {
    els.importModal.hidden = false;
    document.body.classList.add("modal-open");
  }
  updateImportPreview();
  setTimeout(() => els.importText.focus(), 0);
}

function closeImportModal() {
  if (mailboxImportUiHelper?.setModalOpen) mailboxImportUiHelper.setModalOpen(els.importModal, false);
  else {
    els.importModal.hidden = true;
    document.body.classList.remove("modal-open");
  }
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
    const partial = error?.completedSources || [];
    const partialText = partial.length ? `已写入：${partial.join("，")}。` : "服务端未写入，本地也未保存。";
    setStatus(`导入失败：${partialText}${error.message}`, "error");
    toast(error.message || "导入同步失败");
    if (partial.length) {
      await syncMailboxes({ quiet: true });
    }
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
    const removeEmails = new Set(emails);
    state.accounts = state.accounts.filter((account) => !removeEmails.has(String(account.email || "").toLowerCase()));
    state.selected = new Set([...state.selected].filter((id) => state.accounts.some((account) => account.id === id)));
    invalidateFilteredAccountsCache();
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
  const rows = resolvedMailboxActionRows();
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
  invalidateFilteredAccountsCache();
  saveAll();
  setStatus(`已设置 ${rows.length} 个邮箱的分组。`, "ok");
  renderAll();
}

const rerenderTableWithSelectionPrune = () => {
  state.page = 1;
  pruneSelectedRowsToCurrentFilter();
  renderTable();
};
const debouncedRerenderTableWithSelectionPrune = scheduler?.debounce?.(rerenderTableWithSelectionPrune, 180) || rerenderTableWithSelectionPrune;

els.searchInput.addEventListener("input", debouncedRerenderTableWithSelectionPrune);
els.searchInput.addEventListener("search", rerenderTableWithSelectionPrune);
els.sourceFilter.addEventListener("change", () => {
  state.page = 1;
  state.sourceView = els.sourceFilter.value;
  pruneSelectedRowsToCurrentFilter();
  renderAll();
});
els.groupFilter.addEventListener("change", () => {
  state.page = 1;
  pruneSelectedRowsToCurrentFilter();
  renderTable();
});
els.pageSize.addEventListener("change", () => {
  state.page = 1;
  pruneSelectedRowsToCurrentFilter();
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
    els.sourceFilter.value = ["all", "microsoft", "temp", "generic"].includes(state.sourceView) ? state.sourceView : "all";
    state.page = 1;
    pruneSelectedRowsToCurrentFilter();
    renderAll();
  });
});

els.selectAll.addEventListener("change", () => {
  const visible = visibleAccountsForCurrentPage();
  visible.forEach((account) => {
    if (els.selectAll.checked) state.selected.add(account.id);
    else state.selected.delete(account.id);
  });
  visible.forEach((account) => {
    const checkbox = els.tableBody.querySelector(`tr[data-id="${CSS.escape(account.id)}"] .mailbox-row-check`);
    if (checkbox) checkbox.checked = state.selected.has(account.id);
  });
  syncSelectionUi(visible);
});

els.tableBody.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".mailbox-row-check");
  if (!checkbox) return;
  const row = checkbox.closest("tr");
  if (!row?.dataset.id) return;
  if (checkbox.checked) state.selected.add(row.dataset.id);
  else state.selected.delete(row.dataset.id);
  syncSelectionUi();
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
  const rows = resolvedMailboxActionRows();
  if (!rows.length) {
    toast("先选择邮箱");
    return;
  }
  await copyText(rows.map(mailboxCopyLine).join("\n"), `已复制 ${rows.length} 个邮箱`);
});

els.groupSelected.addEventListener("click", setSelectedGroup);
els.verifySelected?.addEventListener("click", verifySelectedMailboxes);
els.enqueueSelected?.addEventListener("click", enqueueSelectedAccounts);
els.deleteSelected.addEventListener("click", () => deleteAccounts(resolvedMailboxActionRows()));
els.exportBtn.addEventListener("click", () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rows = exportableRows();
  if (!rows.length) {
    toast("请先选中要导出的邮箱");
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
  setStatus(`已导出 JSON 备份 ${state.accounts.length} 个邮箱。`, "ok");
  toast(`已导出 JSON 备份 ${state.accounts.length} 个邮箱`);
});

renderAll();

if (JSON.stringify(initialStoredAccounts) !== JSON.stringify(state.accounts)) {
  scheduleSaveJson(STORAGE_KEYS.accounts, state.accounts, 0);
}
if (JSON.stringify(initialStoredCategories) !== JSON.stringify(state.categories)) {
  scheduleSaveJson(STORAGE_KEYS.categories, state.categories, 0);
}
syncMailboxes({ quiet: true });

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEYS.phonePool) return;
  state.phonePool = normalizePhonePool(loadJson(STORAGE_KEYS.phonePool, []));
  renderTable();
});
