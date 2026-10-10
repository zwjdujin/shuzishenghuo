# 数字生活 shuzishenghuo — 项目约定

## 部署与基础设施
- Cloudflare Pages（静态 `./public`）+ Functions（`./functions`）+ D1 `shuzishenghuo` + R2。**非资料库托管**。仓库 `zwjdujin/shuzishenghuo`。
- 认证：`ADMIN_USER/ADMIN_PASS/SESSION_SECRET` + HMAC-SHA256 签名 Cookie（7 天）；`_middleware.js` 校验 `/api/*`（仅 `/api/auth/login`、`/api/health` 公开）再查 `sessions`。**管理员密码（v0.3.13）**：环境变量运行时不可改写 → 自定义密码落库 `app_settings.admin_pass_hash`（PBKDF2-SHA256/10 万次/16B 盐，恒定时间比较），`verifyAdminPassword(env,pass)` 有哈希优先否则回退环境变量；该键不在 `/api/settings` 白名单、`data/export.js` 显式排除。helper 在 `_lib.js`。
- 部署：`export PATH="$HOME/.bun/bin:$PATH"` → `wrangler pages deploy ./public --project-name=shuzishenghuo --branch=main --commit-dirty=true`；迁移 `wrangler d1 execute shuzishenghuo --remote --file=./migrate-vX.Y.Z.sql`。
- **Git 走 SSH**（仓库级 `core.sshCommand` 必须保留、指向项目内 `.ssh-keys/`；`~/.ssh/` 是受保护路径）。**commit message 含反引号会被 bash 执行** → 一律 `git commit -F _msg.txt`（已 gitignore）。
- ⚠️ **有另一会话并发提交/部署** → 发版前先 `git status` + `git diff --stat` 复核改动还在。

## 前端约定
- 暖色纸感、左侧 `.sidebar`、卡片仪表盘、移动端 `.mobile-nav` 底部 Tab；纯内联 CSS/JS 零依赖；图标 `#i-*` SVG sprite。
- **版本号 `主.次.修订`**：主版本用户指定才改；次版本每新增功能页 +1；**修订号每次修改 +1**。发版同步 `js/app.js` 的 `VERSION`/`__BUILD_ID__`/`__BUILD_TIME__` + `js/sw.js` 的 `const CACHE`（每次必改）。
- 脚本顺序 `lunar.js`→`profile.js`→`medicine.js`→`app.js`；**非 ES module，跨文件必须 `window.xxx = xxx`**。
- 样式表顶部必须有 `[hidden]{display:none!important}`。
- **重复调用的 `build*()` 里别用 `addEventListener`**（成倍累积 → toast 越弹越多）→ 改 `el.onclick=`（幂等）。
- 🔴 **`app.js` 末尾 DOM 绑定一律走带保护的 `bind(sel,type,fn)`**（`const el=$(sel); if(el)...`）。index.html 与 app.js 不同步（预览页 HTML 快照早、SW 缓存旧 HTML）取到 null 会**中断该 script 之后所有顶层代码**。新增绑定必须用 `bind()`。

### 🔴 全局模块间距（用户强调多次）
**页面内模块之间必须 22px。** `.view.active>*{margin-bottom:22px}` 只作用于 `.view` **直接子元素**；多包一层（`.view>#container>.panel`）**必须为该容器单独加规则**（加嵌套容器时 grep 同类一次性补全）。`display:flex;gap` 容器会与之叠加 → 改 `display:block` 或子项 margin 归零；容器 `margin:0` 时其后兄弟会贴住 → 补 `margin-top`。

### 🔴 验证方法（`node --check` 远远不够）
1. `node --check` 只查语法，**查不出运行时未定义引用**（`FONTS is not defined` 能过检查却全崩）。改完 grep 关键常量确认定义还在。
2. **Edit 的 `old_string` 必须足够唯一**（带上下文行）——曾因不唯一连带删掉上方 const。
3. 「改了没生效」先怀疑 **CSS 过渡**（探测前注入 `*{transition:none!important}`）与预览页自己注入的 `!important`。
4. **Node 里 `str.replace(a, inject)` 会吃掉替换串的 `$`** → 必须 `replace(a, () => inject)`。**模板字符串里写正则必须 `\\d`**。
5. **改字段名必须全局 grep 所有引用处**（v0.3.2 修 `nb.date`→`nb.full`，v0.3.3 才发现列表页仍写 `b.date`）。

