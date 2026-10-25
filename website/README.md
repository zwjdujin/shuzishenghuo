# 数字生活 · 官方网站

本项目官网（纯静态，零构建，与主项目同一套「纸感 + 国色胭脂」品牌色）。介绍功能、作用、部署方式与 0 成本方案，不含博客。

## 本地预览

```bash
cd website
python -m http.server 8090
# 或 npx serve .
```

## 部署

任意静态托管均可，推荐与主应用一样部署到 Cloudflare Pages：

- **控制台**：Workers 和 Pages → 创建 → Pages → 直接上传（上传 `website` 目录）；或把 `website` 推到一个独立仓库后连接 Git，构建命令留空、**构建输出目录填 `website`**。
- **域名**：Pages 项目 → 自定义域，可绑定 `www.你的域名` 等地址；不绑定则使用 `xxx.pages.dev`。

## 目录

```
website/
├── index.html        # 单页官网（功能 / 为什么 / 部署 / 0 成本 / FAQ）
└── assets/
    ├── style.css     # 全站样式
    └── site.js       # 提示轮播 / 移动端菜单 / 进场动画（无依赖）
```

主站文案与主项目 README / DEPLOY.md 保持同步：功能模块、部署步骤、免费额度数字有变更时请同步修改本页。
