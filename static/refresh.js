const STORAGE_KEYS = {
  accounts: "ctgptm.mail.accounts",
  categories: "ctgptm.mail.categories",
  refreshQueue: "ctgptm.mail.refreshQueue",
  refreshSettings: "ctgptm.mail.refreshSettings",
  phonePool: "ctgptm.mail.phonePool",
  workspaceId: "ctgptm.workspaceId",
};

const EMPTY_CATEGORY_LABEL = "未分组";
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
repairLocalStorageKeys(Object.values(STORAGE_KEYS));

const storedRefreshQueue = loadJson(STORAGE_KEYS.refreshQueue, []);
const normalizedRefreshQueue = normalizeQueue(storedRefreshQueue);
if (JSON.stringify(storedRefreshQueue) !== JSON.stringify(normalizedRefreshQueue)) {
  saveJson(STORAGE_KEYS.refreshQueue, normalizedRefreshQueue);
}

const state = {
  accounts: loadJson(STORAGE_KEYS.accounts, []),
  categories: loadJson(STORAGE_KEYS.categories, []),
  queue: normalizedRefreshQueue,
  selectedAccounts: new Set(),
  selectedQueue: new Set(),
  queueFilter: "all",
  jobs: new Map(),
  poller: undefined,
  phonePool: normalizePhonePool(loadJson(STORAGE_KEYS.phonePool, [])),
  sourcePage: 1,
  savedRefreshResults: new Map(),
  runProxyIps: new Set(),
  lastLog: null,
  logThrottle: new Map(),
  manualCodeTimers: new Map(),
  runner: null,
};

const MAX_LOGIN_ATTEMPTS = 3;
const ACCOUNT_COOLDOWN_MS = 6500;
const AUTO_RETRYABLE_CODES = new Set([
  "dns_failed",
  "proxy_connection_failed",
  "proxy_tls_eof",
  "proxy_timeout",
  "proxy_ip_unstable",
  "network_incomplete_read",
  "login_network_blocked",
  "oauth_session_missing",
  "oauth_callback_missing",
  "oauth_invalid_auth_step",
  "invalid_auth_step",
  "verification_code_missing",
  "verification_code_invalid",
  "risk_blocked",
  "openai_auth_risk_blocked",
  "openai_security_verification",
  "csrf_or_risk_blocked",
]);
const NON_RETRYABLE_CODES = new Set([
  "proxy_required",
  "proxy_format_invalid",
  "mail_credentials_missing",
  "mail_pickup_unavailable",
  "phone_verification_required",
  "account_banned",
  "account_not_found",
  "unsupported_country_region_territory",
  "openai_turnstile_challenge",
  "request_forbidden",
  "login_cancelled",
]);

const els = {
  sourceTotal: document.querySelector("#sourceTotal"),
  sourceSearch: document.querySelector("#sourceSearch"),
  sourceType: document.querySelector("#sourceType"),
  sourceCategory: document.querySelector("#sourceCategory"),
  sourceSelectAll: document.querySelector("#sourceSelectAll"),
  verifySelectedSources: document.querySelector("#verifySelectedSources"),
  addSelected: document.querySelector("#addSelected"),
  sourcePageSize: document.querySelector("#sourcePageSize"),
  sourcePrev: document.querySelector("#sourcePrev"),
  sourceNext: document.querySelector("#sourceNext"),
  sourcePageText: document.querySelector("#sourcePageText"),
  sourceList: document.querySelector("#sourceList"),
  removeSelectedSources: document.querySelector("#removeSelectedSources"),
  startSelected: document.querySelector("#startSelected"),
  retryFailed: document.querySelector("#retryFailed"),
  cleanFailed: document.querySelector("#cleanFailed"),
  exportCpa: document.querySelector("#exportCpa"),
  exportSub2: document.querySelector("#exportSub2"),
  clearQueue: document.querySelector("#clearQueue"),
  useProxy: document.querySelector("#useProxy"),
  proxyUrl: document.querySelector("#proxyUrl"),
  loginStrategy: document.querySelector("#loginStrategy"),
  loginConcurrency: document.querySelector("#loginConcurrency"),
  queueTotal: document.querySelector("#queueTotal"),
  queueIdle: document.querySelector("#queueIdle"),
  queueRunning: document.querySelector("#queueRunning"),
  queueSuccess: document.querySelector("#queueSuccess"),
  queueFailed: document.querySelector("#queueFailed"),
  queueProgress: document.querySelector("#queueProgress"),
  queueSelectAll: document.querySelector("#queueSelectAll"),
  queueBody: document.querySelector("#queueBody"),
  clearLogs: document.querySelector("#clearLogs"),
  logHint: document.querySelector("#logHint"),
  logList: document.querySelector("#logList"),
  toast: document.querySelector("#toast"),
  autoUpdateCpa: document.querySelector("#autoUpdateCpa"),
  cpaBaseUrl: document.querySelector("#cpaBaseUrl"),
  cpaManagementKey: document.querySelector("#cpaManagementKey"),
  taskMode: document.querySelector("#taskMode"),
  tempSyncApi: document.querySelector("#tempSyncApi"),
  tempSyncAdminKey: document.querySelector("#tempSyncAdminKey"),
  tempSyncSitePassword: document.querySelector("#tempSyncSitePassword"),
  syncTempCredentials: document.querySelector("#syncTempCredentials"),
  pickupImportText: document.querySelector("#pickupImportText"),
  importPickupCredentials: document.querySelector("#importPickupCredentials"),
  phoneNumber: document.querySelector("#phoneNumber"),
  phoneApiUrl: document.querySelector("#phoneApiUrl"),
  phoneModeBatch: document.querySelector("#phoneModeBatch"),
  phoneModeOneToOne: document.querySelector("#phoneModeOneToOne"),
  phoneBatchPanel: document.querySelector("#phoneBatchPanel"),
  phoneBatchText: document.querySelector("#phoneBatchText"),
  importPhoneBatch: document.querySelector("#importPhoneBatch"),
  phoneCodeAccount: document.querySelector("#phoneCodeAccount"),
  phoneCodeCurrent: document.querySelector("#phoneCodeCurrent"),
  saveManualPhoneCode: document.querySelector("#saveManualPhoneCode"),
  pollSelectedPhone: document.querySelector("#pollSelectedPhone"),
  addPhoneEntry: document.querySelector("#addPhoneEntry"),
  phonePoolList: document.querySelector("#phonePoolList"),
};

const settings = loadJson(STORAGE_KEYS.refreshSettings, {});
els.useProxy.checked = true;
els.proxyUrl.value = settings.proxy_url || "";
if (els.loginStrategy) els.loginStrategy.value = "protocol";
if (els.loginConcurrency) els.loginConcurrency.value = "1";
if (els.autoUpdateCpa) els.autoUpdateCpa.checked = Boolean(settings.auto_update_cpa);
if (els.cpaBaseUrl) els.cpaBaseUrl.value = settings.cpa_base_url || "";
if (els.cpaManagementKey) els.cpaManagementKey.value = settings.cpa_management_key || "";
if (els.taskMode) els.taskMode.value = settings.task_mode || "login";
if (els.tempSyncApi) els.tempSyncApi.value = settings.temp_sync_api || "";
if (els.tempSyncAdminKey) els.tempSyncAdminKey.value = settings.temp_sync_admin_key || "";
if (els.tempSyncSitePassword) els.tempSyncSitePassword.value = settings.temp_sync_site_password || "";
if (els.phoneModeBatch) els.phoneModeBatch.checked = settings.phone_pool_mode === "batch";
if (els.phoneModeOneToOne) els.phoneModeOneToOne.checked = settings.phone_pool_mode !== "batch";
if (els.loginStrategy) els.loginStrategy.value = "protocol";
if (els.taskMode) els.taskMode.value = "login";

const authQueryToken = new URLSearchParams(window.location.search).get("token") || "";
const workspaceId = getWorkspaceId();
if (authQueryToken) {
  localStorage.setItem("ctgptm.admin.toolToken", authQueryToken);
}

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

