# 数字生活 · 打包成安卓 APP（TWA，已落地）

本项目是 Cloudflare Pages 上的 Web 应用（PWA manifest + Service Worker 齐全）。
安卓 APP 采用 **TWA（Trusted Web Activity）**：原生壳全屏加载线上站点，
登录态、数据、功能与网站完全一致，**后端零改动**。目标是侧载自用，不上架商店。

> **2026-10-30 已完成首版打包并发布**：APK 见 GitHub Releases（版本号随代码）。
> 工程已提交在本仓库 `android/` 目录，本文记录的是实际执行过的流程，供下次发版参考。

---

## 仓库内工程（android/）

- 入口：`androidbrowserhelper` 库的 `LauncherActivity`，启动即全屏打开
  `https://szsh.110011.best/`（Chrome 渲染，无地址栏，见下方 assetlinks）。
- 包名：`com.shuzishenghuo.twa`；`minSdk 23`、`targetSdk 35`。
- 版本号：`android/app/build.gradle` 的 `versionName / versionCode`，
  **发版时与根 `package.json` 同步**（versionCode = 去掉点号的三段数字）。
- 签名密钥：`android/app/release.keystore`（alias `szsh`，密码写在
  `android/app/build.gradle` 与 `android/README.md`），随仓库保存以便可复现构建。
- 构建产物：`android/app/build/outputs/apk/release/app-release.apk`（已签名）。

## 首版打包时做过的三处站点改动（已完成，勿回退）

1. `public/manifest.webmanifest`：`id / start_url / scope` 由相对路径改为
   `https://szsh.110011.best/` 绝对地址（TWA 硬性要求）。
2. `public/.well-known/assetlinks.json`：回填 `android/app/release.keystore`
   的 SHA256 指纹（`d69098da...f3d867`）。Chrome 校验通过才不显示地址栏。
3. 两个改动均随 Git 推送自动部署（Cloudflare Pages Git 集成）。

## 日常发版（网站出新版后让 APP 跟上）

```bash
# 1. 改 android/app/build.gradle 的 versionCode / versionName
# 2. 出包（需 JDK 17 + Android SDK platforms;android-35 / build-tools;35.0.0）
cd android && gradle assembleRelease
# 3. 提交、打 tag、发 GitHub Release 并挂 APK（见 android/README.md）
```

没有本机工具链时，任何装好 Android SDK 的 CI/电脑拉取本仓库执行上面第 2 步即可。

## 安装到手机

把 `app-release.apk` 传到手机直接安装（需允许「未知来源/侧载」）。
若打开后有地址栏：检查线上 `/.well-known/assetlinks.json` 指纹是否与
当前 keystore 一致，或手机 Chrome 版本过旧（TWA 需较新 Chrome）。

## 当初否决的替代方案（留档）

- **Bubblewrap**：`bubblewrap init` 向导是交互式的，在本环境（无 TTY）会崩溃；
  且它自带的 JDK/SDK 下载器同样走交互确认。故改为手写 Gradle 工程（本仓库现状），
  工具链全部手动安装：Temurin JDK 17 便携包 + Android commandlinetools + Gradle 8.9 zip。
- **WebView 自建壳**：需自己处理文件上传（拍照识别/R2 附件）、返回键、Cookie 等；
  TWA 由 Chrome 原生处理这些，代码量为零，故选 TWA。
