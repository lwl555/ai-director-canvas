package com.lingjing.director;

import android.app.DownloadManager;
import android.content.Context;
import android.os.Environment;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import java.util.Locale;

public class AppBridge {
    private final Context ctx;
    private static TextToSpeech tts;

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

    /** 网页调用 window.AndroidApp.download(url, name) 触发系统下载管理器保存文件 */
    @JavascriptInterface
    public void download(String url, String name) {
        requestDownload(ctx, url, name);
    }

    /** 统一的下载入口（也供 MainActivity 的 DownloadListener 复用） */
    public static void requestDownload(Context ctx, String url, String name) {
        try {
            String fn = name;
            if (fn == null || fn.isEmpty()) fn = "download";
            DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request req = new DownloadManager.Request(android.net.Uri.parse(url));
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fn);
            req.setTitle(fn);
            dm.enqueue(req);
        } catch (Exception e) {
            android.widget.Toast.makeText(ctx, "下载失败：" + e.getMessage(), android.widget.Toast.LENGTH_SHORT).show();
        }
    }

    /** 网页调用 window.AndroidApp.speak(text) 走原生 TTS（系统 WebView 多无 speechSynthesis） */
    @JavascriptInterface
    public void speak(String text) {
        try {
            if (tts == null) {
                tts = new TextToSpeech(ctx, new TextToSpeech.OnInitListener() {
                    public void onInit(int status) {
                        if (tts != null) tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
                    }
                });
                tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
            }
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, null);
        } catch (Exception e) {
            android.widget.Toast.makeText(ctx, "朗读失败：" + e.getMessage(), android.widget.Toast.LENGTH_SHORT).show();
        }
    }

    /** 停止原生 TTS 朗读 */
    @JavascriptInterface
    public void stopSpeak() {
        if (tts != null) tts.stop();
    }

    /** 网页调用 window.AndroidApp.requestPermission('location'|'camera'|'mic'|'storage') 动态申请权限 */
    @JavascriptInterface
    public void requestPermission(String perm) {
        if (ctx instanceof MainActivity) {
            ((MainActivity) ctx).requestRuntimePermission(perm);
        }
    }
}
