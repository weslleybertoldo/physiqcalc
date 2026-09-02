import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ConteudoExerciciosGrupo } from "./ModalExerciciosGrupoAdmin";

const EX = [
  { id: "e1", nome: "Supino Reto com Barra", grupo_muscular: "Peitoral", emoji: "🏋️" },
  { id: "e2", nome: "Crucifixo na Máquina", grupo_muscular: "Peitoral", emoji: "🏋️" },
  { id: "e3", nome: "Puxada Aberta Frontal", grupo_muscular: "Dorsal / Bíceps", emoji: "🏋️" },
  { id: "e4", nome: "Rosca Direta com Barra", grupo_muscular: "Bíceps", emoji: "💪" },
  { id: "e5", nome: "Leg Press", grupo_muscular: "Quadríceps / Glúteo", emoji: "🦵" },
];
const GRUPO = { id: "g1", nome: "Treino D + Superior" };

const montar = (idsNoTreino: string[], onToggle: (id: string) => Promise<void> | void = () => {}) =>
  render(<ConteudoExerciciosGrupo grupo={GRUPO} exercicios={EX} idsNoTreino={idsNoTreino} onToggle={onToggle} />);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ConteudoExerciciosGrupo (popup do lápis do treino)", () => {
  it("abre na lista de grupos musculares com contagem e quantos já estão no treino", () => {
    montar(["e1"]);
    expect(screen.getByText("Grupos musculares")).toBeInTheDocument();
    expect(screen.getByText("Peito")).toBeInTheDocument();
    expect(screen.getByText("2 ex. · 1 no treino")).toBeInTheDocument();
    // Costas, Bíceps e Quadríceps têm 1 exercício cada e nenhum no treino
    expect(screen.getAllByText("1 ex.")).toHaveLength(3);
    // nenhum exercício listado antes de abrir um grupo
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("abre o grupo, marca conforme o treino e chama onToggle ao clicar", () => {
    const onToggle = vi.fn();
    montar(["e1"], onToggle);
    fireEvent.click(screen.getByText("Peito"));

    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByText("1 de 2 no treino")).toBeInTheDocument();
    expect(screen.getByLabelText(/Supino Reto com Barra/)).toBeChecked();
    const crucifixo = screen.getByLabelText(/Crucifixo na Máquina/);
    expect(crucifixo).not.toBeChecked();

    fireEvent.click(crucifixo);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("e2");
  });

  it("ignora o 2º clique no mesmo exercício enquanto a gravação está em andamento", async () => {
    let liberar: () => void = () => {};
    const onToggle = vi.fn(() => new Promise<void>((r) => { liberar = r; }));
    montar([], onToggle);
    fireEvent.click(screen.getByText("Peito"));

    const crucifixo = screen.getByLabelText(/Crucifixo na Máquina/);
    fireEvent.click(crucifixo);
    await waitFor(() => expect(crucifixo).toBeDisabled());
    fireEvent.click(crucifixo);
    expect(onToggle).toHaveBeenCalledTimes(1);

    liberar();
    await waitFor(() => expect(crucifixo).not.toBeDisabled());
  });

  it("chips 'No treino' seguem a ordem do treino e removem com confirmação", () => {
    const onToggle = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    montar(["e5", "e1"], onToggle);

    const chips = screen.getByText("No treino (2)").parentElement!.querySelectorAll("button");
    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveTextContent("Leg Press");
    expect(chips[1]).toHaveTextContent("Supino Reto com Barra");

    fireEvent.click(chips[0]);
    expect(window.confirm).toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledWith("e5");
  });

  it("não remove pelo chip quando a confirmação é cancelada", () => {
    const onToggle = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    montar(["e1"], onToggle);

    fireEvent.click(screen.getByText("No treino (1)").parentElement!.querySelector("button")!);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("busca filtra em todos os grupos e mostra o bloco muscular de cada resultado", () => {
    montar([]);
    fireEvent.change(screen.getByPlaceholderText("Buscar exercício..."), { target: { value: "rosca" } });

    expect(screen.getByLabelText(/Rosca Direta com Barra/)).toBeInTheDocument();
    expect(screen.getByText("Bíceps")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Supino/)).toBeNull();
  });

  it("ignora id do treino que não existe mais no catálogo", () => {
    montar(["apagado-da-biblioteca", "e1"]);
    expect(screen.getByText("No treino (1)")).toBeInTheDocument();
  });

  it("sem exercícios: orienta a montar o treino e não mostra chips", () => {
    montar([]);
    expect(screen.getByText(/nenhum exercício ainda/)).toBeInTheDocument();
    expect(screen.queryByText(/No treino \(/)).toBeNull();
  });
});
