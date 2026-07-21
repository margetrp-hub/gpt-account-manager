# 接码平台兼容说明

凭证刷新页的长效手机池只管理用户已经拥有的号码和订单：校验平台连接、同步活跃订单、读取新短信、手动填写验证码，以及把号码与刷新账号建立 1 对 1 关系。它不在本项目内创建、批量购买或续费第三方平台订单。

## HeroSMS

- 默认兼容端点：`https://hero-sms.com/stubs/handler_api.php`
- 官方文档：<https://hero-sms.com/api>
- 已接入操作：
  - `getBalance`：验证 API Key 并显示余额。
  - `getStatusV2`：按已有激活订单读取验证码。
  - `getActiveActivations`：同步当前活跃订单，导入号码、订单 ID、服务和国家信息。

HeroSMS 的官方文档同时提供 SMS-Activate 兼容接口和 REST API。当前页面使用兼容接口，原因是它与已保存的“手机号 + 订单 ID”资料直接对应，不需要把用户的接码平台账户或订单购买流程写入本项目。

## SMSBower

- 默认兼容端点：`https://smsbower.page/stubs/handler_api.php`
- 已接入操作：
  - `getBalance`：验证 API Key 并显示余额。
  - `getStatus`：按已有激活订单读取验证码。
  - `getActiveActivations`：同步当前活跃订单。

SMSBower 的兼容接口可能返回纯文本，也可能返回 JSON。项目会识别 `BAD_KEY`、`No access`、余额不足、订单不存在、等待验证码和已收到验证码等响应，不会把订单 ID 或手机号误识别为验证码。

## 自定义 API

自定义 API 使用 GET 请求，地址必须是 `http` 或 `https`。可用占位符：

- `{phone}`：手机号。
- `{email}` 或 `{account}`：当前绑定刷新账号的邮箱。
- `{since}`：上一次查询时间。
- `{ts}`：当前 Unix 时间戳。

响应可以是纯文本、JSON 对象或 JSON 数组。字段名中包含 `code`、`otp`、`sms`、`message`、`content` 或 `text` 的内容会被用于提取 4 到 8 位验证码。

## 手机池字段

- `手机号`：需要接收短信的号码。
- `API Key`：HeroSMS / SMSBower 的平台密钥，仅保存在当前用户工作区的浏览器端资料中。
- `订单 ID`：已有激活订单的标识；同步活跃订单后会自动填入。
- `接口地址`：可选。为空时使用内置平台端点；只有平台提供了私有兼容地址时才填写。

选择刷新队列中的一个账号后，以“1 对 1”模式保存手机号会建立绑定。选择“批量池”时，号码只进入空闲池，由刷新队列按顺序分配。