## 🎨 主题与夜间模式（v0.3.8 架构 + v0.3.9 令牌化；勿参考旧 23 色方案）
- 页面：个人中心子页「**主题风格**」（`PROFILE_TITLES.style`），`#page-style`。
- `CN_COLORS` **18 中国传统色**（只存 `{key,label,base}`）；`THEMES` 由 `dayPalette()`/`nightPalette()` 运行时派生（https://api.dujin.org/colors/cn-colors/）。
- 派生必须用 **WCAG 相对亮度**约束对比度（不用 HSL 明度，黄色 L=56% 仍极亮）：日间主色 `= min(原明度, 达 relLum .145)`；夜间 `= 达 relLum .20`；`nightPalette().surface = hsl(h, min(s*.46,24), 14.5)`（比 card 亮一档）。
- **令牌映射**：`:root` 声明 `--t-day-*`/`--t-night-*`（`applyTheme()` 写 inline），再由 `:root` / `html[data-mode="night"]` 映射到 `--paper/--card/--ink/--muted/--line/--side/--plum/--plum-soft/--plum-deep/--accent/--tint`。**切明暗无需重选主题**。
- **`--surface`（核心）**：日间固定 `#fffdfa`，夜间 `var(--t-night-surface)`。**所有次级容器（列表行/输入框/次级按钮/分段按钮/标签/日历单元格）一律 `var(--surface)`**，不写死近白、也不加进夜间白名单。
- **夜间白名单只留一级面板**：`.sidebar/.side/.panel/.pf-hero/.modal-card/.local-card/.habit-card/.stat-card` → `background:var(--card)!important`。**新增二级容器不要再加**（「夜间发亮」根因）。`.hero-card` 故意不在白名单（自带 `var(--hero)` 主题渐变）。
- 语义令牌 `--danger-soft/--danger-line/--danger-tint/--warn-soft/--warn-ink`；六色图标底 `--terra/sage/sand/clay-soft` 夜间统一压暗。`.stat-icon.alert` 表达「有逾期」，**禁止 JS 写内联 `style.background`**。
- 坑：`.seg-item.active` 需 `background:var(--plum);color:#fff`；夜间 `.toast` 用 `surface`+`ink`（不可 `--ink`+白字翻转）；`.field textarea` 已补样式。
- **字体**：`FONTS` 只有 default / lxgwwk(霞鹜文楷)；`applyFont()` 写 `--f-ui/--f-serif/--font-ui/--font-serif`；字体卡预览必须 `el.style.setProperty('font-family', stack, 'important')`。主题页类名 `.ts-*/.tf*/.tc*`。
- **外观多端同步（v0.3.10）：服务端权威源**。`app_settings` 存 `theme/font/mode`，`GET /api/home` 返回 `appearance{}`；`renderHome()` 用 `applyAppearanceFromServer()` 覆盖本机，localStorage **只是首屏缓存**（`restoreAppearance()` 先渲染防闪）。显式切换 `pushAppearance(patch)` 即时 PUT。**改外观逻辑务必保持这条链路**。localStorage：`pf_theme`/`pf_font`/`pf_mode`。

## 验证脚本（优先复用；细节见当日日志）
- 起服务 `python -m http.server 8899`；页面 `http://localhost:8899/_preview/xxx.html`（**生成页一律输出到仓库根 `_preview/`，绝不能放 `public/`**）。
- 截图用 **playwright-core**（`~/.workbuddy/binaries/node/workspace/node_modules`；ESM 必须 `file:///` 绝对路径 import）。⚠️ **Edge `--headless=old` 的 `--window-size` 最小 ~500px**（设 390 实测 492）→ 窄屏必须用 playwright viewport；`--headless=new` 多实例频繁卡死。
- `test-theme.mjs`(色板对比度)；`test-medicines.mjs`(20)/`test-data-api.mjs`(27)/`test-password-api.mjs`(33)/`test-calendar.mjs`(25)/`test-ledger.mjs`(**48**)/`test-ledger-api.mjs`(**44**)：mock D1 或 DOM 断言。
- 体检页生成器：`gen-nightcheck.mjs`（夜间亮底巡检 relLum ≥0.28 报异常）、`gen-relpreview.mjs`、`gen-calpreview.mjs`、`gen-secpreview.mjs`、`gen-ledgerpreview.mjs`（+ `shot-*.mjs` 截图，`shot-part.mjs` 通用局部元素截图）。各页均有 hash 参数切视图/明暗。
- ⚠️ **改完 `index.html`（增删元素）必须重新生成所有 `_preview/` 体检页**（内嵌 HTML 快照，否则 app.js 绑定空值报错）。`_preview/`、`_probe/`、`demo/_*.png` 已 gitignore。

