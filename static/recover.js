(() => {
  const WORKSPACE_ID_STORAGE_KEY = "ctgptm.workspaceId";
  const WORKSPACE_HISTORY_KEY = "ctgptm.workspaceHistory";
  const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{5,63}$/;
  const BACKUP_FORMAT = "gpt-account-manager-workspace-backup";
  const BACKUP_VERSION = 1;
  const els = {
    currentWorkspace: document.querySelector("#currentWorkspace"),
    workspaceInput: document.querySelector("#workspaceInput"),
    checkWorkspaceBtn: document.querySelector("#checkWorkspaceBtn"),
    adminListBtn: document.querySelector("#adminListBtn"),
    workspacePassword: document.querySelector("#workspacePassword"),
    workspacePasswordHint: document.querySelector("#workspacePasswordHint"),
    saveWorkspacePasswordBtn: document.querySelector("#saveWorkspacePasswordBtn"),
    recoverPassword: document.querySelector("#recoverPassword"),
    recoverByPasswordBtn: document.querySelector("#recoverByPasswordBtn"),
    backupPassword: document.querySelector("#backupPassword"),
    exportBackupBtn: document.querySelector("#exportBackupBtn"),
    importBackupFile: document.querySelector("#importBackupFile"),
    recoverStatus: document.querySelector("#recoverStatus"),
    workspaceList: document.querySelector("#workspaceList"),
  };

  const base = window.GAM?.base;
  const scopedPrefixes = base?.WORKSPACE_SCOPED_PREFIXES || {};
  const legacyKeys = base?.LEGACY_SHARED_KEYS || {};
  const BACKUP_GLOBAL_KEYS = new Set([
    WORKSPACE_ID_STORAGE_KEY,
    WORKSPACE_HISTORY_KEY,
    "ctgptm.language",
    legacyKeys.legacyCpaSettings || "ctgptm.mail.cpaSettings",
    legacyKeys.legacyTempSettings || "ctgptm.mail.tempSettings",
    legacyKeys.legacyCpaWarehouseSettings || "ctgptm-cpa-warehouse-settings",
  ]);
  const BACKUP_LEGACY_KEYS = new Set([
    legacyKeys.legacyMailAccounts || "ctgptm.mail.accounts",
    legacyKeys.legacyMailCategories || "ctgptm.mail.categories",
    legacyKeys.legacyIgnoredMessages || "ctgptm.mail.ignoredMessages",
    legacyKeys.legacyRefreshQueue || "ctgptm.mail.refreshQueue",
    legacyKeys.legacyAbnormalRows || "ctgptm.mail.abnormalRows",
    legacyKeys.legacyPhonePool || "ctgptm.mail.phonePool",
  ]);
  const BACKUP_WORKSPACE_PREFIXES = [
    scopedPrefixes.accountRecords || "ctgptm.account.records:",
    scopedPrefixes.accountSettings || "ctgptm.account.settings:",
    scopedPrefixes.cpaSettings || "ctgptm.mail.cpaSettings:",
    scopedPrefixes.mailAccounts || "ctgptm.mail.accounts:",
    scopedPrefixes.mailCategories || "ctgptm.mail.categories:",
    scopedPrefixes.mailMessages || "ctgptm.mail.messages:",
    scopedPrefixes.ignoredMessages || "ctgptm.mail.ignoredMessages:",
    scopedPrefixes.refreshQueue || "ctgptm.mail.refreshQueue:",
    scopedPrefixes.abnormalRows || "ctgptm.mail.abnormalRows:",
    scopedPrefixes.mailboxControlsCollapsed || "ctgptm.mail.mailboxControlsCollapsed.v2:",
    scopedPrefixes.refreshSettings || "ctgptm.mail.refreshSettings:",
    scopedPrefixes.phonePool || "ctgptm.mail.phonePool:",
    scopedPrefixes.tempSettings || "ctgptm.mail.tempSettings:",
    scopedPrefixes.cpaWarehouseSettings || "ctgptm.cpaWarehouse.settings:",
  ];
  const lineLabels = window.GAM?.appShell?.LINE_LABELS || {};
  const workspaceIdFromBase = base?.resolveWorkspaceId?.(WORKSPACE_ID_STORAGE_KEY) || "";

  function currentWorkspaceId() {
    return workspaceIdFromBase || localStorage.getItem(WORKSPACE_ID_STORAGE_KEY) || "";
  }

  function setStatus(message, tone = "") {
    els.recoverStatus.textContent = message;
    els.recoverStatus.dataset.tone = tone;
  }

  function workspaceHistory() {
    const rows = base?.loadWorkspaceHistory?.(WORKSPACE_HISTORY_KEY) || [];
    const current = currentWorkspaceId();
    if (WORKSPACE_ID_PATTERN.test(current) && !rows.some((row) => row.id === current)) {
      rows.unshift({ id: current, label: "当前工作区", last_seen_at: "" });
    }
    return rows;
  }

  function rememberWorkspace(workspaceId, label = "手动找回") {
    if (base?.rememberWorkspaceId) {
      base.rememberWorkspaceId(workspaceId, {
        label,
        currentStorageKey: WORKSPACE_ID_STORAGE_KEY,
        historyStorageKey: WORKSPACE_HISTORY_KEY,
      });
      return;
    }
    localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, workspaceId);
  }

  function apiHeaders() {
    const token = base?.rememberedAdminToken?.() || localStorage.getItem("ctgptm.admin.toolToken") || "";
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async function readJson(response, label) {
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`${label} 返回了非 JSON 内容`);
    }
    if (!response.ok) {
      throw new Error(payload.error || `${label} 失败：${response.status}`);
    }
    return payload;
  }

  function formatTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function countsText(row) {
    const counts = row.counts || {};
    return [
      `Outlook ${counts.microsoft_accounts || 0}`,
      `临时 ${counts.temp_addresses || 0}`,
      `其他 ${counts.generic_accounts || 0}`,
      `邮件 ${counts.messages || 0}`,
      `刷新 ${counts.refresh_results || 0}`,
    ].join(" · ");
  }

  function openWithWorkspace(path, workspaceId) {
    const url = new URL(path, window.location.origin);
    url.searchParams.set("force_workspace", workspaceId);
    window.location.href = url.pathname + url.search;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function deriveBackupKey(password, salt) {
    const baseKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 180000,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async function encryptBackup(payload, password) {
    if (!crypto?.subtle) throw new Error("当前浏览器不支持加密备份，请使用 HTTPS 或 localhost 打开。");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(password, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(payload)),
    );
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      workspace_id: payload.workspace_id,
      encrypted: true,
      cipher: "AES-GCM",
      kdf: "PBKDF2-SHA256",
      iterations: 180000,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(ciphertext)),
      exported_at: new Date().toISOString(),
    };
  }

  async function decryptBackup(payload, password) {
    if (!crypto?.subtle) throw new Error("当前浏览器不支持解密备份，请使用 HTTPS 或 localhost 打开。");
    if (!password) throw new Error("这个备份已加密，请先填写备份密码。");
    const salt = base64ToBytes(payload.salt || "");
    const iv = base64ToBytes(payload.iv || "");
    const data = base64ToBytes(payload.data || "");
    const key = await deriveBackupKey(password, salt);
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
      return JSON.parse(new TextDecoder().decode(plain));
    } catch {
      throw new Error("备份密码不正确，或备份文件已损坏。");
    }
  }

  function isWorkspaceKey(key, workspaceId) {
    return BACKUP_WORKSPACE_PREFIXES.some((prefix) => key === `${prefix}${workspaceId}`);
  }

  function isBackupKey(key, workspaceId) {
    if (key === "ctgptm.admin.toolToken") return false;
    if (BACKUP_GLOBAL_KEYS.has(key)) return true;
    if (BACKUP_LEGACY_KEYS.has(key)) return true;
    return isWorkspaceKey(key, workspaceId);
  }

  function workspaceBackupKeys(workspaceId) {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && isBackupKey(key, workspaceId)) keys.push(key);
    }
    return [...new Set(keys)].sort();
  }

  function buildBackupPayload() {
    const workspaceId = currentWorkspaceId();
    if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
      throw new Error("当前浏览器没有有效工作区，无法导出。");
    }
    const storage = {};
    workspaceBackupKeys(workspaceId).forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null) storage[key] = value;
    });
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      encrypted: false,
      workspace_id: workspaceId,
      exported_at: new Date().toISOString(),
      storage,
    };
  }

  function downloadBackup(payload, workspaceId) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `gpt-account-manager-backup-${workspaceId}-${stamp}.json`;
    document.body.append(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
  }

  async function exportBackup() {
    const payload = buildBackupPayload();
    const password = els.backupPassword.value;
    const output = password ? await encryptBackup(payload, password) : payload;
    downloadBackup(output, payload.workspace_id);
    setStatus(password ? "已导出加密备份。" : "已导出普通 JSON 备份。");
  }

  function applyBackupPayload(payload) {
    if (payload?.format !== BACKUP_FORMAT || !payload.storage || typeof payload.storage !== "object") {
      throw new Error("备份文件格式不正确。");
    }
    const workspaceId = payload.workspace_id || payload.storage[WORKSPACE_ID_STORAGE_KEY] || "";
    if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
      throw new Error("备份文件缺少有效工作区 ID。");
    }
    Object.entries(payload.storage).forEach(([key, value]) => {
      if (!isBackupKey(key, workspaceId)) return;
      if (typeof value === "string") localStorage.setItem(key, value);
    });
    rememberWorkspace(workspaceId, "备份恢复");
    els.currentWorkspace.textContent = workspaceId;
    els.workspaceInput.value = workspaceId;
    setStatus("备份已导入，并已切换到对应工作区。");
    checkWorkspaces([workspaceId]).catch(() => {});
  }

  async function importBackup(file) {
    if (!file) return;
    const raw = await file.text();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error("备份文件不是有效 JSON。");
    }
    const normalized = payload.encrypted
      ? await decryptBackup(payload, els.backupPassword.value)
      : payload;
    applyBackupPayload(normalized);
  }

  function renderRows(rows) {
    els.workspaceList.textContent = "";
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "recover-empty";
      empty.textContent = "没有找到可恢复的工作区。可以粘贴工作区 ID 后点检查。";
      els.workspaceList.append(empty);
      return;
    }

    rows.forEach((row) => {
      const card = document.createElement("article");
      card.className = "recover-workspace";
      if (row.workspace_id === currentWorkspaceId()) card.classList.add("active");

      const title = document.createElement("div");
      title.className = "recover-workspace-title";
      const passwordText = row.password_enabled ? "已设置密码" : "未设置密码";
      title.innerHTML = `<strong>${row.workspace_id}</strong><span>${row.exists ? "服务器有数据" : "服务器未找到数据"} · ${passwordText}</span>`;

      const meta = document.createElement("p");
      meta.textContent = [
        countsText(row),
        `最近活动 ${formatTime(row.latest_activity)}`,
        row.password_hint ? `提示：${row.password_hint}` : "",
      ].filter(Boolean).join(" · ");

      const actions = document.createElement("div");
      actions.className = "recover-workspace-actions";

      const setButton = document.createElement("button");
      setButton.type = "button";
      setButton.className = "primary";
      setButton.textContent = row.workspace_id === currentWorkspaceId() ? "已在使用" : "切换到这个工作区";
      setButton.disabled = row.workspace_id === currentWorkspaceId();
      setButton.addEventListener("click", () => {
        rememberWorkspace(row.workspace_id, "恢复切换");
        openWithWorkspace("/", row.workspace_id);
      });

      const mailboxButton = document.createElement("button");
      mailboxButton.type = "button";
      mailboxButton.textContent = `打开${lineLabels.mailboxes || "邮箱管理"}`;
      mailboxButton.addEventListener("click", () => {
        rememberWorkspace(row.workspace_id, "恢复切换");
        openWithWorkspace("/mailboxes.html", row.workspace_id);
      });

      const refreshButton = document.createElement("button");
      refreshButton.type = "button";
      refreshButton.textContent = `打开${lineLabels.refresh || "凭证刷新"}`;
      refreshButton.addEventListener("click", () => {
        rememberWorkspace(row.workspace_id, "恢复切换");
        openWithWorkspace("/refresh.html", row.workspace_id);
      });

      actions.append(setButton, mailboxButton, refreshButton);
      card.append(title, meta, actions);
      els.workspaceList.append(card);
    });
  }

  async function checkWorkspaces(workspaceIds) {
    const ids = [...new Set(workspaceIds.filter((id) => WORKSPACE_ID_PATTERN.test(id)))];
    if (!ids.length) {
      renderRows([]);
      setStatus("没有可检查的工作区 ID。", "warn");
      return;
    }
    const url = new URL("/client-api/workspaces/recover", window.location.origin);
    url.searchParams.set("workspace_id", ids.join(","));
    const response = await fetch(url, { cache: "no-store" });
    const payload = await readJson(response, "工作区检查");
    renderRows(payload.workspaces || []);
    setStatus(`已检查 ${ids.length} 个工作区。`);
  }

  async function saveWorkspacePassword() {
    const workspaceId = currentWorkspaceId();
    const password = els.workspacePassword.value.trim();
    const hint = els.workspacePasswordHint.value.trim();
    if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
      setStatus("当前浏览器没有有效工作区，不能设置恢复密码。", "error");
      return;
    }
    if (password.length < 6) {
      setStatus("工作区密码至少 6 位。", "error");
      return;
    }
    els.saveWorkspacePasswordBtn.disabled = true;
    try {
      const response = await fetch("/client-api/workspaces/recovery-password", {
        method: "POST",
        headers: {
          ...apiHeaders(),
          "X-Workspace-Id": workspaceId,
        },
        body: JSON.stringify({ password, hint }),
      });
      const data = await readJson(response, "设置工作区密码");
      els.workspacePassword.value = "";
      setStatus("工作区恢复密码已保存。以后可用这个密码找回当前工作区。");
      renderRows(data.workspace ? [data.workspace] : []);
    } catch (error) {
      setStatus(error.message || "设置工作区密码失败。", "error");
    } finally {
      els.saveWorkspacePasswordBtn.disabled = false;
    }
  }

  async function recoverByPassword() {
    const password = els.recoverPassword.value.trim();
    if (password.length < 6) {
      setStatus("请输入之前设置的工作区密码。", "error");
      return;
    }
    els.recoverByPasswordBtn.disabled = true;
    try {
      const response = await fetch("/client-api/workspaces/recover-by-password", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ password }),
      });
      const data = await readJson(response, "找回工作区");
      const rows = data.workspaces || [];
      renderRows(rows);
      setStatus(rows.length ? `找到 ${rows.length} 个匹配工作区。` : "没有找到匹配的工作区，请确认密码是否正确。", rows.length ? "" : "warn");
    } catch (error) {
      setStatus(error.message || "找回工作区失败。", "error");
    } finally {
      els.recoverByPasswordBtn.disabled = false;
    }
  }

  async function listServerWorkspaces() {
    const response = await fetch("/admin-api/workspaces/recover", {
      cache: "no-store",
      headers: apiHeaders(),
    });
    const payload = await readJson(response, "服务器工作区列表");
    renderRows(payload.workspaces || []);
    setStatus(`管理员模式：找到 ${(payload.workspaces || []).length} 个服务器工作区。`);
  }

  function init() {
    const current = currentWorkspaceId();
    els.currentWorkspace.textContent = current || "-";
    if (WORKSPACE_ID_PATTERN.test(current)) {
      rememberWorkspace(current, "当前工作区");
      els.workspaceInput.value = current;
    }

    els.checkWorkspaceBtn.addEventListener("click", async () => {
      const typed = els.workspaceInput.value.trim();
      if (typed && !WORKSPACE_ID_PATTERN.test(typed)) {
        setStatus("工作区 ID 格式不正确。", "error");
        return;
      }
      try {
        const ids = [...workspaceHistory().map((row) => row.id), typed].filter(Boolean);
        await checkWorkspaces(ids);
      } catch (error) {
        setStatus(error.message || "检查失败", "error");
      }
    });

    els.adminListBtn.addEventListener("click", async () => {
      try {
        await listServerWorkspaces();
      } catch (error) {
        setStatus(`${error.message || "管理员列表读取失败"}。如果还没登录管理员，请先打开 /login.html 登录。`, "error");
      }
    });

    els.saveWorkspacePasswordBtn.addEventListener("click", saveWorkspacePassword);
    els.recoverByPasswordBtn.addEventListener("click", recoverByPassword);

    els.exportBackupBtn.addEventListener("click", async () => {
      try {
        await exportBackup();
      } catch (error) {
        setStatus(error.message || "导出备份失败", "error");
      }
    });

    els.importBackupFile.addEventListener("change", async () => {
      try {
        await importBackup(els.importBackupFile.files?.[0]);
      } catch (error) {
        setStatus(error.message || "导入备份失败", "error");
      } finally {
        els.importBackupFile.value = "";
      }
    });

    checkWorkspaces(workspaceHistory().map((row) => row.id)).catch((error) => {
      setStatus(error.message || "自动检查失败", "error");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
