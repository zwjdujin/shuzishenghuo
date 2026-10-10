# 数字生活 shuzishenghuo — 项目约定

## 技术栈与部署
- Cloudflare Pages（静态 `./public`）+ Functions（`./functions`）+ D1 `shuzishenghuo` + R2。**非资料库托管**。仓库 `zwjdujin/shuzishenghuo`。
- 认证：`ADMIN_USER/ADMIN_PASS/SESSION_SECRET` + HMAC-SHA256 签名 Cookie（7 天）；`_middleware.js` 校验 `/api/*`（仅 `/api/auth/login`、`/api/health` 公开）再查 `sessions`。
- **管理员密码（v0.3.13）**：环境变量 `ADMIN_PASS` 运行时不可改写，「修改密码」只能落库 → 自定义密码存 `app_settings.admin_pass_hash`（PBKDF2-SHA256 / 10 万次 / 16 字节盐，格式 `pbkdf2$iter$salt$hash`，恒定时间比较）。**`verifyAdminPassword(env, pass)` 库中有哈希则优先，没有才回退环境变量** —— 改过密码后环境变量就失效了。`POST /api/auth/password` 成功后踢除「除当前设备外」的会话。helper 全在 `_lib.js`（`hashPassword`/`verifyPassword`/`readCustomPassHash`/`saveCustomPassHash`/`ADMIN_PASS_KEY`）。**该键不在 `/api/settings` 白名单内（读不出来），备份 `data/export.js` 也会显式排除它**。
- 部署：`export PATH="$HOME/.bun/bin:$PATH"` → `wrangler pages deploy ./public --project-name=shuzishenghuo --branch=main --commit-dirty=true`；迁移 `wrangler d1 execute shuzishenghuo --remote --file=./migrate-vX.Y.Z.sql`。
- **Git 走 SSH**（仓库级 `core.sshCommand` 必须保留，指向项目内 `.ssh-keys/`；`~/.ssh/` 是受保护路径）→ `git push`。**commit message 含反引号会被 bash 执行** → 一律 `git commit -F _msg.txt`（已 gitignore）。
- ⚠️ **有另一个会话在并发提交/部署** → **发版前先 `git status` + `git diff --stat` 复核改动还在**。

## 前端约定
- 暖色纸感、左侧 `.sidebar`、卡片仪表盘、移动端 `.mobile-nav`；纯内联 CSS/JS 零依赖；图标 `#i-*` sprite。
- **版本号 `主.次.修订`**：主版本用户指定才改；次版本每新增功能页 +1；**修订号每次修改 +1**。发版同步改 `js/app.js` 的 `VERSION`/`__BUILD_ID__`/`__BUILD_TIME__` + `js/sw.js` 的 `const CACHE`（每次必改）。
- 脚本顺序 `lunar.js`→`profile.js`→`medicine.js`→`app.js`；**非 ES module，跨文件必须 `window.xxx = xxx`**。
- 样式表顶部必须有 `[hidden]{display:none!important}`。
- **重复调用的 `build*()` 里别用 `addEventListener`**（成倍累积）→ 用 `el.onclick=`。
- 🔴 **`app.js` 末尾的 DOM 绑定一律走带保护的 `bind(sel, type, fn)`**（`const el=$(sel); if(el) ...`）。原来直接 `$('#x').addEventListener` 无空值保护 → **index.html 与 app.js 一旦不同步**（预览页 HTML 快照早于 index.html、SW 缓存旧 HTML），取到 null 就抛错**中断该 script 之后的所有顶层代码**（曾导致日历页首屏几何全为 0x0、`#calNext` 不可见，误以为日历改坏了）。新增绑定必须用 `bind()`。

### 🔴 全局模块间距（用户强调多次）
**页面内模块之间必须 22px。** 通用规则 `.view.active>*{margin-bottom:22px}` 只作用于 `.view` **直接子元素**；多包一层（`.view>#container>.panel`）**必须为该容器单独加规则**。`display:flex;gap` 容器会与之叠加 → 改 `display:block` 或子项 margin 归零。

### 🔴 验证方法（`node --check` 远远不够）
1. `node --check` 只查语法，**查不出运行时未定义引用**（`FONTS is not defined` 能过检查却全崩）。改完 grep 关键常量确认定义还在。
2. **Edit 的 `old_string` 必须足够唯一**（曾因不唯一连带删掉上方 const）。
3. 「改了没生效」先怀疑 **CSS 过渡**（探测前注入 `*{transition:none!important}`）与**预览页自己注入的 `!important`**（曾盖掉 `#view-calendar.active{display:flex}`，误判自适应没生效）。
4. **Node 里 `str.replace(a, inject)` 会吃掉替换串的 `$`** → 必须 `replace(a, () => inject)`。**模板字符串里写正则必须 `\\d`**（单个 `\d` 反斜杠被吞成 `d`，生成页正则静默失效）。
5. **改字段名必须全局 grep 所有引用处**。

