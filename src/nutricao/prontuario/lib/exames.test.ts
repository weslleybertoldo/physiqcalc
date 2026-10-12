// Physiq hml-14d (B21 · D32): o acesso dos exames por página — a RPC exames_do_aluno (20 DATAS por página), os pedidos com `paginar`
// e a leitura de TODOS os resultados (a Avaliação integrada) em leituras de 1000 até a última (antes: 1 leitura, cortada calada em 1000).
// hml-20b (H-42): as leituras vão pela função nutricao (`ler`) — aqui o módulo de verdade do servidor roda sobre o banco falso
// (src/test/nutricaoFalsa.ts): a página, o count, o laço de 1000 e os args da RPC chegam ao banco IGUAIS aos de quando a tela lia direto.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  consultas: [] as Array<{ tabela: string; filtros: unknown[][]; ordem: Array<[string, boolean]>; range: [number, number] | null; contar: boolean }>,
  linhas: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/nutricao/editor/lib/banco", async () => {
  const { ehLer, lerPeloModulo } = await import("@/test/nutricaoFalsa");
  const banco = {
    rpc: (...a: unknown[]) => h.rpc(...a),
    from: (tabela: string) => {
      const c = { tabela, filtros: [] as unknown[][], ordem: [] as Array<[string, boolean]>, range: null as [number, number] | null, contar: false };
      h.consultas.push(c);
      const b: Record<string, unknown> = {
        select: (_s: string, o?: { count?: string }) => ((c.contar = o?.count === "exact"), b),
        eq: (...a: unknown[]) => (c.filtros.push(["eq", ...a]), b),
        is: (...a: unknown[]) => (c.filtros.push(["is", ...a]), b),
        order: (col: string, o?: { ascending?: boolean }) => (c.ordem.push([col, o?.ascending !== false]), b),
        range: (de: number, ate: number) => ((c.range = [de, ate]), b),
        then: (ok: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
          const [de, ate] = c.range ?? [0, 999];
          const fatia = h.linhas.slice(de, Math.min(ate + 1, de + 1000));
          return Promise.resolve({ data: fatia, error: null, count: c.contar ? h.linhas.length : null }).then(ok, falhou);
        },
      };
      return b;
    },
  };
  // hml-19a: as gravações vão pela função nutricao; hml-20b: o `ler` também (o módulo de verdade sobre o banco falso acima)
  const invoke = (f: string, o: { body: Record<string, unknown> }) => (ehLer(o?.body) ? lerPeloModulo(banco)(o.body) : h.invoke(f, o));
  return { supabase: { ...banco, functions: { invoke } } };
});

import { criarResultados, garantirCatalogoExames, listarResultadosDoPaciente, paginaDeExames, paginaPedidosDoPaciente } from "./exames";

beforeEach(() => {
  h.rpc.mockReset();
  h.invoke.mockReset();
  h.consultas = [];
  h.linhas = [];
});

