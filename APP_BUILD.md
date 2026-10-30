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
├── app/
│   ├── build.gradle                    # 版本号在这里（与根 package.json 同步）
│   ├── release.keystore                # 侧载签名密钥（密码见下）
│   └── src/main/
│       ├── AndroidManifest.xml         # MainActivity（LAUNCHER）+ FileProvider
│       ├── java/com/shuzishenghuo/twa/MainActivity.java
│       └── res/                        # 配置页/主界面布局、图标、配色
└── README.md
```

- 包名 `com.shuzishenghuo.twa`；`minSdk 23`（Android 6.0+）、`targetSdk 35`。
- **版本号约定**：发版时把根目录 `package.json` 的版本同步到 `android/app/build.gradle`
  （`versionName` = 版本字符串，`versionCode` = 去掉点号的三段数字）。
- 签名密钥 `app/release.keystore`（alias `szsh`，密码 `84aa47b05fd23d9acd00`）随仓库保存，
  便于任何人复现构建。个人侧载用途；介意可自行重新生成并更新 `app/build.gradle`。

## 本机构建

需要 JDK 17 + Android SDK（platforms;android-35、build-tools;35.0.0），设置 `JAVA_HOME`、
`ANDROID_HOME`（或写 `android/local.properties`）：

```bash
cd android && gradle assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk（已签名）
```

## 安装与使用

APK 传到手机直接安装（允许「未知来源」）。首次打开填自己的站点地址与账号即可。
装过的旧版可直接覆盖安装（同一签名）。

## 历史：为什么放弃 TWA

初版用 TWA（Trusted Web Activity）：全屏、零代码，但有两个硬伤——
① 手写 Manifest 漏了 `MAIN/LAUNCHER` intent-filter，装上后桌面无图标；
② TWA 必须把固定域名写死进 APK（DEFAULT_URL + assetlinks 指纹验证），
与「人人自部署、地址各不同」冲突。已整体改为上面的 WebView 壳方案，
`public/manifest.webmanifest` 恢复相对路径，`.well-known/assetlinks.json` 已删除。
