package com.bertoldo.physiqcalc;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.CountDownTimer;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;

/**
 * Foreground Service que mantém o timer rodando mesmo com o app minimizado.
 *
 * Garantias:
 * - WakeLock parcial impede que o CPU durma durante a contagem
 * - CountDownTimer nativo (não depende de JS/WebView)
 * - Som via MediaPlayer com AudioAttributes.USAGE_ALARM (prioridade máxima)
 * - Auto-encerra em no máximo MAX_SERVICE_LIFETIME_MS (segurança contra leak)
 * - Libera TODOS os recursos no onDestroy (WakeLock, MediaPlayer, Timer)
 */
public class TimerForegroundService extends Service {

    private static final String CHANNEL_TIMER = "timer_foreground_v2";
    private static final String CHANNEL_ALARM = "timer_alarm_v2";
    private static final int NOTIFICATION_ID = 3001;
    private static final int ALARM_NOTIFICATION_ID = 3002;

    // Segurança: service se encerra sozinho após 15 minutos (mesmo se algo der errado)
    private static final long MAX_SERVICE_LIFETIME_MS = 15 * 60 * 1000L;
    // Tempo que o alarme toca antes do service se encerrar
    private static final long ALARM_DURATION_MS = 10_000L;

    public static final String ACTION_START = "com.bertoldo.physiqcalc.TIMER_START";
    public static final String ACTION_STOP = "com.bertoldo.physiqcalc.TIMER_STOP";
    public static final String EXTRA_DURATION = "duration_seconds";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";

    private CountDownTimer countDownTimer;
    private MediaPlayer mediaPlayer;
    private PowerManager.WakeLock wakeLock;
    private Handler handler;
    private Runnable autoStopRunnable;
    private boolean isAlarmPlaying = false;

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        createTimerChannel();
        createAlarmChannel();
        acquireWakeLock();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            cleanupAndStop();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();

        if (ACTION_STOP.equals(action)) {
            cleanupAndStop();
            return START_NOT_STICKY;
        }

        // ACTION_START
        int durationSeconds = intent.getIntExtra(EXTRA_DURATION, 120);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        if (title == null) title = "⏱ Descanso";
        if (body == null) body = "";

        // Cancela timer/alarme anterior
        cancelTimer();
        stopAlarm();
        cancelAutoStop();

        // Inicia foreground com notificação de cronômetro
        Notification notification = buildTimerNotification(durationSeconds, title, body);
        startForeground(NOTIFICATION_ID, notification);

        // Segurança: auto-encerra após MAX_SERVICE_LIFETIME_MS
        scheduleAutoStop(MAX_SERVICE_LIFETIME_MS);

        // CountDownTimer nativo
        final String finalBody = body;
        countDownTimer = new CountDownTimer(durationSeconds * 1000L, 1000) {
            @Override
            public void onTick(long millisUntilFinished) {
                // Chronometer nativo na notificação já cuida da contagem visual
            }

            @Override
            public void onFinish() {
                playAlarm(finalBody);
                // Auto-encerra após o alarme tocar
                cancelAutoStop();
                scheduleAutoStop(ALARM_DURATION_MS);
            }
        };
        countDownTimer.start();

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        cancelTimer();
        stopAlarm();
        cancelAutoStop();
        releaseWakeLock();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ── Lifecycle helpers ──

    private void cleanupAndStop() {
        cancelTimer();
        stopAlarm();
        cancelAutoStop();
        stopForeground(true);
        // Remove notificação de alarme se existir
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.cancel(ALARM_NOTIFICATION_ID);
        stopSelf();
    }

    private void scheduleAutoStop(long delayMs) {
        autoStopRunnable = this::cleanupAndStop;
        handler.postDelayed(autoStopRunnable, delayMs);
    }

    private void cancelAutoStop() {
        if (autoStopRunnable != null) {
            handler.removeCallbacks(autoStopRunnable);
            autoStopRunnable = null;
        }
    }

