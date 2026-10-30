# 数字生活 · shuzishenghuo

部署在 **Cloudflare Pages** 上的个人数字生活工作台：成长打卡、待办提醒、记账账本、家庭药箱、日历与人际关系、经期记录，全部安放在一个站点里。纯浏览器访问，手机可「添加到主屏幕」当 APP 用，支持到期推送提醒（Web Push）与 AI 大模型配置（随手记速记解析）。

单管理员模式，数据存在你自己的 Cloudflare 账号里（D1 数据库 + R2 对象存储），不经过任何第三方。

---

## 功能一览

| 模块 | 主要能力 |
| --- | --- |
| 个人首页 | 今日总览、快捷入口、随手记（支持 AI 大模型解析为记账/待办/备忘）、那年今天、本周回顾 |
| 成长打卡 | 习惯管理、频率目标（每周 N 次 / 每 N 天）、打卡热力图、习惯强度 |
| 待办提醒 | 优先级四象限、到期推送提醒、系统闹钟联动（安卓） |
| 我的账本 | 收支与转账、自定义分类、月度/分类预算、周期账单自动入账、报表 |
| 家庭药箱 | 药品库存与效期、服药计划与打卡、分类/剂型/存放位置自定义、外用药与处方药标志 |
| 日历中心 | 周历 / 月历 / 农历、日程管理、生日联动、经期记录与周期预测 |
| 人际关系 | 联系人档案、家庭关系、联系节奏提醒、身高体重记录、附件（照片/视频/文档） |
| 智能管理 | 多个大模型配置（OpenAI 兼容）、API Token 与 MCP 接入（按功能授权读写） |
| 数据安全 | 全量数据备份下载、清空重建 |

推送提醒由 Cloudflare Worker 定时任务驱动：待办与服药到点（每分钟）、生日 / 保持联系 / 药品临期（每日早上）。

---

## 技术架构

| 能力 | 选型 | 位置 |
| --- | --- | --- |
| 静态前端 | Cloudflare Pages | `public/`（零构建，纯 HTML/CSS/JS） |
| 后端接口 | Cloudflare Pages Functions | `functions/` |
| 结构化数据 | Cloudflare D1 | 数据库名 `shuzishenghuo`，迁移在 `migrations/` |
| 文件存储 | Cloudflare R2 | 桶名 `shuzishenghuo`（联系人附件） |
| 定时推送 | Cloudflare Worker（Cron） | `worker/` |
| 登录认证 | 环境变量 + HMAC 签名 Cookie 会话 | `ADMIN_USER` / `ADMIN_PASS` / `SESSION_SECRET` |

---

## 目录结构

```
shuzishenghuo/
├── public/                 # 前端单页应用（零构建，纯 HTML/CSS/JS）
│   ├── index.html          # 应用外壳与全部页面
│   ├── css/style.css       # 全站样式（纸感主题、日间/夜间、国色配色）
│   ├── js/                 # 主逻辑 / 药箱 / 人际关系 / 农历
│   ├── sw.js               # Service Worker（由 scripts/release.mjs 生成，勿手改）
│   └── icons/              # PWA 图标
├── functions/              # Pages Functions 后端
│   ├── api/                # 各模块接口（auth、todos、transactions、medicines、profile、period…）
│   ├── _middleware.js      # 登录校验中间件
│   └── _lib.js             # 共享工具（签名 / Cookie / 响应）
├── worker/                 # 推送提醒 Worker（Cron 每分钟）
├── migrations/             # D1 数据库迁移（有执行记录，支持增量）
├── scripts/
│   ├── release.mjs         # 发版脚本：版本号注入 + 静态资源内容哈希 + 生成 sw.js
│   ├── deploy-cloudflare.sh# 一键部署脚本（D1 / R2 / Pages / Worker）
│   └── test-*.mjs          # 端到端测试（CI 自动运行）
├── .github/workflows/ci.yml# CI：语法检查 → 从零建库 → 端到端测试
├── wrangler.toml           # D1 / R2 / 绑定配置
├── DEPLOY.md               # 零基础部署指南（推荐从这里开始）
├── PUSH_SETUP.md           # 推送提醒配置
└── APP_BUILD.md             # 打包成安卓 APP（WebView 壳）
```

---

## 快速开始

推荐阅读 **[DEPLOY.md](./DEPLOY.md)**——为零基础写的完整部署指南（注册 Cloudflare、建库、连接仓库、环境变量、首次迁移、常见问题），约 20 分钟可上线。

熟悉 Cloudflare 的开发者，最小步骤：

```bash
# 1. 克隆仓库并安装 wrangler
git clone https://github.com/zwjdujin/shuzishenghuo && cd shuzishenghuo
npm install -g wrangler && wrangler login

# 2. 创建数据库与存储桶（名称与 wrangler.toml 保持一致）
wrangler d1 create shuzishenghuo
wrangler r2 bucket create shuzishenghuo

# 3. Pages 连接 Git 仓库（构建输出目录 public），
#    绑定 D1=DB、R2=BUCKET，配置三个环境变量；
#    或直接跑 scripts/deploy-cloudflare.sh 一键完成

# 4. 应用数据库迁移
wrangler d1 migrations apply shuzishenghuo --remote
```

### 环境变量

| 变量 | 作用 | 建议 |
| --- | --- | --- |
| `ADMIN_USER` | 管理员用户名 | 改掉默认值 |
| `ADMIN_PASS` | 管理员密码 | 强密码 |
| `SESSION_SECRET` | 会话签名密钥 | 随机长字符串（`openssl rand -hex 32`） |
| `AI_API_KEY` 等 | 随手记 AI 解析（可选） | 也可在站内「智能管理」页配置，可不填 |

---

## 发版与更新

- 改代码后运行 `node scripts/release.mjs <版本号> "<说明>"`：版本号注入各处、静态资源按内容哈希改名（浏览器缓存安全）、重新生成 Service Worker。
- 推送到 GitHub 后，CI 自动做语法检查、从零建库、跑端到端测试；Pages 连接 Git 的会自动部署。
- 数据库结构变更统一走 `migrations/`（`wrangler d1 migrations apply shuzishenghuo --remote`），有执行记录、可增量、不丢数据。

---

## 安卓 APP（PWA / TWA）

用手机浏览器打开站点 → 菜单 →「添加到主屏幕」，即可全屏使用；也可安装安卓 APP（首次打开填自己的站点地址），见 [`APP_BUILD.md`](./APP_BUILD.md)。推送提醒配置见 [`PUSH_SETUP.md`](./PUSH_SETUP.md)。

---

## 许可

个人使用为主。代码与结构欢迎参考，部署后请在页面内把品牌设置改成你自己的。