function withAdminToken(url) {
  const token = rememberedAdminToken();
  if (!token || !url || /^https?:\/\//i.test(url)) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add("show");
  clearTimeout(els.toast._timer);
  els.toast._timer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function parseErrorPayload(data, fallback = "启动失败") {
  return {
    error: data?.error || data?.message || fallback,
    error_code: data?.error_code || data?.code || "",
    error_hint: data?.error_hint || data?.hint || "",
    retryable: data?.retryable,
  };
}

const ERROR_MANUAL = {
  proxy_required: "需要代理",
  proxy_format_invalid: "代理格式错误",
  proxy_check_failed: "代理检测失败",
  proxy_ip_duplicate: "代理出口重复",
  proxy_ip_unstable: "代理出口不稳定",
  proxy_connection_failed: "代理连接失败",
  proxy_tls_eof: "代理 TLS 中断",
  proxy_timeout: "代理超时",
  dns_failed: "DNS 失败",
  mail_credentials_missing: "缺取码邮箱",
  mail_pickup_unavailable: "取码邮箱不可用",
  mail_verification_required: "请先验证邮箱",
  mail_verify_no_code: "未发现验证码",
  graph_token_failed: "Graph 授权失败",
  imap_token_failed: "IMAP 授权失败",
  graph_fetch_failed: "Graph 收信失败",
  imap_fetch_failed: "IMAP 收信失败",
  temp_invalid_credential: "临时邮箱 JWT 无效",
  temp_forbidden: "临时邮箱拒绝访问",
  network_tls_eof: "网络 TLS 中断",
  network_failed: "网络失败",
  admin_required: "需要管理员登录",
  delete_failed: "删除失败",
  temp_sync_config_missing: "临时邮箱同步配置缺失",
  temp_sync_failed: "临时邮箱同步失败",
  pickup_import_empty: "缺少 Outlook 取码资料",
  pickup_import_failed: "Outlook 取码导入失败",
  verification_code_missing: "未收到验证码",
  verification_code_invalid: "验证码无效",
  phone_verification_required: "需要手机验证",
  phone_2fa_failed: "二次验证失败",
  manual_phone_code_failed: "手机验证码保存失败",
  account_banned: "账号被封禁",
  account_not_found: "账号不存在",
  login_page_not_ready: "登录页未就绪",
  oauth_session_missing: "授权会话失败",
  oauth_callback_missing: "回调未完成",
  authorization_failed: "授权失败",
  unsupported_country_region_territory: "地区不支持",
  csrf_or_risk_blocked: "风控拦截",
  risk_blocked: "风控拦截",
  openai_turnstile_challenge: "安全验证",
  openai_security_verification: "安全验证",
  openai_auth_risk_blocked: "风控拦截",
  oauth_invalid_auth_step: "登录步骤失效",
  invalid_auth_step: "登录步骤失效",
  request_forbidden: "请求被拒绝",
  proxy_ip_unavailable: "代理出口不可用",
  phone_pool_empty: "手机池为空",
  phone_pool_api_invalid: "手机 API 格式错误",
  phone_code_missing: "未收到手机验证码",
  phone_code_fetch_failed: "手机取码失败",
  login_cancelled: "已终止",
  login_cancel_failed: "终止失败",
  network_incomplete_read: "网络中断",
  login_network_blocked: "网络受限",
  login_failed: "登录失败",
};

const LOG_STEP_LABELS = {
  oauth_init: "准备授权",
  authorize: "建立授权会话",
  sentinel: "生成风控令牌",
  mail_credentials: "检查取码邮箱",
  mail_verify: "验证邮箱",
  queue: "加入队列",
  egress: "检测代理出口",
  strategy: "建立登录会话",
  start: "任务启动",
  identifier: "提交邮箱",
  password: "处理登录方式",
  send_code: "发送邮箱验证码",
  waiting_code: "等待验证码",
  mail_code_poll: "查收邮箱",
  mail_code_missing: "未收到验证码",
  phone_pool: "绑定手机",
  phone_code: "手机取码",
  manual_phone_code: "手动手机验证码",
  verify_code: "提交验证码",
  callback: "接收授权回调",
  cpa_callback: "提交授权回调",
  token: "交换授权令牌",
  session: "读取会话",
  oauth: "获取授权",
  convert: "生成凭证",
  persist_success: "保存结果",
  persist_failed: "保存结果失败",
  uploading: "同步 CPA",
  upload: "同步 CPA",
  done: "完成",
  success: "完成",
  failed: "失败",
  cancel: "终止任务",
  browser_queue: "等待浏览器槽位",
  security_check: "等待安全验证",
  login_ready: "登录页就绪",
  login_loading: "登录页加载中",
  snapshot: "保存页面快照",
  hint: "处理建议",
};

const LOG_TYPE_LABELS = {
  info: "进度",
  success: "成功",
  warning: "提示",
  error: "错误",
};

const LOG_THROTTLE_MS = {
  authorize: 4500,
  egress: 1200,
  mail_code_poll: 2500,
};

function errorCodeLabel(code) {
  return ERROR_MANUAL[String(code || "")] || String(code || "login_failed");
}

function inferErrorCode(job = {}) {
  const current = String(job.error_code || job.code || "").trim();
  if (current && current !== "login_failed") return current;
  const text = `${job.error || ""} ${job.error_hint || ""} ${job.message || ""}`.toLowerCase();
  if (!text.trim()) return current || "";
  if (/phone verification|phone number|mobile|mfa|required phone|手机验证|手机号|手机号码/.test(text)) {
    return "phone_verification_required";
  }
  if (/deactivated|disabled|banned|suspended|deleted account|account deleted|账号被封|账号封禁|账号停用|已停用|被禁用/.test(text)) {
    return "account_banned";
  }
  if (/invalid verification code|invalid email code|invalid otp|incorrect code|code expired|expired code|email code verify failed|验证码无效|验证码错误|验证码已过期|验证码过期/.test(text)) {
    return "verification_code_invalid";
  }
  if (/no verification code|verification code was found|未收到验证码|没有收到验证码|取不到验证码/.test(text)) {
    return "verification_code_missing";
  }
  if (/user not found|account not found|no account|账号不存在|账户不存在/.test(text)) {
    return "account_not_found";
  }
  if (/turnstile|security verification|cloudflare|csrf|access denied|risk|风控|安全验证/.test(text)) {
    return "risk_blocked";
  }
  if (/dns|name resolution|name or service not known|getaddrinfo|解析失败/.test(text)) {
    return "dns_failed";
  }
  if (/graph token failed|graph 授权/.test(text)) {
    return "graph_token_failed";
  }
  if (/imap token failed|imap 授权/.test(text)) {
    return "imap_token_failed";
  }
  if (/graph fetch failed|graph 收信/.test(text)) {
    return "graph_fetch_failed";
  }
  if (/imap fetch failed|imap 收信/.test(text)) {
    return "imap_fetch_failed";
  }
  if (/invalid address credential|jwt.*无效|临时邮箱 jwt 无效/.test(text)) {
    return "temp_invalid_credential";
  }
  if (/unexpected_eof_while_reading|eof occurred in violation of protocol|代理 tls|ssl.*eof|tls.*eof/.test(text)) {
    return "proxy_tls_eof";
  }
  if (/timed out|timeout|超时|winerror 10060|没有正确答复|连接尝试失败/.test(text)) {
    return "proxy_timeout";
  }
  if (/proxy|代理|connection reset|connection refused|remote end closed|without response|tunnel connection failed|socks/.test(text)) {
    return "proxy_connection_failed";
  }
  if (/incompleteread|incomplete read|connection closed|eof|network|ssl|连接中途断开|网络/.test(text)) {
    return "network_incomplete_read";
  }
  if (/unauthorized|401/.test(text)) {
    return "authorization_failed";
  }
  if (/invalid authorization|invalid_auth_step/.test(text)) {
    return "oauth_invalid_auth_step";
  }
  return current || "login_failed";
}

function compactText(value, max = 120) {
  const clean = String(value || "")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function compactLogMessage(message, meta = {}) {
  const email = meta.email || String(message || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const step = String(meta.step || "");
  const rawCode = String(meta.error_code || meta.code || "");
  const code = rawCode || meta.log_type === "error"
    ? inferErrorCode({
      error_code: rawCode,
      error: message,
      error_hint: meta.error_hint || meta.hint || "",
    })
    : "";
  if (code) {
    return `${email ? `${email} ` : ""}${errorCodeLabel(code)}`;
  }
  if (step && ERROR_MANUAL[step]) {
    return `${email ? `${email} ` : ""}${errorCodeLabel(step)}`;
  }
  if (step && LOG_STEP_LABELS[step]) {
    if (step === "egress") {
      const ip = String(message || "").match(/ip=([0-9a-fA-F:.]+)/)?.[1] || "";
      return `${email ? `${email} ` : ""}${LOG_STEP_LABELS[step]}${ip ? `：${ip}` : ""}`;
    }
    return `${email ? `${email} ` : ""}${LOG_STEP_LABELS[step]}`;
  }
  if (step) {
    return `${email ? `${email} ` : ""}处理进度`;
  }
  return compactText(message, 140);
}

function accountEmailKey(value) {
  return String(value || "").trim().toLowerCase();
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

function hasCredentialValue(value) {
  return Boolean(String(value || "").trim());
}

function isCodePickupError(code, text = "") {
  const rawCode = String(code || "").toLowerCase();
  const rawText = String(text || "").toLowerCase();
  return rawCode === "verification_code_missing"
    || rawCode === "email_code_missing"
    || rawCode === "otp_missing"
    || rawText.includes("verification code")
    || rawText.includes("no verification code")
    || rawText.includes("验证码")
    || rawText.includes("接码");
}

function isPhoneVerificationError(code, text = "") {
  const rawCode = String(code || "").toLowerCase();
  const rawText = String(text || "").toLowerCase();
  return rawCode === "phone_verification_required"
    || rawCode === "phone_2fa_failed"
    || rawCode === "mfa_required"
    || rawText.includes("phone verification")
    || rawText.includes("phone number")
    || rawText.includes("mobile")
    || rawText.includes("手机号")
    || rawText.includes("手机验证")
    || rawText.includes("二次验证")
    || rawText.includes("手机号码")
    || rawText.includes("接手机验证码");
}

async function readJsonResponse(response, fallback = "请求失败") {
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 300) };
    }
  }
  if (!response.ok) {
    const details = parseErrorPayload(data, fallback);
    const error = new Error(details.error || fallback);
    error.details = details;
    throw error;
  }
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRealSecret(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !isMaskedSecret(text);
}

function hasLocalPickupSecrets(payload) {
  return (payload.accounts || []).some((item) => isRealSecret(item.client_id) && isRealSecret(item.refresh_token))
    || (payload.temp_addresses || []).some((item) => isRealSecret(item.jwt));
}

function pickupSourceForPayload(payload) {
  if ((payload.temp_addresses || []).length && !(payload.accounts || []).length) return "temp";
  if ((payload.accounts || []).length && !(payload.temp_addresses || []).length) return "microsoft";
  return "all";
}

function shouldAutoRetry(details) {
  const code = inferErrorCode(details || {});
  if (!code || NON_RETRYABLE_CODES.has(code)) return false;
  if (details?.retryable === false) return false;
  return AUTO_RETRYABLE_CODES.has(code);
}

async function cooldownBeforeRetry(row, details, attempt) {
  const code = inferErrorCode(details || {});
  const seconds = Math.round(ACCOUNT_COOLDOWN_MS / 1000);
  addLog(`${row.email} ${errorCodeLabel(code)}，冷却 ${seconds} 秒后自动重试一次`, "warning", {
    error_code: code,
    email: row.email,
  });
  await sleep(ACCOUNT_COOLDOWN_MS);
  row.status = "queued";
  row.error = "";
  row.error_code = "";
  row.error_hint = "";
  row.jobId = "";
  row.retry_count = attempt;
  state.jobs.set(row.id, { status: "queued", error: "", logs: row.logs || [] });
  saveQueue();
  renderQueue();
}

function proxyFormatError(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  const netloc = withScheme.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/, 1)[0];
  if (!netloc.includes("@") && netloc.split(":").length >= 4) {
    return "代理格式错误：请使用 http://用户名:密码@host:port，不能写成 http://host:port:用户名:密码";
  }
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return "代理地址无法识别。正确格式是 http://用户名:密码@host:port";
  }
  if (!parsed.hostname || !parsed.port) {
    return "代理地址需要包含主机和端口。正确格式是 http://用户名:密码@host:port";
  }
  if (!parsed.username && parsed.host.split(":").length > 2) {
    return "代理格式错误：请使用 http://用户名:密码@host:port，不能写成 http://host:port:用户名:密码";
  }
  return "";
}

function failRow(row, details) {
  row.status = "failed";
  row.error = details.error || "启动失败";
  row.error_code = details.error_code || "";
  row.error_hint = details.error_hint || "";
  row.retryable = details.retryable;
  state.jobs.set(row.id, {
    status: "failed",
    jobId: row.jobId || "",
    error: row.error,
    error_code: row.error_code,
    error_hint: row.error_hint,
    retryable: row.retryable,
    logs: row.logs || [],
  });
  saveQueue();
  renderQueue();
  addLog(`${row.email} ${formatJobError(rowState(row))}`, "error");
}

function saveSettings() {
  if (els.loginConcurrency) els.loginConcurrency.value = "1";
  saveJson(STORAGE_KEYS.refreshSettings, {
    use_proxy: true,
    proxy_url: els.proxyUrl.value.trim(),
    login_strategy: "protocol",
    login_concurrency: 1,
    auto_update_cpa: els.autoUpdateCpa ? els.autoUpdateCpa.checked : false,
    cpa_base_url: els.cpaBaseUrl ? els.cpaBaseUrl.value.trim() : "",
    cpa_management_key: els.cpaManagementKey ? els.cpaManagementKey.value.trim() : "",
    task_mode: els.taskMode ? els.taskMode.value : "login",
    temp_sync_api: els.tempSyncApi ? els.tempSyncApi.value.trim() : "",
    temp_sync_admin_key: els.tempSyncAdminKey ? els.tempSyncAdminKey.value.trim() : "",
    temp_sync_site_password: els.tempSyncSitePassword ? els.tempSyncSitePassword.value.trim() : "",
    phone_pool_mode: currentPhoneMode(),
  });
}

function isLegacyPasswordMissingError(value) {
  return /缺少登录密码|缺少\s*OpenAI\s*登录密码|请导入\s*Outlook\s*四段/i.test(String(value || ""));
}

function sanitizeLegacyRefreshRow(row) {
  const logs = Array.isArray(row.logs) ? row.logs : [];
  const hasLegacyPasswordError = isLegacyPasswordMissingError(row.error)
    || logs.some((entry) => isLegacyPasswordMissingError(entry?.message || entry));
  if (!hasLegacyPasswordError) {
    return { row, changed: false };
  }
  const cleanLogs = logs.filter((entry) => !isLegacyPasswordMissingError(entry?.message || entry));
  return {
    changed: true,
    row: {
      ...row,
      status: "idle",
      error: "",
      error_code: "",
      error_hint: "",
      jobId: "",
      logs: cleanLogs,
    },
  };
}

function normalizeQueue(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean).map((row) => {
    const normalized = {
      ...row,
      id: String(row.id || `refresh:${row.email || row.name || crypto.randomUUID()}`),
      email: String(row.email || ""),
      name: String(row.name || row.email || ""),
      source_kind: row.source_kind || "local",
      source: row.source || (row.source_kind === "cpa" ? "cpa" : "local"),
      service: row.service || (row.source_kind === "cpa" ? "CPA" : ""),
      cpa_name: row.cpa_name || "",
      auth_index: row.auth_index || "",
      cpa_base_url: row.cpa_base_url || "",
      cpa_management_key: row.cpa_management_key || "",
      use_proxy: Boolean(row.use_proxy),
      proxy_url: row.proxy_url || "",
      login_strategy: "protocol",
      status: row.status || "idle",
      error: row.error || "",
      error_code: row.error_code || "",
      error_hint: row.error_hint || "",
      phone_id: row.phone_id || row.phone_binding_id || "",
      phone_number: row.phone_number || "",
      phone_api_url: row.phone_api_url || "",
      phone_code: String(row.phone_code || row.manual_phone_code || ""),
      phone_code_message: String(row.phone_code_message || ""),
      phone_code_checked_at: String(row.phone_code_checked_at || ""),
      manual_phone_code: String(row.manual_phone_code || ""),
      manual_email_code: String(row.manual_email_code || row.email_code || ""),
      logs: Array.isArray(row.logs) ? row.logs : [],
    };
    return sanitizeLegacyRefreshRow(normalized).row;
  });
}

function normalizePhonePool(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map((item) => {
    const phone = String(item?.phone || "").trim();
    const apiUrl = String(item?.api_url || item?.apiUrl || "").trim();
    if (!phone || !apiUrl) return null;
    const id = String(item?.id || `phone:${phone.toLowerCase()}`);
    const key = id.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      id,
      mode: item?.mode === "bound" || item?.mode === "one_to_one" ? "bound" : "batch",
      phone,
      api_url: apiUrl,
      account_email: String(item?.account_email || item?.accountEmail || "").trim().toLowerCase(),
      last_code: String(item?.last_code || item?.lastCode || ""),
      last_message: String(item?.last_message || item?.lastMessage || ""),
      last_checked_at: String(item?.last_checked_at || item?.lastCheckedAt || ""),
      status: String(item?.status || "idle"),
    };
  }).filter(Boolean);
}

