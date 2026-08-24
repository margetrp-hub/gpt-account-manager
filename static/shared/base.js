(function initSharedBase() {
  const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{5,63}$/;
  const DEFAULT_WORKSPACE_KEY = "ctgptm.workspaceId";
  const DEFAULT_WORKSPACE_COOKIE = "ctgptm_workspace_id";
  const DEFAULT_ADMIN_TOKEN_KEY = "ctgptm.admin.toolToken";
  const DEFAULT_WORKSPACE_HISTORY_KEY = "ctgptm.workspaceHistory";
  const WORKSPACE_SCOPED_PREFIXES = Object.freeze({
    accountRecords: "ctgptm.account.records:",
    accountSettings: "ctgptm.account.settings:",
    mailAccounts: "ctgptm.mail.accounts:",
    mailCategories: "ctgptm.mail.categories:",
    mailMessages: "ctgptm.mail.messages:",
    ignoredMessages: "ctgptm.mail.ignoredMessages:",
    refreshQueue: "ctgptm.mail.refreshQueue:",
    abnormalRows: "ctgptm.mail.abnormalRows:",
    mailboxControlsCollapsed: "ctgptm.mail.mailboxControlsCollapsed.v2:",
    refreshSettings: "ctgptm.mail.refreshSettings:",
    phonePool: "ctgptm.mail.phonePool:",
    cpaSettings: "ctgptm.mail.cpaSettings:",
    tempSettings: "ctgptm.mail.tempSettings:",
    cpaWarehouseSettings: "ctgptm.cpaWarehouse.settings:",
  });
  const LEGACY_SHARED_KEYS = Object.freeze({
    workspace: DEFAULT_WORKSPACE_KEY,
    workspaceHistory: DEFAULT_WORKSPACE_HISTORY_KEY,
    adminToken: DEFAULT_ADMIN_TOKEN_KEY,
    legacyMailAccounts: "ctgptm.mail.accounts",
    legacyMailCategories: "ctgptm.mail.categories",
    legacyIgnoredMessages: "ctgptm.mail.ignoredMessages",
    legacyRefreshQueue: "ctgptm.mail.refreshQueue",
    legacyAbnormalRows: "ctgptm.mail.abnormalRows",
    legacyPhonePool: "ctgptm.mail.phonePool",
    legacyCpaSettings: "ctgptm.mail.cpaSettings",
    legacyTempSettings: "ctgptm.mail.tempSettings",
    legacyCpaWarehouseSettings: "ctgptm-cpa-warehouse-settings",
  });

  function loadWorkspaceHistory(storageKey = DEFAULT_WORKSPACE_HISTORY_KEY) {
    try {
      const rows = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(rows)
        ? rows.filter((item) => item && WORKSPACE_ID_PATTERN.test(String(item.id || "")))
        : [];
    } catch {
      return [];
    }
  }

  function readWorkspaceCookie(cookieKey = DEFAULT_WORKSPACE_COOKIE) {
    try {
      const prefix = `${encodeURIComponent(cookieKey)}=`;
      const row = String(document.cookie || "")
        .split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith(prefix));
      const value = row ? decodeURIComponent(row.slice(prefix.length)) : "";
      return WORKSPACE_ID_PATTERN.test(value) ? value : "";
    } catch {
      return "";
    }
  }

  function writeWorkspaceCookie(workspaceId, cookieKey = DEFAULT_WORKSPACE_COOKIE) {
    if (!WORKSPACE_ID_PATTERN.test(String(workspaceId || ""))) return;
    try {
      const secure = window.location?.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${encodeURIComponent(cookieKey)}=${encodeURIComponent(workspaceId)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    } catch {
      // localStorage remains the primary workspace pointer when cookies are unavailable.
    }
  }

  function rememberWorkspaceId(workspaceId, options = {}) {
    if (!WORKSPACE_ID_PATTERN.test(String(workspaceId || ""))) return "";
    const storageKey = options.historyStorageKey || DEFAULT_WORKSPACE_HISTORY_KEY;
    const currentStorageKey = options.currentStorageKey || DEFAULT_WORKSPACE_KEY;
    const label = String(options.label || "").trim();
    const now = new Date().toISOString();
    const history = loadWorkspaceHistory(storageKey);
    const previous = history.find((item) => item.id === workspaceId);
    const existing = history.filter((item) => item.id !== workspaceId);
    const next = [
      {
        id: workspaceId,
        label,
        last_seen_at: now,
        first_seen_at: previous?.first_seen_at || now,
      },
      ...existing,
    ].slice(0, 24);
    localStorage.setItem(storageKey, JSON.stringify(next));
    localStorage.setItem(currentStorageKey, workspaceId);
    writeWorkspaceCookie(workspaceId, options.cookieKey || DEFAULT_WORKSPACE_COOKIE);
    return workspaceId;
  }

  function persistAdminTokenFromQuery(options = {}) {
    const {
      search = window.location.search,
      queryKey = "token",
      storageKey = DEFAULT_ADMIN_TOKEN_KEY,
    } = options;
    const token = new URLSearchParams(search || "").get(queryKey) || "";
    if (token) localStorage.setItem(storageKey, token);
    return token;
  }

  function rememberedAdminToken(explicitToken = "", options = {}) {
    const storageKey = options.storageKey || DEFAULT_ADMIN_TOKEN_KEY;
    return explicitToken || localStorage.getItem(storageKey) || "";
  }

  function getWorkspaceId(storageKey = DEFAULT_WORKSPACE_KEY) {
    const existing = localStorage.getItem(storageKey) || "";
    if (WORKSPACE_ID_PATTERN.test(existing)) {
      rememberWorkspaceId(existing, { currentStorageKey: storageKey });
      return existing;
    }
    const cookieWorkspace = readWorkspaceCookie();
    if (cookieWorkspace) {
      return rememberWorkspaceId(cookieWorkspace, { currentStorageKey: storageKey });
    }
    const next = `ws_${crypto.randomUUID().replace(/-/g, "")}`;
    return rememberWorkspaceId(next, { currentStorageKey: storageKey });
  }

  function resolveWorkspaceId(storageKey = DEFAULT_WORKSPACE_KEY, options = {}) {
    const queryKey = options.queryKey || "force_workspace";
    const forcedWorkspace = new URLSearchParams(window.location.search).get(queryKey) || "";
    if (WORKSPACE_ID_PATTERN.test(forcedWorkspace)) {
      rememberWorkspaceId(forcedWorkspace, {
        currentStorageKey: storageKey,
        label: options.forcedLabel || "手动恢复",
      });
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete(queryKey);
        window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
      } catch {
        // ignore URL cleanup failures
      }
      return forcedWorkspace;
    }
    const existing = localStorage.getItem(storageKey) || "";
    if (WORKSPACE_ID_PATTERN.test(existing)) {
      rememberWorkspaceId(existing, { currentStorageKey: storageKey });
      return existing;
    }
    const cookieWorkspace = readWorkspaceCookie(options.cookieKey || DEFAULT_WORKSPACE_COOKIE);
    if (cookieWorkspace) {
      return rememberWorkspaceId(cookieWorkspace, {
        currentStorageKey: storageKey,
        cookieKey: options.cookieKey,
      });
    }
    const next = options.fallbackWorkspaceId && WORKSPACE_ID_PATTERN.test(options.fallbackWorkspaceId)
      ? options.fallbackWorkspaceId
      : `ws_${crypto.randomUUID().replace(/-/g, "")}`;
    return rememberWorkspaceId(next, { currentStorageKey: storageKey });
  }

  function workspaceScopedKey(prefix, workspaceId) {
    const cleanPrefix = String(prefix || "");
    const resolvedWorkspaceId = workspaceId || resolveWorkspaceId(DEFAULT_WORKSPACE_KEY);
    return `${cleanPrefix}${resolvedWorkspaceId}`;
  }

  function apiHeaders(options = {}) {
    const workspaceStorageKey = options.workspaceStorageKey || DEFAULT_WORKSPACE_KEY;
    const workspaceId = options.workspaceId || resolveWorkspaceId(workspaceStorageKey);
    const token = rememberedAdminToken(options.token || "", { storageKey: options.adminTokenStorageKey });
    const headers = { "X-Workspace-Id": workspaceId };
    if (options.includeContentType !== false) {
      headers["Content-Type"] = options.contentType || "application/json";
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  function migrateLegacyStorageKeys(legacyKeys = {}, scopedKeys = {}, names = []) {
    names.forEach((name) => {
      const legacyKey = legacyKeys[name];
      const scopedKey = scopedKeys[name];
      if (!legacyKey || !scopedKey || legacyKey === scopedKey) return;
      if (localStorage.getItem(scopedKey) !== null) return;
      const raw = localStorage.getItem(legacyKey);
      if (raw === null) return;
      localStorage.setItem(scopedKey, raw);
      localStorage.removeItem(legacyKey);
    });
  }

  function repairMojibakeText(value, fixes) {
    if (typeof value !== "string" || !value) return value;
    let text = value;
    if (fixes && typeof fixes.forEach === "function") {
      fixes.forEach((fixed, broken) => {
        text = text.split(broken).join(fixed);
      });
    }
    return text;
  }

  function repairStoredJson(value, fixes) {
    if (typeof value === "string") return repairMojibakeText(value, fixes);
    if (Array.isArray(value)) return value.map((item) => repairStoredJson(item, fixes));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, repairStoredJson(item, fixes)]),
      );
    }
    return value;
  }

  function repairLocalStorageKeys(keys, options = {}) {
    const fixes = options.fixes;
    keys.forEach((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        const repaired = repairStoredJson(parsed, fixes);
        if (JSON.stringify(parsed) !== JSON.stringify(repaired)) {
          localStorage.setItem(key, JSON.stringify(repaired));
        }
      } catch {
        const repaired = repairMojibakeText(raw, fixes);
        if (repaired !== raw) localStorage.setItem(key, repaired);
      }
    });
  }

  function loadJson(key, fallback, options = {}) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return typeof options.repair === "function" ? options.repair(parsed) : parsed;
    } catch {
      return fallback;
    }
  }

  function loadScopedJson(scopedKey, legacyKey, fallback, options = {}) {
    const sentinel = { __missing__: true };
    const scoped = loadJson(scopedKey, sentinel, options);
    if (scoped !== sentinel) return scoped;
    if (!legacyKey) return fallback;
    const legacy = loadJson(legacyKey, sentinel, options);
    return legacy !== sentinel ? legacy : fallback;
  }

  function saveJson(key, value, options = {}) {
    if (typeof options.skip === "function" && options.skip(key, value)) return false;
    if (options.skip === true) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      if (/quota|exceeded/i.test(String(error?.name || error?.message || ""))) {
        if (typeof options.onQuotaExceeded === "function") {
          options.onQuotaExceeded(error);
        } else {
          console.warn("localStorage quota exceeded; skipped", key);
        }
        return false;
      }
      throw error;
    }
  }

  function createPendingSaveScheduler(saveFn) {
    const pending = new Map();
    function schedule(key, value, delay = 200) {
      const existing = pending.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        pending.delete(key);
        saveFn(key, value);
      }, delay);
      pending.set(key, timer);
    }
    function clear(key) {
      const timer = pending.get(key);
      if (!timer) return;
      clearTimeout(timer);
      pending.delete(key);
    }
    function clearAll() {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    }
    return {
      schedule,
      clear,
      clearAll,
    };
  }

  async function readJsonResponse(response, label, options = {}) {
    const text = await response.text();
    if (!text) {
      if (options.throwOnHttpError && !response.ok) {
        throw new Error(label || response.statusText || "Request failed");
      }
      return {};
    }
    try {
      const data = JSON.parse(text);
      if (options.throwOnHttpError && !response.ok) {
        if (typeof options.httpErrorBuilder === "function") {
          throw options.httpErrorBuilder({ response, label, text, data });
        }
        throw new Error(data?.error || label || response.statusText || "Request failed");
      }
      return data;
    } catch (error) {
      if (options.allowTextFallback) {
        const data = { error: text.slice(0, options.fallbackTextLimit || 300) };
        if (options.throwOnHttpError && !response.ok) {
          if (typeof options.httpErrorBuilder === "function") {
            throw options.httpErrorBuilder({ response, label, text, data });
          }
          throw new Error(data.error || label || response.statusText || "Request failed");
        }
        return data;
      }
      const snippet = text.replace(/\s+/g, " ").slice(0, options.snippetLimit || 220);
      if (typeof options.onParseError === "function") {
        const custom = options.onParseError({ response, label, text, snippet, error });
        if (custom instanceof Error) throw custom;
        if (typeof custom === "string" && custom) throw new Error(custom);
      }
      throw new Error(`${label || "Request"} returned non-JSON (${response.status}): ${snippet}`);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

  window.GAM = window.GAM || {};
  window.GAM.base = {
    persistAdminTokenFromQuery,
    getWorkspaceId,
    rememberWorkspaceId,
    loadWorkspaceHistory,
    rememberedAdminToken,
    apiHeaders,
    migrateLegacyStorageKeys,
    resolveWorkspaceId,
    workspaceScopedKey,
    WORKSPACE_SCOPED_PREFIXES,
    LEGACY_SHARED_KEYS,
    loadJson,
    loadScopedJson,
    saveJson,
    createPendingSaveScheduler,
    readJsonResponse,
    escapeHtml,
    repairMojibakeText,
    repairStoredJson,
    repairLocalStorageKeys,
  };
}());
