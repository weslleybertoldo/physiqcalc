import { fireEvent, render, screen } from "@testing-library/react";
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