    // ── WakeLock ──

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "PhysiqCalc::TimerWakeLock"
            );
            // Timeout de segurança: libera automaticamente após MAX_SERVICE_LIFETIME_MS
            wakeLock.acquire(MAX_SERVICE_LIFETIME_MS);
        } catch (Exception e) {
            // Continua sem WakeLock se não conseguir
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception e) {
            // Ignora
        }
        wakeLock = null;
    }

    // ── Timer ──

    private void cancelTimer() {
        if (countDownTimer != null) {
            countDownTimer.cancel();
            countDownTimer = null;
        }
    }

    // ── Notificação de cronômetro ──

    private Notification buildTimerNotification(int durationSeconds, String title, String body) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        long chronometerBase = SystemClock.elapsedRealtime() + (durationSeconds * 1000L);

        RemoteViews customView = new RemoteViews(getPackageName(), R.layout.notification_timer);
        customView.setTextViewText(R.id.notification_title, title);
        customView.setTextViewText(R.id.notification_body, body);
        customView.setChronometerCountDown(R.id.notification_chronometer, true);
        customView.setChronometer(R.id.notification_chronometer, chronometerBase, null, true);

        return new NotificationCompat.Builder(this, CHANNEL_TIMER)
            .setSmallIcon(getApplicationInfo().icon)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(customView)
            .setCustomBigContentView(customView)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(pendingIntent)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .build();
    }

    // ── Alarme sonoro ──

    private void playAlarm(String exercicioNome) {
        if (isAlarmPlaying) return;
        isAlarmPlaying = true;

        // Vibração curta e sutil
        try {
            Vibrator vibrator;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator != null) {
                long[] pattern = {0, 150, 100, 150};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
                } else {
                    vibrator.vibrate(pattern, -1);
                }
            }
        } catch (Exception e) {
            // Ignora se vibração não disponível
        }

        // Som com USAGE_ALARM (toca mesmo no silencioso/DND)
        try {
            // Tenta som de notificação (curto) primeiro, alarme como fallback
            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (sound == null) {
                sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            }
            if (sound == null) {
                sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, sound);
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)  // ALARM = sempre toca
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            mediaPlayer.setVolume(1.0f, 1.0f);  // Volume máximo
            mediaPlayer.setLooping(false);
            mediaPlayer.setOnCompletionListener(mp -> {
                try { mp.release(); } catch (Exception e) { /* ignora */ }
                mediaPlayer = null;
            });
            mediaPlayer.prepare();
            mediaPlayer.start();
        } catch (Exception e) {
            // Sem som disponível — tenta Ringtone como último recurso
            try {
                android.media.Ringtone ringtone = RingtoneManager.getRingtone(this,
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
                if (ringtone != null) ringtone.play();
            } catch (Exception e2) {
                // Realmente sem som
            }
        }

        // Notificação de alarme visual
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification alarmNotif = new NotificationCompat.Builder(this, CHANNEL_ALARM)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("Hora de treinar! 💪")
            .setContentText("Descanso concluído: " + exercicioNome)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .build();

        manager.notify(ALARM_NOTIFICATION_ID, alarmNotif);
    }

    private void stopAlarm() {
        isAlarmPlaying = false;
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
                mediaPlayer.release();
            } catch (Exception e) {
                // Ignora
            }
            mediaPlayer = null;
        }
    }

    // ── Canais de notificação ──

    private void createTimerChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_TIMER,
                "Timer de Descanso",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Contagem regressiva do descanso");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setShowBadge(false);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            manager.createNotificationChannel(channel);
        }
    }

    private void createAlarmChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ALARM,
                "Alarme de Descanso",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Alerta sonoro quando o descanso termina");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 200, 100, 200, 100, 400});
            channel.setShowBadge(true);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (alarmSound == null) {
                alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            }
            if (alarmSound != null) {
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)  // ALARM = toca mesmo no silencioso
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                channel.setSound(alarmSound, audioAttributes);
            }

            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            manager.createNotificationChannel(channel);
        }
    }
}