function saveQueue() {
  saveJson(STORAGE_KEYS.refreshQueue, state.queue);
}

function savePhonePool() {
  saveJson(STORAGE_KEYS.phonePool, state.phonePool);
}

function sourceLabel(account) {
  if (account.source === "microsoft") return account.service || "Outlook";
  return "临时邮箱";
}

function sourceTone(account) {
  if (account.service === "Cloud Mail") return "cloud";
  return account.source === "microsoft" ? "ms" : "temp";
}

function sourceRefreshState(account) {
  const key = accountEmailKey(account.email);
  if (!key) return { status: "idle", label: "未处理", tone: "idle", message: "" };
  const saved = state.savedRefreshResults.get(key);
  const rows = state.queue.filter((row) => accountEmailKey(row.email || row.name) === key);
  if (saved?.auth_file || rows.some((row) => row.auth_file || rowState(row).status === "success")) {
    return { status: "success", label: "成功", tone: "success", message: "已生成 auth_file" };
  }
  const mailStatus = String(account.mail_verify_status || account.last_status || "").toLowerCase();
  if (mailStatus === "error" || mailStatus === "failed") {
    return {
      status: "failed",
      label: account.last_error_label || errorCodeLabel(account.last_error_code || "mail_pickup_unavailable"),
      tone: "failed",
      message: account.last_error_hint || account.last_error || "邮箱取信失败",
    };
  }
  if (mailStatus === "no_code") {
    return {
      status: "needs_code",
      label: "未发现验证码",
      tone: "needs-code",
      message: "邮箱可以连接，但当前没有读到验证码邮件",
    };
  }
  if (mailStatus === "ok") {
    return {
      status: "idle",
      label: "可收件",
      tone: "success",
      message: "邮箱取信正常",
    };
  }
  const failed = rows.find((row) => {
    const job = rowState(row);
    return job.status === "failed" && isPhoneVerificationError(job.error_code, `${job.error || ""} ${job.error_hint || ""}`);
  });
  if (failed) {
    return { status: "failed", label: "手机验证", tone: "failed", message: formatJobError(rowState(failed)) };
  }
  const needsCode = rows.find((row) => {
    const job = rowState(row);
    return job.status === "failed" && isCodePickupError(job.error_code, `${job.error || ""} ${job.error_hint || ""}`);
  });
  if (needsCode) {
    return { status: "needs_code", label: "需要接码", tone: "needs-code", message: formatJobError(rowState(needsCode)) };
  }
  const anyFailed = rows.find((row) => rowState(row).status === "failed");
  if (anyFailed) {
    return { status: "failed", label: "失败", tone: "failed", message: formatJobError(rowState(anyFailed)) };
  }
  if (rows.some((row) => ["queued", "running"].includes(rowState(row).status))) {
    return { status: "running", label: "执行中", tone: "running", message: "" };
  }
  return { status: "idle", label: "未处理", tone: "idle", message: "" };
}

