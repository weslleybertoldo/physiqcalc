import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { ConteudoSeriesTreino } from "./ModalSeriesTreino";
import type { ExercicioTreino } from "@/lib/seriesPadrao";

afterEach(cleanup);

const EX: ExercicioTreino[] = [
  { exercicio_id: "e1", exercicio_usuario_id: null, nome: "Supino Reto", emoji: "🏋️", ordem: 0 },
  { exercicio_id: "e2", exercicio_usuario_id: null, nome: "Tríceps Testa", emoji: "💪", ordem: 1 },
  { exercicio_id: null, exercicio_usuario_id: "u1", nome: "Meu Exercício", emoji: "🔵", ordem: 2 },
];

const montar = (over: Partial<Parameters<typeof ConteudoSeriesTreino>[0]> = {}) => {
  const props = {
    nomeTreino: "Peito + tríceps",
    exercicios: EX,
    geral: 3,
    valorDe: (ex: ExercicioTreino) => (ex.exercicio_id === "e2" ? 5 : 3),
    temProprio: (ex: ExercicioTreino) => ex.exercicio_id === "e2",
    onAlterarExercicio: vi.fn(),
    onAplicarTodos: vi.fn(),
    ...over,
  };
  render(<ConteudoSeriesTreino {...props} />);
  return props;
};

describe("ConteudoSeriesTreino (popup Séries do treino)", () => {
  it("lista os exercícios do treino com o número efetivo e marca quem tem número próprio", () => {
    montar();
    expect(screen.getByText("Por exercício (3)")).toBeInTheDocument();
    const testa = screen.getByText(/Tríceps Testa/).closest("[data-admin-series-exercicio]")!;
    expect(within(testa as HTMLElement).getByText("5")).toBeInTheDocument();
    expect(within(testa as HTMLElement).getByText("próprio")).toBeInTheDocument();
    const supino = screen.getByText(/Supino Reto/).closest("[data-admin-series-exercicio]")!;
    expect(within(supino as HTMLElement).getByText("3")).toBeInTheDocument();
    expect(within(supino as HTMLElement).queryByText("próprio")).toBeNull();
  });

  it("+ e − de um exercício chamam onAlterarExercicio com o exercício e ±1", () => {
    const p = montar();
    fireEvent.click(screen.getByLabelText("Mais uma série em Supino Reto"));
    expect(p.onAlterarExercicio).toHaveBeenLastCalledWith(EX[0], 1);
    fireEvent.click(screen.getByLabelText("Menos uma série em Meu Exercício"));
    expect(p.onAlterarExercicio).toHaveBeenLastCalledWith(EX[2], -1);
  });

  it("'Aplicar a todos' manda o valor do rascunho (geral ajustado com + / −)", () => {
    const p = montar();
    const geral = screen.getByText("Todos os exercícios").closest("[data-admin-series-geral]") as HTMLElement;
    expect(within(geral).getByText("3")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mais uma série (todos)"));
    fireEvent.click(screen.getByLabelText("Mais uma série (todos)"));
    expect(within(geral).getByText("5")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Aplicar a todos"));
    expect(p.onAplicarTodos).toHaveBeenCalledWith(5);
    expect(p.onAlterarExercicio).not.toHaveBeenCalled();
  });

  it("limites: em 1 o − fica desabilitado; em 10 o + fica desabilitado", () => {
    montar({ geral: 1, valorDe: (ex) => (ex.exercicio_id === "e1" ? 10 : 1) });
    expect(screen.getByLabelText("Menos uma série (todos)")).toBeDisabled();
    expect(screen.getByLabelText("Mais uma série em Supino Reto")).toBeDisabled();
    expect(screen.getByLabelText("Menos uma série em Supino Reto")).not.toBeDisabled();
    expect(screen.getByLabelText("Menos uma série em Tríceps Testa")).toBeDisabled();
  });

  it("estados: carregando e treino sem exercícios; salvando desabilita os controles", () => {
    montar({ exercicios: null });
    expect(screen.getByText(/Carregando exercícios/)).toBeInTheDocument();
    cleanup();
    montar({ exercicios: [] });
    expect(screen.getByText(/ainda não tem exercícios/)).toBeInTheDocument();
    cleanup();
    montar({ salvando: true });
    expect(screen.getByText("Aplicar a todos")).toBeDisabled();
    expect(screen.getByLabelText("Mais uma série em Supino Reto")).toBeDisabled();
  });
});
