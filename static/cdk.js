(() => {
  const STORAGE_KEY = "gptAccountManager.plugin.cdkBaseUrl";
  const DEFAULT_BASE_URL = "http://127.0.0.1:8788";

  const els = {
    baseUrl: document.querySelector("#cdkBaseUrl"),
    task: document.querySelector("#cdkTaskLink"),
    redeem: document.querySelector("#cdkRedeemLink"),
    admin: document.querySelector("#cdkAdminLink"),
    health: document.querySelector("#cdkHealthLink"),
    toast: document.querySelector("#toast"),
  };

  function normalizeBaseUrl(value) {
    let next = String(value || "").trim();
    if (!next) next = DEFAULT_BASE_URL;
    if (!/^https?:\/\//i.test(next)) next = `http://${next}`;
    return next.replace(/\/+$/, "");
  }

  function toast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(els.toast._timer);
    els.toast._timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  function saveBaseUrl() {
    const value = normalizeBaseUrl(els.baseUrl?.value);
    if (els.baseUrl) els.baseUrl.value = value;
    localStorage.setItem(STORAGE_KEY, value);
    return value;
  }

  function applyLinks(baseUrl) {
    const targets = [
      [els.task, "/"],
      [els.redeem, "/redeem.html"],
      [els.admin, "/admin.html"],
      [els.health, "/healthz"],
    ];
    targets.forEach(([el, path]) => {
      if (!el) return;
      el.href = `${baseUrl}${path}`;
      el.target = "_blank";
      el.rel = "noreferrer";
    });
  }

  const initial = normalizeBaseUrl(localStorage.getItem(STORAGE_KEY) || DEFAULT_BASE_URL);
  if (els.baseUrl) els.baseUrl.value = initial;
  applyLinks(initial);

  els.baseUrl?.addEventListener("change", () => {
    const value = saveBaseUrl();
    applyLinks(value);
    toast("CDK 服务地址已更新");
  });
})();
