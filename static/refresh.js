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
  refreshQueue: sharedLegacyKeys.legacyRefreshQueue || "ctgptm.mail.refreshQueue",
  refreshSettings: sharedStoragePrefixes.refreshSettings?.slice(0, -1) || "ctgptm.mail.refreshSettings",
  phonePool: sharedLegacyKeys.legacyPhonePool || "ctgptm.mail.phonePool",
};
const STORAGE_KEYS = {
  accounts: `${LEGACY_STORAGE_KEYS.accounts}:${workspaceId}`,
  categories: `${LEGACY_STORAGE_KEYS.categories}:${workspaceId}`,
  refreshQueue: `${LEGACY_STORAGE_KEYS.refreshQueue}:${workspaceId}`,
  refreshSettings: `${LEGACY_STORAGE_KEYS.refreshSettings}:${workspaceId}`,
  phonePool: `${LEGACY_STORAGE_KEYS.phonePool}:${workspaceId}`,
  workspaceId: WORKSPACE_ID_STORAGE_KEY,
};
const lineLabels = window.GAM?.appShell?.LINE_LABELS || {};

const EMPTY_CATEGORY_LABEL = "未分组";
const IMPORT_PLACEHOLDERS = {
  auto: [
    "user@outlook.com----password----client_id----refresh_token----自定义分组",
    "user@example.com----JWT_TOKEN----https://maip.wsphl.cfd----站点密钥----自定义分组",
    "user@163.com----授权码或邮箱密码",
    "user@qq.com----授权码",
    "user@icloud.com----App 专用密码",
  ].join("\n"),
  microsoft: "user@outlook.com----password----client_id----refresh_token----自定义分组",
  temp: [
    "user@example.com----JWT_TOKEN",
    "user@example.com----JWT_TOKEN----https://maip.wsphl.cfd----站点密钥----自定义分组",
  ].join("\n"),
  generic: [
    "user@163.com----授权码或邮箱密码",
    "user@qq.com----授权码",
    "user@gmail.com----App Password",
    "user@icloud.com----App 专用密码",
    "user@example.com----password----imap.example.com----993----自定义分组",
  ].join("\n"),
};
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
const base = window.GAM?.base;
const scheduler = window.GAM?.scheduler;
const refreshErrors = window.GAM?.refreshErrors;
const refreshSourceList = window.GAM?.refreshSourceList;
const refreshManualCode = window.GAM?.refreshManualCode;
const refreshPhonePool = window.GAM?.refreshPhonePool;
const refreshQueueModel = window.GAM?.refreshQueueModel;
const refreshQueueView = window.GAM?.refreshQueueView;
const mailboxAccountModel = window.GAM?.mailboxAccountModel?.createMailboxAccountModel?.({
  defaultTempWorkerUrl: "",
  reservedCategoryNames: ["已封禁"],
  legacyCategoryNames: ["默认", "default", "outlook", "临时邮箱", "temp", "microsoft", "generic", "邮箱", "mailbox"],
  serviceLabels: {
    microsoft: "Outlook",
    temp: "临时邮箱",
    generic: "其他邮箱",
  },
});
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

migrateLegacyStorageKeys(["accounts", "categories", "refreshQueue", "refreshSettings", "phonePool"]);
repairLocalStorageKeys(Object.values(STORAGE_KEYS));

let refreshErrorsHelper = null;
let refreshQueueViewHelper = null;
let refreshSourceListHelper = null;
let refreshManualCodeHelper = null;
let refreshPhonePoolHelper = null;
let mailboxImportHelper = null;
let mailboxImportUiHelper = null;
let refreshQueueHelper = null;

const storedRefreshQueue = loadJson(STORAGE_KEYS.refreshQueue, []);
const normalizedRefreshQueue = normalizeQueue(storedRefreshQueue);
if (JSON.stringify(storedRefreshQueue) !== JSON.stringify(normalizedRefreshQueue)) {
  saveJson(STORAGE_KEYS.refreshQueue, normalizedRefreshQueue.map(compactQueueRowForStorage));
}

const state = {
  accounts: mailboxAccountModel?.normalizeStoredAccounts
    ? mailboxAccountModel.normalizeStoredAccounts(loadJson(STORAGE_KEYS.accounts, []))
    : loadJson(STORAGE_KEYS.accounts, []),
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
  runnerToken: 0,
  manualCodeTarget: null,
  pollInFlight: false,
  queueMarkup: "",
  filteredAccountsCacheKey: "",
  filteredAccountsCacheRows: [],
  filteredQueueCacheKey: "",
  filteredQueueCacheRows: [],
  jobPollErrors: new Map(),
};
const pendingSaveTimers = new Map();
const saveScheduler = base?.createPendingSaveScheduler?.((key, value) => saveJson(key, value)) || null;