function accountOptions(active) {
  const options = [
    ["all", "全部状态"],
    ["success", "成功"],
    ["failed", "失败"],
    ["needs_code", "需要接码"],
  ];
  return options.map(([value, label]) => {
    return `<option value="${escapeHtml(value)}"${value === active ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function filteredAccounts() {
  const query = els.sourceSearch.value.trim().toLowerCase();
  const type = els.sourceType.value;
  const category = els.sourceCategory.value;
  return state.accounts.filter((account) => {
    if (type !== "all" && account.source !== type) return false;
    const refreshState = sourceRefreshState(account);
    if (category !== "all" && refreshState.status !== category) return false;
    if (query && !String(account.email || "").toLowerCase().includes(query)) return false;
    return true;
  });
}

function renderSources() {
  els.sourceCategory.innerHTML = accountOptions(els.sourceCategory.value || "all");
  const accounts = filteredAccounts();
  els.sourceTotal.textContent = String(accounts.length);
  const selectedVisible = accounts.filter((account) => state.selectedAccounts.has(account.id)).length;
  if (els.sourceSelectAll) {
    els.sourceSelectAll.textContent = accounts.length && selectedVisible === accounts.length ? "取消全选" : "全选";
  }
  const size = Number(els.sourcePageSize.value || 20);
  const pages = Math.max(1, Math.ceil(accounts.length / size));
  state.sourcePage = Math.min(Math.max(1, state.sourcePage), pages);
  const pageItems = accounts.slice((state.sourcePage - 1) * size, state.sourcePage * size);
  els.sourcePageText.textContent = `${state.sourcePage} / ${pages}`;
  els.sourcePrev.disabled = state.sourcePage <= 1;
  els.sourceNext.disabled = state.sourcePage >= pages;
  if (!pageItems.length) {
    els.sourceList.className = "mailbox-list empty";
    els.sourceList.textContent = state.accounts.length ? "没有匹配的邮箱" : "请先在账号管理页导入邮箱";
    return;
  }
  els.sourceList.className = "mailbox-list";
  els.sourceList.innerHTML = pageItems.map((account) => {
    const refreshState = sourceRefreshState(account);
    return `
      <div class="mailbox-row refresh-state-${escapeHtml(refreshState.tone)}" data-id="${escapeHtml(account.id)}" title="${escapeHtml(refreshState.message)}">
        <label class="mailbox-check">
          <input type="checkbox" ${state.selectedAccounts.has(account.id) ? "checked" : ""}>
          <span>
            <strong>${escapeHtml(account.email)}</strong>
            <em><b class="source-badge ${escapeHtml(sourceTone(account))}">${escapeHtml(sourceLabel(account))}</b></em>
          </span>
        </label>
        <span class="source-badge refresh-badge ${escapeHtml(refreshState.tone)}">${escapeHtml(refreshState.label)}</span>
      </div>
    `;
  }).join("");
}

function queueKey(account) {
  return [
    account.source_kind || account.source || "local",
    String(account.email || account.name || "").toLowerCase(),
    String(account.cpa_name || account.auth_index || ""),
  ].join("|");
}

function selectedSourceAccounts() {
  return state.accounts.filter((account) => state.selectedAccounts.has(account.id));
}

function accountMailVerified(account) {
  return ["ok", "no_code"].includes(String(account.mail_verify_status || account.last_status || "").toLowerCase());
}

function accountMailFailed(account) {
  return ["error", "failed"].includes(String(account.mail_verify_status || account.last_status || "").toLowerCase());
}

function accountFetchPayload(account) {
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
  };
}

function messageLooksLikeVerification(message) {
  const type = String(message?.mail_type || "").toLowerCase();
  if (type === "verification") return true;
  if (Array.isArray(message?.codes) && message.codes.length) return true;
  const text = [
    message?.subject,
    message?.sender,
    message?.preview,
    message?.body,
  ].join(" ").toLowerCase();
  return /验证码|verification|verify|code|one-time|openai|chatgpt/.test(text);
}

function applyMailboxVerifyResult(account, result) {
  const messages = Array.isArray(result?.messages) ? result.messages : [];
  const hasCode = messages.some(messageLooksLikeVerification);
  account.last_check_at = result?.checked_at || new Date().toISOString();
  account.last_message_count = Number(result?.message_count ?? messages.length ?? 0);
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
    saveJson(STORAGE_KEYS.accounts, state.accounts);
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
  const byEmail = new Map(state.queue.map((row) => [queueKey(row), row]));
  let added = 0;
  selected.forEach((account) => {
    const key = queueKey(account);
    if (byEmail.has(key)) {
      state.selectedQueue.add(byEmail.get(key).id);
      return;
    }
    const row = {
      id: `refresh:${account.id}`,
      source_kind: "local",
      email: account.email,
      name: account.email,
      account_id: account.id,
      source: account.source,
      service: sourceLabel(account),
      status: "idle",
      error: "",
      logs: [],
      auth_file: account.auth_file || null,
    };
    byEmail.set(key, row);
    state.selectedQueue.add(row.id);
    added += 1;
  });
  state.queue = [...byEmail.values()];
  saveQueue();
  renderQueue();
  addLog(`加入刷新队列：${selected.length} 个账号，新增 ${added} 个`, "info");
}

async function removeSelectedSources() {
  const selected = selectedSourceAccounts();
  if (!selected.length) {
    toast("先选择要移除的邮箱");
    return;
  }
  const emails = [...new Set(selected.map((account) => accountEmailKey(account.email)).filter(Boolean))];
  if (!emails.length) return;
  if (!confirm(`从本页移除 ${emails.length} 个邮箱？对应取码资料也会从本工作区删除。`)) return;
  try {
    await deleteWorkspaceMailCredentials(emails);
  } catch (error) {
    const details = error.details || { error: error.message || "邮箱池删除失败", error_code: "delete_failed" };
    addLog(formatJobError(details), "warning", { error_code: details.error_code || "delete_failed" });
  }
  const emailSet = new Set(emails);
  state.accounts = state.accounts.filter((account) => !emailSet.has(accountEmailKey(account.email)));
  state.queue = state.queue.filter((row) => !emailSet.has(accountEmailKey(row.email || row.name)));
  emails.forEach((email) => state.savedRefreshResults.delete(email));
  selected.forEach((account) => state.selectedAccounts.delete(account.id));
  state.selectedQueue = new Set([...state.selectedQueue].filter((id) => state.queue.some((row) => row.id === id)));
  saveJson(STORAGE_KEYS.accounts, state.accounts);
  saveQueue();
  renderAll();
  toast(`已移除 ${emails.length} 个邮箱`);
  addLog(`移除邮箱：${emails.length} 个`, "success");
}

function rowState(row) {
  return state.jobs.get(row.id) || {
    status: row.status || "idle",
    jobId: row.jobId || "",
    error: row.error || "",
    error_code: row.error_code || "",
    error_hint: row.error_hint || "",
    logs: row.logs || [],
  };
}

function loginLabel(status) {
  return {
    idle: "等待",
    queued: "排队",
    running: "登录中",
    success: "成功",
    failed: "失败",
    challenge: "安全验证",
    canceled: "已终止",
  }[status] || status || "等待";
}

function formatJobError(job) {
  const code = inferErrorCode(job);
  if (code) return errorCodeLabel(code);
  const detail = compactText(job.error_hint || job.error || "", 90);
  if (detail) return errorCodeLabel("login_failed");
  return "-";
}

function displayStatus(job) {
  if (job.status === "failed" && job.error_code === "login_cancelled") {
    return "canceled";
  }
  if (job.status === "failed" && job.error_code === "openai_turnstile_challenge") {
    return "challenge";
  }
  return job.status || "idle";
}

function queueFilterStatus(row) {
  const status = rowState(row).status || "idle";
  if (status === "queued") return "idle";
  return status;
}

function queueRowsForCurrentFilter() {
  if (state.queueFilter === "all") return state.queue;
  if (state.queueFilter === "running") {
    return state.queue.filter((row) => ["queued", "running"].includes(rowState(row).status || "idle"));
  }
  return state.queue.filter((row) => queueFilterStatus(row) === state.queueFilter);
}

function renderQueueProgress(counts) {
  if (!els.queueProgress) return;
  const total = state.queue.length;
  const done = (counts.success || 0) + (counts.failed || 0);
  const running = (counts.queued || 0) + (counts.running || 0);
  const percent = total ? Math.round((done / total) * 100) : 0;
  const visualPercent = running && percent === 0 ? 8 : percent;
  const bar = els.queueProgress.querySelector("i");
  const label = els.queueProgress.querySelector("em");
  els.queueProgress.hidden = total === 0;
  if (bar) bar.style.width = `${visualPercent}%`;
  if (label) label.textContent = running ? `${done} / ${total} · 执行中 ${running}` : `${done} / ${total}`;
}

function renderQueue() {
  const counts = { idle: 0, queued: 0, running: 0, success: 0, failed: 0 };
  state.queue.forEach((row) => {
    const status = rowState(row).status || "idle";
    counts[status] = (counts[status] || 0) + 1;
  });
  els.queueTotal.textContent = String(state.queue.length);
  els.queueIdle.textContent = String(counts.idle || 0);
  els.queueRunning.textContent = String((counts.queued || 0) + (counts.running || 0));
  els.queueSuccess.textContent = String(counts.success || 0);
  els.queueFailed.textContent = String(counts.failed || 0);
  renderQueueProgress(counts);
  if (els.queueSelectAll) {
    const visibleRows = queueRowsForCurrentFilter();
    els.queueSelectAll.checked = Boolean(visibleRows.length) && visibleRows.every((row) => state.selectedQueue.has(row.id));
    els.queueSelectAll.indeterminate = visibleRows.some((row) => state.selectedQueue.has(row.id)) && !els.queueSelectAll.checked;
  }
  document.querySelectorAll("[data-queue-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.queueFilter === state.queueFilter);
  });
  const visibleQueue = queueRowsForCurrentFilter();
  if (!state.queue.length) {
    els.queueBody.innerHTML = '<tr><td colspan="6" class="empty-cell">从左侧选择邮箱加入刷新队列。</td></tr>';
    return;
  }
  if (!visibleQueue.length) {
    els.queueBody.innerHTML = '<tr><td colspan="6" class="empty-cell">当前筛选没有账号。</td></tr>';
    return;
  }
  els.queueBody.innerHTML = visibleQueue.map((row) => {
    const job = rowState(row);
    const status = displayStatus(job);
    const rawStatus = job.status || "idle";
    const errorText = formatJobError(job);
    const phoneEntry = phoneEntryForRow(row);
    const statusText = `${job.error || ""} ${job.error_hint || ""} ${job.logs?.map?.((item) => item.step || item.message || "").join(" ") || ""}`;
    const canManualCode = ["running", "failed"].includes(rawStatus)
      && (
        isCodePickupError(job.error_code || row.error_code, statusText)
        || isPhoneVerificationError(job.error_code || row.error_code, statusText)
        || /验证码|接码|waiting_code|manual/i.test(statusText)
      );
    return `
      <tr data-id="${escapeHtml(row.id)}">
        <td><input class="abnormal-check queue-check" type="checkbox" ${state.selectedQueue.has(row.id) ? "checked" : ""}></td>
        <td>
          <strong>${escapeHtml(row.email || row.name || "-")}</strong>
          <em>${escapeHtml(row.service || "本地邮箱")}${phoneEntry ? ` · 手机 ${escapeHtml(phoneEntry.phone)}` : ""}</em>
        </td>
        <td><span class="source-badge ${escapeHtml(row.source === "microsoft" ? "ms" : "temp")}">${escapeHtml(row.service || "本地邮箱")}</span></td>
        <td><span class="login-status ${escapeHtml(status)}">${escapeHtml(loginLabel(status))}</span></td>
        <td><div class="login-error" title="${escapeHtml(errorText)}">${escapeHtml(errorText)}</div></td>
        <td>
          <div class="queue-action-stack">
            <button class="login-one" type="button" ${["queued", "running"].includes(rawStatus) ? "disabled" : ""}>${rawStatus === "queued" ? "排队中" : rawStatus === "running" ? "执行中" : "执行"}</button>
            ${canManualCode ? '<button class="code-one" type="button">填码</button>' : ""}
            ${["queued", "running"].includes(rawStatus) ? '<button class="cancel-one" type="button">终止</button>' : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function selectedQueueRows({ failedOnly = false } = {}) {
  const chosen = state.queue.filter((row) => state.selectedQueue.has(row.id));
  const base = chosen.length ? chosen : state.queue.filter((row) => rowState(row).status === "queued");
  const rows = base.length ? base : state.queue;
  return failedOnly ? rows.filter((row) => rowState(row).status === "failed") : rows;
}

function markRowsQueued(rows) {
  let count = 0;
  rows.forEach((row) => {
    const current = rowState(row);
    if (["queued", "running"].includes(current.status)) return;
    row.status = "queued";
    row.error = "";
    row.error_code = "";
    row.error_hint = "";
    row.jobId = "";
    row.retryable = undefined;
    state.jobs.set(row.id, { status: "queued", error: "", logs: row.logs || [] });
    count += 1;
  });
  if (count) {
    saveQueue();
    renderQueue();
  }
  return count;
}

function queuedRows() {
  return state.queue.filter((row) => rowState(row).status === "queued");
}

function selectedSingleQueueRow() {
  const rows = state.queue.filter((row) => state.selectedQueue.has(row.id));
  return rows.length === 1 ? rows[0] : null;
}

function promptCodeForRow(row) {
  const current = rowState(row);
  const phoneNeeded = isPhoneVerificationError(current.error_code || row.error_code, `${current.error || ""} ${current.error_hint || ""}`);
  const kind = phoneNeeded ? "手机" : "邮箱";
  const previous = phoneNeeded ? (row.manual_phone_code || row.phone_code || "") : (row.manual_email_code || "");
  const code = window.prompt(`请输入 ${row.email || row.name || ""} 的${kind}验证码`, previous || "");
  if (code === null) return;
  const cleaned = String(code || "").trim();
  if (!/^\d{4,8}$/.test(cleaned)) {
    toast(`请输入 4-8 位${kind}验证码`);
    return;
  }
  if (phoneNeeded) {
    row.manual_phone_code = cleaned;
    row.phone_code = cleaned;
    row.phone_code_checked_at = new Date().toISOString();
    submitManualPhoneCode(row, cleaned).catch((error) => {
      addLog(`${row.email} 手动手机验证码保存失败`, "warning", {
        email: row.email,
        error_code: "manual_phone_code_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    });
  } else {
    row.manual_email_code = cleaned;
    queueManualEmailCodeSubmit(row);
  }
  saveQueue();
  renderQueue();
  addLog(`${row.email} 已保存${kind}验证码`, "success", { step: phoneNeeded ? "manual_phone_code" : "manual_email_code", email: row.email });
}

function currentPhoneMode() {
  return els.phoneModeBatch && els.phoneModeBatch.checked ? "batch" : "one_to_one";
}

function phoneCodeForRow(row, entry = null) {
  return String(row?.manual_phone_code || row?.phone_code || entry?.last_code || "").trim();
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function phoneMatches(candidate, wanted) {
  const candidateDigits = normalizePhoneDigits(candidate);
  const wantedDigits = normalizePhoneDigits(wanted);
  if (!candidateDigits || !wantedDigits) return false;
  if (candidateDigits === wantedDigits) return true;
  return wantedDigits.length >= 4 && candidateDigits.endsWith(wantedDigits);
}

function phonePoolPayload() {
  return state.phonePool.map((item) => ({
    id: item.id,
    mode: item.mode,
    phone: item.phone,
    api_url: item.api_url,
    account_email: item.account_email || "",
  }));
}

function phoneEntryForRow(row) {
  const key = accountEmailKey(row.email || row.name);
  if (row.phone_id) {
    const byId = state.phonePool.find((item) => item.id === row.phone_id);
    if (byId) return byId;
  }
  if (row.phone_number) {
    const byPhone = state.phonePool.find((item) => phoneMatches(item.phone, row.phone_number));
    if (byPhone) return byPhone;
  }
  if (key) {
    const bound = state.phonePool.find((item) => accountEmailKey(item.account_email) === key);
    if (bound) return bound;
  }
  return null;
}

function ensurePhoneEntryForRow(row) {
  const existing = phoneEntryForRow(row);
  if (existing) return existing;
  const used = new Set(state.queue.map((item) => item.phone_id).filter(Boolean));
  const entry = state.phonePool.find((item) => item.mode === "batch" && !accountEmailKey(item.account_email) && !used.has(item.id));
  if (!entry) return null;
  row.phone_id = entry.id;
  row.phone_number = entry.phone;
  row.phone_api_url = entry.api_url;
  saveQueue();
  return entry;
}

function formatPhoneTime(value) {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}


function renderPhonePool() {
  if (!els.phonePoolList) return;
  if (!state.phonePool.length) {
    els.phonePoolList.innerHTML = '<div class="phone-pool-empty">还没有长效手机。</div>';
    renderSelectedPhoneCodePanel();
    return;
  }
  els.phonePoolList.innerHTML = state.phonePool.map((item) => {
    const status = item.last_code
      ? `最近验证码 ${item.last_code}${item.last_checked_at ? ` · ${formatPhoneTime(item.last_checked_at)}` : ""}`
      : (item.status === "error" ? "取码失败" : "等待取码");
    const mode = item.mode === "bound" ? "1对1" : "批量";
    const bound = item.account_email ? item.account_email : "未绑定账号";
    return `
      <div class="phone-pool-row" data-id="${escapeHtml(item.id)}">
        <div>
          <strong>${escapeHtml(item.phone)}</strong>
          <em>${escapeHtml(mode)} · ${escapeHtml(bound)} · ${escapeHtml(status)}</em>
        </div>
        <div class="phone-pool-actions">
          <button class="bind-phone" type="button">绑定选中</button>
          <button class="poll-phone" type="button">取码</button>
          <button class="remove-phone danger" type="button">删除</button>
        </div>
      </div>
    `;
  }).join("");
  renderSelectedPhoneCodePanel();
}

function renderSelectedPhoneCodePanel() {
  if (!els.phoneCodeAccount) return;
  const row = selectedSingleQueueRow();
  if (!row) {
    els.phoneCodeAccount.textContent = "未选中队列账号";
    els.phoneCodeCurrent.textContent = "手机验证码：-";
    return;
  }
  const entry = phoneEntryForRow(row);
  const code = phoneCodeForRow(row, entry);
  const phone = entry?.phone || row.phone_number || "未绑定手机";
  els.phoneCodeAccount.textContent = row.email || row.name || "当前账号";
  els.phoneCodeCurrent.textContent = code ? `手机 ${phone} · 验证码：${code}` : `手机 ${phone} · 验证码：-`;
}

function validPhoneApiUrl(value) {
  try {
    const url = new URL(String(value || "").trim()
      .replace(/\{phone\}/g, "10000000000")
      .replace(/\{email\}/g, "user@example.com")
      .replace(/\{account\}/g, "user@example.com")
      .replace(/\{since\}/g, "0")
      .replace(/\{ts\}/g, String(Date.now())));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function addOrUpdatePhoneEntry() {
  const phone = els.phoneNumber ? els.phoneNumber.value.trim() : "";
  const apiUrl = els.phoneApiUrl ? els.phoneApiUrl.value.trim() : "";
  if (!phone || !apiUrl) {
    toast("请填写手机号和接码 API");
    return;
  }
  if (!validPhoneApiUrl(apiUrl)) {
    toast("接码 API 必须是 http/https URL");
    addLog("手机 API 格式错误", "error", { error_code: "phone_pool_api_invalid" });
    return;
  }
  const selected = selectedSingleQueueRow();
  const isOneToOne = currentPhoneMode() !== "batch";
  const accountEmail = isOneToOne && selected ? accountEmailKey(selected.email || selected.name) : "";
  const id = `phone:${phone.toLowerCase()}`;
  const existing = state.phonePool.find((item) => item.id === id || item.phone === phone);
  if (accountEmail) {
    state.phonePool.forEach((item) => {
      if (item.id !== id && accountEmailKey(item.account_email) === accountEmail) {
        item.account_email = "";
      }
    });
  }
  const next = {
    ...(existing || {}),
    id,
    mode: accountEmail ? "bound" : "batch",
    phone,
    api_url: apiUrl,
    account_email: accountEmail || existing?.account_email || "",
    status: existing?.status || "idle",
    last_code: existing?.last_code || "",
    last_message: existing?.last_message || "",
    last_checked_at: existing?.last_checked_at || "",
  };
  if (existing) {
    Object.assign(existing, next);
  } else {
    state.phonePool.push(next);
  }
  savePhonePool();
  renderAll();
  toast(accountEmail ? "手机号已加入并绑定选中账号" : "手机号已加入手机池");
}

function importPhoneBatchEntries() {
  const text = els.phoneBatchText ? els.phoneBatchText.value.trim() : "";
  if (!text) {
    toast("请先粘贴批量手机号");
    return;
  }
  let added = 0;
  let updated = 0;
  const errors = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const raw = line.trim();
    if (!raw) return;
    const parts = raw.split(/----|\t|,/).map((part) => part.trim()).filter(Boolean);
    const [phone, apiUrl, email = ""] = parts;
    if (!phone || !apiUrl || !validPhoneApiUrl(apiUrl)) {
      errors.push(index + 1);
      return;
    }
    const id = `phone:${phone.toLowerCase()}`;
    const existing = state.phonePool.find((item) => item.id === id || item.phone === phone);
    const next = {
      ...(existing || {}),
      id,
      mode: email ? "bound" : "batch",
      phone,
      api_url: apiUrl,
      account_email: accountEmailKey(email),
      status: existing?.status || "idle",
      last_code: existing?.last_code || "",
      last_message: existing?.last_message || "",
      last_checked_at: existing?.last_checked_at || "",
    };
    if (existing) {
      Object.assign(existing, next);
      updated += 1;
    } else {
      state.phonePool.push(next);
      added += 1;
    }
  });
  savePhonePool();
  if (els.phoneBatchText && !errors.length) els.phoneBatchText.value = "";
  renderAll();
  toast(`手机池导入：新增 ${added}，更新 ${updated}${errors.length ? `，失败 ${errors.length}` : ""}`);
  if (errors.length) addLog(`手机池批量导入有 ${errors.length} 行格式错误`, "warning", { error_code: "phone_pool_api_invalid" });
}

function bindPhoneToSelected(phoneId) {
  const item = state.phonePool.find((entry) => entry.id === phoneId);
  const row = selectedSingleQueueRow();
  if (!item) return;
  if (!row) {
    toast("请只勾选一个队列账号再绑定");
    return;
  }
  const accountEmail = accountEmailKey(row.email || row.name);
  state.phonePool.forEach((entry) => {
    if (entry.id !== phoneId && accountEmailKey(entry.account_email) === accountEmail) {
      entry.account_email = "";
    }
  });
  item.mode = "bound";
  item.account_email = accountEmail;
  row.phone_id = item.id;
  row.phone_number = item.phone;
  row.phone_api_url = item.api_url;
  savePhonePool();
  saveQueue();
  renderAll();
  addLog(`${row.email} 已绑定长效手机`, "success", { step: "phone_pool", email: row.email });
}

function removePhoneEntry(phoneId) {
  const item = state.phonePool.find((entry) => entry.id === phoneId);
  if (!item) return;
  if (!confirm(`删除长效手机 ${item.phone}？不会删除账号，只会解除绑定。`)) return;
  state.phonePool = state.phonePool.filter((entry) => entry.id !== phoneId);
  state.queue.forEach((row) => {
    if (row.phone_id === phoneId || String(row.phone_number || "") === item.phone) {
      delete row.phone_id;
      delete row.phone_number;
      delete row.phone_api_url;
    }
  });
  savePhonePool();
  saveQueue();
  renderAll();
}

async function pollPhoneEntry(phoneId, rowId = "") {
  const item = state.phonePool.find((entry) => entry.id === phoneId);
  if (!item) return;
  const targetRow = state.queue.find((row) => row.id === rowId) || state.queue.find((row) => {
    return row.phone_id === item.id
      || phoneMatches(item.phone, row.phone_number)
      || accountEmailKey(row.email || row.name) === accountEmailKey(item.account_email);
  });
  item.status = "running";
  savePhonePool();
  renderPhonePool();
  try {
    const response = await fetch("/client-api/phone-code/poll", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        phone: item.phone,
        api_url: item.api_url,
        account_email: targetRow?.email || item.account_email,
        since: item.last_checked_at || "",
      }),
    });
    const data = await readJsonResponse(response, "手机取码失败");
    item.last_checked_at = data.checked_at || new Date().toISOString();
    item.last_message = data.message || "";
    item.status = data.found ? "found" : "idle";
    if (data.code) item.last_code = String(data.code);
    if (targetRow) {
      targetRow.phone_id = item.id;
      targetRow.phone_number = item.phone;
      targetRow.phone_api_url = item.api_url;
      targetRow.phone_code = data.code ? String(data.code) : targetRow.phone_code || "";
      targetRow.phone_code_message = data.message || "";
      targetRow.phone_code_checked_at = data.checked_at || new Date().toISOString();
      if (!item.account_email && currentPhoneMode() !== "batch") item.account_email = accountEmailKey(targetRow.email || targetRow.name);
    }
    savePhonePool();
    saveQueue();
    renderPhonePool();
    renderQueue();
    if (data.found) {
      addLog(`${item.account_email || item.phone} 手机验证码：${data.code}`, "success", { step: "phone_code", email: item.account_email });
      toast(`收到手机验证码 ${data.code}`);
    } else {
      addLog(`${item.account_email || item.phone} 暂未收到手机验证码`, "warning", { error_code: "phone_code_missing", email: item.account_email });
      toast("暂未收到手机验证码");
    }
  } catch (error) {
    const details = error.details || { error: error.message || "手机取码失败", error_code: "phone_code_fetch_failed" };
    item.status = "error";
    item.last_message = details.error || "手机取码失败";
    item.last_checked_at = new Date().toISOString();
    savePhonePool();
    renderPhonePool();
    addLog(formatJobError(details), "error", { error_code: details.error_code || "phone_code_fetch_failed", email: item.account_email });
  }
}

function saveManualPhoneCodeForSelected() {
  const row = selectedSingleQueueRow();
  if (!row) {
    toast("请先只选中一个队列账号");
    return;
  }
  const input = window.prompt(`请输入 ${row.email || row.name || ""} 的手机验证码`, row.manual_phone_code || row.phone_code || "");
  if (input === null) return;
  const code = String(input || "").trim();
  if (!/^\d{4,8}$/.test(code)) {
    toast("请输入 4-8 位手机验证码");
    return;
  }
  const entry = phoneEntryForRow(row);
  row.manual_phone_code = code;
  row.phone_code = code;
  row.phone_code_checked_at = new Date().toISOString();
  if (entry) {
    entry.last_code = code;
    entry.last_checked_at = row.phone_code_checked_at;
    entry.status = "found";
  }
  saveQueue();
  savePhonePool();
  renderAll();
  addLog(`${row.email} 已保存手机验证码：${code}`, "success", { step: "phone_code", email: row.email });
  submitManualPhoneCode(row, code).catch((error) => {
    addLog(`${row.email} 手动手机验证码保存失败`, "warning", {
      email: row.email,
      error_code: "manual_phone_code_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function pollSelectedPhoneCode() {
  const row = selectedSingleQueueRow();
  if (!row) {
    toast("请先只选中一个队列账号");
    return;
  }
  const entry = ensurePhoneEntryForRow(row);
  if (!entry) {
    toast("没有可用手机。请先添加 1 对 1 手机或批量池手机号");
    addLog(`${row.email} 没有可用手机`, "warning", { error_code: "phone_pool_empty", email: row.email });
    return;
  }
  await pollPhoneEntry(entry.id, row.id);
}

function failedRowsForCleanup() {
  const base = state.selectedQueue.size
    ? state.queue.filter((row) => state.selectedQueue.has(row.id))
    : queueRowsForCurrentFilter();
  const scoped = base.length ? base : state.queue;
  return scoped.filter((row) => rowState(row).status === "failed");
}

function cpaDeleteGroups(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const name = row.cpa_name || row.name || row.email || "";
    const baseUrl = row.cpa_base_url || (els.cpaBaseUrl ? els.cpaBaseUrl.value.trim() : "");
    const key = row.cpa_management_key || (els.cpaManagementKey ? els.cpaManagementKey.value.trim() : "");
    if (!name || (!row.auth_index && row.source_kind !== "cpa" && row.source !== "cpa")) return;
    if (!baseUrl || !key) return;
    const groupKey = `${baseUrl}\n${key}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { baseUrl, managementKey: key, items: [] });
    }
    groups.get(groupKey).items.push({
      name,
      id: row.auth_index || name,
      email: row.email,
      auth_index: row.auth_index || "",
    });
  });
  return [...groups.values()];
}

async function deleteCpaRows(rows) {
  const groups = cpaDeleteGroups(rows);
  let deleted = 0;
  for (const group of groups) {
    const response = await fetch("/client-api/cpa/delete", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        base_url: group.baseUrl,
        management_key: group.managementKey,
        items: group.items,
      }),
    });
    const data = await readJsonResponse(response, "CPA 删除失败");
    deleted += Number(data.summary?.deleted || 0);
    (data.results || [])
      .filter((item) => !item.ok)
      .slice(0, 5)
      .forEach((item) => addLog(`${item.email || item.name || ""} CPA 删除失败`, "warning", { error_code: "delete_failed" }));
  }
  return deleted;
}

async function deleteWorkspaceMailCredentials(emails) {
  if (!emails.length) return { microsoft: 0, temp: 0 };
  const response = await fetch("/client-api/accounts/delete", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ emails }),
  });
  const data = await readJsonResponse(response, "邮箱池删除失败");
  return data.deleted || { microsoft: 0, temp: 0 };
}

async function cleanFailedRows() {
  const rows = failedRowsForCleanup();
  if (!rows.length) {
    toast("没有可清理的失败账号");
    addLog("没有可清理的失败账号", "warning");
    return;
  }
  const counts = rows.reduce((acc, row) => {
    const code = inferErrorCode(rowState(row));
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts).map(([code, count]) => `${errorCodeLabel(code)} ${count}`).join("，");
  const selectedHint = state.selectedQueue.size ? "选中的失败账号" : (state.queueFilter === "failed" ? "当前失败列表" : "全部失败账号");
  if (!confirm(`将清理 ${rows.length} 个${selectedHint}：${summary}\n\n会尝试从 CPA 删除，并从本地邮箱池和刷新队列移除。继续？`)) {
    return;
  }
  const emails = [...new Set(rows.map((row) => accountEmailKey(row.email || row.name)).filter(Boolean))];
  let cpaDeleted = 0;
  let workspaceDeleted = { microsoft: 0, temp: 0 };
  try {
    cpaDeleted = await deleteCpaRows(rows);
  } catch (error) {
    const details = error.details || { error: error.message || "CPA 删除失败", error_code: "delete_failed" };
    addLog(formatJobError(details), "warning", { error_code: details.error_code || "delete_failed" });
  }
  try {
    workspaceDeleted = await deleteWorkspaceMailCredentials(emails);
  } catch (error) {
    const details = error.details || { error: error.message || "邮箱池删除失败", error_code: "delete_failed" };
    addLog(formatJobError(details), "warning", { error_code: details.error_code || "delete_failed" });
  }
  const emailSet = new Set(emails);
  state.accounts = state.accounts.filter((account) => !emailSet.has(accountEmailKey(account.email)));
  const rowIds = new Set(rows.map((row) => row.id));
  state.queue = state.queue.filter((row) => !rowIds.has(row.id));
  rows.forEach((row) => {
    state.jobs.delete(row.id);
    state.selectedQueue.delete(row.id);
  });
  saveJson(STORAGE_KEYS.accounts, state.accounts);
  saveQueue();
  renderAll();
  addLog(`清理完成：队列 ${rows.length}，CPA ${cpaDeleted}，邮箱池 Outlook ${workspaceDeleted.microsoft || 0} / 临时 ${workspaceDeleted.temp || 0}`, "success");
  toast(`已清理 ${rows.length} 个失败账号`);
}

function accountForRow(row) {
  if (row.account_id) {
    const byId = state.accounts.find((account) => account.id === row.account_id);
    if (byId) return byId;
  }
  const email = String(row.email || "").toLowerCase();
  return state.accounts.find((account) => String(account.email || "").toLowerCase() === email) || null;
}

function accountsForEmail(email) {
  const key = accountEmailKey(email);
  return state.accounts.filter((account) => accountEmailKey(account.email) === key);
}

function credentialSourceForRow(row, payload) {
  const email = row.email || payload.email || row.name || "";
  const matches = accountsForEmail(email);
  const hasMicrosoft = matches.some((item) => item.source === "microsoft")
    || (payload.accounts || []).some((item) => accountEmailKey(item.email) === accountEmailKey(email));
  const hasTemp = matches.some((item) => item.source === "temp")
    || (payload.temp_addresses || []).some((item) => accountEmailKey(item.email) === accountEmailKey(email));
  if (hasMicrosoft) return "microsoft";
  if (hasTemp) return "temp";
  return "";
}

function missingCredentialDetails(row) {
  const domain = String(row.email || "").split("@")[1] || "";
  const isTempLike = /wsphl\.cfd$|cmgptm\.online$|maip|temp/i.test(domain);
  return {
    error: isTempLike
      ? "这个账号还没有导入临时邮箱 JWT"
      : "这个账号还没有导入对应取码邮箱",
    error_code: "mail_credentials_missing",
    error_hint: isTempLike
      ? "先在本页同步队列 JWT，或到账号管理页导入 邮箱----JWT"
      : "先到账号管理页导入 Outlook 四段凭证，再重新执行",
  };
}

function loginPayload(row) {
  const account = accountForRow(row) || row;
  const email = account.email || row.email;
  const sameEmail = state.accounts.filter((item) => String(item.email || "").toLowerCase() === String(email || "").toLowerCase());
  const isCpa = row.source_kind === "cpa";
  const mode = els.taskMode ? els.taskMode.value : "login";
  const phoneEntry = phoneEntryForRow(row);
  
  let base_url = isCpa ? row.cpa_base_url || "" : "";
  let management_key = isCpa ? row.cpa_management_key || "" : "";
  
  if (els.autoUpdateCpa && els.autoUpdateCpa.checked) {
    if (!base_url) base_url = els.cpaBaseUrl.value.trim();
    if (!management_key) management_key = els.cpaManagementKey.value.trim();
  }

  let password = "";
  if (mode === "signup" && !password) {
    // Generate a secure random password if empty during registration
    password = account.password || row.password || "";
  }
  if (mode === "signup" && !password) {
    password = Math.random().toString(36).slice(-8) + "aA1!";
  }

  return {
    mode,
    login_only: true,
    base_url,
    management_key,
    name: row.cpa_name || row.name || email,
    use_proxy: true,
    proxy_url: isCpa ? row.proxy_url || els.proxyUrl.value.trim() : els.proxyUrl.value.trim(),
    login_strategy: "protocol",
    use_stored_mail_credentials: true,
    force_email_code: mode !== "signup",
    email_code_login: mode !== "signup",
    email,
    password,
    phone_number: phoneEntry?.phone || row.phone_number || "",
    phone_api_url: phoneEntry?.api_url || row.phone_api_url || "",
    phone_binding_id: phoneEntry?.id || row.phone_id || "",
    phone_pool: phonePoolPayload(),
    manual_email_code: row.manual_email_code || "",
    email_code: row.manual_email_code || "",
    phone_code: phoneCodeForRow(row, phoneEntry),
    manual_phone_code: row.manual_phone_code || "",
    row: {
      ...row,
      name: row.cpa_name || row.name || email,
      email,
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
        base_url: item.base_url,
        site_password: item.site_password,
      })),
  };
}

function queueManualEmailCodeSubmit(row) {
  const code = String(row.manual_email_code || "").trim();
  const jobId = row.jobId || rowState(row).jobId || "";
  if (!jobId || !/^\d{4,8}$/.test(code)) return;
  if (state.manualCodeTimers.has(row.id)) {
    clearTimeout(state.manualCodeTimers.get(row.id));
  }
  state.manualCodeTimers.set(row.id, setTimeout(() => {
    state.manualCodeTimers.delete(row.id);
    submitManualEmailCode(row, code).catch((error) => {
      addLog(`${row.email} 手动邮箱验证码保存失败`, "warning", {
        email: row.email,
        error_code: "manual_email_code_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, 350));
}

async function submitManualEmailCode(row, code) {
  const jobId = row.jobId || rowState(row).jobId || "";
  if (!jobId) return;
  const response = await fetch("/client-api/cpa/login-manual-code", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      job_id: jobId,
      manual_email_code: code,
    }),
  });
  const data = await readJsonResponse(response, "手动邮箱验证码保存失败");
  if (!data.success) {
    const details = parseErrorPayload(data, "手动邮箱验证码保存失败");
    throw new Error(details.error || "手动邮箱验证码保存失败");
  }
}

async function submitManualPhoneCode(row, code) {
  const jobId = row.jobId || rowState(row).jobId || "";
  if (!jobId) return;
  const response = await fetch("/client-api/cpa/login-manual-phone-code", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      job_id: jobId,
      manual_phone_code: code,
    }),
  });
  const data = await readJsonResponse(response, "手动手机验证码保存失败");
  if (!data.success) {
    const details = parseErrorPayload(data, "手动手机验证码保存失败");
    throw new Error(details.error || "手动手机验证码保存失败");
  }
}

async function cancelLoginJob(row) {
  const current = rowState(row);
  const jobId = row.jobId || current.jobId || "";
  if (!jobId) {
    row.status = "failed";
    row.error = "任务已终止";
    row.error_code = "login_cancelled";
    state.jobs.set(row.id, { ...current, status: "failed", error: row.error, error_code: row.error_code, retryable: false });
    saveQueue();
    renderQueue();
    return;
  }
  const response = await fetch("/client-api/cpa/login-cancel", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ job_id: jobId }),
  });
  const data = await readJsonResponse(response, "终止失败");
  if (!data.success) {
    const details = parseErrorPayload(data, "终止失败");
    throw new Error(details.error || "终止失败");
  }
  applyJobToRow(row, data.job || {}, current);
  addLog(`${row.email} 任务已终止`, "warning", { step: "cancel", email: row.email });
  renderAll();
}

function addLog(message, type = "info", meta = {}) {
  if (els.logList.firstElementChild?.textContent === "等待操作。") {
    els.logList.innerHTML = "";
  }
  const displayMessage = compactLogMessage(message, { ...meta, log_type: type });
  const step = String(meta.step || "");
  const throttleMs = LOG_THROTTLE_MS[step] || 0;
  const throttleKey = `${type}|${meta.email || ""}|${step}|${displayMessage}`;
  const now = Date.now();
  if (throttleMs) {
    const lastAt = state.logThrottle.get(throttleKey) || 0;
    if (now - lastAt < throttleMs) return;
    state.logThrottle.set(throttleKey, now);
  }
  if (
    state.lastLog
    && state.lastLog.type === type
    && state.lastLog.message === displayMessage
    && state.lastLog.element?.isConnected
  ) {
    state.lastLog.count += 1;
    const repeat = state.lastLog.element.querySelector(".log-repeat");
    if (repeat) repeat.textContent = `×${state.lastLog.count}`;
    els.logHint.textContent = `${displayMessage} ×${state.lastLog.count}`;
    return;
  }
  const item = document.createElement("div");
  item.className = `client-log-item ${type}`;
  const snapshotUrl = meta.snapshot_url || meta.snapshotUrl || "";
  const snapshotAction = snapshotUrl
    ? `<a class="log-snapshot-link" href="${escapeHtml(withAdminToken(snapshotUrl))}" target="_blank" rel="noreferrer">打开截图</a>`
    : "";
  item.innerHTML = `
    <span>${escapeHtml(new Date().toLocaleTimeString())}</span>
    <strong>${escapeHtml(LOG_TYPE_LABELS[type] || type.toUpperCase())}</strong>
    <em>${escapeHtml(displayMessage)}<b class="log-repeat"></b>${snapshotAction}</em>
  `;
  els.logList.prepend(item);
  state.lastLog = { type, message: displayMessage, element: item, count: 1 };
  while (els.logList.children.length > 300) {
    els.logList.lastElementChild.remove();
  }
  els.logHint.textContent = displayMessage;
}

function proxySessionFor(row, attempt) {
  const seed = `${row.id || row.email || "row"}-${Date.now()}-${attempt}-${Math.random().toString(36).slice(2, 8)}`;
  return seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

async function checkUniqueProxy(row, payload) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const proxySession = proxySessionFor(row, attempt);
    addLog(`${row.email} 检测代理出口`, "info", { step: "egress", email: row.email });
    const data = await probeProxySession(payload.proxy_url, proxySession);
    const ip = String(data.ip || "").trim();
    if (!ip) {
      const error = new Error("代理出口没有返回 IP");
      error.details = { error: "代理出口没有返回 IP", error_code: "proxy_ip_unavailable", error_hint: "请检查代理是否可用" };
      throw error;
    }
    await sleep(600);
    let confirmData;
    try {
      confirmData = await probeProxySession(payload.proxy_url, proxySession);
    } catch (error) {
      addLog(`${row.email} 代理出口复检失败，重新换出口`, "warning", { error_code: "proxy_ip_unstable", email: row.email });
      await sleep(700);
      continue;
    }
    const confirmIp = String(confirmData.ip || "").trim();
    if (!confirmIp || confirmIp !== ip) {
      addLog(`${row.email} 代理出口不稳定，重新换出口`, "warning", { error_code: "proxy_ip_unstable", email: row.email });
      await sleep(700);
      continue;
    }
    if (!state.runProxyIps.has(ip)) {
      state.runProxyIps.add(ip);
      const loc = String(data.loc || "").trim();
      const colo = String(data.colo || "").trim();
      addLog(`${row.email} 代理出口 ip=${ip}${loc ? ` loc=${loc}` : ""}${colo ? ` colo=${colo}` : ""}，本轮会话 ${proxySession.slice(-8)}`, "success", { step: "egress", email: row.email });
      payload.proxy_session = proxySession;
      row.proxy_session = proxySession;
      row.proxy_ip = ip;
      return { ip, proxySession };
    }
    addLog(`${row.email} 代理出口重复，重新换出口`, "warning", { error_code: "proxy_ip_duplicate", email: row.email });
    await sleep(700);
  }
  const error = new Error("连续检测到重复代理出口");
  error.details = {
    error: "连续检测到重复代理出口",
    error_code: "proxy_ip_duplicate",
    error_hint: "当前代理没有为每个账号换出不同 IP，请更换代理配置或降低批量数量",
  };
  throw error;
}

async function probeProxySession(proxyUrl, proxySession) {
  const response = await fetch("/client-api/proxy/check", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      use_proxy: true,
      proxy_url: proxyUrl,
      proxy_session: proxySession,
    }),
  });
  const data = await readJsonResponse(response, "代理检测失败");
  if (!data.success) {
    const details = parseErrorPayload(data, "代理检测失败");
    const error = new Error(details.error || "代理检测失败");
    error.details = details;
    throw error;
  }
  return data;
}

async function preflightMailPickup(row, payload) {
  if (!hasLocalPickupSecrets(payload)) {
    addLog(`${row.email} 使用服务端工作区保存的取码资料`, "info", { step: "mail_credentials", email: row.email });
    return true;
  }
  addLog(`${row.email} 预检取码邮箱`, "info", { step: "mail_credentials", email: row.email });
  const response = await fetch("/client-api/fetch", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      source: pickupSourceForPayload(payload),
      provider: "auto",
      limit: 1,
      emails: [payload.email],
      accounts: payload.accounts || [],
      temp_addresses: payload.temp_addresses || [],
    }),
  });
  let data;
  try {
    data = await readJsonResponse(response, "取码邮箱预检失败");
  } catch (error) {
    error.details = {
      ...(error.details || {}),
      error: error.details?.error || error.message || "取码邮箱预检失败",
      error_code: error.details?.error_code || "mail_pickup_unavailable",
      error_hint: error.details?.error_hint || "登录前无法稳定读取这个邮箱，后续也无法自动提交验证码；请先修复邮箱/JWT/Outlook 凭证。",
    };
    throw error;
  }
  const result = (data.results || []).find((item) => accountEmailKey(item?.email) === accountEmailKey(payload.email)) || (data.results || [])[0];
  if (result && !result.ok) {
    const details = {
      error: result.error_label || result.error || (result.errors || [])[0] || "取码邮箱不可用",
      error_code: result.error_code || "mail_pickup_unavailable",
      error_hint: result.error_hint || "登录前无法稳定读取这个邮箱，后续也无法自动提交验证码；请先修复邮箱/JWT/Outlook 凭证。",
      retryable: result.retryable,
    };
    throw Object.assign(new Error(details.error), { details });
  }
  if (!result) {
    addLog(`${row.email} 取码邮箱未返回预检结果，继续尝试登录`, "warning", { step: "mail_credentials", email: row.email });
    return true;
  }
  addLog(`${row.email} 取码邮箱可用`, "success", { step: "mail_credentials", email: row.email });
  return true;
}

function applyJobToRow(row, job, current = rowState(row)) {
  const oldCount = current.logs?.length || 0;
  (job.logs || []).slice(oldCount).forEach((entry) => {
    addLog(`${row.email} ${entry.message || ""}`, entry.level || "info", {
      ...entry,
      email: row.email,
    });
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

  const regPassword = result.registration_password || result.result?.registration_password;
  if (regPassword) {
    row.password = regPassword;
    const account = accountForRow(row);
    if (account) {
      account.password = regPassword;
    }
  }

  row.status = job.status || "running";
  row.error = job.error || "";
  row.error_code = job.error_code || "";
  if (row.status === "failed" && isPhoneVerificationError(row.error_code, row.error)) {
    row.error_code = "phone_verification_required";
    row.error = "需要手机验证，已按失败处理";
  }
  row.error_hint = job.error_hint || "";
  row.retryable = job.retryable;
  row.logs = job.logs || [];
  state.jobs.set(row.id, {
    status: row.status,
    jobId: current.jobId || row.jobId || job.job_id || "",
    error: row.error,
    error_code: row.error_code,
    error_hint: row.error_hint,
    retryable: row.retryable,
    logs: row.logs,
  });
  if (row.status === "success" && row.auth_file) {
    state.savedRefreshResults.set(accountEmailKey(row.email), {
      email: row.email,
      name: row.name || row.email,
      auth_file: row.auth_file,
    });
  }
  saveJson(STORAGE_KEYS.accounts, state.accounts);
  saveQueue();
}

async function waitForJob(row, jobId) {
  while (true) {
    await sleep(2000);
    const current = rowState(row);
    const response = await fetch(`/client-api/cpa/login-status?job_id=${encodeURIComponent(jobId)}`, { headers: apiHeaders(), cache: "no-store" });
    const data = await readJsonResponse(response, "读取任务失败");
    if (!data.success) {
      const details = parseErrorPayload(data, "读取任务失败");
      const error = new Error(details.error || "读取任务失败");
      error.details = details;
      throw error;
    }
    const job = data.job || {};
    applyJobToRow(row, job, current);
    renderAll();
    if (["success", "failed"].includes(row.status)) {
      if (row.status === "failed") {
        addLog(`${row.email} ${formatJobError(rowState(row))}`, "error", {
          error_code: row.error_code || "login_failed",
          email: row.email,
        });
      }
      return row.status;
    }
  }
}

async function startLogin(row) {
  const payload = loginPayload(row);
  if (!payload.proxy_url) {
    toast("凭证刷新必须填写代理 URL");
    failRow(row, { error: "凭证刷新必须填写代理 URL", error_code: "proxy_required", error_hint: "示例：http://USER:PASS@host:port 或 socks5://USER:PASS@host:port" });
    return;
  }
  const localProxyError = proxyFormatError(payload.proxy_url);
  if (localProxyError) {
    failRow(row, {
      error: localProxyError,
      error_code: "proxy_format_invalid",
      error_hint: "示例：http://USER:PASS@us.rrp.bestgo.work:10000；用户名和密码必须写在 @ 前面。",
    });
    return;
  }
  if (!credentialSourceForRow(row, payload)) {
    failRow(row, missingCredentialDetails(row));
    return;
  }
  for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt += 1) {
    row.status = "queued";
    row.error = "";
    row.error_code = "";
    row.error_hint = "";
    row.retryable = undefined;
    row.jobId = "";
    state.jobs.set(row.id, { status: "queued", error: "", logs: row.logs || [] });
    saveQueue();
    renderQueue();
    addLog(`${row.email} 检查取码邮箱`, "info", { step: "mail_credentials", email: row.email });
    try {
      if (attempt === 1) await preflightMailPickup(row, payload);
      const attemptPayload = { ...payload, retry_attempt: attempt };
      await checkUniqueProxy(row, attemptPayload);
      row.status = "running";
      state.jobs.set(row.id, { status: "running", error: "", logs: [] });
      saveQueue();
      renderQueue();
      addLog(`${row.email} 启动邮箱登录账号${attempt > 1 ? `（第 ${attempt} 次）` : ""}`, "info", { step: "start", email: row.email });
      const response = await fetch("/client-api/cpa/login-start", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify(attemptPayload),
      });
      const data = await readJsonResponse(response, "启动失败");
      if (!data.success) {
        const details = parseErrorPayload(data, "启动失败");
        const error = new Error(details.error || "启动失败");
        error.details = details;
        throw error;
      }
      row.jobId = data.job?.job_id || "";
      row.status = data.job?.status || "queued";
      state.jobs.set(row.id, { status: row.status, jobId: row.jobId, error: "", logs: [] });
      saveQueue();
      queueManualEmailCodeSubmit(row);
      if (row.jobId) {
        await waitForJob(row, row.jobId);
      }
      const current = rowState(row);
      if (current.status !== "failed" || attempt >= MAX_LOGIN_ATTEMPTS || !shouldAutoRetry(current)) {
        break;
      }
      await cooldownBeforeRetry(row, current, attempt);
    } catch (error) {
      const details = error.details || { error: error.message || "启动失败", error_code: "login_failed" };
      failRow(row, details);
      if (attempt >= MAX_LOGIN_ATTEMPTS || !shouldAutoRetry(details)) {
        break;
      }
      await cooldownBeforeRetry(row, details, attempt);
    }
  }
  renderQueue();
}

async function startRows(rows) {
  if (!rows.length) {
    toast("没有可执行账号");
    return;
  }
  const queued = markRowsQueued(rows);
  if (!queued && state.runner) {
    toast("账号已经在队列中");
    return;
  }
  if (state.runner) {
    addLog(`已加入队列：${queued} 个账号，等待当前任务结束`, "info");
    return;
  }
  state.runner = runQueuedRows();
  try {
    await state.runner;
  } finally {
    state.runner = null;
  }
}

async function runQueuedRows() {
  saveSettings();
  await syncAccountsFromServer({ quiet: true });
  els.startSelected.disabled = true;
  els.retryFailed.disabled = true;
  const oldText = els.startSelected.textContent;
  els.startSelected.textContent = "执行中";
  state.runProxyIps = new Set();
  if (els.loginConcurrency) els.loginConcurrency.value = "1";
  addLog(`开始执行队列：${queuedRows().length} 个账号，单账号顺序处理`, "info");
  try {
    while (true) {
      const row = queuedRows()[0];
      if (!row) break;
      await startLogin(row);
      if (queuedRows().length) {
        await sleep(1500);
      }
    }
  } finally {
    els.startSelected.disabled = false;
    els.retryFailed.disabled = false;
    els.startSelected.textContent = oldText;
    renderAll();
  }
}

function startPolling() {
  if (state.poller) return;
  state.poller = setInterval(pollJobs, 2000);
}

async function pollJobs() {
  const pending = state.queue.filter((row) => ["queued", "running"].includes(rowState(row).status));
  if (!pending.length) {
    clearInterval(state.poller);
    state.poller = undefined;
    return;
  }
  for (const row of pending) {
    const current = rowState(row);
    if (!current.jobId) continue;
    try {
      const response = await fetch(`/client-api/cpa/login-status?job_id=${encodeURIComponent(current.jobId)}`, { headers: apiHeaders(), cache: "no-store" });
      const data = await readJsonResponse(response, "读取任务失败");
      if (!data.success) {
        const details = parseErrorPayload(data, "读取任务失败");
        const error = new Error(details.error || "读取任务失败");
        error.details = details;
        throw error;
      }
      const job = data.job || {};
      applyJobToRow(row, job, current);
    } catch (error) {
      row.status = "failed";
      const details = error.details || { error: error.message || "读取任务失败", error_code: "login_failed" };
      row.error = details.error || "读取任务失败";
      row.error_code = details.error_code || "login_failed";
      row.error_hint = details.error_hint || "";
      state.jobs.set(row.id, {
        status: "failed",
        jobId: current.jobId,
        error: row.error,
        error_code: row.error_code,
        error_hint: row.error_hint,
        logs: current.logs || [],
      });
      addLog(`${row.email} ${formatJobError(rowState(row))}`, "error", {
        error_code: row.error_code,
        email: row.email,
      });
      saveQueue();
    }
  }
  renderAll();
}

function accountSub2apiItem(row, authFile) {
  const expiresAt = epochSecondsFromValue(authFile.expired);
  return compactObject({
    name: authFile.name || row.email,
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
      email: authFile.email || row.email,
      expires_at: expiresAt,
      plan_type: authFile.plan_type || "",
    }),
    extra: compactObject({
      email: authFile.email || row.email,
      name: authFile.name || row.email,
      source: "gpt_account_manager_refresh",
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

async function savedRefreshRows() {
  try {
    const response = await fetch("/client-api/refresh-results", { headers: apiHeaders(), cache: "no-store" });
    const data = await readJsonResponse(response, "读取已保存刷新结果失败");
    return (data.results || [])
      .filter((item) => item?.auth_file)
      .map((item) => ({
        row: {
          email: item.email || item.auth_file?.email || "",
          name: item.name || item.auth_file?.name || item.email || "",
          source: "saved",
        },
        authFile: item.auth_file,
      }));
  } catch (error) {
    addLog(`读取已保存刷新结果失败：${error.message || "unknown"}`, "warning");
    return [];
  }
}

async function syncRefreshResults() {
  try {
    const response = await fetch("/client-api/refresh-results", { headers: apiHeaders(), cache: "no-store" });
    const data = await readJsonResponse(response, "读取已保存刷新结果失败");
    state.savedRefreshResults = new Map(
      (data.results || [])
        .filter((item) => item?.auth_file)
        .map((item) => [accountEmailKey(item.email || item.auth_file?.email), item])
        .filter(([email]) => email)
    );
    renderSources();
  } catch (error) {
    addLog(`读取已保存刷新结果失败：${error.message || "unknown"}`, "warning");
  }
}

async function exportResults(format) {
  const selected = selectedQueueRows();
  let rows = selected.map((row) => ({ row, authFile: row.auth_file })).filter((item) => item.authFile);
  if (!rows.length) {
    rows = await savedRefreshRows();
  }
  if (!rows.length) {
    toast("没有可下载的刷新结果");
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (format === "cpa") {
    const files = rows.map((item) => item.authFile);
    downloadJsonFile(`gpt-account-manager-cpa-auth-${stamp}.json`, files.length === 1 ? files[0] : files);
    return;
  }
  downloadJsonFile(`gpt-account-manager-sub2api-accounts-${stamp}.json`, {
    exported_at: new Date().toISOString(),
    proxies: [],
    accounts: rows.map((item) => accountSub2apiItem(item.row, item.authFile)),
  });
}

function renderAll() {
  renderSources();
  renderQueue();
  renderPhonePool();
}

function normalizeServerAccount(item, source) {
  const email = String(item?.email || "").trim();
  if (!email) return null;
  const base = {
    id: String(source === "temp" ? `temp:${email.toLowerCase()}` : `microsoft:${email.toLowerCase()}`),
    email,
    name: email,
    source: source === "temp" ? "temp" : "microsoft",
    service: source === "temp" ? "Cloud Mail" : "Outlook",
    category: String(item?.label || item?.category || "").trim(),
    auth_file: null,
  };
  if (source === "temp") {
    return {
      ...base,
      jwt: String(item?.jwt || ""),
      base_url: String(item?.base_url || item?.baseUrl || ""),
      site_password: String(item?.site_password || item?.sitePassword || ""),
    };
  }
  return {
    ...base,
    password: String(item?.password || ""),
    client_id: String(item?.client_id || ""),
    refresh_token: String(item?.refresh_token || ""),
  };
}

function isTempMailboxEmail(email) {
  const domain = String(email || "").split("@")[1]?.toLowerCase() || "";
  const microsoftDomains = new Set(["outlook.com", "hotmail.com", "live.com", "msn.com"]);
  return Boolean(domain)
    && (
      domain.endsWith("wsphl.cfd")
      || domain.endsWith("cmgptm.online")
      || domain.includes("temp")
      || !microsoftDomains.has(domain)
    );
}

function tempEmailsNeedingCredentials() {
  const emails = [];
  state.queue.forEach((row) => {
    const email = String(row.email || row.name || "").trim();
    if (!email || !isTempMailboxEmail(email)) return;
    const payload = loginPayload(row);
    if (credentialSourceForRow(row, payload)) return;
    emails.push(email.toLowerCase());
  });
  return [...new Set(emails)];
}

function mergeTempJwtResults(results, baseUrl, sitePassword) {
  const imported = [];
  results.forEach((item) => {
    const email = String(item?.email || item?.address || "").trim().toLowerCase();
    const jwt = String(item?.jwt || "").trim();
    if (!email || !jwt) return;
    imported.push(normalizeServerAccount({
      email,
      jwt,
      base_url: baseUrl,
      site_password: sitePassword,
      label: "临时邮箱",
    }, "temp"));
  });
  mergeServerAccountsSnapshot(imported.filter(Boolean));
  saveJson(STORAGE_KEYS.accounts, state.accounts);
  return imported.filter(Boolean);
}

async function importTempCredentialsToServer(items, baseUrl, sitePassword) {
  if (!items.length) return;
  const text = items.map((item) => [
    item.email,
    item.jwt,
    baseUrl,
    sitePassword,
  ].join("----")).join("\n");
  mergeServerAccountsSnapshot(items.map((item) => normalizeServerAccount({
    email: item.email,
    jwt: item.jwt,
    base_url: baseUrl,
    site_password: sitePassword,
    label: "临时邮箱",
  }, "temp")).filter(Boolean));
  saveJson(STORAGE_KEYS.accounts, state.accounts);
}

async function syncTempCredentialsForQueue() {
  saveSettings();
  const baseUrl = els.tempSyncApi ? els.tempSyncApi.value.trim().replace(/\/+$/, "") : "";
  const adminPassword = els.tempSyncAdminKey ? els.tempSyncAdminKey.value.trim() : "";
  const sitePassword = els.tempSyncSitePassword ? els.tempSyncSitePassword.value.trim() : "";
  if (!baseUrl || !adminPassword) {
    toast("请填写临时邮箱 API 和管理员密钥");
    addLog("临时邮箱同步配置不完整", "error", { error_code: "temp_sync_config_missing" });
    return;
  }
  const emails = tempEmailsNeedingCredentials();
  if (!emails.length) {
    toast("队列里没有缺 JWT 的临时邮箱");
    addLog("队列临时邮箱 JWT 已齐全", "success");
    return;
  }
  const oldText = els.syncTempCredentials.textContent;
  els.syncTempCredentials.disabled = true;
  els.syncTempCredentials.textContent = "同步中";
  addLog(`同步临时邮箱 JWT：${emails.length} 个`, "info");
  try {
    const response = await fetch("/client-api/temp-addresses/sync-jwts", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        base_url: baseUrl,
        admin_password: adminPassword,
        site_password: sitePassword,
        email_list: emails,
      }),
    });
    const data = await readJsonResponse(response, "同步临时邮箱失败");
    const results = Array.isArray(data.results) ? data.results : [];
    const ok = results.filter((item) => item?.ok && item?.jwt);
    const imported = mergeTempJwtResults(ok, baseUrl, sitePassword);
    const failed = results.length - ok.length;
    renderAll();
    toast(`同步完成：${imported.length} 个`);
    addLog(`临时邮箱同步完成：成功 ${imported.length}，失败 ${Math.max(0, failed)}`, imported.length ? "success" : "warning");
    results
      .filter((item) => !item?.ok)
      .slice(0, 8)
      .forEach((item) => addLog(`${item?.email || ""} 未找到 JWT`, "warning", { error_code: "mail_credentials_missing", email: item?.email || "" }));
  } catch (error) {
    const details = error.details || { error: error.message || "同步临时邮箱失败", error_code: "temp_sync_failed" };
    addLog(formatJobError(details), "error", { error_code: details.error_code || "temp_sync_failed" });
    toast("同步失败");
  } finally {
    els.syncTempCredentials.disabled = false;
    els.syncTempCredentials.textContent = oldText;
  }
}

async function importPickupCredentials() {
  const text = els.pickupImportText ? els.pickupImportText.value.trim() : "";
  if (!text) {
    toast("请先粘贴 Outlook 四段取码资料");
    addLog("Outlook 取码导入为空", "error", { error_code: "pickup_import_empty" });
    return;
  }
  const oldText = els.importPickupCredentials.textContent;
  els.importPickupCredentials.disabled = true;
  els.importPickupCredentials.textContent = "导入中";
  try {
    const response = await fetch("/client-api/accounts/import-pickup", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        text,
        replace_existing: true,
      }),
    });
    const data = await readJsonResponse(response, "Outlook 取码导入失败");
    const syncedAccounts = (data.accounts || []).map((item) => normalizeServerAccount(item, "microsoft")).filter(Boolean);
    mergeServerAccountsSnapshot(syncedAccounts);
    saveJson(STORAGE_KEYS.accounts, state.accounts);
    els.pickupImportText.value = "";
    renderAll();
    toast(`导入 Outlook：新增 ${data.imported || 0}，更新 ${data.updated || 0}`);
    addLog(`Outlook 取码导入完成：新增 ${data.imported || 0}，更新 ${data.updated || 0}`, "success");
    (data.errors || []).slice(0, 5).forEach((item) => addLog(item, "warning", { error_code: "pickup_import_failed" }));
  } catch (error) {
    const details = error.details || { error: error.message || "Outlook 取码导入失败", error_code: "pickup_import_failed" };
    addLog(formatJobError(details), "error", { error_code: details.error_code || "pickup_import_failed" });
    toast("导入失败");
  } finally {
    els.importPickupCredentials.disabled = false;
    els.importPickupCredentials.textContent = oldText;
  }
}

function mergeServerAccountsSnapshot(items) {
  const byId = new Map(state.accounts.map((account) => [account.id, account]));
  items.forEach((item) => {
    if (!item?.id) return;
    const existing = byId.get(item.id);
    if (existing) {
      byId.set(item.id, {
        ...existing,
        ...item,
        password: preferRealSecret(item.password, existing.password),
        client_id: preferRealSecret(item.client_id, existing.client_id),
        refresh_token: preferRealSecret(item.refresh_token, existing.refresh_token),
        jwt: preferRealSecret(item.jwt, existing.jwt),
        site_password: preferRealSecret(item.site_password, existing.site_password),
        base_url: item.base_url || existing.base_url || "",
        category: item.category || existing.category || "",
        auth_file: existing.auth_file || item.auth_file || null,
      });
    } else {
      byId.set(item.id, item);
    }
  });
  state.accounts = [...byId.values()].sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
}

async function syncAccountsFromServer({ quiet = false } = {}) {
  try {
    const [accountsResponse, tempResponse] = await Promise.all([
      fetch("/client-api/accounts", { headers: apiHeaders(), cache: "no-store" }),
      fetch("/client-api/temp-addresses", { headers: apiHeaders(), cache: "no-store" }),
    ]);
    const [accountsData, tempData] = await Promise.all([
      accountsResponse.json(),
      tempResponse.json(),
    ]);
    if (!accountsResponse.ok) throw new Error(accountsData.error || accountsResponse.statusText || "Failed to load Outlook accounts");
    if (!tempResponse.ok) throw new Error(tempData.error || tempResponse.statusText || "Failed to load temp accounts");
    const serverManagedBeforeIds = new Set(
      state.accounts
        .filter((account) => ["microsoft", "temp"].includes(account.source))
        .map((account) => account.id)
    );
    const syncedAccounts = [
      ...((accountsData.accounts || []).map((item) => normalizeServerAccount(item, "microsoft")).filter(Boolean)),
      ...((tempData.addresses || []).map((item) => normalizeServerAccount(item, "temp")).filter(Boolean)),
    ];
    mergeServerAccountsSnapshot(syncedAccounts);
    if (syncedAccounts.length || serverManagedBeforeIds.size) {
      const serverIds = new Set(syncedAccounts.map((account) => account.id));
      state.accounts = state.accounts.filter((account) => !serverManagedBeforeIds.has(account.id) || serverIds.has(account.id));
    }
    saveJson(STORAGE_KEYS.accounts, state.accounts);
    renderAll();
  } catch (error) {
    if (!quiet) addLog(`同步邮箱助手资料失败：${error.message || "unknown"}`, "warning");
  }
}

els.sourceList.addEventListener("change", (event) => {
  const row = event.target.closest(".mailbox-row");
  if (!row || !event.target.matches("input[type='checkbox']")) return;
  if (event.target.checked) state.selectedAccounts.add(row.dataset.id);
  else state.selectedAccounts.delete(row.dataset.id);
});
els.sourceSelectAll.addEventListener("click", () => {
  const accounts = filteredAccounts();
  const allSelected = accounts.every((account) => state.selectedAccounts.has(account.id));
  accounts.forEach((account) => {
    if (allSelected) state.selectedAccounts.delete(account.id);
    else state.selectedAccounts.add(account.id);
  });
  renderSources();
});
els.addSelected.addEventListener("click", addSelectedToQueue);
if (els.verifySelectedSources) {
  els.verifySelectedSources.addEventListener("click", verifySelectedMailboxes);
}
if (els.removeSelectedSources) {
  els.removeSelectedSources.addEventListener("click", removeSelectedSources);
}
els.sourcePrev.addEventListener("click", () => {
  state.sourcePage -= 1;
  renderSources();
});
els.sourceNext.addEventListener("click", () => {
  state.sourcePage += 1;
  renderSources();
});
[els.sourceSearch, els.sourceType, els.sourceCategory, els.sourcePageSize].forEach((input) => {
  input.addEventListener("input", () => {
    state.sourcePage = 1;
    renderSources();
  });
  input.addEventListener("change", () => {
    state.sourcePage = 1;
    renderSources();
  });
});
els.queueBody.addEventListener("change", (event) => {
  const input = event.target.closest(".queue-check");
  if (!input) return;
  const row = input.closest("tr");
  if (!row) return;
  if (input.checked) state.selectedQueue.add(row.dataset.id);
  else state.selectedQueue.delete(row.dataset.id);
  renderQueue();
  renderSelectedPhoneCodePanel();
});
if (els.queueSelectAll) {
  els.queueSelectAll.addEventListener("change", () => {
    const visibleRows = queueRowsForCurrentFilter();
    if (els.queueSelectAll.checked) {
      visibleRows.forEach((row) => state.selectedQueue.add(row.id));
    } else {
      visibleRows.forEach((row) => state.selectedQueue.delete(row.id));
    }
    renderQueue();
  });
}
els.queueBody.addEventListener("click", (event) => {
  const codeButton = event.target.closest(".code-one");
  if (codeButton) {
    const rowEl = codeButton.closest("tr");
    const item = state.queue.find((row) => row.id === rowEl?.dataset.id);
    if (item) promptCodeForRow(item);
    return;
  }
  const cancelButton = event.target.closest(".cancel-one");
  if (cancelButton) {
    const rowEl = cancelButton.closest("tr");
    const item = state.queue.find((row) => row.id === rowEl?.dataset.id);
    if (item) {
      cancelLoginJob(item).catch((error) => {
        addLog(`${item.email} 终止失败：${error.message || "unknown"}`, "error", { error_code: "login_cancel_failed", email: item.email });
      });
    }
    return;
  }
  const button = event.target.closest(".login-one");
  if (!button) return;
  const rowEl = button.closest("tr");
  const item = state.queue.find((row) => row.id === rowEl?.dataset.id);
  if (!item) return;
  const queued = markRowsQueued([item]);
  if (queued) {
    addLog(`${item.email} 已加入等待队列`, "info", { step: "queue", email: item.email });
    toast(state.runner ? "已加入队列，将按顺序执行" : "已加入队列，请点击执行选中启动");
  }
});
els.startSelected.addEventListener("click", () => startRows(selectedQueueRows()));
els.retryFailed.addEventListener("click", () => startRows(selectedQueueRows({ failedOnly: true })));
if (els.cleanFailed) {
  els.cleanFailed.addEventListener("click", cleanFailedRows);
}
document.querySelectorAll("[data-queue-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.queueFilter = button.dataset.queueFilter || "all";
    state.selectedQueue.clear();
    renderQueue();
    renderSelectedPhoneCodePanel();
  });
});
els.exportCpa.addEventListener("click", () => exportResults("cpa"));
els.exportSub2.addEventListener("click", () => exportResults("sub2"));
if (els.syncTempCredentials) {
  els.syncTempCredentials.addEventListener("click", syncTempCredentialsForQueue);
}
if (els.importPickupCredentials) {
  els.importPickupCredentials.addEventListener("click", importPickupCredentials);
}
if (els.addPhoneEntry) {
  els.addPhoneEntry.addEventListener("click", addOrUpdatePhoneEntry);
}
if (els.importPhoneBatch) {
  els.importPhoneBatch.addEventListener("click", importPhoneBatchEntries);
}
if (els.saveManualPhoneCode) {
  els.saveManualPhoneCode.addEventListener("click", saveManualPhoneCodeForSelected);
}
if (els.pollSelectedPhone) {
  els.pollSelectedPhone.addEventListener("click", pollSelectedPhoneCode);
}
[els.phoneModeBatch, els.phoneModeOneToOne].forEach((input) => {
  if (!input) return;
  input.addEventListener("change", () => {
    saveSettings();
    renderPhonePool();
  });
});
if (els.phonePoolList) {
  els.phonePoolList.addEventListener("click", (event) => {
    const row = event.target.closest(".phone-pool-row");
    if (!row) return;
    if (event.target.closest(".bind-phone")) {
      bindPhoneToSelected(row.dataset.id);
    } else if (event.target.closest(".poll-phone")) {
      pollPhoneEntry(row.dataset.id);
    } else if (event.target.closest(".remove-phone")) {
      removePhoneEntry(row.dataset.id);
    }
  });
}
els.clearQueue.addEventListener("click", () => {
  state.queue = [];
  state.selectedQueue.clear();
  state.jobs.clear();
  saveQueue();
  renderQueue();
});
[els.useProxy, els.proxyUrl, els.loginStrategy, els.loginConcurrency, els.autoUpdateCpa, els.cpaBaseUrl, els.cpaManagementKey, els.taskMode, els.tempSyncApi, els.tempSyncAdminKey, els.tempSyncSitePassword].forEach((input) => {
  if (input) {
    input.addEventListener("input", saveSettings);
    input.addEventListener("change", saveSettings);
  }
});
els.clearLogs.addEventListener("click", () => {
  els.logList.innerHTML = '<div class="client-log-item">等待操作。</div>';
  els.logHint.textContent = "等待执行。";
});

renderAll();
syncAccountsFromServer();
syncRefreshResults();
