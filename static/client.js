const STORAGE_KEYS = {
  accounts: "ctgptm.mail.accounts",
  categories: "ctgptm.mail.categories",
  messages: "ctgptm.mail.messages",
  ignoredMessages: "ctgptm.mail.ignoredMessages",
  refreshQueue: "ctgptm.mail.refreshQueue",
  abnormalRows: "ctgptm.mail.abnormalRows",
  cpaSettings: "ctgptm.mail.cpaSettings",
  tempSettings: "ctgptm.mail.tempSettings",
  workspaceId: "ctgptm.workspaceId",
};
const DEFAULT_TEMP_WORKER_URL = "";
const LEGACY_TEMP_WORKER_URLS = new Set([]);

const TYPE_LABELS = {
  verification: "验证码",
  invite: "邀请",
  security: "安全",
  reset: "重置",
  billing: "账单",
  newsletter: "通知",
  banned: "封禁",
  other: "其他",
};

const EMPTY_CATEGORY_LABEL = "未分组";
const LEGACY_SEEDED_CATEGORIES = new Set(["默认", "客户", "注册", "账单"]);
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
    hint: "自动识别 Outlook 四段格式，或临时邮箱两段格式：邮箱----JWT。",
    placeholder: "user@outlook.com----password----client_id----refresh_token\nuser@example.com----JWT_TOKEN",
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
    hint: "粘贴格式：邮箱----JWT。也可以写：邮箱----JWT----分组。Temp API 已默认填好。",
    placeholder: "user@example.com----JWT_TOKEN",
  },
};

const els = {
  importMailboxBtn: document.querySelector("#importMailboxBtn"),
  tabMailBtn: document.querySelector("#tabMailBtn"),
  tabImportBtn: document.querySelector("#tabImportBtn"),
  tabLoginBtn: document.querySelector("#tabLoginBtn"),
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
  mailboxTotal: document.querySelector("#mailboxTotal"),
  categoryName: document.querySelector("#categoryName"),
  addCategoryBtn: document.querySelector("#addCategoryBtn"),
  deleteCategoryBtn: document.querySelector("#deleteCategoryBtn"),
  clearLocalBtn: document.querySelector("#clearLocalBtn"),
  backupLocalBtn: document.querySelector("#backupLocalBtn"),
  restoreLocalFile: document.querySelector("#restoreLocalFile"),
  mailboxCategoryFilter: document.querySelector("#mailboxCategoryFilter"),
  mailboxSearch: document.querySelector("#mailboxSearch"),
  mailboxList: document.querySelector("#mailboxList"),
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
  loginConsole: document.querySelector("#loginConsole"),
  loginSelectedBtn: document.querySelector("#loginSelectedBtn"),
  loginRetryBtn: document.querySelector("#loginRetryBtn"),
  exportCpaBtn: document.querySelector("#exportCpaBtn"),
  exportSub2Btn: document.querySelector("#exportSub2Btn"),
  cpaBaseUrl: document.querySelector("#cpaBaseUrl"),
  cpaKey: document.querySelector("#cpaKey"),
  cpaLimit: document.querySelector("#cpaLimit"),
  scanCpaBtn: document.querySelector("#scanCpaBtn"),
  scanSelectedMailBtn: document.querySelector("#scanSelectedMailBtn"),
  clearAbnormalBtn: document.querySelector("#clearAbnormalBtn"),
  loginTableBody: document.querySelector("#loginTableBody"),
  loginTotal: document.querySelector("#loginTotal"),
  loginIdle: document.querySelector("#loginIdle"),
  loginRunning: document.querySelector("#loginRunning"),
  loginSuccess: document.querySelector("#loginSuccess"),
  loginFailed: document.querySelector("#loginFailed"),
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
  pushRefreshBtn: document.querySelector("#pushRefreshBtn"),
  deleteMessageBtn: document.querySelector("#deleteMessageBtn"),
  toast: document.querySelector("#toast"),
};

repairLocalStorageKeys(Object.values(STORAGE_KEYS));

const storedAccounts = loadJson(STORAGE_KEYS.accounts, []);
const normalizedAccounts = normalizeStoredAccounts(storedAccounts);
if (JSON.stringify(storedAccounts) !== JSON.stringify(normalizedAccounts)) {
  saveJson(STORAGE_KEYS.accounts, normalizedAccounts);
}

const state = {
  accounts: normalizedAccounts,
  categories: normalizeStoredCategories(loadJson(STORAGE_KEYS.categories, [])),
  messages: normalizeStoredMessages(loadJson(STORAGE_KEYS.messages, [])),
  ignoredMessageKeys: new Set(loadJson(STORAGE_KEYS.ignoredMessages, [])),
  abnormalRows: normalizeStoredAbnormalRows(loadJson(STORAGE_KEYS.abnormalRows, [])),
  selectedAbnormal: new Set(),
  selected: new Set(),
  activeMessageKey: "",
  activeImportSource: "",
  activeView: "mail",
  loginJobs: new Map(),
  loginPoller: undefined,
  page: 1,
  mailboxPage: 1,
};

const cpaSettings = loadJson(STORAGE_KEYS.cpaSettings, {});
const tempSettings = loadJson(STORAGE_KEYS.tempSettings, {});
const authQueryToken = new URLSearchParams(window.location.search).get("token") || "";
const workspaceId = getWorkspaceId();
els.cpaBaseUrl.value = cpaSettings.base_url || "";
els.cpaKey.value = cpaSettings.management_key || "";
els.cpaLimit.value = cpaSettings.max_items || "50";
els.importTempApi.value = normalizeTempWorkerUrl(tempSettings.base_url || DEFAULT_TEMP_WORKER_URL);
els.importTempSitePassword.value = tempSettings.site_password || "";
if (tempSettings.base_url && tempSettings.base_url !== els.importTempApi.value) {
  saveJson(STORAGE_KEYS.tempSettings, {
    ...tempSettings,
    base_url: els.importTempApi.value,
  });
}

if (authQueryToken) {
  localStorage.setItem("ctgptm.admin.toolToken", authQueryToken);
}

localStorage.removeItem("ctgptm.mail.tempWorkerUrl");

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? repairStoredJson(JSON.parse(raw)) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getWorkspaceId() {
  const existing = localStorage.getItem(STORAGE_KEYS.workspaceId) || "";
  if (/^[A-Za-z0-9][A-Za-z0-9_.-]{5,63}$/.test(existing)) return existing;
  const next = `ws_${crypto.randomUUID().replace(/-/g, "")}`;
  localStorage.setItem(STORAGE_KEYS.workspaceId, next);
  return next;
}

