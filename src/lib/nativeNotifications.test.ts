import { beforeEach, describe, expect, it, vi } from "vitest";

// APK (plataforma nativa): o som escolhido no aparelho tem que chegar ao serviço nativo,
// que é quem toca no fim do descanso (o playBeep web não roda no APK).
const { plugin, local } = vi.hoisted(() => ({
  plugin: {
    startCountdown: vi.fn(async (_opts: unknown) => {}),
    stopCountdown: vi.fn(async () => {}),
  },
  local: {
    schedule: vi.fn(async (_opts: unknown) => {}),
    cancel: vi.fn(async (_opts: unknown) => {}),
    createChannel: vi.fn(async (_opts: unknown) => {}),
    requestPermissions: vi.fn(async () => ({ display: "granted" })),
  },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => plugin,
}));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: local }));

import { startTimerNotifications } from "./nativeNotifications";
import { SOM_CHAVE } from "./somDescanso";

type Agendamento = { notifications: Array<Record<string, unknown>> };

beforeEach(() => {
  localStorage.clear();
  plugin.startCountdown.mockClear();
  plugin.startCountdown.mockImplementation(async () => {});
  plugin.stopCountdown.mockClear();
  local.schedule.mockClear();
});

describe("startTimerNotifications — o som escolhido vai pro serviço nativo", () => {
  it("sem nada gravado → som 'bip' (o padrão), com o tempo e o nome da série", async () => {
    await startTimerNotifications("Supino — Série 1", 30);
    expect(plugin.startCountdown).toHaveBeenCalledTimes(1);
    expect(plugin.startCountdown).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 30, body: "Supino — Série 1", som: "bip" }),
    );
  });

  it("com 'sino' gravado no aparelho → som 'sino'", async () => {
    localStorage.setItem(SOM_CHAVE, "sino");
    await startTimerNotifications("Supino — Série 1", 45);
    expect(plugin.startCountdown).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 45, som: "sino" }));
  });

  it("'silencio' e 'vibrar' também chegam ao serviço (é ele quem decide não tocar)", async () => {
    localStorage.setItem(SOM_CHAVE, "silencio");
    await startTimerNotifications("Supino — Série 1", 30);
    localStorage.setItem(SOM_CHAVE, "vibrar");
    await startTimerNotifications("Supino — Série 1", 30);
    expect(plugin.startCountdown.mock.calls.map((c) => (c[0] as { som: string }).som)).toEqual(["silencio", "vibrar"]);
  });

  it("valor inválido gravado → cai no 'bip'", async () => {
    localStorage.setItem(SOM_CHAVE, "xpto");
    await startTimerNotifications("Supino — Série 1", 30);
    expect(plugin.startCountdown).toHaveBeenCalledWith(expect.objectContaining({ som: "bip" }));
  });

  it("plugin falhou → fallback agenda a notificação: com som só se o som escolhido toca", async () => {
    plugin.startCountdown.mockRejectedValue(new Error("sem plugin"));

    localStorage.setItem(SOM_CHAVE, "silencio");
    await startTimerNotifications("Supino — Série 1", 30);
    const semSom = (local.schedule.mock.calls[0][0] as Agendamento).notifications[0];
    expect(semSom).not.toHaveProperty("sound");
    expect(semSom.body).toBe("Descanso concluído: Supino — Série 1");

    localStorage.setItem(SOM_CHAVE, "alarme");
    await startTimerNotifications("Supino — Série 1", 30);
    const comSom = (local.schedule.mock.calls[1][0] as Agendamento).notifications[0];
    expect(comSom.sound).toBe("default");
  });
});
