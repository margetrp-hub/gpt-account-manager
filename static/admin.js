const els = {
  toolToken: document.querySelector("#toolToken"),
  workerUrl: document.querySelector("#workerUrl"),
  workerAdminPassword: document.querySelector("#workerAdminPassword"),
  workerSitePassword: document.querySelector("#workerSitePassword"),
  emailNames: document.querySelector("#emailNames"),
  extractBtn: document.querySelector("#extractBtn"),
  copyExportBtn: document.querySelector("#copyExportBtn"),
  pushPoolBtn: document.querySelector("#pushPoolBtn"),
  clearAdminBtn: document.querySelector("#clearAdminBtn"),
  adminStatus: document.querySelector("#adminStatus"),
  poolApiUrl: document.querySelector("#poolApiUrl"),
  poolToken: document.querySelector("#poolToken"),
  poolManualText: document.querySelector("#poolManualText"),
  poolExportText: document.querySelector("#poolExportText"),
  poolStatus: document.querySelector("#poolStatus"),
  resultCount: document.querySelector("#resultCount"),
  resultRows: document.querySelector("#resultRows"),
  exportText: document.querySelector("#exportText"),
  toast: document.querySelector("#toast"),
};

const state = {
  results: [],
  selectedPool: new Set(),
};

const MAIL_ACCOUNTS_KEY = "ctgptm.mail.accounts";
const MAIL_TEMP_SETTINGS_KEY = "ctgptm.mail.tempSettings";
const DEFAULT_TEMP_WORKER_URL = "https://maip.wsphl.cfd";
const LEGACY_TEMP_WORKER_URLS = new Set([
  "maip.ohlaoo.com",
  "http://maip.ohlaoo.com",
  "https://maip.ohlaoo.com",
  "mapi.ohlaoo.com",
  "http://mapi.ohlaoo.com",
  "https://mapi.ohlaoo.com",
]);

const queryToken = new URLSearchParams(window.location.search).get("token") || "";
const rememberedToken = localStorage.getItem("ctgptm.admin.toolToken") || "";
els.toolToken.value = queryToken || rememberedToken;
els.workerUrl.value = normalizeTempWorkerUrl(localStorage.getItem("ctgptm.admin.workerUrl") || DEFAULT_TEMP_WORKER_URL);
els.poolApiUrl.value = localStorage.getItem("ctgptm.admin.publicPoolApiUrl") || "";
els.poolToken.value = localStorage.getItem("ctgptm.admin.publicPoolToken") || "";
localStorage.setItem("ctgptm.admin.workerUrl", els.workerUrl.value);

if (queryToken) {
  localStorage.setItem("ctgptm.admin.toolToken", queryToken);
}

