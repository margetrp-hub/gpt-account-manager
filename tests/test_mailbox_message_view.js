const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const sandbox = { window: {}, console };
vm.runInNewContext(
  fs.readFileSync("static/shared/mailbox-message-view.js", "utf8"),
  sandbox,
  { filename: "mailbox-message-view.js" },
);

const view = sandbox.window.GAM.mailboxMessageView.createMailboxMessageView({
  typeLabels: { verification: "Verification", other: "Other" },
  emptyCategoryLabel: "Ungrouped",
  normalizeMailType: (value) => value || "other",
  normalizePlainMailBody: (value) => String(value || ""),
  escapeHtml: (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;"),
});

const normalMail = view.renderDetailHtml({
  subject: "Secure sign-in link",
  sender: "no-reply@example.test",
  account: "user@outlook.com",
  received_at: "2026-07-26T06:50:19Z",
  mail_type: "other",
  body: "Sign in with the secure link below",
  html_body: '<p>Sign in <a href="https://example.test/login">here</a></p>',
  codes: [],
});

assert.equal(normalMail.hasHtmlBody, true);
assert.match(normalMail.html, /mail-html-frame/);
assert.doesNotMatch(normalMail.html, /\u8fd9\u5c01\u90ae\u4ef6\u6ca1\u6709\u8bc6\u522b\u5230\u9a8c\u8bc1\u7801/);
assert.match(normalMail.frameSrcdoc, /<a href="https:\/\/example\.test\/login">here<\/a>/);
assert.equal(
  view.mailKey({ source: "MICROSOFT", account: "User@Outlook.com", folder: "Inbox", mid: "1" }),
  view.mailKey({ source: "microsoft", account: "user@outlook.com", folder: "inbox", mid: "1" }),
);

const verificationMail = view.renderDetailHtml({
  subject: "Verification",
  mail_type: "verification",
  body: "No numeric code was found",
  codes: [],
});
assert.match(verificationMail.html, /\u8fd9\u5c01\u90ae\u4ef6\u6ca1\u6709\u8bc6\u522b\u5230\u9a8c\u8bc1\u7801/);

console.log("mailbox-message-view tests passed");
