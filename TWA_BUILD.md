# 数字生活 · 打包成安卓 APP（TWA 侧载自用）

本项目是 Cloudflare Pages 上的 Web 应用（已带 PWA manifest + Service Worker）。
用 **TWA（Trusted Web Activity）** 可把线上站点套一层原生安卓外壳，生成 APK：
全屏、有独立图标、从应用抽屉启动、登录态与网站共用；**后端零改动**。

> 目标：装自己手机（侧载），不走 Google Play 商店。

---

## 0. 前置：把仓库里的占位域名换成真实部署域名

`public/manifest.webmanifest` 里的 `start_url` / `scope` 现在是占位符
`https://shuzishenghuo.example.com`。**部署前必须改成你的真实域名**（在
Cloudflare Pages 控制台「自定义域」设置的就是它，形如 `https://xxx.pages.dev`
或你绑定的域名）。

用 WorkBuddy 告诉我真实域名后，我会直接替换并重新生成图标/校验文件。
也可以自己全局替换：

```bash
# 把 example.com 换成你的真实域名
sed -i 's#https://shuzishenghuo.example.com#https://你的真实域名#g' public/manifest.webmanifest
```

---

## 1. 部署并更新 PWA 资源

```bash
# 方式 A：Cloudflare Pages Git 连接（推荐，已配 SSH）
git add -A && git commit -m "chore: TWA-ready manifest + icons" && git push

# 方式 B：wrangler 直接部署
npx wrangler pages deploy ./public
```

部署后确认：
- `https://你的真实域名/manifest.webmanifest` 可访问且 `start_url/scope` 是绝对地址。
- `https://你的真实域名/icons/icon-512.png` 可访问。
- `https://你的真实域名/.well-known/assetlinks.json` 可访问（暂为占位 SHA256，第 3 步回填）。

---

## 2. 本机准备工具链（仅出包时需要，沙箱里没有）

1. **JDK 17**（Android 构建要求）
   - Windows：装 [Adoptium Temurin 17](https://adoptium.net/) ，`java -version` 验证。
2. **Android SDK 命令行工具**
   - 下载 commandlinetools，设 `ANDROID_HOME`，执行：
     ```bash
     sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
     sdkmanager --licenses
     ```
3. **Node/npm**（已有）安装 Bubblewrap：
   ```bash
   npm i -g @bubblewrap/cli
   ```

---

## 3. 生成 TWA 工程与签名密钥

```bash
bubblewrap init --manifest https://你的真实域名/manifest.webmanifest
```

- 会自动生成 `twa-manifest.json`、`android/` 工程和一个 `release.keystore`。
- 命令结束会**打印 keystore 的 SHA256**（也会写到 `twa-manifest.json` 注释附近）。
- 把该 SHA256 填进 `public/.well-known/assetlinks.json` 的
  `sha256_cert_fingerprints` 占位处，然后重新部署一次（第 1 步），让线上生效。

> 若想自定义包名，编辑 `twa-manifest.json` 的 `packageId`（默认 `com.shuzishenghuo.twa`）。

---

## 4. 编译并签名 APK（侧载用）

```bash
cd android
./gradlew assembleRelease          # 产出未签名 app-release-unsigned.apk
```

用第 3 步生成的 keystore 签名（密码在 `bubblewrap init` 时设置/打印）：

```bash
apksigner sign \
  --ks ../release.keystore \
  --ks-key-alias android \
  --out app-release-signed.apk \
  app/build/outputs/apk/release/app-release-unsigned.apk
```

装到手机（手机需开启「未知来源」安装）：

```bash
adb install app-release-signed.apk
```

或直接把 `app-release-signed.apk` 拷到手机点开安装。

---

## 5. 可选：上架 Google Play

`bubblewrap build` 会产出 `app-release-bundle.aab`，按 Play 商店流程上传即可
（需 $25 一次性开发者账号 + 走审核）。本方案已满足上架所需的 assetlinks 校验。

---

## 常见坑

- **TWA 必须绝对 URL**：manifest 的 `start_url/scope` 不能用 `./` 相对路径。
- **没 assetlinks 也能跑**：只是 Chrome 会显示地址栏（非全屏）。侧载自用建议补全。
- **登录态**：TWA 用 Chrome 自定义标签页，与你的 Chrome 共享 Cookie，网站登录一次即可。
- **离线**：取决于现有 `sw.js` 的缓存策略；数据始终走 Cloudflare 后端。
- **沙箱限制**：本机没有 JDK/Android SDK，无法在此直接出 APK；按上面步骤在本机/CI 出包。