const MAX_LOGIN_ATTEMPTS = 3;
const ACCOUNT_COOLDOWN_MS = 6500;
const AUTO_RETRYABLE_CODES = new Set([
  "dns_failed",
  "proxy_connection_failed",
  "proxy_tls_eof",
  "proxy_timeout",
  "job_poll_timeout",
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
  queueFilterButtons: Array.from(document.querySelectorAll("[data-queue-filter]")),
  queueBody: document.querySelector("#queueBody"),
  clearLogs: document.querySelector("#clearLogs"),
  logHint: document.querySelector("#logHint"),
  logList: document.querySelector("#logList"),
  toast: document.querySelector("#toast"),
  autoUpdateCpa: document.querySelector("#autoUpdateCpa"),
  cpaBaseUrl: document.querySelector("#cpaBaseUrl"),
  cpaManagementKey: document.querySelector("#cpaManagementKey"),
  manualUploadCpa: document.querySelector("#manualUploadCpa"),
  cpaSyncStatus: document.querySelector("#cpaSyncStatus"),
  taskMode: document.querySelector("#taskMode"),
  tempSyncApi: document.querySelector("#tempSyncApi"),
  tempSyncAdminKey: document.querySelector("#tempSyncAdminKey"),
  tempSyncSitePassword: document.querySelector("#tempSyncSitePassword"),
  syncTempCredentials: document.querySelector("#syncTempCredentials"),
  openPickupImportModal: document.querySelector("#openPickupImportModal"),
  openPickupImportModalInline: document.querySelector("#openPickupImportModalInline"),
  pickupImportModal: document.querySelector("#pickupImportModal"),
  pickupImportSource: document.querySelector("#pickupImportSource"),
  pickupTempApiField: document.querySelector("#pickupTempApiField"),
  pickupTempSitePasswordField: document.querySelector("#pickupTempSitePasswordField"),
  pickupTempApi: document.querySelector("#pickupTempApi"),
  pickupTempSitePassword: document.querySelector("#pickupTempSitePassword"),
  pickupImportFile: document.querySelector("#pickupImportFile"),
  pickupImportFileName: document.querySelector("#pickupImportFileName"),
  pickupImportText: document.querySelector("#pickupImportText"),
  pickupImportPreview: document.querySelector("#pickupImportPreview"),
  closePickupImportModal: document.querySelector("#closePickupImportModal"),
  cancelPickupImportModal: document.querySelector("#cancelPickupImportModal"),
  confirmPickupImport: document.querySelector("#confirmPickupImport"),
  phoneNumber: document.querySelector("#phoneNumber"),
  phoneProvider: document.querySelector("#phoneProvider"),
  phoneApiUrl: document.querySelector("#phoneApiUrl"),
  phoneApiKey: document.querySelector("#phoneApiKey"),
  phoneActivationId: document.querySelector("#phoneActivationId"),
  phoneProviderEndpoint: document.querySelector("#phoneProviderEndpoint"),
  verifyPhoneProvider: document.querySelector("#verifyPhoneProvider"),
  syncPhoneProviderActivations: document.querySelector("#syncPhoneProviderActivations"),
  phoneProviderStatus: document.querySelector("#phoneProviderStatus"),
  phoneModeBatch: document.querySelector("#phoneModeBatch"),
  phoneModeOneToOne: document.querySelector("#phoneModeOneToOne"),
  phoneBatchPanel: document.querySelector("#phoneBatchPanel"),
  phoneBatchText: document.querySelector("#phoneBatchText"),
  importPhoneBatch: document.querySelector("#importPhoneBatch"),
  phoneCodeAccount: document.querySelector("#phoneCodeAccount"),
  phoneCodeCurrent: document.querySelector("#phoneCodeCurrent"),
  phoneBindingTarget: document.querySelector("#phoneBindingTarget"),
  saveManualPhoneCode: document.querySelector("#saveManualPhoneCode"),
  pollSelectedPhone: document.querySelector("#pollSelectedPhone"),
  phoneCodePanel: document.querySelector(".phone-code-panel"),
  addPhoneEntry: document.querySelector("#addPhoneEntry"),
  phonePoolList: document.querySelector("#phonePoolList"),
  phoneBindingList: document.querySelector("#phoneBindingList"),
  manualCodeModal: document.querySelector("#manualCodeModal"),
  manualCodeModalEyebrow: document.querySelector("#manualCodeModalEyebrow"),
  manualCodeModalTitle: document.querySelector("#manualCodeModalTitle"),
  manualCodeModalHint: document.querySelector("#manualCodeModalHint"),
  manualCodeModalInput: document.querySelector("#manualCodeModalInput"),
  closeManualCodeModal: document.querySelector("#closeManualCodeModal"),
  cancelManualCodeModal: document.querySelector("#cancelManualCodeModal"),
  confirmManualCodeModal: document.querySelector("#confirmManualCodeModal"),
};

const settings = loadJson(STORAGE_KEYS.refreshSettings, {});
els.useProxy.checked = true;
els.proxyUrl.value = settings.proxy_url || "";
if (els.loginStrategy) els.loginStrategy.value = "protocol";
if (els.loginConcurrency) els.loginConcurrency.value = ["1", "2", "3"].includes(String(settings.login_concurrency)) ? String(settings.login_concurrency) : "1";
if (els.autoUpdateCpa) els.autoUpdateCpa.checked = Boolean(settings.auto_update_cpa);
if (els.cpaBaseUrl) els.cpaBaseUrl.value = settings.cpa_base_url || "";
if (els.cpaManagementKey) els.cpaManagementKey.value = settings.cpa_management_key || "";
if (els.cpaSyncStatus) els.cpaSyncStatus.textContent = "可手动上传已生成的凭证结果";
if (els.taskMode) els.taskMode.value = settings.task_mode || "login";
if (els.tempSyncApi) els.tempSyncApi.value = settings.temp_sync_api || "";
if (els.tempSyncAdminKey) els.tempSyncAdminKey.value = settings.temp_sync_admin_key || "";
if (els.tempSyncSitePassword) els.tempSyncSitePassword.value = settings.temp_sync_site_password || "";
if (els.pickupTempApi) els.pickupTempApi.value = settings.temp_sync_api || "";
if (els.pickupTempSitePassword) els.pickupTempSitePassword.value = settings.temp_sync_site_password || "";
if (els.phoneModeBatch) els.phoneModeBatch.checked = settings.phone_pool_mode === "batch";
if (els.phoneModeOneToOne) els.phoneModeOneToOne.checked = settings.phone_pool_mode !== "batch";
if (els.loginStrategy) els.loginStrategy.value = "protocol";
if (els.taskMode) els.taskMode.value = "login";

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

function scheduleSaveJson(key, value, delay = 220) {
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
  return base?.repairMojibakeText?.(value, MOJIBAKE_TEXT_FIXES) ?? value;
}

function repairStoredJson(value) {
  return base?.repairStoredJson?.(value, MOJIBAKE_TEXT_FIXES) ?? value;
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

function setCpaSyncStatus(text, tone = "") {
  if (!els.cpaSyncStatus) return;
  els.cpaSyncStatus.textContent = text;
  els.cpaSyncStatus.dataset.tone = tone;
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
  job_poll_timeout: "状态轮询超时",
  dns_failed: "DNS 失败",
  mail_credentials_missing: "缺取码邮箱",
  mail_pickup_unavailable: "取码邮箱不可用",
  mail_verification_required: "请先验证邮箱",
  mail_verify_no_code: "未发现验证码",
  graph_token_failed: "Graph 授权失败",
  imap_token_failed: "IMAP 授权失败",
  graph_fetch_failed: "Graph 收信失败",
  imap_fetch_failed: "IMAP 收信失败",
  outlook_reauth_required: "Outlook 需要重新授权",
  outlook_scope_missing: "Outlook 权限不足",
  generic_config_missing: "其他邮箱配置缺失",
  generic_auth_failed: "其他邮箱认证失败",
  generic_imap_failed: "其他邮箱 IMAP 失败",
  generic_pop3_failed: "其他邮箱 POP3 失败",
  generic_api_failed: "其他邮箱 API 失败",
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
  manual_email_code_failed: "邮箱验证码保存失败",
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
  phone_provider_unsupported: "接码平台不支持",
  phone_provider_key_missing: "缺少平台密钥",
  phone_provider_key_invalid: "平台密钥无效",
  phone_provider_no_balance: "平台余额不足",
  phone_provider_endpoint_invalid: "平台地址格式错误",
  phone_provider_request_failed: "接码平台请求失败",
  phone_provider_response_invalid: "接码平台响应异常",
  phone_activation_missing: "接码订单不存在或已失效",
  phone_code_pending: "等待手机验证码",
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

refreshErrorsHelper = refreshErrors?.createRefreshErrors?.({
  errorManual: ERROR_MANUAL,
  logStepLabels: LOG_STEP_LABELS,
});

function errorCodeLabel(code) {
  if (refreshErrorsHelper?.errorCodeLabel) return refreshErrorsHelper.errorCodeLabel(code);
  return ERROR_MANUAL[String(code || "")] || String(code || "login_failed");
}

function inferErrorCode(job = {}) {
  if (refreshErrorsHelper?.inferErrorCode) return refreshErrorsHelper.inferErrorCode(job);
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
  if (/interaction_required|consent_required|login_required|authorization_pending|aadsts65001|aadsts50076|aadsts50078/.test(text)) {
    return "outlook_reauth_required";
  }
  if (/(insufficient_scope|imap\.accessasuser\.all|mail\.read)/.test(text) && /(scope|graph|imap|oauth|token failed|permission|forbidden)/.test(text)) {
    return "outlook_scope_missing";
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
  if (refreshErrorsHelper?.compactText) return refreshErrorsHelper.compactText(value, max);
  const clean = String(value || "")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function compactLogMessage(message, meta = {}) {
  if (refreshErrorsHelper?.compactLogMessage) return refreshErrorsHelper.compactLogMessage(message, meta);
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
    if (step === "mail_code_poll" || step === "mail_code_missing") {
      const detail = compactText(
        String(message || "")
          .replace(/^邮箱验证码查收结束，仍未找到可提交的 6 位验证码：?/, "")
          .replace(/^邮箱验证码查收：?/, "")
          .replace(/^查收邮箱：?/, ""),
        140,
      );
      return `${email ? `${email} ` : ""}${LOG_STEP_LABELS[step]}${detail ? `：${detail}` : ""}`;
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
  if (refreshErrorsHelper?.isCodePickupError) return refreshErrorsHelper.isCodePickupError(code, text);
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
  if (refreshErrorsHelper?.isPhoneVerificationError) return refreshErrorsHelper.isPhoneVerificationError(code, text);
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
  if (base?.readJsonResponse) {
    return base.readJsonResponse(response, fallback, {
      allowTextFallback: true,
      fallbackTextLimit: 300,
      throwOnHttpError: true,
      httpErrorBuilder({ data }) {
        const details = parseErrorPayload(data, fallback);
        const error = new Error(details.error || fallback);
        error.details = details;
        return error;
      },
    });
  }
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

async function fetchJsonWithTimeout(url, options = {}, fallback = "请求失败", timeoutMs = 15000, timeoutErrorCode = "proxy_timeout") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "AbortError")), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const data = await readJsonResponse(response, fallback);
    return { response, data };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`${fallback} 超时`);
      timeoutError.details = { error: timeoutError.message, error_code: timeoutErrorCode };
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRealSecret(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !isMaskedSecret(text);
}

function normalizeGenericMode(value) {
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

function genericAccountPayload(account) {
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

function normalizeTempWorkerUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isGenericApiMode(value) {
  return ["cloudmail", "luckmail", "inbucket"].includes(normalizeGenericMode(value));
}

mailboxImportHelper = window.GAM?.mailboxImport?.createMailboxImportHelper?.({
  serviceMap: {
    auto: { source: "auto", label: "自动识别" },
    microsoft: { source: "microsoft", label: "Outlook" },
    temp: { source: "temp", label: "临时邮箱" },
    generic: { source: "generic", label: "其他邮箱" },
  },
  normalizeStoredAccount: (account) => account,
  normalizeTempWorkerUrl: (value) => normalizeTempWorkerUrl(value),
  normalizeGenericMode: (value) => normalizeGenericMode(value),
  isGenericApiMode: (value) => isGenericApiMode(value),
  looksLikeJwt: (value) => looksLikeJwt(value),
  allowSingleStructuredObject: true,
  requireStructuredStart: true,
  flexibleTempFields: true,
  structuredArrayKeys: ["accounts", "addresses", "items", "data"],
});

mailboxImportUiHelper = window.GAM?.mailboxImportUi?.createMailboxImportUiHelper?.({
  parseLines: (text, source) => parseLines(text, source),
  sourceMeta: {
    auto: { placeholder: IMPORT_PLACEHOLDERS.auto, tempMode: true },
    microsoft: { placeholder: IMPORT_PLACEHOLDERS.microsoft, tempMode: false },
    temp: { placeholder: IMPORT_PLACEHOLDERS.temp, tempMode: true },
    generic: { placeholder: IMPORT_PLACEHOLDERS.generic, tempMode: false },
  },
});

refreshQueueHelper = refreshQueueModel?.createRefreshQueueModel?.({
  serviceLabels: {
    microsoft: "Outlook",
    generic: "其他邮箱",
    temp: "临时邮箱",
    local: "本地邮箱",
  },
});

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
    const hasTempJwt = looksLikeJwt(pickValue(item, ["jwt", "token", "access_token", "credential"]));
    const rowSource = source === "auto" ? (hasMicrosoft ? "microsoft" : (hasTempJwt ? "temp" : "generic")) : source;
    const category = pickValue(item, ["category", "label", "group", "tag"]);
    if (rowSource === "generic") {
      rows.push({
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
      });
      return;
    }
    rows.push(rowSource === "temp" ? {
      source: "temp",
      email,
      jwt: pickValue(item, ["jwt", "token", "access_token", "credential"]),
      base_url: normalizeTempWorkerUrl(pickValue(item, ["base_url", "baseUrl", "api", "api_url", "worker_url"])),
      site_password: pickValue(item, ["site_password", "sitePassword", "x-custom-auth", "custom_auth"]),
      category,
    } : {
      source: "microsoft",
      email,
      password: pickValue(item, ["password", "pass"]),
      client_id: pickValue(item, ["client_id", "clientId"]),
      refresh_token: pickValue(item, ["refresh_token", "refreshToken"]),
      category,
    });
  });
  return { rows: rows.filter(Boolean), errors };
}

function parseGenericParts(parts, email) {
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
  return {
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
  };
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
    rows.push(rowSource === "temp" ? {
      source: "temp",
      email,
      jwt: parts[1] || "",
      base_url: normalizeTempWorkerUrl(parts[2] || ""),
      site_password: parts[3] || "",
      category: parts[4] || "",
    } : {
      source: "microsoft",
      email,
      password: parts[1] || "",
      client_id: parts[2] || "",
      refresh_token: parts[3] || "",
      category: parts[4] || "",
    });
  });
  return { rows: rows.filter(Boolean), errors };
}

function pickupMailboxCopyLine(account) {
  if (account.source === "temp") {
    return [account.email, account.jwt || "", account.base_url || "", account.site_password || "", account.category || ""].join("----");
  }
  if (account.source === "generic") {
    const mode = normalizeGenericMode(account.mode);
    const host = mode === "pop3" ? account.pop3_host || "" : account.imap_host || "";
    if (isGenericApiMode(mode)) {
      if (mode === "luckmail" && account.username) {
        return [account.email, account.password || "", mode, "", account.username, account.category || ""].join("----");
      }
      return [account.email, account.password || "", mode, "", account.category || ""].join("----");
    }
    if (host) {
      if (mode && mode !== "auto") {
        return [account.email, account.password || "", host, mode, account.category || ""].join("----");
      }
      const port = mode === "pop3" ? account.pop3_port || "" : account.imap_port || "";
      return [account.email, account.password || "", host, port, account.category || ""].join("----");
    }
    if (account.category) {
      return [account.email, account.password || "", "", "", account.category || ""].join("----");
    }
    return [account.email, account.password || ""].join("----");
  }
  return [account.email, account.password || "", account.client_id || "", account.refresh_token || "", account.category || ""].join("----");
}

function updatePickupImportPreview() {
  if (!els.pickupImportPreview) return;
  if (mailboxImportUiHelper?.previewState) {
    const source = els.pickupImportSource?.value || "auto";
    const nextState = mailboxImportUiHelper.previewState({
      source,
      text: els.pickupImportText?.value || "",
      options: {
        emptyText: "粘贴后会先预检格式。",
      },
    });
    mailboxImportUiHelper.applyPreviewState({
      previewEl: els.pickupImportPreview,
      textInput: els.pickupImportText,
      tempApiField: els.pickupTempApiField,
      tempSitePasswordField: els.pickupTempSitePasswordField,
    }, nextState);
    return;
  }
  const source = els.pickupImportSource?.value || "auto";
  const text = els.pickupImportText?.value || "";
  const tempMode = source === "temp" || source === "auto";
  if (els.pickupTempApiField) els.pickupTempApiField.hidden = !tempMode;
  if (els.pickupTempSitePasswordField) els.pickupTempSitePasswordField.hidden = !tempMode;
  if (els.pickupImportText) {
    els.pickupImportText.placeholder = IMPORT_PLACEHOLDERS[source] || IMPORT_PLACEHOLDERS.auto;
    els.pickupImportText.dataset.i18nOriginalPlaceholder = els.pickupImportText.placeholder;
  }
  if (!text.trim()) {
    els.pickupImportPreview.className = "import-preview";
    els.pickupImportPreview.textContent = "粘贴后会先预检格式。";
    return;
  }
  const { rows, errors } = parseLines(text, source);
  const microsoft = rows.filter((row) => row.source === "microsoft").length;
  const temp = rows.filter((row) => row.source === "temp").length;
  const generic = rows.filter((row) => row.source === "generic").length;
  els.pickupImportPreview.className = `import-preview ${errors.length ? "warning" : "ok"}`;
  els.pickupImportPreview.textContent = [
    `识别 ${rows.length} 个邮箱`,
    microsoft ? `Outlook ${microsoft}` : "",
    temp ? `临时邮箱 ${temp}` : "",
    generic ? `其他邮箱 ${generic}` : "",
    errors.length ? `格式错误 ${errors.length}` : "",
  ].filter(Boolean).join(" · ") || "没有识别到邮箱。";
}

function openPickupImportModal() {
  if (!els.pickupImportModal) return;
  if (els.pickupTempApi && !els.pickupTempApi.value.trim()) {
    els.pickupTempApi.value = normalizeTempWorkerUrl(els.tempSyncApi?.value || "");
  }
  if (els.pickupTempSitePassword && !els.pickupTempSitePassword.value.trim()) {
    els.pickupTempSitePassword.value = (els.tempSyncSitePassword?.value || "").trim();
  }
  if (mailboxImportUiHelper?.setModalOpen) mailboxImportUiHelper.setModalOpen(els.pickupImportModal, true);
  else {
    els.pickupImportModal.hidden = false;
    document.body.classList.add("modal-open");
  }
  updatePickupImportPreview();
  setTimeout(() => els.pickupImportText?.focus(), 0);
}

function closePickupImportModal() {
  if (!els.pickupImportModal) return;
  if (mailboxImportUiHelper?.setModalOpen) mailboxImportUiHelper.setModalOpen(els.pickupImportModal, false);
  else {
    els.pickupImportModal.hidden = true;
    document.body.classList.remove("modal-open");
  }
  if (els.pickupImportText) els.pickupImportText.value = "";
  if (els.pickupImportFile) els.pickupImportFile.value = "";
  if (els.pickupImportFileName) els.pickupImportFileName.textContent = "也可以直接粘贴到下面";
  updatePickupImportPreview();
}

async function persistPickupImportedRows(rows) {
  const microsoftRows = rows.filter((row) => row.source === "microsoft");
  const tempRows = rows.filter((row) => row.source === "temp");
  const genericRows = rows.filter((row) => row.source === "generic");
  const results = [];
  if (microsoftRows.length) {
    const response = await fetch("/client-api/accounts/import-pickup", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        text: microsoftRows.map(pickupMailboxCopyLine).join("\n"),
        replace_existing: true,
      }),
    });
    const data = await readJsonResponse(response, "Outlook 取码导入失败");
    results.push({ source: "microsoft", data });
  }
  if (tempRows.length) {
    const response = await fetch("/client-api/temp-addresses/import", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        text: tempRows.map(pickupMailboxCopyLine).join("\n"),
        base_url: normalizeTempWorkerUrl(els.pickupTempApi?.value || els.tempSyncApi?.value || ""),
        site_password: String(els.pickupTempSitePassword?.value || els.tempSyncSitePassword?.value || "").trim(),
      }),
    });
    const data = await readJsonResponse(response, "临时邮箱导入失败");
    results.push({ source: "temp", data });
  }
  if (genericRows.length) {
    const response = await fetch("/client-api/generic-accounts/import", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        text: genericRows.map(pickupMailboxCopyLine).join("\n"),
      }),
    });
    const data = await readJsonResponse(response, "其他邮箱导入失败");
    results.push({ source: "generic", data });
  }
  return results;
}

