# GPT账号管理助手 VPS 部署说明

这份文档按通用 VPS 部署来写。旧版本里用过的 `/opt/ctgptm-mail-assistant`、`ctgptm-mail-assistant.service` 等路径继续保留，是为了兼容已有机器，不代表公开项目名。

下面示例统一使用：

```text
example.com
```

部署时替换成你自己的域名。

## 1. 部署结构

推荐路径：

```bash
/opt/ctgptm-mail-assistant
/etc/ctgptm-mail-assistant.env
/etc/systemd/system/ctgptm-mail-assistant.service
/etc/nginx/sites-available/gpt-account-manager
```

服务逻辑：

- Nginx 对外监听你的域名。
- Python 服务只监听 `127.0.0.1:8765`。
- 普通用户页面 `/` 默认把邮箱资料保存在当前浏览器。
- 临时邮箱走 Cloudflare Temp Email Worker 兼容 API。
- Microsoft 邮箱走独立的 Microsoft OAuth / Graph / IMAP 链路。
- 管理员页 `/admin.html`、自检页 `/health.html` 都需要 `MAIL_PICKUP_ADMIN_TOKEN`。

## 2. 准备服务器

Debian/Ubuntu：

```bash
sudo apt update
sudo apt install -y python3 nodejs npm nginx certbot python3-certbot-nginx unzip python3-socks
```

确认域名 DNS：

```bash
dig +short example.com
```

这里应该返回你的 VPS 公网 IP。

## 3. Docker 部署

如果你不想写 systemd，可以直接用 Docker Compose：

```bash
git clone https://github.com/margetrp-hub/gpt-account-manager.git
cd gpt-account-manager
cp .env.example .env
nano .env
docker compose up -d --build
```

`.env` 里至少设置：

```bash
MAIL_PICKUP_ADMIN_TOKEN=换成一串长随机令牌
GPT_ACCOUNT_MANAGER_TEMP_WORKER_URL=https://your-temp-worker.example
```

容器会把数据写到当前目录的 `data/`，缓存写到 `.cache/`。升级时保留这两个目录即可：

```bash
git pull
docker compose up -d --build
```

Docker Compose 已显式设置容器 DNS：

```yaml
dns:
  - 1.1.1.1
  - 8.8.8.8
  - 9.9.9.9
```

如果刷新凭证时报 `dns_failed`，先在容器里确认解析：

```bash
cd /opt/gpt-account-manager
sudo docker compose exec gpt-account-manager getent hosts auth.openai.com
sudo docker compose exec gpt-account-manager getent hosts chatgpt.com
sudo docker compose exec gpt-account-manager getent hosts login.microsoftonline.com
```

自用站点如果要显示顶部的商城、中转站、公益站入口，在 `.env` 里填写：

```bash
GPT_ACCOUNT_MANAGER_STORE_URL=https://your-store.example
GPT_ACCOUNT_MANAGER_RELAY_URL=https://your-relay.example
GPT_ACCOUNT_MANAGER_PUBLIC_POOL_URL=https://your-public-pool.example
```

开源默认不填这些值，所以页面顶部不会显示这些外链。

### 启用点击升级

如果希望在 `/health.html` 里点击“请求升级并重启”，需要在宿主机启用升级 agent。这个 agent 不跑在 Web 容器里，只读取 `data/upgrade_request.json`，然后在宿主机执行固定的升级流程：

```bash
cd /opt/gpt-account-manager
sudo cp deploy/gpt-account-manager-upgrade-agent.service /etc/systemd/system/
sudo cp deploy/gpt-account-manager-upgrade-agent.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gpt-account-manager-upgrade-agent.timer
```

以后管理员打开：

```text
https://你的域名/health.html
```

点击“请求升级并重启”后，timer 会在 1 分钟内执行：

```bash
git fetch origin main
git pull --ff-only origin main
docker compose up -d --build --force-recreate
docker image prune -f
docker builder prune -f
```

查看升级 agent 日志：

```bash
sudo journalctl -u gpt-account-manager-upgrade-agent -n 120 --no-pager
```

### 从旧 systemd 部署迁移到 Docker

如果你的云端已经按旧方式跑在 `/opt/ctgptm-mail-assistant`，可以用迁移脚本平移到 Docker。它会做这些事：

- 备份旧目录和 `/etc/ctgptm-mail-assistant.env`。
- 把旧 `data/` 复制到 Docker 目录 `/opt/gpt-account-manager/data`。
- 把旧环境变量复制成 Docker 使用的 `.env`。
- 先构建镜像，健康检查通过后再停用旧 systemd 服务。
- 如果 Docker 启动失败，会尝试回滚并重新启动旧服务。

在新版源码目录里执行：

```bash
sudo bash deploy/migrate-systemd-to-docker.sh
```

迁移成功后，以后升级只需要：

```bash
cd /opt/gpt-account-manager
git pull
docker compose up -d --build
```

旧目录不会自动删除。确认 Docker 稳定后，再手动清理旧备份。

## 4. 上传发布包

上传压缩包到 VPS，例如：

```bash
scp gpt-account-manager-*.zip root@YOUR_VPS_IP:/tmp/
```

