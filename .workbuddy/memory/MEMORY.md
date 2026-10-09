# 数字生活 shuzishenghuo — 项目约定

## 技术栈与部署
- Cloudflare Pages（静态 `./public`）+ Pages Functions（`./functions`）+ D1（`shuzishenghuo`）+ R2（`shuzishenghuo`）。**非资料库托管**。
- 认证：`ADMIN_USER/ADMIN_PASS/SESSION_SECRET`，HMAC-SHA256 签名 Cookie（7 天）。`_middleware.js` 校验 `/api/*`（仅 `/api/auth/login`、`/api/health` 公开），再查 `sessions` 表确认 sid。
- 部署：`export PATH="$HOME/.bun/bin:$PATH"` → `wrangler pages deploy ./public --project-name=shuzishenghuo --branch=main --commit-dirty=true`；迁移 `wrangler d1 execute shuzishenghuo --remote --file=./migrate-vX.Y.Z.sql`。仓库 `zwjdujin/shuzishenghuo`。
- **Git 用 SSH 推送**（约 4 秒）。仓库级 `core.sshCommand` **必须保留**：`ssh -F "<abs>/.ssh-keys/ssh_config" -i "<abs>/.ssh-keys/id_ed25519" -o IdentitiesOnly=yes -o UserKnownHostsFile="<abs>/.ssh-keys/known_hosts" -o GlobalKnownHostsFile=NUL`。`~/.ssh/` 是受保护路径（「始终允许」无效）→ 全部放项目内 `.ssh-keys/`（已 gitignore）；新机器需加 pub key 到 GitHub 并 `ssh-keyscan github.com > .ssh-keys/known_hosts`。
- **commit message 含反引号会被 bash 执行** → 必须 `git commit -F _msg.txt`（已 gitignore）。
- ⚠️ **本仓库有另一个会话在并发提交/部署**（曾自动提交掉我的 app.js 改动）。**发版前先 `git status` + `git diff --stat` 复核改动是否还在**。

## 前端约定
- 风格：暖色纸感背景、左侧 `.sidebar`、卡片仪表盘、移动端 `.mobile-nav` 底部 Tab；纯内联 CSS/JS 零依赖；图标用 `#i-*` SVG sprite。
- **版本号** `主.次.修订`：主版本由用户指定才改；次版本每新增功能页 +1；**修订号每次修改 +1**。
- 脚本顺序：`lunar.js` → `profile.js` → `medicine.js` → `app.js`。非 ES module，**跨文件不能用 export/import，必须 `window.xxx = xxx`**（曾致 `lunarLabel is not defined` 整页空白）。
- 样式表顶部必须有 `[hidden]{display:none!important}`，否则作者样式 `display` 会盖掉 `el.hidden=true`。

### 🔴 全局模块间距（用户强调过多次，严禁再犯）
**页面内模块之间必须 22px 间隔。** 通用规则 `.view.active>*{margin-bottom:22px}` + `:last-child{margin-bottom:0}` **只作用于 `.view` 直接子元素**；若结构为 `.view > #container > .panel`（多包一层）**必须为该容器单独加规则**（`#relListView>*`、`#view-settings .profile-page>*`）。已两次踩坑 → **加嵌套容器时顺手 grep 同类容器一次性补全**。`display:flex;gap` 容器会与通用规则叠加 → 改 `display:block` 或子项 margin 归零；容器 `margin:0` 时其后兄弟会贴住，需补 `margin-top`。

### 🔴 前端 JS/CSS 验证方法（`node --check` 不够）
1. `node --check` 只查语法，**查不出运行时未定义引用**（`FONTS is not defined` 能过检查却全崩），也查不出 `const/let` 块级可见性错误。改完必须 grep 关键常量（THEMES/FONTS/currentFont/currentTheme/uiMode/lastAppliedMode）确认定义还在。
2. **Edit 的 old_string 必须足够唯一**（带上下文行）——曾因不唯一连带删掉上方 const。
3. **样式计算值验证**：起本地静态服务 + 页面内 `getComputedStyle()` + Edge headless `--dump-dom` 取 `id="report2"` 的值。测试页必须复刻真实祖先结构。
4. **Edge 用 `--headless=old`**：`--headless=new` 截图/多实例**频繁卡死**（批量 10 张挂 13 分钟只出 2 张）。配 `--no-first-run --disable-extensions --user-data-dir=<tmp>` + `timeout 60`。
5. 「改了没生效」先怀疑 CSS 过渡：探测前注入 `*{transition:none!important}`，否则取到动画中间帧（曾误判）。
6. **Node 里 `str.replace(a, inject)` 会吃掉替换串的 `$`**（`$$(...)`→`$(...)`，`$&`/`$'` 有特殊含义）→ **必须用函数形式 `replace(a, () => inject)`**。
7. **重复调用的 `build*()` 里别用 `addEventListener`**：监听器会成倍累积（`buildModeOpts` 曾在每次点击后重新绑定 → toast 越弹越多）。改用 `el.onclick = ...` 赋值（幂等）。

