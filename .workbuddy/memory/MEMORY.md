# 数字生活 shuzishenghuo — 项目约定

## 技术栈与部署
- Cloudflare Pages（静态前端 `./public`）+ Pages Functions（`./functions`）+ D1（`shuzishenghuo`）+ R2（`shuzishenghuo`）。**非资料库托管**。
- 认证：`ADMIN_USER/ADMIN_PASS/SESSION_SECRET`，HMAC-SHA256 签名 Cookie（7天）；`_middleware.js` 校验 `/api/*`（仅 `/api/auth/login`、`/api/health` 公开）。校验后还查 `sessions` 表确认 sid 存在。
- 部署：`wrangler pages deploy ./public`；D1 迁移 `wrangler d1 execute shuzishenghuo --remote --file=./migrate-vX.Y.Z.sql`。仓库 `zwjdujin/shuzishenghuo`。
- **Git 推送用 SSH**（`git@github.com:zwjdujin/shuzishenghuo.git`），推送约 4 秒不弹窗。
  - 仓库级 `core.sshCommand` 已配，**必须保留**：`ssh -F "<abs>/.ssh-keys/ssh_config" -i "<abs>/.ssh-keys/id_ed25519" -o IdentitiesOnly=yes -o UserKnownHostsFile="<abs>/.ssh-keys/known_hosts" -o GlobalKnownHostsFile=NUL`
  - **`~/.ssh/` 是受保护路径**，「始终允许」无效。SSH 所有文件放项目内 `.ssh-keys/`（已 gitignore）。
  - 新机器需把 `.ssh-keys/id_ed25519.pub` 加到 GitHub，并 `ssh-keyscan github.com > .ssh-keys/known_hosts`。
- **PWA 缓存**：`public/js/sw.js` 静态资源走「网络优先」，**每次部署改 `CACHE` 名**（现 `shuzishenghuo-v4`）。否则旧缓存导致"改了没生效"。

## 前端约定
- 风格：暖色纸感背景、左侧 `.sidebar` 导航、卡片仪表盘、移动端 `.mobile-nav` 底部 Tab；纯内联 CSS/JS，零外部依赖；图标用 `#i-*` SVG sprite。
- **版本号规则** `主.次.修订`：主版本由用户特别说明才改；次版本每新增一个功能页面 +1；修订号每次修改 +1。
- **跨文件调用**：`<script src>` 非 ES module，**不能用 export/import**，必须 `window.xxx = xxx`。曾致 lunarLabel undefined 使日历整页空白。
- **`[hidden]` 兜底**：样式表顶部必须有 `[hidden]{display:none!important}`，否则作者样式的 `display` 会盖掉 `el.hidden=true`。

### 🔴 全局模块间距（最高优先级，用户强调过多次，严禁再犯）
**任何页面内模块之间必须有 22px 间隔**，每次新增页面/模块都要保证。
- 通用规则：`.view.active>*{margin-bottom:22px}` + `:last-child{margin-bottom:0}`。
- 通用规则**只作用于 `.view` 直接子元素**。结构若为 `.view > #container > .panel`（多包一层），**必须为该容器单独加规则**（如 `#relListView>*`、`#view-settings .profile-page>*`）。
- ⚠️ **已两次踩坑**（v0.3.2 `#relListView`、v0.3.6 `.profile-page`）。**加嵌套容器时顺手 grep 同类容器，一次性补全**。
- `display:flex;gap` 容器会与通用规则叠加，须改 `display:block` 或显式把子项 margin 归零。
- 容器 `margin:0` 时其后的兄弟模块会贴住，需给后者补 `margin-top`。

