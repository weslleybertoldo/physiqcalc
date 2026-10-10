import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { animarPeloEstado, terminarSaida } from "@/test/animacao";
import type { ExercicioEditor } from "./tipos";

// hml-18a (H-40) — a folha "Editar exercício" do editor de treino: o Salvar mostra "Salvando…" e fica desligado enquanto grava (o G
// barato da spec: sem toque duplo nem espera em silêncio) e, ao fechar, a folha sai com o exercício de antes (não some seca).

vi.mock("@/treino/ui/MiniaturaGif", () => ({ MiniaturaGif: () => null }));

import { FolhaEditarExercicio } from "./folhas";

const ex: ExercicioEditor = {
  chave: "ex:1", exercicio_id: "1", exercicio_usuario_id: null, nome: "Supino reto", subtitulo: "Peito · peitoral médio", grupoMuscular: "Peito",
  imagem_url: null, corrida: false, series: 3, seriesProprias: true, reps: "10", descanso: 60, carga: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FolhaEditarExercicio (hml-18a)", () => {
  it("Salvar: \"Salvando…\" desligado enquanto grava; o 2º toque não grava de novo; gravou → fecha", async () => {
    let terminar!: (v: unknown) => void;
    const aoSalvar = vi.fn(() => new Promise((r) => { terminar = r; }));
    const aoMudar = vi.fn();
    render(<FolhaEditarExercicio aberto aoMudar={aoMudar} ex={ex} descansoPadrao={60} listaFixa={false} aoSalvar={aoSalvar} aoRemover={() => {}} />);
    const salvar = (await screen.findByText("Salvar")).closest("button") as HTMLButtonElement;
    fireEvent.click(salvar);
    expect(aoSalvar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(salvar.textContent).toContain("Salvando…"));
    expect(salvar).toBeDisabled();
    expect(salvar.getAttribute("data-salvando")).toBe("1");
    expect(document.querySelector("[data-editar-limpar]")).toBeDisabled();
    fireEvent.click(salvar);
    expect(aoSalvar).toHaveBeenCalledTimes(1);
    await act(async () => {
      terminar(true);
    });
    expect(aoMudar).toHaveBeenCalledWith(false);
    expect(salvar.textContent).toContain("Salvar");
    expect(salvar).not.toBeDisabled();
  });

  it("deu erro (a ação devolveu nada): volta ao Salvar e a folha continua aberta", async () => {
    const aoSalvar = vi.fn(async () => null);
    const aoMudar = vi.fn();
    render(<FolhaEditarExercicio aberto aoMudar={aoMudar} ex={ex} descansoPadrao={60} listaFixa={false} aoSalvar={aoSalvar} aoRemover={() => {}} />);
    const salvar = (await screen.findByText("Salvar")).closest("button") as HTMLButtonElement;
    fireEvent.click(salvar);
    await waitFor(() => expect(salvar.textContent).toContain("Salvar"));
    expect(salvar.textContent).not.toContain("Salvando");
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it("fechando (o ex vira null no pai), a folha sai com o exercício de antes — data-state=closed até a animação acabar", () => {
    animarPeloEstado();
    const props = { aoMudar: () => {}, descansoPadrao: 60, listaFixa: false, aoSalvar: async () => true, aoRemover: () => {} };
    const r = render(<FolhaEditarExercicio aberto ex={ex} {...props} />);
    const folha = document.querySelector("[data-painel]")!;
    expect(folha.getAttribute("data-state")).toBe("open");
    r.rerender(<FolhaEditarExercicio aberto={false} ex={null} {...props} />);
    expect(folha.isConnected).toBe(true);
    expect(folha.getAttribute("data-state")).toBe("closed");
    expect(folha.textContent).toContain("Supino reto");
    terminarSaida(folha, document.querySelector("[data-painel-fundo]"));
    expect(document.querySelector("[data-painel]")).toBeNull();
  });
});
