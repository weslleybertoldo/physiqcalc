package com.bertoldo.physiqcalc;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CountdownNotification")
public class CountdownNotificationPlugin extends Plugin {

    private static final String CHANNEL_ID = "rest_timer_channel";
    private static final int NOTIFICATION_ID = 2001;

    @PluginMethod()
    public void startCountdown(PluginCall call) {
        int durationSeconds = call.getInt("durationSeconds", 120);
        String title = call.getString("title", "⏱ Descanso");
        String body = call.getString("body", "");

        Context context = getContext();
        createChannel(context);

        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        long whenMs = System.currentTimeMillis() + (durationSeconds * 1000L);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setWhen(whenMs)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(pendingIntent)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);

        NotificationManager manager = (NotificationManager)
            context.getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, builder.build());

        call.resolve();
    }

    @PluginMethod()
    public void stopCountdown(PluginCall call) {
        NotificationManager manager = (NotificationManager)
            getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        manager.cancel(NOTIFICATION_ID);
        call.resolve();
    }

    private void createChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Timer de Descanso",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Contagem regressiva do timer de descanso");
            channel.setShowBadge(false);
            NotificationManager manager = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
            manager.createNotificationChannel(channel);
        }
    }
}
