(() => {
  const base = window.GAM?.base;
  const workspaceId = base?.resolveWorkspaceId?.("ctgptm.workspaceId")
    || localStorage.getItem("ctgptm.workspaceId")
    || "ws_demo";
  const origin = window.location.origin;
  const sampleEmail = "user@example.com";
  const sampleToken = "<admin-token-optional>";

  const els = {
    curlGet: document.querySelector("#apiCurlGet"),
    curlPost: document.querySelector("#apiCurlPost"),
    jsExample: document.querySelector("#apiJsExample"),
    copyCurlGet: document.querySelector("#copyApiCurlGet"),
    copyCurlPost: document.querySelector("#copyApiCurlPost"),
    copyJs: document.querySelector("#copyApiJs"),
    toast: document.querySelector("#toast"),
  };

  function toast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(els.toast._timer);
    els.toast._timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  async function copyText(value) {
    await navigator.clipboard.writeText(value);
    toast("已复制");
  }

  const curlGet = [
    `curl -G "${origin}/client-api/mail-code" \\`,
    `  -H "X-Workspace-Id: ${workspaceId}" \\`,
    `  --data-urlencode "email=${sampleEmail}" \\`,
    `  --data-urlencode "live=1" \\`,
    `  --data-urlencode "provider=auto"`,
  ].join("\n");

  const curlPost = [
    `curl -X POST "${origin}/api/mail-code" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Authorization: Bearer ${sampleToken}" \\`,
    `  -H "X-Workspace-Id: ${workspaceId}" \\`,
    `  -d '{`,
    `    "email": "${sampleEmail}",`,
    `    "live": true,`,
    `    "provider": "graph"`,
    `  }'`,
  ].join("\n");

  const jsExample = [
    `const response = await fetch("${origin}/client-api/mail-code", {`,
    `  method: "POST",`,
    `  headers: {`,
    `    "Content-Type": "application/json",`,
    `    "X-Workspace-Id": "${workspaceId}"`,
    `  },`,
    `  body: JSON.stringify({`,
    `    email: "${sampleEmail}",`,
    `    live: true,`,
    `    provider: "auto"`,
    `  })`,
    `});`,
    `const data = await response.json();`,
    `console.log(data.code, data.codes, data.latest_message);`,
  ].join("\n");

  setText(els.curlGet, curlGet);
  setText(els.curlPost, curlPost);
  setText(els.jsExample, jsExample);

  els.copyCurlGet?.addEventListener("click", () => copyText(curlGet));
  els.copyCurlPost?.addEventListener("click", () => copyText(curlPost));
  els.copyJs?.addEventListener("click", () => copyText(jsExample));
})();
