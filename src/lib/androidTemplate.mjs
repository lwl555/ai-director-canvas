// Android 工程模板生成器（纯 JS，跨 Node / 浏览器）。
// buildAndroidProject(opts) => Map<相对路径, string | Uint8Array>
//
// 两种模式：
//   mode='quickapp' : 把单文件 HTML 塞进 assets/app.html（平台「快应用」打包）
//   mode='platform' : 把已构建的 dist/ 整个塞进 assets/（index.html 为入口，主程序 APP 打包）
//
// 共用能力：
//   - AndroidManifest 申请「全部常用权限」+ POST_NOTIFICATIONS
//   - MainActivity 运行时申请通知/相机/麦克风/定位等危险权限
//   - 创建 NotificationChannel + 启动时发一条示例通知（验证通知权限可用）
//   - WebView 开启 JS / DOM 存储 / 文件访问，加载 assets 入口
//   - 图标：PNG data URL → 写 mipmap PNG；否则写自适应图标（品牌色 + 矢量前景）
//
// 注意：本模块只「生成可构建的工程」。真正的 .apk 编译需在装有 Android SDK 的机器上
//       用 Android Studio 打开后「Build → Build Bundle(s) / APK(s) → Build APK(s)」。

const BG_COLOR = '#6366F1'

// ---------- 工具 ----------
export function isPngDataUrl(s) {
  return typeof s === 'string' && s.startsWith('data:image/png')
}

export function b64ToBytes(b64) {
  const bin =
    typeof atob !== 'undefined'
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString('binary')
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

function pkgSuffixFrom(seed = '') {
  // 生成合法、稳定的包名后缀（只允许 [a-z0-9_]，且首字符为字母）
  let s = String(seed)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
  if (!s) s = 'app' + Math.abs(hashStr(seed)).toString(36)
  if (!/[a-z]/.test(s[0])) s = 'a' + s
  return s.slice(0, 24)
}

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0
  return h
}

function safeName(name) {
  return (String(name || '快应用').trim() || '快应用').slice(0, 40)
}

// ---------- 文件模板（用 @@ 占位，最后统一替换） ----------
const TPL = {}

TPL.wrapperProps = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.5-all.zip
`

TPL.settings = `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "@@NAME@@"
include ':app'
`

TPL.projectBuild = `buildscript {
    repositories {
        google()
        mavenCentral()
    }
}
plugins {
    id 'com.android.application' version '8.3.0' apply false
}
`

TPL.appBuild = `plugins {
    id 'com.android.application'
}

android {
    namespace "@@PKG@@"
    compileSdk 34

    defaultConfig {
        applicationId "@@PKG@@"
        minSdk 26
        targetSdk 34
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'androidx.webkit:webkit:1.9.0'
    implementation 'com.google.android.material:material:1.11.0'
}
`

TPL.proguard = `# 保持 WebView 相关类
-keep class * extends android.webkit.WebViewClient { *; }
-keep class * extends android.webkit.WebChromeClient { *; }
`

TPL.manifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <!-- 网络 -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />

    <!-- 定位 -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

    <!-- 多媒体 / 硬件 -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.FLASHLIGHT" />
    <uses-permission android:name="android.permission.NFC" />

    <!-- 存储（旧版） -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32" tools:ignore="ScopedStorage" />
    <!-- 存储（Android 13+） -->
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />

    <!-- 通知 -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <!-- 后台 / 自启 / 安装 -->
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />

    <!-- 蓝牙 -->
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />

    <!-- 其他 -->
    <uses-permission android:name="android.permission.USE_BIOMETRIC" />
    <uses-permission android:name="android.permission.READ_PHONE_STATE" />
    <uses-permission android:name="android.permission.EXPAND_STATUS_BAR" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher"
        android:supportsRtl="true"
        android:theme="@style/Theme.App"
        android:usesCleartextTraffic="true"
        tools:targetApi="34">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:screenOrientation="unspecified">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`

TPL.mainActivity = `package @@PKG@@;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;

public class MainActivity extends AppCompatActivity {
    private static final int REQ_PERMS = 1001;
    private WebView wv;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        wv = findViewById(R.id.webview);
        WebSettings ws = wv.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        wv.setWebViewClient(new WebViewClient());
        wv.setWebChromeClient(new WebChromeClient());

        wv.loadUrl("file:///android_asset/@@ENTRY@@");

        requestRuntimePermissions();
        createNotificationChannel();
        sendSampleNotification();
    }

    private void requestRuntimePermissions() {
        ArrayList<String> need = new ArrayList<>();
        String[] base = new String[] {
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_FINE_LOCATION
        };
        for (String p : base) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) need.add(p);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.POST_NOTIFICATIONS);
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.READ_MEDIA_IMAGES);
        }
        if (!need.isEmpty()) {
            ActivityCompat.requestPermissions(this, need.toArray(new String[0]), REQ_PERMS);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            android.app.NotificationChannel ch = new android.app.NotificationChannel(
                "main", "主通知", android.app.NotificationManager.IMPORTANCE_DEFAULT);
            getSystemService(android.app.NotificationManager.class).createNotificationChannel(ch);
        }
    }

    private void sendSampleNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, "main")
            .setContentTitle(getString(R.string.app_name))
            .setContentText("应用已启动")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        NotificationManagerCompat.from(this).notify(1, b.build());
    }

    @Override
    public void onBackPressed() {
        if (wv != null && wv.canGoBack()) wv.goBack();
        else super.onBackPressed();
    }
}
`

TPL.layout = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">
    <WebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />
</FrameLayout>
`

TPL.strings = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">@@NAME@@</string>
</resources>
`

TPL.colors = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG_COLOR}</color>
</resources>
`

TPL.themes = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.App" parent="Theme.Material3.DayNight.NoActionBar">
        <item name="android:statusBarColor">@android:color/transparent</item>
    </style>
</resources>
`

