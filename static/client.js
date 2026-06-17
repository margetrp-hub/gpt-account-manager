const WORKSPACE_ID_STORAGE_KEY = "ctgptm.workspaceId";
const DEFAULT_WORKSPACE_ID = "ws_33851931ac0e448da66758fa28a05825";

function bootstrapWorkspaceId() {
  if (window.GAM?.base?.resolveWorkspaceId) {
    return window.GAM.base.resolveWorkspaceId(WORKSPACE_ID_STORAGE_KEY, {
      fallbackWorkspaceId: DEFAULT_WORKSPACE_ID,
    });
  }
  const existing = window.GAM?.base?.getWorkspaceId?.(WORKSPACE_ID_STORAGE_KEY)
    || localStorage.getItem(WORKSPACE_ID_STORAGE_KEY)
    || DEFAULT_WORKSPACE_ID;
  if (/^[A-Za-z0-9][A-Za-z0-9_.-]{5,63}$/.test(existing)) return existing;
  const next = `ws_${crypto.randomUUID().replace(/-/g, "")}`;
  localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, next);
  return next;
}

const workspaceId = bootstrapWorkspaceId();
const LEGACY_STORAGE_KEYS = {
  accounts: "ctgptm.mail.accounts",
  categories: "ctgptm.mail.categories",
  messages: "ctgptm.mail.messages",
  ignoredMessages: "ctgptm.mail.ignoredMessages",
  refreshQueue: "ctgptm.mail.refreshQueue",
  abnormalRows: "ctgptm.mail.abnormalRows",
  mailboxControlsCollapsed: "ctgptm.mail.mailboxControlsCollapsed.v2",
};
const STORAGE_KEYS = {
  accounts: `${LEGACY_STORAGE_KEYS.accounts}:${workspaceId}`,
  categories: `${LEGACY_STORAGE_KEYS.categories}:${workspaceId}`,
  messages: `${LEGACY_STORAGE_KEYS.messages}:${workspaceId}`,
  ignoredMessages: `${LEGACY_STORAGE_KEYS.ignoredMessages}:${workspaceId}`,
  refreshQueue: `${LEGACY_STORAGE_KEYS.refreshQueue}:${workspaceId}`,
  abnormalRows: `${LEGACY_STORAGE_KEYS.abnormalRows}:${workspaceId}`,
  cpaSettings: "ctgptm.mail.cpaSettings",
  tempSettings: "ctgptm.mail.tempSettings",
  workspaceId: WORKSPACE_ID_STORAGE_KEY,
  mailboxControlsCollapsed: `${LEGACY_STORAGE_KEYS.mailboxControlsCollapsed}:${workspaceId}`,
};
const DEFAULT_TEMP_WORKER_URL = "";
const LEGACY_TEMP_WORKER_URLS = new Set([]);

const TYPE_LABELS = {
  verification: "验证码",
  invite: "邀请",
  security: "安全",
  promotion: "推广",
  banned: "封禁",
  other: "其他",
};

const SOURCE_FILTER_LABELS = {
  all: "全部",
  microsoft: "Outlook",
  temp: "临时",
  generic: "其他",
};

function accountSourceGroup(account) {
  if (account?.source === "temp") return "temp";
  if (account?.source === "microsoft") return "microsoft";
  return "generic";
}

const EMPTY_CATEGORY_LABEL = "未分组";
const LEGACY_SEEDED_CATEGORIES = new Set(["默认", "客户", "注册", "账单"]);
const RESERVED_CATEGORY_NAMES = new Set(["已封禁"]);
const LEGACY_CATEGORY_NAMES = new Set([
  "默认",
  "客户",
  "注册",
  "账单",
  "outlook",
  "临时邮箱",
  "temp",
  "microsoft",
  "generic",
  "邮箱",
]);
const IMPORT_DATE_CATEGORY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MOJIBAKE_TEXT_FIXES = new Map([
  ["\u699b\u6a3f\ue17b", "默认"],
  ["\u93c8\ue044\u578e\u7f01\u003f", "未分组"],
  ["\u6960\u5c83\u7609\u942e\u003f", "验证码"],
  ["\u95ad\u20ac\u7487\u003f", "邀请"],
  ["\u7039\u590a\u53cf", "安全"],
  ["\u95b2\u5d87\u7586", "重置"],
  ["\u7490\ufe40\u5d1f", "账单"],
  ["\u95ab\u6c31\u7161", "通知"],
  ["\u704f\u4f7a\ue6e6", "封禁"],
  ["\u934f\u6735\u7cac", "其他"],
  ["\u9477\ue044\u59e9\u7487\u55d7\u57c6", "自动识别"],
  ["\u6d93\u5b58\u6902\u95ad\ue1be\ue188", "临时邮箱"],
  ["\u95ad\ue1be\ue188", "邮箱"],
  ["\u9352\u950b\u67ca", "刷新"],
  ["\u6fb6\u8fab\u89e6", "失败"],
  ["\u93b4\u612c\u59db", "成功"],
  ["\u7035\u714e\u53c6", "导入"],
  ["\u9352\u72bb\u6ace", "删除"],
  ["\u7ee0\uff04\u608a", "管理"],
]);
const MAIL_SERVICES = {
  auto: {
    label: "自动识别",
    source: "auto",
    tone: "auto",
    hint: "自动识别 Outlook 四段、临时邮箱 JWT、其他邮箱密码/授权码或 IMAP/POP3 扩展格式。",
    placeholder: [
      "user@outlook.com----password----client_id----refresh_token----默认分组",
      "user@example.com----JWT_TOKEN----默认分组",
      "user@163.com----授权码或邮箱密码",
    ].join("\n"),
  },
  microsoft: {
    label: "Outlook",
    source: "microsoft",
    tone: "ms",
    hint: "导入时保持 Outlook 四段格式：邮箱----密码----client_id----refresh_token----分类(可选)。",
    placeholder: "user@outlook.com----password----client_id----refresh_token----分类(可选)",
  },
  temp: {
    label: "临时邮箱",
    source: "temp",
    tone: "temp",
    hint: "临时邮箱只需要 JWT：邮箱----JWT；可选：邮箱----JWT----分组。Temp API 已默认填好。",
    placeholder: "user@example.com----JWT_TOKEN\nuser@example.com----JWT_TOKEN----默认分组",
  },
  generic: {
    label: "其他邮箱",
    source: "generic",
    tone: "generic",
    hint: "支持 163、QQ、iCloud、Gmail、Yahoo 等 IMAP/POP3 邮箱：邮箱----密码/授权码；可选：邮箱----密码----imap.example.com----993----分组。",
    placeholder: [
      "user@163.com----授权码或邮箱密码",
      "user@qq.com----授权码",
      "user@icloud.com----App 专用密码",
      "user@gmail.com----App Password",
      "user@example.com----password----imap.example.com----993----默认分组",
    ].join("\n"),
  },
};

