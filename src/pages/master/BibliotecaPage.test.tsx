import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-14d (B21 · D24): a Biblioteca global do master em páginas de 20 do banco do Treino (RPC exercicios_da_lista) — o escopo
// (globais / dos professores), a busca sem acento + os códigos dos rótulos (codigosDaBusca, do agente A — aqui um mock), o total e os
// números do topo do banco; os nomes dos donos só dos exercícios da página (master-professores); erro = o estado de erro.
const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), invoke: vi.fn(), codigos: vi.fn(), contagem: 0, grupos: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: h.from } }));
vi.mock("@/lib/saasApi", () => ({ invokeEdge: h.invoke }));
vi.mock("@/treino/equivalenciaBusca", () => ({ codigosDaBusca: h.codigos }));
vi.mock("@/treino/ui/FormExercicioBiblioteca", () => ({ FormExercicioBiblioteca: () => null }));

import BibliotecaPage from "./BibliotecaPage";

/** a consulta do supabase-js (encadeável e "await-ável") — anota a cadeia */
function consulta(tabela: string) {
  const cadeia: Record<string, unknown> & { passos: Array<[string, unknown[]]> } = { passos: [] };
  for (const m of ["select", "is", "eq", "order", "update", "insert", "delete"]) {
    cadeia[m] = (...args: unknown[]) => {
      cadeia.passos.push([m, args]);
      return cadeia;
    };
  }
  cadeia.then = (ok: (v: unknown) => unknown, falhou: (e: unknown) => unknown) =>
    Promise.resolve(tabela === "grupos_musculares" ? { data: h.grupos, error: null } : { data: null, error: null, count: h.contagem }).then(ok, falhou);
  consultas.push({ tabela, cadeia });
  return cadeia;
}
let consultas: Array<{ tabela: string; cadeia: ReturnType<typeof consulta> }> = [];

const ex = (i: number, o: Record<string, unknown> = {}) => ({
  id: `e${i}`, nome: `Exercício ${String(i).padStart(3, "0")}`, grupo_muscular: "Peito", emoji: null, tipo: "musculacao", imagem_url: null, subgrupo: null,
  dica: null, professor_id: null, padrao_movimento: "supino_reto", equipamento: "barra", variacao: null, ...o,
});
const pagina = (offset: number, total: number, fazer: (i: number) => ReturnType<typeof ex>, extra: Record<string, unknown> = {}) => ({
  ok: true, total, total_global: 144, total_meu: 0, total_professores: 3, com_gif: 100, total_escopo: total, sem_classificacao: 12,
  itens: Array.from({ length: Math.max(0, Math.min(20, total - offset)) }, (_, k) => fazer(offset + k + 1)), ...extra,
});
type Pedido = { p_filtros: { escopo: string; q: string; codigos: string[] }; p_offset: number; p_limite: number };
const ultimoPedido = () => h.rpc.mock.calls.at(-1)?.[1] as Pedido;

function montar(rota = "/master/biblioteca") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Endereco() {
    const l = useLocation();
    return <output data-endereco={l.search} />;
  }
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[rota]}><BibliotecaPage /><Endereco /></MemoryRouter></QueryClientProvider>);
}
const endereco = () => document.querySelector("[data-endereco]")?.getAttribute("data-endereco") ?? "";
const rotulo = () => document.querySelector('[data-paginacao="master-biblioteca"] [data-paginacao-rotulo]')?.textContent;
const ESPERA = { timeout: 4000 };

beforeEach(() => {
  h.rpc.mockReset().mockImplementation(async (_nome: string, p: Pedido) => ({
    data: p.p_filtros.escopo === "professores"
      ? pagina(p.p_offset, 3, (i) => ex(i, { professor_id: i === 3 ? "prof-b" : "prof-a", nome: `Do professor ${i}` }))
      : pagina(p.p_offset, 144, (i) => ex(i)),
    error: null,
  }));
  h.from.mockReset().mockImplementation((t: string) => consulta(t));
  h.invoke.mockReset().mockResolvedValue({ professores: [{ id: "prof-a", nome: "Ana Personal" }, { id: "prof-b", nome: "Bruno Personal" }, { id: "prof-z", nome: "Zeca" }], total: 3 });
  h.codigos.mockReset().mockImplementation((t: string) => (t ? ["supino_reto"] : []));
  h.contagem = 0;
  h.grupos = [{ id: "g1", nome: "Peito", professor_id: null }];
  consultas = [];
});

