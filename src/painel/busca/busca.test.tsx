import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Command } from "cmdk";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  modulos: ["treino", "nutricao"] as string[],
  listar: vi.fn(),
  alimentos: vi.fn(),
  treinos: vi.fn(),
}));
vi.mock("@/nucleo/conta", () => ({ useConta: () => ({ conta: { id: "c1", nome: "Consultoria", modulos: h.modulos, papeis: ["dono"] } }) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u-lucas" } }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "t-lucas" } }) }));
vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_SCHEMA: "staging", principal: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const cadeia = { select: () => cadeia, or: () => cadeia, ilike: () => cadeia, order: () => cadeia, limit: () => h.treinos() };
  return { DB_SCHEMA: "staging", supabase: { from: () => cadeia, functions: { invoke: vi.fn() } } };
});
vi.mock("@/painel/alunos/api", async (orig) => ({ ...(await orig<typeof import("@/painel/alunos/api")>()), listarAlunos: h.listar }));
// o módulo de alimentos inteiro trocado (sem carregar o real: o import dinâmico fica rápido no teste)
vi.mock("@/painel/dietas/alimentosPainel", () => ({ listarAlimentosDoPainel: h.alimentos }));
vi.mock("@/nutricao/editor/lib/alimentosUtil", () => ({ FILTROS_PADRAO: { q: "", grupo: "", fonte: "" } }));

// o cmdk (a paleta) usa ResizeObserver e scrollIntoView, que o jsdom não tem
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

import BuscaAlimentos from "./Alimentos";
import BuscaAlunos from "./Alunos";
import BuscaTreinos from "./Treinos";
import { termoDaBusca } from "./_comum";

function Onde() {
  return <span data-testid="onde">{useLocation().pathname + useLocation().search}</span>;
}

function montar(el: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={["/painel"]}>
        <Routes>
          <Route path="*" element={<><Command shouldFilter={false}><Command.List>{el}</Command.List></Command><Onde /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.modulos = ["treino", "nutricao"];
  h.listar.mockReset().mockResolvedValue({ total: 1, itens: [{ id: "m1", rota_id: "t1", nome: "Rafael Moura", email: "r@x.com", telefone: null, tags: [], ativo: true, modulos: ["treino"] }] });
  h.alimentos.mockReset().mockResolvedValue({ total: 1, itens: [{ id: "a1", nome: "Arroz, integral, cozido", fonte: "taco", marca: null }] });
  h.treinos.mockReset().mockResolvedValue({ data: [{ id: "g1", nome: "Treino A — Peito", professor_id: "t-lucas" }], error: null });
});

describe("busca global (Ctrl K — NF10, W25): alunos, treinos e alimentos", () => {
  it("só busca com 2 letras ou mais", () => {
    expect(termoDaBusca(" r ")).toBe("");
    expect(termoDaBusca("  ra  fa ")).toBe("ra fa");
  });
  it("alunos: a busca da página Alunos (todas as situações) e o resultado abre o perfil", async () => {
    const fechar = vi.fn();
    montar(<BuscaAlunos termo="rafa" fechar={fechar} />);
    expect(await screen.findByText("Rafael Moura")).toBeInTheDocument();
    expect(h.listar.mock.calls[0][1]).toMatchObject({ q: "rafa", situacao: "todos" });
    fireEvent.click(screen.getByText("Rafael Moura"));
    expect(fechar).toHaveBeenCalled();
    expect(screen.getByTestId("onde").textContent).toBe("/painel/alunos/t1");
  });
  it("treinos: os treinos-modelo (seus + globais) e o resultado abre Treinos › Meus treinos", async () => {
    montar(<BuscaTreinos termo="treino a" fechar={() => {}} />);
    fireEvent.click(await screen.findByText("Treino A — Peito"));
    expect(screen.getByTestId("onde").textContent).toBe("/painel/treinos?aba=treinos&treino=g1");
  });
  it("alimentos: a consulta de Dietas › Alimentos e o resultado abre Dietas › Alimentos", { timeout: 15_000 }, async () => {
    montar(<BuscaAlimentos termo="arroz" fechar={() => {}} />);
    // o módulo de alimentos só carrega na hora da busca (import dinâmico): espera mais
    fireEvent.click(await screen.findByText("Arroz, integral, cozido", {}, { timeout: 10_000 }));
    expect(h.alimentos.mock.calls[0][0]).toMatchObject({ q: "arroz" });
    expect(screen.getByTestId("onde").textContent).toBe("/painel/dietas?aba=alimentos");
  });
  it("módulos: conta só de Treino não busca alimentos; só de Nutrição não busca treinos", async () => {
    h.modulos = ["treino"];
    montar(<BuscaAlimentos termo="arroz" fechar={() => {}} />);
    await new Promise((r) => setTimeout(r, 450));
    expect(h.alimentos).not.toHaveBeenCalled();
    h.modulos = ["nutricao"];
    montar(<BuscaTreinos termo="treino" fechar={() => {}} />);
    await new Promise((r) => setTimeout(r, 450));
    expect(h.treinos).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Treino A — Peito")).toBeNull());
  });
});