const els = {
  importMailboxBtn: document.querySelector("#importMailboxBtn"),
  tabMailBtn: document.querySelector("#tabMailBtn"),
  tabImportBtn: document.querySelector("#tabImportBtn"),
  tabLogsBtn: document.querySelector("#tabLogsBtn"),
  importModal: document.querySelector("#importModal"),
  importModalEyebrow: document.querySelector("#importModalEyebrow"),
  importModalTitle: document.querySelector("#importModalTitle"),
  importServiceSelect: document.querySelector("#importServiceSelect"),
  importFormatHint: document.querySelector("#importFormatHint"),
  importTempApiField: document.querySelector("#importTempApiField"),
  importTempApi: document.querySelector("#importTempApi"),
  importTempSitePasswordField: document.querySelector("#importTempSitePasswordField"),
  importTempSitePassword: document.querySelector("#importTempSitePassword"),
  importFile: document.querySelector("#importFile"),
  importText: document.querySelector("#importText"),
  importPreview: document.querySelector("#importPreview"),
  closeImportModal: document.querySelector("#closeImportModal"),
  cancelImportBtn: document.querySelector("#cancelImportBtn"),
  confirmImportBtn: document.querySelector("#confirmImportBtn"),
  tempCount: document.querySelector("#tempCount"),
  msCount: document.querySelector("#msCount"),
  genericCount: document.querySelector("#genericCount"),
  mailboxTotal: document.querySelector("#mailboxTotal"),
  mailboxSourceFilter: document.querySelector("#mailboxSourceFilter"),
  mailboxControlsToggle: document.querySelector("#mailboxControlsToggle"),
  mailboxControlsToggleText: document.querySelector("#mailboxControlsToggleText"),
  mailboxControlsBody: document.querySelector("#mailboxControlsBody"),
  addCategoryBtn: document.querySelector("#addCategoryBtn"),
  groupByImportDateBtn: document.querySelector("#groupByImportDateBtn"),
  enqueueSelectedRefreshBtn: document.querySelector("#enqueueSelectedRefreshBtn"),
  deleteCategoryBtn: document.querySelector("#deleteCategoryBtn"),
  clearLocalBtn: document.querySelector("#clearLocalBtn"),
  backupLocalBtn: document.querySelector("#backupLocalBtn"),
  restoreLocalFile: document.querySelector("#restoreLocalFile"),
  mailboxCategoryFilter: document.querySelector("#mailboxCategoryFilter"),
  mailboxSearch: document.querySelector("#mailboxSearch"),
  mailboxList: document.querySelector("#mailboxList"),
  usageBadge: document.querySelector("#usageBadge"),
  usageCount: document.querySelector("#usageCount"),
  mailboxPageSize: document.querySelector("#mailboxPageSize"),
  mailboxPrevPage: document.querySelector("#mailboxPrevPage"),
  mailboxNextPage: document.querySelector("#mailboxNextPage"),
  mailboxPageText: document.querySelector("#mailboxPageText"),
  selectAllBtn: document.querySelector("#selectAllBtn"),
  queryInput: document.querySelector("#queryInput"),
  senderInput: document.querySelector("#senderInput"),
  sourceFilter: document.querySelector("#sourceFilter"),
  providerFilter: document.querySelector("#providerFilter"),
  typeFilter: document.querySelector("#typeFilter"),
  categoryFilter: document.querySelector("#categoryFilter"),
  syncBtn: document.querySelector("#syncBtn"),
  mailProgress: document.querySelector("#mailProgress"),
  mailSearchStrip: document.querySelector("#mailSearchStrip"),
  mailStatusRow: document.querySelector("#mailStatusRow"),
  statusText: document.querySelector("#statusText"),
  pageSummary: document.querySelector("#pageSummary"),
  clientLogPanel: document.querySelector("#clientLogPanel"),
  clientLogList: document.querySelector("#clientLogList"),
  clearClientLogsBtn: document.querySelector("#clearClientLogsBtn"),
  pageSize: document.querySelector("#pageSize"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  pageText: document.querySelector("#pageText"),
  deleteFilteredBtn: document.querySelector("#deleteFilteredBtn"),
  mailList: document.querySelector("#mailList"),
  mailWorkspace: document.querySelector("#mailWorkspace"),
  mailDetail: document.querySelector("#mailDetail"),
  copyCodeBtn: document.querySelector("#copyCodeBtn"),
  deleteMessageBtn: document.querySelector("#deleteMessageBtn"),
  groupModal: document.querySelector("#groupModal"),
  groupModalInput: document.querySelector("#groupModalInput"),
  closeGroupModal: document.querySelector("#closeGroupModal"),
  cancelGroupModal: document.querySelector("#cancelGroupModal"),
  confirmGroupModal: document.querySelector("#confirmGroupModal"),
  toast: document.querySelector("#toast"),
};

const base = window.GAM?.base;
const scheduler = window.GAM?.scheduler;
const refreshQueueModel = window.GAM?.refreshQueueModel;
const authQueryToken = base?.persistAdminTokenFromQuery?.() || new URLSearchParams(window.location.search).get("token") || "";
if (!base && authQueryToken) {
  localStorage.setItem("ctgptm.admin.toolToken", authQueryToken);
}

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

localStorage.removeItem(STORAGE_KEYS.messages);
migrateLegacyStorageKeys(["accounts", "categories", "ignoredMessages", "refreshQueue", "abnormalRows", "mailboxControlsCollapsed"]);
repairLocalStorageKeys(Object.values(STORAGE_KEYS).filter((key) => key !== STORAGE_KEYS.messages));

const storedAccounts = loadJson(STORAGE_KEYS.accounts, []);
const normalizedAccounts = normalizeStoredAccounts(storedAccounts);
if (JSON.stringify(storedAccounts) !== JSON.stringify(normalizedAccounts)) {
  saveJson(STORAGE_KEYS.accounts, normalizedAccounts);
}

const state = {
  accounts: normalizedAccounts,
  categories: normalizeStoredCategories(loadJson(STORAGE_KEYS.categories, [])),
  messages: [],
  messageTotal: 0,
  hiddenMessageCount: 0,
  messagesLoading: false,
  ignoredMessageKeys: new Set(loadJson(STORAGE_KEYS.ignoredMessages, [])),
  abnormalRows: normalizeStoredAbnormalRows(loadJson(STORAGE_KEYS.abnormalRows, [])),
  selectedAbnormal: new Set(),
  selected: new Set(),
  activeMessageKey: "",
  activeMailboxId: "",
  activeMailboxEmail: "",
  activeImportSource: "",
  mailboxSourceFilter: "all",
  activeView: "mail",
  loginJobs: new Map(),
  loginPoller: undefined,
  loginPollInFlight: false,
  page: 1,
  mailboxPage: 1,
  lastFetchMessageCount: 0,
  mailboxControlsCollapsed: loadJson(STORAGE_KEYS.mailboxControlsCollapsed, true) !== false,
  mailboxSyncRequestId: 0,
  filteredAccountsCacheKey: "",
  filteredAccountsCacheRows: [],
};
const pendingSaveTimers = new Map();
const saveScheduler = base?.createPendingSaveScheduler?.((key, value) => saveJson(key, value)) || null;
let mailboxWorkspace = null;
let mailboxAccountModel = null;
let mailboxImportHelper = null;
let mailboxImportUiHelper = null;
let mailboxMessageView = null;
let refreshQueueHelper = null;

const cpaSettings = loadJson(STORAGE_KEYS.cpaSettings, {});
const tempSettings = loadJson(STORAGE_KEYS.tempSettings, {});
if (els.cpaBaseUrl) els.cpaBaseUrl.value = cpaSettings.base_url || "";
if (els.cpaKey) els.cpaKey.value = cpaSettings.management_key || "";
if (els.cpaLimit) els.cpaLimit.value = cpaSettings.max_items || "50";
els.importTempApi.value = normalizeTempWorkerUrl(tempSettings.base_url || DEFAULT_TEMP_WORKER_URL);
els.importTempSitePassword.value = tempSettings.site_password || "";
if (tempSettings.base_url && tempSettings.base_url !== els.importTempApi.value) {
  saveJson(STORAGE_KEYS.tempSettings, {
    ...tempSettings,
    base_url: els.importTempApi.value,
  });
}

mailboxAccountModel = window.GAM?.mailboxAccountModel?.createMailboxAccountModel?.({
  defaultTempWorkerUrl: DEFAULT_TEMP_WORKER_URL,
  legacyTempWorkerUrls: [...LEGACY_TEMP_WORKER_URLS],
  importDateCategoryPattern: IMPORT_DATE_CATEGORY_PATTERN,
  reservedCategoryNames: [...RESERVED_CATEGORY_NAMES],
  legacyCategoryNames: [...LEGACY_CATEGORY_NAMES],
  legacySeededCategories: [...LEGACY_SEEDED_CATEGORIES],
  serviceLabels: {
    microsoft: "Outlook",
    temp: "临时邮箱",
    generic: "其他邮箱",
  },
  treatDefaultCategoryAsEmpty: true,
  onEnsureCategory: (category) => ensureCategory(category),
});

mailboxImportHelper = window.GAM?.mailboxImport?.createMailboxImportHelper?.({
  serviceMap: MAIL_SERVICES,
  normalizeStoredAccount: (account) => normalizeStoredAccount(account),
  normalizeTempWorkerUrl: (value) => normalizeTempWorkerUrl(value),
  normalizeGenericMode: (value) => normalizeGenericMode(value),
  isGenericApiMode: (value) => isGenericApiMode(value),
  looksLikeJwt: (value) => looksLikeJwt(value),
  looksLikeMicrosoftClientId: (value) => looksLikeMicrosoftClientId(value),
  looksLikeMicrosoftRefreshToken: (value) => looksLikeMicrosoftRefreshToken(value),
  serviceForParsedParts: (parts, source) => serviceForParsedParts(parts, source),
  allowSingleStructuredObject: true,
  allowJsonLines: true,
  flexibleTempFields: true,
});

mailboxImportUiHelper = window.GAM?.mailboxImportUi?.createMailboxImportUiHelper?.({
  parseLines: (text, source) => parseLines(text, source),
  sourceMeta: Object.fromEntries(Object.entries(MAIL_SERVICES).map(([key, service]) => [key, {
    placeholder: service.placeholder || "",
    tempMode: service.source === "temp",
  }])),
});

mailboxMessageView = window.GAM?.mailboxMessageView?.createMailboxMessageView?.({
  typeLabels: TYPE_LABELS,
  emptyCategoryLabel: EMPTY_CATEGORY_LABEL,
  escapeHtml,
});

refreshQueueHelper = refreshQueueModel?.createRefreshQueueModel?.({
  serviceLabels: {
    microsoft: "Outlook",
    generic: "其他邮箱",
    temp: "临时邮箱",
    local: "本地邮箱",
  },
  resolveAccount: (row) => accountForRow(row),
  cpaBaseUrl: () => els.cpaBaseUrl?.value.trim() || "",
  cpaManagementKey: () => els.cpaKey?.value || "",
});

localStorage.removeItem("ctgptm.mail.tempWorkerUrl");

function loadJson(key, fallback) {
  if (base?.loadJson) {
    return base.loadJson(key, fallback, { repair: repairStoredJson });
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? repairStoredJson(JSON.parse(raw)) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  if (key === STORAGE_KEYS.messages) {
    localStorage.removeItem(key);
    return false;
  }
  if (base?.saveJson) {
    return base.saveJson(key, value, {
      onQuotaExceeded() {
        console.warn("localStorage quota exceeded; skipped", key);
      },
    });
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (/quota|exceeded/i.test(String(error?.name || error?.message || ""))) {
      console.warn("localStorage quota exceeded; skipped", key);
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

function applyMailboxControlsState() {
  const collapsed = Boolean(state.mailboxControlsCollapsed);
  document.body.classList.toggle("mailbox-controls-collapsed", collapsed);
  if (els.mailboxControlsBody) els.mailboxControlsBody.hidden = collapsed;
  if (els.mailboxControlsToggle) els.mailboxControlsToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  if (els.mailboxControlsToggleText) els.mailboxControlsToggleText.textContent = collapsed ? "展开" : "收起";
  if (els.enqueueSelectedRefreshBtn) {
    els.enqueueSelectedRefreshBtn.disabled = !selectedVisibleMailboxAccounts().length;
  }
}

function toggleMailboxControls(forceCollapsed) {
  const next = typeof forceCollapsed === "boolean" ? forceCollapsed : !state.mailboxControlsCollapsed;
  state.mailboxControlsCollapsed = next;
  saveJson(STORAGE_KEYS.mailboxControlsCollapsed, next);
  applyMailboxControlsState();
}

function getWorkspaceId() {
  return workspaceId;
}

function repairMojibakeText(value) {
  if (base?.repairMojibakeText) {
    return base.repairMojibakeText(value, MOJIBAKE_TEXT_FIXES);
  }
  if (typeof value !== "string" || !value) return value;
  let text = value;
  MOJIBAKE_TEXT_FIXES.forEach((fixed, broken) => {
    text = text.split(broken).join(fixed);
  });
  return text;
}

function repairStoredJson(value) {
  if (base?.repairStoredJson) {
    return base.repairStoredJson(value, MOJIBAKE_TEXT_FIXES);
  }
  if (typeof value === "string") return repairMojibakeText(value);
  if (Array.isArray(value)) return value.map((item) => repairStoredJson(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairStoredJson(item)]));
  }
  return value;
}

function repairLocalStorageKeys(keys) {
  if (base?.repairLocalStorageKeys) {
    base.repairLocalStorageKeys(keys, { fixes: MOJIBAKE_TEXT_FIXES });
    return;
  }
  keys.forEach((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const repaired = repairStoredJson(parsed);
      if (JSON.stringify(parsed) !== JSON.stringify(repaired)) {
        localStorage.setItem(key, JSON.stringify(repaired));
      }
    } catch {
      const repaired = repairMojibakeText(raw);
      if (repaired !== raw) localStorage.setItem(key, repaired);
    }
  });
}

async function readJsonResponse(response, label) {
  if (base?.readJsonResponse) {
    return base.readJsonResponse(response, label, {
      snippetLimit: 220,
      onParseError({ response: parseResponse, snippet }) {
        if (parseResponse.status === 504 || /cloudflare|gateway timeout|<\/html>/i.test(snippet)) {
          return new Error(`${label} 网关超时：这一批邮箱取信时间过长，已跳过该批并继续处理后续邮箱。`);
        }
        return `${label} returned non-JSON (${parseResponse.status}): ${snippet}`;
      },
    });
  }
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const snippet = text.replace(/\s+/g, " ").slice(0, 220);
    if (response.status === 504 || /cloudflare|gateway timeout|<\/html>/i.test(snippet)) {
      throw new Error(`${label} 网关超时：这一批邮箱取信时间过长，已跳过该批并继续处理后续邮箱。`);
    }
    throw new Error(`${label} returned non-JSON (${response.status}): ${snippet}`);
  }
}

async function fetchJsonWithTimeout(url, options = {}, label = "请求失败", timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "AbortError")), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const data = await readJsonResponse(response, label);
    return { response, data };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${label} 超时`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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

function hasAdminToken() {
  return Boolean(rememberedAdminToken());
}

async function loadUsageBadge() {
  if (!els.usageCount) return;
  try {
    const response = await fetch("/client-api/public-stats", {
      cache: "no-store",
    });
    const data = await readJsonResponse(response, "读取使用人数失败");
    const count = Number(data?.usage?.workspace_active_24h ?? 0);
    els.usageCount.textContent = Number.isFinite(count) ? String(count) : "--";
    if (els.usageBadge && data?.usage?.latest_workspace_activity) {
      els.usageBadge.title = `最近 24 小时活跃工作区：${count}\n最近活动：${data.usage.latest_workspace_activity}`;
    }
  } catch {
    els.usageCount.textContent = "--";
  }
}

function accountHasMaskedCredential(account) {
  if (!account) return false;
  if (account.source === "microsoft") {
    return isMaskedSecret(account.refresh_token) || isMaskedSecret(account.client_id);
  }
  if (account.source === "generic") {
    return isMaskedSecret(account.password);
  }
  return isMaskedSecret(account.jwt) || isMaskedSecret(account.site_password);
}

function hasUsableLocalCredential(account) {
  if (!account) return false;
  if (account.source === "microsoft") {
    return Boolean(account.email && account.client_id && account.refresh_token
      && !isMaskedSecret(account.client_id) && !isMaskedSecret(account.refresh_token));
  }
  if (account.source === "generic") {
    return Boolean(account.email && account.password && !isMaskedSecret(account.password));
  }
  return Boolean(account.email && account.jwt && !isMaskedSecret(account.jwt)
    && !isMaskedSecret(account.site_password));
}

function accountIdsForPayload(payload) {
  return new Set([
    ...(payload.accounts || []).map((item) => `microsoft:${String(item.email || "").toLowerCase()}`),
    ...(payload.temp_addresses || []).map((item) => `temp:${String(item.email || "").toLowerCase()}`),
    ...(payload.generic_accounts || []).map((item) => `generic:${String(item.email || "").toLowerCase()}`),
  ]);
}

function selectedAccountsForPayload(payload) {
  const accountIds = accountIdsForPayload(payload);
  return state.accounts.filter((account) => accountIds.has(account.id));
}

function hasUsableLocalCredentialsForPayload(payload) {
  return selectedAccountsForPayload(payload).some(hasUsableLocalCredential);
}

function normalizeProviderValue(value) {
  const provider = String(value || "auto").toLowerCase();
  return ["auto", "graph", "imap"].includes(provider) ? provider : "auto";
}

const MAIL_SYNC_POLL_INTERVAL_MS = 1200;
const MAIL_SYNC_POLL_BASE_TIMEOUT_MS = 180000;
const MAIL_SYNC_POLL_PER_MAILBOX_MS = 12000;
const MAIL_SYNC_POLL_MAX_TIMEOUT_MS = 1800000;

if (els.providerFilter) {
  els.providerFilter.value = normalizeProviderValue(els.providerFilter.value);
}

function clientPayloadForSync(payload) {
  return {
    ...payload,
    accounts: (payload.accounts || []).filter((account) =>
      account.email && account.client_id && account.refresh_token
      && !isMaskedSecret(account.client_id) && !isMaskedSecret(account.refresh_token)
    ),
    temp_addresses: (payload.temp_addresses || []).filter((address) =>
      address.email && address.jwt
      && !isMaskedSecret(address.jwt) && !isMaskedSecret(address.site_password)
    ),
    generic_accounts: (payload.generic_accounts || []).filter((account) =>
      account.email && account.password && !isMaskedSecret(account.password)
    ),
  };
}

function payloadHasMaskedCredentials(payload) {
  return (payload.accounts || []).some((account) =>
    isMaskedSecret(account.refresh_token) || isMaskedSecret(account.client_id)
  ) || (payload.temp_addresses || []).some((address) =>
    isMaskedSecret(address.jwt) || isMaskedSecret(address.site_password)
  ) || (payload.generic_accounts || []).some((account) =>
    isMaskedSecret(account.password)
  );
}

function localCredentialHint() {
  return "当前浏览器没有可直接收信的邮箱凭证。请在这里导入自己的邮箱/JWT；数据只保存在当前浏览器本地。";
}

function humanizeMailError(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hostMatch = raw.match(/DNS lookup failed for ([^.:，。\s]+)|无法解析\s*([^，。:\s]+)|DNS\s*解析失败[:：]\s*([^，。:\s]+)/i);
  if (hostMatch) {
    const host = hostMatch[1] || hostMatch[2] || hostMatch[3] || "目标域名";
    return `服务端无法解析 ${host}。请先打开自检页确认 DNS；如果自检正常，请重新刷新或检查 API 地址。`;
  }
  if (/Temporary failure in name resolution|Name or service not known|getaddrinfo failed/i.test(raw)) {
    return "服务端 DNS 暂时失败。请先打开自检页确认网络；如果自检正常，请重新刷新。";
  }
  if (/Invalid address credential/i.test(raw)) {
    return "临时邮箱 JWT/地址凭证无效。请确认导入的是这个邮箱对应的 JWT，不是站点管理密码或其它 token。";
  }
  if (/Unauthorized|401/i.test(raw)) {
    return "临时邮箱 API 拒绝访问。通常是 JWT 错误、JWT 过期，或没有导入对应邮箱的 JWT。";
  }
  if (/AADSTS9002313|malformed or invalid|invalid_request/i.test(raw)) {
    return "Outlook 凭证格式不对。请确认导入的是 Outlook 四段格式：邮箱----密码----client_id----refresh_token。";
  }
  if (/client does not exist|not enabled for consumers|invalid_client/i.test(raw)) {
    return "Outlook client_id 和 refresh_token 不匹配，或这个 client_id 不支持个人微软邮箱。请换同一套生成出的 client_id/refresh_token。";
  }
  if (/invalid_grant|expired|revoked/i.test(raw)) {
    return "Outlook refresh_token 已过期或被撤销。需要重新生成并导入新的 Outlook 凭证。";
  }
  if (/Graph token failed/i.test(raw)) return raw.replace("Graph token failed:", "Graph 获取令牌失败：");
  if (/IMAP token failed/i.test(raw)) return raw.replace("IMAP token failed:", "IMAP 获取令牌失败：");
  if (/Temp address requires/i.test(raw)) return "临时邮箱缺少 API 地址或 JWT。";
  if (/网关超时|gateway timeout|non-JSON \(504\)|mail fetch timeout|取信超时/i.test(raw)) {
    return "邮箱取信超时。已跳过受影响邮箱/批次，不影响其它邮箱继续刷新。";
  }
  return raw;
}

const MAIL_ERROR_LABELS = {
  dns_failed: "DNS 解析失败",
  temp_invalid_credential: "临时邮箱 JWT 无效",
  temp_config_missing: "临时邮箱配置缺失",
  temp_api_http_error: "临时邮箱 API 异常",
  generic_config_missing: "其他邮箱配置缺失",
  generic_auth_failed: "其他邮箱认证失败",
  generic_imap_failed: "其他邮箱 IMAP 失败",
  generic_pop3_failed: "其他邮箱 POP3 失败",
  generic_api_failed: "其他邮箱 API 失败",
  outlook_credential_format: "Outlook 凭证格式错误",
  outlook_client_mismatch: "Outlook client_id 不匹配",
  outlook_refresh_expired: "Outlook RT 过期",
  graph_token_failed: "Graph 授权失败",
  imap_token_failed: "IMAP 授权失败",
  graph_fetch_failed: "Graph 收信失败",
  imap_fetch_failed: "IMAP 收信失败",
  network_tls_eof: "网络连接被截断",
  network_failed: "网络请求失败",
  mail_fetch_timeout: "单个邮箱取信超时",
  batch_request_failed: "本批请求失败",
  mail_fetch_failed: "收信失败",
};

function sourceForResult(result) {
  const source = String(result?.source || "").toLowerCase();
  if (source === "temp") return "temp";
  if (source === "microsoft") return "microsoft";
  if (source === "generic") return "generic";
  const provider = String(result?.provider || "").toLowerCase();
  if (provider.includes("temp") || provider.includes("cf")) return "temp";
  if (provider.includes("imap") || provider.includes("pop3") || provider.includes("cloudmail") || provider.includes("luckmail") || provider.includes("inbucket")) return "generic";
  return "";
}

function statusClass(status) {
  if (status === "ok" || status === "success") return "success";
  if (status === "error" || status === "failed") return "failed";
  if (status === "needs-code") return "needs-code";
  if (status === "running") return "running";
  return "idle";
}

function statusLabel(account) {
  const status = String(account?.last_status || "idle");
  if (status === "ok" || status === "success") return "已同步";
  if (status === "error" || status === "failed") return account?.last_error_label || MAIL_ERROR_LABELS[account?.last_error_code] || "失败";
  return "未检查";
}

function normalizeFetchDiagnostic(result) {
  const rawError = (result?.errors || []).filter(Boolean).join("；") || result?.error || "";
  const errorCode = String(result?.error_code || "").trim();
  const errorLabel = String(result?.error_label || MAIL_ERROR_LABELS[errorCode] || "").trim();
  const errorHint = String(result?.error_hint || "").trim();
  const ok = Boolean(result?.ok);
  return {
    source: sourceForResult(result),
    email: String(result?.email || "").toLowerCase(),
    last_status: ok ? "ok" : "error",
    last_check_at: result?.checked_at || new Date().toISOString(),
    last_message_count: Number(result?.message_count ?? (result?.messages || []).length ?? 0),
    last_error: ok ? "" : humanizeMailError(rawError || result?.error_label || "收信失败"),
    last_error_code: ok ? "" : errorCode,
    last_error_label: ok ? "" : (errorLabel || "收信失败"),
    last_error_hint: ok ? "" : (errorHint || humanizeMailError(rawError)),
  };
}

function applyFetchDiagnostics(results) {
  if (!Array.isArray(results) || !results.length) return { ok: 0, failed: 0 };
  let changed = false;
  let ok = 0;
  let failed = 0;
  results.forEach((result) => {
    const diagnostic = normalizeFetchDiagnostic(result);
    if (!diagnostic.email) return;
    if (diagnostic.last_status === "ok") ok += 1;
    else failed += 1;
    const account = state.accounts.find((item) => {
      const sameEmail = String(item.email || "").toLowerCase() === diagnostic.email;
      return sameEmail && (!diagnostic.source || item.source === diagnostic.source);
    });
    if (!account) return;
    Object.assign(account, diagnostic);
    changed = true;
  });
  if (changed) scheduleSaveJson(STORAGE_KEYS.accounts, state.accounts);
  return { ok, failed };
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeTempWorkerUrl(value) {
  return mailboxAccountModel.normalizeTempWorkerUrl(value);
}

function isMaskedSecret(value) {
  return mailboxAccountModel.isMaskedSecret(value);
}

function preferRealSecret(nextValue, currentValue) {
  return mailboxAccountModel.preferRealSecret(nextValue, currentValue);
}

function normalizeStoredCategories(value) {
  return mailboxAccountModel.normalizeStoredCategories(value);
}

function isImportDateCategory(value) {
  return mailboxAccountModel.isImportDateCategory(value);
}

function isAllowedCategory(value) {
  return mailboxAccountModel.isAllowedCategory(value);
}

function sortableTime(value) {
  const time = new Date(String(value || "").replace(" ", "T")).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortAccounts(accounts) {
  return mailboxAccountModel.sortAccounts(accounts);
}

function applyImportBatch(rows, importedAt = new Date().toISOString()) {
  return mailboxAccountModel.applyImportBatch(rows, importedAt);
}

function looksLikeJwt(value) {
  return mailboxAccountModel.looksLikeJwt(value);
}

function looksLikeMicrosoftClientId(value) {
  return mailboxAccountModel.looksLikeMicrosoftClientId(value);
}

function looksLikeMicrosoftRefreshToken(value) {
  return mailboxAccountModel.looksLikeMicrosoftRefreshToken(value);
}

function normalizeGenericMode(value) {
  return mailboxAccountModel.normalizeGenericMode(value);
}

function isGenericApiMode(value) {
  return mailboxAccountModel.isGenericApiMode(value);
}

function genericAccountPayload(account) {
  return mailboxAccountModel.genericAccountPayload(account);
}

function normalizeStoredAccount(account) {
  return mailboxAccountModel.normalizeStoredAccount(account);
}

function normalizeStoredAccounts(value) {
  return mailboxAccountModel.normalizeStoredAccounts(value);
}

function normalizeStoredMessages(value) {
  if (mailboxMessageView?.normalizeStoredMessages) return mailboxMessageView.normalizeStoredMessages(value);
  if (!Array.isArray(value)) return [];
  return value.map((message) => ({
    ...message,
    category: message.category === "默认" ? "" : (message.category || ""),
    mail_type: normalizeMailType(message.mail_type, message),
  }));
}

function normalizeMailType(value, message = null) {
  if (mailboxMessageView?.normalizeMailType) return mailboxMessageView.normalizeMailType(value, message);
  const text = String(value || "").trim().toLowerCase();
  const haystack = [
    text,
    message?.mail_type_label,
    message?.subject,
    message?.preview,
    message?.body,
  ].map((item) => String(item || "").toLowerCase()).join(" ");
  if (/\baccess\s+deactivated\b|\baccount\s+(deactivated|disabled|banned|suspended)\b|deleted\s+or\s+deactivated|封禁|停用|禁用/.test(haystack)) {
    return "banned";
  }
  if (
    /\bverification\b|\bverify\b|\botp\b|\bcode\b|验证码|安全代码|認証コード|認証番号|検証コード|確認コード|ワンタイム|一時ログインコード/.test(haystack)
    && /\d{4,8}/.test(haystack)
  ) {
    return "verification";
  }
  if (/\binvite\b|\binvitation\b|\bjoin\b|\bteam\b|邀请/.test(haystack)) {
    return "invite";
  }
  if (/\bsecurity\b|\balert\b|\bsign-in\b|\blogin\b|\bunusual\b|安全|登录|multi-factor|mfa/.test(haystack)) {
    return "security";
  }
  if (/\bimages?\b|\breimagine\b|\bplus\s+plan\b|\bstart\s+creating\b|\blaunch\b|\bpromo\b|\bpromotion\b|\bnewsletter\b|\bdigest\b|\bupdate\b|\bintroducing\b|推广|订阅|最新动态/.test(haystack)) {
    return "promotion";
  }
  if (text === "reset") return "security";
  if (text === "billing" || text === "newsletter") return "promotion";
  return ["verification", "invite", "security", "promotion", "banned", "other"].includes(text) ? text : "other";
}

function normalizeStoredAbnormalRows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => row && typeof row === "object")
    .map((row) => ({
      ...row,
      id: String(row.id || row.email || row.name || crypto.randomUUID()),
      email: String(row.email || ""),
      name: String(row.name || row.email || ""),
      source_kind: row.source_kind || "local",
      status: row.status || "idle",
      error: row.error || "",
      logs: Array.isArray(row.logs) ? row.logs : [],
    }));
}

function saveAbnormalRows() {
  saveJson(STORAGE_KEYS.abnormalRows, state.abnormalRows);
}

function saveCpaSettings() {
  if (!els.cpaBaseUrl || !els.cpaKey || !els.cpaLimit) return;
  saveJson(STORAGE_KEYS.cpaSettings, {
    base_url: els.cpaBaseUrl?.value.trim() || "",
    management_key: els.cpaKey?.value || "",
    max_items: els.cpaLimit?.value || "50",
  });
}

function saveTempSettings() {
  saveJson(STORAGE_KEYS.tempSettings, {
    base_url: normalizeTempWorkerUrl(els.importTempApi.value),
    site_password: els.importTempSitePassword.value.trim(),
  });
}

function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add("show");
  clearTimeout(els.toast._timer);
  els.toast._timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function setInlineProgress(el, percent, label = "") {
  if (!el) return;
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  el.hidden = value <= 0 || value >= 100 && label === "";
  const bar = el.querySelector("i");
  const text = el.querySelector("em");
  if (bar) bar.style.width = `${value}%`;
  if (text) text.textContent = label || `${value}%`;
}

function hideInlineProgress(el) {
  if (!el) return;
  setInlineProgress(el, 0, "");
  el.hidden = true;
}

function serviceInfo(source) {
  return Object.values(MAIL_SERVICES).find((service) => service.source === source)?.label || source || "-";
}

function accountCategoryOptionsBase(active, categories, emptyLabel) {
  const selected = active || "";
  return ["", ...categories].map((category) =>
    `<option value="${escapeHtml(category)}"${category === selected ? " selected" : ""}>${escapeHtml(category || emptyLabel)}</option>`
  ).join("");
}

function serviceTone(account) {
  if (account.source === "microsoft") return "ms";
  if (account.source === "generic") return "generic";
  return "temp";
}

function serviceForParsedParts(parts, selectedSource) {
  const selected = MAIL_SERVICES[selectedSource] || MAIL_SERVICES.auto;
  if (selected.source !== "auto") return selected;
  const maybeClientId = String(parts[2] || "").trim();
  const maybeRefreshToken = String(parts[3] || "").trim();
  const looksMicrosoft = parts.length >= 4
    && !looksLikeUrl(maybeClientId)
    && !looksLikeJwt(parts[1] || "")
    && looksLikeMicrosoftClientId(maybeClientId)
    && looksLikeMicrosoftRefreshToken(maybeRefreshToken);
  if (looksMicrosoft) return MAIL_SERVICES.microsoft;
  return looksLikeJwt(parts[1] || "") ? MAIL_SERVICES.temp : MAIL_SERVICES.generic;
}

function addClientLog(message, type = "info") {
  if (els.clientLogList.firstElementChild?.textContent === "等待操作。") {
    els.clientLogList.innerHTML = "";
  }
  const row = document.createElement("div");
  row.className = `client-log-item ${type}`;
  row.innerHTML = `
    <span>${escapeHtml(new Date().toLocaleTimeString())}</span>
    <strong>${escapeHtml(type.toUpperCase())}</strong>
    <em>${escapeHtml(message)}</em>
  `;
  els.clientLogList.prepend(row);
  while (els.clientLogList.children.length > 260) {
    els.clientLogList.lastElementChild.remove();
  }
}

function normalizeServerMailbox(item, source) {
  const email = String(item?.email || "").trim();
  if (!email) return null;
  const status = item?.last_status || "idle";
  const category = String(item?.label || item?.category || "").trim();
  if (source === "generic") {
    return normalizeStoredAccount({
      id: `generic:${email.toLowerCase()}`,
      source: "generic",
      service: "其他邮箱",
      email,
      password: String(item?.password || item?.token || ""),
      username: String(item?.username || item?.user || ""),
      mode: String(item?.mode || item?.provider || "auto"),
      imap_host: String(item?.imap_host || item?.imapHost || item?.base_url || item?.baseUrl || ""),
      imap_port: Number(item?.imap_port || item?.imapPort || 993),
      pop3_host: String(item?.pop3_host || item?.pop3Host || ""),
      pop3_port: Number(item?.pop3_port || item?.pop3Port || 995),
      category,
      created_at: item?.created_at || "",
      updated_at: item?.updated_at || "",
      last_check_at: item?.last_check_at || "",
      last_status: status,
      last_error: item?.last_error || "",
      last_error_code: item?.last_error_code || "",
      last_error_label: item?.last_error_label || "",
      last_error_hint: item?.last_error_hint || "",
      last_message_count: Number(item?.last_message_count || 0),
      selected: true,
    });
  }
  if (source === "temp") {
    return {
      id: `temp:${email.toLowerCase()}`,
      source: "temp",
      service: "临时邮箱",
      email,
      jwt: String(item?.jwt || ""),
      base_url: normalizeTempWorkerUrl(item?.base_url || item?.baseUrl || ""),
      site_password: String(item?.site_password || item?.sitePassword || ""),
      category,
      created_at: item?.created_at || "",
      updated_at: item?.updated_at || "",
      last_check_at: item?.last_check_at || "",
      last_status: status,
      last_error: item?.last_error || "",
      last_error_code: item?.last_error_code || "",
      last_error_label: item?.last_error_label || "",
      last_error_hint: item?.last_error_hint || "",
      last_message_count: Number(item?.last_message_count || 0),
      selected: true,
    };
  }
  return {
    id: `microsoft:${email.toLowerCase()}`,
    source: "microsoft",
    service: "Outlook",
    email,
    password: String(item?.password || ""),
    client_id: String(item?.client_id || ""),
    refresh_token: String(item?.refresh_token || ""),
    category,
    created_at: item?.created_at || "",
    updated_at: item?.updated_at || "",
    last_check_at: item?.last_check_at || "",
    last_status: status,
    last_error: item?.last_error || "",
    last_error_code: item?.last_error_code || "",
    last_error_label: item?.last_error_label || "",
    last_error_hint: item?.last_error_hint || "",
    last_message_count: Number(item?.last_message_count || 0),
    selected: true,
  };
}

function mergeServerAccountsSnapshot(items) {
  return mailboxWorkspace.mergeServerAccountsSnapshot(items);
}

async function syncAccountsFromServer({ silent = false } = {}) {
  try {
    const previousActiveMailboxId = state.activeMailboxId;
    const previousActiveMailboxEmail = state.activeMailboxEmail;
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
    if (!accountsResponse.ok) {
      throw new Error(accountsData.error || accountsResponse.statusText || "服务端账号列表读取失败");
    }
    if (!tempResponse.ok) {
      throw new Error(tempData.error || tempResponse.statusText || "服务端临时邮箱列表读取失败");
    }
    if (!genericResponse.ok) {
      throw new Error(genericData.error || genericResponse.statusText || "服务端其他邮箱列表读取失败");
    }
    const normalized = [
      ...((accountsData.accounts || []).map((item) => normalizeServerMailbox(item, "microsoft")).filter(Boolean)),
      ...((tempData.addresses || []).map((item) => normalizeServerMailbox(item, "temp")).filter(Boolean)),
      ...((genericData.accounts || []).map((item) => normalizeServerMailbox(item, "generic")).filter(Boolean)),
    ];
    const summary = mergeServerAccountsSnapshot(normalized);
    syncActiveMailboxSelection();
    if (!silent) {
      addClientLog(`已从服务端同步 ${normalized.length} 个邮箱，新增 ${summary.imported}，更新 ${summary.updated}`, "success");
      toast(`已从云端同步 ${normalized.length} 个邮箱`);
    }
    const includeMessages = previousActiveMailboxId !== state.activeMailboxId
      || previousActiveMailboxEmail !== state.activeMailboxEmail;
    renderAll({ includeMessages });
    return true;
  } catch (error) {
    if (!silent) {
      addClientLog(`云端邮箱同步失败：${error.message || "未知错误"}`, "warning");
      toast(error.message || "云端邮箱同步失败");
    }
    return false;
  }
}

mailboxWorkspace = window.GAM?.mailboxWorkspace?.createMailboxWorkspace?.({
  state,
  els,
  constants: {
    SOURCE_FILTER_LABELS,
    EMPTY_CATEGORY_LABEL,
  },
  helpers: {
    escapeHtml,
    accountSourceGroup,
    statusClass,
    statusLabel,
    isAllowedCategory,
    saveJson,
    applyMailboxControlsState,
    loadServerMessages,
    sortAccounts,
    preferRealSecret,
    accountCategoryOptionsBase,
  },
  callbacks: {
    storageKeys: {
      accounts: STORAGE_KEYS.accounts,
      categories: STORAGE_KEYS.categories,
    },
    renderAll: (...args) => renderAll(...args),
  },
});

function setActiveView(view) {
  state.activeView = view;
  state.page = 1;
  state.mailboxPage = 1;
  els.clientLogPanel.hidden = view !== "logs";
  els.mailSearchStrip.hidden = view !== "mail";
  els.mailStatusRow.hidden = view !== "mail";
  els.mailWorkspace.hidden = view !== "mail";
  els.importMailboxBtn.textContent = "导入邮箱";
  els.mailboxSearch.placeholder = "搜索邮箱";
  document.querySelectorAll(".module-tab").forEach((item) => item.classList.remove("active"));
  if (view === "logs") {
    els.tabLogsBtn?.classList.add("active");
  } else {
    els.tabMailBtn.classList.add("active");
    els.tabMailBtn.setAttribute("aria-current", "page");
  }
  if (view !== "mail") els.tabMailBtn.removeAttribute("aria-current");
  renderAll();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlToPlainText(value) {
  if (mailboxMessageView?.htmlToPlainText) return mailboxMessageView.htmlToPlainText(value);
  const raw = String(value || "");
  if (!raw) return "";
  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(raw, "text/html");
      doc.querySelectorAll("script, style, noscript").forEach((node) => node.remove());
      const parts = [];
      const blockTags = new Set(["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "DD", "DIV", "DL", "DT", "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL"]);
      const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.replace(/\s+/g, " ").trim();
          if (text) parts.push(text);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (blockTags.has(node.tagName) && parts.length && parts[parts.length - 1] !== "\n") parts.push("\n");
        Array.from(node.childNodes).forEach(walk);
        if (blockTags.has(node.tagName) && parts.length && parts[parts.length - 1] !== "\n") parts.push("\n");
      };
      walk(doc.body);
      return parts.join(" ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
    } catch {
      // Fall through to the regex fallback for malformed HTML.
    }
  }
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizePlainMailBody(value) {
  if (mailboxMessageView?.normalizePlainMailBody) return mailboxMessageView.normalizePlainMailBody(value);
  const lines = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t\u3000]+$/g, ""));
  const compact = [];
  let previousBlank = false;
  lines.forEach((line) => {
    const clean = line.trim();
    if (!clean) {
      if (!previousBlank && compact.length) compact.push("");
      previousBlank = true;
      return;
    }
    compact.push(clean);
    previousBlank = false;
  });
  return compact.join("\n").trim();
}

function renderPlainMailBody(value) {
  if (mailboxMessageView?.renderPlainMailBody) return mailboxMessageView.renderPlainMailBody(value);
  const clean = normalizePlainMailBody(value);
  if (!clean) return '<p class="muted">这封邮件没有可展示的正文。</p>';
  return `<div class="mail-body-plain">${escapeHtml(clean).replace(/\n/g, "<br>")}</div>`;
}

function csvParts(line) {
  if (mailboxImportHelper?.csvParts) return mailboxImportHelper.csvParts(line);
  const parts = [];
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
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts;
}

function pickValue(item, keys) {
  if (mailboxImportHelper?.pickValue) return mailboxImportHelper.pickValue(item, keys);
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function structuredRowsFromObjects(items, source) {
  if (mailboxImportHelper?.structuredRowsFromObjects) {
    return mailboxImportHelper.structuredRowsFromObjects(items, source);
  }
  const service = MAIL_SERVICES[source] || MAIL_SERVICES.microsoft;
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
    const category = pickValue(item, ["category", "label", "group", "tag"]);
    const hasMicrosoft = pickValue(item, ["client_id", "clientId"]) || pickValue(item, ["refresh_token", "refreshToken"]);
    const hasTempJwt = looksLikeJwt(pickValue(item, ["jwt", "access_token", "credential"]));
    const rowSource = service.source === "auto"
      ? (hasMicrosoft ? "microsoft" : (hasTempJwt ? "temp" : "generic"))
      : service.source;
    const rowService = MAIL_SERVICES[rowSource] || MAIL_SERVICES.generic;
    if (rowService.source === "temp") {
      rows.push({
        id: `temp:${email.toLowerCase()}`,
        source: "temp",
        service: rowService.label,
        email,
        jwt: pickValue(item, ["jwt", "token", "access_token", "credential"]),
        base_url: normalizeTempWorkerUrl(pickValue(item, ["base_url", "baseUrl", "api", "api_url", "worker_url"])),
        site_password: pickValue(item, ["site_password", "sitePassword", "x-custom-auth", "custom_auth"]),
        category,
        selected: true,
      });
      return;
    }
    if (rowService.source === "generic") {
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
        selected: true,
      }));
      return;
    }
    rows.push({
      id: `microsoft:${email.toLowerCase()}`,
      source: "microsoft",
      service: rowService.label,
      email,
      password: pickValue(item, ["password", "pass"]),
      client_id: pickValue(item, ["client_id", "clientId"]),
      refresh_token: pickValue(item, ["refresh_token", "refreshToken"]),
      category,
      selected: true,
    });
  });
  return { rows, errors };
}

function parseStructuredText(text, source) {
  if (mailboxImportHelper?.parseStructuredText) return mailboxImportHelper.parseStructuredText(text, source);
  const clean = String(text || "").trim();
  if (!clean) return null;
  try {
    const parsed = JSON.parse(clean);
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.accounts) ? parsed.accounts
      : Array.isArray(parsed.addresses) ? parsed.addresses
      : Array.isArray(parsed.items) ? parsed.items
      : [parsed];
    return structuredRowsFromObjects(items, source);
  } catch {
    const objectLines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!objectLines.length || !objectLines.every((line) => line.startsWith("{") && line.endsWith("}"))) {
      return null;
    }
    const rows = [];
    const errors = [];
    objectLines.forEach((line, index) => {
      try {
        const parsed = JSON.parse(line);
        const result = structuredRowsFromObjects([parsed], source);
        rows.push(...result.rows);
        errors.push(...result.errors.map((message) => `第 ${index + 1} 行 ${message}`));
      } catch {
        errors.push(`第 ${index + 1} 行 JSON 解析失败`);
      }
    });
    return { rows, errors };
  }
}

function ensureCategory(name) {
  return mailboxWorkspace.ensureCategory(name);
}

function isBannedMessage(message) {
  const haystack = [
    message?.subject,
    message?.preview,
    message?.body,
    message?.mail_type_label,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return /\baccess\s+deactivated\b|\baccount\s+(deactivated|disabled|banned|suspended)\b|deleted\s+or\s+deactivated|账号.*(封禁|停用|禁用)|封禁|停用|禁用|\u704f\u4f7a\u7ee9|\u934b\u6ec5\u657c\u7528|\u7ec2\u4f7a\u657c\u7528/.test(haystack);
}

function mailTypeLabel(message) {
  const normalized = normalizeMailType(message?.mail_type, message);
  if (normalized === "banned" || message?.is_banned || isBannedMessage(message)) return "封禁";
  return TYPE_LABELS[normalized] || "其他";
}

function selectedMailTypeLabel() {
  const value = els.typeFilter?.value || "all";
  return value === "all" ? "" : (TYPE_LABELS[value] || value);
}

function markAccountBanned(email) {
  const normalizedEmail = String(email || "").toLowerCase();
  if (!normalizedEmail) return false;
  let changed = false;
  state.accounts.forEach((account) => {
    if (String(account.email || "").toLowerCase() === normalizedEmail && account.category !== "已封禁") {
      account.category = "已封禁";
      changed = true;
    }
  });
  if (changed) {
    ensureCategory("已封禁");
    invalidateFilteredAccountsCache();
    saveJson(STORAGE_KEYS.accounts, state.accounts);
    saveJson(STORAGE_KEYS.categories, state.categories);
  }
  return changed;
}

function applyBannedStateFromMessages() {
  let accountChanged = false;
  state.messages.forEach((message) => {
    if (!isBannedMessage(message)) return;
    if (!message.is_banned || message.category !== "已封禁") {
      message.is_banned = true;
      message.category = "已封禁";
    }
    accountChanged = markAccountBanned(message.account) || accountChanged;
  });
  if (accountChanged) {
    renderCategories();
    renderAccounts();
  }
}

function removeCategory(name) {
  return mailboxWorkspace.removeCategory(name);
}

function accountCategoryOptions(active) {
  return mailboxWorkspace.accountCategoryOptions(active);
}

function filterAccounts() {
  return mailboxWorkspace.filteredAccounts();
}

function filteredAccounts() {
  return mailboxWorkspace.filteredAccounts();
}

function renderCategories() {
  return mailboxWorkspace.renderCategories();
}

function renderAccounts() {
  return mailboxWorkspace.renderAccounts();
}

function mailKey(message) {
  if (mailboxMessageView?.mailKey) return mailboxMessageView.mailKey(message);
  return [
    message.source || "",
    message.account || "",
    message.folder || "",
    message.mid || "",
    message.subject || "",
    message.received_at || "",
  ].join("|");
}

function saveIgnoredMessages() {
  saveJson(STORAGE_KEYS.ignoredMessages, [...state.ignoredMessageKeys].slice(-1000));
}

function isIgnoredMessage(message) {
  return state.ignoredMessageKeys.has(mailKey(message));
}

function messageQueryParams() {
  const size = Math.max(1, Number(els.pageSize.value || 20));
  const params = new URLSearchParams({
    limit: String(size),
    offset: String(Math.max(0, state.page - 1) * size),
    query: els.queryInput.value.trim(),
    sender: els.senderInput.value.trim(),
    source: els.sourceFilter.value || "all",
    mail_type: els.typeFilter?.value || "all",
    category: els.categoryFilter.value || "all",
  });
  if (state.activeMailboxEmail) params.set("account", state.activeMailboxEmail);
  return params;
}

const latestMessagesRequest = scheduler?.createLatestOnlyRequest?.(async ({ payload, signal }) => {
  const response = await fetch(`/client-api/messages?${payload.params}`, {
    headers: apiHeaders(),
    cache: "no-store",
    signal,
  });
  const data = await readJsonResponse(response, "/client-api/messages");
  return { response, data };
});

async function fetchMessagesPage() {
  return fetchMessagesPageForParams(messageQueryParams().toString());
}

async function fetchMessagesPageForParams(params) {
  if (latestMessagesRequest) {
    const outcome = await latestMessagesRequest({ params });
    if (outcome?.ignored) return null;
    return outcome.result;
  }
  const response = await fetch(`/client-api/messages?${params}`, {
    headers: apiHeaders(),
    cache: "no-store",
  });
  const data = await readJsonResponse(response, "/client-api/messages");
  return { response, data };
}

function applyLoadedMessages(loaded) {
  const { response, data } = loaded;
  if (!response.ok || data.success === false) {
    throw new Error(data.error || response.statusText || "读取邮件缓存失败");
  }
  const normalized = normalizeStoredMessages(data.messages || []);
  state.hiddenMessageCount = normalized.filter((message) => isIgnoredMessage(message)).length;
  state.messages = normalized.filter((message) => !isIgnoredMessage(message));
  state.messageTotal = Number(data.count ?? state.messages.length);
  applyBannedStateFromMessages();
}

async function loadServerMessages({ silent = false } = {}) {
  const requestId = (state.messageRequestId || 0) + 1;
  state.messageRequestId = requestId;
  state.messagesLoading = true;
  if (!silent) renderMessages();
  try {
    let params = messageQueryParams().toString();
    let loaded = await fetchMessagesPageForParams(params);
    if (!loaded || requestId !== state.messageRequestId) return;
    applyLoadedMessages(loaded);
    const pages = Math.max(1, Math.ceil(state.messageTotal / Math.max(1, Number(els.pageSize.value || 20))));
    if (state.page > pages) {
      state.page = pages;
      params = messageQueryParams().toString();
      loaded = await fetchMessagesPageForParams(params);
      if (!loaded || requestId !== state.messageRequestId) return;
      applyLoadedMessages(loaded);
    }
  } catch (error) {
    if (requestId !== state.messageRequestId) return;
    if (!silent) {
      const message = error.message || "读取邮件缓存失败";
      addClientLog(`读取邮件缓存失败：${message}`, "error");
      toast(message);
    }
  } finally {
    if (requestId === state.messageRequestId) {
      state.messagesLoading = false;
      renderMessages();
    }
  }
}

function sortableDate(message) {
  const value = new Date(message.received_at || message.cached_at || 0).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function formatTime(value) {
  if (mailboxMessageView?.formatTime) return mailboxMessageView.formatTime(value);
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function importDateCategory(value) {
  if (!value) return "";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function iframeDocument(content) {
  if (mailboxMessageView?.iframeDocument) return mailboxMessageView.iframeDocument(content);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <base target="_blank">
  <style>
    html, body { margin: 0; padding: 0; background: #fff; color: #1f2933; font-family: Arial, sans-serif; }
    body { padding: 16px; overflow-wrap: anywhere; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    a { color: #0f766e; }
  </style>
</head>
<body>${content || ""}</body>
</html>`;
}