### 🔴 改字段名必须全局搜索
任何字段重命名必须 grep 全部引用处一并改（v0.3.2 修了 `nb.date`→`nb.full`，v0.3.3 发现列表页仍写 `b.date`）。

## 🎨 主题与夜间模式（v0.3.8 新架构 + v0.3.9 令牌化；勿参考旧 23 色方案）
- 页面：个人中心子页「**主题风格**」（`PROFILE_TITLES.style`，旧名「风格字体」已废弃），`#page-style`。
- `CN_COLORS` 共 **18 种中国传统色**，只存 `{key,label,base}`；`THEMES` 由 `dayPalette(base)`/`nightPalette(base)` 运行时派生。数据源 https://api.dujin.org/colors/cn-colors/。
- 派生（`hexToHsl`/`hslToHex`/`relLum`/`lumToLightness`）**必须用 WCAG 相对亮度约束对比度**，不能用 HSL 明度（黄色 L=56% 仍极亮）。日间主色 `= min(原明度, 达到 relLum .145 的明度)`；夜间主色 `= 达到 relLum .20 的明度`（18 色实测最低 4.05:1）。**`nightPalette().surface = hsl(h, min(s*.46,24), 14.5)`**，比 card(L=10) 亮一档。
- **CSS 令牌映射**：`:root` 声明 `--t-day-*`/`--t-night-*`（由 `applyTheme()` 写 inline，CSS 给默认主题兜底），再由 `:root` 与 `html[data-mode="night"]` 映射到 `--paper/--card/--ink/--muted/--line/--side/--plum/--plum-soft/--plum-deep/--accent/--tint`。**切明暗无需重选主题**。
- **`--surface`（v0.3.9 核心约定）**：日间固定 `#fffdfa`，夜间 `var(--t-night-surface, var(--t-night-surface-fallback))`。**所有「次级容器」——列表行/输入框/次级按钮/分段按钮/标签/日历单元格——一律 `var(--surface)`**，不写死近白、也不加进夜间白名单。
- 语义令牌：`--danger-soft/--danger-line/--danger-tint/--warn-soft/--warn-ink`（逾期行/P0 药丸/删除 hover/提醒）；六色图标底 `--terra/sage/sand/clay-soft` 夜间统一压到与卡片同档暗色，只靠色相区分。
- **夜间白名单只留一级面板**：`.sidebar/.side/.panel/.pf-hero/.modal-card/.local-card/.habit-card/.stat-card` → `background:var(--card)!important`。**新增二级容器不要再加**（这正是「夜间发亮」的根因）。
  - **`.hero-card` 故意不在白名单**：它自带主题渐变 `var(--hero)`（`--t-day-hero`/`--t-night-hero`，由 `applyTheme()` 按当前国色派生；日=主色→突显色，夜=night soft→card）。加了白名单会把渐变压成纯卡片色。
  - 六色图标 `.stat-icon.*` 一律用 `--*-soft` 令牌；「有逾期」提醒态用 `.stat-icon.alert`（`--danger-tint`），**禁止再用 JS 写内联 `style.background`**（v0.3.9 前的 `#fdf0ee` 就是夜间亮粉的根因）。
- 坑：`.seg-item.active` 曾有夜间 `color:#fff` 却无选中态底色 → 白字白底不可见（v0.3.9 已补 `background:var(--plum)`）。夜间 `.toast` 不可用 `background:var(--ink);color:#fff` 翻转配色（夜间 `--ink` 本身浅 → 白药丸），已改 `surface`+`ink`。`.field textarea` 原无样式会露默认白底，已补。
- **字体**：`FONTS` 只有 default / lxgwwk(霞鹜文楷, Google Fonts)（`lhls` 已删）；`applyFont()` 写 `--f-ui/--f-serif/--font-ui/--font-serif`。字体卡预览字样必须 `el.style.setProperty('font-family', stack, 'important')`，否则被全站 `span{font-family:var(--f-ui)!important}` 压掉。主题页类名 `.ts-*/.tf*/.tc*`（旧 `.mode-opt/.font-opt/.thm/.theme-grid` 已删）。
- **外观多端同步（v0.3.10）：服务端是权威源**。`app_settings` 存 `theme/font/mode`，`GET /api/home` 返回 `appearance{theme,font,mode}`；`renderHome()` 用 `applyAppearanceFromServer()` 覆盖本机，**localStorage 只是首屏缓存**（`restoreAppearance()` 先渲染避免闪默认色）。用户显式切换配色/字体/明暗时 `pushAppearance(patch)` 即时 PUT `/api/settings`。**改外观逻辑务必保持这条链路，否则手机端不会跟随电脑端。**
- `sunTimes()` 日出日落估算 + `uiMode`(light/night/auto) 每分钟检查；`applyUIMode()` 变化时同步 `syncThemeColor()` 与 `#modeNow`。localStorage：`pf_theme`/`pf_font`/`pf_mode`。