function repairMojibakeText(value) {
  if (typeof value !== "string" || !value) return value;
  let text = value;
  MOJIBAKE_TEXT_FIXES.forEach((fixed, broken) => {
    text = text.split(broken).join(fixed);
  });
  return text;
}

function repairStoredJson(value) {
  if (typeof value === "string") return repairMojibakeText(value);
  if (Array.isArray(value)) return value.map((item) => repairStoredJson(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairStoredJson(item)]));
  }
  return value;
}

function repairLocalStorageKeys(keys) {
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
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const snippet = text.replace(/\s+/g, " ").slice(0, 220);
    throw new Error(`${label} returned non-JSON (${response.status}): ${snippet}`);
  }
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
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function hasAdminToken() {
  return Boolean(rememberedAdminToken());
}

function accountHasMaskedCredential(account) {
  if (!account) return false;
  if (account.source === "microsoft") {
    return isMaskedSecret(account.refresh_token) || isMaskedSecret(account.client_id);
  }
  return isMaskedSecret(account.jwt) || isMaskedSecret(account.site_password);
}

function hasUsableLocalCredential(account) {
  if (!account) return false;
  if (account.source === "microsoft") {
    return Boolean(account.email && account.client_id && account.refresh_token
      && !isMaskedSecret(account.client_id) && !isMaskedSecret(account.refresh_token));
  }
  return Boolean(account.email && account.jwt && !isMaskedSecret(account.jwt)
    && !isMaskedSecret(account.site_password));
}

function accountIdsForPayload(payload) {
  return new Set([
    ...(payload.accounts || []).map((item) => `microsoft:${String(item.email || "").toLowerCase()}`),
    ...(payload.temp_addresses || []).map((item) => `temp:${String(item.email || "").toLowerCase()}`),
  ]);
}

function selectedAccountsForPayload(payload) {
  const accountIds = accountIdsForPayload(payload);
  return state.accounts.filter((account) => accountIds.has(account.id));
}

function hasUsableLocalCredentialsForPayload(payload) {
  return selectedAccountsForPayload(payload).some(hasUsableLocalCredential);
}

function shouldUseServerStoredAccounts(payload) {
  if (!hasAdminToken()) return false;
  const selectedAccounts = selectedAccountsForPayload(payload);
  return selectedAccounts.some(accountHasMaskedCredential)
    && !selectedAccounts.some(hasUsableLocalCredential);
}

function normalizeProviderValue(value) {
  const provider = String(value || "auto").toLowerCase();
  return ["auto", "graph", "imap"].includes(provider) ? provider : "auto";
}

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
  };
}