function renderMessages() {
  const messages = state.messages;
  const size = Number(els.pageSize.value || 20);
  const total = Number(state.messageTotal || messages.length || 0);
  const hiddenOnPage = Number(state.hiddenMessageCount || 0);
  const pages = Math.max(1, Math.ceil(total / size));
  state.page = Math.min(Math.max(1, state.page), pages);
  const pageItems = messages;

  const mailboxSuffix = state.activeMailboxEmail ? ` · ${state.activeMailboxEmail}` : "";
  const scope = resolvedMessageScope();
  els.pageSummary.textContent = state.messagesLoading
    ? "读取邮件缓存中"
    : `${total} 封匹配邮件${hiddenOnPage ? ` · 本页隐藏 ${hiddenOnPage} 封` : ""}${mailboxSuffix}`;
  els.pageText.textContent = `${state.page} / ${pages}`;
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= pages;
  if (els.deleteFilteredBtn) {
    const typeLabel = selectedMailTypeLabel();
    els.deleteFilteredBtn.disabled = !total;
    const scopeLabel = syncScopeLabel(scope);
    els.deleteFilteredBtn.textContent = total ? `删除${typeLabel || "邮件"} ${total} · ${scopeLabel}` : "批量删除";
  }

  if (!pageItems.length) {
    els.mailList.className = "mail-list empty";
    els.mailList.textContent = state.messagesLoading
      ? "正在读取邮件缓存..."
      : (total ? "没有匹配的邮件" : "导入邮箱后点击刷新邮件");
    renderDetail(null);
    return;
  }
  els.mailList.className = "mail-list";
  els.mailList.innerHTML = pageItems.map((message) => {
    const key = mailKey(message);
    return `
      <button class="mail-item${key === state.activeMessageKey ? " active" : ""}${message.is_banned ? " banned" : ""}" type="button" data-key="${escapeHtml(key)}">
        <span class="mail-item-top">
          <strong>${escapeHtml(message.subject || "(无主题)")}</strong>
          <span class="mail-item-actions">
            <em>${escapeHtml(mailTypeLabel(message))}</em>
            <span class="mail-delete-one" title="删除这封邮件" aria-label="删除这封邮件">×</span>
          </span>
        </span>
        <span class="mail-item-account">${escapeHtml(message.account || "-")}</span>
        <span class="mail-item-meta">${escapeHtml(message.sender || "-")} · ${escapeHtml(formatTime(message.received_at))}</span>
        <span class="mail-item-preview">${escapeHtml(message.preview || message.body || "")}</span>
      </button>
    `;
  }).join("");
  if (!pageItems.some((message) => mailKey(message) === state.activeMessageKey)) {
    state.activeMessageKey = mailKey(pageItems[0]);
  }
  renderDetail(state.messages.find((message) => mailKey(message) === state.activeMessageKey));
}

