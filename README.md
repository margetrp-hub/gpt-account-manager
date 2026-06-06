# GPT账号管理助手

演示地址：<https://mail.wsphl.cfd/>

仓库地址：<https://github.com/margetrp-hub/gpt-account-manager>

交流群：QQ 群 `260789529`，欢迎大家进群交流项目使用、部署、邮箱通道和问题反馈。

![AI 分享群 QQ 群二维码](docs/images/qq-group-qrcode.jpg)

## 1.0.1 当前版本说明

- `1.0.1` 主要补的是一个交互细节：如果之前全选了一批邮箱，后来又通过搜索或筛选把列表缩小，点击“收取邮件”现在会优先只处理当前可见范围，不再把隐藏邮箱一起收一遍。
- 这是项目 `1.0.x` 阶段的持续修补版本，核心工作流已经从“原型堆功能”走到了“可以长期部署和持续维护”的阶段。
- 收信入口已经覆盖 Outlook / Microsoft、临时邮箱 JWT、其他 IMAP / POP3 邮箱三条主链路，页面命名、导入格式和错误分类也统一到了同一套交互里。
- 刷新流程以协议状态机为主，围绕邮箱验证码、手机验证码、手动填码、终止任务、失败分类和 CPA 同步做了连续整理，方便把批量问题压回到可处理的步骤。
- 工作区数据隔离、服务端邮件缓存、风险仪表盘、邮箱管理台、CPA 仓管、Docker Compose 部署和同步升级入口，已经组成了一套完整的账号维护工作台。
- 这一版重点不在再塞更多入口，而在把已有链路收稳：数据不串、页面职责更清楚、更新可部署、错误更容易诊断，后面会继续按模块拆分和增强。

我做这个项目，不是为了让管理员先把一堆凭证放到服务器里，然后只给某一个人用。它更像一个批量账号管理工作台：普通用户自己导入邮箱资料，自己收验证码，自己把需要刷新的账号推进队列；管理员只负责站点维护、临时邮箱提取、CPA 仓管和必要的批量整理。

它现在主要处理几类事情：

- Outlook / Microsoft Graph + IMAP 邮箱批量导入和取信。
- 临时邮箱 JWT 批量导入和取信。
- 其他邮箱 IMAP / POP3 导入和取信：163、QQ、iCloud、Gmail、Yahoo 等，只要资料完整就按同一套邮箱链路处理。
- 邮件验证码检索、服务端工作区邮件缓存、搜索、复制和本地删除。
- 账号分组、封禁/异常标记、刷新队列管理。
- 封禁邮件和异常邮件仪表盘，方便看每天收到多少封禁、风控、验证码和其他提醒。
- 右上角中英文界面切换，语言选择保存在当前浏览器。
- CPA / CLIProxyAPI 仓管巡检，识别 RT 失效、会话失效、封禁、风控、额度耗尽、非 OpenAI 凭证等状态。
- OpenAI OAuth 凭证刷新，并导出 CPA / Sub2API 可用的 auth JSON。
- 确定失败账号一键清理：从 CPA 和刷新队列移除，不删除邮箱管理里的邮箱资料。
- 长效手机接码池：手机号和 API URL 绑定到单个账号，遇到手机验证时可以独立取码和留痕。
- Docker Compose 部署和同步升级入口，方便 VPS 保持持久化数据并稳定更新。

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
- 浏览器优先保存轻量资料：邮箱资料、分类、忽略列表、CPA 设置默认保存在 `localStorage`；完整邮件正文和 HTML 写入服务端工作区缓存，避免浏览器存储超额。
- 服务端工作区隔离：普通客户端调用服务端辅助 API 时，会发送浏览器生成的 `ctgptm.workspaceId`，服务端写入 `data/workspaces/<workspace-id>/`。
- 邮箱链路独立：Microsoft 账号走 Graph / IMAP 取信链路；临时邮箱走 Cloudflare Temp Email Worker 兼容 API；其他邮箱走 IMAP / POP3 配置化取信。
- CPA 仓管链路独立：通过目标 CPA 管理端点扫描、诊断、删除或替换 auth file，管理密钥不写入本工具服务端文件。
- OAuth 刷新链路使用后端协议状态机，生成 CPA / Sub2API 可用的 auth JSON；刷新时要求显式填写代理 URL，避免误用 VPS 默认出口。
- 自检、管理员页和管理员 API 在设置 `MAIL_PICKUP_ADMIN_TOKEN` 后变成私有入口。

## 页面说明

