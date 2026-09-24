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
import { startTimerNotifications } from "@/lib/nativeNotifications";
import { SOM_EVENTO } from "@/lib/somDescanso";

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

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

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

describe("TimerDescanso — troca de som com descanso em andamento", () => {
  it("re-arma o aviso nativo com o tempo restante quando o som muda", () => {
    renderTimer();
    const start = vi.mocked(startTimerNotifications);
    expect(start).toHaveBeenCalledTimes(1); // série nova → descanso armado

    window.dispatchEvent(new CustomEvent(SOM_EVENTO, { detail: "sino" }));

    expect(start).toHaveBeenCalledTimes(2);
    const [nome, restante] = start.mock.calls[1];
    expect(nome).toBe("Agachamento — Série 1");
    expect(restante).toBeGreaterThan(0);
    expect(restante).toBeLessThanOrEqual(90);
  });

  it("sem descanso salvo no aparelho, a troca de som não re-arma nada", () => {
    renderTimer();
    const start = vi.mocked(startTimerNotifications);
    start.mockClear();
    localStorage.removeItem("physiq_rest_timer");

    window.dispatchEvent(new CustomEvent(SOM_EVENTO, { detail: "alarme" }));

    expect(start).not.toHaveBeenCalled();
  });
});

describe("TimerDescanso — botão -15s", () => {
  const menos15 = () =>
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "-15s") as HTMLButtonElement;

  it("re-arma o aviso nativo com o tempo novo (senão o APK vibra no fim antigo, depois da tela zerar)", () => {
    renderTimer();
    const start = vi.mocked(startTimerNotifications);
    start.mockClear();

    fireEvent.click(menos15());

    expect(start).toHaveBeenCalledTimes(1);
    const [nome, restante] = start.mock.calls[0];
    expect(nome).toBe("Agachamento — Série 1");
    expect(restante).toBeGreaterThanOrEqual(74);
    expect(restante).toBeLessThanOrEqual(75);
  });

  it("com o descanso pausado só guarda o tempo novo, sem armar aviso", () => {
    renderTimer();
    const salvo = JSON.parse(localStorage.getItem("physiq_rest_timer") as string);
    localStorage.setItem("physiq_rest_timer", JSON.stringify({ ...salvo, isPaused: true, pausedRemaining: 90 }));
    const start = vi.mocked(startTimerNotifications);
    start.mockClear();

    fireEvent.click(menos15());

    expect(start).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("physiq_rest_timer") as string).pausedRemaining).toBe(75);
  });
});
