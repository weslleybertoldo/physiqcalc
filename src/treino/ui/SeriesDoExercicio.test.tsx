import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { nivelDasSeries } from "../../../supabase/functions/_shared/treino-acessos-regras";
import type { SerieComMemoria } from "../tipos";
import { SeriesDoExercicio } from "./SeriesDoExercicio";

// W-A P4 (spec §6 "P4", o "Pronto": "a nutri trava as séries e o app mostra 'O número de séries é definido pelo seu profissional'"): a
// ponta do APP da corrente. A aba Acessos grava series_travadas pela treino-acessos ("Só ver" = true — nivelDasSeries); o app lê o
// physiq_profiles pelo PowerSync (src/treino/useTreinoDoDia.ts) e o TreinoDoSlot passa podeEditar = !seriesTravadas. No local e no staging o
// build não tem PowerSync (H-14: src/lib/powersync/instancia.ts) — a tela do aluno não abre lá; por isso esta ponta é provada aqui e o E2E
// confere o banco do Treino.
const serie = (n: number): SerieComMemoria => ({ exercicio_id: "e1", numero_serie: n, peso: 40, reps: 10, salva: true });

function abrir(podeEditar: boolean) {
  const acoes = { aoSalvar: vi.fn(), aoConcluir: vi.fn(), aoDesfazer: vi.fn(), aoRemover: vi.fn(), aoAdicionar: vi.fn() };
  render(<SeriesDoExercicio exercicioId="e1" nome="Supino" series={[serie(1), serie(2)]} corrida={false} podeEditar={podeEditar} {...acoes} />);
  return acoes;
}

describe("W-A P4 — as séries travadas pela aba Acessos, no app do aluno", () => {
  it("'Só ver' na aba = series_travadas true; 'Pode mexer' = false (a regra da treino-acessos)", () => {
    expect(nivelDasSeries(true)).toBe("ver");
    expect(nivelDasSeries(false)).toBe("mexer");
    expect(nivelDasSeries(null)).toBe("mexer");
  });

  it("travadas: 'O número de séries é definido pelo seu profissional.', sem 'Adicionar série' e sem tirar série", () => {
    abrir(false);
    expect(screen.getByText("O número de séries é definido pelo seu profissional.")).toBeInTheDocument();
    expect(screen.queryByText("Adicionar série")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tirar série" })).toBeNull();
  });

  it("liberadas: põe e tira série (como hoje)", () => {
    const acoes = abrir(true);
    expect(screen.queryByText("O número de séries é definido pelo seu profissional.")).toBeNull();
    fireEvent.click(screen.getByText("Adicionar série"));
    expect(acoes.aoAdicionar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Tirar série" })[1]);
    expect(acoes.aoRemover).toHaveBeenCalledWith(2, true);
  });
});

// O campo em foco não é refeito com o que foi gravado (22/10/2026): o km digitado enquanto o Tempo ainda gravava sumia quando a
// série voltava salva, e o 2º salvamento saía sem a distância.
describe("o campo em foco fica com o que a pessoa digita", () => {
  function tela(corrida: boolean, nova: SerieComMemoria) {
    const aoSalvar = vi.fn();
    const props = {
      exercicioId: nova.exercicio_id, nome: corrida ? "Corrida" : "Supino", corrida, podeEditar: true, aoSalvar,
      aoConcluir: vi.fn(), aoDesfazer: vi.fn(), aoRemover: vi.fn(), aoAdicionar: vi.fn(),
    };
    const { rerender } = render(<SeriesDoExercicio {...props} series={[nova]} />);
    return { aoSalvar, voltaGravada: (s: SerieComMemoria) => rerender(<SeriesDoExercicio {...props} series={[s]} />) };
  }

  it("corrida: digita o tempo, vai pro km e digita 3; o Tempo volta gravado sem km → o km continua 3 e sai salvo com 3", () => {
    const nova: SerieComMemoria = { exercicio_id: "c1", numero_serie: 1, peso: 0, reps: 0, salva: false };
    const { aoSalvar, voltaGravada } = tela(true, nova);
    const tempo = screen.getByLabelText("Tempo da série 1 de Corrida (MM:SS)");
    const km = screen.getByLabelText("Distância da série 1 de Corrida (km)");
    act(() => tempo.focus());
    fireEvent.change(tempo, { target: { value: "10:00" } });
    act(() => tempo.blur());
    expect(aoSalvar).toHaveBeenLastCalledWith(1, 0, 0, 600, undefined);
    act(() => km.focus());
    fireEvent.change(km, { target: { value: "3" } });
    voltaGravada({ ...nova, tempo_segundos: 600, salva: true });
    expect(km).toHaveValue(3);
    act(() => km.blur());
    expect(aoSalvar).toHaveBeenLastCalledWith(1, 0, 0, 600, 3);
  });

  it("musculação: digita o peso, vai pras repetições e digita 12; o peso volta gravado → as repetições continuam 12", () => {
    const nova: SerieComMemoria = { exercicio_id: "e1", numero_serie: 1, peso: 30, reps: 10, salva: false };
    const { aoSalvar, voltaGravada } = tela(false, nova);
    const peso = screen.getByLabelText("Peso da série 1 de Supino (kg)");
    const reps = screen.getByLabelText("Repetições da série 1 de Supino");
    act(() => peso.focus());
    fireEvent.change(peso, { target: { value: "40" } });
    act(() => peso.blur());
    expect(aoSalvar).toHaveBeenLastCalledWith(1, 40, 10, undefined, undefined);
    act(() => reps.focus());
    fireEvent.change(reps, { target: { value: "12" } });
    voltaGravada({ ...nova, peso: 40, reps: 10, salva: true });
    expect(reps).toHaveValue(12);
    act(() => reps.blur());
    expect(aoSalvar).toHaveBeenLastCalledWith(1, 40, 12, undefined, undefined);
  });

  it("fora de foco o campo continua refeito com o que foi gravado (como hoje)", () => {
    const nova: SerieComMemoria = { exercicio_id: "c1", numero_serie: 1, peso: 0, reps: 0, salva: false };
    const { voltaGravada } = tela(true, nova);
    voltaGravada({ ...nova, tempo_segundos: 600, distancia_km: 2.5, salva: true });
    expect(screen.getByLabelText("Tempo da série 1 de Corrida (MM:SS)")).toHaveValue("10:00");
    expect(screen.getByLabelText("Distância da série 1 de Corrida (km)")).toHaveValue(2.5);
  });
});
