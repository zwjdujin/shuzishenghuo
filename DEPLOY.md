# 数字生活 · 零基础部署指南

手把手把「数字生活」部署到你自己的 Cloudflare 账号，全程不需要写代码。整个过程大约 20~30 分钟，其中大部分是等待。完成后你会得到一个只属于你的网址，数据全部存在你自己的账号里。

> 部署中遇到问题直接跳到文末「常见问题」。

---

## 0. 准备工作

1. **注册 Cloudflare 账号**：打开 [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)，用邮箱注册即可，**免费套餐就够用**。
2. **安装 Node.js**：打开 [nodejs.org](https://nodejs.org/)，下载并安装 **LTS 版本**（22 或更高）。安装后在 Windows 按 `Win+R` 输入 `cmd` 回车（macOS 打开「终端」），输入 `node -v` 能显示版本号即成功。
3. **安装命令行工具 wrangler**：在终端里执行：

   ```bash
   npm install -g wrangler
   wrangler login
   ```

   执行 `wrangler login` 会自动打开浏览器，点「Allow / 允许」授权。

4. **拿到代码**：点击仓库右上角 **Fork** 把项目复制到自己的 GitHub 账号（后续 Cloudflare 会从这里读代码）。如果不用 GitHub，也可以直接用本文第 8 节的一键脚本。

---

## 1. 创建 D1 数据库

D1 是 Cloudflare 的云端数据库，所有数据（账本、药品、联系人……）都存在这里。

**方式 A：网页控制台（推荐新手）**

1. 打开 Cloudflare 控制台 → 左侧 **存储和数据库 → D1 SQL 数据库** → **创建数据库**。
2. 数据库名称填 `shuzishenghuo`，位置随便（建议 APAC），点创建。
3. 创建后进入数据库详情页，找到 **数据库 ID**（一串形如 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` 的字符），**复制保存**，下一步要用。

**方式 B：命令行**

```bash
wrangler d1 create shuzishenghuo
# 命令输出里会打印 database_id，复制保存
```

**重要**：打开项目根目录的 `wrangler.toml`，把第 9 行的 `database_id = "…"` 替换成**你自己刚复制的**数据库 ID。不替换的话，页面会连到一个不存在的库，所有接口报错。

---

## 2. 创建 R2 存储桶

R2 用来存联系人附件（照片/视频/文档）。

**方式 A：控制台** —— 左侧 **存储和数据库 → R2 对象存储** → 第一次使用会要求开通（免费额度 10GB，无需绑卡）→ **创建存储桶**，名称填 `shuzishenghuo`。

**方式 B：命令行**

```bash
wrangler r2 bucket create shuzishenghuo
```

> 不需要附件功能也可以先跳过这一步，但对应绑定要保留，否则部署会报错。

---

## 3. 连接仓库到 Cloudflare Pages

1. Cloudflare 控制台 → **Workers 和 Pages** → **创建** → 选 **Pages** 标签 → **连接到 Git**。
2. 首次会要求授权 GitHub，允许访问你 Fork 的仓库。
3. 仓库列表选中 `shuzishenghuo` → **开始设置**，构建配置填：
   - **项目名称**：随意（它决定你的网址，如 `shuzishenghuo` → `shuzishenghuo.pages.dev`）
   - **生产分支**：`main`
   - **框架预设**：None
   - **构建命令**：**留空**
   - **构建输出目录**：`public`
4. 先别急着保存部署——展开 **环境变量（高级）**，先添加三个变量（见下一节），再点 **保存并部署**。

---

## 4. 配置环境变量（管理员账号）

| 变量名 | 填什么 | 说明 |
| --- | --- | --- |
| `ADMIN_USER` | 你的登录用户名 | 例如 `admin`，建议不要用默认值 |
| `ADMIN_PASS` | 你的登录密码 | 自己设一个强密码，这是以后登录站点的凭据 |
| `SESSION_SECRET` | 一串随机字符 | 用来加密登录状态。终端执行 `openssl rand -hex 32` 生成；没有 openssl 就随便敲一长串字母数字（40 位以上） |

> 这些就是站点的管理员账号，之后在网页里也能改（个人中心 → 数据安全）。

---

## 5. 绑定数据库与存储桶

部署完成后，进入 Pages 项目 → **设置** → **绑定**（Bindings）：

1. 点 **添加** → 选 **D1 数据库**：变量名填 `DB`，选择你第 1 节创建的 `shuzishenghuo`。
2. 点 **添加** → 选 **R2 存储桶**：变量名填 `BUCKET`，选择 `shuzishenghuo`。
3. 保存后 Cloudflare 会提示**重新部署**，点确定。

---

## 6. 初始化数据库（首次必做）

部署成功只是把代码放上去了，数据库里还没有表。在终端执行：

```bash
wrangler d1 migrations apply shuzishenghuo --remote
```

看到 `0001 … ✅` 到 `0008 … ✅` 全部勾上即成功。以后每次升级新版本，也是跑同一条命令——它有执行记录，只会应用没跑过的部分，**不会动你已有的数据**。

---

## 7. 打开站点登录

浏览器访问 `https://你的项目名.pages.dev`，用第 4 节设置的用户名密码登录。进去后建议先做两件事：

1. **个人中心 → 数据安全**：下载一份全量备份，确认数据通路正常。
2. **个人中心 → 主题风格**：挑一个自己喜欢的配色。

---

## 8. 一键脚本（可选，不用 GitHub）

如果不想走 Git，仓库里带了全自动脚本（会自动创建缺失的 D1/R2 并替换 `wrangler.toml` 里的 ID）：

```bash
CLOUDFLARE_API_TOKEN=你的API令牌 \
CLOUDFLARE_ACCOUNT_ID=你的账户ID \
ADMIN_PASS=你的管理员密码 \
bash scripts/deploy-cloudflare.sh
```

API 令牌在 Cloudflare 控制台 → **我的个人资料 → API 令牌 → 创建令牌**（用「编辑 Cloudflare Workers」模板，再额外勾选 D1 和 R2 的编辑权限）；账户 ID 在控制台首页右侧可见。

---

## 9. 可选配置

- **推送提醒**（待办/服药到点推到手机）：需要额外部署一个小 Worker 和 VAPID 密钥，步骤见 [`PUSH_SETUP.md`](./PUSH_SETUP.md)。
- **AI 速记解析**：站内「个人中心 → 智能管理」添加一个大模型（OpenAI 兼容接口，如智谱 GLM），填 API Key 即可；不配也不影响其他功能。
- **自定义域名**：Pages 项目 → **自定义域** → 添加你自己的域名（域名需托管在同一 Cloudflare 账号）。
- **当 APP 用**：手机浏览器打开站点 → 菜单 →「添加到主屏幕」。

---

## 10. 日常更新

1. 在你 Fork 的仓库里同步上游更新（GitHub 页面有 **Sync fork** 按钮），或自己改完代码。
2. 发版脚本会处理好版本号与浏览器缓存：

   ```bash
   node scripts/release.mjs 1.0.1 "本次更新说明"
   git add -A && git commit -m "release 1.0.1" && git push
   ```

3. 如果这次的更新包含数据库变更（README 或更新说明里会提到），再跑一次：
   `wrangler d1 migrations apply shuzishenghuo --remote`

推送后 Cloudflare 自动重新部署，约 1 分钟生效；CI 会自动跑一遍语法检查和端到端测试。

---

## 11. 常见问题

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 打开站点全是 401 / 登录后一直跳登录页 | 环境变量没配或拼错 | 检查 `ADMIN_USER`/`ADMIN_PASS` 是否已添加并重新部署 |
| 页面能开但每个模块都报「加载失败」 | `database_id` 没换成自己的，或 DB 绑定缺失 | 对照第 1、5 节检查 |
| 上传附件失败 | R2 桶没建或 `BUCKET` 绑定缺失 | 对照第 2、5 节检查 |
| 迁移命令报 `no such table` 之类 | 迁移没跑完 | 重新执行第 6 节命令，确认全部 ✅ |
| 推送收不到 | Worker 未部署或 VAPID 未配置 | 按 `PUSH_SETUP.md` 配置 |
| 改了代码线上没变化 | 浏览器缓存了旧页面 | 强制刷新（Ctrl+F5），或关掉重开 PWA |

**费用**：个人使用全部落在 Cloudflare 免费额度内（D1 每天 500 万行读、R2 10GB、Pages 不限请求），无需绑卡。

**数据安全**：数据只存在你自己的 Cloudflare 账号；「数据安全」页可随时下载全量备份（JSON）。
