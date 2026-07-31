package com.lingjing.director;

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