function renderDetail(message) {
  if (mailboxMessageView?.renderDetailHtml) {
    const detail = mailboxMessageView.renderDetailHtml(message);
    els.copyCodeBtn.disabled = detail.copyDisabled;
    els.deleteMessageBtn.disabled = detail.deleteDisabled;
    els.mailDetail.className = detail.className;
    if (!message) {
      els.mailDetail.textContent = detail.html;
      return;
    }
    els.mailDetail.innerHTML = detail.html;
    const frame = els.mailDetail.querySelector(".mail-html-frame");
    if (frame && detail.hasHtmlBody) {
      const resizeFrame = () => {
        try {
          const doc = frame.contentDocument;
          const available = Math.max(140, Math.min(420, window.innerHeight - frame.getBoundingClientRect().top - 110));
          const contentHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 0) + 18;
          frame.style.height = `${Math.min(available, Math.max(140, contentHeight))}px`;
        } catch {
          frame.style.height = "180px";
        }
      };
      frame.addEventListener("load", () => {
        resizeFrame();
        window.setTimeout(resizeFrame, 80);
        window.setTimeout(resizeFrame, 300);
      }, { once: true });
      frame.srcdoc = detail.frameSrcdoc;
      window.setTimeout(resizeFrame, 120);
    }
    return;
  }
  if (!message) {
    els.copyCodeBtn.disabled = true;
    els.deleteMessageBtn.disabled = true;
    els.mailDetail.className = "mail-detail empty";
    els.mailDetail.textContent = "从左侧邮件列表选择一封邮件。";
    return;
  }
  const codes = Array.isArray(message.codes) ? message.codes : [];
  els.copyCodeBtn.disabled = !codes.length;
  els.deleteMessageBtn.disabled = false;
  els.mailDetail.className = `mail-detail${message.is_banned ? " banned" : ""}`;
  const normalizedType = normalizeMailType(message.mail_type, message);
  const visibleCodes = codes.slice(0, 3);
  const hiddenCodeCount = Math.max(0, codes.length - visibleCodes.length);
  const codeBlock = codes.length
    ? `<div class="detail-codes">${visibleCodes.map((code) => `<span>${escapeHtml(code)}</span>`).join("")}${hiddenCodeCount ? `<span class="more">+${hiddenCodeCount}</span>` : ""}</div>`
    : `<p class="muted">这封邮件没有识别到验证码。</p>`;
  const plainBody = normalizePlainMailBody(message.body || message.preview || htmlToPlainText(message.html_body) || "");
  const hasHtmlBody = Boolean(message.html_body);
  const bodyBlock = hasHtmlBody
    ? `
      <iframe class="mail-html-frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" scrolling="auto"></iframe>
      ${plainBody ? `<details class="plain-fallback"><summary>纯文本备用</summary>${renderPlainMailBody(plainBody)}</details>` : ""}
    `
    : renderPlainMailBody(plainBody);
  els.mailDetail.innerHTML = `
    <h3>${escapeHtml(message.subject || "(无主题)")}</h3>
    <div class="detail-meta">
      <span>${escapeHtml(TYPE_LABELS[normalizedType] || "其他")}</span>
      <span>${escapeHtml(message.sender || "-")}</span>
      <span>${escapeHtml(message.account || "-")}</span>
      <span>${escapeHtml(formatTime(message.received_at))}</span>
      <span>${escapeHtml(message.category || EMPTY_CATEGORY_LABEL)}</span>
    </div>
    ${codeBlock}
    ${bodyBlock}
  `;
  const frame = els.mailDetail.querySelector(".mail-html-frame");
  if (frame && hasHtmlBody) {
    const resizeFrame = () => {
      try {
        const doc = frame.contentDocument;
        const available = Math.max(140, Math.min(420, window.innerHeight - frame.getBoundingClientRect().top - 110));
        const contentHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 0) + 18;
        frame.style.height = `${Math.min(available, Math.max(140, contentHeight))}px`;
      } catch {
        frame.style.height = "180px";
      }
    };
    frame.addEventListener("load", () => {
      resizeFrame();
      window.setTimeout(resizeFrame, 80);
      window.setTimeout(resizeFrame, 300);
    }, { once: true });
    frame.srcdoc = iframeDocument(message.html_body);
    window.setTimeout(resizeFrame, 120);
  }
}