function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add("show");
  clearTimeout(els.toast._timer);
  els.toast._timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function normalizeTempWorkerUrl(value) {
  let clean = normalizeUrl(value);
  if (clean && !/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
  return LEGACY_TEMP_WORKER_URLS.has(clean) ? DEFAULT_TEMP_WORKER_URL : (clean || DEFAULT_TEMP_WORKER_URL);
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function resultKey(row) {
  return String(row.address || row.email || row.id || "").toLowerCase();
}

function parsePoolManualRows(text) {
  const rows = [];
  String(text || "").split(/\r?\n/).forEach((line) => {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) return;
    const parts = clean.includes("----")
      ? clean.split("----").map((part) => part.trim())
      : clean.split(",").map((part) => part.trim());
    const email = parts[0] || "";
    const jwt = parts[1] || "";
    if (email.includes("@") && jwt) {
      rows.push({ email, jwt, source: "manual", category: "公益池" });
    }
  });
  return rows;
}

function selectedPoolRows() {
  const selected = state.results
    .filter((row) => row.ok && row.jwt && state.selectedPool.has(resultKey(row)))
    .map((row) => ({
      email: String(row.address || row.email).trim(),
      jwt: String(row.jwt).trim(),
      source: "temp-mail",
      category: "公益池",
    }));
  const manual = parsePoolManualRows(els.poolManualText.value);
  const byEmail = new Map();
  [...selected, ...manual].forEach((row) => {
    if (row.email && row.jwt) byEmail.set(row.email.toLowerCase(), row);
  });
  return [...byEmail.values()];
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

function isLocalAdminPage() {
  return ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
}

function uniqueEmailLines(text) {
  const seen = new Set();
  const unique = [];
  let skipped = 0;
  String(text || "").split(/\r?\n/).forEach((line) => {
    const email = line.trim().toLowerCase();
    if (!email) return;
    if (seen.has(email)) {
      skipped += 1;
      return;
    }
    seen.add(email);
    unique.push(email);
  });
  return { emails: unique.join("\n"), count: unique.length, skipped };
}

function setBusy(busy) {
  els.extractBtn.disabled = busy;
  els.extractBtn.textContent = busy ? "提取中" : "批量提取";
}

function renderResults() {
  els.resultCount.textContent = `${state.results.length} 条`;
  if (!state.results.length) {
    els.resultRows.innerHTML = `<tr><td colspan="6" class="empty-cell">暂无结果</td></tr>`;
    els.exportText.value = "";
    return;
  }
  els.resultRows.innerHTML = state.results.map((row, index) => `
    <tr>
      <td><input class="pool-check" type="checkbox" data-index="${index}" ${state.selectedPool.has(resultKey(row)) ? "checked" : ""} ${row.ok && row.jwt ? "" : "disabled"} aria-label="选择 ${escapeHtml(row.address || row.email || "")}"></td>
      <td class="mono">${escapeHtml(row.address || row.email)}</td>
      <td class="mono">${escapeHtml(row.id || "-")}</td>
      <td class="jwt-cell">${escapeHtml(row.jwt || "-")}</td>
      <td>${row.ok ? `<span class="ok-text">成功</span>` : `<span class="bad-text">${escapeHtml(row.error || "失败")}</span>`}</td>
      <td><button type="button" data-index="${index}">复制</button></td>
    </tr>
  `).join("");
  els.exportText.value = state.results
    .filter((row) => row.ok && row.jwt)
    .map((row) => `${row.address || row.email}----${row.jwt}`)
    .join("\n");
}

function importableResultRows() {
  const workerUrl = normalizeTempWorkerUrl(els.workerUrl.value);
  const sitePassword = els.workerSitePassword.value.trim();
  return state.results
    .filter((row) => row.ok && row.jwt && (row.address || row.email))
    .map((row) => ({
      email: String(row.address || row.email).trim(),
      jwt: String(row.jwt || "").trim(),
      base_url: workerUrl,
      site_password: sitePassword,
    }))
    .filter((row) => row.email.includes("@") && row.jwt);
}

function syncPoolSelectionWithResults() {
  const valid = new Set();
  state.results.forEach((row) => {
    const key = resultKey(row);
    if (row.ok && row.jwt && key) valid.add(key);
  });
  for (const key of [...state.selectedPool]) {
    if (!valid.has(key)) state.selectedPool.delete(key);
  }
  if (!state.selectedPool.size) {
    valid.forEach((key) => state.selectedPool.add(key));
  }
}

function mergeResultsToMailAssistant(rows) {
  if (!rows.length) return { imported: 0, updated: 0 };
  const saved = loadJson(MAIL_ACCOUNTS_KEY, []);
  const accounts = Array.isArray(saved) ? saved : [];
  const byId = new Map(accounts.map((account) => [account.id, account]));
  let imported = 0;
  let updated = 0;
  rows.forEach((row) => {
    const email = row.email.trim();
    const id = `temp:${email.toLowerCase()}`;
    const existing = byId.get(id);
    const item = {
      ...(existing || {}),
      id,
      source: "temp",
      service: "Cloud Mail",
      email,
      jwt: row.jwt,
      base_url: row.base_url,
      site_password: row.site_password,
      category: existing?.category || "",
      selected: true,
      updated_at: new Date().toISOString(),
    };
    byId.delete(`microsoft:${email.toLowerCase()}`);
    if (existing) {
      updated += 1;
    } else {
      imported += 1;
    }
    byId.set(id, item);
  });
  saveJson(MAIL_ACCOUNTS_KEY, [...byId.values()].sort((a, b) => String(a.email).localeCompare(String(b.email))));
  saveJson(MAIL_TEMP_SETTINGS_KEY, {
    base_url: normalizeTempWorkerUrl(els.workerUrl.value),
    site_password: els.workerSitePassword.value.trim(),
  });
  return { imported, updated };
}

async function persistResultsToServer(rows) {
  if (!rows.length) return { imported: 0, updated: 0 };
  const headers = { "Content-Type": "application/json" };
  const token = els.toolToken.value.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const text = rows.map((row) => [
    row.email,
    row.jwt,
    row.base_url,
    row.site_password,
  ].join("----")).join("\n");
  const response = await fetch("/api/temp-addresses/import", {
    method: "POST",
    headers,
    body: JSON.stringify({
      replace_existing: true,
      text,
    }),
  });
  const payload = await readJsonResponse(response, "/api/temp-addresses/import");
  if (!response.ok) throw new Error(payload.error || response.statusText);
  return {
    imported: Number(payload.imported || 0),
    updated: Number(payload.updated || 0),
  };
}

async function importResultsToMailAssistant() {
  const rows = importableResultRows();
  const local = mergeResultsToMailAssistant(rows);
  if (!rows.length) return;
  try {
    const server = await persistResultsToServer(rows);
    toast(`Imported ${rows.length} temp mailboxes. Server +${server.imported}/~${server.updated}`);
  } catch (error) {
    toast(`Imported locally. Server sync failed: ${error.message || "unknown error"}`);
  }
  els.adminStatus.textContent = `Imported ${local.imported + local.updated}`;
}

function publicPoolPackage(rows) {
  return {
    source: "gpt-account-manager",
    kind: "temp-mail-jwt",
    note: "admin-selected",
    count: rows.length,
    created_at: new Date().toISOString(),
    items: rows,
  };
}

async function pushPublicPool() {
  const rows = selectedPoolRows();
  const pack = publicPoolPackage(rows);
  els.poolExportText.value = JSON.stringify(pack, null, 2);
  if (!rows.length) {
    toast("先勾选或粘贴要放入公益池的账号");
    return;
  }
  const token = els.toolToken.value.trim();
  if (!token && !isLocalAdminPage()) {
    toast("公网管理员页需要先填写本工具管理令牌");
    return;
  }
  const targetUrl = normalizeUrl(els.poolApiUrl.value);
  localStorage.setItem("ctgptm.admin.publicPoolApiUrl", targetUrl);
  localStorage.setItem("ctgptm.admin.publicPoolToken", els.poolToken.value.trim());
  els.pushPoolBtn.disabled = true;
  els.poolStatus.textContent = targetUrl ? "推送中" : "已生成 JSON";
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch("/admin-api/public-pool/push", {
      method: "POST",
      headers,
      body: JSON.stringify({
        target_url: targetUrl,
        pool_token: els.poolToken.value.trim(),
        note: "admin-selected",
        items: rows,
      }),
    });
    const payload = await readJsonResponse(response, "/admin-api/public-pool/push");
    if (!response.ok) throw new Error(payload.error || response.statusText);
    if (payload.package) {
      els.poolExportText.value = JSON.stringify(payload.package, null, 2);
    }
    els.poolStatus.textContent = payload.mode === "pushed" ? `已推送 ${payload.pushed || rows.length} 个` : `已准备 ${rows.length} 个`;
    toast(payload.mode === "pushed" ? `已推送 ${payload.pushed || rows.length} 个账号到公益池` : "未配置 API，已生成公益池 JSON");
  } catch (error) {
    els.poolStatus.textContent = "推送失败";
    toast(error.message || "公益池推送失败");
  } finally {
    els.pushPoolBtn.disabled = false;
  }
}

async function extract() {
  const workerUrl = normalizeTempWorkerUrl(els.workerUrl.value);
  const emailInput = uniqueEmailLines(els.emailNames.value);
  if (!workerUrl) {
    toast("先填写临时邮箱 Worker 后台地址");
    return;
  }
  if (!emailInput.count) {
    toast("先粘贴邮箱名");
    return;
  }
  els.emailNames.value = emailInput.emails;
  els.workerUrl.value = workerUrl;
  localStorage.setItem("ctgptm.admin.workerUrl", workerUrl);
  setBusy(true);
  els.adminStatus.textContent = "提取中";
  try {
    const headers = { "Content-Type": "application/json" };
    const token = els.toolToken.value.trim();
    if (!token && !isLocalAdminPage()) {
      throw new Error("请先提供管理员 token");
    }
    if (token) {
      localStorage.setItem("ctgptm.admin.toolToken", token);
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch("/admin-api/extract-jwts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        base_url: workerUrl,
        admin_password: els.workerAdminPassword.value.trim(),
        site_password: els.workerSitePassword.value.trim(),
        emails: emailInput.emails,
      }),
    });
    const payload = await readJsonResponse(response, "/admin-api/extract-jwts");
    if (!response.ok) throw new Error(payload.error || response.statusText);
    state.results = payload.results || [];
    syncPoolSelectionWithResults();
    els.adminStatus.textContent = "已完成";
    renderResults();
    await importResultsToMailAssistant();
    toast(`已处理 ${state.results.length} 个邮箱${emailInput.skipped ? `，跳过 ${emailInput.skipped} 个重复` : ""}`);
  } catch (error) {
    els.adminStatus.textContent = "失败";
    toast(error.message || "提取失败");
  } finally {
    setBusy(false);
  }
}

async function copyText(text) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  toast("已复制");
}

els.extractBtn.addEventListener("click", extract);
els.copyExportBtn.addEventListener("click", () => copyText(els.exportText.value));
els.pushPoolBtn.addEventListener("click", pushPublicPool);
els.clearAdminBtn.addEventListener("click", () => {
  state.results = [];
  state.selectedPool.clear();
  renderResults();
  els.adminStatus.textContent = "待连接";
});
els.resultRows.addEventListener("click", (event) => {
  if (event.target.matches(".pool-check")) {
    const row = state.results[Number(event.target.dataset.index)];
    const key = resultKey(row || {});
    if (event.target.checked) state.selectedPool.add(key);
    else state.selectedPool.delete(key);
    return;
  }
  if (!event.target.matches("button")) return;
  const row = state.results[Number(event.target.dataset.index)];
  if (!row?.jwt) {
    toast("这一行没有 JWT");
    return;
  }
  copyText(`${row.address || row.email}----${row.jwt}`);
});

renderResults();