### 🔴 前端 JS 验证方法（`node --check` 不够）
1. `node --check` 只查语法，**查不出运行时未定义引用**（`FONTS is not defined` 能过语法检查却使页面全崩）。
2. 改完必须 grep 关键常量（THEMES/FONTS/currentFont/currentTheme/uiMode/lastAppliedMode）确认定义还在。
3. **Edit 的 old_string 必须足够唯一**（带上下文行）——曾因不唯一连带删掉上方 const 定义。
4. 线上验证用 Edge headless：`msedge.exe --headless=new --disable-gpu --virtual-time-budget=9000 --dump-dom <url>`，grep `Uncaught|fatal`、`data-mode`、关键节点。
5. **样式计算值验证**：起本地静态服务 → 测试页内 `getComputedStyle()` → Edge headless `--dump-dom` 取值。**测试页必须复刻真实祖先结构**，否则规则不生效会误判。
6. commit message 含反引号会被 bash 当命令执行报 `unexpected EOF`，**用 `git commit -F 文件`**。
7. **JS 作用域坑**：`const/let` 声明在 `if/else` 块内块外不可见，`node --check` 查不出。
8. **CSS 溢出坑**：flex 容器内 input/select 需 `width:100%;max-width:100%` + 父级 `min-width:0`，否则撑破弹窗边框。
9. **固定高度+border/padding**：除非 `box-sizing:border-box`，否则压缩内容盒导致"内容不居中"。分隔线放父容器。

### 🔴 改字段名必须全局搜索
v0.3.2 修了档案页 `nb.date`→`nb.full`，v0.3.3 发现列表页仍写 `b.date`，同一问题二次出现。**任何字段重命名必须 grep 全部引用处一并改**。

### 外观设置
- `THEMES` 共 **23 种**（18 中国传统色 + 5 经典），格式 **`{base 突显色, soft 底色, ink 字体色, label}`**，**无 group 分组**。soft = base 向白混合 87%；ink = base 加深 30%。数据源 https://api.dujin.org/colors/cn-colors/ 。**改配色必须保留原 5 种经典**，否则老用户 localStorage 主题失效。
- `applyTheme()` 写 `--plum`/`--plum-soft`/`--accent`/`--tint`/`--on-accent`/`--plum-deep`。
- **字体切换必须用 `!important` 覆盖层**：项目大量 `font:xxx serif` **简写**，裸 `serif` 不跟随变量且 `font:` 简写会重置 font-family 切断继承链。故 `--f-ui`/`--f-serif` + 全局 `font-family:...!important`（正文组 + 标题组两条）。`applyFont()` 同时写两组；预览卡 `.fo-name` 需内联 `!important`。
- **夜间模式**：大量元素硬编码 `background:#fffdfa`（不跟随变量），**新增样式时必须同时补** `html[data-mode="night"] .xxx{background:var(--card)!important;color:var(--ink)!important}`，否则深底浅字/亮色残留。
- `sunTimes(lat,date)` 日出日落估算（赤纬+时角简化算法）+ `uiMode`(light/night/auto)，auto 每分钟检查。夜间通过 `html[data-mode="night"]` 覆写变量 + 硬编码 background 元素。
- `FONTS` 三项：default / lxgwwk(霞鹜文楷, Google Fonts) / lhls(临海隶书, 回退)。
- 持久化 localStorage：`pf_theme` / `pf_font` / `pf_mode`，启动时 `restoreAppearance()` 恢复。

## Cloudflare Pages 特有的坑
- **文件/目录同名冲突 → error code 1101**：`functions/api/profile.js` 与 `functions/api/profile/` 不能并存，已改为 `profile/detail.js`，前端调 `/api/profile/detail?id=`。
- **下划线前缀文件放错目录 → esbuild `Could not resolve`**：共享 helper 必须放 `functions/api/_helpers.js`（与调用方同级），`habits.js` 用 `./_helpers.js`、`habits/[id].js` 用 `../_helpers.js`；**不能放子目录里**。
- **删除路由坑**：`onRequestDelete` + `[id].js` 拿不到 `context.params.id`（400/405）。**必须导出 `onRequest()`，用 `url.pathname.match(/\/events\/(\d+)/)` 解析**（见 events/[id].js、transactions/[id].js、todos/[id]/delete.js）。
- `signToken` 必须把 JSON 字符串先 `TextEncoder().encode` 再 base64url，否则 payload 为空。
- 本地验证：Node + mock D1 跑 `functions/api/*` 处理器。

## 数据表
`app_settings, habits, habit_logs, todos, transactions, medicines, events, contacts, sessions`。建表见 `schema.sql`，示例见 `seed.sql`。
- `medicines`（v0.3.7 扩展）：id / name / efficacy(功效) / spec(规格) / dosage(用量) / form(剂型) / expiry(效期) / category / location / manufacturer / stock / stock_min / for_whom / rx(处方药) / open_date / price / quantity / note。原 `quantity` 语义模糊已弃用，新数据走 dosage+stock。