function normalizeMessageScope(scope = resolvedMessageScope()) {
  if (Array.isArray(scope)) return { kind: "filtered", targets: scope };
  if (scope && Array.isArray(scope.targets)) return scope;
  return { kind: "filtered", targets: [] };
}

function payloadForSync(scope = resolvedMessageScope()) {
  const resolvedScope = normalizeMessageScope(scope);
  const targets = resolvedScope.targets;
  const source = els.sourceFilter.value;
  const includeTemp = source === "all" || source === "temp";
  const includeMicrosoft = source === "all" || source === "microsoft";
  const includeGeneric = source === "all" || source === "generic";
  return {
    source,
    emails: targets.map((account) => account.email).filter(Boolean),
    provider: els.providerFilter?.value || "auto",
    sender_filter: els.senderInput.value.trim(),
    limit: 20,
    temp_addresses: includeTemp ? targets
      .filter((account) => account.source === "temp")
      .map((account) => ({
        email: account.email,
        jwt: account.jwt,
        base_url: normalizeTempWorkerUrl(account.base_url || els.importTempApi.value || DEFAULT_TEMP_WORKER_URL),
        site_password: account.site_password,
        category: account.category,
      })) : [],
    accounts: includeMicrosoft ? targets
      .filter((account) => account.source === "microsoft")
      .map((account) => ({
        email: account.email,
        password: account.password,
        client_id: account.client_id,
        refresh_token: account.refresh_token,
        category: account.category,
      })) : [],
    generic_accounts: includeGeneric ? targets
      .filter((account) => account.source === "generic")
      .map(genericAccountPayload) : [],
  };
}

function syncTargetAccounts() {
  return resolvedMessageScope().targets;
}

function syncScopeLabel(scope = resolvedMessageScope()) {
  const resolvedScope = normalizeMessageScope(scope);
  const effectiveTargets = resolvedScope.targets;
  if (!effectiveTargets.length) return "当前筛选";
  if (resolvedScope.kind === "selected") return `勾选邮箱 ${effectiveTargets.length} 个`;
  if (resolvedScope.kind === "active") return `当前邮箱 ${effectiveTargets[0]?.email || ""}`;
  return `当前筛选 ${effectiveTargets.length} 个`;
}


function selectedVisibleMailboxAccounts(rows = filteredAccounts()) {
  return rows.filter((account) => state.selected.has(account.id));
}

function resolvedMessageScope(rows = filteredAccounts()) {
  const selected = selectedVisibleMailboxAccounts(rows);
  if (selected.length) return { kind: "selected", targets: selected };
  const active = rows.find((account) => account.id === state.activeMailboxId);
  if (active) return { kind: "active", targets: [active] };
  return { kind: "filtered", targets: rows };
}

function accountPayloadForMessage(message) {
  const source = message.source === "temp" ? "temp" : (message.source === "generic" ? "generic" : "microsoft");
  const account = state.accounts.find((item) =>
    item.source === source
    && item.email.toLowerCase() === String(message.account || "").toLowerCase()
  );
  if (!account) return { accounts: [], temp_addresses: [], generic_accounts: [] };
  if (account.source === "generic") {
    return {
      accounts: [],
      temp_addresses: [],
      generic_accounts: [genericAccountPayload(account)],
    };
  }
  if (account.source === "temp") {
    return {
      accounts: [],
      temp_addresses: [{
        email: account.email,
        jwt: account.jwt,
        base_url: normalizeTempWorkerUrl(account.base_url || els.importTempApi.value || DEFAULT_TEMP_WORKER_URL),
        site_password: account.site_password,
        category: account.category,
      }],
      generic_accounts: [],
    };
  }
  return {
    accounts: [{
      email: account.email,
      password: account.password,
      client_id: account.client_id,
      refresh_token: account.refresh_token,
      category: account.category,
    }],
    temp_addresses: [],
    generic_accounts: [],
  };
}

async function deleteActiveMessage() {
  const message = state.messages.find((item) => mailKey(item) === state.activeMessageKey);
  return deleteMessage(message);
}

async function deleteMessage(message) {
  if (!message) return;
  if (!confirm("确认删除这封邮件？只删除本工具本地缓存，不会删除远端真实邮箱；后续刷新也不会再显示这封。")) return;
  els.deleteMessageBtn.disabled = true;
  els.deleteMessageBtn.textContent = "删除中";
  try {
    const response = await fetch("/client-api/messages/delete", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ message }),
    });
    const data = await readJsonResponse(response, "/client-api/messages/delete");
    if (!response.ok || data.success === false) throw new Error(data.error || "删除邮件失败");
    state.ignoredMessageKeys.add(mailKey(message));
    saveIgnoredMessages();
    if (state.activeMessageKey === mailKey(message)) state.activeMessageKey = "";
    await loadServerMessages({ silent: true });
    addClientLog("已删除服务端邮件缓存，并加入忽略列表", "success");
    toast("已删除本地邮件");
  } catch (error) {
    addClientLog(`删除邮件失败：${error.message || "未知错误"}`, "error");
    toast(error.message || "删除失败");
  } finally {
    els.deleteMessageBtn.disabled = !state.activeMessageKey;
    els.deleteMessageBtn.textContent = "删除邮件";
  }
}

async function deleteFilteredMessages() {
  const total = Number(state.messageTotal || 0);
  if (!total) return;
  const scope = resolvedMessageScope();
  const selectedAccounts = scope.kind === "selected" ? scope.targets : [];
  const scopeLabel = syncScopeLabel(scope);
  const typeLabel = selectedMailTypeLabel();
  const typeScope = typeLabel ? `${typeLabel}类型的 ` : "";
  const scopeText = `${scopeLabel}内 ${typeScope}${total} 封邮件`;
  if (!confirm(`确认删除${scopeText}？只删除本工具本地缓存，不会删除远端真实邮箱；后续刷新也不会再显示这些邮件。`)) return;
  const filter = Object.fromEntries(messageQueryParams().entries());
  if (selectedAccounts.length) {
    filter.accounts = selectedAccounts.map((account) => account.email).filter(Boolean);
  }
  try {
    const response = await fetch("/client-api/messages/delete", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ filter }),
    });
    const data = await readJsonResponse(response, "/client-api/messages/delete");
    if (!response.ok || data.success === false) throw new Error(data.error || "批量删除邮件失败");
    state.activeMessageKey = "";
    state.page = 1;
    await loadServerMessages({ silent: true });
    const deleted = Number(data.deleted || 0);
    addClientLog(`已批量删除 ${deleted} 封服务端邮件缓存`, "success");
    toast(`已批量删除 ${deleted} 封本地邮件`);
  } catch (error) {
    addClientLog(`批量删除邮件失败：${error.message || "未知错误"}`, "error");
    toast(error.message || "批量删除失败");
  }
}

async function waitForMailFetchJob(jobId, total) {
  const started = Date.now();
  const timeoutMs = Math.min(
    MAIL_SYNC_POLL_MAX_TIMEOUT_MS,
    MAIL_SYNC_POLL_BASE_TIMEOUT_MS + Math.max(0, Number(total) || 0) * MAIL_SYNC_POLL_PER_MAILBOX_MS,
  );
  let lastStatus = "";
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, MAIL_SYNC_POLL_INTERVAL_MS));
    const { response, data } = await fetchJsonWithTimeout(`/client-api/fetch-status?job_id=${encodeURIComponent(jobId)}`, {
      headers: apiHeaders(),
      cache: "no-store",
    }, "/client-api/fetch-status", Math.min(12000, MAIL_SYNC_POLL_INTERVAL_MS + 10000));
    if (!response.ok || data.success === false) {
      throw new Error(data.error || response.statusText || "收信任务查询失败");
    }
    const job = data.job || {};
    if (job.status !== lastStatus) {
      lastStatus = job.status;
      addClientLog(`收信任务状态：${job.status || "running"}`, job.status === "failed" ? "error" : "info");
    }
    const processed = Math.max(0, Number(job.processed || 0));
    const totalCount = Math.max(1, Number(job.total || total || 0));
    const currentEmail = String(job.current_email || "").trim();
    const progress = Math.max(12, Math.min(96, Math.round((processed / totalCount) * 100)));
    setInlineProgress(els.mailProgress, progress, `${processed}/${totalCount}`);
    els.statusText.textContent = currentEmail
      ? `正在后台收取 ${processed}/${totalCount} 个邮箱 · 当前 ${currentEmail}`
      : `正在后台收取 ${processed}/${totalCount} 个邮箱`;
    if (job.status === "success") return job.result || {};
    if (job.status === "failed") throw new Error(job.error || "收信任务失败");
  }
  throw new Error("收信任务等待超时，请稍后查看邮箱状态或缩小本次同步数量。");
}

function loginStateFor(account) {
  return state.loginJobs.get(account.id) || { status: "idle", error: "", jobId: "", logs: [] };
}

function rowStateFor(row) {
  return state.loginJobs.get(row.id) || {
    status: row.status || "idle",
    error: row.error || "",
    status_label: row.status_label || "",
    jobId: row.jobId || "",
    logs: row.logs || [],
  };
}

function loginLabel(status) {
  return {
    idle: "等待",
    queued: "排队",
    running: "刷新中",
    success: "成功",
    failed: "失败",
    active: "可用",
    refreshed: "已刷新",
    rt_rotated: "RT 已轮换",
    rt_invalid: "RT 失效",
    session_expired: "会话失效",
    banned: "封禁/停用",
    risk_blocked: "风控受限",
    usage_limit_reached: "额度耗尽",
    needs_login: "需重新授权",
    probe_failed: "探测失败",
    not_openai_auth: "非 OpenAI",
  }[status] || status || "等待";
}

const CPA_NON_REFRESHABLE_STATUSES = new Set([
  "active",
  "refreshed",
  "rt_rotated",
  "banned",
  "usage_limit_reached",
  "not_openai_auth",
]);

function isRowRefreshable(row) {
  if (row.source_kind !== "cpa") return true;
  const status = rowStateFor(row).status || row.status || "idle";
  if (row.refreshable === false) return false;
  return !CPA_NON_REFRESHABLE_STATUSES.has(status);
}

function accountForRow(row) {
  if (row.account_id) {
    const byId = state.accounts.find((account) => account.id === row.account_id);
    if (byId) return byId;
  }
  const email = String(row.email || "").toLowerCase();
  return state.accounts.find((account) => account.email.toLowerCase() === email) || null;
}

