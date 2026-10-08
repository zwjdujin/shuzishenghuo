# 数字生活 shuzishenghuo — 项目约定

- **技术栈**：Cloudflare Pages（静态前端 `./public`）+ Pages Functions（`./functions`）+ D1 数据库（名 `shuzishenghuo`）+ R2 存储桶（名 `shuzishenghuo`）。非 资料库 托管。
- **认证**：管理员登录，凭据来自后台变量 `ADMIN_USER/ADMIN_PASS/SESSION_SECRET`；HMAC-SHA256 签名 Cookie（7天），`_middleware.js` 全局校验 `/api/*`（仅 `/api/auth/login`、`/api/health` 公开）。
- **前端风格**：参考「日常集」——暖色纸感背景、左侧 `.sidebar` 模块导航、卡片仪表盘、移动端 `.mobile-nav` 底部 Tab；纯内联 CSS/JS，零外部依赖；图标用 `#i-*` SVG sprite。
- **版本号规则**：`主.次.修订`。主版本(左)由用户特别说明时改；次版本(中)每新增一个功能页面 +1；修订号(右)每次修改 +1。当前 v0.0.1（初始脚手架+个人首页）。下一页补齐→v0.1.1。
- **模块状态**：个人首页已成型；成长打卡/待办提醒/我的账本/家庭药箱/日历中心/人际关系 现仅为留白菜单入口，数据表已建好，后续每次迭代只补 1 个页面。
- **数据表**：app_settings, habits, habit_logs, todos, transactions, medicines, events, contacts。建表见 `schema.sql`，示例见 `seed.sql`。
- **本地验证**：可用 Node + mock D1 跑 `functions/api/*` 处理器（`signToken` 必须把 JSON 字符串先 `TextEncoder().encode` 再 base64url，否则 payload 为空）。
- **部署**：Cloudflare 控制台建 D1/R2→绑定 DB/BUCKET→环境变量；或 `wrangler pages deploy ./public`。仓库 `zwjdujin/shuzishenghuo`。
