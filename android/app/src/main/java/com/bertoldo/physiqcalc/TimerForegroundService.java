package com.bertoldo.physiqcalc;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Build;
import android.os.CountDownTimer;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;

/**
 * Foreground Service que mantém o timer rodando mesmo com o app minimizado.
 *
 * Garantias:
 * - WakeLock parcial impede que o CPU durma durante a contagem
 * - CountDownTimer nativo (não depende de JS/WebView)
 * - Som do fim do descanso = o que o aluno escolheu em Configurações › Som (EXTRA_SOM):
 *   "bip" / "sino" / "alarme" são gerados aqui (AudioTrack, seno PCM, MESMA tabela de tons do web —
 *   src/lib/somDescanso.ts tonsDoSom) e tocam como MÍDIA (USAGE_MEDIA): com fone conectado saem só
 *   no fone; sem fone, no alto-falante; no volume de mídia. "vibrar" só vibra; "silencio" nada.
 *   (Antes: MediaPlayer + USAGE_ALARM = toque do sistema no alto-falante E no fone, volume máximo.)
 * - Notificação "Hora de treinar!" é só visual (canal timer_alarm_v3 sem som nem vibração)
 * - Auto-encerra em no máximo MAX_SERVICE_LIFETIME_MS (segurança contra leak)
 * - Libera TODOS os recursos no onDestroy (WakeLock, AudioTrack, Timer)
 */
public class TimerForegroundService extends Service {

    private static final String TAG = "TimerForegroundService";
    private static final String CHANNEL_TIMER = "timer_foreground_v2";
    // v3 = canal mudo (o som vem do AudioTrack). O v2 tinha som USAGE_ALARM gravado — canal não muda depois de criado.
    private static final String CHANNEL_ALARM = "timer_alarm_v3";
    private static final String CHANNEL_ALARM_LEGADO = "timer_alarm_v2";
    private static final int NOTIFICATION_ID = 3001;
    private static final int ALARM_NOTIFICATION_ID = 3002;

    // Segurança: service se encerra sozinho após 15 minutos (mesmo se algo der errado)
    private static final long MAX_SERVICE_LIFETIME_MS = 15 * 60 * 1000L;
    // Tempo que o alarme toca antes do service se encerrar
    private static final long ALARM_DURATION_MS = 10_000L;

    private static final int SAMPLE_RATE = 44100;

    public static final String ACTION_START = "com.bertoldo.physiqcalc.TIMER_START";
    public static final String ACTION_STOP = "com.bertoldo.physiqcalc.TIMER_STOP";
    public static final String EXTRA_DURATION = "duration_seconds";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    /** "bip" | "sino" | "alarme" | "vibrar" | "silencio" (Configurações › Som) */
    public static final String EXTRA_SOM = "som";
    public static final String SOM_PADRAO = "bip";