function loginPayload(row) {
  const account = accountForRow(row) || row;
  const email = account.email || row.email;
  const sameEmail = state.accounts.filter((item) => item.email.toLowerCase() === String(email).toLowerCase());
  const shouldUploadToCpa = row.source_kind === "cpa"
    && els.cpaBaseUrl?.value.trim()
    && els.cpaKey?.value.trim();
  return {
    login_only: !shouldUploadToCpa,
    base_url: shouldUploadToCpa ? els.cpaBaseUrl?.value.trim() || "" : "",
    management_key: shouldUploadToCpa ? els.cpaKey?.value || "" : "",
    name: row.cpa_name || row.name || email,
    email,
    password: account.password || "",
    row: {
      name: row.cpa_name || row.name || email,
      email,
      auth_index: row.auth_index || "",
      source: row.source_kind || "local",
    },
    accounts: sameEmail
      .filter((item) => item.source === "microsoft")
      .map((item) => ({
        email: item.email,
        password: item.password,
        client_id: item.client_id,
        refresh_token: item.refresh_token,
      })),
    temp_addresses: sameEmail
      .filter((item) => item.source === "temp")
      .map((item) => ({
        email: item.email,
        jwt: item.jwt,
        base_url: normalizeTempWorkerUrl(item.base_url || els.importTempApi.value || DEFAULT_TEMP_WORKER_URL),
        site_password: item.site_password,
      })),
    generic_accounts: sameEmail
      .filter((item) => item.source === "generic")
      .map(genericAccountPayload),
  };
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function epochSecondsFromValue(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.trunc(numeric > 1e11 ? numeric / 1000 : numeric);
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : undefined;
}

function accountAuthFile(account) {
  const stored = account?.auth_file && typeof account.auth_file === "object" ? account.auth_file : null;
  if (stored?.access_token) return stored;
  if (!account || !account.access_token) return null;
  const now = new Date().toISOString();
  return compactObject({
    type: "codex",
    account_id: account.account_id || account.chatgpt_account_id || "",
    chatgpt_account_id: account.chatgpt_account_id || account.account_id || "",
    email: account.email,
    name: account.name || account.email,
    plan_type: account.plan_type || "",
    chatgpt_plan_type: account.plan_type || "",
    id_token: account.id_token || "",
    access_token: account.access_token || "",
    refresh_token: account.refresh_token || "",
    session_token: account.session_token || "",
    last_refresh: account.last_refresh || now,
    expired: account.expires_at || "",
  });
}

function rowAuthFile(row) {
  const stored = row?.auth_file && typeof row.auth_file === "object" ? row.auth_file : null;
  if (stored?.access_token) return stored;
  const account = accountForRow(row);
  return accountAuthFile(account);
}

function refreshQueueKey(row) {
  if (refreshQueueHelper?.queueKey) return refreshQueueHelper.queueKey(row);
  return [
    row.source_kind || row.source || "local",
    String(row.email || row.name || "").toLowerCase(),
    String(row.cpa_name || row.auth_index || ""),
  ].join("|");
}

function rowToRefreshQueueItem(row) {
  if (refreshQueueHelper?.buildQueueItem) {
    return refreshQueueHelper.buildQueueItem({
      ...row,
      account: accountForRow(row),
    });
  }
  const account = accountForRow(row);
  const email = row.email || account?.email || "";
  const localService = account?.source === "microsoft"
    ? (account.service || "Outlook")
    : (account?.source === "generic" ? (account.service || "其他邮箱") : "临时邮箱");
  return compactObject({
    id: row.source_kind === "cpa"
      ? `cpa-refresh:${String(row.cpa_name || row.auth_index || email || row.id || crypto.randomUUID()).toLowerCase()}`
      : `refresh:${account?.id || row.account_id || email || row.id || crypto.randomUUID()}`,
    source_kind: row.source_kind || "local",
    source: row.source_kind === "cpa" ? "cpa" : (account?.source || "local"),
    service: row.source_kind === "cpa" ? "CPA" : localService,
    email,
    name: row.name || email,
    cpa_name: row.cpa_name || "",
    auth_index: row.auth_index || "",
    account_id: account?.id || row.account_id || "",
    cpa_base_url: row.source_kind === "cpa" ? (els.cpaBaseUrl?.value.trim() || "") : "",
    cpa_management_key: row.source_kind === "cpa" ? (els.cpaKey?.value || "") : "",
    status: "idle",
    error: "",
    logs: [],
    auth_file: row.auth_file || account?.auth_file || null,
  });
}

function enqueueAbnormalRows(rows) {
  if (!rows.length) {
    toast("没有可加入队列的账号");
    return 0;
  }
  const queue = loadJson(STORAGE_KEYS.refreshQueue, []);
  const refreshableRows = rows.filter((row) => isRowRefreshable(row));
  if (!refreshableRows.length) {
    toast("没有可加入队列的账号");
    return 0;
  }
  const merged = refreshQueueHelper?.mergeQueueItems
    ? refreshQueueHelper.mergeQueueItems(queue, refreshableRows.map((row) => ({
      ...row,
      account: accountForRow(row),
    })))
    : null;
  let added = 0;
  refreshableRows.forEach((row) => {
    row.status = "queued";
    row.error = "";
    state.loginJobs.set(row.id, { status: "queued", error: "", logs: [] });
  });
  if (merged) {
    added = merged.added;
    saveJson(STORAGE_KEYS.refreshQueue, merged.queue);
  } else {
    const byKey = new Map((Array.isArray(queue) ? queue : []).map((row) => [refreshQueueKey(row), row]));
    refreshableRows.forEach((row) => {
      const item = rowToRefreshQueueItem(row);
      const key = refreshQueueKey(item);
      const previous = byKey.get(key);
      byKey.set(key, { ...(previous || {}), ...item, status: previous?.status || "idle" });
      if (!previous) added += 1;
    });
    saveJson(STORAGE_KEYS.refreshQueue, [...byKey.values()]);
  }
  saveAbnormalRows();
  renderLoginTable();
  addClientLog(`已加入刷新队列：${refreshableRows.length} 个账号，新增 ${added} 个；请到凭证刷新页统一执行。`, "success");
  toast(added ? `已加入队列：新增 ${added} 个` : "账号已在刷新队列");
  return added;
}

function rowSub2apiItem(row, authFile) {
  return accountSub2apiItem({
    email: row.email,
    name: row.name || row.email,
  }, authFile);
}

function abnormalKey(row) {
  return [
    row.source_kind || "local",
    String(row.cpa_name || row.name || "").toLowerCase(),
    String(row.email || "").toLowerCase(),
    String(row.auth_index || ""),
  ].join("|");
}

function upsertAbnormalRows(rows) {
  const byKey = new Map(state.abnormalRows.map((row) => [abnormalKey(row), row]));
  let added = 0;
  rows.forEach((row) => {
    const key = abnormalKey(row);
    if (byKey.has(key)) {
      const current = byKey.get(key);
      Object.assign(current, compactObject({
        email: row.email || current.email,
        name: row.name || current.name,
        cpa_name: row.cpa_name || current.cpa_name,
        auth_index: row.auth_index || current.auth_index,
        account_id: row.account_id || current.account_id,
        status: row.status || current.status,
        status_label: row.status_label || current.status_label,
        message: row.message || current.message,
        diagnosis: row.diagnosis || current.diagnosis,
        action_hint: row.action_hint || current.action_hint,
        refreshable: row.refreshable ?? current.refreshable,
        plan_type: row.plan_type || current.plan_type,
      }));
      const existingJob = state.loginJobs.get(current.id);
      if (row.status && !["queued", "running"].includes(existingJob?.status || "")) {
        state.loginJobs.delete(current.id);
        current.error = row.error || "";
        current.logs = row.logs || [];
      }
      state.selectedAbnormal.add(current.id);
      return;
    }
    const next = {
      id: row.id || `abnormal:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      source_kind: row.source_kind || "local",
      email: row.email || "",
      name: row.name || row.email || "",
      cpa_name: row.cpa_name || "",
      auth_index: row.auth_index || "",
      account_id: row.account_id || "",
      status: row.status || "idle",
      error: row.error || "",
      status_label: row.status_label || "",
      message: row.message || "",
      diagnosis: row.diagnosis || "",
      action_hint: row.action_hint || "",
      refreshable: row.refreshable,
      plan_type: row.plan_type || "",
      logs: [],
      auth_file: row.auth_file || null,
    };
    byKey.set(key, next);
    state.selectedAbnormal.add(next.id);
    added += 1;
  });
  state.abnormalRows = [...byKey.values()];
  saveAbnormalRows();
  return added;
}

function rowsFromSelectedMailboxes() {
  const visibleIds = new Set(filteredAccounts().map((account) => account.id));
  const selected = state.accounts.filter((account) => state.selected.has(account.id) && visibleIds.has(account.id));
  return selected.map((account) => ({
    id: `local:${account.id}`,
    source_kind: "local",
    email: account.email,
    name: account.email,
    account_id: account.id,
    status: "idle",
    message: "来自左侧选中邮箱",
  }));
}

function pruneSelectedMailboxesToCurrentFilter() {
  return mailboxWorkspace.pruneSelectedMailboxesToCurrentFilter();
}

function invalidateFilteredAccountsCache() {
  return mailboxWorkspace.invalidateFilteredAccountsCache();
}

function localAccountForEmail(email) {
  const lower = String(email || "").toLowerCase();
  return state.accounts.find((account) => account.email.toLowerCase() === lower) || null;
}

function rowsFromCpaCandidates(candidates) {
  return candidates.map((item) => {
    const email = item.email || item.account || "";
    const account = localAccountForEmail(email);
    return {
      id: `cpa:${item.name || item.id || email || item.auth_index}`,
      source_kind: "cpa",
      email,
      name: email || item.name || item.id || "",
      cpa_name: item.name || item.id || "",
      auth_index: item.auth_index || "",
      account_id: account?.id || "",
      status: item.status || "idle",
      status_label: item.status_label || item.diagnosis || "",
      diagnosis: item.diagnosis || item.status_label || "",
      action_hint: item.action_hint || "",
      refreshable: item.refreshable,
      plan_type: item.plan_type || "",
      message: item.message || item.raw_message || "CPA 巡检异常",
    };
  });
}

async function scanSelectedMailboxes() {
  const rows = rowsFromSelectedMailboxes();
  if (!rows.length) {
    toast("先在左侧选择要处理的邮箱");
    return;
  }
  const added = upsertAbnormalRows(rows);
  addClientLog(`已加入 ${rows.length} 个本地邮箱到异常列表`, "info");
  toast(`已加入 ${added} 个新异常邮箱`);
  setActiveView("login");
  renderLoginTable();
}

async function scanCpaAbnormal() {
  if (!els.cpaBaseUrl || !els.cpaKey || !els.cpaLimit || !els.scanCpaBtn) return;
  const baseUrl = els.cpaBaseUrl?.value.trim() || "";
  const managementKey = els.cpaKey?.value.trim() || "";
  if (!baseUrl || !managementKey) {
    toast("先填写 CPA 地址和管理密钥");
    return;
  }
  saveCpaSettings();
  els.scanCpaBtn.disabled = true;
  els.scanCpaBtn.textContent = "扫描中";
  try {
    const response = await fetch("/client-api/cpa/scan-401", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        base_url: baseUrl,
        management_key: managementKey,
        max_items: Number(els.cpaLimit?.value || 50),
      }),
    });
    const data = await readJsonResponse(response, "/client-api/cpa/scan-401");
    if (!response.ok || !data.success) throw new Error(data.error || "CPA 扫描失败");
    const rows = rowsFromCpaCandidates(data.candidates || []);
    const added = upsertAbnormalRows(rows);
    const summary = data.summary || {};
    addClientLog(
      `CPA 巡检完成：异常 ${summary.candidates || rows.length}，可用 ${summary.credential_ok || 0}，需授权 ${summary.needs_login || 0}，封禁 ${summary.banned || 0}，风控 ${summary.risk || 0}，额度 ${summary.limited || 0}`,
      "info"
    );
    toast(`巡检到 ${rows.length} 个异常，新增 ${added} 个`);
    renderLoginTable();
  } catch (error) {
    addClientLog(`CPA 扫描失败：${error.message || "未知错误"}`, "error");
    toast(error.message || "CPA 扫描失败");
  } finally {
    els.scanCpaBtn.disabled = false;
    els.scanCpaBtn.textContent = "扫描 CPA 401";
  }
}

function accountSub2apiItem(account, authFile) {
  const expiresAt = epochSecondsFromValue(authFile.expired);
  return compactObject({
    name: authFile.name || account.email,
    platform: "openai",
    type: "oauth",
    expires_at: expiresAt,
    auto_pause_on_expired: true,
    concurrency: 10,
    priority: 1,
    credentials: compactObject({
      access_token: authFile.access_token,
      refresh_token: authFile.refresh_token,
      id_token: authFile.id_token,
      session_token: authFile.session_token,
      chatgpt_account_id: authFile.chatgpt_account_id || authFile.account_id || "",
      email: authFile.email || account.email,
      expires_at: expiresAt,
      plan_type: authFile.plan_type || "",
    }),
    extra: compactObject({
      email: authFile.email || account.email,
      name: authFile.name || account.email,
      source: "gpt_account_manager_lifecycle_refresh",
      last_refresh: authFile.last_refresh || "",
    }),
  });
}

function downloadJsonFile(fileName, value) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function backupLocalData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadJsonFile(`gpt-account-manager-local-backup-${timestamp}.json`, {
    app: "gpt-account-manager",
    kind: "browser-local-backup",
    version: "1.0.1",
    exported_at: new Date().toISOString(),
    storage: Object.fromEntries(Object.values(STORAGE_KEYS).map((key) => [key, loadJson(key, null)])),
  });
  toast("已导出当前浏览器本地备份");
}

async function restoreLocalData(file) {
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const storage = payload.storage && typeof payload.storage === "object" ? payload.storage : payload;
    const allowed = new Set(Object.values(STORAGE_KEYS));
    let restored = 0;
    Object.entries(storage).forEach(([key, value]) => {
      if (!allowed.has(key)) return;
      saveJson(key, value);
      restored += 1;
    });
    if (!restored) throw new Error("备份文件里没有可恢复的数据");
    location.reload();
  } catch (error) {
    toast(error.message || "恢复失败，请确认是本工具导出的 JSON");
  } finally {
    els.restoreLocalFile.value = "";
  }
}

function exportCredentialJson(format) {
  if (!els.loginTableBody) return;
  const rows = selectedAbnormalRows()
    .map((row) => ({ row, authFile: rowAuthFile(row) }))
    .filter((item) => item.authFile);
  if (!rows.length) {
    toast("没有可导出的刷新结果，请先刷新成功后再导出");
    return;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (format === "cpa") {
    const files = rows.map((item) => item.authFile);
    downloadJsonFile(`gpt-account-manager-cpa-auth-${timestamp}.json`, files.length === 1 ? files[0] : files);
    toast(`已导出 ${files.length} 个 CPA 凭证`);
    return;
  }
  const document = {
    exported_at: new Date().toISOString(),
    proxies: [],
    accounts: rows.map((item) => rowSub2apiItem(item.row, item.authFile)),
  };
  downloadJsonFile(`gpt-account-manager-sub2api-accounts-${timestamp}.json`, document);
  toast(`已导出 ${rows.length} 个 sub2api 账号`);
}

function normalizePlanBucket(value) {
  const text = String(value || "").trim().toUpperCase().replace(/[\s_-]+/g, "");
  if (!text) return "";
  if (text.includes("PROX20") || text.includes("PRO20") || text.includes("X20")) return "PROX20";
  if (text.includes("PROX5") || text.includes("PRO5") || text.includes("X5")) return "PROX5";
  if (text.includes("TEAM") || text.includes("BUSINESS") || text.includes("ENTERPRISE")) return "TEAM";
  if (text.includes("PLUS")) return "PLUS";
  if (text.includes("FREE")) return "FREE";
  return "";
}

function rowPlanBucket(row) {
  const authFile = rowAuthFile(row);
  return normalizePlanBucket(
    row.plan_type
    || row.chatgpt_plan_type
    || authFile?.plan_type
    || authFile?.chatgpt_plan_type
    || ""
  );
}

function renderLoginTable() {
  if (!els.loginTableBody) return;
  const rows = state.abnormalRows;
  const counts = { idle: 0, queued: 0, running: 0, success: 0, failed: 0 };
  const planCounts = { FREE: 0, PLUS: 0, TEAM: 0, PROX5: 0, PROX20: 0 };
  rows.forEach((row) => {
    const status = rowStateFor(row).status || "idle";
    counts[status] = (counts[status] || 0) + 1;
    const plan = rowPlanBucket(row);
    if (planCounts[plan] !== undefined) planCounts[plan] += 1;
  });
  if (els.loginTotal) els.loginTotal.textContent = String(rows.length);
  if (els.loginIdle) els.loginIdle.textContent = String(counts.idle || 0);
  if (els.loginRunning) els.loginRunning.textContent = String((counts.queued || 0) + (counts.running || 0));
  if (els.loginSuccess) els.loginSuccess.textContent = String(counts.success || 0);
  if (els.loginFailed) els.loginFailed.textContent = String(counts.failed || 0);
  if (els.loginPlanTypes) {
    els.loginPlanTypes.textContent = `FREE ${planCounts.FREE} · PLUS ${planCounts.PLUS} · TEAM ${planCounts.TEAM} · PROX5 ${planCounts.PROX5} · PROX20 ${planCounts.PROX20}`;
  }
  if (!rows.length) {
    els.loginTableBody.innerHTML = '<tr><td colspan="6" class="empty-cell">先扫描 CPA 异常，或加入左侧选中的邮箱。</td></tr>';
    return;
  }
  els.loginTableBody.innerHTML = rows.map((row) => {
    const job = rowStateFor(row);
    const status = job.status || "idle";
    const source = row.source_kind === "cpa" ? "CPA 巡检" : "本地邮箱";
    const statusText = job.status_label || row.status_label || loginLabel(status);
    const diagnosisText = [
      row.diagnosis || row.status_label,
      row.message,
      row.action_hint,
    ].filter(Boolean).join(" · ");
    const detail = job.error || diagnosisText || "-";
    const refreshable = isRowRefreshable(row);
    return `
      <tr data-id="${escapeHtml(row.id)}">
        <td><input class="abnormal-check" type="checkbox" ${state.selectedAbnormal.has(row.id) ? "checked" : ""}></td>
        <td>
          <strong>${escapeHtml(row.email || row.name || "-")}</strong>
          ${row.cpa_name ? `<em>${escapeHtml(row.cpa_name)}</em>` : ""}
        </td>
        <td>${escapeHtml(source)}</td>
        <td><span class="login-status ${escapeHtml(status)}">${escapeHtml(statusText)}</span></td>
        <td><div class="login-error" title="${escapeHtml(detail)}">${escapeHtml(detail)}</div></td>
        <td><button class="login-one" type="button" ${status === "queued" || !refreshable ? "disabled" : ""}>${refreshable ? "加入队列" : "跳过"}</button></td>
      </tr>
    `;
  }).join("");
}

function selectedAbnormalRows({ failedOnly = false } = {}) {
  const chosen = state.abnormalRows.filter((row) => state.selectedAbnormal.has(row.id));
  if (failedOnly) {
    const base = chosen.length ? chosen : state.abnormalRows;
    return base.filter((row) => rowStateFor(row).status === "failed");
  }
  return chosen;
}

function startLoginForRows(rows) {
  if (!rows.length) {
    toast("没有可加入队列的异常账号");
    return;
  }
  const runnable = rows.filter(isRowRefreshable);
  const skipped = rows.length - runnable.length;
  if (skipped) addClientLog(`已跳过 ${skipped} 个无需或不应刷新的账号`, "warning");
  if (!runnable.length) {
    toast("没有需要重新授权的账号");
    renderLoginTable();
    return;
  }
  enqueueAbnormalRows(runnable);
}

function startLoginPolling() {
  if (state.loginPoller) return;
  state.loginPoller = setInterval(pollLoginJobs, 2000);
}

async function pollLoginJobs() {
  if (state.loginPollInFlight) return;
  state.loginPollInFlight = true;
  try {
    const pending = state.abnormalRows.filter((row) => {
      const status = rowStateFor(row).status;
      return status === "queued" || status === "running";
    });
    if (!pending.length) {
      clearInterval(state.loginPoller);
      state.loginPoller = undefined;
      return;
    }
    for (const row of pending) {
      const current = rowStateFor(row);
      if (!current.jobId) continue;
      try {
        const { response, data } = await fetchJsonWithTimeout(`/client-api/cpa/login-status?job_id=${encodeURIComponent(current.jobId)}`, {
          headers: apiHeaders(),
          cache: "no-store",
        }, "/client-api/cpa/login-status", 12000);
        if (!response.ok || !data.success) throw new Error(data.error || "读取登录任务失败");
        const job = data.job || {};
        const previousLogCount = current.logs?.length || 0;
        (job.logs || []).slice(previousLogCount).forEach((entry) => {
          addClientLog(`${row.email || row.name} ${entry.message || ""}`, entry.level || "info");
        });
        const result = job.result || {};
        const authFile = result.auth_file || result.result?.auth_file || null;
        if (authFile && typeof authFile === "object") {
          row.auth_file = authFile;
          const account = accountForRow(row);
          if (account) {
            account.auth_file = authFile;
            account.access_token = authFile.access_token || account.access_token || "";
            account.refresh_token = authFile.refresh_token || account.refresh_token || "";
            account.id_token = authFile.id_token || account.id_token || "";
            account.session_token = authFile.session_token || account.session_token || "";
            account.account_id = authFile.account_id || authFile.chatgpt_account_id || account.account_id || "";
            account.chatgpt_account_id = authFile.chatgpt_account_id || authFile.account_id || account.chatgpt_account_id || "";
            account.plan_type = authFile.plan_type || authFile.chatgpt_plan_type || account.plan_type || "";
            account.last_refresh = authFile.last_refresh || new Date().toISOString();
          }
        }
        row.status = job.status || "running";
        row.error = job.error || "";
        row.logs = job.logs || [];
        saveAbnormalRows();
        invalidateFilteredAccountsCache();
        saveJson(STORAGE_KEYS.accounts, state.accounts);
        state.loginJobs.set(row.id, {
          status: job.status || "running",
          jobId: current.jobId,
          error: job.error || "",
          logs: job.logs || [],
        });
      } catch (error) {
        row.status = "failed";
        row.error = error.message || "读取登录任务失败";
        saveAbnormalRows();
        state.loginJobs.set(row.id, {
          status: "failed",
          jobId: current.jobId,
          error: error.message || "读取登录任务失败",
          logs: current.logs || [],
        });
        addClientLog(`${row.email || row.name} ${error.message || "读取登录任务失败"}`, "error");
      }
    }
    renderLoginTable();
  } finally {
    state.loginPollInFlight = false;
  }
}

Object.assign(MAIL_SERVICES.microsoft, {
  hint: "支持 TXT / JSON / CSV。文本格式：邮箱----密码----client_id----refresh_token----分组(可选)。",
  placeholder: "user@outlook.com----password----client_id----refresh_token----默认分组",
});
Object.assign(MAIL_SERVICES.temp, {
  hint: "支持 TXT / JSON / CSV。临时邮箱只需要 JWT：邮箱----JWT；可选：邮箱----JWT----分组。Temp API 已默认填好。",
  placeholder: "user@example.com----JWT_TOKEN\nuser@example.com----JWT_TOKEN----默认分组",
});
Object.assign(MAIL_SERVICES.generic, {
  label: "其他邮箱",
  hint: "支持 TXT / JSON / CSV。支持 163、QQ、iCloud、Gmail、Yahoo 等 IMAP/POP3 邮箱：邮箱----密码/授权码；可选：邮箱----密码----imap.example.com----993----分组。",
  placeholder: [
    "user@163.com----授权码或邮箱密码",
    "user@qq.com----授权码",
    "user@icloud.com----App 专用密码",
    "user@gmail.com----App Password",
    "user@example.com----password----imap.example.com----993----默认分组",
  ].join("\n"),
});
Object.assign(MAIL_SERVICES.auto, {
  hint: "支持 TXT / JSON / CSV。自动识别：Outlook 四段；临时邮箱 邮箱----JWT；其他邮箱 邮箱----密码/授权码 或 IMAP/POP3 扩展格式。",
  placeholder: [
    "user@outlook.com----password----client_id----refresh_token----默认分组",
    "user@example.com----JWT_TOKEN----默认分组",
    "user@163.com----授权码或邮箱密码",
    "user@qq.com----授权码",
    "user@icloud.com----App 专用密码",
  ].join("\n"),
});
function looksLikeUrl(value) {
  if (mailboxImportHelper?.looksLikeUrl) return mailboxImportHelper.looksLikeUrl(value);
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^https?:\/\//i.test(text)) return true;
  if (/^(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?(\/|$)/i.test(text)) return true;
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(:\d+)?(\/|$)/i.test(text);
}

function csvPartsFlexible(line) {
  if (mailboxImportHelper?.csvParts) return mailboxImportHelper.csvParts(line);
  return csvParts(line);
}

function parseTempParts(parts, service, email) {
  if (mailboxImportHelper?.parseTempParts) return mailboxImportHelper.parseTempParts(parts, service, email);
  let jwt = parts[1] || "";
  let baseUrl = "";
  let sitePassword = "";
  let category = "";
  if (parts.length >= 5) {
    baseUrl = normalizeTempWorkerUrl(parts[2] || "");
    sitePassword = parts[3] || "";
    category = parts[4] || "";
  } else if (parts.length === 4) {
    if (looksLikeUrl(parts[2])) {
      baseUrl = normalizeTempWorkerUrl(parts[2] || "");
      sitePassword = parts[3] || "";
    } else {
      category = parts[2] || "";
      sitePassword = parts[3] || "";
    }
  } else if (parts.length === 3) {
    if (looksLikeUrl(parts[2])) {
      baseUrl = normalizeTempWorkerUrl(parts[2] || "");
    } else {
      category = parts[2] || "";
    }
  }
  return {
    id: `temp:${email.toLowerCase()}`,
    source: "temp",
    service: service.label,
    email,
    jwt,
    base_url: baseUrl,
    site_password: sitePassword,
    category,
    selected: true,
  };
}

function parseGenericParts(parts, service, email) {
  if (mailboxImportHelper?.parseGenericParts) return mailboxImportHelper.parseGenericParts(parts, service, email);
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
    service: service.label,
    email,
    password,
    username,
    mode,
    imap_host: mode === "pop3" ? "" : host,
    imap_port: /^\d+$/.test(fourth) ? Number(fourth) : 993,
    pop3_host: mode === "pop3" ? host : "",
    pop3_port: /^\d+$/.test(fourth) ? Number(fourth) : 995,
    category,
    selected: true,
  });
}

function parseLines(text, source) {
  if (mailboxImportHelper?.parseLines) return mailboxImportHelper.parseLines(text, source);
  const service = MAIL_SERVICES[source] || MAIL_SERVICES.microsoft;
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
      errors.push(`第 ${index + 1} 行账号格式不对`);
      return;
    }
    const rowService = serviceForParsedParts(parts, source);
    if (rowService.source === "temp") {
      rows.push(parseTempParts(parts, rowService, email));
      return;
    }
    if (rowService.source === "generic") {
      rows.push(parseGenericParts(parts, rowService, email));
      return;
    }
    rows.push({
      id: `microsoft:${email.toLowerCase()}`,
      source: "microsoft",
      service: rowService.label,
      email,
      password: parts[1] || "",
      client_id: parts[2] || "",
      refresh_token: parts[3] || "",
      category: parts[4] || "",
      selected: true,
    });
  });
  return { rows, errors };
}

function importPreviewText() {
  if (!els.importPreview) return;
  if (mailboxImportUiHelper?.previewState) {
    const source = els.importServiceSelect.value || state.activeImportSource || "auto";
    const nextState = mailboxImportUiHelper.previewState({
      source,
      text: els.importText.value,
      options: {
        emptyText: "粘贴后会先预检格式，不会直接上传。",
        includeDuplicates: true,
        includeMissing: true,
      },
    });
    mailboxImportUiHelper.applyPreviewState({
      previewEl: els.importPreview,
      textInput: els.importText,
    }, nextState);
    return;
  }
  const source = els.importServiceSelect.value || state.activeImportSource || "auto";
  const text = els.importText.value;
  if (!text.trim()) {
    els.importPreview.textContent = "粘贴后会先预检格式，不会直接上传。";
    els.importPreview.className = "import-preview";
    return;
  }
  const { rows, errors } = parseLines(text, source);
  const temp = rows.filter((row) => row.source === "temp").length;
  const microsoft = rows.filter((row) => row.source === "microsoft").length;
  const generic = rows.filter((row) => row.source === "generic").length;
  const duplicateCount = rows.length - new Set(rows.map((row) => row.id)).size;
  const missing = rows.filter((row) =>
    row.source === "temp" ? !row.jwt
      : row.source === "generic" ? !row.password
        : (!row.password || !row.client_id || !row.refresh_token)
  ).length;
  const issues = errors.length + missing;
  els.importPreview.className = `import-preview ${issues ? "warning" : "ok"}`;
  els.importPreview.textContent = [
    `识别 ${rows.length} 个账号`,
    temp ? `临时邮箱 ${temp}` : "",
    microsoft ? `Outlook ${microsoft}` : "",
    generic ? `其他邮箱 ${generic}` : "",
    duplicateCount ? `重复 ${duplicateCount}` : "",
    missing ? `缺少凭证 ${missing}` : "",
    errors.length ? `格式错误 ${errors.length}` : "",
  ].filter(Boolean).join(" · ") || "没有识别到账号";
}

function upsertAccounts(incoming) {
  const byId = new Map(state.accounts.map((account) => [account.id, account]));
  let imported = 0;
  let updated = 0;
  incoming.forEach((account) => {
    if (account.source === "temp" && account.email) {
      byId.delete(`microsoft:${account.email.toLowerCase()}`);
    }
    const existing = byId.get(account.id);
    const now = new Date().toISOString();
    if (existing) {
      Object.assign(existing, account, {
        created_at: existing.created_at || account.created_at || now,
        updated_at: now,
      });
      updated += 1;
    } else {
      byId.set(account.id, {
        ...account,
        created_at: account.created_at || now,
        updated_at: now,
      });
      imported += 1;
    }
    state.selected.add(account.id);
    if (account.category) ensureCategory(account.category);
  });
  state.accounts = sortAccounts(byId.values());
  invalidateFilteredAccountsCache();
  saveJson(STORAGE_KEYS.accounts, state.accounts);
  saveJson(STORAGE_KEYS.categories, state.categories);
  return { imported, updated };
}

async function persistImportedAccounts(source, rows) {
  if (!rows.length) return { imported: 0, updated: 0, localOnly: true };
  const results = [];
  const microsoftRows = rows.filter((row) => row.source === "microsoft");
  const tempRows = rows.filter((row) => row.source === "temp");
  const genericRows = rows.filter((row) => row.source === "generic");
  if (microsoftRows.length) {
    const response = await fetch("/client-api/accounts/import-pickup", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ text: microsoftRows.map((row) => [
        row.email,
        row.password || "",
        row.client_id || "",
        row.refresh_token || "",
        row.category || "",
      ].join("----")).join("\n") }),
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
        text: tempRows.map((row) => [
          row.email,
          row.jwt || "",
          row.base_url || "",
          row.site_password || "",
          row.category || "",
        ].join("----")).join("\n"),
        base_url: normalizeTempWorkerUrl(els.importTempApi.value),
        site_password: els.importTempSitePassword.value.trim(),
      }),
    });
    const data = await readJsonResponse(response, "/client-api/temp-addresses/import");
    if (!response.ok) throw new Error(data.error || "临时邮箱导入失败");
    results.push(data);
  }
  if (genericRows.length) {
    const response = await fetch("/client-api/generic-accounts/import", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ text: genericRows.map((row) => [
        row.email,
        row.password || "",
        row.imap_host || row.pop3_host || "",
        row.mode === "pop3" ? (row.pop3_port || "") : (row.imap_port || ""),
        row.mode || "auto",
        row.category || "",
      ].join("----")).join("\n") }),
    });
    const data = await readJsonResponse(response, "/client-api/generic-accounts/import");
    if (!response.ok) throw new Error(data.error || "其他邮箱导入失败");
    results.push(data);
  }
  return { imported: rows.length, updated: 0, results };
}

async function importAccounts(source, text) {
  const { rows, errors } = parseLines(text, source);
  if (!rows.length) {
    toast(errors[0] || "先粘贴账号数据");
    return;
  }
  if (rows.some((row) => row.source === "temp")) {
    const baseUrl = normalizeTempWorkerUrl(els.importTempApi.value);
    const sitePassword = els.importTempSitePassword.value.trim();
    rows.filter((row) => row.source === "temp").forEach((row) => {
      row.base_url = normalizeTempWorkerUrl(row.base_url || baseUrl);
      row.site_password = row.site_password || sitePassword;
    });
    saveTempSettings();
  }
  const importGroup = applyImportBatch(rows);
  await persistImportedAccounts(source, rows);
  const summary = upsertAccounts(rows);
  addClientLog(`导入 ${rows.length} 个账号；服务端与当前浏览器已同步`, "success");
  toast(`已导入 ${summary.imported} 个账号${summary.updated ? `，更新 ${summary.updated} 个` : ""}，分组：${importGroup || "未分组"}${errors.length ? `，${errors.length} 行失败` : ""}`);
  renderAll();
  closeImportDialog();
}

function updateImportDialogCopy() {
  if (mailboxImportUiHelper?.previewState) {
    const source = els.importServiceSelect.value || "auto";
    const service = MAIL_SERVICES[source] || MAIL_SERVICES.auto;
    state.activeImportSource = source;
    els.importModalEyebrow.textContent = service.label;
    els.importModal.dataset.serviceTone = service.tone || service.source;
    els.importModalTitle.textContent = "导入邮箱";
    els.importFormatHint.textContent = service.hint;
    els.importFormatHint.dataset.i18nOriginalText = service.hint;
    const nextState = mailboxImportUiHelper.previewState({
      source,
      text: els.importText.value,
      options: {
        emptyText: "粘贴后会先预检格式，不会直接上传。",
        includeDuplicates: true,
        includeMissing: true,
      },
    });
    mailboxImportUiHelper.applyPreviewState({
      previewEl: els.importPreview,
      textInput: els.importText,
      tempApiField: els.importTempApiField,
      tempSitePasswordField: els.importTempSitePasswordField,
    }, nextState);
    return;
  }
  const source = els.importServiceSelect.value || "auto";
  const service = MAIL_SERVICES[source] || MAIL_SERVICES.auto;
  state.activeImportSource = source;
  els.importModalEyebrow.textContent = service.label;
  els.importModal.dataset.serviceTone = service.tone || service.source;
  els.importModalTitle.textContent = "导入邮箱";
  els.importFormatHint.textContent = service.hint;
  els.importFormatHint.dataset.i18nOriginalText = service.hint;
  els.importText.placeholder = service.placeholder;
  els.importText.dataset.i18nOriginalPlaceholder = service.placeholder;
  const tempMode = service.source === "temp";
  els.importTempApiField.hidden = !tempMode;
  els.importTempSitePasswordField.hidden = !tempMode;
  importPreviewText();
}

function openImportDialog(source = "temp") {
  if (mailboxImportUiHelper?.setModalOpen) {
    state.activeImportSource = source;
    els.importServiceSelect.value = MAIL_SERVICES[source] ? source : "auto";
    updateImportDialogCopy();
    els.importText.value = "";
    importPreviewText();
    mailboxImportUiHelper.setModalOpen(els.importModal, true);
    setTimeout(() => els.importText.focus(), 0);
    return;
  }
  state.activeImportSource = source;
  els.importServiceSelect.value = MAIL_SERVICES[source] ? source : "auto";
  updateImportDialogCopy();
  els.importText.value = "";
  importPreviewText();
  els.importModal.hidden = false;
  document.body.classList.add("modal-open");
  setTimeout(() => els.importText.focus(), 0);
}

function closeImportDialog() {
  if (mailboxImportUiHelper?.setModalOpen) {
    mailboxImportUiHelper.setModalOpen(els.importModal, false);
    state.activeImportSource = "";
    els.importText.value = "";
    els.importFile.value = "";
    importPreviewText();
    return;
  }
  els.importModal.hidden = true;
  document.body.classList.remove("modal-open");
  state.activeImportSource = "";
  els.importText.value = "";
  els.importFile.value = "";
  importPreviewText();
}

function openGroupDialog() {
  if (!els.groupModal || !els.groupModalInput) return;
  els.groupModal.hidden = false;
  document.body.classList.add("modal-open");
  els.groupModalInput.value = "";
  setTimeout(() => els.groupModalInput.focus(), 0);
}

function closeGroupDialog() {
  if (!els.groupModal || !els.groupModalInput) return;
  els.groupModal.hidden = true;
  els.groupModalInput.value = "";
  document.body.classList.remove("modal-open");
}

function saveGroupFromModal() {
  const name = String(els.groupModalInput?.value || "").trim();
  if (!name) {
    toast("请输入分组名称");
    return;
  }
  ensureCategory(name);
  saveJson(STORAGE_KEYS.categories, state.categories);
  renderAll();
  closeGroupDialog();
  toast(`已添加分组：${name}`);
}

function syncActiveMailboxSelection() {
  return mailboxWorkspace.syncActiveMailboxSelection();
}

function toggleMailboxFilter(account) {
  return mailboxWorkspace.toggleMailboxFilter(account);
}

async function loadImportedFile(file, textarea) {
  if (!file) return;
  const supported = /\.(txt|json|csv)$/i.test(file.name) || !file.type || file.type.startsWith("text/") || file.type.includes("json") || file.type.includes("csv");
  if (!supported) {
    toast("请上传 TXT、JSON 或 CSV 文件");
    return;
  }
  textarea.value = await file.text();
  toast(`已读取 ${file.name}`);
  importPreviewText();
}

async function readTextFileToTextarea(input, textarea) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    await loadImportedFile(file, textarea);
  } catch (error) {
    toast(error.message || "读取文件失败");
  } finally {
    input.value = "";
  }
}

async function syncMail() {
  if (!state.accounts.length) {
    toast(localCredentialHint());
    return;
  }
  pruneSelectedMailboxesToCurrentFilter();
  syncActiveMailboxSelection();
  const scope = resolvedMessageScope();
  const payload = payloadForSync(scope);
  const total = payload.temp_addresses.length + payload.accounts.length + payload.generic_accounts.length;
  if (!total) {
    toast("当前筛选下没有可刷新邮箱");
    return;
  }
  const provider = normalizeProviderValue(els.providerFilter?.value);
  if (els.providerFilter && provider !== "auto") {
    addClientLog(`当前优先使用 ${provider === "graph" ? "Graph" : "IMAP"}；失败时会继续尝试其他微软收信通道。`, "info");
  }
  if (payloadHasMaskedCredentials(payload) && !hasUsableLocalCredentialsForPayload(payload) && !payload.emails.length) {
    toast(localCredentialHint());
    els.statusText.textContent = "当前浏览器没有真实凭证";
    return;
  }
  els.syncBtn.disabled = true;
  els.syncBtn.textContent = "刷新中";
  els.statusText.textContent = `正在后台收取 0/${total} 个邮箱`;
  setInlineProgress(els.mailProgress, 12, `0/${total}`);
  const beforeCount = Number(state.messageTotal || state.messages.length || 0);
  try {
    const endpoint = "/client-api/fetch-start";
    const requestPayload = clientPayloadForSync(payload);
    requestPayload.provider = provider;
    setInlineProgress(els.mailProgress, 20, "请求中");
    addClientLog(`收取范围：${syncScopeLabel(scope)}`, "info");
    addClientLog(`刷新请求：${requestPayload.accounts?.length || 0} 个 Outlook，${requestPayload.temp_addresses?.length || 0} 个临时邮箱，${requestPayload.generic_accounts?.length || 0} 个其他邮箱，方式 ${provider}`, "info");
    addClientLog(payloadHasMaskedCredentials(payload)
      ? "本次使用当前工作区保存的邮箱凭证补齐打码账号"
      : "本次使用当前浏览器本地导入的邮箱凭证刷新", "info");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(requestPayload),
    });
    const startedData = await readJsonResponse(response, endpoint);
    if (!response.ok) throw new Error(startedData.error || response.statusText);
    const jobId = startedData.job?.job_id || startedData.job_id;
    if (!jobId) throw new Error("收信任务没有返回 job_id");
    addClientLog(`后台收信任务已启动：${jobId}`, "info");
    const data = await waitForMailFetchJob(jobId, total);
    setInlineProgress(els.mailProgress, 82, "处理中");
    state.page = 1;
    await loadServerMessages({ silent: true });
    const diagnosticCounts = applyFetchDiagnostics(data.results || []);
    const errors = [
      ...(data.errors || []),
      ...(data.results || []).flatMap((result) => result.ok ? [] : [
        result.error_label || result.error_code || result.error || (result.errors || [])[0],
      ]),
    ].map(humanizeMailError).filter(Boolean);
    const summary = data.summary || {};
    const okCount = Number(summary.ok ?? diagnosticCounts.ok ?? 0);
    const failedCount = Number(summary.failed ?? diagnosticCounts.failed ?? errors.length);
    const resultMessageCount = (data.results || []).reduce((sum, result) => sum + Number(result.message_count || 0), 0);
    const fetchedCount = Number(summary.messages ?? resultMessageCount);
    const afterCount = Number(state.messageTotal || state.messages.length || 0);
    const newCount = Math.max(0, afterCount - beforeCount);
    state.lastFetchMessageCount = fetchedCount;
    els.statusText.textContent = errors.length
      ? `刷新完成：成功 ${okCount}，失败 ${failedCount}，本次取回 ${fetchedCount} 封，新邮件 ${newCount} 封；首个原因：${String(errors[0]).slice(0, 90)}`
      : `刷新完成：成功 ${okCount}，本次取回 ${fetchedCount} 封，新邮件 ${newCount} 封`;
    addClientLog(`收取完成：处理 ${total} 个邮箱，本次取回 ${fetchedCount} 封，新邮件 ${newCount} 封`, errors.length ? "warning" : "success");
    (data.results || []).filter((result) => !result.ok).slice(0, 12).forEach((result) => {
      const label = result.error_label || result.error_code || "收信失败";
      const hint = result.error_hint || humanizeMailError((result.errors || [])[0] || result.error || "");
      addClientLog(`${result.email || "未知邮箱"}：${label}${hint ? `，${hint}` : ""}`, "error");
    });
    toast(errors.length ? "刷新完成，但有邮箱失败" : "刷新完成");
    renderAccounts();
    setInlineProgress(els.mailProgress, 100, "完成");
  } catch (error) {
    const message = humanizeMailError(error.message || "刷新失败");
    els.statusText.textContent = `刷新失败：${String(message).slice(0, 160)}`;
    addClientLog(`刷新失败：${message}`, "error");
    setInlineProgress(els.mailProgress, 100, "失败");
    toast(message);
  } finally {
    els.syncBtn.disabled = false;
    els.syncBtn.textContent = "收取邮件";
    setTimeout(() => hideInlineProgress(els.mailProgress), 1200);
  }
}

async function copyActiveCode() {
  const message = state.messages.find((item) => mailKey(item) === state.activeMessageKey);
  const code = message?.codes?.[0];
  if (!code) return;
  await navigator.clipboard.writeText(code);
  toast(`已复制验证码 ${code}`);
}

function enqueueSelectedMailboxRefresh() {
  const rows = rowsFromSelectedMailboxes();
  if (!rows.length) {
    toast("先在左侧勾选要推送的邮箱");
    return;
  }
  enqueueAbnormalRows(rows);
}
function renderAll({ includeMessages = true } = {}) {
  state.categories = state.categories.filter((category) => isAllowedCategory(category));
  saveJson(STORAGE_KEYS.categories, state.categories);
  syncActiveMailboxSelection();
  applyMailboxControlsState();
  renderCategories();
  renderAccounts();
  if (includeMessages) renderMessages();
  if (els.loginTableBody) renderLoginTable();
}

function groupAccountsByImportDate() {
  const result = mailboxWorkspace.groupAccountsByImportDate(importDateCategory);
  toast(result.message);
}

els.importMailboxBtn.addEventListener("click", () => openImportDialog("auto"));
els.mailboxControlsToggle?.addEventListener("click", () => toggleMailboxControls());
els.tabImportBtn?.addEventListener("click", () => openImportDialog("auto"));
els.tabLogsBtn?.addEventListener("click", () => setActiveView("logs"));
els.tabMailBtn.addEventListener("click", () => setActiveView("mail"));
els.importServiceSelect.addEventListener("change", updateImportDialogCopy);
els.importFile.addEventListener("change", () => readTextFileToTextarea(els.importFile, els.importText));
els.closeImportModal.addEventListener("click", closeImportDialog);
els.cancelImportBtn.addEventListener("click", closeImportDialog);
els.importModal.addEventListener("click", (event) => {
  if (event.target === els.importModal) closeImportDialog();
});
els.groupModal?.addEventListener("click", (event) => {
  if (event.target === els.groupModal) closeGroupDialog();
});
els.closeGroupModal?.addEventListener("click", closeGroupDialog);
els.cancelGroupModal?.addEventListener("click", closeGroupDialog);
els.confirmGroupModal?.addEventListener("click", saveGroupFromModal);
els.groupModalInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveGroupFromModal();
  } else if (event.key === "Escape") {
    closeGroupDialog();
  }
});
els.confirmImportBtn.addEventListener("click", () => {
  state.activeImportSource = els.importServiceSelect.value || state.activeImportSource || "auto";
  importAccounts(state.activeImportSource, els.importText.value);
});
els.importText.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeImportDialog();
});
els.importText.addEventListener("input", importPreviewText);
els.backupLocalBtn?.addEventListener("click", backupLocalData);
els.restoreLocalFile?.addEventListener("change", () => restoreLocalData(els.restoreLocalFile.files?.[0]));
els.addCategoryBtn.addEventListener("click", openGroupDialog);
els.groupByImportDateBtn?.addEventListener("click", groupAccountsByImportDate);
els.deleteCategoryBtn.addEventListener("click", () => {
  const category = els.mailboxCategoryFilter.value;
  if (!category || category === "all") {
    toast("先在邮箱清单选择一个分组");
    return;
  }
  if (!confirm(`删除分组「${category}」？相关邮箱会回到未分组。`)) return;
  removeCategory(category);
  state.page = 1;
  renderAll();
});
els.clearLocalBtn.addEventListener("click", () => {
  if (!confirm("确定清空当前浏览器里的邮箱和分类？服务端邮件缓存请用批量删除单独清理。")) return;
  state.accounts = [];
  invalidateFilteredAccountsCache();
  state.messages = [];
  state.messageTotal = 0;
  state.hiddenMessageCount = 0;
  state.selected.clear();
  state.activeMessageKey = "";
  saveJson(STORAGE_KEYS.accounts, state.accounts);
  renderAll();
});
els.selectAllBtn.addEventListener("click", () => {
  const accounts = filteredAccounts();
  const allSelected = accounts.every((account) => state.selected.has(account.id));
  accounts.forEach((account) => {
    if (allSelected) state.selected.delete(account.id);
    else state.selected.add(account.id);
  });
  applyMailboxControlsState();
  renderAccounts();
});
els.mailboxPrevPage.addEventListener("click", () => {
  state.mailboxPage -= 1;
  renderAccounts();
});
els.mailboxNextPage.addEventListener("click", () => {
  state.mailboxPage += 1;
  renderAccounts();
});
els.mailboxSourceFilter?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-source]");
  if (!button) return;
  state.mailboxSourceFilter = button.dataset.source || "all";
  state.mailboxPage = 1;
  pruneSelectedMailboxesToCurrentFilter();
  renderAccounts();
});
els.mailboxList.addEventListener("change", (event) => {
  const row = event.target.closest(".mailbox-row");
  if (!row) return;
  const account = state.accounts.find((item) => item.id === row.dataset.id);
  if (!account) return;
  if (event.target.matches(".mailbox-check")) {
    if (event.target.checked) state.selected.add(account.id);
    else state.selected.delete(account.id);
    applyMailboxControlsState();
  }
});
els.mailboxList.addEventListener("click", (event) => {
  const row = event.target.closest(".mailbox-row");
  if (!row) return;
  const account = state.accounts.find((item) => item.id === row.dataset.id);
  if (!account) return;
  if (event.target.closest(".mailbox-row-main")) {
    toggleMailboxFilter(account);
    return;
  }
  if (!event.target.matches("button.icon")) return;
  state.accounts = state.accounts.filter((item) => item.id !== row.dataset.id);
  invalidateFilteredAccountsCache();
  state.selected.delete(row.dataset.id);
  applyMailboxControlsState();
  state.abnormalRows = state.abnormalRows.filter((item) => item.account_id !== row.dataset.id);
  state.selectedAbnormal.delete(row.dataset.id);
  if (state.activeMailboxId === row.dataset.id) {
    state.activeMailboxId = "";
    state.activeMailboxEmail = "";
    state.activeMessageKey = "";
  }
  saveJson(STORAGE_KEYS.accounts, state.accounts);
  saveAbnormalRows();
  renderAll();
  loadServerMessages({ silent: true });
});
els.mailList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest(".mail-delete-one");
  if (deleteButton) {
    event.preventDefault();
    event.stopPropagation();
    const item = deleteButton.closest(".mail-item");
    const message = state.messages.find((candidate) => mailKey(candidate) === item?.dataset.key);
    deleteMessage(message);
    return;
  }
  const item = event.target.closest(".mail-item");
  if (!item) return;
  state.activeMessageKey = item.dataset.key;
  renderMessages();
});
els.syncBtn.addEventListener("click", syncMail);
els.copyCodeBtn.addEventListener("click", copyActiveCode);
els.deleteMessageBtn.addEventListener("click", deleteActiveMessage);
els.deleteFilteredBtn?.addEventListener("click", deleteFilteredMessages);
els.enqueueSelectedRefreshBtn?.addEventListener("click", enqueueSelectedMailboxRefresh);
els.clearClientLogsBtn?.addEventListener("click", () => {
  els.clientLogList.innerHTML = '<div class="client-log-item">等待操作。</div>';
});
els.loginTableBody?.addEventListener("click", (event) => {
  const button = event.target.closest(".login-one");
  if (!button) return;
  const row = button.closest("tr");
  const item = state.abnormalRows.find((candidate) => candidate.id === row?.dataset.id);
  if (item) startLoginForRows([item]);
});
els.loginTableBody?.addEventListener("change", (event) => {
  const input = event.target.closest(".abnormal-check");
  if (!input) return;
  const row = input.closest("tr");
  if (!row) return;
  if (input.checked) state.selectedAbnormal.add(row.dataset.id);
  else state.selectedAbnormal.delete(row.dataset.id);
  renderLoginTable();
});
els.prevPage.addEventListener("click", () => {
  state.page -= 1;
  loadServerMessages({ silent: true });
});
els.nextPage.addEventListener("click", () => {
  state.page += 1;
  loadServerMessages({ silent: true });
});
[
  els.mailboxCategoryFilter,
  els.mailboxSearch,
  els.mailboxPageSize,
].forEach((input) => {
  if (!input) return;
  const rerenderMailboxes = () => {
    state.mailboxPage = 1;
    pruneSelectedMailboxesToCurrentFilter();
    renderCategories();
    renderAccounts();
    if (els.loginTableBody) renderLoginTable();
  };
  const debouncedRerenderMailboxes = scheduler?.debounce?.(rerenderMailboxes, 180) || rerenderMailboxes;
  input.addEventListener("input", debouncedRerenderMailboxes);
  input.addEventListener("change", rerenderMailboxes);
});

const debouncedMessageSearch = scheduler?.debounce?.(() => {
  state.page = 1;
  loadServerMessages({ silent: true });
}, 250) || (() => {
  state.page = 1;
  loadServerMessages({ silent: true });
});

[els.queryInput, els.senderInput].forEach((input) => {
  if (!input) return;
  input.addEventListener("input", debouncedMessageSearch);
  input.addEventListener("search", debouncedMessageSearch);
});

[els.sourceFilter, els.providerFilter, els.typeFilter, els.categoryFilter, els.pageSize].forEach((input) => {
  if (!input) return;
  const reloadMessages = () => {
    state.page = 1;
    loadServerMessages({ silent: true });
  };
  input.addEventListener("change", reloadMessages);
});

renderAll();
loadUsageBadge();
setActiveView("mail");
loadServerMessages({ silent: true });