function sourceBadgeTone(value) {
  return value === "microsoft" ? "ms" : value === "generic" ? "generic" : "temp";
}

function hasLocalPickupSecrets(payload) {
  return (payload.accounts || []).some((item) => isRealSecret(item.client_id) && isRealSecret(item.refresh_token))
    || (payload.temp_addresses || []).some((item) => isRealSecret(item.jwt))
    || (payload.generic_accounts || []).some((item) => isRealSecret(item.password || item.token));
}

function pickupSourceForPayload(payload) {
  const hasMicrosoft = (payload.accounts || []).length > 0;
  const hasTemp = (payload.temp_addresses || []).length > 0;
  const hasGeneric = (payload.generic_accounts || []).length > 0;
  if (hasTemp && !hasMicrosoft && !hasGeneric) return "temp";
  if (hasMicrosoft && !hasTemp && !hasGeneric) return "microsoft";
  if (hasGeneric && !hasMicrosoft && !hasTemp) return "generic";
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
  commitQueueRowFailure(row, rowState(row), details, { render: true, log: true });
}

function renderRefreshStateViews() {
  renderQueue();
  renderSources();
  renderSelectedPhoneCodePanel();
}

function renderRefreshQueueViews() {
  renderQueue();
  renderSelectedPhoneCodePanel();
}

function renderForJobOutcome(outcome) {
  if (!outcome?.applied) return;
  if (outcome.accountChanged || outcome.statusTerminal) {
    renderRefreshStateViews();
    return;
  }
  if (outcome.jobChanged || outcome.logChanged) {
    renderRefreshQueueViews();
  }
}

function commitQueueRowFailure(row, current, details, { render = true, log = true } = {}) {
  row.status = "failed";
  row.error = details.error || "启动失败";
  row.error_code = details.error_code || "";
  row.error_hint = details.error_hint || "";
  row.retryable = details.retryable;
  state.jobs.set(row.id, {
    ...current,
    status: "failed",
    jobId: row.jobId || current.jobId || "",
    error: row.error,
    error_code: row.error_code,
    error_hint: row.error_hint,
    retryable: row.retryable,
    logs: row.logs || current.logs || [],
  });
  saveQueue();
  if (render) {
    renderRefreshStateViews();
  }
  if (log) {
    addLog(`${row.email} ${formatJobError(rowState(row))}`, "error");
  }
}