## 🎨 主题与夜间模式（v0.3.8 架构 + v0.3.9 令牌化；勿参考旧 23 色方案）
- 页面：个人中心子页「**主题风格**」（`PROFILE_TITLES.style`），`#page-style`。
- `CN_COLORS` **18 种中国传统色**（只存 `{key,label,base}`）；`THEMES` 由 `dayPalette()`/`nightPalette()` 运行时派生（https://api.dujin.org/colors/cn-colors/）。
- 派生必须用 **WCAG 相对亮度**约束对比度（不能用 HSL 明度）。日间主色 `= min(原明度, 达到 relLum .145 的明度)`；夜间主色 `= 达到 relLum .20 的明度`；`nightPalette().surface = hsl(h, min(s*.46,24), 14.5)`，比 card 亮一档。
- **令牌映射**：`:root` 声明 `--t-day-*`/`--t-night-*`（`applyTheme()` 写 inline），再由 `:root` / `html[data-mode="night"]` 映射到 `--paper/--card/--ink/--muted/--line/--side/--plum/--plum-soft/--plum-deep/--accent/--tint`。**切明暗不用重选主题**。
- **`--surface`（核心约定）**：日间固定 `#fffdfa`，夜间 `var(--t-night-surface)`。**所有次级容器（列表行/输入框/次级按钮/分段按钮/标签/日历单元格）一律 `var(--surface)`**，不写死近白、也不加进夜间白名单。
- **夜间白名单只留一级面板**：`.sidebar/.side/.panel/.pf-hero/.modal-card/.local-card/.habit-card/.stat-card` → `background:var(--card)!important`。**新增二级容器不要再加**（这是「夜间发亮」的根因）。`.hero-card` 故意不在白名单（自带 `var(--hero)` 主题渐变）。
- 语义令牌 `--danger-soft/--danger-line/--danger-tint/--warn-soft/--warn-ink`；六色图标底 `--terra/sage/sand/clay-soft` 夜间统一压暗。`.stat-icon.alert` 表达「有逾期」，**禁止 JS 写内联 `style.background`**。
- 坑：`.seg-item.active` 需 `background:var(--plum);color:#fff`；夜间 `.toast` 用 `surface`+`ink`（不可 `--ink`+白字翻转）；`.field textarea` 已补样式。
- **字体**：`FONTS` 只有 default / lxgwwk(霞鹜文楷)；`applyFont()` 写 `--f-ui/--f-serif/--font-ui/--font-serif`；字体卡预览必须 `el.style.setProperty('font-family', stack, 'important')`。主题页类名 `.ts-*/.tf*/.tc*`。
- **外观多端同步（v0.3.10）：服务端是权威源**。`app_settings` 存 `theme/font/mode`，`GET /api/home` 返回 `appearance{}`；`renderHome()` 用 `applyAppearanceFromServer()` 覆盖本机，localStorage 只是首屏缓存（`restoreAppearance()` 先渲染防闪）。显式切换时 `pushAppearance(patch)` 即时 PUT `/api/settings`。**改外观逻辑务必保持这条链路**。localStorage：`pf_theme`/`pf_font`/`pf_mode`。

## 验证脚本（优先复用）
- 起服务：`cd 仓库根 && python -m http.server 8899`；页面在 `http://localhost:8899/_preview/xxx.html`（**生成页一律输出到仓库根 `_preview/`，绝不能放 `public/`**，`.gitignore` 对 wrangler 无效）。
- 截图一律用 **playwright-core**（`~/.workbuddy/binaries/node/workspace/node_modules`，ESM 必须 `file:///` 绝对路径 import，`NODE_PATH` 对 ESM 无效）；`W=390` 真机视口、`NIGHT=1` 夜间、`TAG=` 命名、`SEL=` 元素截图。⚠️ **Edge `--headless=old` 的 `--window-size` 最小 ~500px**（设 390 实测 492）→ 窄屏必须用 playwright viewport。
- `scripts/test-theme.mjs`：色板对比度自检（18 色 + 夜间容器面）。
- `scripts/test-medicines.mjs`(20 项) / `scripts/test-data-api.mjs`(27 项) / `scripts/test-password-api.mjs`(33 项)：mock D1 后端断言（第三个覆盖初始密码登录、5 类改密校验、改密后新旧密码行为、会话踢除、备份不泄露哈希、库中无明文、会话表异常不阻断）。
- `scripts/gen-nightcheck.mjs`：夜间亮底核查页。复刻真实 index.html + style.css，输出逐元素计算样式/WCAG + **自动巡检「夜间仍亮底」元素（相对亮度 ≥0.28 报异常）**。hash `#<light|night>-view-<view>[-ptab-<子页>]`。
- `scripts/gen-relpreview.mjs` + `shot-el.mjs`/`shot-scroll.mjs`：人际关系移动端体检。stub `api()` 喂样例（`pfLoadOptions()` 必须 await，否则 `PF.vocab.edu` 未定义 → 面板空白）。hash `#list|#edit-<模块>`。
- `scripts/gen-calpreview.mjs` + `shot-cal.mjs` + `test-calendar.mjs`：日历体检（25 项断言）。加载真实全套脚本，只换 `window.fetch`。hash `#week|#month|#week-2026-10|#month-2026-8`；可用全局 `calState` 指定锚点。
- `scripts/gen-secpreview.mjs` + `shot-sec.mjs`：账户安全页 / 修改密码弹窗体检。**保留真实 app.js**，只在脚本前注入 `window.fetch` 桩（`/api/auth/me` 200、`/api/sessions` 返回样例设备、`/api/auth/password` 校验 `init-pass-123`）。hash `#security|#security-modal（跑错误+成功提交流程）|#security-modal-open（保留弹窗仅截图）`，加 `-night` 后缀切夜间。⚠️ 探针内部有 900ms+ 等待，外层 `waitForTimeout` 要 ≥2200ms 才能读到 `#report2`。
- ⚠️ **改完 `index.html`（增删元素）必须重新生成所有 `_preview/` 体检页**（它们内嵌 HTML 快照，否则 app.js 绑定空值报错）。
- `_preview/`、`_probe/`、`demo/_*.png` 已 gitignore。

