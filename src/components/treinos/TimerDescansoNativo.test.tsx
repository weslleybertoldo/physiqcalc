import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// APK: no fim do descanso quem vibra é o serviço nativo (11 s); ao voltar pro app ele para.
// A WebView não pode vibrar de novo aqui, senão os 11 s recomeçam.
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@/lib/nativeNotifications", () => ({
  requestNotificationPermission: vi.fn(async () => {}),
  startTimerNotifications: vi.fn(async () => {}),
  showTimerFinishedNotification: vi.fn(async () => {}),
  cancelTimerNotification: vi.fn(async () => {}),
}));

import TimerDescanso from "./TimerDescanso";
import { cancelTimerNotification } from "@/lib/nativeNotifications";
import { SOM_CHAVE } from "@/lib/somDescanso";

const vibrate = vi.fn(() => true);

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem(SOM_CHAVE, "vibrar");
  vi.clearAllMocks();
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TimerDescanso no APK — voltar pro app depois do fim do descanso", () => {
  it("para o alarme nativo e não vibra de novo pela WebView", () => {
    render(
      <TimerDescanso
        ativo
        exercicioNome="Agachamento"
        numeroSerie={1}
        duracaoSegundos={60}
        serieId="ex1-1-1"
        onFechado={() => {}}
        onTempoAlterado={() => {}}
      />,
    );
    // O descanso acabou com o app em segundo plano (o intervalo da WebView ficou parado)
    const salvo = JSON.parse(localStorage.getItem("physiq_rest_timer") as string);
    localStorage.setItem("physiq_rest_timer", JSON.stringify({ ...salvo, startedAt: Date.now() - 90_000 }));

    document.dispatchEvent(new Event("visibilitychange"));

    expect(cancelTimerNotification).toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });
});
