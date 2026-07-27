(function initMailboxMessageView() {
  function createMailboxMessageView(config = {}) {
    const {
      typeLabels = {},
      emptyCategoryLabel = "未分组",
      escapeHtml = (value) => String(value ?? ""),
    } = config;

    function normalizeStoredMessages(value) {
      if (!Array.isArray(value)) return [];
      return value.map((message) => ({
        ...message,
        category: message.category === "默认" ? "" : (message.category || ""),
        mail_type: normalizeMailType(message.mail_type, message),
      }));
    }

    function normalizeMailType(value, message = null) {
      const text = String(value || "").trim().toLowerCase();
      const haystack = [
        text,
        message?.mail_type_label,
        message?.subject,
        message?.preview,
        message?.body,
      ].map((item) => String(item || "").toLowerCase()).join(" ");
      if (/\baccess\s+deactivated\b|\baccount\s+(deactivated|disabled|banned|suspended)\b|deleted\s+or\s+deactivated|封禁|停用|禁用/.test(haystack)) return "banned";
      if (/\bverification\b|\bverify\b|\botp\b|\bcode\b|验证码|安全代码|認証コード|認証番号|検証コード|確認コード|ワンタイム|一時ログインコード/.test(haystack) && /\d{4,8}/.test(haystack)) return "verification";
      if (/\binvite\b|\binvitation\b|\bjoin\b|\bteam\b|邀请/.test(haystack)) return "invite";
      if (/\bsecurity\b|\balert\b|\bsign-in\b|\blogin\b|\bunusual\b|安全|登录|multi-factor|mfa/.test(haystack)) return "security";
      if (/\bimages?\b|\breimagine\b|\bplus\s+plan\b|\bstart\s+creating\b|\blaunch\b|\bpromo\b|\bpromotion\b|\bnewsletter\b|\bdigest\b|\bupdate\b|\bintroducing\b|推广|订阅|最新动态/.test(haystack)) return "promotion";
      if (text === "reset") return "security";
      if (text === "billing" || text === "newsletter") return "promotion";
      return ["verification", "invite", "security", "promotion", "banned", "other"].includes(text) ? text : "other";
    }

    function htmlToPlainText(value) {
      const raw = String(value || "");
      if (!raw) return "";
      if (typeof DOMParser !== "undefined") {
        try {
          const doc = new DOMParser().parseFromString(raw, "text/html");
          doc.querySelectorAll("script, style, noscript").forEach((node) => node.remove());
          const parts = [];
          const blockTags = new Set(["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "DD", "DIV", "DL", "DT", "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL"]);
          const walk = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent.replace(/\s+/g, " ").trim();
              if (text) parts.push(text);
              return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            if (blockTags.has(node.tagName) && parts.length && parts[parts.length - 1] !== "\n") parts.push("\n");
            Array.from(node.childNodes).forEach(walk);
            if (blockTags.has(node.tagName) && parts.length && parts[parts.length - 1] !== "\n") parts.push("\n");
          };
          walk(doc.body);
          return parts.join(" ")
            .replace(/ *\n */g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .replace(/[ \t]{2,}/g, " ")
            .trim();
        } catch {
          // Fall through.
        }
      }
      return raw
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
    }

    function normalizePlainMailBody(value) {
      const lines = String(value || "")
        .replace(/\r\n?/g, "\n")
        .replace(/\u00a0/g, " ")
        .split("\n")
        .map((line) => line.replace(/[ \t\u3000]+$/g, ""));
      const compact = [];
      let previousBlank = false;
      lines.forEach((line) => {
        const clean = line.trim();
        if (!clean) {
          if (!previousBlank && compact.length) compact.push("");
          previousBlank = true;
          return;
        }
        compact.push(clean);
        previousBlank = false;
      });
      return compact.join("\n").trim();
    }

    function renderPlainMailBody(value) {
      const clean = normalizePlainMailBody(value);
      if (!clean) return '<p class="muted">这封邮件没有可展示的正文。</p>';
      return `<div class="mail-body-plain">${escapeHtml(clean).replace(/\n/g, "<br>")}</div>`;
    }

    function mailKey(message) {
      if (!message) return "";
      return [
        String(message.source || "").trim().toLowerCase(),
        String(message.account || "").trim().toLowerCase(),
        String(message.folder || "").trim().toLowerCase(),
        message.mid || "",
        message.subject || "",
        message.received_at || "",
      ].join("|");
    }

    function formatTime(value) {
      if (!value) return "-";
      const date = new Date(String(value).replace(" ", "T"));
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleString();
    }

    function iframeDocument(content) {
      return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <base target="_blank">
  <style>
    html, body { margin: 0; padding: 0; background: #fff; color: #1f2933; font-family: Arial, sans-serif; }
    body { padding: 16px; overflow-wrap: anywhere; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    a { color: #0f766e; }
  </style>
</head>
<body>${content || ""}</body>
</html>`;
    }

    function renderDetailHtml(message) {
      if (!message) {
        return {
          className: "mail-detail empty",
          html: "从左侧邮件列表选择一封邮件。",
          copyDisabled: true,
          deleteDisabled: true,
          hasHtmlBody: false,
          frameSrcdoc: "",
        };
      }
      const codes = Array.isArray(message.codes) ? message.codes : [];
      const normalizedType = normalizeMailType(message.mail_type, message);
      const visibleCodes = codes.slice(0, 3);
      const hiddenCodeCount = Math.max(0, codes.length - visibleCodes.length);
      const codeBlock = codes.length
        ? `<div class="detail-codes">${visibleCodes.map((code) => `<span>${escapeHtml(code)}</span>`).join("")}${hiddenCodeCount ? `<span class="more">+${hiddenCodeCount}</span>` : ""}</div>`
        : (normalizedType === "verification" ? '<p class="muted">这封邮件没有识别到验证码。</p>' : "");
      const plainBody = normalizePlainMailBody(message.body || message.preview || htmlToPlainText(message.html_body) || "");
      const hasHtmlBody = Boolean(message.html_body);
      const bodyBlock = hasHtmlBody
        ? `
      <iframe class="mail-html-frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" scrolling="auto"></iframe>
      ${plainBody ? `<details class="plain-fallback"><summary>纯文本备用</summary>${renderPlainMailBody(plainBody)}</details>` : ""}
    `
        : renderPlainMailBody(plainBody);
      return {
        className: `mail-detail${message.is_banned ? " banned" : ""}`,
        html: `
    <h3>${escapeHtml(message.subject || "(无主题)")}</h3>
    <div class="detail-meta">
      <span>${escapeHtml(typeLabels[normalizedType] || "其他")}</span>
      <span>${escapeHtml(message.sender || "-")}</span>
      <span>${escapeHtml(message.account || "-")}</span>
      <span>${escapeHtml(formatTime(message.received_at))}</span>
      <span>${escapeHtml(message.category || emptyCategoryLabel)}</span>
    </div>
    ${codeBlock}
    ${bodyBlock}
  `,
        copyDisabled: !codes.length,
        deleteDisabled: false,
        hasHtmlBody,
        frameSrcdoc: hasHtmlBody ? iframeDocument(message.html_body) : "",
      };
    }

    return {
      normalizeStoredMessages,
      normalizeMailType,
      htmlToPlainText,
      normalizePlainMailBody,
      renderPlainMailBody,
      mailKey,
      formatTime,
      iframeDocument,
      renderDetailHtml,
    };
  }

  window.GAM = window.GAM || {};
  window.GAM.mailboxMessageView = { createMailboxMessageView };
}());