function payloadHasMaskedCredentials(payload) {
  return (payload.accounts || []).some((account) =>
    isMaskedSecret(account.refresh_token) || isMaskedSecret(account.client_id)
  ) || (payload.temp_addresses || []).some((address) =>
    isMaskedSecret(address.jwt) || isMaskedSecret(address.site_password)
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
  return raw;
}

const MAIL_ERROR_LABELS = {
  dns_failed: "DNS 解析失败",
  temp_invalid_credential: "临时邮箱 JWT 无效",
  temp_config_missing: "临时邮箱配置缺失",
  temp_api_http_error: "临时邮箱 API 异常",
  outlook_credential_format: "Outlook 凭证格式错误",
  outlook_client_mismatch: "Outlook client_id 不匹配",
  outlook_refresh_expired: "Outlook RT 过期",
  graph_token_failed: "Graph 授权失败",
  imap_token_failed: "IMAP 授权失败",
  graph_fetch_failed: "Graph 收信失败",
  imap_fetch_failed: "IMAP 收信失败",
  network_tls_eof: "网络连接被截断",
  network_failed: "网络请求失败",
  mail_fetch_failed: "收信失败",
};

function sourceForResult(result) {
  const source = String(result?.source || "").toLowerCase();
  if (source === "temp") return "temp";
  if (source === "microsoft") return "microsoft";
  const provider = String(result?.provider || "").toLowerCase();
  if (provider.includes("temp") || provider.includes("cf")) return "temp";
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
  if (changed) saveJson(STORAGE_KEYS.accounts, state.accounts);
  return { ok, failed };
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeTempWorkerUrl(value) {
  let clean = normalizeUrl(value);
  if (clean && !/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
  return LEGACY_TEMP_WORKER_URLS.has(clean) ? DEFAULT_TEMP_WORKER_URL : (clean || DEFAULT_TEMP_WORKER_URL);
}

function isMaskedSecret(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /^\*+$/.test(text) || text.includes("...");
}

function preferRealSecret(nextValue, currentValue) {
  const nextText = String(nextValue || "");
  const currentText = String(currentValue || "");
  if (!nextText) return currentText;
  if (isMaskedSecret(nextText) && currentText && !isMaskedSecret(currentText)) {
    return currentText;
  }
  return nextText;
}

function normalizeStoredCategories(value) {
  if (!Array.isArray(value)) return [];
  const cleaned = [...new Set(value.map((category) => String(category || "").trim()).filter(Boolean))]
    .filter((category) => category !== "默认");
  return cleaned.length && cleaned.every((category) => LEGACY_SEEDED_CATEGORIES.has(category)) ? [] : cleaned;
}

function looksLikeJwt(value) {
  const text = String(value || "").trim();
  return text.split(".").length >= 3 || text.length > 80;
}

function looksLikeMicrosoftClientId(value) {
  const text = String(value || "").trim();
  if (!text || looksLikeUrl(text)) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
    || (/^[A-Za-z0-9._-]{20,}$/.test(text) && !looksLikeJwt(text));
}

function looksLikeMicrosoftRefreshToken(value) {
  const text = String(value || "").trim();
  return text.length >= 20 && !looksLikeUrl(text);
}

function normalizeStoredAccount(account) {
  if (!account || typeof account !== "object") return null;
  const email = String(account.email || "").trim();
  if (!email.includes("@")) return null;
  if (account.source === "temp"
    && looksLikeMicrosoftClientId(account.category)
    && looksLikeMicrosoftRefreshToken(account.site_password)) {
    return {
      ...account,
      id: `microsoft:${email.toLowerCase()}`,
      source: "microsoft",
      service: "Outlook",
      email,
      password: String(account.jwt || account.password || ""),
      client_id: String(account.category || ""),
      refresh_token: String(account.site_password || ""),
      jwt: "",
      site_password: "",
      category: "",
      selected: account.selected !== false,
    };
  }
  const tempCredential = String(account.jwt || (looksLikeJwt(account.password) ? account.password : "") || "");
  const treatAsTemp = account.source === "temp"
    || String(account.id || "").startsWith("temp:")
    || String(account.service || "").toLowerCase().includes("cloud")
    || Boolean(tempCredential);
  if (treatAsTemp) {
    return {
      ...account,
      id: `temp:${email.toLowerCase()}`,
      source: "temp",
      service: "临时邮箱",
      email,
      jwt: tempCredential,
      base_url: normalizeTempWorkerUrl(account.base_url || ""),
      password: "",
      client_id: "",
      refresh_token: "",
      category: account.category === "默认" ? "" : (account.category || ""),
      selected: account.selected !== false,
    };
  }
  return {
    ...account,
    id: `microsoft:${email.toLowerCase()}`,
    source: "microsoft",
    service: account.service || "Outlook",
    email,
    category: account.category === "默认" ? "" : (account.category || ""),
    selected: account.selected !== false,
  };
}

function normalizeStoredAccounts(value) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  value.forEach((account) => {
    const normalized = normalizeStoredAccount(account);
    if (!normalized) return;
    if (normalized.source === "temp") {
      byId.delete(`microsoft:${normalized.email.toLowerCase()}`);
    }
    byId.set(normalized.id, normalized);
  });
  return [...byId.values()].sort((a, b) => a.email.localeCompare(b.email));
}

function normalizeStoredMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.map((message) => ({
    ...message,
    category: message.category === "默认" ? "" : (message.category || ""),
  }));
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
  saveJson(STORAGE_KEYS.cpaSettings, {
    base_url: els.cpaBaseUrl.value.trim(),
    management_key: els.cpaKey.value,
    max_items: els.cpaLimit.value,
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

function serviceTone(account) {
  return account.source === "microsoft" ? "ms" : "temp";
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
  return looksMicrosoft ? MAIL_SERVICES.microsoft : MAIL_SERVICES.temp;
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
  if (!Array.isArray(items) || !items.length) return { imported: 0, updated: 0 };
  const byId = new Map(state.accounts.map((account) => [account.id, account]));
  let imported = 0;
  let updated = 0;
  items.forEach((item) => {
    if (!item?.id) return;
    if (item.source === "temp" && item.email) {
      byId.delete(`microsoft:${item.email.toLowerCase()}`);
    }
    const existing = byId.get(item.id);
    if (existing) {
      Object.assign(existing, item, {
        password: preferRealSecret(item.password, existing.password),
        client_id: preferRealSecret(item.client_id, existing.client_id),
        refresh_token: preferRealSecret(item.refresh_token, existing.refresh_token),
        jwt: preferRealSecret(item.jwt, existing.jwt),
        site_password: preferRealSecret(item.site_password, existing.site_password),
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
  state.accounts = [...byId.values()].sort((a, b) => a.email.localeCompare(b.email));
  saveJson(STORAGE_KEYS.accounts, state.accounts);
  saveJson(STORAGE_KEYS.categories, state.categories);
  return { imported, updated };
}

async function syncAccountsFromServer({ silent = false } = {}) {
  if (!hasAdminToken()) return false;
  try {
    const [accountsResponse, tempResponse] = await Promise.all([
      fetch("/api/accounts", { headers: apiHeaders(), cache: "no-store" }),
      fetch("/api/temp-addresses", { headers: apiHeaders(), cache: "no-store" }),
    ]);
    const [accountsData, tempData] = await Promise.all([
      readJsonResponse(accountsResponse, "/api/accounts"),
      readJsonResponse(tempResponse, "/api/temp-addresses"),
    ]);
    if (!accountsResponse.ok) {
      throw new Error(accountsData.error || accountsResponse.statusText || "服务端账号列表读取失败");
    }
    if (!tempResponse.ok) {
      throw new Error(tempData.error || tempResponse.statusText || "服务端临时邮箱列表读取失败");
    }
    const normalized = [
      ...((accountsData.accounts || []).map((item) => normalizeServerMailbox(item, "microsoft")).filter(Boolean)),
      ...((tempData.addresses || []).map((item) => normalizeServerMailbox(item, "temp")).filter(Boolean)),
    ];
    const summary = mergeServerAccountsSnapshot(normalized);
    if (!silent) {
      addClientLog(`已从服务端同步 ${normalized.length} 个邮箱，新增 ${summary.imported}，更新 ${summary.updated}`, "success");
      toast(`已从云端同步 ${normalized.length} 个邮箱`);
    }
    renderAll();
    return true;
  } catch (error) {
    if (!silent) {
      addClientLog(`云端邮箱同步失败：${error.message || "未知错误"}`, "warning");
      toast(error.message || "云端邮箱同步失败");
    }
    return false;
  }
}

function setActiveView(view) {
  state.activeView = view;
  state.page = 1;
  state.mailboxPage = 1;
  els.loginConsole.hidden = view !== "login";
  els.clientLogPanel.hidden = view !== "logs";
  els.mailSearchStrip.hidden = view !== "mail";
  els.mailStatusRow.hidden = view !== "mail";
  els.mailWorkspace.hidden = view !== "mail";
  els.importMailboxBtn.textContent = "导入邮箱";
  els.mailboxSearch.placeholder = "搜索邮箱";
  document.querySelectorAll(".module-tab").forEach((item) => item.classList.remove("active"));
  if (view === "login") {
    els.tabLoginBtn?.classList.add("active");
    els.tabLoginBtn?.setAttribute("aria-current", "page");
  } else if (view === "logs") {
    els.tabLogsBtn?.classList.add("active");
  } else {
    els.tabMailBtn.classList.add("active");
    els.tabMailBtn.setAttribute("aria-current", "page");
  }
  if (view !== "login") els.tabLoginBtn?.removeAttribute("aria-current");
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

function csvParts(line) {
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
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function structuredRowsFromObjects(items, source) {
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
    const rowSource = service.source === "auto" && (
      pickValue(item, ["client_id", "clientId"]) || pickValue(item, ["refresh_token", "refreshToken"])
    ) ? "microsoft" : service.source;
    const rowService = rowSource === "microsoft" ? MAIL_SERVICES.microsoft : MAIL_SERVICES.temp;
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
  const clean = String(name || "").trim();
  if (clean && !state.categories.includes(clean)) {
    state.categories.push(clean);
  }
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
  if (message?.is_banned || isBannedMessage(message)) return "封禁";
  return TYPE_LABELS[message?.mail_type] || message?.mail_type_label || "其他";
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
    saveJson(STORAGE_KEYS.accounts, state.accounts);
    saveJson(STORAGE_KEYS.categories, state.categories);
  }
  return changed;
}

function applyBannedStateFromMessages() {
  let changed = false;
  state.messages.forEach((message) => {
    if (!isBannedMessage(message)) return;
    if (!message.is_banned || message.category !== "已封禁") {
      message.is_banned = true;
      message.category = "已封禁";
      changed = true;
    }
    changed = markAccountBanned(message.account) || changed;
  });
  if (changed) {
    saveJson(STORAGE_KEYS.messages, state.messages);
  }
}

function removeCategory(name) {
  const clean = String(name || "").trim();
  if (!clean) return;
  state.categories = state.categories.filter((category) => category !== clean);
  state.accounts.forEach((account) => {
    if (account.category === clean) account.category = "";
  });
  state.messages.forEach((message) => {
    if (message.category === clean) message.category = "";
  });
  saveJson(STORAGE_KEYS.accounts, state.accounts);
  saveJson(STORAGE_KEYS.messages, state.messages);
  saveJson(STORAGE_KEYS.categories, state.categories);
}

function accountCategoryOptions(active) {
  const selected = active || "";
  return ["", ...state.categories].map((category) =>
    `<option value="${escapeHtml(category)}"${category === selected ? " selected" : ""}>${escapeHtml(category || EMPTY_CATEGORY_LABEL)}</option>`
  ).join("");
}

function filterAccounts() {
  const category = els.mailboxCategoryFilter.value;
  const query = els.mailboxSearch.value.trim().toLowerCase();
  return state.accounts.filter((account) => {
    if (category !== "all" && account.category !== category) return false;
    if (query && !account.email.toLowerCase().includes(query)) return false;
    return true;
  });
}

function filteredAccounts() {
  return filterAccounts();
}

function renderCategories() {
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
  const tempCount = state.accounts.filter((account) => account.source === "temp").length;
  const msCount = state.accounts.filter((account) => account.source === "microsoft").length;
  els.tempCount.textContent = String(tempCount);
  els.msCount.textContent = String(msCount);
  const accounts = filteredAccounts();
  els.mailboxTotal.textContent = String(accounts.length);
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
    els.mailboxList.textContent = state.activeView === "login" ? "暂无凭证" : "暂无邮箱";
    return;
  }
  els.mailboxList.className = "mailbox-list";
  els.mailboxList.innerHTML = pageAccounts.map((account) => {
    const stateClass = statusClass(account.last_status);
    const sourceClass = account.source === "temp" ? "temp" : "ms";
    const sourceText = account.source === "temp" ? "临时" : "Outlook";
    const checked = account.last_check_at ? ` · ${formatTime(account.last_check_at)}` : "";
    const count = Number(account.last_message_count || 0);
    const countText = account.last_status === "ok" ? ` · ${count} 封` : "";
    const title = [account.last_error_label, account.last_error, account.last_error_hint].filter(Boolean).join(" · ");
    const diagnosis = account.last_status === "error"
      ? `<em class="mailbox-diagnosis" title="${escapeHtml(title)}">${escapeHtml(account.last_error_label || "收信失败")}：${escapeHtml(account.last_error_hint || account.last_error || "请检查凭证或网络")}</em>`
      : `<em>${escapeHtml(statusLabel(account))}${escapeHtml(countText)}${escapeHtml(checked)}</em>`;
    return `
    <div class="mailbox-row refresh-state-${escapeHtml(stateClass)}" data-id="${escapeHtml(account.id)}">
      <label class="mailbox-check">
        <input type="checkbox" ${state.selected.has(account.id) ? "checked" : ""}>
        <span>
          <strong>${escapeHtml(account.email)}</strong>
          <small class="mailbox-meta">
            <b class="source-badge ${sourceClass}">${sourceText}</b>
            <b class="source-badge refresh-badge ${stateClass}">${escapeHtml(statusLabel(account))}</b>
          </small>
          ${diagnosis}
        </span>
      </label>
      <select>${accountCategoryOptions(account.category || "")}</select>
      <button class="icon danger" type="button" aria-label="删除">×</button>
    </div>
  `;
  }).join("");
}

function mailKey(message) {
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

function mergeMessages(incoming) {
  const categoryByEmail = new Map(state.accounts.map((account) => [account.email.toLowerCase(), account.category || ""]));
  const byKey = new Map(state.messages.map((message) => [mailKey(message), message]));
  let accountCategoryChanged = false;
  incoming.forEach((message) => {
    if (isIgnoredMessage(message)) return;
    const banned = isBannedMessage(message);
    if (banned) {
      accountCategoryChanged = markAccountBanned(message.account) || accountCategoryChanged;
      categoryByEmail.set(String(message.account || "").toLowerCase(), "已封禁");
    }
    const category = banned ? "已封禁" : (categoryByEmail.get(String(message.account || "").toLowerCase()) || "");
    const normalized = {
      ...message,
      category,
      is_banned: Boolean(banned || message.is_banned),
      mail_type: banned ? "banned" : message.mail_type,
      mail_type_label: banned ? "封禁" : (TYPE_LABELS[message.mail_type] || message.mail_type_label || "其他"),
      cached_at: new Date().toISOString(),
    };
    byKey.set(mailKey(normalized), normalized);
  });
  state.messages = [...byKey.values()]
    .sort((a, b) => sortableDate(b) - sortableDate(a))
    .slice(0, 2000);
  saveJson(STORAGE_KEYS.messages, state.messages);
  if (accountCategoryChanged) {
    renderCategories();
    renderAccounts();
  }
}

function sortableDate(message) {
  const value = new Date(message.received_at || message.cached_at || 0).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function filteredMessages() {
  const query = els.queryInput.value.trim().toLowerCase();
  const sender = els.senderInput.value.trim().toLowerCase();
  const source = els.sourceFilter.value;
  const type = els.typeFilter?.value || "all";
  const category = els.categoryFilter.value;
  return state.messages.filter((message) => {
    const haystack = [
      message.account,
      message.sender,
      message.subject,
      message.preview,
      message.body,
      message.folder,
      message.provider,
      message.mail_type_label,
      ...(message.codes || []),
      ...(message.links || []),
    ].join(" ").toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (sender && !String(message.sender || "").toLowerCase().includes(sender)) return false;
    if (source !== "all" && message.source !== source) return false;
    if (type !== "all" && message.mail_type !== type) return false;
    if (category !== "all" && message.category !== category) return false;
    return true;
  });
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function iframeDocument(content) {
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
  const messages = filteredMessages();
  const size = Number(els.pageSize.value || 20);
  const pages = Math.max(1, Math.ceil(messages.length / size));
  state.page = Math.min(Math.max(1, state.page), pages);
  const start = (state.page - 1) * size;
  const pageItems = messages.slice(start, start + size);

  els.pageSummary.textContent = `${messages.length} 封邮件`;
  els.pageText.textContent = `${state.page} / ${pages}`;
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= pages;
  if (els.deleteFilteredBtn) {
    els.deleteFilteredBtn.disabled = !messages.length;
    els.deleteFilteredBtn.textContent = messages.length ? `删除 ${messages.length}` : "批量删除";
  }

  if (!pageItems.length) {
    els.mailList.className = "mail-list empty";
    els.mailList.textContent = state.messages.length ? "没有匹配的邮件" : "导入邮箱后点击刷新邮件";
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
  if (!message) {
    els.copyCodeBtn.disabled = true;
    els.pushRefreshBtn.disabled = true;
    els.deleteMessageBtn.disabled = true;
    els.mailDetail.className = "mail-detail empty";
    els.mailDetail.textContent = "从左侧邮件列表选择一封邮件。";
    return;
  }
  const codes = Array.isArray(message.codes) ? message.codes : [];
  els.copyCodeBtn.disabled = !codes.length;
  els.pushRefreshBtn.disabled = false;
  els.deleteMessageBtn.disabled = false;
  els.mailDetail.className = `mail-detail${message.is_banned ? " banned" : ""}`;
  const visibleCodes = codes.slice(0, 3);
  const hiddenCodeCount = Math.max(0, codes.length - visibleCodes.length);
  const codeBlock = codes.length
    ? `<div class="detail-codes">${visibleCodes.map((code) => `<span>${escapeHtml(code)}</span>`).join("")}${hiddenCodeCount ? `<span class="more">+${hiddenCodeCount}</span>` : ""}</div>`
    : `<p class="muted">这封邮件没有识别到验证码。</p>`;
  const plainBody = message.body || message.preview || htmlToPlainText(message.html_body) || "";
  const bodyBlock = message.html_body
    ? `
      <iframe class="mail-html-frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" scrolling="auto"></iframe>
      ${plainBody ? `<details class="plain-fallback"><summary>纯文本备用</summary><pre class="mail-body-text">${escapeHtml(plainBody)}</pre></details>` : ""}
    `
    : `<pre class="mail-body-text">${escapeHtml(plainBody)}</pre>`;
  els.mailDetail.innerHTML = `
    <h3>${escapeHtml(message.subject || "(无主题)")}</h3>
    <div class="detail-meta">
      <span>${escapeHtml(message.sender || "-")}</span>
      <span>${escapeHtml(message.account || "-")}</span>
      <span>${escapeHtml(formatTime(message.received_at))}</span>
      <span>${escapeHtml(message.category || EMPTY_CATEGORY_LABEL)}</span>
    </div>
    ${codeBlock}
    ${bodyBlock}
  `;
  const frame = els.mailDetail.querySelector(".mail-html-frame");
  if (frame && message.html_body) {
    const resizeFrame = () => {
      try {
        const doc = frame.contentDocument;
        const available = Math.max(180, Math.min(520, els.mailDetail.clientHeight - frame.offsetTop - 20));
        const contentHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 0) + 18;
        frame.style.height = `${Math.min(available, Math.max(180, contentHeight))}px`;
      } catch {
        frame.style.height = "280px";
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

function payloadForSync() {
  const selected = state.accounts.filter((account) => state.selected.has(account.id));
  const targets = selected.length ? selected : state.accounts;
  const source = els.sourceFilter.value;
  const includeTemp = source === "all" || source === "temp";
  const includeMicrosoft = source === "all" || source === "microsoft";
  return {
    source,
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
  };
}

function accountPayloadForMessage(message) {
  const account = state.accounts.find((item) =>
    item.source === (message.source === "temp" ? "temp" : "microsoft")
    && item.email.toLowerCase() === String(message.account || "").toLowerCase()
  );
  if (!account) return { accounts: [], temp_addresses: [] };
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
  };
}

function removeMessageLocally(message) {
  const key = mailKey(message);
  state.ignoredMessageKeys.add(key);
  state.messages = state.messages.filter((item) => mailKey(item) !== key);
  if (state.activeMessageKey === key) {
    state.activeMessageKey = "";
  }
  saveIgnoredMessages();
  saveJson(STORAGE_KEYS.messages, state.messages);
  renderMessages();
}

function removeMessagesLocally(messages) {
  const keys = new Set(messages.map(mailKey));
  keys.forEach((key) => state.ignoredMessageKeys.add(key));
  state.messages = state.messages.filter((item) => !keys.has(mailKey(item)));
  if (keys.has(state.activeMessageKey)) {
    state.activeMessageKey = "";
  }
  saveIgnoredMessages();
  saveJson(STORAGE_KEYS.messages, state.messages);
  renderMessages();
  return keys.size;
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
    removeMessageLocally(message);
    addClientLog("已删除本地邮件缓存，并加入忽略列表", "success");
    toast("已删除本地邮件");
  } catch (error) {
    addClientLog(`删除邮件失败：${error.message || "未知错误"}`, "error");
    toast(error.message || "删除失败");
  } finally {
    els.deleteMessageBtn.disabled = !state.activeMessageKey;
    els.deleteMessageBtn.textContent = "删除邮件";
  }
}

function deleteFilteredMessages() {
  const messages = filteredMessages();
  if (!messages.length) return;
  const selectedAccounts = state.accounts.filter((account) => state.selected.has(account.id));
  const scope = selectedAccounts.length ? `当前筛选/选中范围的 ${messages.length} 封邮件` : `当前筛选结果的 ${messages.length} 封邮件`;
  if (!confirm(`确认删除${scope}？只删除本工具本地缓存，不会删除远端真实邮箱；后续刷新也不会再显示这些邮件。`)) return;
  const deleted = removeMessagesLocally(messages);
  addClientLog(`已批量删除 ${deleted} 封本地邮件缓存`, "success");
  toast(`已批量删除 ${deleted} 封本地邮件`);
}
function serverPayloadForSync() {
  const selected = state.accounts.filter((account) => state.selected.has(account.id));
  const targets = selected.length ? selected : state.accounts;
  const payload = payloadForSync();
  const maskedIds = new Set(
    selectedAccountsForPayload(payload)
      .filter((account) => accountHasMaskedCredential(account) && !hasUsableLocalCredential(account))
      .map((account) => account.id)
  );
  return {
    source: els.sourceFilter.value,
    provider: els.providerFilter?.value || "auto",
    sender_filter: els.senderInput.value.trim(),
    limit: 20,
    emails: targets.filter((account) => maskedIds.has(account.id)).map((account) => account.email),
  };
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
  const shouldUploadToCpa = row.source_kind === "cpa" && els.cpaBaseUrl.value.trim() && els.cpaKey.value.trim();
  return {
    login_only: !shouldUploadToCpa,
    base_url: shouldUploadToCpa ? els.cpaBaseUrl.value.trim() : "",
    management_key: shouldUploadToCpa ? els.cpaKey.value : "",
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
  return [
    row.source_kind || row.source || "local",
    String(row.email || row.name || "").toLowerCase(),
    String(row.cpa_name || row.auth_index || ""),
  ].join("|");
}

function rowToRefreshQueueItem(row) {
  const account = accountForRow(row);
  const email = row.email || account?.email || "";
  return compactObject({
    id: row.source_kind === "cpa"
      ? `cpa-refresh:${String(row.cpa_name || row.auth_index || email || row.id || crypto.randomUUID()).toLowerCase()}`
      : `refresh:${account?.id || row.account_id || email || row.id || crypto.randomUUID()}`,
    source_kind: row.source_kind || "local",
    source: row.source_kind === "cpa" ? "cpa" : (account?.source || "local"),
    service: row.source_kind === "cpa" ? "CPA" : (account?.source === "microsoft" ? (account.service || "Outlook") : "临时邮箱"),
    email,
    name: row.name || email,
    cpa_name: row.cpa_name || "",
    auth_index: row.auth_index || "",
    account_id: account?.id || row.account_id || "",
    cpa_base_url: row.source_kind === "cpa" ? els.cpaBaseUrl.value.trim() : "",
    cpa_management_key: row.source_kind === "cpa" ? els.cpaKey.value : "",
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
  const byKey = new Map((Array.isArray(queue) ? queue : []).map((row) => [refreshQueueKey(row), row]));
  let added = 0;
  rows.forEach((row) => {
    if (!isRowRefreshable(row)) return;
    const item = rowToRefreshQueueItem(row);
    const key = refreshQueueKey(item);
    const previous = byKey.get(key);
    byKey.set(key, { ...(previous || {}), ...item, status: previous?.status || "idle" });
    if (!previous) added += 1;
    row.status = "queued";
    row.error = "";
    state.loginJobs.set(row.id, { status: "queued", error: "", logs: [] });
  });
  saveJson(STORAGE_KEYS.refreshQueue, [...byKey.values()]);
  saveAbnormalRows();
  renderLoginTable();
  addClientLog(`已加入刷新队列：${rows.length} 个账号，新增 ${added} 个；请到凭证刷新页统一执行。`, "success");
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
  const selected = state.accounts.filter((account) => state.selected.has(account.id));
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
  const baseUrl = els.cpaBaseUrl.value.trim();
  const managementKey = els.cpaKey.value.trim();
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
        max_items: Number(els.cpaLimit.value || 50),
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
    setActiveView("login");
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
    version: "20260529-openai-headers-align",
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

function renderLoginTable() {
  const rows = state.abnormalRows;
  const counts = { idle: 0, queued: 0, running: 0, success: 0, failed: 0 };
  rows.forEach((row) => {
    const status = rowStateFor(row).status || "idle";
    counts[status] = (counts[status] || 0) + 1;
  });
  els.loginTotal.textContent = String(rows.length);
  els.loginIdle.textContent = String(counts.idle || 0);
  els.loginRunning.textContent = String((counts.queued || 0) + (counts.running || 0));
  els.loginSuccess.textContent = String(counts.success || 0);
  els.loginFailed.textContent = String(counts.failed || 0);
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
  const base = chosen.length ? chosen : state.abnormalRows;
  return failedOnly ? base.filter((row) => rowStateFor(row).status === "failed") : base;
}

function startLoginForRows(rows) {
  if (!rows.length) {
    toast("没有可加入队列的异常账号");
    return;
  }
  setActiveView("login");
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
      const response = await fetch(`/client-api/cpa/login-status?job_id=${encodeURIComponent(current.jobId)}`, { headers: apiHeaders(), cache: "no-store" });
      const data = await readJsonResponse(response, "/client-api/cpa/login-status");
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
}

Object.assign(MAIL_SERVICES.microsoft, {
  hint: "支持 TXT / JSON / CSV。文本格式：邮箱----密码----client_id----refresh_token----分组(可选)。",
  placeholder: "user@outlook.com----password----client_id----refresh_token----默认分组",
});
Object.assign(MAIL_SERVICES.temp, {
  hint: "支持 TXT / JSON / CSV。文本格式：邮箱----JWT；可选：邮箱----JWT----分组。Temp API 已默认填好。",
  placeholder: "user@example.com----JWT_TOKEN",
});
Object.assign(MAIL_SERVICES.auto, {
  hint: "支持 TXT / JSON / CSV。自动识别：Outlook 用 邮箱----密码----client_id----refresh_token；临时邮箱用 邮箱----JWT。",
  placeholder: "user@outlook.com----password----client_id----refresh_token----默认分组\nuser@example.com----JWT_TOKEN",
});
function looksLikeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^https?:\/\//i.test(text)) return true;
  if (/^(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?(\/|$)/i.test(text)) return true;
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(:\d+)?(\/|$)/i.test(text);
}

function csvPartsFlexible(line) {
  return csvParts(line);
}

function parseTempParts(parts, service, email) {
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

function parseLines(text, source) {
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
  const duplicateCount = rows.length - new Set(rows.map((row) => row.id)).size;
  const missing = rows.filter((row) =>
    row.source === "temp" ? !row.jwt : (!row.password || !row.client_id || !row.refresh_token)
  ).length;
  const issues = errors.length + missing;
  els.importPreview.className = `import-preview ${issues ? "warning" : "ok"}`;
  els.importPreview.textContent = [
    `识别 ${rows.length} 个账号`,
    temp ? `临时邮箱 ${temp}` : "",
    microsoft ? `Outlook ${microsoft}` : "",
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
    if (existing) {
      Object.assign(existing, account, {
        updated_at: new Date().toISOString(),
      });
      updated += 1;
    } else {
      byId.set(account.id, {
        ...account,
        updated_at: new Date().toISOString(),
      });
      imported += 1;
    }
    state.selected.add(account.id);
    if (account.category) ensureCategory(account.category);
  });
  state.accounts = [...byId.values()].sort((a, b) => a.email.localeCompare(b.email));
  saveJson(STORAGE_KEYS.accounts, state.accounts);
  saveJson(STORAGE_KEYS.categories, state.categories);
  return { imported, updated };
}

async function persistImportedAccounts(source, rows) {
  if (!rows.length) return { imported: 0, updated: 0, localOnly: true };
  return { imported: rows.length, updated: 0, localOnly: true };
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
  const summary = upsertAccounts(rows);
  await persistImportedAccounts(source, rows);
  addClientLog(`导入 ${rows.length} 个账号；仅保存在当前浏览器本地`, "success");
  toast(`已导入 ${summary.imported} 个账号${summary.updated ? `，更新 ${summary.updated} 个` : ""}${errors.length ? `，${errors.length} 行失败` : ""}`);
  renderAll();
  closeImportDialog();
}

function updateImportDialogCopy() {
  const source = els.importServiceSelect.value || "auto";
  const service = MAIL_SERVICES[source] || MAIL_SERVICES.auto;
  state.activeImportSource = source;
  els.importModalEyebrow.textContent = service.label;
  els.importModal.dataset.serviceTone = service.tone || service.source;
  els.importModalTitle.textContent = "导入邮箱";
  els.importFormatHint.textContent = service.hint;
  els.importText.placeholder = service.placeholder;
  const tempMode = service.source === "temp";
  els.importTempApiField.hidden = !tempMode;
  els.importTempSitePasswordField.hidden = !tempMode;
  importPreviewText();
}

function openImportDialog(source = "temp") {
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
  els.importModal.hidden = true;
  document.body.classList.remove("modal-open");
  state.activeImportSource = "";
  els.importText.value = "";
  els.importFile.value = "";
  importPreviewText();
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
  const payload = payloadForSync();
  const total = payload.temp_addresses.length + payload.accounts.length;
  if (!total) {
    toast("当前筛选下没有可刷新邮箱");
    return;
  }
  const useServerStoredAccounts = shouldUseServerStoredAccounts(payload);
  const provider = normalizeProviderValue(els.providerFilter?.value);
  if (els.providerFilter && provider !== "auto") {
    addClientLog(`当前选择 ${provider === "graph" ? "Graph" : "IMAP"} 单一路径；如果失败，请切回“微软自动”。`, "warning");
  }
  if (payloadHasMaskedCredentials(payload) && !useServerStoredAccounts && !hasUsableLocalCredentialsForPayload(payload)) {
    toast(localCredentialHint());
    els.statusText.textContent = "当前浏览器没有真实凭证";
    return;
  }
  els.syncBtn.disabled = true;
  els.syncBtn.textContent = "刷新中";
  els.statusText.textContent = `正在刷新 ${total} 个邮箱`;
  setInlineProgress(els.mailProgress, 12, "准备");
  try {
    const endpoint = useServerStoredAccounts ? "/api/fetch" : "/client-api/fetch";
    const requestPayload = useServerStoredAccounts ? serverPayloadForSync() : clientPayloadForSync(payload);
    requestPayload.provider = provider;
    setInlineProgress(els.mailProgress, 35, "请求中");
    addClientLog(`刷新请求：${requestPayload.accounts?.length || 0} 个 Outlook，${requestPayload.temp_addresses?.length || 0} 个临时邮箱，方式 ${provider}`, "info");
    addClientLog(useServerStoredAccounts
      ? "本次使用管理员服务端保存的打码账号刷新"
      : "本次使用当前浏览器本地导入的邮箱凭证刷新", "info");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(requestPayload),
    });
    const data = await readJsonResponse(response, endpoint);
    if (!response.ok) throw new Error(data.error || response.statusText);
    setInlineProgress(els.mailProgress, 72, "处理中");
    mergeMessages(data.messages || []);
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
    const messageCount = Number(summary.messages ?? (data.messages || []).length);
    els.statusText.textContent = errors.length
      ? `刷新完成：成功 ${okCount}，失败 ${failedCount}，新收 ${messageCount} 封；首个原因：${String(errors[0]).slice(0, 90)}`
      : `刷新完成：成功 ${okCount}，新收 ${messageCount} 封`;
    (data.results || []).filter((result) => !result.ok).slice(0, 12).forEach((result) => {
      const label = result.error_label || result.error_code || "收信失败";
      const hint = result.error_hint || humanizeMailError((result.errors || [])[0] || result.error || "");
      addClientLog(`${result.email || "未知邮箱"}：${label}${hint ? `，${hint}` : ""}`, "error");
    });
    toast(errors.length ? "刷新完成，但有邮箱失败" : (useServerStoredAccounts ? "已用服务端凭证刷新" : "刷新完成"));
    state.page = 1;
    renderAccounts();
    renderMessages();
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

function pushActiveMessageAccountToRefresh() {
  const message = state.messages.find((item) => mailKey(item) === state.activeMessageKey);
  if (!message) return;
  const email = String(message.account || "").toLowerCase();
  const account = state.accounts.find((item) => String(item.email || "").toLowerCase() === email);
  if (!account) {
    toast("未找到这封邮件对应的邮箱");
    return;
  }
  const queue = loadJson(STORAGE_KEYS.refreshQueue, []);
  const rowId = `refresh:${account.id}`;
  const exists = queue.some((row) => row.id === rowId || String(row.email || "").toLowerCase() === email);
  if (!exists) {
    queue.push({
      id: rowId,
      source_kind: "local",
      email: account.email,
      name: account.email,
      account_id: account.id,
      source: account.source,
      service: account.source === "microsoft" ? (account.service || "Outlook") : "临时邮箱",
      status: "idle",
      error: "",
      logs: [],
      auth_file: account.auth_file || null,
    });
    saveJson(STORAGE_KEYS.refreshQueue, queue);
  }
  toast(exists ? "这个邮箱已在凭证刷新池" : "已推送到凭证刷新池");
}
function renderAll() {
  renderCategories();
  renderAccounts();
  renderMessages();
  renderLoginTable();
}

els.importMailboxBtn.addEventListener("click", () => openImportDialog("auto"));
els.tabImportBtn?.addEventListener("click", () => openImportDialog("auto"));
els.tabLoginBtn?.addEventListener("click", () => setActiveView("login"));
els.tabLogsBtn?.addEventListener("click", () => setActiveView("logs"));
els.tabMailBtn.addEventListener("click", () => setActiveView("mail"));
els.importServiceSelect.addEventListener("change", updateImportDialogCopy);
els.importFile.addEventListener("change", () => readTextFileToTextarea(els.importFile, els.importText));
els.closeImportModal.addEventListener("click", closeImportDialog);
els.cancelImportBtn.addEventListener("click", closeImportDialog);
els.importModal.addEventListener("click", (event) => {
  if (event.target === els.importModal) closeImportDialog();
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
els.addCategoryBtn.addEventListener("click", () => {
  const name = els.categoryName.value.trim();
  if (!name) return;
  ensureCategory(name);
  els.categoryName.value = "";
  saveJson(STORAGE_KEYS.categories, state.categories);
  renderAll();
});
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
  if (!confirm("确定清空当前浏览器里的邮箱、分类和邮件缓存？")) return;
  state.accounts = [];
  state.messages = [];
  state.selected.clear();
  state.activeMessageKey = "";
  saveJson(STORAGE_KEYS.accounts, state.accounts);
  saveJson(STORAGE_KEYS.messages, state.messages);
  renderAll();
});
els.selectAllBtn.addEventListener("click", () => {
  const accounts = filteredAccounts();
  const allSelected = accounts.every((account) => state.selected.has(account.id));
  accounts.forEach((account) => {
    if (allSelected) state.selected.delete(account.id);
    else state.selected.add(account.id);
  });
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
els.mailboxList.addEventListener("change", (event) => {
  const row = event.target.closest(".mailbox-row");
  if (!row) return;
  const account = state.accounts.find((item) => item.id === row.dataset.id);
  if (!account) return;
  if (event.target.matches("input[type='checkbox']")) {
    if (event.target.checked) state.selected.add(account.id);
    else state.selected.delete(account.id);
  }
  if (event.target.matches("select")) {
    account.category = event.target.value;
    saveJson(STORAGE_KEYS.accounts, state.accounts);
    state.messages.forEach((message) => {
      if (String(message.account || "").toLowerCase() === account.email.toLowerCase()) {
        message.category = account.category;
      }
    });
    saveJson(STORAGE_KEYS.messages, state.messages);
    renderAll();
  }
});
els.mailboxList.addEventListener("click", (event) => {
  const row = event.target.closest(".mailbox-row");
  if (!row || !event.target.matches("button")) return;
  state.accounts = state.accounts.filter((account) => account.id !== row.dataset.id);
  state.selected.delete(row.dataset.id);
  state.abnormalRows = state.abnormalRows.filter((item) => item.account_id !== row.dataset.id);
  state.selectedAbnormal.delete(row.dataset.id);
  saveJson(STORAGE_KEYS.accounts, state.accounts);
  saveAbnormalRows();
  renderAll();
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
els.pushRefreshBtn?.addEventListener("click", pushActiveMessageAccountToRefresh);
els.deleteMessageBtn.addEventListener("click", deleteActiveMessage);
els.deleteFilteredBtn?.addEventListener("click", deleteFilteredMessages);
els.scanCpaBtn.addEventListener("click", scanCpaAbnormal);
els.scanSelectedMailBtn.addEventListener("click", scanSelectedMailboxes);
els.clearAbnormalBtn.addEventListener("click", () => {
  state.abnormalRows = [];
  state.selectedAbnormal.clear();
  state.loginJobs.clear();
  saveAbnormalRows();
  renderLoginTable();
});
els.cpaBaseUrl.addEventListener("change", saveCpaSettings);
els.cpaKey.addEventListener("change", saveCpaSettings);
els.cpaLimit.addEventListener("change", saveCpaSettings);
els.loginSelectedBtn.addEventListener("click", () => startLoginForRows(selectedAbnormalRows()));
els.loginRetryBtn.addEventListener("click", () => startLoginForRows(selectedAbnormalRows({ failedOnly: true })));
els.exportCpaBtn.addEventListener("click", () => exportCredentialJson("cpa"));
els.exportSub2Btn.addEventListener("click", () => exportCredentialJson("sub2api"));
els.clearClientLogsBtn.addEventListener("click", () => {
  els.clientLogList.innerHTML = '<div class="client-log-item">等待操作。</div>';
});
els.loginTableBody.addEventListener("click", (event) => {
  const button = event.target.closest(".login-one");
  if (!button) return;
  const row = button.closest("tr");
  const item = state.abnormalRows.find((candidate) => candidate.id === row?.dataset.id);
  if (item) startLoginForRows([item]);
});
els.loginTableBody.addEventListener("change", (event) => {
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
  renderMessages();
});
els.nextPage.addEventListener("click", () => {
  state.page += 1;
  renderMessages();
});
[
  els.mailboxCategoryFilter,
  els.mailboxSearch,
  els.mailboxPageSize,
  els.queryInput,
  els.senderInput,
  els.sourceFilter,
  els.providerFilter,
  els.typeFilter,
  els.categoryFilter,
  els.pageSize,
].forEach((input) => {
  if (!input) return;
  input.addEventListener("input", () => {
    state.page = 1;
    state.mailboxPage = 1;
    renderAll();
  });
  input.addEventListener("change", () => {
    state.page = 1;
    state.mailboxPage = 1;
    renderAll();
  });
});

applyBannedStateFromMessages();
renderAll();
setActiveView("mail");



