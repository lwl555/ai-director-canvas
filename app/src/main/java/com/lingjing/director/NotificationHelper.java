package com.lingjing.director;

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