## 验证脚本（优先复用）
- `scripts/test-theme.mjs`：抽取 app.js 真实色板代码跑对比度自检，18 色 + 夜间容器面断言。
- `scripts/gen-nightcheck.mjs`：**离线核查页**。复用真实 `index.html`（去 script）+ `style.css`，注入样例数据与探测脚本，输出逐元素计算样式/WCAG 对比度 + Hero 背景 + **移动端菜单几何** + **自动巡检「夜间仍亮底」元素**（相对亮度 ≥0.28 报异常）。hash：`#<light|night>-view-<view>[-ptab-<子页>][-modal-clear]`。用法：本地静态服务 → Edge `--headless=old --dump-dom`。
- `scripts/test-medicines.mjs`(20 项) / `scripts/test-data-api.mjs`(27 项)：mock D1 跑后端断言。
- `public/_*.html` 已 gitignore（本地验证页不可部署）。

## Cloudflare Pages 坑
- **文件/目录同名冲突 → error 1101**（`profile.js` 与 `profile/` 不能并存，已用 `profile/detail.js` + `/api/profile/detail?id=`）。
- **下划线 helper 放错目录 → esbuild `Could not resolve`**：共享 helper 必须在 `functions/api/_helpers.js`（与调用方同级），`habits.js` 用 `./_helpers.js`、`habits/[id].js` 用 `../_helpers.js`。
- **删除路由**：`onRequestDelete` + `[id].js` 拿不到 `context.params.id` → **必须导出 `onRequest()` 并用 `url.pathname.match(/\/events\/(\d+)/)` 解析**。
- `signToken` 必须把 JSON 字符串先 `TextEncoder().encode` 再 base64url，否则 payload 为空。
- 未知路径返回 200（SPA 回退），**不能靠状态码判断文件是否存在**，要校验内容特征串。
- **SQLite `LIKE` 里 `_` 是单字符通配符**：别用 `name NOT LIKE '_cf_%'` 过滤内置表（会误伤），改为 SQL 只取 `type='table'`，再在 JS 里 `startsWith('sqlite_')/('_cf_')` 白名单化。

## 数据表
`app_settings, habits, habit_logs, todos, transactions, medicines, events, contacts, sessions` + 人际关系 11 张 `contact_*` 表 + `vocab`、`push_subscriptions`。建表 `schema.sql`，示例 `seed.sql`。
- `medicines`(v0.3.7)：name/efficacy/spec/dosage/form/expiry/category/location/manufacturer/stock/stock_min/for_whom/rx/open_date/price/quantity/note。原 `quantity` 语义模糊已弃用，新数据走 dosage+stock。

## 模块实现要点
- **家庭药箱（v0.3.7）**：`public/js/medicine.js` + `functions/api/medicines.js` + `medicines/[id].js`。**临期=6 个自然月**（`new Date(y, m+6, d)`，**不用 180/184 天**）；四态 `expired/soon/safe/none`（`none` 不进临期/过期表）。暴露 `window.medRenderMedicine`/`window.medBindEvents`。迁移 `migrate-v0.3.7.sql` 含 16 条示例。
- **人际关系（v0.3.1）**：`public/js/profile.js` + `functions/api/profile/*`。`_profile.js` 提供农历换算(1900-2100)/`nextBirthday()`/`birthdayFromIdcard()`/`ageOf()`。三端联动：承诺→`todos`(list='人际关系',person_id)、人情→`transactions`(category='人情')、互动可同步 `events`。`contacts` 扩展 alias/gender/province/city/idcard/idcard_birthday/show_lunar/level/job/company/status/native/page；7 维筛选 + 搜索；`DELETE /api/profile/delete?id=N` 级联清 11 表 + R2。**字段坑**：列表与详情的 `nextBirthday` **都返回 `full`**（不是 `date`），列表另返 `phone`；渲染用缓存 `PF.lastList`；`PF.mode` = `detail`|`simple`（全部联系人右侧的详细/精简）。
- **个人中心（v0.2.5 / v0.3.10）**：**子菜单是唯一入口**，页顶无标题无页签。侧栏 `#profileBtn`→`#profilePopover`、移动端 `#profileBtnMobile`→`#profilePopoverMobile`；`PROFILE_MENUS` + `closeAllProfilePopovers()` + `openProfileTab()`。
  - **5 个子页顺序** site(站点信息)→style(主题风格)→**data(数据处理,v0.3.10)**→security(账户安全)→sysinfo(系统信息)；`PROFILE_TITLES`、两处菜单 HTML、`#page-*` 必须同步。
  - **坑**：`switchView('settings')` 内不可无条件 `switchProfileTab('site')`（会重置带参进入的子页）→ 用 `currentProfileTab` + `switchView(name,{keepTab:true})`，导航委托里排除 `navEl.id !== 'profileBtnMobile'`。
  - **坑（手机端子菜单被压窄）**：`.mnav-popover` 必须 `position:fixed`。它被包在 `.mnav-profile{position:relative}` 里，而后者只是 `.mobile-nav` 6 列栅格的**一格** → absolute 会以那一小格为包含块，菜单只剩几十像素宽。fixed 后：`left/right:14px; bottom:calc(82px + env(safe-area-inset-bottom))`（8px 边距 + 64px 底栏 + 10px 间隙）。
  - 站点信息 `GET/PUT /api/settings`；账户安全 `renderSessions()`+`DELETE /api/sessions/[sid]`（当前设备排最前 + `.dev-current-tag` 主色药丸）；系统信息 `GET /api/sysinfo`+`collectClientInfo()`。
