import { Capacitor, registerPlugin } from "@capacitor/core";

interface CountdownNotificationPlugin {
  startCountdown(options: {
    durationSeconds: number;
    title: string;
    body: string;
  }): Promise<void>;
  stopCountdown(): Promise<void>;
}

const CountdownNotification = registerPlugin<CountdownNotificationPlugin>(
  "CountdownNotification"
);

export const isNativeApp = Capacitor.isNativePlatform();

export default CountdownNotification;
