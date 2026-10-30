package com.shuzishenghuo.twa;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.preference.PreferenceManager;
import android.content.SharedPreferences;
import android.text.TextUtils;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 数字生活 · 安卓壳
 * 首次启动进入配置页：填写自己部署的站点地址 + 管理员账号密码；
 * 之后用该账号调 /api/auth/login 换取会话 Cookie 注入 WebView，直接进入已登录状态。
 * APK 内不内置任何站点地址。
 */
public class MainActivity extends Activity {

    private static final String PREF_BASE_URL = "base_url";
    private static final String PREF_USER = "user";
    private static final String PREF_PASS = "pass";
    private static final int REQ_FILE_CHOOSER = 1001;

    private SharedPreferences prefs;
    private WebView web;
    private View configView;
    private View errorView;
    private TextView errMsg;
    private Button btnRetry;
    private EditText etUrl, etUser, etPass;

    private ValueCallback<Uri[]> fileCallback;
    private File cameraTempFile;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = PreferenceManager.getDefaultSharedPreferences(this);

        setContentView(R.layout.activity_main);
        web = findViewById(R.id.web);
        errorView = findViewById(R.id.errorView);
        errMsg = findViewById(R.id.errMsg);
        btnRetry = findViewById(R.id.btnRetry);
        Button btnEdit = findViewById(R.id.btnEdit);
        Button btnSettings = findViewById(R.id.btnSettings);

        setupWebView();
        setupConfigView();

        btnSettings.setOnClickListener(v -> showConfig());
        btnEdit.setOnClickListener(v -> showConfig());
        btnRetry.setOnClickListener(v -> {
            errorView.setVisibility(View.GONE);
            startLoginAndLoad();
        });

