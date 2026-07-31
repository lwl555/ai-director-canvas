# 灵境 AI — 原生 Android 工程（远程加载版）

本工程由「灵境 AI 平台」自动生成，具备：
- **远程加载线上站点**：WebView 打开 `https://lwl555.github.io/ai-director-canvas/`，站点一更新 App 自动生效，**无需重装 App**；
- **全部常用安卓权限**（网络 / 定位 / 相机 / 麦克风 / 存储 / 通知 / 蓝牙 / 自启 / 安装 等）；
- **通知能力**：
  - 常驻前台服务（通知栏常显 + 后台保活）；
  - JS 桥 `window.AndroidApp.notify(title, body)`（网页可触发原生通知）；
  - WorkManager 每 15 分钟检测站点更新，有更新弹「平台已更新」后台通知；
  - 开机广播重启保活服务 + 重排更新检查。

## 构建 APK
1. 用 **Android Studio** 打开本目录（File → Open）。
2. 等待 Gradle sync 完成（会自动下载 Gradle 8.5）。
3. Build → Build Bundle(s) / APK(s) → Build APK(s)。
4. 产物在 `app/build/outputs/apk/release/app-release-unsigned.apk`。
5. 真机安装用自己的签名 key：
   ```
   apksigner sign --ks my-release-key.jks --out app-release.apk app/build/outputs/apk/release/app-release-unsigned.apk
   ```
   或直接用 Android Studio 的 "Generate Signed Bundle / APK" 向导。

## 说明
- 本沙箱无 Android SDK，无法在此直接编译 .apk；生成的是「可构建工程」，编译在你本机完成。
- 已开启 cleartext + 混合内容，正式发布前请按需收紧。
- 危险权限（相机/麦克风/定位/通知等）均在运行时申请；用户拒绝不影响启动，仅对应功能不可用。
- 通知权限（POST_NOTIFICATIONS）在 Android 13+ 会弹窗申请；拒绝后网页触发的通知不显示，但前台保活通知不受影响。