## 模块实现要点
- **家庭药箱（v0.3.7）**：`public/js/medicine.js`（app.js 前引入）+ `functions/api/medicines.js` + `medicines/[id].js`。
  - **临期定义：6 个月，按自然月加**（`new Date(y, m+6, d)`），**不用 180/184 天**，否则边界差几天。已测：正好 6 个月算临期，6 个月零 1 天算正常。
  - 四态：`expired`(days<0) / `soon`(≤6个月) / `safe` / `none`(未填效期，不进临期/过期表)。
  - 前端暴露 `window.medRenderMedicine` / `window.medBindEvents`（app.js 末尾调用）。
  - 页面含：录入弹窗 + 统计卡(5) + 筛选栏 + 药品一览 + 临期一览 + 过期一览 + 分类统计 + 位置分布 + 常备清单。
  - **踩坑**：项目里 `.inp` 类**原先没有通用样式**（只有 `.rel-search .inp`），新页面用 `class="inp"` 会渲染成裸输入框。已在 style.css 补通用规则。
  - 迁移 `migrate-v0.3.7.sql` 含 16 条示例数据（含 2 条过期、3 条临期、1 条库存为 0），便于首次打开看效果。
  - 本地测试 `scripts/test-medicines.mjs`（mock D1 跑 20 项断言，含 6 个月边界与空态）。

- **人际关系（v0.3.1）**：`public/js/profile.js`（~1300行，app.js 前引入）+ `functions/api/profile/*`。
  - `_profile.js` 提供农历换算(1900-2100 LUNAR_INFO)、`nextBirthday()`、`birthdayFromIdcard()`、`ageOf()`。
  - 三端联动：承诺→`todos`(list='人际关系',person_id)；人情→`transactions`(category='人情',note='@姓名')；互动可同步 `events`。
  - `contacts` 扩展列：alias/gender/province/city/idcard/idcard_birthday/show_lunar/level/job/company/status/native/page。
  - 列表 7 维筛选：姓氏/性别/年龄段/关系/省份/城市/亲疏 + 关键词搜索。
  - 多联系方式点×：删除 / 弃用(显示"(已弃用)") / 取消。
  - 删除：`DELETE /api/profile/delete?id=N`，级联清理 11 张档案表 + R2 附件 + 承诺 todos + 人情 transactions，他人 `ref_id` 置空防死链。
  - **字段名坑**：列表与详情的 `nextBirthday` **都返回 `full`**（不要用 `date`）。列表额外返回 `phone`（未弃用的首个 phones）。
  - 显示切换：`PF.mode` = `detail`(一行一个：昵称/性别/年龄/关系/亲疏/省市/职业/手机/公历+农历生日) | `simple`(grid auto-fill minmax(150px,1fr)，仅姓名+手机)。用缓存 `PF.lastList` 重渲染。
- **个人中心（v0.2.5）**：**子菜单是唯一入口**，页面顶部无标题无页签。
  - 侧栏 `#profileBtn`（`.local-card` 下方）→ 向上弹 `#profilePopover`（`.pp-item` 带 `data-ptab`：site/style/security/sysinfo）。移动端 `.mnav-profile > #profileBtnMobile`（文案「我的」）→ `#profilePopoverMobile`。
  - `PROFILE_MENUS` 数组 + `closeAllProfilePopovers()` 管理；点击走 `openProfileTab(name)`。
  - **坑**：`switchView('settings')` 内不可无条件 `switchProfileTab('site')`（会重置带参进入的子页）。用 `currentProfileTab` 记忆 + `switchView(name,{keepTab:true})`。导航委托里 `navEl.id !== 'profileBtnMobile'` 排除移动端「我的」。
  - `#view-settings` 子页容器 `.profile-page`(id=page-site/style/security/sysinfo)。
  - 站点信息页 `GET/PUT /api/settings` 读写 `app_settings`(白名单 brand_name/brand_avatar/brand_tagline/theme)。
  - 账户安全页 `renderSessions()` + `DELETE /api/sessions/[sid]`；退出 `#logoutBtn2`。
  - 系统信息页 `renderSysInfo()`：后端 `GET /api/sysinfo`(instance+health+D1 探测耗时；`request.cf.colo`) + 客户端 `collectClientInfo()`；同步 `markSynced()`。
