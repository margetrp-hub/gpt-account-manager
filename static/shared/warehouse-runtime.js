(function initWarehouseRuntime() {
  function createWarehouseRuntime(config = {}) {
    const base = window.GAM?.base;
    const workspaceKey = config.workspaceKey || "ctgptm.workspaceId";
    const workspaceId = base?.resolveWorkspaceId?.(workspaceKey)
      || base?.getWorkspaceId?.(workspaceKey)
      || localStorage.getItem(workspaceKey)
      || `ws_${crypto.randomUUID().replace(/-/g, "")}`;

    function loadJson(key, fallback) {
      if (base?.loadJson) return base.loadJson(key, fallback);
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    }

    function loadScopedJson(scopedKey, legacyKey, fallback) {
      if (base?.loadScopedJson) return base.loadScopedJson(scopedKey, legacyKey, fallback);
      const sentinel = "__missing__";
      const scoped = loadJson(scopedKey, sentinel);
      if (scoped !== sentinel) return scoped;
      if (!legacyKey) return fallback;
      const legacy = loadJson(legacyKey, sentinel);
      return legacy !== sentinel ? legacy : fallback;
    }

    function saveJson(key, value) {
      if (base?.saveJson) return base.saveJson(key, value);
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    }

    function persistIfMissing(key, value) {
      if (localStorage.getItem(key) !== null) return false;
      if (!value) return false;
      if (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) return false;
      return saveJson(key, value);
    }

    function rememberedAdminToken(explicit = "") {
      return base?.rememberedAdminToken?.(explicit)
        || explicit
        || localStorage.getItem("ctgptm.admin.toolToken")
        || "";
    }

    function apiHeaders(explicitToken = "") {
      if (base?.apiHeaders) {
        return base.apiHeaders({ workspaceId, token: rememberedAdminToken(explicitToken) });
      }
      const token = rememberedAdminToken(explicitToken);
      return {
        "Content-Type": "application/json",
        "X-Workspace-Id": workspaceId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
    }

    function workspaceScopedKey(prefix) {
      if (base?.workspaceScopedKey) return base.workspaceScopedKey(prefix, workspaceId);
      return `${prefix}${workspaceId}`;
    }

    return {
      base,
      workspaceId,
      loadJson,
      loadScopedJson,
      saveJson,
      persistIfMissing,
      rememberedAdminToken,
      apiHeaders,
      workspaceScopedKey,
      legacyKeys: base?.LEGACY_SHARED_KEYS || {},
      scopedPrefixes: base?.WORKSPACE_SCOPED_PREFIXES || {},
    };
  }

  window.GAM = window.GAM || {};
  window.GAM.warehouseRuntime = { createWarehouseRuntime };
}());
