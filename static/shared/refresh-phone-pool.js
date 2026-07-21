(function initRefreshPhonePool() {
  function createRefreshPhonePoolHelper(config = {}) {
    const {
      state,
      els,
      helpers,
      actions,
    } = config;

    const {
      escapeHtml,
      accountEmailKey,
      savePhonePool,
      saveQueue,
      renderQueue,
      renderSources,
      renderAll,
      renderSelectedPhoneCodePanel,
      toast,
      addLog,
      apiHeaders,
      readJsonResponse,
      currentPhoneMode,
      selectedSingleQueueRow,
    } = helpers;

    const {
      normalizePhoneDigits,
      phoneMatches,
    } = actions;

    function normalizePhonePool(value) {
      if (!Array.isArray(value)) return [];
      const seen = new Set();
      return value.map((item) => {
        const phone = String(item?.phone || "").trim();
        const provider = normalizePhoneProvider(item?.provider || item?.phone_provider);
        const apiUrl = String(item?.api_url || item?.apiUrl || "").trim();
        const apiKey = String(item?.api_key || item?.apiKey || item?.phone_api_key || "").trim();
        const activationId = String(item?.activation_id || item?.activationId || item?.phone_activation_id || "").trim();
        const endpoint = String(item?.endpoint || item?.provider_endpoint || item?.phone_provider_endpoint || "").trim();
        const validSource = provider === "custom" ? validPhoneApiUrl(apiUrl) : Boolean(apiKey && activationId);
        if (!phone || !validSource) return null;
        const id = String(item?.id || `phone:${phone.toLowerCase()}`);
        const key = id.toLowerCase();
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          id,
          mode: item?.mode === "bound" || item?.mode === "one_to_one" ? "bound" : "batch",
          phone,
          provider,
          api_url: apiUrl,
          api_key: apiKey,
          activation_id: activationId,
          endpoint,
          account_email: String(item?.account_email || item?.accountEmail || "").trim().toLowerCase(),
          last_code: String(item?.last_code || item?.lastCode || ""),
          last_message: String(item?.last_message || item?.lastMessage || ""),
          last_checked_at: String(item?.last_checked_at || item?.lastCheckedAt || ""),
          provider_status: String(item?.provider_status || item?.providerStatus || ""),
          provider_service: String(item?.provider_service || item?.providerService || ""),
          provider_country: String(item?.provider_country || item?.providerCountry || ""),
          provider_created_at: String(item?.provider_created_at || item?.providerCreatedAt || ""),
          provider_synced_at: String(item?.provider_synced_at || item?.providerSyncedAt || ""),
          status: String(item?.status || "idle"),
        };
      }).filter(Boolean);
    }

    function phoneCodeForRow(row, entry = null) {
      return String(row?.manual_phone_code || row?.phone_code || "").trim();
    }

    function phonePoolPayload() {
      return state.phonePool.map((item) => ({
        id: item.id,
        mode: item.mode,
        phone: item.phone,
        provider: item.provider,
        api_url: item.api_url,
        api_key: item.api_key,
        activation_id: item.activation_id,
        endpoint: item.endpoint,
        account_email: item.account_email || "",
        provider_status: item.provider_status || "",
        provider_service: item.provider_service || "",
        provider_country: item.provider_country || "",
        provider_created_at: item.provider_created_at || "",
        provider_synced_at: item.provider_synced_at || "",
      }));
    }

    function phoneEntryForRow(row) {
      const key = accountEmailKey(row.email || row.name);
      if (row.phone_id) {
        const byId = state.phonePool.find((item) => item.id === row.phone_id);
        if (byId) return byId;
      }
      if (row.phone_number) {
        const byPhone = state.phonePool.find((item) => phoneMatches(item.phone, row.phone_number));
        if (byPhone) return byPhone;
      }
      if (key) {
        const bound = state.phonePool.find((item) => accountEmailKey(item.account_email) === key);
        if (bound) return bound;
      }
      return null;
    }

    function ensurePhoneEntryForRow(row) {
      const existing = phoneEntryForRow(row);
      if (existing) return existing;
      const used = new Set(state.queue.map((item) => item.phone_id).filter(Boolean));
      const entry = state.phonePool.find((item) => item.mode === "batch" && !accountEmailKey(item.account_email) && !used.has(item.id));
      if (!entry) return null;
      row.phone_id = entry.id;
      row.phone_number = entry.phone;
      row.phone_api_url = entry.api_url;
      row.phone_provider = entry.provider;
      row.phone_api_key = entry.api_key;
      row.phone_activation_id = entry.activation_id;
      row.phone_provider_endpoint = entry.endpoint;
      saveQueue();
      return entry;
    }

    function formatPhoneTime(value) {
      const parsed = Date.parse(value || "");
      if (!Number.isFinite(parsed)) return "";
      return new Date(parsed).toLocaleTimeString("zh-CN", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }

    function normalizePhoneProvider(value) {
      const provider = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (["herosms", "hero"].includes(provider)) return "herosms";
      if (["smsbower", "bower"].includes(provider)) return "smsbower";
      return "custom";
    }

    function phoneProviderLabel(provider) {
      if (provider === "herosms") return "HeroSMS";
      if (provider === "smsbower") return "SMSBower";
      return "自定义 API";
    }

    function phoneProviderSummary(item) {
      if (item.provider === "custom") return phoneProviderLabel(item.provider);
      const activation = String(item.activation_id || "");
      const suffix = activation ? ` #${activation.slice(-6)}` : "";
      const service = String(item.provider_service || "").trim();
      const country = String(item.provider_country || "").trim();
      return [phoneProviderLabel(item.provider), service, country].filter(Boolean).join(" · ") + suffix;
    }

    function renderPhoneBindingList() {
      if (!els.phoneBindingList) return;
      if (!state.phonePool.length) {
        els.phoneBindingList.innerHTML = '<div class="phone-pool-empty">还没有手机号绑定关系。</div>';
        return;
      }
      const rows = [...state.phonePool].sort((a, b) => {
        const aBound = a.account_email ? 0 : 1;
        const bBound = b.account_email ? 0 : 1;
        if (aBound !== bBound) return aBound - bBound;
        return String(a.phone || "").localeCompare(String(b.phone || ""));
      });
      els.phoneBindingList.innerHTML = rows.map((item) => {
        const mode = item.mode === "bound" ? "1对1" : "批量";
        const email = item.account_email || "未绑定邮箱";
        const hint = item.last_code
          ? `最近验证码 ${item.last_code}${item.last_checked_at ? ` · ${formatPhoneTime(item.last_checked_at)}` : ""}`
          : (item.status === "running" ? "正在取码" : (item.status === "error" ? "取码失败" : (item.provider_status || "等待取码")));
        return `
          <div class="phone-binding-row">
            <strong>${escapeHtml(item.phone)}</strong>
            <span>${escapeHtml(email)}</span>
            <em>${escapeHtml(mode)} · ${escapeHtml(phoneProviderSummary(item))} · ${escapeHtml(hint)}</em>
          </div>
        `;
      }).join("");
    }

    function renderPhonePool() {
      if (!els.phonePoolList) return;
      if (!state.phonePool.length) {
        els.phonePoolList.innerHTML = '<div class="phone-pool-empty">还没有长效手机。</div>';
        renderPhoneBindingList();
        renderSelectedPhoneCodePanel();
        return;
      }
      els.phonePoolList.innerHTML = state.phonePool.map((item) => {
        const status = item.last_code
          ? `最近验证码 ${item.last_code}${item.last_checked_at ? ` · ${formatPhoneTime(item.last_checked_at)}` : ""}`
          : (item.status === "running" ? "正在取码" : (item.status === "error" ? "取码失败" : (item.provider_status || "等待取码")));
        const mode = item.mode === "bound" ? "1对1" : "批量";
        const bound = item.account_email ? item.account_email : "未绑定账号";
        return `
          <div class="phone-pool-row" data-id="${escapeHtml(item.id)}">
            <div>
              <strong>${escapeHtml(item.phone)}</strong>
              <em>${escapeHtml(mode)} · ${escapeHtml(phoneProviderSummary(item))} · ${escapeHtml(bound)} · ${escapeHtml(status)}</em>
            </div>
            <div class="phone-pool-actions">
              <button class="bind-phone" type="button">绑定选中</button>
              <button class="poll-phone" type="button"${item.polling ? " disabled" : ""}>${item.polling ? "取码中" : "取码"}</button>
              <button class="remove-phone danger" type="button">删除</button>
            </div>
          </div>
        `;
      }).join("");
      renderPhoneBindingList();
      renderSelectedPhoneCodePanel();
    }

    function validPhoneApiUrl(value) {
      try {
        const url = new URL(String(value || "").trim()
          .replace(/\{phone\}/g, "10000000000")
          .replace(/\{email\}/g, "user@example.com")
          .replace(/\{account\}/g, "user@example.com")
          .replace(/\{since\}/g, "0")
          .replace(/\{ts\}/g, String(Date.now())));
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }

    function currentPhoneProvider() {
      return normalizePhoneProvider(els.phoneProvider?.value);
    }

    function validPhoneProviderEndpoint(value) {
      return !String(value || "").trim() || validPhoneApiUrl(value);
    }

    function readPhoneProviderFields() {
      const provider = currentPhoneProvider();
      const apiUrl = els.phoneApiUrl ? els.phoneApiUrl.value.trim() : "";
      const apiKey = els.phoneApiKey ? els.phoneApiKey.value.trim() : "";
      const activationId = els.phoneActivationId ? els.phoneActivationId.value.trim() : "";
      const endpoint = els.phoneProviderEndpoint ? els.phoneProviderEndpoint.value.trim() : "";
      if (provider === "custom") {
        if (!validPhoneApiUrl(apiUrl)) return { error: "请填写有效的接码 API URL" };
      } else if (!apiKey || !activationId) {
        return { error: "请填写平台 API Key 和激活订单 ID" };
      }
      if (!validPhoneProviderEndpoint(endpoint)) return { error: "自定义平台地址必须是 http/https URL" };
      return {
        provider,
        api_url: apiUrl,
        api_key: apiKey,
        activation_id: activationId,
        endpoint,
      };
    }

    function readPhoneProviderConnection() {
      const provider = currentPhoneProvider();
      const apiKey = els.phoneApiKey ? els.phoneApiKey.value.trim() : "";
      const endpoint = els.phoneProviderEndpoint ? els.phoneProviderEndpoint.value.trim() : "";
      if (provider === "custom") return { error: "自定义 API 不需要平台连接验证" };
      if (!apiKey) return { error: "请填写平台 API Key" };
      if (!validPhoneProviderEndpoint(endpoint)) return { error: "自定义平台地址必须是 http/https URL" };
      return { provider, api_key: apiKey, endpoint };
    }

    function setPhoneProviderStatus(message = "", tone = "") {
      if (!els.phoneProviderStatus) return;
      els.phoneProviderStatus.textContent = message;
      if (tone) els.phoneProviderStatus.dataset.tone = tone;
      else delete els.phoneProviderStatus.dataset.tone;
    }

    function syncPhoneProviderForm() {
      const provider = currentPhoneProvider();
      document.querySelectorAll("[data-phone-provider]").forEach((field) => {
        const type = field.dataset.phoneProvider;
        field.hidden = (type === "custom") !== (provider === "custom");
      });
      if (els.phoneApiUrl) {
        els.phoneApiUrl.placeholder = "接码 API URL，例如 https://api.example.com/sms?phone={phone}";
      }
      if (provider === "custom") {
        setPhoneProviderStatus("模板接口", "neutral");
      } else {
        setPhoneProviderStatus("内置兼容接口", "neutral");
      }
    }

    async function verifyPhoneProvider() {
      const connection = readPhoneProviderConnection();
      if (connection.error) {
        toast(connection.error);
        return;
      }
      if (els.verifyPhoneProvider) els.verifyPhoneProvider.disabled = true;
      setPhoneProviderStatus("正在验证", "running");
      try {
        const response = await fetch("/client-api/phone-provider/balance", {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify(connection),
        });
        const data = await readJsonResponse(response, "平台验证失败");
        const balance = data.balance ? `余额 ${data.balance}` : "验证成功";
        setPhoneProviderStatus(balance, "success");
        toast(`${phoneProviderLabel(connection.provider)} ${balance}`);
      } catch (error) {
        const details = error.details || { error: error.message || "平台验证失败", error_code: "phone_provider_balance_failed" };
        setPhoneProviderStatus("验证失败", "error");
        addLog("接码平台验证失败", "error", { error_code: details.error_code || "phone_provider_balance_failed" });
        toast(details.error || "平台验证失败");
      } finally {
        if (els.verifyPhoneProvider) els.verifyPhoneProvider.disabled = false;
      }
    }

    function activationStatusLabel(value) {
      const raw = String(value || "").trim();
      return raw ? `订单状态 ${raw}` : "已同步订单";
    }

    async function syncPhoneProviderActivations() {
      const connection = readPhoneProviderConnection();
      if (connection.error) {
        toast(connection.error);
        return;
      }
      if (els.syncPhoneProviderActivations) els.syncPhoneProviderActivations.disabled = true;
      setPhoneProviderStatus("正在同步订单", "running");
      try {
        const response = await fetch("/client-api/phone-provider/active-activations", {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify(connection),
        });
        const data = await readJsonResponse(response, "订单同步失败");
        const items = Array.isArray(data.items) ? data.items : [];
        let added = 0;
        let updated = 0;
        items.forEach((remote) => {
          const phone = String(remote?.phone || "").trim();
          const activationId = String(remote?.activation_id || "").trim();
          if (!phone || !activationId) return;
          const id = `phone:${phone.toLowerCase()}`;
          const existing = state.phonePool.find((entry) => entry.id === id || phoneMatches(entry.phone, phone));
          const next = {
            ...(existing || {}),
            id,
            mode: existing?.mode || "batch",
            phone,
            provider: connection.provider,
            api_url: "",
            api_key: connection.api_key,
            activation_id: activationId,
            endpoint: connection.endpoint,
            account_email: existing?.account_email || "",
            provider_status: activationStatusLabel(remote.status),
            provider_service: String(remote.service || "").trim(),
            provider_country: String(remote.country || "").trim(),
            provider_created_at: String(remote.created_at || "").trim(),
            provider_synced_at: data.checked_at || new Date().toISOString(),
            status: existing?.status || "idle",
            last_code: existing?.last_code || "",
            last_message: existing?.last_message || "",
            last_checked_at: existing?.last_checked_at || "",
          };
          if (existing) {
            Object.assign(existing, next);
            updated += 1;
          } else {
            state.phonePool.push(next);
            added += 1;
          }
        });
        savePhonePool();
        renderAll();
        const summary = items.length ? `同步 ${items.length} 笔订单` : "没有活跃订单";
        setPhoneProviderStatus(summary, items.length ? "success" : "neutral");
        toast(`${summary}${items.length ? `：新增 ${added}，更新 ${updated}` : ""}`);
      } catch (error) {
        const details = error.details || { error: error.message || "订单同步失败", error_code: "phone_provider_sync_failed" };
        setPhoneProviderStatus("同步失败", "error");
        addLog("接码平台订单同步失败", "error", { error_code: details.error_code || "phone_provider_sync_failed" });
        toast(details.error || "订单同步失败");
      } finally {
        if (els.syncPhoneProviderActivations) els.syncPhoneProviderActivations.disabled = false;
      }
    }

    function addOrUpdatePhoneEntry() {
      const phone = els.phoneNumber ? els.phoneNumber.value.trim() : "";
      const providerFields = readPhoneProviderFields();
      if (!phone) {
        toast("请填写手机号");
        return;
      }
      if (providerFields.error) {
        toast(providerFields.error);
        addLog("手机 API 格式错误", "error", { error_code: "phone_pool_api_invalid" });
        return;
      }
      const selected = selectedSingleQueueRow();
      const isOneToOne = currentPhoneMode() !== "batch";
      if (isOneToOne && !selected) {
        toast("请先在刷新队列中勾选一个账号，再建立 1 对 1 绑定");
        return;
      }
      const accountEmail = isOneToOne && selected ? accountEmailKey(selected.email || selected.name) : "";
      const id = `phone:${phone.toLowerCase()}`;
      const existing = state.phonePool.find((item) => item.id === id || item.phone === phone);
      if (accountEmail) {
        state.phonePool.forEach((item) => {
          if (item.id !== id && accountEmailKey(item.account_email) === accountEmail) {
            item.account_email = "";
          }
        });
      }
      const next = {
        ...(existing || {}),
        id,
        mode: accountEmail ? "bound" : "batch",
        phone,
        ...providerFields,
        account_email: accountEmail || existing?.account_email || "",
        status: existing?.status || "idle",
        last_code: existing?.last_code || "",
        last_message: existing?.last_message || "",
        last_checked_at: existing?.last_checked_at || "",
      };
      if (existing) {
        Object.assign(existing, next);
      } else {
        state.phonePool.push(next);
      }
      savePhonePool();
      renderAll();
      toast(accountEmail ? "手机号已加入并绑定选中账号" : "手机号已加入手机池");
    }

    function importPhoneBatchEntries() {
      const text = els.phoneBatchText ? els.phoneBatchText.value.trim() : "";
      if (!text) {
        toast("请先粘贴批量手机号");
        return;
      }
      let added = 0;
      let updated = 0;
      const errors = [];
      text.split(/\r?\n/).forEach((line, index) => {
        const raw = line.trim();
        if (!raw) return;
        const parts = raw.split(/----|\t|,/).map((part) => part.trim());
        const phone = parts[0] || "";
        const requestedProvider = normalizePhoneProvider(parts[1]);
        const explicitProvider = /^(?:custom|api|url|hero(?:sms)?|smsbower|bower)$/i.test(parts[1] || "");
        let providerFields;
        let email = "";
        if (!explicitProvider) {
          providerFields = { provider: "custom", api_url: parts[1] || "", api_key: "", activation_id: "", endpoint: "" };
          email = parts[2] || "";
        } else if (requestedProvider === "custom") {
          providerFields = { provider: "custom", api_url: parts[2] || "", api_key: "", activation_id: "", endpoint: "" };
          email = parts[3] || "";
        } else {
          providerFields = {
            provider: requestedProvider,
            api_url: "",
            api_key: parts[2] || "",
            activation_id: parts[3] || "",
            endpoint: parts[5] || "",
          };
          email = parts[4] || "";
        }
        const validSource = providerFields.provider === "custom"
          ? validPhoneApiUrl(providerFields.api_url)
          : Boolean(providerFields.api_key && providerFields.activation_id && validPhoneProviderEndpoint(providerFields.endpoint));
        if (!phone || !validSource) {
          errors.push(index + 1);
          return;
        }
        const id = `phone:${phone.toLowerCase()}`;
        const existing = state.phonePool.find((item) => item.id === id || item.phone === phone);
        const next = {
          ...(existing || {}),
          id,
          mode: email ? "bound" : "batch",
          phone,
          ...providerFields,
          account_email: accountEmailKey(email),
          status: existing?.status || "idle",
          last_code: existing?.last_code || "",
          last_message: existing?.last_message || "",
          last_checked_at: existing?.last_checked_at || "",
        };
        if (existing) {
          Object.assign(existing, next);
          updated += 1;
        } else {
          state.phonePool.push(next);
          added += 1;
        }
      });
      savePhonePool();
      if (els.phoneBatchText && !errors.length) els.phoneBatchText.value = "";
      renderAll();
      toast(`手机池导入：新增 ${added}，更新 ${updated}${errors.length ? `，失败 ${errors.length}` : ""}`);
      if (errors.length) addLog(`手机池批量导入有 ${errors.length} 行格式错误`, "warning", { error_code: "phone_pool_api_invalid" });
    }

    function bindPhoneToSelected(phoneId) {
      const item = state.phonePool.find((entry) => entry.id === phoneId);
      const row = selectedSingleQueueRow();
      if (!item) return;
      if (!row) {
        toast("请只勾选一个队列账号再绑定");
        return;
      }
      const accountEmail = accountEmailKey(row.email || row.name);
      state.phonePool.forEach((entry) => {
        if (entry.id !== phoneId && accountEmailKey(entry.account_email) === accountEmail) {
          entry.account_email = "";
        }
      });
      item.mode = "bound";
      item.account_email = accountEmail;
      row.phone_id = item.id;
      row.phone_number = item.phone;
      row.phone_api_url = item.api_url;
      row.phone_provider = item.provider;
      row.phone_api_key = item.api_key;
      row.phone_activation_id = item.activation_id;
      row.phone_provider_endpoint = item.endpoint;
      savePhonePool();
      saveQueue();
      renderAll();
      addLog(`${row.email} 已绑定长效手机`, "success", { step: "phone_pool", email: row.email });
    }

    function removePhoneEntry(phoneId) {
      const item = state.phonePool.find((entry) => entry.id === phoneId);
      if (!item) return;
      if (!confirm(`删除长效手机 ${item.phone}？不会删除账号，只会解除绑定。`)) return;
      state.phonePool = state.phonePool.filter((entry) => entry.id !== phoneId);
      state.queue.forEach((row) => {
        if (row.phone_id === phoneId || String(row.phone_number || "") === item.phone) {
          delete row.phone_id;
          delete row.phone_number;
          delete row.phone_api_url;
          delete row.phone_provider;
          delete row.phone_api_key;
          delete row.phone_activation_id;
          delete row.phone_provider_endpoint;
        }
      });
      savePhonePool();
      saveQueue();
      renderSources();
      renderQueue();
      renderSelectedPhoneCodePanel();
    }

    async function pollPhoneEntry(phoneId, rowId = "", options = {}) {
      const item = state.phonePool.find((entry) => entry.id === phoneId);
      if (!item) return { skipped: true };
      if (item.polling) return { skipped: true };
      const quiet = Boolean(options.quiet);
      const targetRow = state.queue.find((row) => row.id === rowId) || state.queue.find((row) => (
        row.phone_id === item.id
        || phoneMatches(item.phone, row.phone_number)
        || accountEmailKey(row.email || row.name) === accountEmailKey(item.account_email)
      ));
      item.polling = true;
      item.status = "running";
      savePhonePool();
      renderPhonePool();
      try {
        const response = await fetch("/client-api/phone-code/poll", {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify({
            phone: item.phone,
            provider: item.provider,
            api_url: item.api_url,
            api_key: item.api_key,
            activation_id: item.activation_id,
            endpoint: item.endpoint,
            account_email: targetRow?.email || item.account_email,
            since: item.last_checked_at || "",
          }),
        });
        const data = await readJsonResponse(response, "手机取码失败");
        item.last_checked_at = data.checked_at || new Date().toISOString();
        item.last_message = data.message || "";
        item.status = data.found ? "found" : "idle";
        if (data.code) item.last_code = String(data.code);
        if (targetRow) {
          targetRow.phone_id = item.id;
          targetRow.phone_number = item.phone;
          targetRow.phone_api_url = item.api_url;
          targetRow.phone_provider = item.provider;
          targetRow.phone_api_key = item.api_key;
          targetRow.phone_activation_id = item.activation_id;
          targetRow.phone_provider_endpoint = item.endpoint;
          targetRow.phone_code = data.code ? String(data.code) : targetRow.phone_code || "";
          targetRow.phone_code_message = data.message || "";
          targetRow.phone_code_checked_at = data.checked_at || new Date().toISOString();
          if (!item.account_email && currentPhoneMode() !== "batch") item.account_email = accountEmailKey(targetRow.email || targetRow.name);
        }
        savePhonePool();
        saveQueue();
        renderPhonePool();
        renderQueue();
        if (data.found) {
          if (!quiet) {
            addLog(`${item.account_email || item.phone} 手机验证码：${data.code}`, "success", { step: "phone_code", email: item.account_email });
            toast(`收到手机验证码 ${data.code}`);
          }
        } else {
          if (!quiet) {
            addLog(`${item.account_email || item.phone} 暂未收到手机验证码`, "warning", { error_code: "phone_code_missing", email: item.account_email });
            toast("暂未收到手机验证码");
          }
        }
        return { found: Boolean(data.found), data };
      } catch (error) {
        const details = error.details || { error: error.message || "手机取码失败", error_code: "phone_code_fetch_failed" };
        item.status = "error";
        item.last_message = details.error || "手机取码失败";
        item.last_checked_at = new Date().toISOString();
        savePhonePool();
        renderPhonePool();
        if (!quiet) {
          addLog(`${item.account_email || item.phone} 手机取码失败`, "error", {
            error_code: details.error_code || "phone_code_fetch_failed",
            email: item.account_email,
          });
          toast(details.error || "手机取码失败");
        }
        return { found: false, error: details };
      } finally {
        delete item.polling;
        savePhonePool();
        renderPhonePool();
      }
    }

    function saveManualPhoneCodeForSelected() {
      const row = selectedSingleQueueRow();
      if (!row) {
        toast("请先只选中一个队列账号");
        return;
      }
      helpers.openManualCodeDialog(row, "phone");
    }

    async function pollSelectedPhoneCode() {
      const row = selectedSingleQueueRow();
      if (!row) {
        toast("请先只选中一个队列账号");
        return;
      }
      const entry = ensurePhoneEntryForRow(row);
      if (!entry) {
        toast("没有可用手机。请先添加 1 对 1 手机或批量池手机号");
        addLog(`${row.email} 没有可用手机`, "warning", { error_code: "phone_pool_empty", email: row.email });
        return;
      }
      await pollPhoneEntry(entry.id, row.id);
    }

    return {
      normalizePhonePool,
      phoneCodeForRow,
      phonePoolPayload,
      phoneEntryForRow,
      ensurePhoneEntryForRow,
      formatPhoneTime,
      renderPhoneBindingList,
      renderPhonePool,
      validPhoneApiUrl,
      syncPhoneProviderForm,
      verifyPhoneProvider,
      syncPhoneProviderActivations,
      addOrUpdatePhoneEntry,
      importPhoneBatchEntries,
      bindPhoneToSelected,
      removePhoneEntry,
      pollPhoneEntry,
      saveManualPhoneCodeForSelected,
      pollSelectedPhoneCode,
    };
  }

  window.GAM = window.GAM || {};
  window.GAM.refreshPhonePool = { createRefreshPhonePoolHelper };
}());
