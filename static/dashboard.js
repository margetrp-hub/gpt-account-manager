(() => {
  const base = window.GAM?.base;
  const scheduler = window.GAM?.scheduler;
  const STORAGE_KEYS = {
    workspaceId: "ctgptm.workspaceId",
  };

  const authQueryToken = base?.persistAdminTokenFromQuery?.() || new URLSearchParams(window.location.search).get("token") || "";
  if (!base && authQueryToken) {
    localStorage.setItem("ctgptm.admin.toolToken", authQueryToken);
  }
  let lastDashboardData = null;
  let dashboardRequestId = 0;

  const els = {
    days: document.querySelector("#dashboardDays"),
    reload: document.querySelector("#reloadDashboard"),
    meta: document.querySelector("#dashboardMeta"),
    riskCard: document.querySelector("#riskCard"),
    riskLevel: document.querySelector("#riskLevel"),
    riskReason: document.querySelector("#riskReason"),
    banToday: document.querySelector("#banToday"),
    banWeek: document.querySelector("#banWeek"),
    banTotal: document.querySelector("#banTotal"),
    banRecipients: document.querySelector("#banRecipients"),
    banRangeText: document.querySelector("#banRangeText"),
    banDailyBars: document.querySelector("#banDailyBars"),
    messageDailyBars: document.querySelector("#messageDailyBars"),
    banDomainRank: document.querySelector("#banDomainRank"),
    banMessageRows: document.querySelector("#banMessageRows"),
    mailboxTotal: document.querySelector("#mailboxTotal"),
    mailboxMicrosoft: document.querySelector("#mailboxMicrosoft"),
    mailboxTemp: document.querySelector("#mailboxTemp"),
    mailboxGeneric: document.querySelector("#mailboxGeneric"),
    mailboxError: document.querySelector("#mailboxError"),
    messageTotal: document.querySelector("#messageTotal"),
    messageToday: document.querySelector("#messageToday"),
    messageWeek: document.querySelector("#messageWeek"),
    latestMessageAt: document.querySelector("#latestMessageAt"),
    refreshTotal: document.querySelector("#refreshTotal"),
    refreshToday: document.querySelector("#refreshToday"),
    refreshWeek: document.querySelector("#refreshWeek"),
    planRank: document.querySelector("#planRank"),
    mailboxStatusRank: document.querySelector("#mailboxStatusRank"),
    mailboxErrorRank: document.querySelector("#mailboxErrorRank"),
    messageTypeRank: document.querySelector("#messageTypeRank"),
    messageSourceRank: document.querySelector("#messageSourceRank"),
  };

  const workspaceId = base?.resolveWorkspaceId?.(STORAGE_KEYS.workspaceId)
    || base?.getWorkspaceId?.(STORAGE_KEYS.workspaceId)
    || localStorage.getItem(STORAGE_KEYS.workspaceId)
    || `ws_${crypto.randomUUID().replace(/-/g, "")}`;

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
      "\"": "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function numberText(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toLocaleString("zh-CN") : "0";
  }

  function safeClassName(value) {
    return String(value || "other").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "other";
  }

  function compactDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function compactTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) || "-";
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function setText(element, value) {
    if (element) element.textContent = String(value);
  }

  function currentLanguage() {
    return window.GptAccountManagerI18n?.getLanguage?.() === "en" ? "en" : "zh";
  }

  function text(zh, en) {
    return currentLanguage() === "en" ? en : zh;
  }

  function rankLabel(row, key) {
    const value = row?.[key] || "unknown";
    if (key === "plan_type") return String(value).toUpperCase();
    if (key === "type") {
      return ({
        verification: text("验证码", "Verification"),
        banned: text("封禁", "Banned"),
        security: text("安全提醒", "Security"),
        invite: text("邀请", "Invite"),
        normal: text("普通邮件", "Normal"),
        unknown: text("未知", "Unknown"),
      })[String(value).toLowerCase()] || value;
    }
    if (key === "status") {
      return ({
        ok: text("正常", "OK"),
        success: text("正常", "OK"),
        error: text("错误", "Error"),
        failed: text("失败", "Failed"),
        idle: text("未检查", "Unchecked"),
        unknown: text("未知", "Unknown"),
      })[String(value).toLowerCase()] || value;
    }
    return value;
  }

  function renderRank(element, rows, key, emptyText) {
    if (!element) return;
    const list = Array.isArray(rows) ? rows.filter((row) => Number(row?.count || 0) > 0) : [];
    if (!list.length) {
      element.classList.add("empty");
      element.textContent = emptyText;
      return;
    }
    const max = Math.max(...list.map((row) => Number(row.count || 0)), 1);
    element.classList.remove("empty");
    element.innerHTML = list.slice(0, 8).map((row) => {
      const count = Number(row.count || 0);
      const width = Math.max(6, Math.round((count / max) * 100));
      return `
        <div class="dashboard-rank-row">
          <div>
            <strong>${escapeHtml(rankLabel(row, key))}</strong>
            <span>${numberText(count)}</span>
          </div>
          <i style="width:${width}%"></i>
        </div>
      `;
    }).join("");
  }

  function renderBars(element, rows, emptyText) {
    const list = Array.isArray(rows) ? rows : [];
    if (!element) return;
    if (!list.length) {
      element.classList.add("empty");
      element.textContent = emptyText;
      return;
    }
    const max = Math.max(...list.map((row) => Number(row.count || 0)), 1);
    element.classList.remove("empty");
    element.innerHTML = list.map((row) => {
      const count = Number(row.count || 0);
      const height = Math.max(count ? 10 : 2, Math.round((count / max) * 86));
      const label = String(row.date || "").slice(5);
      return `
        <div class="dashboard-bar" title="${escapeHtml(row.date)}：${numberText(count)}">
          <span>${numberText(count)}</span>
          <i style="height:${height}%"></i>
          <em>${escapeHtml(label)}</em>
        </div>
      `;
    }).join("");
  }

  function riskText(level, reason) {
    const levelMap = {
      high: text("高风险", "High Risk"),
      warning: text("需要关注", "Watch"),
      attention: text("邮箱异常", "Mailbox Issues"),
      unknown: text("数据不足", "Not Enough Data"),
      normal: text("正常", "Normal"),
    };
    const reasonMap = {
      today_banned_mail: text("今天已收到封禁/停用邮件，建议优先查看最近封禁邮件和涉及邮箱。", "Banned or deactivated mail arrived today. Review affected recipients first."),
      recent_banned_mail: text("近 7 天出现过封禁/停用邮件，建议观察是否集中在某个邮箱域。", "Banned mail appeared in the last 7 days. Check whether it clusters by domain."),
      mailbox_errors: text("当前邮箱池存在异常取信记录，建议先处理错误邮箱再执行批量刷新。", "Some mailboxes have fetch errors. Clean those up before bulk refresh."),
      no_cached_mail: text("当前工作区还没有缓存邮件，仪表盘只能显示资产和刷新结果。", "No cached mail yet in this workspace. The dashboard can only show assets and refresh results."),
      no_recent_risk: text("当前周期内未发现封禁邮件，邮箱缓存仍在正常统计。", "No banned mail found in this range. Cached mail is still being tracked."),
    };
    return {
      level: levelMap[level] || levelMap.unknown,
      reason: reasonMap[reason] || reasonMap.no_cached_mail,
    };
  }

  function renderRisk(risk) {
    const level = String(risk?.level || "unknown").toLowerCase();
    const copy = riskText(level, String(risk?.reason || ""));
    if (els.riskCard) {
      els.riskCard.className = `dashboard-risk-card ${safeClassName(level)}`;
    }
    setText(els.riskLevel, copy.level);
    setText(els.riskReason, copy.reason);
  }

  function renderMessages(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!els.banMessageRows) return;
    if (!list.length) {
      els.banMessageRows.innerHTML = `<tr><td colspan="4" class="empty-cell">${escapeHtml(text("暂无封禁邮件", "No banned mail"))}</td></tr>`;
      return;
    }
    els.banMessageRows.innerHTML = list.slice(0, 80).map((row) => `
      <tr>
        <td>${escapeHtml(compactDate(row.received_at))}</td>
        <td><strong>${escapeHtml(row.recipient || "-")}</strong><em>${escapeHtml(row.sender || "")}</em></td>
        <td><strong>${escapeHtml(row.subject || text("无主题", "No subject"))}</strong><em>${escapeHtml(row.preview || "")}</em></td>
        <td><span class="source-badge ${safeClassName(row.source)}">${escapeHtml(row.source || "unknown")}</span></td>
      </tr>
    `).join("");
  }

  function applyI18n() {
    window.GptAccountManagerI18n?.apply?.();
  }

  function render(data) {
    lastDashboardData = data;
    const banned = data.banned_mail || {};
    const mailboxes = data.mailboxes || {};
    const refresh = data.refresh || {};
    const messages = data.messages || {};
    const days = Number(data.days || els.days?.value || 30);

    renderRisk(data.risk);
    setText(els.banToday, numberText(banned.today));
    setText(els.banWeek, numberText(banned.last_7_days));
    setText(els.banTotal, numberText(banned.total));
    setText(els.banRecipients, numberText(banned.unique_recipients));
    setText(els.banRangeText, text(`近 ${days} 天`, `Last ${days} days`));

    setText(els.mailboxTotal, numberText(mailboxes.total));
    setText(els.mailboxMicrosoft, numberText(mailboxes.microsoft));
    setText(els.mailboxTemp, numberText(mailboxes.temp));
    setText(els.mailboxGeneric, numberText(mailboxes.generic));
    setText(els.mailboxError, numberText(mailboxes.error));
    setText(els.messageTotal, numberText(messages.cached_total));
    setText(els.messageToday, numberText(messages.today));
    setText(els.messageWeek, numberText(messages.last_7_days));
    setText(els.latestMessageAt, compactTime(messages.latest_at));

    setText(els.refreshTotal, numberText(refresh.saved_total));
    setText(els.refreshToday, numberText(refresh.today));
    setText(els.refreshWeek, numberText(refresh.last_7_days));

    renderBars(els.banDailyBars, banned.daily, text("暂无趋势数据", "No trend data"));
    renderBars(els.messageDailyBars, messages.daily, text("暂无缓存趋势数据", "No cached mail trend"));
    renderRank(els.banDomainRank, banned.domains, "domain", text("暂无封禁域名统计", "No banned domain stats"));
    renderRank(els.planRank, refresh.plans, "plan_type", text("暂无账号类型统计", "No plan stats"));
    renderRank(els.mailboxStatusRank, mailboxes.status, "status", text("暂无邮箱状态统计", "No mailbox status stats"));
    renderRank(els.mailboxErrorRank, mailboxes.errors, "error_code", text("暂无邮箱错误统计", "No mailbox error stats"));
    renderRank(els.messageTypeRank, messages.types, "type", text("暂无邮件分类统计", "No mail type stats"));
    renderRank(els.messageSourceRank, messages.sources, "source", text("暂无取信来源统计", "No mail source stats"));
    renderMessages(banned.messages);

    const generated = compactDate(data.generated_at);
    setText(
      els.meta,
      text(
        `工作区 ${data.workspace_id || workspaceId} · ${generated} 更新 · 版本 ${data.version || "-"}`,
        `Workspace ${data.workspace_id || workspaceId} · updated ${generated} · version ${data.version || "-"}`
      )
    );
    applyI18n();
  }

  const latestDashboardRequest = scheduler?.createLatestOnlyRequest?.(async ({ payload, signal }) => {
    const response = await fetch(`/client-api/dashboard-stats?${payload.params}`, {
      headers: apiHeaders(),
      cache: "no-store",
      signal,
    });
    const data = await readJsonResponse(response, text("仪表盘数据", "Dashboard data"));
    return { response, data };
  });

  async function loadDashboard() {
    const requestId = dashboardRequestId + 1;
    dashboardRequestId = requestId;
    const days = Number(els.days?.value || 30);
    const tzOffset = -new Date().getTimezoneOffset();
    els.reload.disabled = true;
    setText(els.meta, text("正在读取当前工作区缓存数据。", "Reading cached data for the current workspace."));
    try {
      const params = new URLSearchParams({
        days: String(days),
        limit: "500",
        tz_offset: String(tzOffset),
      });
      let response;
      let data;
      if (latestDashboardRequest) {
        const outcome = await latestDashboardRequest({ params: params.toString() });
        if (outcome?.ignored) {
          if (requestId === dashboardRequestId) {
            els.reload.disabled = false;
            applyI18n();
          }
          return;
        }
        ({ response, data } = outcome.result || {});
      } else {
        response = await fetch(`/client-api/dashboard-stats?${params.toString()}`, {
          headers: apiHeaders(),
          cache: "no-store",
        });
        data = await readJsonResponse(response, text("仪表盘数据", "Dashboard data"));
      }
      if (requestId !== dashboardRequestId) return;
      if (!response.ok || !data.success) throw new Error(data.error || text("仪表盘数据读取失败", "Failed to load dashboard data"));
      render(data);
    } catch (error) {
      if (requestId !== dashboardRequestId) return;
      setText(els.meta, error.message || text("仪表盘数据读取失败", "Failed to load dashboard data"));
    } finally {
      if (requestId !== dashboardRequestId) return;
      els.reload.disabled = false;
      applyI18n();
    }
  }

  els.reload.addEventListener("click", loadDashboard);
  els.days.addEventListener("change", loadDashboard);
  document.addEventListener("click", (event) => {
    if (!event.target?.closest?.(".language-switch") || !lastDashboardData) return;
    window.setTimeout(() => render(lastDashboardData), 80);
  });
  loadDashboard();
})();
