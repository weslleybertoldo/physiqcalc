import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { io } = vi.hoisted(() => ({
  io: {
    cb: null as null | ((entries: { isIntersecting: boolean }[]) => void),
    observados: 0,
    desconectados: 0,
  },
}));
vi.mock("@powersync/react", () => ({ usePowerSync: () => ({ execute: vi.fn(async () => {}) }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/nativeNotifications", () => ({
  MARCOS_TREINO_LONGO_MIN: [90, 120, 180],
  formatMarcoTreinoLongo: (m: number) => `${m}min`,
  agendarAvisosTreinoLongo: vi.fn(async () => {}),
  cancelarAvisosTreinoLongo: vi.fn(async () => {}),
  avisarTreinoLongoWeb: vi.fn(),
}));

import WorkoutTimer from "./WorkoutTimer";

class IntersectionObserverFake {
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) { io.cb = cb; }
  observe() { io.observados++; }
  unobserve() {}
  disconnect() { io.desconectados++; }
}

const DATE_KEY = "2026-09-18";

function treinoEmAndamento() {
  localStorage.setItem("physiq_workout_timer", JSON.stringify({
    ativo: true, startedAt: Date.now() - 65_000, dateKey: DATE_KEY, grupoNome: "Perna Completo", avisos: [],
  }));
}

function renderTimer() {
  return render(
    <WorkoutTimer userId="u1" grupoNome="Perna Completo" dateKey={DATE_KEY} series={[]} exerciciosMap={{}} />,
  );
}

const pilula = () => document.querySelector("[data-pilula-tempo]") as HTMLButtonElement | null;

beforeEach(() => {
  localStorage.clear();
  io.cb = null;
  io.observados = 0;
  io.desconectados = 0;
  vi.stubGlobal("IntersectionObserver", IntersectionObserverFake);
});

describe("WorkoutTimer — pílula verde do tempo", () => {
  it("card fora da tela → pílula verde piscando com o mesmo tempo; card de volta → some", () => {
    treinoEmAndamento();
    renderTimer();
    expect(screen.getByText(/Treino em andamento/i)).toBeInTheDocument();
    expect(io.observados).toBe(1);
    expect(pilula()).toBeNull();

    act(() => io.cb?.([{ isIntersecting: false }]));
    const p = pilula();
    expect(p).not.toBeNull();
    expect(p?.textContent).toMatch(/00:01:0[5-9]/);
    expect(p?.className).toContain("bg-classify-green");
    expect(p?.className).toContain("animate-pulse");
    expect(p?.className).toContain("fixed");

    act(() => io.cb?.([{ isIntersecting: true }]));
    expect(pilula()).toBeNull();
  });

  it("sem treino em andamento não observa nem mostra a pílula", () => {
    renderTimer();
    expect(screen.getByText(/INICIAR TREINO/i)).toBeInTheDocument();
    expect(io.observados).toBe(0);
    expect(pilula()).toBeNull();
  });

  it("toque na pílula rola de volta até o card", () => {
    treinoEmAndamento();
    renderTimer();
    const card = document.querySelector("[data-workout-card]") as HTMLElement;
    const scroll = vi.fn();
    card.scrollIntoView = scroll;
    act(() => io.cb?.([{ isIntersecting: false }]));
    fireEvent.click(pilula()!);
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("desmontar desconecta o observador", () => {
    treinoEmAndamento();
    const { unmount } = renderTimer();
    unmount();
    expect(io.desconectados).toBe(1);
  });
});
