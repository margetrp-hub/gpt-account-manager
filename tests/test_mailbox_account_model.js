const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const sandbox = { window: {}, console };
vm.runInNewContext(
  fs.readFileSync("static/shared/mailbox-account-model.js", "utf8"),
  sandbox,
  { filename: "mailbox-account-model.js" },
);

const model = sandbox.window.GAM.mailboxAccountModel.createMailboxAccountModel({
  serviceLabels: { microsoft: "Outlook", temp: "Temporary", generic: "Generic" },
});

const directMicrosoft = model.normalizeStoredAccount({
  id: "microsoft:user@outlook.com",
  source: "microsoft",
  email: "user@outlook.com",
  jwt: "eyJhbGciOiJIUzI1NiJ9.payload.signature",
  client_id: "9e5f94bc-e8a4-4e73-b8be-63364c29d753",
  refresh_token: "M.C558_example_refresh_token_value",
});
assert.equal(directMicrosoft.source, "microsoft");
assert.equal(directMicrosoft.id, "microsoft:user@outlook.com");
assert.equal(directMicrosoft.client_id, "9e5f94bc-e8a4-4e73-b8be-63364c29d753");

const repairedLegacyMicrosoft = model.normalizeStoredAccount({
  id: "temp:legacy@outlook.com",
  source: "temp",
  email: "legacy@outlook.com",
  jwt: "legacy-password",
  category: "9e5f94bc-e8a4-4e73-b8be-63364c29d753",
  site_password: "M.C558_example_refresh_token_value",
});
assert.equal(repairedLegacyMicrosoft.source, "microsoft");
assert.equal(repairedLegacyMicrosoft.password, "legacy-password");
assert.equal(repairedLegacyMicrosoft.refresh_token, "M.C558_example_refresh_token_value");

const tempMailbox = model.normalizeStoredAccount({
  source: "temp",
  email: "temporary@example.com",
  jwt: "eyJhbGciOiJIUzI1NiJ9.payload.signature",
});
assert.equal(tempMailbox.source, "temp");

console.log("mailbox-account-model tests passed");