- **成长打卡（v0.2.1）**：
  - `habits`：category / type('normal'|'sleep') / method('count'|'duration') / target&unit / bed_time&rise_time&nap_time（nap 为「12:30-14:00」区间）。
  - `habit_logs`：done(normal 存累计值；sleep 存完成项数) / done_bed / done_rise / done_nap(0/1)；UNIQUE(habit_id, log_date)。
  - 默认分类=学习/锻炼/睡眠（睡眠三件套各算 1 项，凑 3 项 todayDone）；支持自定义分类。
  - 后端：`GET/POST /api/habits`、`PUT /api/habits/[id]`、`POST /api/habits/[id]/check`(body {field:'done'|'bed'|'rise'|'nap', value})、`DELETE /api/habits/[id]`、`GET /api/habits/heatmap?days=60`。
  - **单位**：unit 存「次/秒/分钟/小时」。前端 `#unitSelect` 按 method 动态填充（`fillUnitOptions`/`syncMethodUI`）；快捷按钮与输入框单位标签必须跟随 unit（`UNIT_STEPS={秒:[10,20,30],分钟:[15,30,60],小时:[1,2,3]}`），不可硬编码。
  - 共享 helper `progressOf`、`parseHabitBody` 在 `functions/api/_helpers.js`。
  - 打卡卡片 `.ci-actions` 固定 `width:210px`；睡眠三件套 `.tri` 类 flex:1 均分；移动端纵向两行、操作区 `width:100%`。
- **日历/待办/账本（v0.2.7）**：
  - 农历：`public/js/lunar.js` 独立模块（app.js 前引入）。`lunarLabel(date)` 初一显示月名/其余日名、节气优先；`lunarFull(date)` 含干支生肖。1900–2100 压缩表算法，已校验。
  - 日历：`CAL_COLOR` 四类配色；周历 8–22 点时间轴、月历整月网格；点格子新增、点事件编辑、双击或弹窗内删除。v0.3.0 月历高度压缩。
  - 账本：`renderDonut()` 内联 SVG 环图；**支出红收入绿**（国内习惯）。
- **待办优先级（v0.2.8）**：`todos` 除 `priority`(P0/P1/P2/P3) 外还有 `important`/`urgent` 独立维度，priority 由二者推导（P0=1+1,P1=1+0,P2=0+1,P3=0+0）。后端 `PRIORITY_META` + `priorityOf()`；GET 支持 `priority` 逗号多选 + `list` 单选，按 `CASE priority` 排序，响应含 `counts`。前端筛选栏 `#tfPriority`/`#tfList`，状态 `todoFilter`。
- **十二时辰经络（v0.2.2）**：`SHICHEN` 数组(12 项 name/range/meridian/tip)，`shichenOf(hour)` 用 `Math.floor(((hour+1)%24)/2)`；`renderShichen()` 写 `#dayBadge`、`.score-orbit` 内 `.shichen-range`、`#heroGreeting` 显示经络、`#heroSummary` 显示养生口诀。数据源 https://www.dujin.org/6100.html。
- **会话/设备（v0.2.2）**：`sessions`(sid PK/user/ip/user_agent/created_at/last_seen_at)。`signToken(user,secret,ttlMs,extra)` 支持额外字段，登录生成 sid 落库；`decodeToken(token)` 取**第一段 payload**（格式 `payload.sig`，勿取第二段）。IP 取 `cf-connecting-ip` 或 `x-forwarded-for`。`parseDevice(ua)` 在 sessions.js。

## 其他备忘
- **邮件通知（已放弃，勿重复尝试）**：Cloudflare Pages Functions 无 TCP 能力，SMTP 无法直连。唯一可行路径是 HTTP 邮件 API（Resend / SendGrid / Cloudflare Email binding），用 `fetch()` 调用。用户 v0.2.8 已确认暂不做。
- **模块状态**：个人首页、成长打卡、个人中心、日历中心、待办提醒、我的账本、人际关系、**家庭药箱(v0.3.7)** 均已补齐，**已无留白页**。
- **PWA 缓存名实际已到 v20**（历史记录里写的 v4/v19 已过时，以 `public/js/sw.js` 里 `const CACHE =` 为准）。
