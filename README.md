# GPT账号管理助手

演示地址：<https://mail.wsphl.cfd/>

仓库地址：<https://github.com/margetrp-hub/gpt-account-manager>

我做这个项目，不是为了让管理员先把一堆凭证放到服务器里，然后只给某一个人用。它更像一个批量账号管理工作台：普通用户自己导入邮箱资料，自己收验证码，自己把需要刷新的账号推进队列；管理员只负责站点维护、临时邮箱提取、CPA 仓管和必要的批量整理。

它现在主要处理几类事情：

- Outlook / Microsoft OAuth 邮箱批量导入和取信。
- 临时邮箱 JWT 批量导入和取信。
- 邮件验证码检索、本地邮件缓存、搜索、复制和本地删除。
- 账号分组、封禁/异常标记、刷新队列管理。
- CPA / CLIProxyAPI 仓管巡检，识别 RT 失效、会话失效、封禁、风控、额度耗尽、非 OpenAI 凭证等状态。
- OpenAI OAuth 凭证刷新，并导出 CPA / Sub2API 可用的 auth JSON。
- 确定失败账号一键清理：从 CPA、当前工作区邮箱池、刷新队列一起移除。
- 长效手机接码池：手机号和 API URL 绑定到单个账号，遇到手机验证时可以独立取码和留痕。

## 我希望它解决的问题

批量账号维护最烦的地方不是某一个 API 调不通，而是流程散在很多地方：邮箱资料在一处，临时邮箱 JWT 在一处，CPA 里又是一批 auth file，刷新失败以后还要再判断到底是邮箱没收到码、RT 失效、账号封禁、地区受限还是额度耗尽。

这个工具想把这些步骤压到一个清楚的工作流里：

- 收信链路和刷新链路分开，临时邮箱和微软邮箱也分开，不互相污染。
- 每个错误尽量归类成人能处理的原因，而不是只扔一段英文堆栈。
- 普通用户的数据默认留在当前浏览器，不因为多人使用同一个 VPS 就串到一起。
- 真正需要服务端帮忙的流程，用 `X-Workspace-Id` 做工作区隔离。
- CPA 仓管不是只扫 401，而是尽量告诉你这个账号现在到底是什么状态。

## 技术架构

- 后端是单进程 Python HTTP 服务，基于 `ThreadingHTTPServer`，负责静态页面、客户端 API、管理员 API、CPA 对接、OAuth 协议流程和自检。
- 前端是原生 HTML / CSS / JavaScript，没有前端构建步骤，部署时直接解压即可运行。
- 浏览器优先保存数据：邮箱资料、分类、邮件缓存、忽略列表、CPA 设置默认保存在 `localStorage`。
- 服务端工作区隔离：普通客户端调用服务端辅助 API 时，会发送浏览器生成的 `ctgptm.workspaceId`，服务端写入 `data/workspaces/<workspace-id>/`。
- 邮箱链路独立：Microsoft 账号走 Graph / OAuth / IMAP 相关逻辑；临时邮箱走 Cloudflare Temp Email Worker 兼容 API。
- CPA 仓管链路独立：通过目标 CPA 管理端点扫描、诊断、删除或替换 auth file，管理密钥不写入本工具服务端文件。
- OAuth 刷新链路使用后端协议状态机，生成 CPA / Sub2API 可用的 auth JSON；刷新时要求显式填写代理 URL，避免误用 VPS 默认出口。
- 自检、管理员页和管理员 API 在设置 `MAIL_PICKUP_ADMIN_TOKEN` 后变成私有入口。

## 页面说明

- `/`：账号管理台，导入邮箱、收信、查码、分组、删除本地缓存、推送刷新队列。
- `/refresh.html`：凭证刷新队列，处理邮箱登录账号、CPA 同步、auth JSON 导出。
- `/warehouse.html`：CPA 仓管，扫描异常账号、删除失效 auth、查看诊断原因。
- `/converter.html`：本地 Session / auth JSON 转换工具。
- `/login.html`：管理员登录页，写入 HttpOnly cookie，并可在当前浏览器记住 token。
- `/admin.html`：管理员临时邮箱 JWT 提取和公共池导出辅助页。
- `/health.html`：部署自检页，公共部署时需要管理员 token/cookie。

## 数据边界

前台收信默认不把用户邮箱资料写进服务器全局文件。普通用户导入的 Outlook 密码、client_id、refresh_token、临时邮箱 JWT、分类、邮件缓存和本地删除记录，都优先保存在当前浏览器。

当用户使用服务端辅助能力时，数据按工作区保存：

```text
data/workspaces/<workspace-id>/accounts.json
data/workspaces/<workspace-id>/temp_addresses.json
data/workspaces/<workspace-id>/messages.json
data/workspaces/<workspace-id>/refresh_results.json
data/workspaces/<workspace-id>/login_history.json
```

管理员 `/api/*` 和 `/admin-api/*` 仍然是全局运维面，必须用 `MAIL_PICKUP_ADMIN_TOKEN` 保护。不要把管理员 token 发给普通用户。