describe("hml-14d — Master › Biblioteca global (exercicios_da_lista)", () => {
  it("página 1 dos globais pelo banco: 20, \"1–20 de 144\", os números do topo do banco; Próxima pede a 2 (no endereço)", async () => {
    montar();
    await waitFor(() => expect(rotulo()).toBe("1–20 de 144"));
    expect(h.rpc).toHaveBeenCalledWith("exercicios_da_lista", { p_filtros: { escopo: "global", q: "", codigos: [] }, p_offset: 0, p_limite: 20 });
    expect(document.querySelectorAll('[data-lista="master-biblioteca"] [data-item]').length).toBe(20);
    // o texto do topo de hoje, com os números do banco (o e2e/w09 lê o "sem movimento/equipamento")
    expect(screen.getByText(/144 exercício\(s\) global\(is\) · 3 dos professores · 12 global\(is\) sem movimento\/equipamento/)).toBeInTheDocument();
    // nenhuma leitura da tabela inteira (antes: tb_exercicios sem range) — só os grupos globais
    expect(consultas.map((c) => c.tabela)).toEqual(["grupos_musculares"]);
    expect(consultas[0].cadeia.passos).toContainEqual(["is", ["professor_id", null]]);
    // nenhum exercício da página tem dono: nenhum pedido de nomes
    expect(h.invoke).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('[data-paginacao="master-biblioteca"] [data-pagina-proxima]')!);
    await waitFor(() => expect(ultimoPedido().p_offset).toBe(20), ESPERA);
    expect(endereco()).toContain("pagina=2");
  });

  it("a busca vai ao banco 300 ms depois (o texto e os códigos dos rótulos que casaram) e volta à 1", async () => {
    montar("/master/biblioteca?pagina=3");
    await waitFor(() => expect(ultimoPedido()?.p_offset).toBe(40));
    fireEvent.change(document.querySelector("[data-input-busca-exercicio]")!, { target: { value: "  supino " } });
    await waitFor(() => expect(ultimoPedido()).toEqual({ p_filtros: { escopo: "global", q: "supino", codigos: ["supino_reto"] }, p_offset: 0, p_limite: 20 }), ESPERA);
    expect(h.codigos).toHaveBeenCalledWith("supino");
    expect(endereco()).not.toContain("pagina=");
  });

  it("dos professores: o escopo vai ao banco e o nome do dono vem só para os donos da página", async () => {
    montar();
    await waitFor(() => expect(rotulo()).toBe("1–20 de 144"));
    fireEvent.click(document.querySelector("[data-switch-dos-professores]")!);
    await waitFor(() => expect(ultimoPedido().p_filtros.escopo).toBe("professores"), ESPERA);
    await waitFor(() => expect(screen.getByText("Bruno Personal")).toBeInTheDocument());
    expect(screen.getAllByText("Ana Personal").length).toBe(2);
    expect(h.invoke).toHaveBeenCalledWith("master-professores", { action: "list", limit: 100, offset: 0 });
    expect(rotulo()).toBe("1–3 de 3");
  });

  it("dos professores sem ser master no Treino (a RPC diz 0 dos professores): lista vazia, nunca os globais no lugar", async () => {
    h.rpc.mockImplementation(async (_n: string, p: Pedido) => ({ data: pagina(p.p_offset, 144, (i) => ex(i), { total_professores: 0 }), error: null }));
    montar();
    await waitFor(() => expect(rotulo()).toBe("1–20 de 144"));
    fireEvent.click(document.querySelector("[data-switch-dos-professores]")!);
    expect(await screen.findByText("Nenhum exercício criado por professores.", undefined, ESPERA)).toBeInTheDocument();
    expect(document.querySelector('[data-lista="master-biblioteca"]')).toBeNull();
  });

  it("erro do banco = o estado de erro (nunca \"Biblioteca global vazia\")", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "permission denied for function exercicios_da_lista" } });
    montar();
    expect(await screen.findByText("Erro: permission denied for function exercicios_da_lista")).toBeInTheDocument();
    expect(screen.queryByText("Biblioteca global vazia.")).toBeNull();
    expect(document.querySelector('[data-paginacao="master-biblioteca"]')).toBeNull();
  });

  it("excluir um grupo conta no banco quantos globais usam o nome (HEAD), sem baixar a biblioteca", async () => {
    h.contagem = 7;
    montar();
    await waitFor(() => expect(document.querySelector('[data-grupo-chip="g1"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-grupo-chip="g1"] [data-btn-excluir-grupo]')!);
    expect(await screen.findByText(/7 exercício\(s\) global\(is\) usam esse nome/)).toBeInTheDocument();
    const conta = consultas.find((c) => c.tabela === "tb_exercicios")!;
    expect(conta.cadeia.passos).toEqual([["select", ["id", { count: "exact", head: true }]], ["is", ["professor_id", null]], ["eq", ["grupo_muscular", "Peito"]]]);
  });
});