## Cloudflare Pages 坑
- ⚠️ **`wrangler pages deploy ./public` 会原样上传 `public/` 下所有文件，`.gitignore` 完全无关** → 验证页绝不能放 `public/`。
- **文件/目录同名冲突 → error 1101**（`profile.js` 与 `profile/` 不能并存，已用 `profile/detail.js` + `/api/profile/detail?id=`）。
- **下划线 helper 必须与调用方同级**，否则 esbuild `Could not resolve`。
- **删除路由**：`[id].js` 里 `onRequestDelete` 拿不到 `context.params.id` → **必须导出 `onRequest()` 并用 `url.pathname.match(/\/(\d+)/)` 解析**。
- `signToken` 必须先把 JSON 字符串 `TextEncoder().encode` 再 base64url。
- 未知路径返回 200（SPA 回退）→ **不能靠状态码判断文件存在**，要校验内容特征串。
- **SQLite `LIKE` 里 `_` 是通配符** → 别用 `NOT LIKE '_cf_%'`，改为 SQL 取 `type='table'` 后 JS `startsWith('sqlite_')/('_cf_')`。

## 数据表
`app_settings, habits, habit_logs, todos, transactions, medicines, events, contacts, sessions` + 人际关系 11 张 `contact_*` + `vocab`、`push_subscriptions`。建表 `schema.sql`，示例 `seed.sql`。

## 模块实现要点
- **日历中心（v0.2.7 → v0.3.12 周历改版）**：`lunar.js`（`lunarLabel()`/`lunarFull()`，1900–2100 已校验）。`CAL_COLOR` 四类配色。
  - 🔴 **周历结构坑**：`.cal-week-grid` 必须是**纵向堆叠**容器（`display:flex;flex-direction:column`），每行 `.cal-hour` 才是 `grid-template-columns:var(--cal-hcol) repeat(7,1fr)`。旧版把 `.cal-hour` 直接塞进外层 8 列 grid → 15 个整行被当成 15 个格子横排换行，时间轴横向乱排。
  - 时间轴 **00:00–23:00 共 24 行**；顶部 `.cal-allday` 全天行（生日/全天日程）；`.cal-week-head` `sticky top:0`；`.hh`/`.wh-corner`/`.ad-lab` `sticky left:0`（手机横滚吸附）。
  - `--cal-hcol/--cal-gap/--cal-row/--cal-minw` 定义在 `.cal-week`：桌面 `46/6/22/0`，手机 `38/4/30/640px`（日期列加宽 → 容器内横向滚动）。
  - ⚠️ **`.cal-week-grid` 不能加 `min-height:0`**（会被压缩到小于 24 行最小高度，12:00–23:00 既不可见也不可滚，且滚动容器不滚）。
  - **标题**：周历 `当前为YYYY年第N周`（`weekOfYear()` 以「含 1/1 的周日那一周」为第 1 周）；月历 `YYYY年M月`；日期区间放副标题 `#calEyebrow`。`syncCalNavLabels()` 让上一页/下一页随视图变语义（`calShift()` 本就按视图 ±7 天 / ±1 月）。
  - 🔴 **`fitCalView()` 整屏自适应**：`#view-calendar` 高度由 JS 实测写入 inline style = `innerHeight − (scrollY + rect.top) − .main-content 下 padding` → 页面总高恰等于视口高，**刚好不出现滚动条**，自动适配标题栏/地址栏/收藏栏与手机动态地址栏（**不要退回写死 `100vh - N`**）。配合 `#view-calendar.active{display:flex}` + `.cal-panel/#calViewBox/.cal-month-wrap{flex:1;min-height:0}` + `.cal-month-grid{grid-auto-rows:minmax(0,1fr)}` + `.mcell{min-height:0}` 把方格平均拉高。resize 有 120ms 防抖重算。
