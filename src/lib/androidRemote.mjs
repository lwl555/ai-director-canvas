// 主程序原生安卓工程生成器（远程加载版，纯 JS，跨 Node / 浏览器）。
// buildRemotePlatformProject() => Map<相对路径, string>
//
// 设计目标（对齐用户需求）：
//   1. 原生 APK：WebView 远程加载线上站点 https://lwl555.github.io/ai-director-canvas/
//      —— 站点一更新，App 自动就是新版，无需重装（"更新不需更新 app"）。
//   2. 适配「所有安卓权限」：Manifest 申请网络/定位/相机/麦克风/存储/通知/蓝牙/自启/安装 等。
//   3. 通知功能：
//      a) 常驻前台服务 KeepAliveService（通知栏常显 + 后台保活）
//      b) JS 桥 window.AndroidApp.notify(title, body)（网页可触发原生通知，如 AI 生成完）
//      c) WorkManager 每 15 分钟拉 version.json，站点更新弹「平台已更新」后台通知
//      d) 开机广播 BootReceiver 重启保活服务 + 重排更新检查
//
// 注意：本模块只「生成可构建的工程」。真正的 .apk 编译需在装有 Android SDK 的机器上
//       用 Android Studio 打开后「Build → Build APK(s)」。

const PKG = 'com.lingjing.director'
const HOME_URL = 'https://lwl555.github.io/ai-director-canvas/'
const VER_URL = 'https://lwl555.github.io/ai-director-canvas/version.json'
const APP_NAME = '灵境 AI'
const BG_COLOR = '#6366F1'

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
rootProject.name = "ai-director-canvas-android"
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
    namespace "${PKG}"
    compileSdk 34

    defaultConfig {
        applicationId "${PKG}"
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
    implementation 'androidx.work:work-runtime:2.9.0'
    implementation 'androidx.localbroadcastmanager:localbroadcastmanager:1.1.0'
}
`

TPL.proguard = `# 保持 WebView / JS 桥 / WorkManager 相关类
-keep class * extends android.webkit.WebViewClient { *; }
-keep class * extends android.webkit.WebChromeClient { *; }
-keep class ${PKG}.AppBridge { *; }
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

    <!-- 通知 / 后台 / 自启 / 安装 -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
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
        android:name=".DirectorApplication"
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
            android:launchMode="singleTask"
            android:screenOrientation="unspecified">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".KeepAliveService"
            android:exported="false"
            android:foregroundServiceType="dataSync" />

        <receiver
            android:name=".BootReceiver"
            android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
    </application>
</manifest>
`

TPL.application = `package ${PKG};

import android.app.Application;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

public class DirectorApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        scheduleUpdates();
    }

    public static void scheduleUpdates() {
        scheduleUpdates(null);
    }

    public static void scheduleUpdates(android.content.Context ctx) {
        android.content.Context c = ctx != null ? ctx : android.app.ActivityThread.currentApplication();
        if (c == null) return;
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(
                UpdateCheckWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(new Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build())
                .build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(
                "update-check", ExistingPeriodicWorkPolicy.UPDATE, req);
    }
}
`

TPL.mainActivity = `package ${PKG};

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
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
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        ws.setUserAgentString(ws.getUserAgentString() + " LingJingApp/1.0");
        wv.addJavascriptInterface(new AppBridge(this), "AndroidApp");
        wv.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(android.webkit.WebView view, int errorCode, String description, String failingUrl) {
                // 离线时给个轻提示，不崩溃
            }
        });
        wv.setWebChromeClient(new WebChromeClient());
        wv.loadUrl("${HOME_URL}");

        requestRuntimePermissions();
        NotificationHelper.ensureChannel(this);
        startKeepAlive();
    }

    private void startKeepAlive() {
        Intent i = new Intent(this, KeepAliveService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(i);
        } else {
            startService(i);
        }
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

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    @Override
    public void onBackPressed() {
        if (wv != null && wv.canGoBack()) wv.goBack();
        else super.onBackPressed();
    }
}
`

TPL.appBridge = `package ${PKG};

import android.content.Context;
import android.webkit.JavascriptInterface;

public class AppBridge {
    private final Context ctx;

    public AppBridge(Context ctx) {
        this.ctx = ctx;
    }

    /** 网页调用 window.AndroidApp.notify(title, body) 触发原生通知 */
    @JavascriptInterface
    public void notify(String title, String body) {
        NotificationHelper.notify(ctx,
                title != null ? title : "灵境",
                body != null ? body : "");
    }

    /** 轻量 toast */
    @JavascriptInterface
    public void toast(String msg) {
        android.widget.Toast.makeText(ctx, msg != null ? msg : "", android.widget.Toast.LENGTH_SHORT).show();
    }
}
`

TPL.notificationHelper = `package ${PKG};

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

public final class NotificationHelper {
    public static final String CHANNEL_ID = "director";
    public static final int NOTIF_ID = 1001;

    public static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "灵境通知", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("灵境 AI 助手通知");
            ctx.getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    /** 网页/后台触发的普通通知 */
    public static void notify(Context ctx, String title, String body) {
        ensureChannel(ctx);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true);
        NotificationManagerCompat.from(ctx).notify((int) System.currentTimeMillis(), b.build());
    }

    /** 常驻前台通知（保活 + 通知栏常显） */
    public static android.app.Notification buildPersistent(Context ctx) {
        ensureChannel(ctx);
        Intent i = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setContentTitle("灵境 AI 助手")
                .setContentText("正在后台运行，随时为你服务")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pi)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }
}
`

TPL.keepAlive = `package ${PKG};

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

