import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// o descanso do card da tela 2 (porte do TimerDescanso): mesmas regras do serviço nativo do APK e do som
const h = vi.hoisted(() => ({ nativo: false }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo } }));
vi.mock("@/lib/nativeNotifications", () => ({
  requestNotificationPermission: vi.fn(async () => {}),
  startTimerNotifications: vi.fn(async () => {}),
  showTimerFinishedNotification: vi.fn(async () => {}),
  cancelTimerNotification: vi.fn(async () => {}),
}));
vi.mock("@/app-aluno/perfil/pecas/SheetSom", () => ({ SheetSom: () => null }));

import { cancelTimerNotification, startTimerNotifications } from "@/lib/nativeNotifications";
import { SOM_CHAVE, SOM_EVENTO } from "@/lib/somDescanso";
import { CartaoDescanso } from "./CartaoDescanso";

const vibrar = vi.fn(() => true);

function abrir(extra: Partial<Parameters<typeof CartaoDescanso>[0]> = {}) {
  const aoFechar = vi.fn();
  const r = render(
    <CartaoDescanso ativo exercicioNome="Crucifixo com halteres" numeroSerie={2} duracaoSegundos={45} serieId="ex1-2-1"
      depois="série 3 do crucifixo" aoFechar={aoFechar} aoMudarTempo={() => {}} {...extra} />,
  );
  return { ...r, aoFechar };
}

const salvo = () => JSON.parse(localStorage.getItem("physiq_rest_timer") as string);

beforeEach(() => {
  h.nativo = false;
  localStorage.clear();
  vi.clearAllMocks();
  Object.defineProperty(navigator, "vibrate", { value: vibrar, configurable: true });
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("card do descanso (tela 2)", () => {
  it('mostra o anel com a contagem, "Depois: série 3 do crucifixo", −15 s e Pular; arma o descanso no aparelho', () => {
    abrir();
    expect(screen.getByText("Descanso")).toBeInTheDocument();
    expect(document.querySelector("[data-descanso-depois]")?.textContent).toBe("Depois: série 3 do crucifixo");
    expect(document.querySelector("[data-descanso-tempo]")?.textContent).toBe("0:45");
    expect(document.querySelector("[data-descanso-menos15]")).not.toBeNull();
    expect(document.querySelector("[data-descanso-pular]")?.textContent).toContain("Pular");
    expect(salvo()).toMatchObject({ ativo: true, duracao: 45, exercicioNome: "Crucifixo com halteres", numeroSerie: 2, depois: "série 3 do crucifixo" });
    expect(vi.mocked(startTimerNotifications)).toHaveBeenCalledWith("Crucifixo com halteres — Série 2", 45);
  });

  it("−15 s re-arma o aviso nativo com o tempo novo (senão o APK vibra no fim antigo)", () => {
    abrir();
    vi.mocked(startTimerNotifications).mockClear();
    fireEvent.click(document.querySelector("[data-descanso-menos15]")!);
    const [nome, restante] = vi.mocked(startTimerNotifications).mock.calls[0];
    expect(nome).toBe("Crucifixo com halteres — Série 2");
    expect(restante).toBeGreaterThanOrEqual(29);
    expect(restante).toBeLessThanOrEqual(30);
  });

  it("−15 s com o descanso pausado só guarda o tempo novo, sem armar aviso", () => {
    abrir();
    localStorage.setItem("physiq_rest_timer", JSON.stringify({ ...salvo(), isPaused: true, pausedRemaining: 45 }));
    vi.mocked(startTimerNotifications).mockClear();
    fireEvent.click(document.querySelector("[data-descanso-menos15]")!);
    expect(startTimerNotifications).not.toHaveBeenCalled();
    expect(salvo().pausedRemaining).toBe(30);
  });

  it("trocar o som com o descanso correndo re-arma o serviço nativo com o tempo que falta; sem descanso salvo, nada", () => {
    abrir();
    const start = vi.mocked(startTimerNotifications);
    start.mockClear();
    window.dispatchEvent(new CustomEvent(SOM_EVENTO, { detail: "sino" }));
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][1]).toBeGreaterThan(0);
    start.mockClear();
    localStorage.removeItem("physiq_rest_timer");
    window.dispatchEvent(new CustomEvent(SOM_EVENTO, { detail: "alarme" }));
    expect(start).not.toHaveBeenCalled();
  });

  it("Pular encerra: limpa o aparelho, cancela o aviso nativo e fecha o card", () => {
    const { aoFechar } = abrir();
    fireEvent.click(document.querySelector("[data-descanso-pular]")!);
    expect(localStorage.getItem("physiq_rest_timer")).toBeNull();
    expect(cancelTimerNotification).toHaveBeenCalled();
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("série nova (serieId muda) recomeça o descanso; trocar de dia (mesmo serieId) não", () => {
    const { rerender } = abrir();
    const start = vi.mocked(startTimerNotifications);
    start.mockClear();
    rerender(<CartaoDescanso ativo exercicioNome="Crucifixo com halteres" numeroSerie={2} duracaoSegundos={45} serieId="ex1-2-1" depois="x" aoFechar={() => {}} aoMudarTempo={() => {}} />);
    expect(start).not.toHaveBeenCalled();
    rerender(<CartaoDescanso ativo exercicioNome="Tríceps francês" numeroSerie={1} duracaoSegundos={60} serieId="ex2-1-2" depois={null} aoFechar={() => {}} aoMudarTempo={() => {}} />);
    expect(start).toHaveBeenCalledWith("Tríceps francês — Série 1", 60);
  });

  it("o restante segue o relógio (voltar do segundo plano pula o que passou)", () => {
    vi.useFakeTimers();
    abrir();
    localStorage.setItem("physiq_rest_timer", JSON.stringify({ ...salvo(), startedAt: Date.now() - 20_000 }));
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    const t = document.querySelector("[data-descanso-tempo]")!.textContent!;
    const [m, s] = t.split(":").map(Number);
    expect(m * 60 + s).toBeLessThanOrEqual(25);
    expect(m * 60 + s).toBeGreaterThanOrEqual(23);
  });

  it("no APK, voltar pro app depois do fim do descanso para o alarme nativo e não vibra de novo pela WebView", () => {
    h.nativo = true;
    localStorage.setItem(SOM_CHAVE, "vibrar");
    abrir();
    localStorage.setItem("physiq_rest_timer", JSON.stringify({ ...salvo(), startedAt: Date.now() - 90_000 }));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cancelTimerNotification).toHaveBeenCalled();
    expect(vibrar).not.toHaveBeenCalled();
  });

  it('no site, o fim do descanso vibra (quando o som vibra) e vira "Hora de treinar!" com Fechar', () => {
    vi.useFakeTimers();
    localStorage.setItem(SOM_CHAVE, "vibrar");
    abrir();
    localStorage.setItem("physiq_rest_timer", JSON.stringify({ ...salvo(), startedAt: Date.now() - 60_000 }));
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByText("Hora de treinar!")).toBeInTheDocument();
    expect(vibrar).toHaveBeenCalled();
    expect(document.querySelector("[data-descanso-pular]")?.textContent).toContain("Fechar");
    expect(document.querySelector("[data-descanso-menos15]")).toBeNull();
  });

  it("inativo não aparece", () => {
    render(<CartaoDescanso ativo={false} exercicioNome="" numeroSerie={0} duracaoSegundos={60} serieId="" aoFechar={() => {}} aoMudarTempo={() => {}} />);
    expect(document.querySelector("[data-descanso]")).toBeNull();
  });
});