describe("exames por página (hml-14d, D32)", () => {
  it("listarResultadosDoPaciente: TODOS, em leituras de 1000 com ordem estável até a última", async () => {
    h.linhas = Array.from({ length: 2007 }, (_, i) => ({ id: `r${i}` }));
    const todos = await listarResultadosDoPaciente("p1");
    expect(todos).toHaveLength(2007);
    expect(h.consultas.map((c) => c.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(h.consultas[0].ordem).toEqual([["data", false], ["exame", true], ["id", true]]);
    expect(h.consultas[0].filtros).toEqual([["eq", "paciente_id", "p1"], ["is", "deleted_at", null]]);
  });

  it("listarResultadosDoPaciente: com exatamente 1000, lê a próxima (vazia) e para", async () => {
    h.linhas = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` }));
    expect(await listarResultadosDoPaciente("p1")).toHaveLength(1000);
    expect(h.consultas).toHaveLength(2);
  });

  it("paginaDeExames: a página pedida ao banco (20 datas) e a resposta lida; '' = sem filtro", async () => {
    h.rpc.mockResolvedValue({
      data: {
        ok: true, total_datas: 41, total_resultados: 112, fora_referencia: 15, exames: ["TSH", "Ácido úrico", "Glicemia de jejum"],
        datas: [{ data: "2026-07-20", resultados: [{ id: "r1", exame: "TSH", data: "2026-07-20" }] }, { data: "2026-07-15", resultados: [] }],
      },
      error: null,
    });
    const p = await paginaDeExames("p1", "", 2);
    // hml-20b: sem o filtro, o p_exame não vai (o padrão null da RPC = todos), como o p_exame null de antes
    expect(h.rpc).toHaveBeenCalledWith("exames_do_aluno", { p_aluno: "p1", p_offset: 20, p_limite: 20 });
    expect(p).toMatchObject({ totalDatas: 41, totalResultados: 112, foraReferencia: 15 });
    expect(p.exames).toEqual(["Ácido úrico", "Glicemia de jejum", "TSH"]);
    expect(p.datas.map((d) => [d.data, d.resultados.length])).toEqual([["2026-07-20", 1], ["2026-07-15", 0]]);
    await paginaDeExames("p1", " HDL ", 1);
    expect(h.rpc).toHaveBeenLastCalledWith("exames_do_aluno", { p_aluno: "p1", p_exame: "HDL", p_offset: 0, p_limite: 20 });
  });

  it("paginaDeExames: erro do banco lança (a tela mostra o erro — hml-20b: a frase fixa do código, nunca a mensagem crua do banco)", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "statement timeout" } });
    await expect(paginaDeExames("p1", "", 1)).rejects.toMatchObject({ codigo: "erro_interno", message: "Não deu para carregar agora. Tente de novo." });
  });

  it("paginaPedidosDoPaciente: 20 por página com o total (count exato) e a ordem estável", async () => {
    h.linhas = Array.from({ length: 41 }, (_, i) => ({ id: `p${i}` }));
    const p3 = await paginaPedidosDoPaciente("p1", 3);
    expect(p3).toEqual({ itens: [{ id: "p40" }], total: 41 });
    expect(h.consultas[0]).toMatchObject({ tabela: "pedidos_exame", range: [40, 59], contar: true });
    expect(h.consultas[0].ordem).toEqual([["data", false], ["created_at", false], ["id", false]]);
  });
});

describe("hml-19a (H-41 · H-81): exames gravam pela nutricao", () => {
  it("resultados da mesma data: 1 chamada com o lote (o dono não vai no corpo); lote vazio não chama", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, linhas: [{ id: "r1" }, { id: "r2" }] }, error: null });
    const linhas = [
      { exame: "TSH", valor: 2.1, valor_texto: "", unidade: "mUI/L", ref_min: 0.4, ref_max: 4, referencia_texto: "" },
      { exame: "HDL", valor: 50, valor_texto: "", unidade: "mg/dL", ref_min: 40, ref_max: null, referencia_texto: "" },
    ];
    expect(await criarResultados("u2", "p1", "2026-10-11", linhas)).toEqual([{ id: "r1" }, { id: "r2" }]);
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith("nutricao", { body: { acao: "resultados_exame_criar", paciente_id: "p1", data: "2026-10-11", linhas } });
    expect(await criarResultados("u2", "p1", "2026-10-11", [])).toEqual([]);
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.consultas).toHaveLength(0); // nenhuma ida direta às tabelas
  });

  it("o catálogo padrão do 1º acesso: 1 chamada (padroes_garantir · exame) que devolve a lista", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, criados: 12, lista: [{ id: "c1", nome: "TSH" }] }, error: null });
    expect(await garantirCatalogoExames("u2")).toEqual([{ id: "c1", nome: "TSH" }]);
    expect(h.invoke).toHaveBeenCalledWith("nutricao", { body: { acao: "padroes_garantir", secao: "exame" } });
    expect(h.consultas).toHaveLength(0);
  });
});
