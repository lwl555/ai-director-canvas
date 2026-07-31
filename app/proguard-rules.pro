# 保持 WebView / JS 桥 / WorkManager 相关类
-keep class * extends android.webkit.WebViewClient { *; }
-keep class * extends android.webkit.WebChromeClient { *; }
-keep class com.lingjing.director.AppBridge { *; }
