package com.lingjing.director;

import android.app.Application;
import android.content.Context;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

public class DirectorApplication extends Application {
    private static DirectorApplication instance;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        scheduleUpdates();
    }

    /** 返回 Application 实例（替代不可编译的 android.app.ActivityThread.currentApplication()） */
    public static Context getAppContext() {
        return instance;
    }

    public static void scheduleUpdates() {
        scheduleUpdates(null);
    }

    public static void scheduleUpdates(android.content.Context ctx) {
        android.content.Context c = ctx != null ? ctx : instance;
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
