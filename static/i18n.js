(() => {
  const STORAGE_KEY = "gptAccountManager.lang";
  const DEFAULT_LANG = "zh";
  const TARGET_LANG = "en";
  const SKIP_SELECTOR = "script,style,noscript,textarea,[data-i18n-skip]";
  const ATTRS = ["placeholder", "aria-label", "title", "value"];
  const originals = new WeakMap();
  const lastApplied = new WeakMap();

  const en = {
    "GPT账号管理助手": "GPT Account Manager",
    "GPT账号管理助手 管理员提取器": "GPT Account Manager Admin Extractor",
    "账号仓管 / 邮件验证码 / 凭证刷新": "Account warehouse / email codes / credential refresh",
    "邮箱资产 / 取码凭证 / 批量整理": "Mailbox assets / code credentials / batch cleanup",
    "凭证刷新 / 邮件验证码 / CPA 同步": "Credential refresh / email codes / CPA sync",
    "本地解析 · CPA / sub2api / Cockpit / AxonHub / Codex-Manager": "Local parsing · CPA / sub2api / Cockpit / AxonHub / Codex-Manager",
    "错误账号扫描 · 选中删除 · 本地保存": "Bad account scan · selected delete · local storage",
    "版本 · 配置 · 数据计数 · 服务状态": "Version · config · data counts · service status",
    "本机记住令牌，后续进入管理员页和自检页不用再拼 URL": "Remember the token on this browser; no URL token needed next time",
    "账号管理": "Accounts",
    "邮箱管理": "Mailboxes",
    "凭证刷新": "Credential Refresh",
    "Session 转换": "Session Converter",
    "CPA 仓管": "CPA Warehouse",
    "客户页": "Client",
    "转换器": "Converter",
    "邮箱清单": "Mailbox List",
    "邮箱取件": "Mail Pickup",
    "异常扫描台": "Exception Scanner",
    "运行日志": "Run Logs",
    "邮件列表": "Message List",
    "邮件详情": "Message Detail",
    "邮箱管家": "Mailbox Keeper",
    "统一管理取码邮箱": "Manage code mailboxes in one place",
    "工作空间": "Workspace",
    "导入和删除会同步到当前工作空间。": "Imports and deletes sync to the current workspace.",
    "Mailbox Management": "Mailbox Management",
    "管理所有取码邮箱，按 Outlook 邮箱和临时邮箱分开整理。": "Manage all code mailboxes, separated by Outlook and temp mailboxes.",
    "总览": "Overview",
    "总数": "Total",
    "临时": "Temp",
    "临时邮箱": "Temp Mail",
    "Outlook 邮箱": "Outlook Mail",
    "全部来源": "All Sources",
    "全部分组": "All Groups",
    "全部状态": "All Status",
    "成功": "Success",
    "失败": "Failed",
    "等待": "Waiting",
    "刷新中": "Refreshing",
    "执行中": "Running",
    "队列": "Queue",
    "异常": "Exceptions",
    "需要接码": "Needs Code",
    "未发现验证码": "No Code Found",
    "可收件": "Reachable",
    "邮箱": "Email",
    "账号": "Account",
    "邮箱地址": "Email",
    "邮箱名": "Mailbox",
    "密码": "Password",
    "分组": "Group",
    "令牌": "Token",
    "权限类型": "Access Type",
    "状态": "Status",
    "错误": "Error",
    "操作": "Actions",
    "动作": "Action",
    "来源": "Source",
    "名称": "Name",
    "过期时间": "Expires",
    "选择": "Select",
    "选": "Select",
    "关闭": "Close",
    "取消": "Cancel",
    "同步": "Sync",
    "全选": "Select All",
    "取消全选": "Unselect All",
    "备份": "Backup",
    "恢复": "Restore",
    "清空": "Clear",
    "清空本地": "Clear Local",
    "必填": "Required",
    "可选": "Optional",
    "导入": "Import",
    "接码": "SMS",
    "验证码": "Code",
    "10 / 页": "10 / page",
    "20 / 页": "20 / page",
    "50 / 页": "50 / page",
    "100 / 页": "100 / page",
    "添加分组": "Add Group",
    "删除分组": "Delete Group",
    "导入邮箱": "Import Mailboxes",
    "导入并同步": "Import and Sync",
    "批量复制": "Copy Selected",
    "批量设置分组": "Set Group",
    "导出备份": "Export Backup",
    "批量删除": "Batch Delete",
    "批量导入": "Batch Import",
    "批量提取": "Batch Extract",
    "复制结果": "Copy Results",
    "推送公益池": "Push Public Pool",
    "清空结果": "Clear Results",
    "提取结果": "Extraction Results",
    "公益池推送": "Public Pool Push",
    "导入类型": "Import Type",
    "自动识别": "Auto Detect",
    "临时邮箱 API URL": "Temp Mail API URL",
    "临时邮箱站点密钥": "Temp Mail Site Key",
    "选择 TXT / CSV / JSON 文件": "Choose TXT / CSV / JSON File",
    "邮箱数据": "Mailbox Data",
    "已导入邮箱": "Imported Mailboxes",
    "验证邮箱": "Verify Mailbox",
    "加入刷新队列": "Add to Queue",
    "移除所选": "Remove Selected",
    "邮箱登录账号": "Email Login Accounts",
    "队列账号自动打开 OAuth、收取邮箱验证码、提取新的 AT/RT。": "Queued accounts open OAuth, collect email codes, and extract new AT/RT.",
    "执行选中": "Run Selected",
    "重试失败": "Retry Failed",
    "清理失败": "Clean Failed",
    "下载 CPA JSON": "Download CPA JSON",
    "下载 sub2 JSON": "Download sub2 JSON",
    "清空队列": "Clear Queue",
    "代理设置": "Proxy Settings",
    "刷新必填；单账号执行": "Required for refresh; single-account execution",
    "代理必填": "Proxy Required",
    "VPS 部署时不要填自己电脑的 127.0.0.1；这里要填 VPS 能连到的代理地址。": "On a VPS, do not use your local 127.0.0.1; enter a proxy address reachable from the VPS.",
    "单账号执行": "Single Account",
    "CPA 同步": "CPA Sync",
    "成功后自动写回仓管": "Write back after success",
    "成功后同步 CPA": "Sync CPA after success",
    "取码邮箱补充": "Code Mailbox Supplement",
    "Outlook 四段或临时邮箱 JWT 同步": "Outlook 4-part or temp mailbox JWT sync",
    "先自动匹配账号管理页已有取码资料。": "Existing code mailbox credentials are matched first.",
    "只有匹配不到时，Outlook 在下方补四段；临时邮箱从 Worker 同步 JWT。": "Only unmatched Outlook accounts need the 4-part data below; temp mailboxes sync JWT from the Worker.",
    "导入 Outlook 取码": "Import Outlook Code Mailbox",
    "临时邮箱同步": "Temp Mail Sync",
    "同步队列 JWT": "Sync Queue JWT",
    "长效手机池": "Persistent Phone Pool",
    "批量池 / 1 对 1 绑定": "Batch pool / 1-to-1 binding",
    "手机号 + 接码 API": "Phone + SMS API",
    "{phone} / {email} 可用": "{phone} / {email} supported",
    "批量池": "Batch Pool",
    "1 对 1 绑定": "1-to-1 Binding",
    "加入/更新": "Add / Update",
    "手动填码": "Manual Code",
    "为选中账号取码": "Fetch Code for Selected",
    "验证码 / 操作": "Code / Actions",
    "当前刷新日志": "Current Refresh Log",
    "等待执行。": "Waiting.",
    "等待操作。": "Waiting for action.",
    "请先在账号管理页导入邮箱": "Import mailboxes from Accounts first.",
    "从左侧选择邮箱加入刷新队列。": "Select mailboxes on the left to add them to the refresh queue.",
    "邮箱数量": "Mailbox Count",
    "搜索邮箱": "Search mailboxes",
    "搜索邮箱、分组、权限类型": "Search email, group, or access type",
    "搜索主题、正文、验证码、链接、邮箱": "Search subject, body, code, link, or email",
    "发件人": "Sender",
    "新分组": "New Group",
    "收取邮件": "Fetch Mail",
    "加入选中队列": "Add Selected to Queue",
    "失败加入队列": "Add Failed to Queue",
    "导出 CPA JSON": "Export CPA JSON",
    "导出 sub2api JSON": "Export sub2api JSON",
    "CPA 地址": "CPA URL",
    "管理密钥": "Management Key",
    "扫描数量": "Scan Limit",
    "扫描 CPA 401": "Scan CPA 401",
    "加入选中邮箱": "Add Selected Mailboxes",
    "清空异常": "Clear Exceptions",
    "复制验证码": "Copy Code",
    "推送刷新池": "Push to Refresh Pool",
    "删除邮件": "Delete Message",
    "删除选中": "Delete Selected",
    "扫描错误账号": "Scan Bad Accounts",
    "加入凭证刷新": "Add to Credential Refresh",
    "刷新并推送": "Refresh and Push",
    "自动刷新并推送": "Auto Refresh and Push",
    "间隔分钟": "Interval Minutes",
    "刷新登录使用代理": "Use Proxy for Refresh Login",
    "代理 URL": "Proxy URL",
    "单账号兜底授权": "Single Account Fallback Auth",
    "当前重点先做扫描和清理；不能稳定登录的账号先放着不处理。": "Focus on scan and cleanup first; unstable login accounts can be left aside.",
    "OpenAI 登录密码": "OpenAI Login Password",
    "复制邮箱": "Copy Email",
    "收验证码": "Fetch Code",
    "打开登录": "Open Login",
    "手动 Session 兜底": "Manual Session Fallback",
    "转换预览": "Convert Preview",
    "上传修复": "Upload Fix",
    "打开 Session": "Open Session",
    "单独导入错误账号": "Import Bad Accounts",
    "导入到列表": "Import to List",
    "导出 CPA JSON": "Export CPA JSON",
    "导出 sub2 JSON": "Export sub2 JSON",
    "部署自检": "Deployment Health",
    "读取中": "Loading",
    "正在检查当前服务版本和运行配置。": "Checking current service version and runtime configuration.",
    "重新检测": "Recheck",
    "核心状态": "Core Status",
    "功能配置": "Feature Config",
    "不显示密钥": "Secrets Hidden",
    "数据计数": "Data Counts",
    "服务端文件": "Server Files",
    "同步升级": "Sync Upgrade",
    "点击后会写入升级请求；宿主机 upgrade agent 会执行 git pull、重建 Docker 并重启服务。": "Click to create an upgrade request; the host upgrade agent will run git pull, rebuild Docker, and restart the service.",
    "刷新状态": "Refresh Status",
    "请求升级并重启": "Request Upgrade and Restart",
    "原始 JSON": "Raw JSON",
    "管理员登录": "Admin Login",
    "管理令牌": "Admin Token",
    "进入": "Enter",
    "令牌只保存在当前浏览器和本工具的登录 Cookie 中。": "The token is stored only in this browser and this tool's login cookie.",
    "本工具管理令牌": "Tool Admin Token",
    "临时邮箱 Worker 后台地址": "Temp Mail Worker Admin URL",
    "管理员口令": "Admin Password",
    "站点口令": "Site Password",
    "邮箱名，一行一个": "Mailbox names, one per line",
    "公益池 API": "Public Pool API",
    "公益池口令": "Public Pool Token",
    "手动加入公益池（邮箱----JWT，一行一个）": "Manually add to public pool (email----JWT, one per line)",
    "Session 数据从这里获取": "Get Session Data Here",
    "Session JSON": "Session JSON",
    "粘贴 ChatGPT Web session，或拖入一个或多个 JSON 文件。": "Paste a ChatGPT Web session, or drop one or more JSON files.",
    "这段 JSON 包含 accessToken 和 sessionToken，等同敏感登录凭证，不要发给别人。": "This JSON contains accessToken and sessionToken; treat it as sensitive login credentials.",
    "选择文件": "Choose Files",
    "填入示例结构": "Use Example",
    "转换结果": "Converted Result",
    "当前输出为 sub2api 导入 JSON。": "Current output is sub2api import JSON.",
    "复制输出": "Copy Output",
    "下载 JSON": "Download JSON",
    "转换后会显示 JSON。": "Converted JSON will appear here.",
    "商城": "Store",
    "中转站": "Relay",
    "公益站": "Public Pool"
  };

  const titleMap = {
    "GPT账号管理助手": "GPT Account Manager",
    "GPT账号管理助手 - 邮箱管理": "GPT Account Manager - Mailboxes",
    "GPT账号管理助手 - 凭证刷新": "GPT Account Manager - Credential Refresh",
    "GPT账号管理助手 - 部署自检": "GPT Account Manager - Deployment Health",
    "GPT账号管理助手 - 管理员登录": "GPT Account Manager - Admin Login",
    "GPT账号管理助手 - 管理员提取器": "GPT Account Manager - Admin Extractor",
    "GPT账号管理助手 - Session 转换": "GPT Account Manager - Session Converter",
    "GPT账号管理助手 - CPA 仓管": "GPT Account Manager - CPA Warehouse",
    "GPT账号管理助手 - CPA 错误账号仓管": "GPT Account Manager - CPA Warehouse"
  };

  const attrMap = {
    ...en,
    "http://user:pass@host:port 或 socks5://user:pass@host:port": "http://user:pass@host:port or socks5://user:pass@host:port",
    "CPA 地址，例如 http://127.0.0.1:8317": "CPA URL, e.g. http://127.0.0.1:8317",
    "Outlook 取码四段：邮箱----密码----client_id----refresh_token，可一次粘贴多行": "Outlook 4-part code mailbox: email----password----client_id----refresh_token; multiple lines supported",
    "Temp API，例如 https://your-temp-worker.example": "Temp API, e.g. https://your-temp-worker.example",
    "站点密钥，可选": "Site key, optional",
    "手机号，例如 +12025550123": "Phone number, e.g. +12025550123",
    "接码 API URL，例如 https://api.example.com/sms?phone={phone}": "SMS API URL, e.g. https://api.example.com/sms?phone={phone}",
    "批量导入：手机号----接码 API----绑定邮箱(可选)，不填邮箱进入批量池": "Batch import: phone----SMS API----bound email(optional); omit email for batch pool",
    "每行一个邮箱，直接粘贴从邮箱助手或临时邮箱池导出的内容": "One mailbox per line; paste content exported from the mailbox helper or temp pool",
    "没有可留空": "Leave empty if not needed",
    "只保存在本地浏览器": "Stored only in this browser",
    "默认读取本地导入邮箱的第二段密码": "Defaults to the second field from local mailbox import",
    "粘贴 https://chatgpt.com/api/auth/session 返回的 JSON": "Paste JSON returned by https://chatgpt.com/api/auth/session",
    "留空则生成 JSON，不直接推送": "Leave empty to generate JSON without pushing",
    "可选 Bearer token": "Optional Bearer token",
    "公益池 JSON 会出现在这里": "Public pool JSON appears here",
    "邮箱----JWT": "email----JWT",
    "上一页": "Previous Page",
    "下一页": "Next Page",
    "选择全部行": "Select all rows",
    "GitHub 开源项目": "GitHub repository",
    "顶部导航": "Top navigation",
    "功能导航": "Feature navigation",
    "GPT账号管理助手": "GPT Account Manager",
    "客户端首页": "Client home",
    "管理员页": "Admin page"
  };

  function getLanguage() {
    return localStorage.getItem(STORAGE_KEY) === TARGET_LANG ? TARGET_LANG : DEFAULT_LANG;
  }

  function setLanguage(lang) {
    localStorage.setItem(STORAGE_KEY, lang === TARGET_LANG ? TARGET_LANG : DEFAULT_LANG);
    applyI18n(document);
  }

  function translate(value, lang, dictionary = en) {
    if (lang !== TARGET_LANG) return value;
    return dictionary[value] || value;
  }

  function preserveWhitespace(original, replacement) {
    const prefix = original.match(/^\s*/)?.[0] || "";
    const suffix = original.match(/\s*$/)?.[0] || "";
    return `${prefix}${replacement}${suffix}`;
  }

  function shouldSkipElement(element) {
    return Boolean(element && element.nodeType === Node.ELEMENT_NODE && element.closest(SKIP_SELECTOR));
  }

  function translateTextNode(node, lang) {
    const parent = node.parentElement;
    if (shouldSkipElement(parent)) return;
    if (lastApplied.has(node) && node.nodeValue !== lastApplied.get(node)) {
      originals.set(node, node.nodeValue);
    } else if (!originals.has(node)) {
      originals.set(node, node.nodeValue);
    }
    const original = originals.get(node) || "";
    const trimmed = original.trim();
    if (!trimmed) return;
    const translated = translate(trimmed, lang);
    const next = preserveWhitespace(original, translated);
    if (node.nodeValue !== next) node.nodeValue = next;
    lastApplied.set(node, next);
  }

  function originalAttrKey(attr) {
    return `i18nOriginal${attr.replace(/[^a-z0-9]/gi, "_")}`;
  }

  function translateAttributes(element, lang) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || element.closest("script,style,noscript,[data-i18n-skip]")) return;
    ATTRS.forEach((attr) => {
      if (!element.hasAttribute(attr)) return;
      if (attr === "value" && !["BUTTON", "INPUT"].includes(element.tagName)) return;
      if (element.tagName === "INPUT" && !["button", "submit", "reset"].includes(String(element.type || "").toLowerCase()) && attr === "value") return;
      const key = originalAttrKey(attr);
      if (!element.dataset[key]) element.dataset[key] = element.getAttribute(attr) || "";
      const original = element.dataset[key] || "";
      const translated = translate(original, lang, attrMap);
      if (element.getAttribute(attr) !== translated) element.setAttribute(attr, translated);
    });
  }

  function translateTree(root, lang) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return shouldSkipElement(node.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let node = walker.nextNode();
    while (node) {
      translateTextNode(node, lang);
      node = walker.nextNode();
    }
    const elements = root.nodeType === Node.ELEMENT_NODE ? [root, ...root.querySelectorAll("*")] : [...document.querySelectorAll("*")];
    elements.forEach((element) => translateAttributes(element, lang));
  }

  function ensureStyle() {
    if (document.querySelector("#i18n-switch-style")) return;
    const style = document.createElement("style");
    style.id = "i18n-switch-style";
    style.textContent = `
      .language-switch {
        min-height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        border: 1px solid rgba(142, 165, 199, 0.32);
        border-radius: 8px;
        background: rgba(255,255,255,0.78);
        color: #28506e;
        font-size: 11px;
        font-weight: 850;
        line-height: 1;
        padding: 4px 8px;
        cursor: pointer;
      }
      .language-switch:hover {
        color: #0b62d8;
        border-color: rgba(47,117,255,0.42);
        background: rgba(255,255,255,0.96);
      }
      .language-switch i {
        font-style: normal;
        color: #7a8ba6;
      }
      .login-language-switch {
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 30;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureSwitcher() {
    ensureStyle();
    let button = document.querySelector(".language-switch");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "language-switch";
      button.dataset.i18nSkip = "true";
      const nav = document.querySelector(".topnav");
      if (nav) {
        nav.appendChild(button);
      } else {
        button.classList.add("login-language-switch");
        document.body.appendChild(button);
      }
      button.addEventListener("click", () => {
        setLanguage(getLanguage() === TARGET_LANG ? DEFAULT_LANG : TARGET_LANG);
      });
    }
    const lang = getLanguage();
    button.innerHTML = lang === TARGET_LANG ? "<span>中文</span><i>CN</i>" : "<span>English</span><i>EN</i>";
    button.setAttribute("aria-label", lang === TARGET_LANG ? "切换到中文" : "Switch to English");
    button.title = lang === TARGET_LANG ? "切换到中文" : "Switch to English";
  }

  let applying = false;
  let scheduled = false;

  function applyI18n(root = document) {
    if (applying || !document.body) return;
    applying = true;
    const lang = getLanguage();
    document.documentElement.lang = lang === TARGET_LANG ? "en" : "zh-CN";
    document.body.dataset.lang = lang;
    if (!document.documentElement.dataset.i18nOriginalTitle) {
      document.documentElement.dataset.i18nOriginalTitle = document.title;
    }
    const originalTitle = document.documentElement.dataset.i18nOriginalTitle || document.title;
    document.title = translate(originalTitle, lang, titleMap);
    ensureSwitcher();
    translateTree(root === document ? document.body : root, lang);
    ensureSwitcher();
    applying = false;
  }

  function scheduleApply() {
    if (scheduled || applying) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      applyI18n(document);
    }, 60);
  }

  function boot() {
    applyI18n(document);
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.GptAccountManagerI18n = {
      getLanguage,
      setLanguage,
      apply: () => applyI18n(document),
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
