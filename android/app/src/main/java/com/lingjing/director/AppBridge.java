package com.lingjing.director;

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
