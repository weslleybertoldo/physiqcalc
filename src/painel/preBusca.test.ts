// hml-18b (H-54, F): a pré-busca da 1ª dobra do painel — a chave é a MESMA da tela (a tela acha no cache), nada sem a conta ou sem a
// sessão do Treino, e o Financeiro fica de fora (as funções dele mudam na W dos planos do aluno).
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ alunos: vi.fn(), modelos: vi.fn(), pastas: vi.fn() }));
vi.mock("@/painel/alunos/api", () => ({ listarAlunos: h.alunos }));
vi.mock("@/painel/treinos/api", () => ({
  carregarPaginaDeModelos: h.modelos,
  carregarPastas: h.pastas,
  buscarAlunosDoTreino: vi.fn(),
  carregarModeloPorId: vi.fn(),
  carregarMusculos: vi.fn(),
  carregarQuemRecebe: vi.fn(),
}));

import { consultaListaAlunos, filtrosDaUrl } from "@/painel/alunos/consultas";
import { consultaPaginaDeModelos, consultaPastas } from "@/painel/treinos/useTreinos";
import type { ItemRegistro } from "@/rotas/registro";
import { TELAS_COM_PRE_BUSCA, preBuscar } from "./preBusca";

const tela = (arquivo: string) => ({ nome: arquivo, caminho: `/src/painel/paginas/${arquivo}.tsx` }) as ItemRegistro;
let qc: QueryClient;

beforeEach(() => {
  qc = new QueryClient();
  h.alunos.mockReset().mockResolvedValue({ itens: [{ id: "a1" }], total: 1 });
  h.modelos.mockReset().mockResolvedValue({ itens: [], total: 0 });
  h.pastas.mockReset().mockResolvedValue([]);
});

describe("pré-busca do painel (hml-18b)", () => {
  it("só Alunos e Treinos — o Financeiro (e o resto) fora", () => {
    expect(TELAS_COM_PRE_BUSCA).toEqual(["/src/painel/paginas/Alunos.tsx", "/src/painel/paginas/Treinos.tsx"]);
    expect(preBuscar(tela("Financeiro"), { qc, contaId: "c1", meuIdTreino: "u1" })).toBeNull();
    expect(preBuscar(tela("Dashboard"), { qc, contaId: "c1", meuIdTreino: "u1" })).toBeNull();
  });

  it("Alunos: a 1ª página do filtro padrão no cache, com a MESMA chave que a tela usa no endereço sem filtro", async () => {
    await preBuscar(tela("Alunos"), { qc, contaId: "c1", meuIdTreino: null });
    const daTela = consultaListaAlunos("c1", filtrosDaUrl(new URLSearchParams("")), 1).queryKey;
    expect(qc.getQueryData(daTela)).toEqual({ itens: [{ id: "a1" }], total: 1 });
    expect(h.alunos).toHaveBeenCalledTimes(1);
    // o staleTime da tela (20 s): a tela que monta logo depois não busca de novo
    expect(qc.getQueryState(daTela)?.isInvalidated).toBe(false);
  });

  it("Alunos sem a conta ativa: nada", () => {
    expect(preBuscar(tela("Alunos"), { qc, contaId: null, meuIdTreino: "u1" })).toBeNull();
    expect(h.alunos).not.toHaveBeenCalled();
  });

  it("Treinos: a 1ª página de modelos (sem filtro) e as pastas — só com a sessão do Treino", async () => {
    expect(preBuscar(tela("Treinos"), { qc, contaId: "c1", meuIdTreino: null })).toBeNull();
    expect(h.modelos).not.toHaveBeenCalled();
    await preBuscar(tela("Treinos"), { qc, contaId: "c1", meuIdTreino: "u1" });
    expect(qc.getQueryData(consultaPaginaDeModelos("u1", { q: "", pasta: null }, 1).queryKey)).toEqual({ itens: [], total: 0 });
    expect(qc.getQueryData(consultaPastas("u1").queryKey)).toEqual([]);
  });

  it("erro de rede na pré-busca fica quieto (a tela busca ao abrir)", async () => {
    h.alunos.mockRejectedValue(new Error("sem rede"));
    await expect(preBuscar(tela("Alunos"), { qc, contaId: "c1", meuIdTreino: null })).resolves.toBeUndefined();
  });
});
