# 数字生活 · 安卓 APP（WebView 壳，可自填站点地址）

本项目是 Cloudflare Pages 上的 Web 应用，人人可自部署（见 `DEPLOY.md`），每个人的站点地址都不同。
安卓 APP 采用 **WebView 壳**：APK 内不内置任何服务器地址，**首次打开进入配置页**，
用户自己填写站点地址和管理员账号密码，之后自动登录并全屏加载自己的站点。

> 2026-10-30 已发布到 GitHub Releases（版本号随代码）。工程在仓库 `android/` 目录。

---

## 工作原理

1. **首次启动**：显示配置页，填写：
   - 站点地址（`https://…`，必填；仅支持 https，地址末尾斜杠自动去掉）
   - 用户名 / 密码（对应站点管理员账号，可留空 = 不自动登录，用站点自己的登录页）
2. **自动登录**：保存后 App 调用你站点的 `POST /api/auth/login`（JSON `{user, pass}`），
   成功后把返回的 `sz_session` 会话 Cookie 注入 WebView，打开站点即是已登录状态（7 天有效，
   每次 App 冷启动自动续登一次）。
3. **站点运行**：之后一切与网站完全一致（数据在 Cloudflare，你的账号里）。

壳层额外处理（`android/app/src/main/java/.../MainActivity.java`）：

- 文件选择 + 拍照（站点上传附件、拍照 AI 识别用）
- JS `alert/confirm` 原生弹窗（WebView 默认不支持）
- 下载走系统 DownloadManager；`tel:`/`mailto:`/`intent://`（待办拉起系统闹钟等深链）交给系统
- 跨域名链接用系统浏览器打开；返回键优先网页后退
- Cookie 持久化（`CookieManager.flush()`）；启用 Service Worker（站点离线壳缓存）

## 仓库内工程（android/）

```
android/
├── settings.gradle / build.gradle / gradle.properties
├── keystore.properties.example    # 签名配置模板（复制为 keystore.properties，已 gitignore）
├── app/
│   ├── build.gradle                    # 版本号在这里（与根 package.json 同步，发版脚本自动注入）
│   ├── release.keystore                # 侧载签名密钥（本地文件，已 gitignore；不再随仓库分发）
│   └── src/main/
│       ├── AndroidManifest.xml         # MainActivity（LAUNCHER）+ FileProvider
│       ├── java/com/shuzishenghuo/twa/MainActivity.java
│       └── res/                        # 配置页/主界面布局、图标、配色
└── README.md
```

- 包名 `com.shuzishenghuo.twa`；`minSdk 23`（Android 6.0+）、`targetSdk 35`。
- **版本号约定**：发版脚本自动把 package.json 的版本同步到 `android/app/build.gradle`
  （`versionName` = 版本字符串，`versionCode` = major×10000+minor×100+patch，单调递增；
  v0.5.56 前的去点拼法在 0.6.0 会相对 0.5.55 倒退，无法覆盖安装）。
- **签名密钥（v0.5.56 起）不再随仓库分发**：旧密钥库与口令曾入库公开，已视为泄露作废。
  构建前复制 `keystore.properties.example` 为 `android/keystore.properties`（已 gitignore）
  并填入自己的密库与口令；没有密钥库就用 keytool 生成（步骤见 `android/README.md`）。
  换钥后旧 APK 无法覆盖升级，需卸载重装（先在站点导出备份）。

## 本机构建

需要 JDK 17 + Android SDK（platforms;android-35、build-tools;35.0.0），设置 `JAVA_HOME`、
`ANDROID_HOME`（或写 `android/local.properties`）：

```bash
cd android && gradle assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk（已签名）
```

## 安装与使用

APK 传到手机直接安装（允许「未知来源」）。首次打开填自己的站点地址与账号即可。
同一签名的新版可直接覆盖安装；**换过签名密钥（v0.5.56 起自建密钥）则需先卸载旧版再装**
（卸载前先在站点「数据安全」页导出备份）。

## 历史：为什么放弃 TWA

初版用 TWA（Trusted Web Activity）：全屏、零代码，但有两个硬伤——
① 手写 Manifest 漏了 `MAIN/LAUNCHER` intent-filter，装上后桌面无图标；
② TWA 必须把固定域名写死进 APK（DEFAULT_URL + assetlinks 指纹验证），
与「人人自部署、地址各不同」冲突。已整体改为上面的 WebView 壳方案，
`public/manifest.webmanifest` 恢复相对路径，`.well-known/assetlinks.json` 已删除。