## Cloudflare Pages 坑
- ⚠️ **`wrangler pages deploy ./public` 原样上传 `public/` 下所有文件，`.gitignore` 无关** → 验证页绝不能放 `public/`。
- **文件/目录同名冲突 → error 1101**（`profile.js` 与 `profile/` 不能并存 → `profile/detail.js` + `/api/profile/detail?id=`）。
- **下划线 helper 必须与调用方同级**（`api/_helpers.js`），否则 esbuild `Could not resolve`。
- **删除路由**：`[id].js` 的 `onRequestDelete` 拿不到 `context.params.id` → **必须导出 `onRequest()` 并用 `url.pathname.match(/\/(\d+)/)` 解析**；v0.3.14 再加 **method 分派**（`PUT/PATCH`→`onRequestPut`、`DELETE`→`onRequestDelete`、其它 405），否则**任何方法都会走进删除**。
- `signToken` 必须先把 JSON 字符串 `TextEncoder().encode` 再 base64url。
- 未知路径返回 200（SPA 回退）→ **不能靠状态码判断文件存在**，要校验内容特征串。
- **SQLite `LIKE` 里 `_` 是通配符** → 别用 `NOT LIKE '_cf_%'`，改为 SQL 取 `type='table'` 后 JS `startsWith('sqlite_')/('_cf_')`。

## 数据表
`app_settings, habits, habit_logs, todos, transactions, medicines, events, contacts, sessions` + 人际关系 11 张 `contact_*` + `vocab`、`push_subscriptions`。建表 `schema.sql`，示例 `seed.sql`。
- `medicines`(v0.3.7)：`quantity` 语义模糊已弃用，新数据走 `dosage`+`stock`。

## 模块实现要点（只留易踩的坑）
- **日历中心（v0.2.7 → v0.3.12 周历改版）**：`lunar.js`（`lunarLabel()`/`lunarFull()`，1900–2100）。
  - 🔴 `.cal-week-grid` 必须**纵向堆叠**（`flex-direction:column`），每行 `.cal-hour` 才是 8 列 grid。旧版直接塞进 8 列 grid → 15 行被当 15 格横排换行。时间轴 **00–23 共 24 行**；`.cal-week-head` `sticky top:0`、`.hh`/`.wh-corner` `sticky left:0`。⚠️ **`.cal-week-grid` 不能加 `min-height:0`**（会压到小于 24 行且滚动容器不滚）。
  - **标题**：周历 `当前为YYYY年第N周`（`weekOfYear()` 以「含 1/1 的周日那周」为第 1 周）；月历 `YYYY年M月`；日期区间放 `#calEyebrow`。
  - 🔴 **`fitCalView()` 整屏自适应**：`#view-calendar` 高度 JS 实测写 inline = `innerHeight − (scrollY+rect.top) − .main-content 下 padding`，**刚好不出现滚动条**（**不要退回写死 `100vh - N`**）。配合 `#view-calendar.active{display:flex}` + `.cal-panel/#calViewBox/.cal-month-wrap{flex:1;min-height:0}` + `.cal-month-grid{grid-auto-rows:minmax(0,1fr)}` + `.mcell{min-height:0}`。resize 120ms 防抖。
- **我的账本（v0.3.14 全面增强）**：`app.js` 账本模块 + `functions/api/transactions.js`(+`[id].js`)。状态 `ledgerState={month,donutMode:'expense',flow:'all',cat:'',q:''}`（**不挂 window**）；数据 `ledgerData`(catStats/incomeCatStats/list/trend/accounts/payees/budget/summary/social)。功能：4 格概览 + 预算（存 `app_settings.ledger_budget`）+ 近 6 月趋势（**纯 HTML 柱**）+ 支出/收入双环图 + 三重筛选（flow/cat/q）流水 + 编辑删除 + 快捷金额/分类 chips/账户选择。`renderLedger/renderLedgerStats/renderBudget/renderTrend/renderDonut/renderTxnList`。
  - 🔴 **图形 SVG 尺寸必须由 CSS 类给出**（`.donut-svg{width:180px;height:180px;flex:0 0 auto}`）——全局 `svg{width:20px;height:20px}` 特异性(0,0,1) **高于 SVG 的 `width`/`height` 表现属性(特异性 0)**，会把环图压成 20×20（**v0.3.14 用户投诉的「支出构成显示异常」根因**；几何没坏，`getBBox()` 仍 120×120）。`.dseg{fill:none;stroke:var(--dc);stroke-width:22}`；中心文本 `.dt-lab`/`.dt-val`；扇形 `.dc0~.dc9`（日/夜两套 `--dn0..--dn9`）；图例是可点选筛选的 `<button class="dl">`。
  - 🔴 **流水分组前必须显式排序**（`.sort((a,b)=> a.date===b.date ? b.id-a.id : (a.date<b.date?1:-1))`），否则日期组头错乱。
  - **人情联动**：`t.account==='人情往来'` → 只读（无删除）+ 点整行 `jumpToContact(id)`；`getPayees` 用 `@人名` 反查 `contacts`（**最长名优先**）；`window.ledgerFocus(mode)`（`social`→cat='人情'、`social-loan`→'借还款'）；人际关系页 `pfGotoLedger(mode)` 跳账本并预置筛选。
  - `transactions.js` GET 另返回 `incomeCatStats`/`trend`（近 6 月 strftime 分组无数据补 0）/`accounts`/`payees`/`budget`/`social`/`summary.avgDaily`；导出 `CATEGORIES`(支出含「借还款」)/`ACCOUNTS`。
