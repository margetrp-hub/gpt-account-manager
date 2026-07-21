(function initRefreshErrors() {
  function createRefreshErrors(config = {}) {
    const errorManual = config.errorManual || {};
    const logStepLabels = config.logStepLabels || {};

    function errorCodeLabel(code) {
      return errorManual[String(code || "")] || String(code || "login_failed");
    }

    function inferErrorCode(job = {}) {
      const current = String(job.error_code || job.code || "").trim();
      if (current && current !== "login_failed") return current;
      const text = `${job.error || ""} ${job.error_hint || ""} ${job.message || ""}`.toLowerCase();
      if (!text.trim()) return current || "";
      if (/phone verification|phone number|mobile|mfa|required phone|手机验证|手机号|手机号码/.test(text)) return "phone_verification_required";
      if (/deactivated|disabled|banned|suspended|deleted account|account deleted|账号被封|账号封禁|账号停用|已停用|被禁用/.test(text)) return "account_banned";
      if (/invalid verification code|invalid email code|invalid otp|incorrect code|code expired|expired code|email code verify failed|验证码无效|验证码错误|验证码已过期|验证码过期/.test(text)) return "verification_code_invalid";
      if (/no verification code|verification code was found|未收到验证码|没有收到验证码|取不到验证码/.test(text)) return "verification_code_missing";
      if (/user not found|account not found|no account|账号不存在|账户不存在/.test(text)) return "account_not_found";
      if (/turnstile|security verification|cloudflare|csrf|access denied|risk|风控|安全验证/.test(text)) return "risk_blocked";
      if (/dns|name resolution|name or service not known|getaddrinfo|解析失败/.test(text)) return "dns_failed";
      if (/interaction_required|consent_required|login_required|authorization_pending|aadsts65001|aadsts50076|aadsts50078/.test(text)) return "outlook_reauth_required";
      if (/(insufficient_scope|imap\.accessasuser\.all|mail\.read)/.test(text) && /(scope|graph|imap|oauth|token failed|permission|forbidden)/.test(text)) return "outlook_scope_missing";
      if (/graph token failed|graph 授权/.test(text)) return "graph_token_failed";
      if (/imap token failed|imap 授权/.test(text)) return "imap_token_failed";
      if (/graph fetch failed|graph 收信/.test(text)) return "graph_fetch_failed";
      if (/imap fetch failed|imap 收信/.test(text)) return "imap_fetch_failed";
      if (/invalid address credential|jwt.*无效|临时邮箱 jwt 无效/.test(text)) return "temp_invalid_credential";
      if (/unexpected_eof_while_reading|eof occurred in violation of protocol|代理 tls|ssl.*eof|tls.*eof/.test(text)) return "proxy_tls_eof";
      if (/timed out|timeout|超时|winerror 10060|没有正确答复|连接尝试失败/.test(text)) return "proxy_timeout";
      if (/proxy|代理|connection reset|connection refused|remote end closed|without response|tunnel connection failed|socks/.test(text)) return "proxy_connection_failed";
      if (/incompleteread|incomplete read|connection closed|eof|network|ssl|连接中途断开|网络/.test(text)) return "network_incomplete_read";
      if (/unauthorized|401/.test(text)) return "authorization_failed";
      if (/invalid authorization|invalid_auth_step/.test(text)) return "oauth_invalid_auth_step";
      return current || "login_failed";
    }

    function compactText(value, max = 120) {
      const clean = String(value || "")
        .replace(/https?:\/\/\S+/g, "[link]")
        .replace(/\s+/g, " ")
        .trim();
      return clean.length > max ? `${clean.slice(0, max)}...` : clean;
    }

    function compactLogMessage(message, meta = {}) {
      const email = meta.email || String(message || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
      const step = String(meta.step || "");
      const rawCode = String(meta.error_code || meta.code || "");
      const code = rawCode || meta.log_type === "error"
        ? inferErrorCode({
          error_code: rawCode,
          error: message,
          error_hint: meta.error_hint || meta.hint || "",
        })
        : "";
      if (code) return `${email ? `${email} ` : ""}${errorCodeLabel(code)}`;
      if (step && errorManual[step]) return `${email ? `${email} ` : ""}${errorCodeLabel(step)}`;
      if (step && logStepLabels[step]) {
        if (step === "egress") {
          const ip = String(message || "").match(/ip=([0-9a-fA-F:.]+)/)?.[1] || "";
          return `${email ? `${email} ` : ""}${logStepLabels[step]}${ip ? `：${ip}` : ""}`;
        }
        if (step === "mail_code_poll" || step === "mail_code_missing") {
          const detail = compactText(
            String(message || "")
              .replace(/^邮箱验证码查收结束，仍未找到可提交的 6 位验证码：?/, "")
              .replace(/^邮箱验证码查收：?/, "")
              .replace(/^查收邮箱：?/, ""),
            140,
          );
          return `${email ? `${email} ` : ""}${logStepLabels[step]}${detail ? `：${detail}` : ""}`;
        }
        return `${email ? `${email} ` : ""}${logStepLabels[step]}`;
      }
      if (step) return `${email ? `${email} ` : ""}处理进度`;
      return compactText(message, 140);
    }

    function isCodePickupError(code, text = "") {
      const rawCode = String(code || "").toLowerCase();
      const rawText = String(text || "").toLowerCase();
      return rawCode === "verification_code_missing"
        || rawCode === "email_code_missing"
        || rawCode === "otp_missing"
        || rawText.includes("verification code")
        || rawText.includes("no verification code")
        || rawText.includes("验证码")
        || rawText.includes("接码");
    }

    function isPhoneVerificationError(code, text = "") {
      const rawCode = String(code || "").toLowerCase();
      const rawText = String(text || "").toLowerCase();
      return rawCode === "phone_verification_required"
        || rawCode === "phone_2fa_failed"
        || rawCode === "mfa_required"
        || rawText.includes("phone verification")
        || rawText.includes("phone number")
        || rawText.includes("mobile")
        || rawText.includes("手机号")
        || rawText.includes("手机验证")
        || rawText.includes("二次验证")
        || rawText.includes("手机号码")
        || rawText.includes("接手机验证码");
    }

    function formatJobError(job) {
      const code = inferErrorCode(job);
      if (code) return errorCodeLabel(code);
      const detail = compactText(job.error_hint || job.error || "", 90);
      if (detail) return errorCodeLabel("login_failed");
      return "-";
    }

    return {
      errorCodeLabel,
      inferErrorCode,
      compactText,
      compactLogMessage,
      isCodePickupError,
      isPhoneVerificationError,
      formatJobError,
    };
  }

  window.GAM = window.GAM || {};
  window.GAM.refreshErrors = { createRefreshErrors };
}());