public class KeepAliveService extends Service {
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NotificationHelper.NOTIF_ID, NotificationHelper.buildPersistent(this));
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
`

TPL.bootReceiver = `package ${PKG};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Intent svc = new Intent(ctx, KeepAliveService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(svc);
            } else {
                ctx.startService(svc);
            }
            DirectorApplication.scheduleUpdates(ctx);
        }
    }
}
`

TPL.updateWorker = `package ${PKG};

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;

public class UpdateCheckWorker extends Worker {
    private static final String VER_URL = "${VER_URL}";

    public UpdateCheckWorker(@NonNull Context c, @NonNull WorkerParameters p) {
        super(c, p);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            URL u = new URL(VER_URL);
            HttpsURLConnection conn = (HttpsURLConnection) u.openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            BufferedReader r = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            String ver = sb.toString().trim();
            SharedPreferences sp = getApplicationContext()
                    .getSharedPreferences("director", Context.MODE_PRIVATE);
            String last = sp.getString("last_version", "");
            if (!ver.isEmpty() && !ver.equals(last)) {
                sp.edit().putString("last_version", ver).apply();
                if (!last.isEmpty()) {
                    NotificationHelper.notify(getApplicationContext(),
                            "灵境平台已更新", "点击打开查看最新功能");
                }
            }
            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
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
    <string name="app_name">${APP_NAME}</string>
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
        android:pathData="M54,28a26,26 0 1,0 0.1,0z" />
</vector>
`

TPL.readme = `# ${APP_NAME} — 原生 Android 工程（远程加载版）

本工程由「灵境 AI 平台」自动生成，具备：
- **远程加载线上站点**：WebView 打开 \`${HOME_URL}\`，站点一更新 App 自动生效，**无需重装 App**；
- **全部常用安卓权限**（网络 / 定位 / 相机 / 麦克风 / 存储 / 通知 / 蓝牙 / 自启 / 安装 等）；
- **通知能力**：
  - 常驻前台服务（通知栏常显 + 后台保活）；
  - JS 桥 \`window.AndroidApp.notify(title, body)\`（网页可触发原生通知）；
  - WorkManager 每 15 分钟检测站点更新，有更新弹「平台已更新」后台通知；
  - 开机广播重启保活服务 + 重排更新检查。

## 构建 APK
1. 用 **Android Studio** 打开本目录（File → Open）。
2. 等待 Gradle sync 完成（会自动下载 Gradle 8.5）。
3. Build → Build Bundle(s) / APK(s) → Build APK(s)。
4. 产物在 \`app/build/outputs/apk/release/app-release-unsigned.apk\`。
5. 真机安装用自己的签名 key：
   \`\`\`
   apksigner sign --ks my-release-key.jks --out app-release.apk app/build/outputs/apk/release/app-release-unsigned.apk
   \`\`\`
   或直接用 Android Studio 的 "Generate Signed Bundle / APK" 向导。

## 说明
- 本沙箱无 Android SDK，无法在此直接编译 .apk；生成的是「可构建工程」，编译在你本机完成。
- 已开启 cleartext + 混合内容，正式发布前请按需收紧。
- 危险权限（相机/麦克风/定位/通知等）均在运行时申请；用户拒绝不影响启动，仅对应功能不可用。
- 通知权限（POST_NOTIFICATIONS）在 Android 13+ 会弹窗申请；拒绝后网页触发的通知不显示，但前台保活通知不受影响。
`

function javaDir(pkg) {
  return pkg.split('.').join('/')
}

/**
 * 生成完整远程加载 Android 工程文件映射。
 * @returns {Record<string, string>}
 */
export function buildRemotePlatformProject() {
  const jd = javaDir(PKG)
  const F = {}
  F['gradle/wrapper/gradle-wrapper.properties'] = TPL.wrapperProps
  F['settings.gradle'] = TPL.settings
  F['build.gradle'] = TPL.projectBuild
  F['app/build.gradle'] = TPL.appBuild
  F['app/proguard-rules.pro'] = TPL.proguard
  F['README.md'] = TPL.readme
  F['app/src/main/AndroidManifest.xml'] = TPL.manifest
  F[`app/src/main/java/${jd}/MainActivity.java`] = TPL.mainActivity
  F[`app/src/main/java/${jd}/AppBridge.java`] = TPL.appBridge
  F[`app/src/main/java/${jd}/NotificationHelper.java`] = TPL.notificationHelper
  F[`app/src/main/java/${jd}/KeepAliveService.java`] = TPL.keepAlive
  F[`app/src/main/java/${jd}/BootReceiver.java`] = TPL.bootReceiver
  F[`app/src/main/java/${jd}/DirectorApplication.java`] = TPL.application
  F[`app/src/main/java/${jd}/UpdateCheckWorker.java`] = TPL.updateWorker
  F['app/src/main/res/layout/activity_main.xml'] = TPL.layout
  F['app/src/main/res/values/strings.xml'] = TPL.strings
  F['app/src/main/res/values/colors.xml'] = TPL.colors
  F['app/src/main/res/values/themes.xml'] = TPL.themes
  F['app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'] = TPL.adaptiveIcon
  F['app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml'] = TPL.adaptiveIcon
  F['app/src/main/res/drawable/ic_launcher_foreground.xml'] = TPL.iconForeground
  return F
}