## 快速运行

Docker 运行：

```bash
cp .env.example .env
# 编辑 .env，把 MAIL_PICKUP_ADMIN_TOKEN 换成 `openssl rand -hex 32` 生成的长随机令牌
docker compose up -d --build
```

已有旧 VPS 部署时，可以用迁移脚本把 `/opt/ctgptm-mail-assistant` 和旧环境变量平移到 Docker：

```bash
sudo bash deploy/migrate-systemd-to-docker.sh
```

需要网页里点击升级时，启用宿主机升级 agent：

```bash
sudo cp deploy/gpt-account-manager-upgrade-agent.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gpt-account-manager-upgrade-agent.timer
```

打开：

```text
http://127.0.0.1:8765/
```

本地直接运行：

```bash
python3 server.py
```

打开：

```text
http://127.0.0.1:8765/
```

Windows 开发环境：

```powershell
cd D:\wiki\tools\gpt-account-manager
py -3 server.py
```

## 环境变量

最小配置：

```bash
MAIL_PICKUP_HOST=127.0.0.1
MAIL_PICKUP_PORT=8765
MAIL_PICKUP_ADMIN_TOKEN=replace-with-a-long-random-token
GPT_ACCOUNT_MANAGER_APP_TITLE=GPT账号管理助手
GPT_ACCOUNT_MANAGER_TEMP_WORKER_URL=https://your-temp-worker.example
MAIL_PICKUP_LOGIN_STRATEGY=protocol
MAIL_PICKUP_NODE_BIN=node
```

可选配置：

```bash
# 如果临时邮箱 Worker 设置了站点口令
# GPT_ACCOUNT_MANAGER_TEMP_SITE_PASSWORD=

# 管理员公共池推送，不配置时只生成可复制 JSON
# GPT_ACCOUNT_MANAGER_PUBLIC_POOL_API_URL=https://your-public-pool.example/api/import
# GPT_ACCOUNT_MANAGER_PUBLIC_POOL_TOKEN=optional-pool-token

# 只有需要连接内网、局域网、容器私网 CPA 管理端点时再开启
# MAIL_PICKUP_CPA_ALLOW_REMOTE=1

# 协议登录辅助
# MAIL_PICKUP_FETCH_CONCURRENCY=8
# MAIL_PICKUP_CHATGPT_LOGIN_URL=https://chatgpt.com/auth/login
# OPENAI_OAUTH_REDIRECT_URI=http://localhost:1455/auth/callback
# OPENAI_OAUTH_REFRESH_SCOPE=openid profile email
```

刷新流程会调用 `openai_sentinel_token.cjs`，所以部署机需要有 `node`。如果使用 `socks4://` 或 `socks5://` 代理，还需要安装 PySocks：

```bash
sudo apt-get update
sudo apt-get install -y python3-socks
sudo npm install --omit=dev --cache /tmp/gpt-account-manager-npm-cache --no-audit --no-fund
```

## VPS 部署

推荐 Python 服务只监听 `127.0.0.1:8765`，外部流量由 Nginx 或其它反向代理转发。

```bash
sudo unzip -o gpt-account-manager-*.zip -d /opt/ctgptm-mail-assistant
sudo chown -R www-data:www-data /opt/ctgptm-mail-assistant
sudo systemctl restart ctgptm-mail-assistant
sudo systemctl status ctgptm-mail-assistant --no-pager
```

历史部署路径里仍然保留 `ctgptm-mail-assistant`，是为了兼容已有 VPS 和浏览器 localStorage，不代表公开项目名。

## API 边界

- `POST /client-api/fetch`：当前浏览器提交邮箱资料并取信，不写入全局账号池。
- `POST /client-api/messages/delete`：删除/隐藏本地缓存邮件，不删除远端邮箱真实邮件。
- `POST /client-api/cpa/scan-401`：扫描 CPA/CLIProxyAPI 管理端点，并诊断异常凭证原因。
- `POST /client-api/cpa/repair-401`：对选中 CPA auth file 执行修复或删除。
- `POST /admin-api/extract-jwts`：管理员临时邮箱 JWT 提取，需要 `MAIL_PICKUP_ADMIN_TOKEN`。

## 开源边界

发布包和仓库不应该包含：

- `data/`
- `.cache/`
- `.ssh/`
- `node_modules/`
- `output/`
- `release/`
- 真实 `.env`
- 邮箱密码、refresh_token、JWT、CPA management key、代理密码、管理员 token

## 致谢

这个项目做的时候参考过一些朋友的开源思路，尤其是 ChatGPT session 处理、CPA/Sub2API auth 转换和账号运维工具这几块。感谢：

- [maowuzz/chatgpt-session-forge](https://github.com/maowuzz/chatgpt-session-forge)
- [gtxx3600/GPTSession2CPAandSub2API](https://github.com/gtxx3600/GPTSession2CPAandSub2API)

本仓库没有 vendoring 或直接复制这些项目，核心流程是围绕浏览器优先的账号管理、邮箱接码、CPA 仓管和 OAuth 刷新重新组织的。
