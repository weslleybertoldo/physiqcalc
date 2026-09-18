import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("@/lib/nativeNotifications", () => ({
  requestNotificationPermission: vi.fn(async () => {}),
  startTimerNotifications: vi.fn(async () => {}),
  showTimerFinishedNotification: vi.fn(async () => {}),
  cancelTimerNotification: vi.fn(async () => {}),
}));

import TimerDescanso from "./TimerDescanso";

function renderTimer(onAbrirSom?: () => void) {
  return render(
    <TimerDescanso
      ativo
      exercicioNome="Agachamento"
      numeroSerie={1}
      duracaoSegundos={90}
      serieId="ex1-1-1"
      onFechado={() => {}}
      onTempoAlterado={() => {}}
      onAbrirSom={onAbrirSom}
    />,
  );
}

beforeEach(() => localStorage.clear());

describe("TimerDescanso — ícone Som do descanso", () => {
  it("mostra o ícone 🔊 na barra e abre o popup ao tocar", () => {
    const abrir = vi.fn();
    renderTimer(abrir);
    const botao = document.querySelector("[data-abrir-som]") as HTMLButtonElement;
    expect(botao).not.toBeNull();
    expect(botao.getAttribute("aria-label")).toBe("Som do descanso");
    fireEvent.click(botao);
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("sem onAbrirSom não renderiza o ícone (barra igual à de antes)", () => {
    renderTimer(undefined);
    expect(document.querySelector("[data-abrir-som]")).toBeNull();
    expect(document.body.textContent).toContain("Descanso");
  });
});