- **账本**：`renderDonut()` 内联 SVG 环图，**支出红收入绿**。**待办优先级**：`priority`(P0-P3) 由 `important`/`urgent` 推导，后端 `priorityOf()`；GET 支持 `priority` 多选 + `list`，响应含 `counts`。
- **成长打卡（v0.2.1）**：`habits`(category/type normal|sleep/method count|duration/target&unit/bed|rise|nap_time) + `habit_logs`(done/done_bed/done_rise/done_nap, UNIQUE(habit_id,log_date))。unit 存「次/秒/分钟/小时」，快捷按钮与标签必须跟随 unit（`UNIT_STEPS`）。
- **家庭药箱（v0.3.7）**：`medicine.js` + `functions/api/medicines.js` + `medicines/[id].js`。**临期=6 个自然月**（`new Date(y,m+6,d)`，**不用 180/184 天**）；四态 `expired/soon/safe/none`（`none` 不进临期/过期表）。暴露 `window.medRenderMedicine`/`medBindEvents`。
- **人际关系（v0.3.1）**：`profile.js` + `functions/api/profile/*`。`_profile.js` 提供农历换算/`nextBirthday()`/`birthdayFromIdcard()`/`ageOf()`。三端联动：承诺→`todos`(list='人际关系')、人情→`transactions`(category='人情')、互动可同步 `events`。`contacts` 扩展 alias/gender/province/city/idcard/idcard_birthday/show_lunar/level/job/company/status/native/page；7 维筛选 + 搜索；`DELETE /api/profile/delete?id=N` 级联清 11 表 + R2。**字段坑**：列表与详情的 `nextBirthday` **都返回 `full`**（不是 `date`）；`PF.mode`=`detail`|`simple`。
- **个人中心（v0.2.5 / v0.3.10）**：**子菜单是唯一入口**，页顶无标题无页签。`#profileBtn`/`#profileBtnMobile`→`#profilePopover(Mobile)`；`PROFILE_MENUS` + `closeAllProfilePopovers()` + `openProfileTab()`。
  - **5 个子页** site→style→**data**→security→sysinfo；`PROFILE_TITLES`、两处菜单 HTML、`#page-*` 必须同步。
  - **坑**：`switchView('settings')` 内不可无条件 `switchProfileTab('site')`（会重置带参进入的子页）→ 用 `currentProfileTab` + `switchView(name,{keepTab:true})`，导航委托排除 `navEl.id !== 'profileBtnMobile'`。
  - **坑**：`.mnav-popover` 必须 `position:fixed`（`left/right:14px; bottom:calc(82px + env(safe-area-inset-bottom))`），否则以 6 列栅格一格为包含块只剩几十像素宽。
  - 站点信息 `GET/PUT /api/settings`；账户安全 `renderSessions()`（`GET /api/sessions` 返回 `{devices, customPass}`）+`DELETE /api/sessions/[sid]`（当前设备排最前 + `.dev-current-tag`）+ 修改密码弹窗 `#passModal`（按钮在「登录与安全」面板 `.sec-actions` 内，退出登录**下方**）；系统信息 `GET /api/sysinfo`。
- **数据处理（v0.3.10）**：`functions/api/data/{_tables,stats,export,clear}.js`。表清单**动态取自 `sqlite_master`**，排除 `sqlite_*`/`_cf_*` + `EXCLUDE={sessions,app_settings}`。`POST /api/data/clear` 需 `{confirm:'CLEAR_ALL_DATA'}`。**清空保留 `sessions` 与 `app_settings`**（管理员密码在环境变量不在库中）。前端：勾 `#ackBackup` 解禁 `#clearDataBtn` → `#clearModal` 内输「清空」解禁 `#clearConfirmBtn`。
- **十二时辰经络（v0.2.2）**：`SHICHEN` 12 项，`shichenOf(hour)=Math.floor(((hour+1)%24)/2)`。**会话/设备**：`sessions(sid PK/user/ip/user_agent/created_at/last_seen_at)`；`decodeToken()` 取**第一段 payload**；IP 取 `cf-connecting-ip` 或 `x-forwarded-for`。

## 其他
- **邮件通知已放弃**（Pages Functions 无 TCP，SMTP 不可行）。
- 模块状态：个人首页、成长打卡、个人中心、日历中心、待办提醒、我的账本、人际关系、家庭药箱 均已补齐，无留白页。
