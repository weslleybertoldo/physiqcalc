import { useState, useEffect } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

interface Props {
  grupoNome: string | null;
  dateLabel: string;
}

const REMINDER_KEY = "physiq_workout_reminder";
const REMINDER_NOTIF_ID = 2001;
const isNative = Capacitor.isNativePlatform();

function getStoredReminder(): { hour: number; minute: number; enabled: boolean } | null {
  try {
    const v = localStorage.getItem(REMINDER_KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

const WorkoutReminder = ({ grupoNome, dateLabel }: Props) => {
  const [open, setOpen] = useState(false);
  const stored = getStoredReminder();
  const [enabled, setEnabled] = useState(stored?.enabled ?? false);
  const [hour, setHour] = useState(stored?.hour ?? 7);
  const [minute, setMinute] = useState(stored?.minute ?? 0);
  const [permGranted, setPermGranted] = useState(true); // assume granted, check on open

  // Verifica permissão ao abrir o modal
  useEffect(() => {
    if (!open) return;
    const checkPerm = async () => {
      if (isNative) {
        const { display } = await LocalNotifications.checkPermissions();
        setPermGranted(display === "granted");
      } else if ("Notification" in window) {
        setPermGranted(Notification.permission === "granted" || Notification.permission === "default");
      }
    };
    checkPerm();
  }, [open]);

  // Lembrete: no APK usa LocalNotifications agendada, no PWA usa Notification API
  useEffect(() => {
    if (!enabled || !grupoNome) return;

    if (isNative) {
      // Agenda notificação diária via LocalNotifications
      const scheduleReminder = async () => {
        try {
          await LocalNotifications.cancel({ notifications: [{ id: REMINDER_NOTIF_ID }] });

          const now = new Date();
          const target = new Date();
          target.setHours(hour, minute, 0, 0);
          // Se já passou do horário hoje, agenda para amanhã
          if (target <= now) {
            target.setDate(target.getDate() + 1);
          }

          await LocalNotifications.schedule({
            notifications: [{
              id: REMINDER_NOTIF_ID,
              title: "PhysiqCalc — Hora do Treino! 💪",
              body: `Treino de hoje: ${grupoNome} (${dateLabel})`,
              smallIcon: "ic_launcher",
              sound: "default",
              schedule: {
                at: target,
                every: "day",
                allowWhileIdle: true,
              },
            }],
          });
        } catch (e) {
          console.warn("[WorkoutReminder] schedule failed:", e);
        }
      };
      scheduleReminder();
    } else {
      // PWA: check every minute
      const interval = setInterval(() => {
        const now = new Date();
        if (now.getHours() === hour && now.getMinutes() === minute) {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("PhysiqCalc — Hora do Treino! 💪", {
              body: `Treino de hoje: ${grupoNome} (${dateLabel})`,
              icon: "/icon-192.png",
            });
          }
        }
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [enabled, hour, minute, grupoNome, dateLabel]);

  const requestPermission = async (): Promise<boolean> => {
    if (isNative) {
      const { display } = await LocalNotifications.requestPermissions();
      const granted = display === "granted";
      setPermGranted(granted);
      return granted;
    } else if ("Notification" in window) {
      const result = await Notification.requestPermission();
      const granted = result === "granted";
      setPermGranted(granted);
      return granted;
    }
    return false;
  };

  const toggleReminder = async () => {
    if (!enabled) {
      const granted = await requestPermission();
      if (granted) {
        setEnabled(true);
        localStorage.setItem(REMINDER_KEY, JSON.stringify({ hour, minute, enabled: true }));
      }
    } else {
      setEnabled(false);
      localStorage.setItem(REMINDER_KEY, JSON.stringify({ hour, minute, enabled: false }));
      // Cancela notificação agendada
      if (isNative) {
        try {
          await LocalNotifications.cancel({ notifications: [{ id: REMINDER_NOTIF_ID }] });
        } catch {}
      }
    }
  };

  const saveTime = (h: number, m: number) => {
    setHour(h);
    setMinute(m);
    localStorage.setItem(REMINDER_KEY, JSON.stringify({ hour: h, minute: m, enabled }));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`p-2 rounded-lg transition-colors ${
          enabled
            ? "text-primary bg-primary/10"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="Lembrete de treino"
      >
        {enabled ? <Bell size={16} /> : <BellOff size={16} />}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div className="bg-card border border-border rounded-xl p-6 w-80 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-sm uppercase tracking-wider text-foreground">
                🔔 Lembrete de Treino
              </h3>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-muted-foreground font-body">
              Receba uma notificação diária no horário escolhido para lembrar do seu treino.
            </p>

            {!permGranted && (
              <p className="text-xs text-destructive font-body">
                ⚠ Notificações bloqueadas. Habilite nas configurações do app.
              </p>
            )}

            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground font-heading">Horário:</label>
              <input
                type="time"
                value={`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  saveTime(h, m);
                }}
                className="bg-transparent border border-border rounded px-2 py-1 text-sm text-foreground font-heading outline-none focus:border-primary"
              />
            </div>

            <button
              type="button"
              onClick={toggleReminder}
              className={`w-full py-3 rounded-lg font-heading text-xs uppercase tracking-widest transition-colors ${
                enabled
                  ? "bg-muted text-muted-foreground hover:bg-muted/80"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {enabled ? "Desativar lembrete" : "Ativar lembrete"}
            </button>

            {enabled && (
              <p className="text-[10px] text-primary font-body text-center">
                ✓ Lembrete ativo às {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default WorkoutReminder;
