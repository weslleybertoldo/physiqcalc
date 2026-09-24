import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// APK: o "Ouvir" vibra pelo serviço nativo (uso alarme, igual ao fim do descanso). O navigator.vibrate da
// WebView sai como vibração de toque e o Android ignora com a "vibração ao tocar" desligada.
const { plugin } = vi.hoisted(() => ({
  plugin: {
    startCountdown: vi.fn(async () => {}),
    stopCountdown: vi.fn(async () => {}),
    vibrar: vi.fn(async () => {}),
  },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => plugin,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SomDescansoDialog from "./SomDescansoDialog";

const ouvir = (v: string) => document.querySelector(`[data-som-ouvir="${v}"]`) as HTMLButtonElement;
const vibrate = vi.fn(() => true);

beforeEach(() => {
  plugin.vibrar.mockClear();
  vibrate.mockClear();
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
});

describe("SomDescansoDialog no APK", () => {
  it("Ouvir do Só vibrar vibra pelo nativo, não pelo navegador", () => {
    render(<SomDescansoDialog open onOpenChange={() => {}} />);
    fireEvent.click(ouvir("vibrar"));
    expect(plugin.vibrar).toHaveBeenCalledTimes(1);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("Ouvir do Silencioso não vibra", () => {
    render(<SomDescansoDialog open onOpenChange={() => {}} />);
    fireEvent.click(ouvir("silencio"));
    expect(plugin.vibrar).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });
});
