# 数字生活 · 安卓壳工程

WebView 壳：APK 不内置站点地址，首次打开由用户填写自己部署的站点地址和管理员账号，
自动登录后全屏加载站点。总体方案见根目录 `APP_BUILD.md`。

## 结构

```
android/
├── settings.gradle / build.gradle / gradle.properties   # Gradle 工程骨架
├── keystore.properties.example   # 签名配置模板（复制为 keystore.properties，已 gitignore）
├── app/
│   ├── build.gradle            # 版本号在这里（与根 package.json 同步，发版脚本自动注入）
│   ├── release.keystore        # 侧载签名密钥（本地文件，已 gitignore；口令在 android/keystore.properties）
│   └── src/main/
│       ├── AndroidManifest.xml # MainActivity（LAUNCHER 入口）+ FileProvider
│       ├── java/com/shuzishenghuo/twa/MainActivity.java   # 全部壳逻辑
│       └── res/                # 配置页布局(activity_config→view_config)/主界面/图标/配色
└── README.md
```

## MainActivity.java 要点

- 配置存 SharedPreferences（`base_url` / `user` / `pass`，明文本机保存）。
- 自动登录：后台线程 POST `{base}/api/auth/login`（JSON `{user,pass}`），
  成功后把 `Set-Cookie`（`sz_session=…`）灌入 `CookieManager` 再加载站点。
- 文件选择：`onShowFileChooser` → 系统选择器 + 拍照/录像（FileProvider 临时文件，`res/xml/file_paths.xml`）。
- URL 分流：同域名在壳内；其他 http(s) 交给系统浏览器；`intent://`/`tel:`/`mailto:` 交给系统。
- 下载走 `DownloadManager`；JS alert/confirm 用原生弹窗；返回键优先网页后退。

## 版本号约定

发版脚本（根目录 `scripts/release.mjs`）会自动把 package.json 的版本同步到 `android/app/build.gradle`：

- `versionName` = `"0.5.55"`（与 package.json 一致）
- `versionCode` = `555`（major×10000 + minor×100 + patch，单调递增；
   v0.5.56 前的去点拼法会在 0.6.0 → 60 时相对 0.5.55 → 555 倒退，触发 INSTALL_FAILED_VERSION_DOWNGRADE）

## 签名密钥（v0.5.56 起）

密钥库与口令**不再随仓库分发**（历史提交中的旧密钥已视为泄露作废）。构建前：

1. `cp keystore.properties.example keystore.properties`，填入自己的密钥路径与口令（该文件已 gitignore）；
2. 没有密钥库就先生成：
   `keytool -genkeypair -v -keystore app/release.keystore -alias szsh -keyalg RSA -keysize 2048 -validity 10000`；
3. 未配置时 `assembleRelease` 会产出**未签名** APK 并在构建日志给出提醒。

> 注意：从旧密钥换到新密钥后，旧 APK 用户无法覆盖升级（同包名不同签名），需卸载重装——
> 卸载前先在站点「数据安全」页导出备份。

## 本机构建（Windows 示例）

需要 JDK 17 + Android SDK（platforms;android-35、build-tools;35.0.0），并设置
`JAVA_HOME` 与 `ANDROID_HOME`（或写 `android/local.properties` 的 `sdk.dir=`）：

```bash
cd android
cp keystore.properties.example keystore.properties   # 首次：填入自己的密钥与口令
gradle assembleRelease
# 产物：app/build/outputs/apk/release/app-release.apk（已签名，可直接安装）
```

## 安装到手机

把 `app-release.apk` 传到手机直接安装（需允许「未知来源/侧载」）。
首次打开填写站点地址（https://…）与账号即可；之后点右上角半透明「设置」可修改。
