# 数字生活 · 待办提醒（通知 / 闹铃）上线指南

本文件对应 `TWA_BUILD.md` 之外的「提醒」能力。三档实现位置：

| 档 | 能力 | 代码位置 | 是否需后端/部署 |
|---|---|---|---|
| A 打开即提醒 | 打开 APP 时弹本地通知汇总 | 前端 `maybeNotifyTodos()`（`public/js/app.js`） | 否，已生效 |
| B 后台到点推送 | 待办到点真推送（Web Push） | `sw.js` push 处理 + `functions/api/push/*` + `worker/` | 是，见下 |
| C 系统闹钟 | 一键拉起系统时钟预填闹钟 | 前端 `setSystemAlarm()`（`public/js/app.js`） | 否，best-effort |

---

## A 打开即提醒（已生效，无需额外操作）

- 待办页点「开启待办通知」→ 浏览器请求通知权限 → 记住偏好。
- 之后每次打开/回到 APP，若当天有到期或逾期待办，会弹一条本地通知汇总。
- 仅在你打开 APP 时提醒（无需服务器）。

## C 系统闹钟（已生效，best-effort）

- 待办行有「🔔→时钟」图标，仅在该待办设有时间时出现。
- 点击会尝试用 Android 深链 `intent://...SET_ALARM` 拉起系统时钟 App 并预填闹钟。
- ⚠️ 非 100% 可靠：取决于手机系统/厂商（AOSP/三星/小米/华为 各异），部分 ROM 会拦截或需手动确认。这不是由 APP 直接写入系统闹钟。

## B 后台到点推送（需配置 + 部署）

### 1. 生成 VAPID 密钥（一次性）

```bash
npx web-push generate-vapid-keys
```

记下输出的 **Public Key** 与 **Private Key**（P-256，base64url）。

### 2. 配置 Pages Functions 环境变量

Cloudflare 控制台 → 你的 Pages 项目 → 设置 → 环境变量（生产），添加：

- `VAPID_PUBLIC` = 上面的 Public Key
- `VAPID_PRIVATE` = 上面的 Private Key

（Pages Functions 通过 `context.env` 读取，已在新端点中使用。）

### 3. 建订阅表

```bash
wrangler d1 execute shuzishenghuo --remote --file=./migrate-v0.3.1-push.sql
```

### 4. 部署前端 + Functions

```bash
git add -A && git commit -m "feat: todo notifications (A/B/C)" && git push
# 或：npx wrangler pages deploy ./public
```

部署后：`/api/push/vapid` 会返回公钥，前端在「开启待办通知」时自动完成订阅。

### 5. 部署推送调度 Worker（独立项目）

```bash
cd worker
npm install
wrangler secret put VAPID_PUBLIC      # 粘贴 Public Key
wrangler secret put VAPID_PRIVATE      # 粘贴 Private Key
wrangler secret put VAPID_MAILTO       # 形如 mailto:you@example.com
```

编辑 `worker/wrangler.toml`，把 `account_id` 改成你的 Cloudflare 账户 ID，然后：

```bash
wrangler deploy
```

该 Worker 由 Cron Trigger（`* * * * *`，每分钟）触发：取「今天 + 时间==当前分钟 + remind=1」的待办，向所有订阅设备发 Web Push。

> Cron Trigger 目前 Cloudflare 各套餐可用。若你的套餐不支持，可改为用 Cloudflare Queues/外部定时器触发 `worker` 的 `fetch` 入口。

### 6. 使用

1. 打开 APP → 待办页 → 「开启待办通知」（授权 + 自动订阅）。
2. 新增待办时勾选「到点提醒（通知）」并填时间。
3. 到达该分钟时，Worker 推送通知到你的设备（需手机联网、Chrome 未被系统清后台）。
4. 点击通知回到 APP。

---

## 可靠性提示

- Web Push 在安卓 Chrome / TWA 下基本可用；小米/华为/OPPO 等国产 ROM 有后台清理、电量优化，
  可能延迟或丢失，且要求手机联网、Chrome 在后台未被杀。重要事项建议仍以 APP 内展示 + 系统闹钟（C）双保险。
- 推送送达与设备时区一致（Worker 按 UTC? 不，Worker `scheduled` 事件的 `event.scheduledTime` 是 UTC；
  本实现用 Worker 运行环境的本地时间 `new Date()`，与 D1 中 `datetime('now')` 的时区需一致——Cloudflare 默认 UTC。
  若你所在时区非 UTC，请确认待办时间按本地填写、且 D1 的 `todo_time` 与 Worker 本地时间口径一致（均为部署区域时间）。
  如需严格按用户时区，后续可把"当前分钟"改为按账号时区计算。
