# GPT账号管理助手 API 文档

这份文档只覆盖当前仓库已经稳定开放的接口，重点是工作区隔离、邮件缓存查询、验证码读取和管理员能力边界。

## 认证与工作区

### 普通客户端 API

- 使用 `X-Workspace-Id` 指定当前工作区。
- 浏览器端默认会自动生成并记住 `ctgptm.workspaceId`。
- 如果要切回某个工作区，可在页面 URL 上附带 `?force_workspace=ws_xxx`。

### 管理员 API

- `/admin-api/*` 和 `/api/*` 仍然属于管理员或运维面。
- 需要 `MAIL_PICKUP_ADMIN_TOKEN`，或先通过 `/login.html` 写入管理员 cookie/token。

## 邮件与验证码

### `GET /client-api/messages`

读取当前工作区邮件缓存。

常用查询参数：

- `query`
- `sender`
- `source=all|microsoft|temp|generic`
- `mail_type=all|verification|invite|security|promotion|banned|other`
- `account=user@example.com`
- `limit`
- `offset`

### `POST /client-api/messages/delete`

删除当前工作区的本地缓存邮件，不删除远端真实邮箱邮件。

### `GET /client-api/mail-code`

按指定邮箱读取当前工作区里最新的验证码。

查询参数：

- `email` 或 `account`
- `live=1`：先触发一次当前工作区邮箱取信，再从缓存中提取验证码
- `provider=auto|graph|imap`
- `source=all|microsoft|temp|generic`
- `sender`
- `query`
- `category`
- `limit`

示例：

```http
GET /client-api/mail-code?email=user@example.com&live=1&provider=auto HTTP/1.1
X-Workspace-Id: ws_demo123456
```

返回：

```json
{
  "success": true,
  "workspace_id": "ws_demo123456",
  "email": "user@example.com",
  "found": true,
  "code": "654321",
  "codes": ["654321"],
  "message_count": 3,
  "latest_message": {
    "account": "user@example.com",
    "sender": "noreply@openai.com",
    "subject": "Your verification code",
    "received_at": "2026-07-07T12:00:00Z",
    "provider": "graph",
    "mail_type": "verification",
    "codes": ["654321"],
    "preview": "Use 654321 to continue"
  },
  "source_mode": "live"
}
```

### `POST /client-api/mail-code`

和 `GET /client-api/mail-code` 语义一致，适合服务端或脚本通过 JSON 方式调用。

示例：

```json
{
  "email": "user@example.com",
  "live": true,
  "provider": "graph",
  "source": "microsoft",
  "limit": 20
}
```

### `GET /api/mail-code`

管理员/运维面版本，要求管理员认证。

适用于：

- 自动化脚本
- 内部运维面板
- 独立插件或独立域名页面调用当前工作区验证码

## 取信与刷新

### `POST /client-api/fetch`

当前浏览器携带邮箱资料直接取信，不写入全局账号池。

### `POST /client-api/fetch-start`

启动后台取信任务。

### `GET /client-api/fetch-status`

轮询后台取信任务状态。

## 工作区

### `GET /client-api/workspaces/recover`

按工作区 ID 查询服务器摘要。

### `POST /client-api/workspaces/recovery-password`

给当前工作区设置恢复密码。

### `POST /client-api/workspaces/recover-by-password`

通过工作区恢复密码找回工作区。

## 订阅与账号

### `POST /client-api/accounts/check-subscription`

对当前工作区中的账号做在线订阅核验。

## 管理员能力

### `POST /admin-api/extract-jwts`

管理员临时邮箱 JWT 提取。

### `POST /admin-api/public-pool/push`

推送公共池。

### `POST /admin-api/upgrade/request`

请求宿主机执行同步升级。