function saveSettings() {
  const loginConcurrency = Math.min(3, Math.max(1, Number.parseInt(els.loginConcurrency?.value || "1", 10) || 1));
  if (els.loginConcurrency) els.loginConcurrency.value = String(loginConcurrency);
  saveJson(STORAGE_KEYS.refreshSettings, {
    use_proxy: true,
    proxy_url: els.proxyUrl.value.trim(),
    login_strategy: "protocol",
    login_concurrency: loginConcurrency,
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
      phone_provider: row.phone_provider || "custom",
      phone_api_key: row.phone_api_key || "",
      phone_activation_id: row.phone_activation_id || "",
      phone_provider_endpoint: row.phone_provider_endpoint || "",
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

function compactQueueRowForStorage(row) {
  const logs = Array.isArray(row.logs) ? row.logs.slice(-30).map((entry) => ({
    level: entry?.level || "info",
    message: String(entry?.message || "").slice(0, 220),
    step: entry?.step || "",
    error_code: entry?.error_code || "",
    created_at: entry?.created_at || entry?.time || "",
  })) : [];
  return {
    ...row,
    logs,
  };
}

function normalizePhonePool(value) {
  if (refreshPhonePoolHelper?.normalizePhonePool) return refreshPhonePoolHelper.normalizePhonePool(value);
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map((item) => {
    const phone = String(item?.phone || "").trim();
    const rawProvider = String(item?.provider || item?.phone_provider || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    const provider = ["herosms", "hero"].includes(rawProvider)
      ? "herosms"
      : (["smsbower", "bower"].includes(rawProvider) ? "smsbower" : "custom");
    const apiUrl = String(item?.api_url || item?.apiUrl || "").trim();
    const apiKey = String(item?.api_key || item?.apiKey || item?.phone_api_key || "").trim();
    const activationId = String(item?.activation_id || item?.activationId || item?.phone_activation_id || "").trim();
    const endpoint = String(item?.endpoint || item?.provider_endpoint || item?.phone_provider_endpoint || "").trim();
    if (!phone || (provider === "custom" ? !apiUrl : (!apiKey || !activationId))) return null;
    const id = String(item?.id || `phone:${phone.toLowerCase()}`);
    const key = id.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      id,
      mode: item?.mode === "bound" || item?.mode === "one_to_one" ? "bound" : "batch",
      phone,
      provider,
      api_url: apiUrl,
      api_key: apiKey,
      activation_id: activationId,
      endpoint,
      account_email: String(item?.account_email || item?.accountEmail || "").trim().toLowerCase(),
      last_code: String(item?.last_code || item?.lastCode || ""),
      last_message: String(item?.last_message || item?.lastMessage || ""),
      last_checked_at: String(item?.last_checked_at || item?.lastCheckedAt || ""),
      status: String(item?.status || "idle"),
    };
  }).filter(Boolean);
}

function saveQueue() {
  invalidateQueueRowsCache();
  scheduleSaveJson(STORAGE_KEYS.refreshQueue, state.queue.map(compactQueueRowForStorage));
}

function savePhonePool() {
  scheduleSaveJson(STORAGE_KEYS.phonePool, state.phonePool);
}

function sourceLabel(account) {
  if (account.source === "microsoft") return account.service || "Outlook";
  if (account.source === "generic") return account.service || "其他邮箱";
  return "临时邮箱";
}

function mergeSelectedAccountsIntoQueue(accounts) {
  const merged = refreshQueueHelper?.mergeQueueItems
    ? refreshQueueHelper.mergeQueueItems(state.queue, accounts.map((account) => ({
      account,
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
    })))
    : { queue: state.queue.slice(), added: 0, selectedIds: [] };
  state.queue = merged.queue;
  merged.selectedIds.forEach((id) => state.selectedQueue.add(id));
  saveQueue();
  return merged;
}

function sourceTone(account) {
  if (account.source === "generic") return "generic";
  if (account.service === "Cloud Mail") return "cloud";
  return sourceBadgeTone(account.source);
}

function sourceRefreshState(account) {
  const key = accountEmailKey(account.email);
  if (!key) return { status: "idle", label: "未处理", tone: "idle", message: "" };
  const saved = state.savedRefreshResults.get(key);
  const rows = state.queue.filter((row) => accountEmailKey(row.email || row.name) === key);
  if (saved?.auth_file || rows.some((row) => row.auth_file || rowState(row).status === "success")) {
    return { status: "success", label: "成功", tone: "success", message: "已生成 auth_file" };
  }
  const running = rows.find((row) => ["queued", "running"].includes(rowState(row).status));
  if (running) {
    return { status: "running", label: "执行中", tone: "running", message: "" };
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
  return { status: "idle", label: "未处理", tone: "idle", message: "" };
}

function accountOptions(active) {
  return refreshSourceListHelper?.accountOptions?.(active) || "";
}

function invalidateSourceAccountsCache() {
  refreshSourceListHelper?.invalidateSourceAccountsCache?.();
}

function sourceAccountsCacheKey() {
  return refreshSourceListHelper?.sourceAccountsCacheKey?.() || "[]";
}

function filteredAccounts() {
  return refreshSourceListHelper?.filteredAccounts?.() || [];
}

function visibleSourceAccountsForCurrentPage() {
  return refreshSourceListHelper?.visibleSourceAccountsForCurrentPage?.() || [];
}

function renderSources() {
  refreshSourceListHelper?.renderSources?.();
}

function queueKey(account) {
  if (refreshQueueHelper?.queueKey) return refreshQueueHelper.queueKey(account);
  return [
    account.source_kind || account.source || "local",
    String(account.email || account.name || "").toLowerCase(),
    String(account.cpa_name || account.auth_index || ""),
  ].join("|");
}

function sourceFilterScopeActive() {
  return refreshSourceListHelper?.sourceFilterScopeActive?.() || false;
}

function selectedSourceAccounts() {
  return refreshSourceListHelper?.selectedSourceAccounts?.() || [];
}

function accountMailVerified(account) {
  return refreshSourceListHelper?.accountMailVerified?.(account) || false;
}

function accountMailFailed(account) {
  return refreshSourceListHelper?.accountMailFailed?.(account) || false;
}

function accountFetchPayload(account) {
  return refreshSourceListHelper?.accountFetchPayload?.(account) || {};
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
  return refreshSourceListHelper?.applyMailboxVerifyResult?.(account, result) || { status: "failed", code: "", label: "" };
}

async function verifySelectedMailboxes() {
  return refreshSourceListHelper?.verifySelectedMailboxes?.();
}

function addSelectedToQueue() {
  refreshSourceListHelper?.addSelectedToQueue?.();
}

async function removeSelectedSources() {
  return refreshSourceListHelper?.removeSelectedSources?.();
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

refreshQueueViewHelper = refreshQueueView?.createRefreshQueueView?.({
  state,
  els,
  rowState,
  inferErrorCode: (job) => inferErrorCode(job),
  errorCodeLabel: (code) => errorCodeLabel(code),
  compactText: (value, max) => compactText(value, max),
});

function isQueueRowTracked(rowId) {
  return state.queue.some((row) => row.id === rowId);
}

function clearJobPollError(rowId) {
  state.jobPollErrors.delete(rowId);
}

function pollErrorState(rowId) {
  const current = state.jobPollErrors.get(rowId);
  return current ? { ...current } : { count: 0, lastMessage: "", loggedKey: "" };
}

function rememberJobPollError(row, details, current) {
  const next = pollErrorState(row.id);
  const message = String(details?.error || "读取任务失败");
  next.count += 1;
  next.lastMessage = message;
  state.jobPollErrors.set(row.id, next);
  const effectiveErrorCode = details?.error_code || inferErrorCode(details || {}) || "job_poll_failed";
  if (next.loggedKey !== `${effectiveErrorCode}:${message}`) {
    addLog(`${row.email} 状态轮询异常：${errorCodeLabel(effectiveErrorCode)}`, "warning", {
      error_code: effectiveErrorCode,
      email: row.email,
      step: "status_poll",
      hint: details?.error_hint || message,
    });
    next.loggedKey = `${effectiveErrorCode}:${message}`;
    state.jobPollErrors.set(row.id, next);
  }
  state.jobs.set(row.id, {
    ...current,
    status: current.status || row.status || "running",
    jobId: current.jobId || row.jobId || "",
    error: current.error || "",
    error_code: current.error_code || "",
    error_hint: current.error_hint || "",
    logs: current.logs || row.logs || [],
  });
  return next;
}

function loginLabel(status) {
  if (refreshQueueViewHelper?.loginLabel) return refreshQueueViewHelper.loginLabel(status);
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
  if (refreshQueueViewHelper?.summarizeJobError) return refreshQueueViewHelper.summarizeJobError(job);
  const code = inferErrorCode(job);
  if (code) return errorCodeLabel(code);
  const detail = compactText(job.error_hint || job.error || "", 90);
  if (detail) return errorCodeLabel("login_failed");
  return "-";
}

function displayStatus(job) {
  if (refreshQueueViewHelper?.displayStatus) return refreshQueueViewHelper.displayStatus(job);
  if (job.status === "failed" && job.error_code === "login_cancelled") {
    return "canceled";
  }
  if (job.status === "failed" && job.error_code === "openai_turnstile_challenge") {
    return "challenge";
  }
  return job.status || "idle";
}

function queueFilterStatus(row) {
  if (refreshQueueViewHelper?.queueFilterStatus) return refreshQueueViewHelper.queueFilterStatus(row);
  const status = rowState(row).status || "idle";
  if (status === "queued") return "idle";
  return status;
}

function invalidateQueueRowsCache() {
  if (refreshQueueViewHelper?.invalidateQueueRowsCache) return refreshQueueViewHelper.invalidateQueueRowsCache();
  state.filteredQueueCacheKey = "";
  state.filteredQueueCacheRows = [];
}

function queueRowsCacheKey() {
  if (refreshQueueViewHelper?.queueRowsCacheKey) return refreshQueueViewHelper.queueRowsCacheKey();
  return JSON.stringify([
    state.queue.length,
    state.queue[0]?.id || "",
    state.queue[state.queue.length - 1]?.id || "",
    state.queueFilter || "all",
    state.queue.map((row) => `${row.id}:${rowState(row).status || "idle"}`).join("|"),
  ]);
}

function queueRowsForCurrentFilter() {
  if (refreshQueueViewHelper?.queueRowsForCurrentFilter) return refreshQueueViewHelper.queueRowsForCurrentFilter();
  const cacheKey = queueRowsCacheKey();
  if (cacheKey === state.filteredQueueCacheKey) return state.filteredQueueCacheRows;
  let rows;
  if (state.queueFilter === "all") return state.queue;
  if (state.queueFilter === "running") {
    rows = state.queue.filter((row) => ["queued", "running"].includes(rowState(row).status || "idle"));
  } else {
    rows = state.queue.filter((row) => queueFilterStatus(row) === state.queueFilter);
  }
  state.filteredQueueCacheKey = cacheKey;
  state.filteredQueueCacheRows = rows;
  return rows;
}

function renderQueueProgress(counts) {
  if (refreshQueueViewHelper?.renderQueueProgress) return refreshQueueViewHelper.renderQueueProgress(counts);
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
  const visibleQueue = queueRowsForCurrentFilter();
  state.queue.forEach((row) => {
    const status = rowState(row).status || "idle";
    counts[status] = (counts[status] || 0) + 1;
  });
  els.queueTotal.textContent = String(state.queue.length);
  els.queueIdle.textContent = String((counts.idle || 0) + (counts.queued || 0));
  els.queueRunning.textContent = String(counts.running || 0);
  els.queueSuccess.textContent = String(counts.success || 0);
  els.queueFailed.textContent = String(counts.failed || 0);
  renderQueueProgress(counts);
  if (els.queueSelectAll) {
    els.queueSelectAll.checked = Boolean(visibleQueue.length) && visibleQueue.every((row) => state.selectedQueue.has(row.id));
    els.queueSelectAll.indeterminate = visibleQueue.some((row) => state.selectedQueue.has(row.id)) && !els.queueSelectAll.checked;
  }
  els.queueFilterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.queueFilter === state.queueFilter);
  });
  if (!state.queue.length) {
    state.queueMarkup = "";
    els.queueBody.innerHTML = '<tr><td colspan="6" class="empty-cell">从左侧选择邮箱加入刷新队列。</td></tr>';
    return;
  }
  if (!visibleQueue.length) {
    state.queueMarkup = "";
    els.queueBody.innerHTML = '<tr><td colspan="6" class="empty-cell">当前筛选没有账号。</td></tr>';
    return;
  }
  const markup = visibleQueue.map((row) => {
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
    const sourceToneValue = sourceBadgeTone(row.source);
    return `
      <tr data-id="${escapeHtml(row.id)}">
        <td><input class="abnormal-check queue-check" type="checkbox" ${state.selectedQueue.has(row.id) ? "checked" : ""}></td>
        <td>
          <strong>${escapeHtml(row.email || row.name || "-")}</strong>
          <em>${escapeHtml(row.service || "本地邮箱")}${phoneEntry ? ` · 手机 ${escapeHtml(phoneEntry.phone)}` : ""}</em>
        </td>
        <td><span class="source-badge ${escapeHtml(sourceToneValue)}">${escapeHtml(row.service || "本地邮箱")}</span></td>
        <td><span class="login-status ${escapeHtml(status)}">${escapeHtml(loginLabel(status))}</span></td>
        <td><div class="login-error" title="${escapeHtml(errorText)}">${escapeHtml(errorText)}</div></td>
        <td>
          <div class="queue-action-stack">
            <button class="login-one" type="button" ${["queued", "running"].includes(rawStatus) ? "disabled" : ""}>${rawStatus === "queued" ? "等待中" : rawStatus === "running" ? "执行中" : "执行"}</button>
            ${canManualCode ? '<button class="code-one" type="button">填码</button>' : ""}
            ${["queued", "running"].includes(rawStatus) ? '<button class="cancel-one" type="button">终止</button>' : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("");
  if (state.queueMarkup !== markup) {
    els.queueBody.innerHTML = markup;
    state.queueMarkup = markup;
  }
}

function selectedQueueRows({ failedOnly = false, fallback = "filtered" } = {}) {
  const filteredRows = queueRowsForCurrentFilter();
  const visibleIds = new Set(filteredRows.map((row) => row.id));
  const selected = state.queue.filter((row) => state.selectedQueue.has(row.id) && visibleIds.has(row.id));
  const failedFilter = (rows) => rows.filter((row) => rowState(row).status === "failed");
  if (failedOnly) {
    const selectedFailed = failedFilter(selected);
    if (selectedFailed.length) return selectedFailed;
    if (fallback === "none") return [];
    if (fallback === "all") return failedFilter(state.queue);
    return failedFilter(filteredRows);
  }
  if (selected.length) return selected;
  if (fallback === "none") return [];
  if (fallback === "all") return state.queue;
  return filteredRows;
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
    renderSources();
  }
  return count;
}

function queuedRows() {
  return state.queue.filter((row) => rowState(row).status === "queued");
}

function selectedSingleQueueRow() {
  const visibleIds = new Set(queueRowsForCurrentFilter().map((row) => row.id));
  const rows = state.queue.filter((row) => state.selectedQueue.has(row.id) && visibleIds.has(row.id));
  return rows.length === 1 ? rows[0] : null;
}

function pruneSelectedQueueToCurrentFilter() {
  const visibleIds = new Set(queueRowsForCurrentFilter().map((row) => row.id));
  state.selectedQueue.forEach((id) => {
    if (!visibleIds.has(id)) state.selectedQueue.delete(id);
  });
}

function openManualCodeDialog(row, kind = "email") {
  return refreshManualCodeHelper?.openManualCodeDialog?.(row, kind);
}

function closeManualCodeDialog() {
  refreshManualCodeHelper?.closeManualCodeDialog?.();
}

function submitManualCodeDialog() {
  return refreshManualCodeHelper?.submitManualCodeDialog?.();
}

function promptCodeForRow(row) {
  return refreshManualCodeHelper?.promptCodeForRow?.(row);
}

function currentPhoneMode() {
  return els.phoneModeBatch && els.phoneModeBatch.checked ? "batch" : "one_to_one";
}

function phoneCodeForRow(row, entry = null) {
  return refreshPhonePoolHelper?.phoneCodeForRow?.(row, entry) || "";
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
  return refreshPhonePoolHelper?.phonePoolPayload?.() || [];
}

function phoneEntryForRow(row) {
  return refreshPhonePoolHelper?.phoneEntryForRow?.(row) || null;
}

function ensurePhoneEntryForRow(row) {
  return refreshPhonePoolHelper?.ensurePhoneEntryForRow?.(row) || null;
}

function formatPhoneTime(value) {
  return refreshPhonePoolHelper?.formatPhoneTime?.(value) || "";
}

function renderPhoneBindingList() {
  refreshPhonePoolHelper?.renderPhoneBindingList?.();
}


function renderPhonePool() {
  refreshPhonePoolHelper?.renderPhonePool?.();
}

function renderSelectedPhoneCodePanel() {
  if (!els.phoneCodeAccount) return;
  const row = selectedSingleQueueRow();
  if (els.phoneCodePanel) els.phoneCodePanel.hidden = !row;
  if (els.saveManualPhoneCode) els.saveManualPhoneCode.disabled = !row;
  if (els.pollSelectedPhone) els.pollSelectedPhone.disabled = !row;
  if (!row) {
    els.phoneCodeAccount.textContent = "未选中队列账号";
    els.phoneCodeCurrent.textContent = "手机验证码：-";
    if (els.phoneBindingTarget) els.phoneBindingTarget.textContent = currentPhoneMode() === "batch" ? "批量池：按队列分配" : "未选中刷新账号";
    return;
  }
  const entry = phoneEntryForRow(row);
  const code = phoneCodeForRow(row, entry);
  const phone = entry?.phone || row.phone_number || "未绑定手机";
  els.phoneCodeAccount.textContent = row.email || row.name || "当前账号";
  els.phoneCodeCurrent.textContent = code ? `手机 ${phone} · 验证码：${code}` : `手机 ${phone} · 验证码：-`;
  if (els.phoneBindingTarget) {
    els.phoneBindingTarget.textContent = currentPhoneMode() === "batch"
      ? "批量池：按队列分配"
      : `绑定到 ${row.email || row.name || "当前账号"}`;
  }
}

refreshSourceListHelper = refreshSourceList?.createRefreshSourceListHelper?.({
  state,
  els,
  helpers: {
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
    rowState,
  },
  actions: {
    storageKeys: STORAGE_KEYS,
    mergeSelectedAccountsIntoQueue,
  },
});

refreshManualCodeHelper = refreshManualCode?.createRefreshManualCodeHelper?.({
  state,
  els,
  helpers: {
    rowState,
    isPhoneVerificationError,
    phoneEntryForRow,
    phoneCodeForRow,
    savePhonePool,
    saveQueue,
    renderQueue,
    renderSelectedPhoneCodePanel,
    addLog,
    toast,
    submitManualPhoneCode,
    queueManualEmailCodeSubmit,
    selectedSingleQueueRow,
  },
  actions: {},
});

refreshPhonePoolHelper = refreshPhonePool?.createRefreshPhonePoolHelper?.({
  state,
  els,
  helpers: {
    escapeHtml,
    accountEmailKey,
    savePhonePool,
    saveQueue,
    renderQueue,
    renderSources,
    renderAll,
    renderSelectedPhoneCodePanel,
    toast,
    addLog,
    apiHeaders,
    readJsonResponse,
    currentPhoneMode,
    selectedSingleQueueRow,
    openManualCodeDialog,
  },
  actions: {
    normalizePhoneDigits,
    phoneMatches,
  },
});
refreshPhonePoolHelper?.syncPhoneProviderForm?.();

function validPhoneApiUrl(value) {
  return refreshPhonePoolHelper?.validPhoneApiUrl?.(value) || false;
}

function addOrUpdatePhoneEntry() {
  refreshPhonePoolHelper?.addOrUpdatePhoneEntry?.();
}

function importPhoneBatchEntries() {
  refreshPhonePoolHelper?.importPhoneBatchEntries?.();
}

function bindPhoneToSelected(phoneId) {
  refreshPhonePoolHelper?.bindPhoneToSelected?.(phoneId);
}

function removePhoneEntry(phoneId) {
  refreshPhonePoolHelper?.removePhoneEntry?.(phoneId);
}

async function pollPhoneEntry(phoneId, rowId = "") {
  return refreshPhonePoolHelper?.pollPhoneEntry?.(phoneId, rowId);
}

function saveManualPhoneCodeForSelected() {
  refreshPhonePoolHelper?.saveManualPhoneCodeForSelected?.();
}

async function pollSelectedPhoneCode() {
  return refreshPhonePoolHelper?.pollSelectedPhoneCode?.();
}

function failedRowsForCleanup() {
  return selectedQueueRows({ failedOnly: true, fallback: "none" });
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

async function cleanFailedRows() {
  const rows = failedRowsForCleanup();
  if (!rows.length) {
    toast("请先选中要清理的失败账号");
    addLog("请先选中要清理的失败账号", "warning");
    return;
  }
  const counts = rows.reduce((acc, row) => {
    const code = inferErrorCode(rowState(row));
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts).map(([code, count]) => `${errorCodeLabel(code)} ${count}`).join("，");
  if (!confirm(`将清理 ${rows.length} 个选中的失败账号：${summary}\n\n只会从 CPA 和凭证刷新队列移除，不会删除邮箱管理里的邮箱资料。继续？`)) {
    return;
  }
  let cpaDeleted = 0;
  try {
    cpaDeleted = await deleteCpaRows(rows);
  } catch (error) {
    const details = error.details || { error: error.message || "CPA 删除失败", error_code: "delete_failed" };
    addLog(formatJobError(details), "warning", { error_code: details.error_code || "delete_failed" });
  }
  const rowIds = new Set(rows.map((row) => row.id));
  state.queue = state.queue.filter((row) => !rowIds.has(row.id));
  rows.forEach((row) => {
    state.jobs.delete(row.id);
    state.selectedQueue.delete(row.id);
  });
  saveQueue();
  renderRefreshStateViews();
  addLog(`清理完成：队列 ${rows.length}，CPA ${cpaDeleted}，邮箱管理资料未删除`, "success");
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
  const hasGeneric = matches.some((item) => item.source === "generic")
    || (payload.generic_accounts || []).some((item) => accountEmailKey(item.email) === accountEmailKey(email));
  if (hasMicrosoft) return "microsoft";
  if (hasTemp) return "temp";
  if (hasGeneric) return "generic";
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
      ? `先在本页同步队列 JWT，或到${lineLabels.subscriptionsPage || "订阅管理页"}导入 邮箱----JWT`
      : `先到${lineLabels.subscriptionsPage || "订阅管理页"}导入 Outlook 四段凭证，或导入其他邮箱授权码 / IMAP / POP3 / API 取信配置，再重新执行`,
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
    phone_provider: phoneEntry?.provider || row.phone_provider || "custom",
    phone_api_key: phoneEntry?.api_key || row.phone_api_key || "",
    phone_activation_id: phoneEntry?.activation_id || row.phone_activation_id || "",
    phone_provider_endpoint: phoneEntry?.endpoint || row.phone_provider_endpoint || "",
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
    generic_accounts: sameEmail
      .filter((item) => item.source === "generic")
      .map(genericAccountPayload),
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
    if (!isQueueRowTracked(row.id)) return;
    commitQueueRowFailure(row, current, {
      error: "任务已终止",
      error_code: "login_cancelled",
      retryable: false,
    }, { render: true, log: false });
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
  if (!isQueueRowTracked(row.id)) return;
  const outcome = applyJobToRow(row, data.job || {}, current);
  addLog(`${row.email} 任务已终止`, "warning", { step: "cancel", email: row.email });
  renderForJobOutcome(outcome);
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
      generic_accounts: payload.generic_accounts || [],
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
  if (!isQueueRowTracked(row.id)) return { applied: false, changed: false };
  clearJobPollError(row.id);
  const oldCount = current.logs?.length || 0;
  const newLogCount = Math.max(0, (job.logs || []).length - oldCount);
  (job.logs || []).slice(oldCount).forEach((entry) => {
    addLog(`${row.email} ${entry.message || ""}`, entry.level || "info", {
      ...entry,
      email: row.email,
    });
  });

  const result = job.result || {};
  const authFile = result.auth_file || result.result?.auth_file || null;
  const regPassword = result.registration_password || result.result?.registration_password;
  const accountChanged = applyJobAccountResult(row, authFile, regPassword);

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
  const nextJobId = current.jobId || row.jobId || job.job_id || "";
  const jobChanged = (
    row.status !== current.status
    || row.error !== current.error
    || row.error_code !== current.error_code
    || row.error_hint !== current.error_hint
    || row.retryable !== current.retryable
    || nextJobId !== current.jobId
    || row.logs.length !== (current.logs?.length || 0)
  );
  state.jobs.set(row.id, {
    status: row.status,
    jobId: nextJobId,
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
  if (accountChanged) {
    saveJson(STORAGE_KEYS.accounts, state.accounts);
  }
  if (jobChanged || accountChanged) {
    saveQueue();
  }
  return {
    applied: true,
    changed: Boolean(jobChanged || accountChanged),
    jobChanged: Boolean(jobChanged),
    accountChanged: Boolean(accountChanged),
    logChanged: newLogCount > 0,
    statusTerminal: ["success", "failed"].includes(row.status),
  };
}

function stableComparableJson(value) {
  if (!value || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(stableComparableJson(item))));
  const sorted = Object.keys(value).sort().reduce((acc, key) => {
    acc[key] = JSON.parse(stableComparableJson(value[key]));
    return acc;
  }, {});
  return JSON.stringify(sorted);
}

function applyJobAccountResult(row, authFile, regPassword) {
  let changed = false;
  const account = accountForRow(row);
  if (authFile && typeof authFile === "object") {
    const nextAuthJson = stableComparableJson(authFile);
    const prevAuthJson = stableComparableJson(row.auth_file || null);
    if (nextAuthJson !== prevAuthJson) {
      row.auth_file = authFile;
      changed = true;
    }
    if (account) {
      const prevAccountAuthJson = stableComparableJson(account.auth_file || null);
      if (nextAuthJson !== prevAccountAuthJson) {
        account.auth_file = authFile;
        account.access_token = authFile.access_token || account.access_token || "";
        account.refresh_token = authFile.refresh_token || account.refresh_token || "";
        account.id_token = authFile.id_token || account.id_token || "";
        account.session_token = authFile.session_token || account.session_token || "";
        account.account_id = authFile.account_id || authFile.chatgpt_account_id || account.account_id || "";
        account.chatgpt_account_id = authFile.chatgpt_account_id || authFile.account_id || account.chatgpt_account_id || "";
        account.plan_type = authFile.plan_type || authFile.chatgpt_plan_type || account.plan_type || "";
        account.last_refresh = authFile.last_refresh || new Date().toISOString();
        changed = true;
      }
    }
  }
  if (regPassword) {
    if (row.password !== regPassword) {
      row.password = regPassword;
      changed = true;
    }
    if (account) {
      if (account.password !== regPassword) {
        account.password = regPassword;
        changed = true;
      }
    }
  }
  return changed;
}

function stopPolling() {
  if (typeof state.poller?.stop === "function") state.poller.stop();
  else if (state.poller) clearInterval(state.poller);
  state.poller = undefined;
}

function shouldUseRecoveryPolling() {
  return state.queue.some((row) => {
    const current = rowState(row);
    return ["queued", "running"].includes(current.status) && Boolean(current.jobId || row.jobId);
  });
}

async function fetchLoginJobStatus(jobId, fallback = "读取任务失败") {
  const { response, data } = await fetchJsonWithTimeout(`/client-api/cpa/login-status?job_id=${encodeURIComponent(jobId)}`, {
    headers: apiHeaders(),
    cache: "no-store",
  }, fallback, 12000, "job_poll_timeout");
  if (!data.success) {
    const details = parseErrorPayload(data, fallback);
    const error = new Error(details.error || fallback);
    error.details = details;
    throw error;
  }
  return { response, data, job: data.job || {} };
}

function finishJobFailureLog(row) {
  addLog(`${row.email} ${formatJobError(rowState(row))}`, "error", {
    error_code: row.error_code || "login_failed",
    email: row.email,
  });
}

async function syncLoginJobRow(row, current = rowState(row), { fallback = "读取任务失败", render = true } = {}) {
  if (!current.jobId) return { state: "missing_job_id", outcome: null, current };
  const { job } = await fetchLoginJobStatus(current.jobId, fallback);
  const outcome = applyJobToRow(row, job, current);
  if (!outcome.applied) return { state: "removed", outcome, current };
  if (render) renderForJobOutcome(outcome);
  const terminal = ["success", "failed"].includes(row.status);
  if (terminal && row.status === "failed") {
    finishJobFailureLog(row);
  }
  return {
    state: terminal ? row.status : "running",
    outcome,
    current: rowState(row),
  };
}

async function waitForJob(row, jobId) {
  while (true) {
    await sleep(2000);
    if (!isQueueRowTracked(row.id)) return "removed";
    const current = rowState(row);
    if ((current.jobId || row.jobId || "") !== jobId) return "replaced";
    const result = await syncLoginJobRow(row, current, { fallback: "读取任务失败", render: true });
    if (result.state !== "running") return result.state;
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
      clearJobPollError(row.id);
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
  const runToken = state.runnerToken + 1;
  state.runnerToken = runToken;
  state.runner = runQueuedRows(runToken);
  try {
    await state.runner;
  } finally {
    if (state.runnerToken === runToken) {
      state.runner = null;
    }
  }
}

async function runQueuedRows(runToken) {
  saveSettings();
  await syncAccountsFromServer({ quiet: true });
  els.startSelected.disabled = true;
  els.retryFailed.disabled = true;
  const oldText = els.startSelected.textContent;
  els.startSelected.textContent = "执行中";
  state.runProxyIps = new Set();
  const concurrency = Math.min(3, Math.max(1, Number.parseInt(els.loginConcurrency?.value || "1", 10) || 1));
  if (els.loginConcurrency) els.loginConcurrency.value = String(concurrency);
  const activeRows = new Set();
  addLog(`开始执行队列：${queuedRows().length} 个账号，并发 ${concurrency}；每账号独立代理出口`, "info");
  try {
    const worker = async () => {
      while (runToken === state.runnerToken) {
        const row = queuedRows().find((candidate) => !activeRows.has(candidate.id));
        if (!row) break;
        activeRows.add(row.id);
        try {
          await startLogin(row);
        } finally {
          activeRows.delete(row.id);
        }
        if (runToken !== state.runnerToken) break;
        if (queuedRows().length) {
          await sleep(1500);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queuedRows().length) }, worker));
  } finally {
    els.startSelected.disabled = false;
    els.retryFailed.disabled = false;
    els.startSelected.textContent = oldText;
    if (state.runnerToken === runToken) {
      state.runner = null;
    }
    startPolling();
    renderRefreshStateViews();
  }
}

function startPolling() {
  if (state.runner || state.poller || !shouldUseRecoveryPolling()) return;
  if (scheduler?.createPollLoop) {
    state.poller = scheduler.createPollLoop(pollJobs, { intervalMs: 2000 });
    state.poller.start();
    return;
  }
  state.poller = setInterval(pollJobs, 2000);
}

async function pollJobs() {
  if (state.pollInFlight) return;
  state.pollInFlight = true;
  const pending = state.queue.filter((row) => ["queued", "running"].includes(rowState(row).status));
  if (!pending.length) {
    stopPolling();
    state.pollInFlight = false;
    return;
  }
  try {
    let refreshMode = "";
    for (const row of pending) {
      const current = rowState(row);
      if (!current.jobId) continue;
      try {
        const result = await syncLoginJobRow(row, current, { fallback: "读取任务失败", render: false });
        const outcome = result.outcome;
        if (!outcome?.applied) continue;
        if (outcome.accountChanged || outcome.statusTerminal) {
          refreshMode = "state";
        } else if (!refreshMode && (outcome.jobChanged || outcome.logChanged)) {
          refreshMode = "queue";
        }
      } catch (error) {
        const details = error.details || { error: error.message || "读取任务失败", error_code: "login_failed" };
        const pollError = rememberJobPollError(row, details, current);
        const retryable = shouldAutoRetry(details);
        if (!retryable) {
          failRow(row, {
            error: details.error || "状态轮询失败",
            error_code: details.error_code || inferErrorCode(details || {}) || "job_poll_failed",
            error_hint: details.error_hint || "恢复轮询无法继续读取任务状态，已按失败处理。",
            retryable: false,
          });
          refreshMode = "state";
        } else if (pollError.count >= 3) {
          failRow(row, {
            error: details.error || "状态轮询连续失败",
            error_code: details.error_code || inferErrorCode(details || {}) || "job_poll_failed",
            error_hint: details.error_hint || "连续多次无法读取任务状态，请检查代理或网络后重试。",
            retryable: true,
          });
          refreshMode = "state";
        }
      }
    }
    if (refreshMode === "state") renderRefreshStateViews();
    else if (refreshMode === "queue") renderRefreshQueueViews();
  } finally {
    state.pollInFlight = false;
  }
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
  const selected = selectedQueueRows({ fallback: "filtered" });
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

async function manualUploadCpaResults() {
  const baseUrl = els.cpaBaseUrl ? els.cpaBaseUrl.value.trim() : "";
  const managementKey = els.cpaManagementKey ? els.cpaManagementKey.value.trim() : "";
  if (!baseUrl || !managementKey) {
    setCpaSyncStatus("请先填写 CPA 地址和管理密钥", "error");
    toast("请先填写 CPA 地址和管理密钥");
    return;
  }
  let rows = selectedQueueRows({ fallback: "none" }).map((row) => ({ row, authFile: row.auth_file })).filter((item) => item.authFile);
  if (!rows.length) {
    setCpaSyncStatus("请先选中要上传的成功账号", "warning");
    toast("请先选中要上传的成功账号");
    return;
  }
  if (els.manualUploadCpa) els.manualUploadCpa.disabled = true;
  setCpaSyncStatus(`准备上传 ${rows.length} 个账号`, "running");
  let success = 0;
  let failed = 0;
  try {
    for (const item of rows) {
      const email = item.row.email || item.authFile?.email || "";
      const name = item.row.cpa_name || item.row.name || email || "账号";
      setCpaSyncStatus(`正在上传 ${name}`, "running");
      const response = await fetch("/client-api/cpa/replace-auth", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          base_url: baseUrl,
          management_key: managementKey,
          name,
          auth_file: item.authFile,
        }),
      });
      const data = await readJsonResponse(response, "CPA 上传失败");
      if (!data.success) {
        const details = parseErrorPayload(data, "CPA 上传失败");
        failed += 1;
        addLog(`${email || name} ${details.error || "CPA 上传失败"}`, "warning", {
          step: "upload",
          email,
          error_code: details.error_code || "upload_failed",
        });
        continue;
      }
      success += 1;
      addLog(`${email || name} 已手动同步到 CPA`, "success", {
        step: "upload",
        email,
      });
    }
    const tone = failed ? (success ? "warning" : "error") : "success";
    setCpaSyncStatus(`手动上传完成：成功 ${success}，失败 ${failed}`, tone);
    toast(failed ? `上传完成：成功 ${success}，失败 ${failed}` : `已上传 ${success} 个账号`);
  } catch (error) {
    failed += 1;
    const message = error?.message || "CPA 上传失败";
    setCpaSyncStatus(message, "error");
    addLog(message, "error", { step: "upload", error_code: "upload_failed" });
    toast(message);
  } finally {
    if (els.manualUploadCpa) els.manualUploadCpa.disabled = false;
  }
}

function renderAll() {
  renderSources();
  renderQueue();
  renderPhonePool();
}

function normalizeServerAccount(item, source) {
  const email = String(item?.email || "").trim();
  if (!email) return null;
  const normalizedSource = source === "generic" ? "generic" : source === "temp" ? "temp" : "microsoft";
  const base = {
    id: `${normalizedSource}:${email.toLowerCase()}`,
    email,
    name: email,
    source: normalizedSource,
    service: normalizedSource === "temp" ? "Cloud Mail" : normalizedSource === "generic" ? "其他邮箱" : "Outlook",
    category: String(item?.label || item?.category || "").trim(),
    auth_file: null,
  };
  if (normalizedSource === "generic") {
    return {
      ...base,
      password: String(item?.password || item?.token || ""),
      username: String(item?.username || ""),
      mode: normalizeGenericMode(item?.mode || item?.provider),
      imap_host: String(item?.imap_host || item?.imapHost || item?.base_url || item?.baseUrl || ""),
      imap_port: Number(item?.imap_port || item?.imapPort || 993),
      pop3_host: String(item?.pop3_host || item?.pop3Host || ""),
      pop3_port: Number(item?.pop3_port || item?.pop3Port || 995),
    };
  }
  if (normalizedSource === "temp") {
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
    renderSources();
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
  const source = els.pickupImportSource?.value || "auto";
  const text = els.pickupImportText?.value.trim() || "";
  const { rows, errors } = parseLines(text, source);
  if (!rows.length) {
    toast(errors[0] || "没有识别到可导入的邮箱");
    addLog("快捷导入为空", "error", { error_code: "pickup_import_empty" });
    return;
  }
  const importCategory = new Date().toISOString().slice(0, 10);
  rows.forEach((row) => {
    row.category = String(row.category || "").trim() || importCategory;
  });
  const tempBaseUrl = normalizeTempWorkerUrl(els.pickupTempApi?.value || els.tempSyncApi?.value || "");
  const tempSitePassword = String(els.pickupTempSitePassword?.value || els.tempSyncSitePassword?.value || "").trim();
  rows.filter((row) => row.source === "temp").forEach((row) => {
    row.base_url = normalizeTempWorkerUrl(row.base_url || tempBaseUrl);
    row.site_password = row.site_password || tempSitePassword;
  });
  const oldText = els.confirmPickupImport?.textContent || "导入并同步";
  if (els.confirmPickupImport) {
    els.confirmPickupImport.disabled = true;
    els.confirmPickupImport.textContent = "导入中";
  }
  try {
    const results = await persistPickupImportedRows(rows);
    if (tempBaseUrl && els.tempSyncApi) els.tempSyncApi.value = tempBaseUrl;
    if (tempBaseUrl && els.pickupTempApi) els.pickupTempApi.value = tempBaseUrl;
    if (tempSitePassword && els.tempSyncSitePassword) els.tempSyncSitePassword.value = tempSitePassword;
    if (tempSitePassword && els.pickupTempSitePassword) els.pickupTempSitePassword.value = tempSitePassword;
    saveSettings();
    try {
      await syncAccountsFromServer({ quiet: true });
    } catch (syncError) {
      addLog(`导入已写入服务器，但回读同步失败：${syncError.message || "unknown"}`, "warning", {
        error_code: "pickup_import_failed",
      });
    }
    renderSources();
    closePickupImportModal();
    const summary = results.map((item) => {
      const imported = Number(item.data?.imported || 0);
      const updated = Number(item.data?.updated || 0);
      const label = item.source === "microsoft" ? "Outlook" : item.source === "temp" ? "临时邮箱" : "其他邮箱";
      return `${label} 新增 ${imported} / 更新 ${updated}`;
    }).join("，");
    toast(`已导入 ${rows.length} 个邮箱`);
    addLog(`快捷导入完成：${summary || `共 ${rows.length} 个邮箱`}`, "success");
    errors.slice(0, 5).forEach((item) => addLog(item, "warning", { error_code: "pickup_import_failed" }));
    results.flatMap((item) => item.data?.errors || []).slice(0, 5).forEach((item) => {
      addLog(String(item), "warning", { error_code: "pickup_import_failed" });
    });
  } catch (error) {
    const details = error.details || { error: error.message || "快捷导入失败", error_code: "pickup_import_failed" };
    addLog(formatJobError(details), "error", { error_code: details.error_code || "pickup_import_failed" });
    toast(details.error || "导入失败");
  } finally {
    if (els.confirmPickupImport) {
      els.confirmPickupImport.disabled = false;
      els.confirmPickupImport.textContent = oldText;
    }
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
        username: item.username || existing.username || "",
        mode: item.mode || existing.mode || "auto",
        imap_host: item.imap_host || existing.imap_host || "",
        imap_port: item.imap_port || existing.imap_port || 993,
        pop3_host: item.pop3_host || existing.pop3_host || "",
        pop3_port: item.pop3_port || existing.pop3_port || 995,
        base_url: item.base_url || existing.base_url || "",
        category: item.category || existing.category || "",
        auth_file: existing.auth_file || item.auth_file || null,
      });
    } else {
      byId.set(item.id, item);
    }
  });
  state.accounts = mailboxAccountModel?.dedupeAccounts
    ? mailboxAccountModel.dedupeAccounts(byId.values())
    : [...byId.values()].sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
  invalidateSourceAccountsCache();
}

async function syncAccountsFromServer({ quiet = false } = {}) {
  try {
    const [accountsResponse, tempResponse, genericResponse] = await Promise.all([
      fetch("/client-api/accounts", { headers: apiHeaders(), cache: "no-store" }),
      fetch("/client-api/temp-addresses", { headers: apiHeaders(), cache: "no-store" }),
      fetch("/client-api/generic-accounts", { headers: apiHeaders(), cache: "no-store" }),
    ]);
    const [accountsData, tempData, genericData] = await Promise.all([
      readJsonResponse(accountsResponse, "同步 Outlook 邮箱失败"),
      readJsonResponse(tempResponse, "同步临时邮箱失败"),
      readJsonResponse(genericResponse, "同步其他邮箱失败"),
    ]);
    if (!accountsResponse.ok) throw new Error(accountsData.error || accountsResponse.statusText || "Failed to load Outlook accounts");
    if (!tempResponse.ok) throw new Error(tempData.error || tempResponse.statusText || "Failed to load temp accounts");
    if (!genericResponse.ok) throw new Error(genericData.error || genericResponse.statusText || "Failed to load generic accounts");
    const serverManagedBeforeIds = new Set(
      state.accounts
        .filter((account) => ["microsoft", "temp", "generic"].includes(account.source))
        .map((account) => account.id)
    );
    const syncedAccounts = [
      ...((accountsData.accounts || []).map((item) => normalizeServerAccount(item, "microsoft")).filter(Boolean)),
      ...((tempData.addresses || []).map((item) => normalizeServerAccount(item, "temp")).filter(Boolean)),
      ...((genericData.accounts || []).map((item) => normalizeServerAccount(item, "generic")).filter(Boolean)),
    ];
    mergeServerAccountsSnapshot(syncedAccounts);
    if (syncedAccounts.length || serverManagedBeforeIds.size) {
      const serverIds = new Set(syncedAccounts.map((account) => account.id));
      state.accounts = state.accounts.filter((account) => !serverManagedBeforeIds.has(account.id) || serverIds.has(account.id));
      invalidateSourceAccountsCache();
    }
    saveJson(STORAGE_KEYS.accounts, state.accounts);
    renderSources();
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
  const accounts = visibleSourceAccountsForCurrentPage();
  const allSelected = Boolean(accounts.length) && accounts.every((account) => state.selectedAccounts.has(account.id));
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
const debouncedRenderSources = scheduler?.debounce
  ? scheduler.debounce(() => {
    state.sourcePage = 1;
    renderSources();
  }, 180)
  : () => {
    state.sourcePage = 1;
    renderSources();
  };

if (els.sourceSearch) {
  els.sourceSearch.addEventListener("input", debouncedRenderSources);
  els.sourceSearch.addEventListener("search", debouncedRenderSources);
}
[els.sourceType, els.sourceCategory, els.sourcePageSize].forEach((input) => {
  input.addEventListener("input", () => {
    state.sourcePage = 1;
    pruneSelectedQueueToCurrentFilter();
    renderSources();
  });
  input.addEventListener("change", () => {
    state.sourcePage = 1;
    pruneSelectedQueueToCurrentFilter();
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
    renderSelectedPhoneCodePanel();
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
  if (!state.runner) {
    startRows([item]);
    return;
  }
  const queued = markRowsQueued([item]);
  if (queued) {
    addLog(`${item.email} 已加入等待队列`, "info", { step: "queue", email: item.email });
    toast("已加入队列，将按顺序执行");
  }
});
els.startSelected.addEventListener("click", () => startRows(selectedQueueRows({ fallback: "none" })));
els.retryFailed.addEventListener("click", () => startRows(selectedQueueRows({ failedOnly: true, fallback: "none" })));
if (els.cleanFailed) {
  els.cleanFailed.addEventListener("click", cleanFailedRows);
}
document.querySelectorAll("[data-queue-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.queueFilter = button.dataset.queueFilter || "all";
    pruneSelectedQueueToCurrentFilter();
    renderQueue();
    renderSelectedPhoneCodePanel();
  });
});
els.exportCpa.addEventListener("click", () => exportResults("cpa"));
els.exportSub2.addEventListener("click", () => exportResults("sub2"));
if (els.syncTempCredentials) {
  els.syncTempCredentials.addEventListener("click", syncTempCredentialsForQueue);
}
if (els.openPickupImportModal) {
  els.openPickupImportModal.addEventListener("click", openPickupImportModal);
}
if (els.openPickupImportModalInline) {
  els.openPickupImportModalInline.addEventListener("click", openPickupImportModal);
}
if (els.pickupImportSource) {
  els.pickupImportSource.addEventListener("change", updatePickupImportPreview);
}
if (els.pickupImportText) {
  els.pickupImportText.addEventListener("input", updatePickupImportPreview);
}
if (els.pickupImportFile) {
  els.pickupImportFile.addEventListener("change", async () => {
    const file = els.pickupImportFile.files?.[0];
    if (!file) return;
    els.pickupImportText.value = await file.text();
    if (els.pickupImportFileName) els.pickupImportFileName.textContent = file.name;
    updatePickupImportPreview();
  });
}
if (els.confirmPickupImport) {
  els.confirmPickupImport.addEventListener("click", importPickupCredentials);
}
if (els.addPhoneEntry) {
  els.addPhoneEntry.addEventListener("click", addOrUpdatePhoneEntry);
}
if (els.importPhoneBatch) {
  els.importPhoneBatch.addEventListener("click", importPhoneBatchEntries);
}
if (els.manualUploadCpa) {
  els.manualUploadCpa.addEventListener("click", manualUploadCpaResults);
}
if (els.saveManualPhoneCode) {
  els.saveManualPhoneCode.addEventListener("click", saveManualPhoneCodeForSelected);
}
if (els.pollSelectedPhone) {
  els.pollSelectedPhone.addEventListener("click", pollSelectedPhoneCode);
}
if (els.phoneProvider) {
  els.phoneProvider.addEventListener("change", () => refreshPhonePoolHelper?.syncPhoneProviderForm?.());
}
if (els.verifyPhoneProvider) {
  els.verifyPhoneProvider.addEventListener("click", () => refreshPhonePoolHelper?.verifyPhoneProvider?.());
}
if (els.syncPhoneProviderActivations) {
  els.syncPhoneProviderActivations.addEventListener("click", () => refreshPhonePoolHelper?.syncPhoneProviderActivations?.());
}
els.closeManualCodeModal?.addEventListener("click", closeManualCodeDialog);
els.cancelManualCodeModal?.addEventListener("click", closeManualCodeDialog);
els.confirmManualCodeModal?.addEventListener("click", submitManualCodeDialog);
els.closePickupImportModal?.addEventListener("click", closePickupImportModal);
els.cancelPickupImportModal?.addEventListener("click", closePickupImportModal);
els.manualCodeModal?.addEventListener("click", (event) => {
  if (event.target === els.manualCodeModal) closeManualCodeDialog();
});
els.pickupImportModal?.addEventListener("click", (event) => {
  if (event.target === els.pickupImportModal) closePickupImportModal();
});
els.manualCodeModalInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitManualCodeDialog();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeManualCodeDialog();
  }
});
[els.phoneModeBatch, els.phoneModeOneToOne].forEach((input) => {
  if (!input) return;
  input.addEventListener("change", () => {
    saveSettings();
    renderPhonePool();
    renderSelectedPhoneCodePanel();
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
els.clearQueue.addEventListener("click", async () => {
  const rowsToCancel = state.queue.filter((row) => ["queued", "running"].includes(rowState(row).status));
  state.runnerToken += 1;
  if (typeof state.poller?.stop === "function") state.poller.stop();
  else if (state.poller) clearInterval(state.poller);
  state.poller = undefined;
  closeManualCodeDialog();
  state.manualCodeTimers.forEach((timer) => clearTimeout(timer));
  state.manualCodeTimers.clear();
  await Promise.all(rowsToCancel.map((row) => (
    cancelLoginJob(row).catch((error) => {
      addLog(`${row.email} 终止失败：${error.message || "unknown"}`, "error", {
        error_code: "login_cancel_failed",
        email: row.email,
      });
    })
  )));
  state.queue = [];
  state.selectedQueue.clear();
  state.jobs.clear();
  saveQueue();
  renderQueue();
  renderSelectedPhoneCodePanel();
  renderSources();
});
[els.useProxy, els.proxyUrl, els.loginStrategy, els.loginConcurrency, els.autoUpdateCpa, els.cpaBaseUrl, els.cpaManagementKey, els.taskMode, els.tempSyncApi, els.tempSyncAdminKey, els.tempSyncSitePassword].forEach((input) => {
  if (input) {
    input.addEventListener("input", saveSettings);
    input.addEventListener("change", saveSettings);
  }
});
els.clearLogs.addEventListener("click", () => {
  state.lastLog = null;
  state.logThrottle.clear();
  els.logList.innerHTML = '<div class="client-log-item">等待操作。</div>';
  els.logHint.textContent = "等待执行。";
});

renderAll();
updatePickupImportPreview();
syncAccountsFromServer();
syncRefreshResults();
startPolling();
