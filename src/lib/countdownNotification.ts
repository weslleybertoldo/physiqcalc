import { Capacitor, registerPlugin } from "@capacitor/core";

interface CountdownNotificationPlugin {
  startCountdown(options: {
    durationSeconds: number;
    title: string;
    body: string;
    /** Som do fim do descanso escolhido pelo aluno ("bip" | "sino" | "alarme" | "vibrar" | "silencio"); padrão "bip" */
    som?: string;
  }): Promise<void>;
  stopCountdown(): Promise<void>;
  /** Vibra igual ao fim do descanso (uso alarme) — a prévia do "Ouvir" no APK */
  vibrar(): Promise<void>;
}

const CountdownNotification = registerPlugin<CountdownNotificationPlugin>(
  "CountdownNotification"
);

export const isNativeApp = Capacitor.isNativePlatform();

export default CountdownNotification;