TPL.adaptiveIcon = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`

TPL.iconForeground = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M54,30a24,24 0 1,0 0.1,0z" />
</vector>
`

TPL.readme = `# @@NAME@@ — Android 工程

本工程由「灵境 AI 平台」自动生成，已包含：
- 全部常用 Android 权限（网络 / 定位 / 相机 / 麦克风 / 存储 / 通知 / 蓝牙 / 自启 等）
- 通知权限（POST_NOTIFICATIONS）运行时申请 + NotificationChannel + 启动示例通知
- WebView 加载本地网页（快应用模式加载 app.html；平台模式加载 index.html）

## 构建 APK
1. 用 **Android Studio** 打开本目录（File → Open）。
2. 首次打开会提示 "Gradle sync"，等待完成（会自动下载 Gradle 8.5）。
3. 菜单 Build → Build Bundle(s) / APK(s) → Build APK(s)。
4. 构建完成后在 \`app/build/outputs/apk/release/\` 拿到 \`app-release-unsigned.apk\`。
5. 若要上架或安装到真机，用自己的签名 key 对齐签名：
   \`\`\`
   apksigner sign --ks my-release-key.jks --out app-release.apk app/build/outputs/apk/release/app-release-unsigned.apk
   \`\`\`
   或直接用 Android Studio 的 "Generate Signed Bundle / APK" 向导。

## 说明
- 本沙箱无 Android SDK，无法在此直接编译 .apk；生成的是「可构建工程」，编译在你本机完成。
- 若快应用需要访问外部网络/接口，已开启 cleartext + 混合内容，正式发布前请按需收紧。
- 危险权限（相机/麦克风/定位/通知等）已在运行时申请；用户拒绝不影响应用启动，仅对应功能不可用。
`

function applyTpl(s, map) {
  let out = s
  for (const [k, v] of Object.entries(map)) out = out.split(`@@${k}@@`).join(v)
  return out
}

/**
 * @param {object} opts
 * @param {'quickapp'|'platform'} [opts.mode]
 * @param {string} [opts.name]
 * @param {string} [opts.packageId]  例如 com.lingjing.quickapp
 * @param {string} [opts.icon]       emoji 或 PNG data URL
 * @param {string} [opts.html]       quickapp 模式：单文件 HTML
 * @param {Record<string,string>} [opts.assetFiles] platform 模式：dist 文件映射（相对路径→内容）
 * @param {string} [opts.seed]       用于生成稳定包名后缀（如 app id）
 * @returns {Record<string, string|Uint8Array>}
 */
export function buildAndroidProject(opts = {}) {
  const mode = opts.mode === 'platform' ? 'platform' : 'quickapp'
  const name = safeName(opts.name)
  const basePkg = opts.packageId || 'com.lingjing.quickapp'
  const pkg = `${basePkg}.${pkgSuffixFrom(opts.seed || name)}`
  const entry = mode === 'platform' ? 'index.html' : 'app.html'

  const map = { NAME: name, PKG: pkg, ENTRY: entry }
  const F = {}
  F['gradle/wrapper/gradle-wrapper.properties'] = TPL.wrapperProps
  F['settings.gradle'] = applyTpl(TPL.settings, map)
  F['build.gradle'] = TPL.projectBuild
  F['app/build.gradle'] = applyTpl(TPL.appBuild, map)
  F['app/proguard-rules.pro'] = TPL.proguard
  F['app/src/main/AndroidManifest.xml'] = TPL.manifest
  F[`app/src/main/java/${pkg.replace(/\./g, '/')}/MainActivity.java`] = applyTpl(
    TPL.mainActivity,
    map
  )
  F['app/src/main/res/layout/activity_main.xml'] = TPL.layout
  F['app/src/main/res/values/strings.xml'] = applyTpl(TPL.strings, map)
  F['app/src/main/res/values/colors.xml'] = TPL.colors
  F['app/src/main/res/values/themes.xml'] = TPL.themes
  F['README.md'] = applyTpl(TPL.readme, map)

  // 图标
  if (isPngDataUrl(opts.icon)) {
    const bytes = b64ToBytes(opts.icon.split(',')[1] || '')
    const densities = ['hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']
    for (const d of densities) F[`app/src/main/res/mipmap-${d}/ic_launcher.png`] = bytes
  } else {
    F['app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'] = TPL.adaptiveIcon
    F['app/src/main/res/drawable/ic_launcher_foreground.xml'] = TPL.iconForeground
  }

  // 网页资源
  if (mode === 'quickapp') {
    F['app/src/main/assets/app.html'] = opts.html || '<!DOCTYPE html><html><body>空应用</body></html>'
  } else {
    const assets = opts.assetFiles || {}
    for (const [rel, content] of Object.entries(assets)) {
      F[`app/src/main/assets/${rel}`] = content
    }
  }

  return F
}