- **成长打卡（v0.2.1）**：`habits` + `habit_logs`(UNIQUE(habit_id,log_date))。unit 存「次/秒/分钟/小时」，**快捷按钮与标签必须跟随 unit**（`UNIT_STEPS`）。首页 `.habit-panel` v0.3.9 起面板内纵向堆叠。
- **家庭药箱（v0.3.7）**：`medicine.js` + `medicines.js` + `medicines/[id].js`。**临期=6 个自然月**（`new Date(y,m+6,d)`，**不用 180/184 天**）；四态 `expired/soon/safe/none`（`none` 不进临期/过期表）。暴露 `window.medRenderMedicine`/`medBindEvents`。
- **人际关系（v0.3.1）**：`profile.js` + `api/profile/*`。`_profile.js` 提供农历换算/`nextBirthday()`/`birthdayFromIdcard()`/`ageOf()`。三端联动：承诺→`todos`(list='人际关系')、人情→`transactions`(category='人情')、互动可同步 `events`。7 维筛选 + 搜索；`delete?id=N` 级联清 11 表 + R2。**字段坑**：列表与详情的 `nextBirthday` **都返回 `full`**（不是 `date`）；`PF.mode`=`detail`|`simple`；渲染用缓存 `PF.lastList`。
- **个人中心（v0.2.5 / v0.3.10）**：**子菜单是唯一入口**，页顶无标题无页签。5 个子页顺序 **site→style→data→security→sysinfo**（`PROFILE_TITLES`、两处菜单 HTML、`#page-*` 必须同步）。坑：`switchView('settings')` 内不可无条件 `switchProfileTab('site')`（会重置带参子页）→ 用 `currentProfileTab` + `switchView(name,{keepTab:true})`。坑：`.mnav-popover` 必须 `position:fixed`（`left/right:14px; bottom:calc(82px+env(safe-area-inset-bottom))`），否则以 6 列栅格一格为包含块只剩几十像素宽。账户安全 `DELETE /api/sessions/[sid]`（当前设备排最前 + `.dev-current-tag`）+ 改密弹窗 `#passModal`。
- **数据处理（v0.3.10）**：`api/data/{_tables,stats,export,clear}.js`。表清单**动态取自 `sqlite_master`**，排除 `sqlite_*`/`_cf_*` + `EXCLUDE={sessions,app_settings}`。`POST /api/data/clear` 需 `{confirm:'CLEAR_ALL_DATA'}`；**清空保留 `sessions`（防把自己踢下线）与 `app_settings`**。前端二次确认：`#ackBackup` → `#clearModal` 输「清空」。
- **十二时辰经络（v0.2.2）**：`SHICHEN` 12 项，`shichenOf(hour)=Math.floor(((hour+1)%24)/2)`。**会话/设备**：`sessions(sid PK/user/ip/user_agent/created_at/last_seen_at)`；`decodeToken()` 取**第一段 payload**；IP 取 `cf-connecting-ip` 或 `x-forwarded-for`。
- **待办优先级**：`priority`(P0-P3) 由 `important`/`urgent` 推导，后端 `priorityOf()`。

## 其他
- **邮件通知已放弃**（Pages Functions 无 TCP，SMTP 不可行）。
- 模块状态：个人首页、成长打卡、个人中心、日历中心、待办提醒、我的账本、人际关系、家庭药箱 均已补齐，无留白页。