    private CountDownTimer countDownTimer;
    private AudioTrack audioTrack;
    private Runnable releaseAudioRunnable;
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
        String som = intent.getStringExtra(EXTRA_SOM);
        if (title == null) title = "⏱ Descanso";
        if (body == null) body = "";
        if (som == null || som.isEmpty()) som = SOM_PADRAO;

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
        final String finalSom = som;
        countDownTimer = new CountDownTimer(durationSeconds * 1000L, 1000) {
            @Override
            public void onTick(long millisUntilFinished) {
                // Chronometer nativo na notificação já cuida da contagem visual
            }

            @Override
            public void onFinish() {
                playAlarm(finalBody, finalSom);
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

    // ── Fim do descanso: vibração + som escolhido + notificação visual ──

    private void playAlarm(String exercicioNome, String som) {
        if (isAlarmPlaying) return;
        isAlarmPlaying = true;

        boolean silencio = "silencio".equals(som);
        double[][] tons = tonsDoSom(som); // vazio pra "vibrar" e "silencio"

        if (!silencio) vibrar();
        if (tons.length > 0) tocarTons(tons);

        // Notificação "Hora de treinar!" — só visual (canal mudo + setSilent); o som é o AudioTrack acima
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
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .build();

        manager.notify(ALARM_NOTIFICATION_ID, alarmNotif);
    }

    /**
     * Mesmo padrão do web (VIBRACAO_FIM_DESCANSO): 200 · pausa 100 · 200 · pausa 100 · 400.
     * Vibra como ALARME: vibração comum (sem uso) é descartada pelo Android na economia de bateria.
     * Precisa da permissão VIBRATE no manifesto — sem ela o vibrate() lança SecurityException.
     */
    private void vibrar() {
        try {
            Vibrator vibrator;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator == null || !vibrator.hasVibrator()) return;

            long[] pattern = {0, 200, 100, 200, 100, 400};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1),
                    VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM));
            } else {
                AudioAttributes alarme = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1), alarme);
                } else {
                    vibrator.vibrate(pattern, -1, alarme);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "vibração do fim do descanso falhou", e);
        }
    }

    /**
     * Tabela de tons — a MESMA de src/lib/somDescanso.ts (tonsDoSom): {frequência Hz, início s, duração s}.
     * bip 2,6 s · sino 3,4 s · alarme 1,65 s. "vibrar"/"silencio" (ou valor desconhecido) → vazio.
     */
    static double[][] tonsDoSom(String som) {
        if ("bip".equals(som)) {
            return new double[][]{{880, 0, 0.8}, {880, 0.9, 0.8}, {1100, 1.8, 0.8}};
        }
        if ("sino".equals(som)) {
            return new double[][]{{1320, 0, 1.6}, {1320, 1.8, 1.6}};
        }
        if ("alarme".equals(som)) {
            return new double[][]{
                {1000, 0, 0.25}, {1000, 0.35, 0.25}, {1000, 0.7, 0.25}, {1000, 1.05, 0.25}, {1000, 1.4, 0.25}
            };
        }
        return new double[0][];
    }

    /**
     * PCM 16 bit mono: seno por tom com envelope exponencial 0.3 → 0.001 ao longo do tom
     * (igual ao web: gain.setValueAtTime(0.3) + exponentialRampToValueAtTime(0.001)).
     */
    static short[] gerarPcm(double[][] tons) {
        double total = 0;
        for (double[] t : tons) total = Math.max(total, t[1] + t[2]);
        int n = (int) Math.ceil(total * SAMPLE_RATE);
        double[] mix = new double[n];
        for (double[] t : tons) {
            double freq = t[0];
            int ini = (int) Math.round(t[1] * SAMPLE_RATE);
            int dur = (int) Math.round(t[2] * SAMPLE_RATE);
            for (int i = 0; i < dur && ini + i < n; i++) {
                double frac = (double) i / dur;
                double env = 0.3 * Math.pow(0.001 / 0.3, frac);
                mix[ini + i] += env * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE);
            }
        }
        short[] pcm = new short[n];
        for (int i = 0; i < n; i++) {
            double v = Math.max(-1.0, Math.min(1.0, mix[i]));
            pcm[i] = (short) Math.round(v * Short.MAX_VALUE);
        }
        return pcm;
    }

    /** Toca os tons como MÍDIA: fone conectado → só no fone; sem fone → alto-falante; volume de mídia. */
    private void tocarTons(double[][] tons) {
        releaseAudioTrack();
        try {
            short[] pcm = gerarPcm(tons);
            if (pcm.length == 0) return;

            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            AudioFormat format = new AudioFormat.Builder()
                .setSampleRate(SAMPLE_RATE)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build();
            audioTrack = new AudioTrack.Builder()
                .setAudioAttributes(attrs)
                .setAudioFormat(format)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .setBufferSizeInBytes(pcm.length * 2)
                .build();
            audioTrack.write(pcm, 0, pcm.length);
            audioTrack.play();

            long duracaoMs = pcm.length * 1000L / SAMPLE_RATE;
            releaseAudioRunnable = this::releaseAudioTrack;
            handler.postDelayed(releaseAudioRunnable, duracaoMs + 300);
        } catch (Exception e) {
            // Sem saída de áudio disponível — fica só a vibração + notificação
            releaseAudioTrack();
        }
    }

    private void releaseAudioTrack() {
        if (releaseAudioRunnable != null) {
            handler.removeCallbacks(releaseAudioRunnable);
            releaseAudioRunnable = null;
        }
        if (audioTrack != null) {
            try {
                if (audioTrack.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) {
                    audioTrack.stop();
                }
            } catch (Exception e) {
                // Ignora
            }
            try {
                audioTrack.release();
            } catch (Exception e) {
                // Ignora
            }
            audioTrack = null;
        }
    }

    private void stopAlarm() {
        isAlarmPlaying = false;
        releaseAudioTrack();
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
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

            // O canal antigo tinha som USAGE_ALARM gravado (alto-falante + fone, volume máximo);
            // canal não muda depois de criado → apaga o v2 e cria o v3 mudo
            try {
                manager.deleteNotificationChannel(CHANNEL_ALARM_LEGADO);
            } catch (Exception e) {
                // Ignora
            }

            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ALARM,
                "Alarme de Descanso",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Aviso visual quando o descanso termina (o som é o escolhido em Configurações › Som)");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setShowBadge(true);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(channel);
        }
    }
}
