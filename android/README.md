# 数字生活 · 安卓 APP（TWA 壳）

本目录是「数字生活」的安卓壳工程（Trusted Web Activity）：不做任何原生业务，
直接全屏加载线上站点 `https://szsh.110011.best/`，登录态、数据、功能与网站完全一致。
总体方案见根目录 `TWA_BUILD.md`。

## 结构

```
android/
├── settings.gradle / build.gradle / gradle.properties   # Gradle 工程骨架
├── app/
│   ├── build.gradle            # 版本号在这里（与根 package.json 同步）
│   ├── release.keystore        # 侧载签名密钥（密码见下）
│   └── src/main/
│       ├── AndroidManifest.xml # LauncherActivity + DEFAULT_URL + 图标/颜色
│       └── res/                # 图标与配色（与 PWA manifest 保持一致）
└── README.md
```

- 入口是 `androidbrowserhelper` 库的 `LauncherActivity`，由 Chrome 以 TWA 全屏打开网站
  （无地址栏的前提：线上 `.well-known/assetlinks.json` 里的签名指纹与本工程 keystore 一致）。
- 包名 `com.shuzishenghuo.twa`，与 `public/.well-known/assetlinks.json` 对应。
- 签名密钥 `app/release.keystore`（alias `szsh`，密码 `84aa47b05fd23d9acd00`）随仓库保存，
  换密码请同步改 `app/build.gradle`。个人侧载用途，介意可自行重新生成并更新 assetlinks。

## 版本号约定

发版时把根目录 `package.json` 的版本同步到 `android/app/build.gradle`：

- `versionName` = `"0.5.30"`（与 package.json 一致）
- `versionCode` = `530`（去掉点号的三段数字）

## 本机构建（Windows 示例）

需要 JDK 17 + Android SDK（platforms;android-35、build-tools;35.0.0），并设置
`JAVA_HOME` 与 `ANDROID_HOME`（或写 `android/local.properties` 的 `sdk.dir=`）：

```bash
cd android
gradle assembleRelease
# 产物：app/build/outputs/apk/release/app-release.apk（已签名，可直接安装）
```

没有本机工具链时，任何装好 Android SDK 的 CI/机器拉取本仓库执行上面两步即可。

## 安装到手机

把 `app-release.apk` 传到手机直接安装（需允许「未知来源/侧载」）。
首次打开若显示地址栏，说明线上 assetlinks 的指纹还没更新或未重新部署。