- `/`：账号管理台，导入邮箱、收信、查码、分组、删除本地缓存、推送刷新队列。
- `/mailboxes.html`：邮箱管理台，集中整理 Outlook 四段、临时邮箱 JWT 和其他邮箱资料，支持批量导入、搜索筛选、分组、复制、一行一个邮箱的 TXT 导出、JSON 备份和删除。
- `/refresh.html`：凭证刷新队列，处理邮箱登录账号、CPA 同步、auth JSON 导出。
- `/warehouse.html`：CPA 仓管，扫描异常账号、删除失效 auth、查看诊断原因。
- `/converter.html`：本地 Session / auth JSON 转换工具。
- `/login.html`：管理员登录页，写入 HttpOnly cookie，并可在当前浏览器记住 token。
- `/admin.html`：管理员临时邮箱 JWT 提取和公共池导出辅助页。
- `/health.html`：部署自检页，公共部署时需要管理员 token/cookie。

## 界面截图

下面是实际页面渲染后的脱敏截图，邮箱、token、代理和账号标识都已经打码。

### 账号管理台

![账号管理台](docs/screenshots/account-workbench-masked.png)

### 风险仪表盘

![风险仪表盘](docs/screenshots/dashboard-overview-masked.png)

### 邮箱管理

![邮箱管理页](docs/screenshots/mailbox-manager-masked.png)

### 凭证刷新

![凭证刷新工作台](docs/screenshots/refresh-workbench-masked.png)

### CPA 仓管

![CPA 仓管](docs/screenshots/cpa-warehouse-masked.png)

### Session 转换

![Session 转换](docs/screenshots/converter-workbench-masked.png)

### 部署自检

![部署自检](docs/screenshots/health-check-masked.png)

## 后续优化路线图

这些是接下来最值得优先做的方向，重点不是堆更多按钮，而是提高批量刷新成功率、降低误判、让错误可以被直接处理。

- 收信 Provider 层独立：把 Outlook Graph、Outlook IMAP、临时邮箱 CF API、163、QQ、iCloud、Gmail、Yahoo、普通 IMAP / POP3 都整理成统一接口，分别负责校验、取信和验证码提取。
- 刷新任务状态机：每个账号固定走 `待执行 -> 检查邮箱 -> 等待验证码 -> 提交验证码 -> 生成凭证 -> 同步 CPA -> 完成/失败`，支持暂停、终止、重试、跳过和页面重开后的进度恢复。
- 错误原因标准化：主界面只显示邮箱不可用、未收到验证码、验证码无效、需要手机验证、账号封禁、额度耗尽、OAuth 会话失效、CPA 同步失败、网络连接失败等可处理类型；原始错误放到展开详情。
- 邮箱库和刷新队列继续强隔离：邮箱管理页是长期资产库，刷新页只是本次任务队列；刷新页删除只能删队列，不动邮箱库。
- 导入前邮箱校验：新导入邮箱先进入待验证，按并发池检查收信能力，通过后再推入刷新队列，失败自动进入错误邮箱分组。
- CPA 仓管巡检报告：统计 FREE、PLUS、TEAM、PROX5、PROX20 数量，同时展示可刷新、失败、封禁、需要手机验证和未巡检数量。
- 验证码交互优化：邮箱验证码和手机验证码都走“自动优先，手动兜底”，超时后在账号行显示小的手动填码入口，不长期占住前台。
- 邮件缓存升级：邮件正文、HTML、收信结果、封禁统计逐步迁到 SQLite，前端只分页读取，避免浏览器 localStorage 容量问题。
- 收信进度更准确：批量收信显示 `13/215` 这类进度，并标明当前邮箱、新邮件数量、是否找到验证码；单个邮箱失败不影响整批继续跑。
- 封禁和风控仪表盘增强：按天统计封禁邮件、验证码邮件、风控提醒、异常邮箱和刷新成功率，方便判断当天是邮箱池问题还是账号池问题。

## 数据边界

前台收信默认不把用户邮箱资料写进服务器全局文件。普通用户导入的 Outlook 密码、client_id、refresh_token、临时邮箱 JWT、分类和本地删除记录，都优先保存在当前浏览器；完整邮件正文和 HTML 会按工作区写入服务端缓存，前端只分页读取当前结果。

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

# 可选：启用整站登录保护。开启后普通工作台页面也需要先用 MAIL_PICKUP_ADMIN_TOKEN 登录。
# GPT_ACCOUNT_MANAGER_REQUIRE_LOGIN=1
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