- **数据处理（v0.3.10）**：`functions/api/data/{_tables,stats,export,clear}.js`（`_tables.js` 为共享 helper，下划线前缀不路由）。表清单**动态取自 `sqlite_master`**，排除 `sqlite_*`/`_cf_*` + `EXCLUDE={sessions,app_settings}`。
  - `GET /api/data/stats` 计数；`GET /api/data/export` 附件流下载全量 JSON（含 `settings` 与中文 `labels`）；`POST /api/data/clear` 需 `{confirm:'CLEAR_ALL_DATA'}` 否则 400。
  - **清空保留 `sessions`**（否则把自己踢下线）与 `app_settings`（品牌/外观）；管理员账号密码在环境变量里本就不在库中；清空后重置 `sqlite_sequence`（失败可忽略）。
  - 前端：勾选 `#ackBackup` 才解禁 `#clearDataBtn` → `#clearModal` 内输入「清空」才解禁 `#clearConfirmBtn`（二次确认）。
- **成长打卡（v0.2.1）**：`habits`(category/type normal|sleep/method count|duration/target&unit/bed_time&rise_time&nap_time) + `habit_logs`(done/done_bed/done_rise/done_nap，UNIQUE(habit_id,log_date))。API：`/api/habits`(GET/POST)、`/api/habits/[id]`(PUT/DELETE)、`POST /api/habits/[id]/check`({field})、`GET /api/habits/heatmap?days=60`。unit 存「次/秒/分钟/小时」，快捷按钮与标签必须跟随 unit（`UNIT_STEPS`）；helper `progressOf`/`parseHabitBody`。`.ci-actions` 固定 `210px`，睡眠三件套 `.tri` flex:1；**首页 `.habit-panel` 仅 1 列宽，v0.3.9 起面板内纵向堆叠**。
- **日历/待办/账本（v0.2.7）**：`lunar.js` 独立模块（`lunarLabel()`/`lunarFull()`，1900–2100 压缩表已校验）。日历 `CAL_COLOR` 四类配色、周历 8–22 点时间轴 + 月历整月网格。账本 `renderDonut()` 内联 SVG 环图，**支出红收入绿**。
- **待办优先级（v0.2.8）**：`priority`(P0-P3) 由 `important`/`urgent` 推导（P0=1+1,P1=1+0,P2=0+1,P3=0+0）。后端 `PRIORITY_META`+`priorityOf()`；GET 支持 `priority` 逗号多选 + `list` 单选，按 `CASE priority` 排序，响应含 `counts`。
- **十二时辰经络（v0.2.2）**：`SHICHEN` 12 项，`shichenOf(hour)=Math.floor(((hour+1)%24)/2)`；`renderShichen()` 写 `#dayBadge`/`.score-orbit`/`#heroGreeting`/`#heroSummary`。
- **会话/设备（v0.2.2）**：`sessions`(sid PK/user/ip/user_agent/created_at/last_seen_at)；`decodeToken()` 取**第一段 payload**（格式 `payload.sig`）；IP 取 `cf-connecting-ip` 或 `x-forwarded-for`。

## 其他备忘
- **邮件通知（已放弃，勿重复尝试）**：Pages Functions 无 TCP，SMTP 不可行；只能走 HTTP 邮件 API + `fetch()`。用户已确认暂不做。
- **模块状态**：个人首页、成长打卡、个人中心、日历中心、待办提醒、我的账本、人际关系、家庭药箱 均已补齐，**无留白页**。
- **PWA 缓存**：`public/js/sw.js` 静态资源「网络优先」，**每次部署改 `CACHE` 名**（现 `shuzishenghuo-v23`）。以文件里 `const CACHE =` 为准，历史记录里的旧值不可信。
