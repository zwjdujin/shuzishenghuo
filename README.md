# 数字生活 · shuzishenghuo

一个部署在 **Cloudflare Pages** 上的个人数字工作台：把成长打卡、待办提醒、账本、药箱、日历与人际关系安放在一个地方，浏览器直接访问，安卓可「添加到主屏幕」当 APP 使用。

> 当前版本：**v0.0.1** —— 已搭好脚手架、数据层（D1）与认证，并完成「个人首页 / 今日总览」；其余 6 个模块为菜单入口，页面留白，后续逐个补齐。

---

## 技术架构

| 能力 | 选型 | 说明 |
| --- | --- | --- |
| 静态前端 | Cloudflare Pages（`./public`） | 单页应用，零构建，纯 HTML/CSS/JS |
| 后端接口 | Cloudflare Pages Functions（`./functions`） | 登录、首页聚合等 API |
| 结构化数据 | Cloudflare **D1**（数据库名 `shuzishenghuo`） | 待办、账本、习惯、药箱等 |
| 文件/图片 | Cloudflare **R2**（存储桶名 `shuzishenghuo`） | 头像、封面等附件（已配置，渐次启用） |
| 管理员认证 | 后台变量 `ADMIN_USER` / `ADMIN_PASS` | HMAC 签名 Cookie 会话 |

前端视觉参考「日常集」风格：暖色纸感背景、左侧模块导航、卡片式仪表盘、移动端底部 Tab。

---

## 目录结构

```
shuzishenghuo/
├── wrangler.toml            # Pages + D1 + R2 + 变量 配置
├── schema.sql               # D1 建表（7 个模块）
├── seed.sql                 # 示例数据（含 1 条逾期待办）
├── public/
│   ├── index.html           # 应用外壳 + 7 个页面（首页已成型）
│   ├── css/style.css        # 样式（与参考同款视觉）
│   ├── js/app.js            # 前端逻辑（认证/路由/首页渲染）
│   ├── js/sw.js             # Service Worker（PWA 离线 + 可安装）
│   └── manifest.webmanifest # PWA 清单（安卓 APP）
└── functions/
    ├── _lib.js              # 共享工具（签名/校验/Cookie）
    ├── _middleware.js       # 受保护接口登录校验
    └── api/
        ├── auth/{login,logout,me}.js
        ├── home.js          # 首页聚合数据
        ├── health.js
        └── todos/[id]/done.js
```

---

## 本地开发

```bash
# 1. 安装 wrangler
npm install -g wrangler
wrangler login

# 2. 本地变量（不要提交）：复制并填写 .dev.vars
cp .dev.vars.example .dev.vars

# 3. 创建本地 D1 与 R2（首次）
wrangler d1 create shuzishenghuo
wrangler r2 bucket create shuzishenghuo

# 4. 初始化表与示例数据（本地）
wrangler d1 execute shuzishenghuo --local --file=./schema.sql
wrangler d1 execute shuzishenghuo --local --file=./seed.sql

# 5. 启动本地预览
wrangler pages dev ./public --d1 DB=shuzishenghuo --r2 BUCKET=shuzishenghuo
```

打开 `http://localhost:8788`，用 `.dev.vars` 里的账号登录即可。

---

## 部署到 Cloudflare

### 方式一：Git 连接（推荐，自动部署）
1. 把本仓库推到 GitHub（`git push -u origin main`）。
2. Cloudflare 控制台 → **Workers & Pages → Create → Pages → 连接 Git 仓库 `zwjdujin/shuzishenghuo`**。
3. 构建设置：框架预设选「None / 其他」，构建输出目录填 `public`，构建命令留空。
4. 在 **设置 → 函数 → D1 数据库** 绑定：`DB` → `shuzishenghuo`；在 **R2** 绑定：`BUCKET` → `shuzishenghuo`。
5. 在 **设置 → 环境变量** 配置 `ADMIN_USER` / `ADMIN_PASS` / `SESSION_SECRET`（生产建议用 `wrangler secret put`）。
6. 部署完成后，到 D1 控制台执行 `schema.sql` 与 `seed.sql`（或在 CI 里 `wrangler d1 execute ... --remote`）。

### 方式二：CLI
```bash
wrangler pages deploy ./public
# 绑定与变量在控制台设置后重新部署即可
```

---

## 配置管理员账号

| 变量 | 作用 | 建议 |
| --- | --- | --- |
| `ADMIN_USER` | 管理员用户名 | 改掉默认 `admin` |
| `ADMIN_PASS` | 管理员密码 | 务必改成强密码 |
| `SESSION_SECRET` | 会话签名密钥 | 随机长字符串 |

本地放 `.dev.vars`，线上在控制台或 `wrangler secret put` 设置。`wrangler.toml` 里给的是占位默认值，**部署前请改**。

---

## 版本号规则

遵循 `主.次.修订`：
- **主版本（左）**：由你特别说明时手动变更；
- **次版本（中）**：每增加一个功能页面 +1（如补齐「成长打卡」→ `v0.1.1`）；
- **修订号（右）**：每次修改/提交 +1。

本版 `v0.0.1` = 初始脚手架 + 个人首页。

---

## 后续迭代计划（菜单已就位，逐页补齐）

| 模块 | 状态 | 数据表已就绪 |
| --- | --- | --- |
| 个人首页（今日总览） | ✅ 已成型 | app_settings / 各表聚合 |
| 成长打卡 | 🚧 入口 | habits / habit_logs |
| 待办提醒 | 🚧 入口 | todos |
| 我的账本 | 🚧 入口 | transactions |
| 家庭药箱 | 🚧 入口 | medicines |
| 日历中心 | 🚧 入口 | events |
| 人际关系 | 🚧 入口 | contacts |

每次迭代只加 1 个模块页面，沿用现有 D1 表，不丢已有数据；版本号按规则递增。

---

## 安卓 APP（PWA）

用手机浏览器打开站点 → 菜单 →「添加到主屏幕」，即可像原生 APP 一样全屏使用，数据经 Service Worker 离线缓存，接口始终走网络保持实时。
# 验证 12:50:39
# 验证 12:50:54