        String base = prefs.getString(PREF_BASE_URL, "");
        if (TextUtils.isEmpty(base)) {
            showConfig();
        } else {
            startLoginAndLoad();
        }
    }

    // ===== 配置页 =====

    private void setupConfigView() {
        configView = getLayoutInflater().inflate(R.layout.view_config, null);
        addContentView(configView, new FrameLayoutFullLayoutParams());
        etUrl = configView.findViewById(R.id.etUrl);
        etUser = configView.findViewById(R.id.etUser);
        etPass = configView.findViewById(R.id.etPass);
        Button btnSave = configView.findViewById(R.id.btnSave);
        etUrl.setText(prefs.getString(PREF_BASE_URL, ""));
        etUser.setText(prefs.getString(PREF_USER, ""));
        etPass.setText(prefs.getString(PREF_PASS, ""));
        btnSave.setOnClickListener(v -> saveConfig());
    }

    private void showConfig() {
        etUrl.setText(prefs.getString(PREF_BASE_URL, ""));
        etUser.setText(prefs.getString(PREF_USER, ""));
        etPass.setText(prefs.getString(PREF_PASS, ""));
        errorView.setVisibility(View.GONE);
        configView.setVisibility(View.VISIBLE);
    }

    private void saveConfig() {
        String url = etUrl.getText().toString().trim();
        if (TextUtils.isEmpty(url)) {
            toast("请填写站点地址");
            return;
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }
        url = url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
        if (!url.startsWith("https://")) {
            toast("为了数据安全，仅支持 https:// 地址");
            return;
        }
        prefs.edit()
                .putString(PREF_BASE_URL, url)
                .putString(PREF_USER, etUser.getText().toString().trim())
                .putString(PREF_PASS, etPass.getText().toString())
                .apply();
        configView.setVisibility(View.GONE);
        errorView.setVisibility(View.GONE);
        startLoginAndLoad();
    }

    // ===== 自动登录 + 加载 =====

    /** 后台线程 POST /api/auth/login，成功后把会话 Cookie 注入 WebView 再加载站点。 */
    private void startLoginAndLoad() {
        final String base = prefs.getString(PREF_BASE_URL, "");
        final String user = prefs.getString(PREF_USER, "");
        final String pass = prefs.getString(PREF_PASS, "");
        if (TextUtils.isEmpty(base)) {
            showConfig();
            return;
        }
        toast("正在连接 " + base);
        new Thread(() -> {
            String setCookie = null;
            String error = null;
            if (!TextUtils.isEmpty(user) && !TextUtils.isEmpty(pass)) {
                try {
                    HttpURLConnection conn = (HttpURLConnection) new URL(base + "/api/auth/login").openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(15000);
                    JSONObject body = new JSONObject();
                    body.put("user", user);
                    body.put("pass", pass);
                    conn.setDoOutput(true);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                    }
                    int code = conn.getResponseCode();
                    if (code == 200) {
                        String h = conn.getHeaderField("Set-Cookie");
                        if (h != null && h.contains("sz_session=")) setCookie = h;
                    } else if (code == 401) {
                        error = "用户名或密码不正确，已打开站点登录页，可重试或点右上角「设置」修改";
                    }
                } catch (Exception e) {
                    error = "无法连接站点：" + e.getMessage();
                }
            }
            final String cookieToSet = setCookie;
            final String errText = error;
            runOnUiThread(() -> {
                if (!isFinishing()) {
                    if (cookieToSet != null) {
                        CookieManager.getInstance().setCookie(base, cookieToSet);
                    }
                    if (errText != null) {
                        toast(errText);
                    }
                    web.loadUrl(base + "/");
                }
            });
        }).start();
    }

    // ===== WebView =====

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100); // 不跟随系统字体缩放，避免站点布局错乱
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSavePassword(false);
        s.setMediaPlaybackRequiresUserGesture(false);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                errorView.setVisibility(View.GONE);
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showLoadError("页面加载失败，请检查站点地址与网络。");
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                launchFileChooser();
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, android.webkit.JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, android.webkit.JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                        .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }
        });

        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                String name = Uri.decode(url.substring(url.lastIndexOf('/') + 1));
                if (name.isEmpty()) name = "download";
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                dm.enqueue(req);
                toast("已开始下载：" + name);
            } catch (Exception e) {
                toast("下载失败：" + e.getMessage());
            }
        });
    }

    /** 同域名留在壳内；其他 http(s) 用系统浏览器打开；intent/tel 等交给系统处理。 */
    private boolean handleUrl(String url) {
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        String base = prefs.getString(PREF_BASE_URL, "");
        String baseHost = Uri.parse(base).getHost();
        if ("http".equals(scheme) || "https".equals(scheme)) {
            if (uri.getHost() != null && uri.getHost().equals(baseHost)) {
                return false; // 站内链接，WebView 自己加载
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
            }
            return true;
        }
        if ("intent".equals(scheme)) {
            try {
                Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                startActivity(intent);
            } catch (Exception ignored) {
            }
            return true;
        }
        if ("tel".equals(scheme) || "mailto".equals(scheme) || "sms".equals(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
            }
            return true;
        }
        return false;
    }

    // ===== 文件选择 / 拍照（供站点上传附件、拍照识别使用） =====

    private void launchFileChooser() {
        try {
            Intent picker = new Intent(Intent.ACTION_GET_CONTENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("*/*");

            Intent camera = null;
            Intent video = null;
            try {
                cameraTempFile = File.createTempFile(
                        "szsh_" + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date()),
                        ".jpg", getCacheDir());
                Uri outUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", cameraTempFile);
                camera = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
                camera.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, outUri);
                video = new Intent(android.provider.MediaStore.ACTION_VIDEO_CAPTURE);
            } catch (Exception ignored) {
            }

            Intent chooser = Intent.createChooser(picker, "选择文件");
            if (camera != null && video != null) {
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera, video});
            }
            startActivityForResult(chooser, REQ_FILE_CHOOSER);
        } catch (Exception e) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(null);
                fileCallback = null;
            }
            toast("无法打开文件选择器：" + e.getMessage());
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            Uri[] out = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                out = new Uri[]{data.getData()};
            } else if (resultCode == RESULT_OK && cameraTempFile != null && cameraTempFile.exists()
                    && cameraTempFile.length() > 0) {
                // 拍照模式：相机直接写入临时文件，没有返回 data
                out = new Uri[]{FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", cameraTempFile)};
            }
            if (cameraTempFile == null || out != null) cameraTempFile = null;
            if (fileCallback != null) {
                fileCallback.onReceiveValue(out);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ===== 杂项 =====

    private void showLoadError(String text) {
        errMsg.setText(text);
        errorView.setVisibility(View.VISIBLE);
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
    }

    private class FrameLayoutFullLayoutParams extends android.widget.FrameLayout.LayoutParams {
        FrameLayoutFullLayoutParams() {
            super(android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.MATCH_PARENT);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (configView.getVisibility() == View.VISIBLE
                    && !TextUtils.isEmpty(prefs.getString(PREF_BASE_URL, ""))) {
                // 配置页有已保存配置时，返回键回到站点页面而不是退出
                configView.setVisibility(View.GONE);
                return true;
            }
            if (web.canGoBack()) {
                web.goBack();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
