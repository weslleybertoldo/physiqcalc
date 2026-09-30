import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ execute: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock("@powersync/react", () => ({ usePowerSync: () => ({ execute: h.execute }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/nativeNotifications", () => ({
  MARCOS_TREINO_LONGO_MIN: [90, 120, 180],
  formatMarcoTreinoLongo: (m: number) => `${m}min`,
  agendarAvisosTreinoLongo: vi.fn(async () => {}),
  cancelarAvisosTreinoLongo: vi.fn(async () => {}),
  avisarTreinoLongoWeb: vi.fn(),
}));

import { agendarAvisosTreinoLongo, cancelarAvisosTreinoLongo } from "@/lib/nativeNotifications";
import { iniciarTreinoSeParado, lerCronometro, treinoEmAndamento } from "./cronometro";
import { useCronometroTreino, type AlvoCronometro } from "./useCronometroTreino";

const DIA = "2026-09-29";
const alvo = (concluidas: boolean[]): AlvoCronometro => ({
  userId: "u1",
  dateKey: DIA,
  grupoNome: "Peito + tríceps",
  series: concluidas.map((c, i) => ({ exercicio_id: i < 2 ? "e1" : "e2", numero_serie: (i % 2) + 1, concluida: c, peso: 20, reps: 10, academia_nome: "Smart Fit" })),
  exerciciosMap: { e1: { nome: "Supino" }, e2: { nome: "Crucifixo" } },
});

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("cronômetro do treino (C77)", () => {
  it("OK numa série inicia o treino só se nenhum estiver rodando (e agenda os avisos de 1h30/2h/3h)", () => {
    expect(treinoEmAndamento()).toBe(false);
    expect(iniciarTreinoSeParado(DIA, "Peito + tríceps")).toBe(true);
    const primeiro = lerCronometro()!.startedAt;
    expect(agendarAvisosTreinoLongo).toHaveBeenCalledTimes(1);
    expect(iniciarTreinoSeParado(DIA, "Outro")).toBe(false);
    expect(lerCronometro()!.startedAt).toBe(primeiro);
    expect(lerCronometro()!.grupoNome).toBe("Peito + tríceps");
  });

  it('pergunta "Treino foi concluído?" quando a última série recebe OK com o cronômetro rodando — 1 vez por transição', () => {
    const { result, rerender } = renderHook(({ a }) => useCronometroTreino(a), { initialProps: { a: alvo([true, true, true, false]) } });
    expect(result.current.perguntarFim).toBe(false);
    act(() => void iniciarTreinoSeParado(DIA, "Peito + tríceps"));
    expect(result.current.rodandoAqui).toBe(true);
    rerender({ a: alvo([true, true, true, true]) });
    expect(result.current.perguntarFim).toBe(true);
    act(() => result.current.setPerguntarFim(false)); // "Não, continuar"
    rerender({ a: alvo([true, true, true, true]) });
    expect(result.current.perguntarFim).toBe(false);
    rerender({ a: alvo([true, true, true, false]) }); // refez uma
    rerender({ a: alvo([true, true, true, true]) }); // concluiu de novo → pergunta de novo
    expect(result.current.perguntarFim).toBe(true);
  });

  it("sem cronômetro rodando não pergunta (concluir séries sem iniciar o treino)", () => {
    const { result, rerender } = renderHook(({ a }) => useCronometroTreino(a), { initialProps: { a: alvo([true, false]) } });
    rerender({ a: alvo([true, true]) });
    expect(result.current.perguntarFim).toBe(false);
  });

  it("Concluir grava o treino no histórico com peso/reps de cada série e a academia, para o cronômetro e chama o fim", async () => {
    const fim = vi.fn();
    const { result } = renderHook(() => useCronometroTreino(alvo([true, true, true, false]), fim));
    act(() => void iniciarTreinoSeParado(DIA, "Peito + tríceps"));
    await act(async () => {
      await result.current.concluir();
    });
    expect(treinoEmAndamento()).toBe(false);
    expect(cancelarAvisosTreinoLongo).toHaveBeenCalled();
    const [sql, params] = h.execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO treino_historico");
    expect(params[0]).toBe("u1");
    expect(params[1]).toBe("Peito + tríceps");
    const exs = JSON.parse(params[5] as string);
    expect(exs).toHaveLength(2);
    expect(exs[0]).toMatchObject({ exercicio_id: "e1", nome: "Supino", series_concluidas: 2, academia_nome: "Smart Fit" });
    expect(exs[1]).toMatchObject({ exercicio_id: "e2", series_concluidas: 1 }); // a série sem OK fica fora
    expect(fim).toHaveBeenCalledTimes(1);
    expect(result.current.concluido?.resumo.exercicios).toHaveLength(2);
  });

  it("o tempo conta pelo relógio (não por contador)", () => {
    localStorage.setItem("physiq_workout_timer", JSON.stringify({ ativo: true, startedAt: Date.now() - 65_000, dateKey: DIA, grupoNome: "Perna", avisos: [] }));
    const { result } = renderHook(() => useCronometroTreino(alvo([false])));
    expect(result.current.segundos).toBeGreaterThanOrEqual(65);
    expect(result.current.segundos).toBeLessThan(68);
  });
});