解压：

```bash
sudo mkdir -p /opt/ctgptm-mail-assistant
sudo unzip -o /tmp/gpt-account-manager-*.zip -d /opt/ctgptm-mail-assistant
sudo chown -R www-data:www-data /opt/ctgptm-mail-assistant
sudo mkdir -p /opt/ctgptm-mail-assistant/.cache
sudo chown -R www-data:www-data /opt/ctgptm-mail-assistant/.cache
```

安装 Node 依赖：

```bash
cd /opt/ctgptm-mail-assistant
sudo npm install --omit=dev --cache /tmp/gpt-account-manager-npm-cache --no-audit --no-fund
```

## 5. 配置环境变量

复制模板：

```bash
sudo cp /opt/ctgptm-mail-assistant/deploy/mail-pickup.env.example /etc/ctgptm-mail-assistant.env
sudo nano /etc/ctgptm-mail-assistant.env
```

至少修改：

```bash
MAIL_PICKUP_ADMIN_TOKEN=换成一串长随机令牌
GPT_ACCOUNT_MANAGER_APP_TITLE=GPT账号管理助手
GPT_ACCOUNT_MANAGER_TEMP_WORKER_URL=https://your-temp-worker.example
MAIL_PICKUP_LOGIN_STRATEGY=protocol
MAIL_PICKUP_NODE_BIN=node
```

生成随机令牌：

```bash
openssl rand -hex 32
```

如果你的临时邮箱 Worker 设置了站点访问密码：

```bash
GPT_ACCOUNT_MANAGER_TEMP_SITE_PASSWORD=你的站点口令
```

如果需要管理员公共池推送：

```bash
GPT_ACCOUNT_MANAGER_PUBLIC_POOL_API_URL=https://your-public-pool.example/api/import
GPT_ACCOUNT_MANAGER_PUBLIC_POOL_TOKEN=optional-pool-token
```

如果 CPA 管理端点是内网、局域网、容器私网或其它私有地址，再开启：

```bash
MAIL_PICKUP_CPA_ALLOW_REMOTE=1
```

锁定配置文件权限：

```bash
sudo chown root:www-data /etc/ctgptm-mail-assistant.env
sudo chmod 640 /etc/ctgptm-mail-assistant.env
```

## 6. 安装 systemd 服务

```bash
sudo cp /opt/ctgptm-mail-assistant/deploy/ctgptm-mail-assistant.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ctgptm-mail-assistant
sudo systemctl status ctgptm-mail-assistant --no-pager
```

本机检查：

```bash
curl -I http://127.0.0.1:8765/
```

应该返回 `200 OK`。

## 7. 配置 Nginx

可以从 `deploy/nginx.example.conf` 复制一份，替换 `server_name`：

```bash
sudo cp /opt/ctgptm-mail-assistant/deploy/nginx.example.conf /etc/nginx/sites-available/gpt-account-manager
sudo nano /etc/nginx/sites-available/gpt-account-manager
sudo ln -sf /etc/nginx/sites-available/gpt-account-manager /etc/nginx/sites-enabled/gpt-account-manager
sudo nginx -t
sudo systemctl reload nginx
```

申请 HTTPS：

```bash
sudo certbot --nginx -d example.com
```

检查自动续期：

```bash
sudo certbot renew --dry-run
```

## 8. 访问地址

```text
https://example.com/
https://example.com/refresh.html
https://example.com/warehouse.html
https://example.com/converter.html
https://example.com/admin.html?token=你的_MAIL_PICKUP_ADMIN_TOKEN
```

CPA 仓管默认地址可以填 `http://localhost:8317`，管理密钥填 CPA / CLIProxyAPI 的 management key。点击巡检后会诊断 auth file 状态；需要重新授权的账号可以推入刷新流程。

## 9. 导入格式

临时邮箱：

```text
邮箱----JWT----分类(可选)
```

Microsoft 邮箱：

```text
email----password----client_id----refresh_token----分类(可选)
```

## 10. 常用命令

查看服务日志：

```bash
sudo journalctl -u ctgptm-mail-assistant -f
```

重启服务：

```bash
sudo systemctl restart ctgptm-mail-assistant
```

更新代码：

```bash
sudo unzip -o /tmp/gpt-account-manager-*.zip -d /opt/ctgptm-mail-assistant
sudo chown -R www-data:www-data /opt/ctgptm-mail-assistant
sudo mkdir -p /opt/ctgptm-mail-assistant/.cache
sudo chown -R www-data:www-data /opt/ctgptm-mail-assistant/.cache
sudo systemctl restart ctgptm-mail-assistant
```

检查 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 10. 验证清单

```bash
curl -I https://example.com/
curl -I https://example.com/admin.html
curl -s https://example.com/ | head
```

预期：

- `/` 返回 `200`。
- 首页 HTML 出现 `GPT账号管理助手`。
- `/admin.html` 不带 token 返回 `404`。
- `/admin.html?token=正确令牌` 返回 `200`。
- 临时邮箱和 Microsoft 邮箱链路能分别取信。
- `/warehouse.html` 能连接你的 CPA 管理端点并显示诊断结果。
