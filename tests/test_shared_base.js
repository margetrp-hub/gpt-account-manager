const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

function createDocument() {
  const cookies = new Map();
  return {
    title: "Inbox",
    get cookie() {
      return Array.from(cookies, ([key, value]) => `${key}=${value}`).join("; ");
    },
    set cookie(value) {
      const [pair] = String(value).split(";");
      const separator = pair.indexOf("=");
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    },
  };
}

const localStorage = createStorage();
const document = createDocument();
const location = {
  protocol: "https:",
  search: "",
  href: "https://mail.example.test/",
};
const sandbox = {
  window: {
    location,
    history: { replaceState() {} },
  },
  document,
  localStorage,
  crypto: { randomUUID: () => "11111111-2222-3333-4444-555555555555" },
  URL,
  URLSearchParams,
  console,
  setTimeout,
  clearTimeout,
};

vm.runInNewContext(
  fs.readFileSync("static/shared/base.js", "utf8"),
  sandbox,
  { filename: "base.js" },
);

const base = sandbox.window.GAM.base;
const originalWorkspace = "ws_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const forcedWorkspace = "ws_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

base.rememberWorkspaceId(originalWorkspace);
assert.match(document.cookie, new RegExp(`ctgptm_workspace_id=${originalWorkspace}`));

localStorage.clear();
assert.equal(base.resolveWorkspaceId(), originalWorkspace);
assert.equal(localStorage.getItem("ctgptm.workspaceId"), originalWorkspace);

location.search = `?force_workspace=${forcedWorkspace}`;
location.href = `https://mail.example.test/${location.search}`;
assert.equal(base.resolveWorkspaceId(), forcedWorkspace);
assert.match(document.cookie, new RegExp(`ctgptm_workspace_id=${forcedWorkspace}`));

localStorage.clear();
location.search = "";
location.href = "https://mail.example.test/";
assert.equal(base.getWorkspaceId(), forcedWorkspace);

console.log("shared base workspace persistence tests passed");
