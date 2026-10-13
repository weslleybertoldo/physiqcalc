import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Command } from "cmdk";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { animarPeloEstado, terminarSaida } from "@/test/animacao";

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
import { GrupoBusca, ItemBusca, PaletaBusca } from "@/ui/premium/Busca";
import { SAIDA_BUSCA_MS, useTermoDaBusca } from "@/ui/premium/atalhos";

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
  it("hml-17 (H-39): a fonte falhou → 1 linha \"Não deu para buscar … agora\" em cada grupo (nunca o grupo sumindo); tocar refaz", { timeout: 20_000 }, async () => {
    h.listar.mockRejectedValueOnce(new Error("Failed to fetch"));
    h.treinos.mockResolvedValueOnce({ data: null, error: { message: "fetch failed", code: "" } });
    h.alimentos.mockRejectedValueOnce(new Error("Failed to fetch"));
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    montar(<><BuscaAlunos termo="ab" fechar={() => {}} /><BuscaTreinos termo="ab" fechar={() => {}} /><BuscaAlimentos termo="ab" fechar={() => {}} /></>);
    await waitFor(() => expect(document.querySelectorAll("[data-busca-erro]")).toHaveLength(3), { timeout: 10_000 });
    expect([...document.querySelectorAll("[data-busca-erro]")].map((e) => e.getAttribute("data-busca-erro")).sort()).toEqual(["alimentos", "alunos", "treinos"]);
    expect(screen.getByText("Não deu para buscar alunos agora — tocar para tentar de novo")).toBeInTheDocument();
    // tocar refaz: a busca dos alunos volta com o resultado
    fireEvent.click(screen.getByText("Não deu para buscar alunos agora — tocar para tentar de novo"));
    expect(await screen.findByText("Rafael Moura")).toBeInTheDocument();
    expect(h.listar).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-busca-erro="alunos"]')).toBeNull();
    aviso.mockRestore();
  });
  it("hml-17 (controle): sem resultado de verdade → o grupo some (a paleta diz \"Nada encontrado.\"), sem linha de erro", async () => {
    h.listar.mockResolvedValueOnce({ total: 0, itens: [] });
    montar(<BuscaAlunos termo="zz" fechar={() => {}} />);
    await waitFor(() => expect(h.listar).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector("[data-busca-erro]")).toBeNull();
    expect(screen.queryByText("Rafael Moura")).toBeNull();
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

// hml-18a (H-40, D): a paleta (a mesma do topo do painel e do Início do app) entra e SAI animada — antes sumia em 48–120 ms, sem
// passar por data-state=closed, e o termo era limpo no mesmo clique (a lista piscava vazia saindo).
function PaletaDeTeste() {
  const [aberta, setAberta] = useState(true);
  const [termo, setTermo] = useTermoDaBusca(aberta);
  return (
    <>
      <button type="button" onClick={() => setAberta(true)}>abrir de novo</button>
      <PaletaBusca aberto={aberta} aoMudar={setAberta} termo={termo} aoMudarTermo={setTermo}>
        <GrupoBusca titulo="Alunos">
          {termo ? <ItemBusca rotulo={`Rafael (${termo})`} aoEscolher={() => setAberta(false)} /> : null}
        </GrupoBusca>
      </PaletaBusca>
      <span data-testid="termo">{termo}</span>
    </>
  );
}

const paleta = () => document.querySelector("[data-paleta-busca]");
const campo = () => document.querySelector("[data-paleta-busca] input") as HTMLInputElement;

describe("paleta da busca (hml-18a, H-40 D): sai animada e o termo só some depois", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("ao fechar, a janela fica com data-state=closed antes de sair e o termo (e o resultado) continuam até a saída acabar", async () => {
    animarPeloEstado();
    render(<PaletaDeTeste />);
    fireEvent.change(campo(), { target: { value: "rafa" } });
    expect(await screen.findByText("Rafael (rafa)")).toBeInTheDocument();
    const janela = paleta();
    expect(janela?.getAttribute("data-state")).toBe("open");
    fireEvent.keyDown(campo(), { key: "Escape" });
    // saindo: ainda na tela, fechada, com o mesmo termo e o mesmo resultado (não pisca vazia)
    expect(janela?.isConnected).toBe(true);
    expect(janela?.getAttribute("data-state")).toBe("closed");
    expect(screen.getByTestId("termo").textContent).toBe("rafa");
    expect(screen.getByText("Rafael (rafa)")).toBeInTheDocument();
    terminarSaida(janela, document.querySelector(".bg-black\\/55"));
    expect(paleta()).toBeNull();
    // o termo volta a "" só depois do tempo da saída
    await waitFor(() => expect(screen.getByTestId("termo").textContent).toBe(""), { timeout: SAIDA_BUSCA_MS * 5 });
  });

  it("as classes: fundo e janela com a saída espelhada da entrada, em 200 ms", () => {
    render(<PaletaDeTeste />);
    const janela = paleta()!.className;
    for (const c of ["duration-200", "data-[state=closed]:animate-out", "data-[state=closed]:fade-out-0", "data-[state=closed]:zoom-out-95"]) expect(janela).toContain(c);
    const fundo = document.querySelector(".bg-black\\/55")!.className;
    for (const c of ["duration-200", "data-[state=closed]:animate-out", "data-[state=closed]:fade-out-0"]) expect(fundo).toContain(c);
  });

  it("abrir de novo logo depois (no meio da saída) funciona e já começa limpo", async () => {
    animarPeloEstado();
    render(<PaletaDeTeste />);
    fireEvent.change(campo(), { target: { value: "rafa" } });
    await screen.findByText("Rafael (rafa)");
    fireEvent.keyDown(campo(), { key: "Escape" });
    expect(paleta()?.getAttribute("data-state")).toBe("closed");
    fireEvent.click(screen.getByText("abrir de novo"));
    expect(paleta()?.getAttribute("data-state")).toBe("open");
    expect(screen.getByTestId("termo").textContent).toBe("");
    expect(campo().value).toBe("");
    fireEvent.change(campo(), { target: { value: "ana" } });
    expect(await screen.findByText("Rafael (ana)")).toBeInTheDocument();
  });
});
