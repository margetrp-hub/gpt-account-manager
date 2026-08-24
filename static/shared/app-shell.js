(function initAppShell() {
  const CORE_MODULES = [
    { key: "inbox", href: "/", icon: "✓", label: "收件箱" },
    { key: "mailboxes", href: "/mailboxes.html", icon: "✉", label: "邮箱管理" },
    { key: "subscriptions", href: "/accounts.html", icon: "◎", label: "订阅管理" },
    { key: "warehouse", href: "/warehouse.html", icon: "→", label: "CPA 仓管" },
    { key: "dashboard", href: "/dashboard.html", icon: "▣", label: "仪表盘" },
    { key: "converter", href: "/converter.html", icon: "⇄", label: "Session 转换" },
    { key: "plugins", href: "/plugins.html", icon: "◈", label: "插件中心" },
  ];

  const PLUGIN_MODULES = [
    { key: "refresh", href: "/refresh.html", icon: "↻", label: "凭证刷新" },
    { key: "cdk", href: "/cdk.html", icon: "⌘", label: "CDK 取码" },
    { key: "api", href: "/api.html", icon: "⌗", label: "API 文档" },
    { key: "recover", href: "/recover.html", icon: "⌘", label: "工作区找回" },
    { key: "health", href: "/health.html", icon: "⌁", label: "部署自检" },
    { key: "admin", href: "/admin.html", icon: "⌗", label: "管理员提取器" },
  ];

  const LINE_LABELS = {
    inbox: "收件箱",
    mailboxes: "邮箱管理",
    subscriptions: "订阅管理",
    subscriptionsPage: "订阅管理页",
    warehouse: "CPA 仓管",
    dashboard: "仪表盘",
    plugins: "插件中心",
    refresh: "凭证刷新",
    converter: "Session 转换",
    cdk: "CDK 取码",
    api: "API 文档",
    recover: "工作区找回",
    health: "部署自检",
    admin: "管理员提取器",
  };

  function renderLinks(container, modules, currentKey) {
    if (!container) return;
    container.innerHTML = modules.map((item) => {
      const active = item.key === currentKey;
      const current = active ? ' aria-current="page"' : "";
      const className = active ? "module-tab active" : "module-tab";
      return `
        <a class="${className}" href="${item.href}"${current}>
          <span>${item.icon}</span>
          <strong>${item.label}</strong>
        </a>
      `;
    }).join("");
  }

  function renderPluginLinks(container, currentKey) {
    if (!container) return;
    container.innerHTML = PLUGIN_MODULES.map((item) => {
      const active = item.key === currentKey;
      const current = active ? ' aria-current="page"' : "";
      const className = active ? "plugin-tab active" : "plugin-tab";
      return `
        <a class="${className}" href="${item.href}"${current}>
          <span>${item.icon}</span>
          <strong>${item.label}</strong>
        </a>
      `;
    }).join("");
  }

  function applyShell() {
    const body = document.body;
    if (!body) return;
    const section = String(body.dataset.appSection || "core").toLowerCase();
    const current = String(body.dataset.appCurrent || "inbox").toLowerCase();
    const nav = document.querySelector("[data-app-nav]");
    const pluginNav = document.querySelector("[data-plugin-nav]");
    const coreCurrent = section === "plugin" ? "plugins" : current;
    renderLinks(nav, CORE_MODULES, coreCurrent);
    renderPluginLinks(pluginNav, current);
  }

  window.GAM = window.GAM || {};
  window.GAM.appShell = {
    CORE_MODULES,
    PLUGIN_MODULES,
    LINE_LABELS,
    applyShell,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyShell, { once: true });
  } else {
    applyShell();
  }
}());
