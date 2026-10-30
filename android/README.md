# 数字生活 · 安卓壳工程

WebView 壳：APK 不内置站点地址，首次打开由用户填写自己部署的站点地址和管理员账号，
自动登录后全屏加载站点。总体方案见根目录 `APP_BUILD.md`。

## 结构

```
android/
├── settings.gradle / build.gradle / gradle.properties   # Gradle 工程骨架
├── app/
│   ├── build.gradle            # 版本号在这里（与根 package.json 同步）
│   ├── release.keystore        # 侧载签名密钥（密码见下）
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

发版时把根目录 `package.json` 的版本同步到 `android/app/build.gradle`：

- `versionName` = `"0.5.31"`（与 package.json 一致）
- `versionCode` = `531`（去掉点号的三段数字）

## 本机构建（Windows 示例）

需要 JDK 17 + Android SDK（platforms;android-35、build-tools;35.0.0），并设置
`JAVA_HOME` 与 `ANDROID_HOME`（或写 `android/local.properties` 的 `sdk.dir=`）：

```bash
cd android
gradle assembleRelease
# 产物：app/build/outputs/apk/release/app-release.apk（已签名，可直接安装）
```

## 安装到手机

把 `app-release.apk` 传到手机直接安装（需允许「未知来源/侧载」）。
首次打开填写站点地址（https://…）与账号即可；之后点右上角半透明「设置」可修改。
