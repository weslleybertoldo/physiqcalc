import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TreinoPronto } from "./treinosProntos";

// hml-17 (H-39): Master › App do aluno › Treinos prontos — o editor de um treino com a biblioteca global falhando mostrava os
// exercícios já escolhidos como "Escolha o exercício" (como se o treino estivesse sem eles). Agora: o aviso com "Tentar de novo" e os
// escolhidos continuam escolhidos (pelo nome que já veio com o treino).
const h = vi.hoisted(() => ({ listar: vi.fn(), bib: vi.fn() }));
vi.mock("@/ui/casca/treinoDaPagina", () => ({ useTreinoDaPagina: () => ({ tipo: "ok" }) }));
vi.mock("@/ui/casca/SemConexaoTreino", () => ({ SemConexaoTreino: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./treinosProntos", async (orig) => ({
  ...(await orig<typeof import("./treinosProntos")>()),
  listarTreinosProntos: () => h.listar(),
  bibliotecaGlobal: () => h.bib(),
}));

import { TreinosProntos } from "./TreinosProntos";

const TREINO: TreinoPronto = {
  id: "tp1", codigo: "ab-iniciante", nome: "AB iniciante", objetivo: "emagrecer", nivel: "iniciante", dias_por_semana: 2, divisao: "A · B",
  descricao: null, ordem: 1, ativo: true,
  grupos: [{ letra: "A", nome: "Treino A", dias: ["SEG"], exercicios: [{ exercicio_id: "ex1", nome: "Supino reto", series: 3, reps: "12", descanso_segundos: 60, observacao: null }] }],
};

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TreinosProntos />
    </QueryClientProvider>,
  );
}

const selecionado = () => {
  const s = document.querySelector('[data-exercicio-pronto="0"] select') as HTMLSelectElement;
  return { valor: s.value, texto: s.options[s.selectedIndex]?.textContent ?? "" };
};

beforeEach(() => {
  h.listar.mockReset().mockResolvedValue([TREINO]);
  h.bib.mockReset();
});

describe("Treinos prontos › editor (hml-17, D13)", () => {
  it("a biblioteca falha → o aviso com Tentar de novo e o exercício escolhido continua (nunca \"Escolha o exercício\"); tocar refaz", async () => {
    h.bib.mockRejectedValueOnce(new Error("Failed to fetch"));
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    await waitFor(() => expect(document.querySelector("[data-treino-pronto-bib-erro]")).not.toBeNull());
    expect(screen.getByText(/Não deu para carregar a biblioteca de exercícios/)).toBeInTheDocument();
    expect(selecionado()).toEqual({ valor: "ex1", texto: "Supino reto (a lista não carregou)" });
    h.bib.mockResolvedValueOnce([{ id: "ex1", nome: "Supino reto", grupo_muscular: "Peitoral" }, { id: "ex2", nome: "Remada", grupo_muscular: "Costas" }]);
    fireEvent.click(document.querySelector("[data-treino-pronto-bib-tentar]")!);
    await waitFor(() => expect(document.querySelector("[data-treino-pronto-bib-erro]")).toBeNull());
    expect(selecionado()).toEqual({ valor: "ex1", texto: "Supino reto · Peitoral" });
    expect(h.bib).toHaveBeenCalledTimes(2);
  });

  it("controle: a biblioteca veio → o exercício escolhido aparece pelo nome da lista, sem aviso", async () => {
    h.bib.mockResolvedValue([{ id: "ex1", nome: "Supino reto", grupo_muscular: "Peitoral" }]);
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    await waitFor(() => expect(selecionado()).toEqual({ valor: "ex1", texto: "Supino reto · Peitoral" }));
    expect(document.querySelector("[data-treino-pronto-bib-erro]")).toBeNull();
  });
});
