import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-17 (H-39): Perfil do aluno › Dieta › Plano com as leituras falhando. Antes: "Usar um modelo ★" dizia "Nenhum plano ★ ainda"
// e a nova prescrição dizia "Sem cálculo energético registrado" (e nascia sem a meta do VET) — agora os avisos com "Tentar de novo".
const h = vi.hoisted(() => ({ calculos: vi.fn(), favoritos: vi.fn() }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u-nutri", email: "nutri@teste.com" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/nutricao/editor/lib/consultas", async (orig) => ({
  ...(await orig<typeof import("@/nutricao/editor/lib/consultas")>()),
  usePlanosDoAluno: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/nutricao/editor/lib/calculosEnergeticos", async (orig) => ({
  ...(await orig<typeof import("@/nutricao/editor/lib/calculosEnergeticos")>()),
  listarCalculos: (id: string) => h.calculos(id),
}));
vi.mock("@/nutricao/editor/lib/profissional", async (orig) => ({
  ...(await orig<typeof import("@/nutricao/editor/lib/profissional")>()),
  nomeDaNutricionista: async () => "Camila Rocha",
}));
vi.mock("@/nutricao/editor/lib/planos", async (orig) => ({
  ...(await orig<typeof import("@/nutricao/editor/lib/planos")>()),
  listarPlanosFavoritos: () => h.favoritos(),
}));

import { PacienteProvider } from "@/nutricao/editor/ui/contexto";
import Planejamento from "./Planejamento";

function montar() {
  return render(
    <MemoryRouter useTransitions={false} initialEntries={["/painel/alunos/p1/dieta"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PacienteProvider value={{ paciente: { id: "p1", nome: "Rafael Moura", nascimento: null, genero: null }, recarregar: async () => {}, podeEditar: true }}>
          <Planejamento />
        </PacienteProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.calculos.mockReset().mockResolvedValue([]);
  h.favoritos.mockReset().mockResolvedValue([]);
});

describe("Planejamento › Usar um modelo ★ (hml-17, D10)", () => {
  it("a leitura dos ★ falha → o aviso com Tentar de novo (nunca \"Nenhum plano ★ ainda\"); tocar refaz", async () => {
    h.favoritos.mockRejectedValueOnce(new Error("Não deu para carregar os planos ★ agora. Tente de novo."));
    montar();
    fireEvent.click((await screen.findAllByRole("button", { name: /Usar um modelo ★/ }))[0]);
    await waitFor(() => expect(document.querySelector("[data-modelos-plano-erro]")).not.toBeNull());
    expect(screen.getByText("Não deu para carregar os planos ★")).toBeInTheDocument();
    expect(document.querySelector("[data-modelos-plano-vazio]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(document.querySelector("[data-modelos-plano-vazio]")).not.toBeNull());
    expect(document.querySelector("[data-modelos-plano-erro]")).toBeNull();
    expect(h.favoritos).toHaveBeenCalledTimes(2);
  });

  it("controle: nenhum ★ de verdade → \"Nenhum plano ★ ainda\", sem aviso", async () => {
    montar();
    fireEvent.click((await screen.findAllByRole("button", { name: /Usar um modelo ★/ }))[0]);
    await waitFor(() => expect(document.querySelector("[data-modelos-plano-vazio]")).not.toBeNull());
    expect(document.querySelector("[data-modelos-plano-erro]")).toBeNull();
  });
});

describe("Planejamento › Nova prescrição (hml-17, D4)", () => {
  it("a leitura dos cálculos falha → \"Não deu para ler o último cálculo energético\" + Tentar (nunca \"Sem cálculo registrado\"); tocar refaz", async () => {
    h.calculos.mockRejectedValueOnce(new Error("Failed to fetch"));
    montar();
    await waitFor(() => expect(h.calculos).toHaveBeenCalledTimes(1));
    fireEvent.click((await screen.findAllByRole("button", { name: /Nova prescrição/ }))[0]);
    const origem = await waitFor(() => {
      const el = document.querySelector("[data-origem-alvo]") as HTMLElement | null;
      expect(el?.getAttribute("data-origem-alvo")).toBe("erro");
      return el as HTMLElement;
    });
    expect(origem.textContent).toMatch(/Não deu para ler o último cálculo energético/);
    expect(screen.queryByText(/Sem cálculo energético registrado/)).toBeNull();
    fireEvent.click(document.querySelector("[data-calculo-erro]")!);
    await waitFor(() => expect(document.querySelector("[data-origem-alvo]")?.getAttribute("data-origem-alvo")).toBe("sem"));
    expect(h.calculos).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[data-calculo-erro]")).toBeNull();
  });

  it("controle: sem cálculo de verdade → \"Sem cálculo energético registrado\", sem o botão de tentar", async () => {
    montar();
    await waitFor(() => expect(h.calculos).toHaveBeenCalled());
    fireEvent.click((await screen.findAllByRole("button", { name: /Nova prescrição/ }))[0]);
    await waitFor(() => expect(document.querySelector("[data-origem-alvo]")?.getAttribute("data-origem-alvo")).toBe("sem"));
    expect(screen.getByText(/Sem cálculo energético registrado/)).toBeInTheDocument();
    expect(document.querySelector("[data-calculo-erro]")).toBeNull();
  });
});
