package com.bertoldo.physiqcalc;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CountdownNotification")
public class CountdownNotificationPlugin extends Plugin {

    private static final String CHANNEL_ID = "rest_timer_channel_v2";
    private static final int NOTIFICATION_ID = 2001;

    @PluginMethod()
    public void startCountdown(PluginCall call) {
        int durationSeconds = call.getInt("durationSeconds", 120);
        String title = call.getString("title", "⏱ Descanso");
        String body = call.getString("body", "");

        Context context = getContext();
        createChannel(context);

        // Intent para abrir o app ao clicar na notificação
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Base do cronômetro: elapsedRealtime + tempo restante
        long chronometerBase = SystemClock.elapsedRealtime() + (durationSeconds * 1000L);

        // Layout customizado com cronômetro grande
        RemoteViews customView = new RemoteViews(context.getPackageName(), R.layout.notification_timer);
        customView.setTextViewText(R.id.notification_title, title);
        customView.setTextViewText(R.id.notification_body, body);
        customView.setChronometerCountDown(R.id.notification_chronometer, true);
        customView.setChronometer(R.id.notification_chronometer, chronometerBase, null, true);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(context.getApplicationInfo().icon)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(customView)
            .setCustomBigContentView(customView)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(pendingIntent)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_HIGH);

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
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Contagem regressiva do timer de descanso");
            channel.setShowBadge(true);
            channel.setSound(null, null);
            channel.enableVibration(false);
            NotificationManager manager = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
            manager.createNotificationChannel(channel);
        }
    }
}
