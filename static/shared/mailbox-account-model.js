(function initMailboxAccountModel() {
  function createMailboxAccountModel(config = {}) {
    const {
      defaultTempWorkerUrl = "",
      legacyTempWorkerUrls = [],
      importDateCategoryPattern = /^\d{4}-\d{2}-\d{2}$/,
      reservedCategoryNames = [],
      legacyCategoryNames = [],
      legacySeededCategories = [],
      serviceLabels = {
        microsoft: "Outlook",
        temp: "临时邮箱",
        generic: "其他邮箱",
      },
      treatDefaultCategoryAsEmpty = false,
      onEnsureCategory = null,
    } = config;

    const legacyTempSet = new Set(legacyTempWorkerUrls);
    const reservedCategorySet = new Set(reservedCategoryNames);
    const legacyCategorySet = new Set([...legacyCategoryNames].map((item) => String(item || "").toLowerCase()));
    const legacySeededSet = new Set(legacySeededCategories);

    function normalizeUrl(value) {
      return String(value || "").trim().replace(/\/+$/, "");
    }

    function normalizeTempWorkerUrl(value) {
      let clean = normalizeUrl(value);
      if (clean && !/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
      return legacyTempSet.has(clean) ? defaultTempWorkerUrl : (clean || defaultTempWorkerUrl);
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
      if (isMaskedSecret(nextText) && currentText && !isMaskedSecret(currentText)) return currentText;
      return nextText;
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

    function isGenericApiMode(value) {
      return ["cloudmail", "luckmail", "inbucket"].includes(normalizeGenericMode(value));
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

    function isImportDateCategory(value) {
      return importDateCategoryPattern.test(String(value || "").trim());
    }

    function isAllowedCategory(value) {
      const clean = String(value || "").trim();
      if (!clean) return false;
      if (reservedCategorySet.has(clean)) return true;
      if (isImportDateCategory(clean)) return true;
      return !legacyCategorySet.has(clean.toLowerCase());
    }

    function normalizeStoredCategories(value) {
      if (!Array.isArray(value)) return [];
      const cleaned = [...new Set(value.map((category) => String(category || "").trim()).filter(Boolean))]
        .filter((category) => isAllowedCategory(category));
      return cleaned.length && cleaned.every((category) => legacySeededSet.has(category)) ? [] : cleaned;
    }

    function sortableTime(value) {
      const time = new Date(String(value || "").replace(" ", "T")).getTime();
      return Number.isNaN(time) ? 0 : time;
    }

    function sortAccounts(accounts) {
      return [...accounts].sort((a, b) => {
        const batchDiff = sortableTime(b.imported_at || b.created_at || b.updated_at)
          - sortableTime(a.imported_at || a.created_at || a.updated_at);
        if (batchDiff) return batchDiff;
        const orderDiff = Number(a.import_order ?? 0) - Number(b.import_order ?? 0);
        if (orderDiff) return orderDiff;
        return String(a.email || "").localeCompare(String(b.email || ""));
      });
    }

    function accountCompletenessScore(account) {
      const secretFields = [
        account.password,
        account.client_id,
        account.refresh_token,
        account.jwt,
        account.site_password,
        account.token,
        account.imap_host,
        account.pop3_host,
        account.base_url,
        account.username,
      ];
      return secretFields.reduce((score, value) => {
        const text = String(value || "").trim();
        if (!text) return score;
        return score + 1;
      }, 0);
    }

    function sourcePriority(account) {
      if (account.source === "microsoft") return 3;
      if (account.source === "temp") return 2;
      if (account.source === "generic") return 1;
      return 0;
    }

    function mergeAccountRecords(current, incoming) {
      if (!current) return incoming;
      const currentTime = sortableTime(current.updated_at || current.imported_at || current.created_at);
      const incomingTime = sortableTime(incoming.updated_at || incoming.imported_at || incoming.created_at);
      const incomingIsBetter = accountCompletenessScore(incoming) > accountCompletenessScore(current)
        || (accountCompletenessScore(incoming) === accountCompletenessScore(current)
          && (sourcePriority(incoming) > sourcePriority(current) || incomingTime >= currentTime));
      const base = incomingIsBetter ? incoming : current;
      const fallback = incomingIsBetter ? current : incoming;
      return {
        ...fallback,
        ...base,
        password: preferRealSecret(base.password, fallback.password),
        client_id: preferRealSecret(base.client_id, fallback.client_id),
        refresh_token: preferRealSecret(base.refresh_token, fallback.refresh_token),
        jwt: preferRealSecret(base.jwt, fallback.jwt),
        site_password: preferRealSecret(base.site_password, fallback.site_password),
        token: preferRealSecret(base.token, fallback.token),
        username: base.username || fallback.username || "",
        mode: base.mode || fallback.mode || "auto",
        imap_host: base.imap_host || fallback.imap_host || "",
        imap_port: base.imap_port || fallback.imap_port || 993,
        pop3_host: base.pop3_host || fallback.pop3_host || "",
        pop3_port: base.pop3_port || fallback.pop3_port || 995,
        base_url: base.base_url || fallback.base_url || "",
        category: base.category || fallback.category || "",
        imported_at: base.imported_at || fallback.imported_at || "",
        import_order: base.import_order ?? fallback.import_order,
        created_at: base.created_at || fallback.created_at || "",
        updated_at: base.updated_at || fallback.updated_at || new Date().toISOString(),
        selected: base.selected !== false && fallback.selected !== false,
      };
    }

    function dedupeAccounts(accounts) {
      const byEmail = new Map();
      [...accounts].forEach((account) => {
        const normalized = normalizeStoredAccount(account);
        if (!normalized) return;
        if (!isAllowedCategory(normalized.category)) normalized.category = "";
        const key = normalized.email.toLowerCase();
        byEmail.set(key, mergeAccountRecords(byEmail.get(key), normalized));
      });
      return sortAccounts(byEmail.values());
    }

    function importDateCategory(value) {
      const date = new Date(String(value || "").replace(" ", "T"));
      if (Number.isNaN(date.getTime())) return "";
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function applyImportBatch(rows, importedAt = new Date().toISOString()) {
      const category = importDateCategory(importedAt);
      rows.forEach((row, index) => {
        row.imported_at = importedAt;
        row.import_order = index + 1;
        row.category = row.category || category;
      });
      if (category && typeof onEnsureCategory === "function") onEnsureCategory(category);
      return category;
    }

    function looksLikeJwt(value) {
      const text = String(value || "").trim();
      return text.split(".").length >= 3 || text.length > 80;
    }

    function looksLikeMicrosoftClientId(value) {
      const text = String(value || "").trim();
      if (!text || /^https?:\/\//i.test(text)) return false;
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
        || (/^[A-Za-z0-9._-]{20,}$/.test(text) && !looksLikeJwt(text));
    }

    function looksLikeMicrosoftRefreshToken(value) {
      const text = String(value || "").trim();
      return text.length >= 20 && !/^https?:\/\//i.test(text);
    }

    function isMicrosoftAccountMarker(account) {
      const source = String(account?.source || "").trim().toLowerCase();
      const id = String(account?.id || "").trim().toLowerCase();
      const service = String(account?.service || "").trim().toLowerCase();
      return source === "microsoft"
        || id.startsWith("microsoft:")
        || /outlook|microsoft|office\s*365/.test(service);
    }

    function hasMicrosoftOAuthCredentials(account) {
      const clientId = String(account?.client_id || account?.clientId || "").trim();
      const refreshToken = String(account?.refresh_token || account?.refreshToken || "").trim();
      return Boolean(clientId && refreshToken);
    }

    function normalizeCategoryValue(value) {
      const clean = String(value || "").trim();
      if (treatDefaultCategoryAsEmpty && clean === "默认") return "";
      return clean;
    }

    function normalizeStoredAccount(account) {
      if (!account || typeof account !== "object") return null;
      const email = String(account.email || "").trim();
      if (!email.includes("@")) return null;
      const normalizedCategory = isAllowedCategory(account.category || account.label)
        ? normalizeCategoryValue(account.category || account.label || "")
        : "";
      if (account.source === "generic" || String(account.id || "").startsWith("generic:")) {
        const payload = genericAccountPayload({ ...account, email });
        return {
          ...account,
          ...payload,
          id: `generic:${email.toLowerCase()}`,
          source: "generic",
          service: serviceLabels.generic,
          email,
          token: "",
          jwt: "",
          client_id: "",
          refresh_token: "",
          site_password: "",
          category: normalizeCategoryValue(payload.category || normalizedCategory),
          selected: account.selected !== false,
        };
      }
      const legacyMicrosoftCredential = account.source === "temp"
        && looksLikeMicrosoftClientId(account.category)
        && looksLikeMicrosoftRefreshToken(account.site_password);
      const clientId = String(
        account.client_id
        || account.clientId
        || (legacyMicrosoftCredential ? account.category : "")
        || "",
      );
      const refreshToken = String(
        account.refresh_token
        || account.refreshToken
        || (legacyMicrosoftCredential ? account.site_password : "")
        || "",
      );
      const explicitGeneric = account.source === "generic" || String(account.id || "").startsWith("generic:");
      const hasMicrosoftOAuth = hasMicrosoftOAuthCredentials({ client_id: clientId, refresh_token: refreshToken });
      const isMicrosoft = !explicitGeneric && (
        isMicrosoftAccountMarker(account)
        || hasMicrosoftOAuth
      );
      if (isMicrosoft) {
        return {
          ...account,
          id: `microsoft:${email.toLowerCase()}`,
          source: "microsoft",
          service: serviceLabels.microsoft,
          email,
          password: String(account.password || (legacyMicrosoftCredential ? account.jwt : "") || ""),
          client_id: clientId,
          refresh_token: refreshToken,
          jwt: legacyMicrosoftCredential ? "" : String(account.jwt || ""),
          site_password: legacyMicrosoftCredential ? "" : String(account.site_password || account.sitePassword || ""),
          category: legacyMicrosoftCredential ? "" : normalizedCategory,
          selected: account.selected !== false,
        };
      }
      const tempCredential = String(account.jwt || (looksLikeJwt(account.password) ? account.password : "") || "");
      const treatAsTemp = account.source === "temp"
        || String(account.id || "").startsWith("temp:")
        || String(account.service || "").toLowerCase().includes("cloud")
        || Boolean(tempCredential);
      if (treatAsTemp) {
        return {
          ...account,
          id: `temp:${email.toLowerCase()}`,
          source: "temp",
          service: serviceLabels.temp,
          email,
          jwt: tempCredential,
          base_url: normalizeTempWorkerUrl(account.base_url || account.baseUrl || ""),
          site_password: String(account.site_password || account.sitePassword || ""),
          password: "",
          client_id: "",
          refresh_token: "",
          category: normalizedCategory,
          selected: account.selected !== false,
        };
      }
      return {
        ...account,
        id: `microsoft:${email.toLowerCase()}`,
        source: "microsoft",
        service: account.service || serviceLabels.microsoft,
        email,
        password: String(account.password || ""),
        client_id: String(account.client_id || account.clientId || ""),
        refresh_token: String(account.refresh_token || account.refreshToken || ""),
        category: normalizedCategory,
        selected: account.selected !== false,
      };
    }

    function normalizeStoredAccounts(value) {
      if (!Array.isArray(value)) return [];
      return dedupeAccounts(value);
    }

    return {
      normalizeUrl,
      normalizeTempWorkerUrl,
      isMaskedSecret,
      preferRealSecret,
      normalizeGenericMode,
      isGenericApiMode,
      genericAccountPayload,
      isImportDateCategory,
      isAllowedCategory,
      normalizeStoredCategories,
      sortAccounts,
      importDateCategory,
      applyImportBatch,
      looksLikeJwt,
      looksLikeMicrosoftClientId,
      looksLikeMicrosoftRefreshToken,
      hasMicrosoftOAuthCredentials,
      normalizeStoredAccount,
      normalizeStoredAccounts,
      dedupeAccounts,
      mergeAccountRecords,
    };
  }

  window.GAM = window.GAM || {};
  window.GAM.mailboxAccountModel = { createMailboxAccountModel };
})();
