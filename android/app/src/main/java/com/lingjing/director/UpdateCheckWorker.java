package com.lingjing.director;

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
    private static final String VER_URL = "https://lwl555.github.io/ai-director-canvas/version.json";

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
