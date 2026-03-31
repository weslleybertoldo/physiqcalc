package com.bertoldo.physiqcalc;

import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CountdownNotification")
public class CountdownNotificationPlugin extends Plugin {

    @PluginMethod()
    public void startCountdown(PluginCall call) {
        int durationSeconds = call.getInt("durationSeconds", 120);
        String title = call.getString("title", "⏱ Descanso");
        String body = call.getString("body", "");

        Context context = getContext();

        Intent serviceIntent = new Intent(context, TimerForegroundService.class);
        serviceIntent.setAction(TimerForegroundService.ACTION_START);
        serviceIntent.putExtra(TimerForegroundService.EXTRA_DURATION, durationSeconds);
        serviceIntent.putExtra(TimerForegroundService.EXTRA_TITLE, title);
        serviceIntent.putExtra(TimerForegroundService.EXTRA_BODY, body);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }

        call.resolve();
    }

    @PluginMethod()
    public void stopCountdown(PluginCall call) {
        Context context = getContext();

        Intent serviceIntent = new Intent(context, TimerForegroundService.class);
        serviceIntent.setAction(TimerForegroundService.ACTION_STOP);

        try {
            context.startService(serviceIntent);
        } catch (Exception e) {
            // Service pode já estar parado
        }

        call.resolve();
    }
}
