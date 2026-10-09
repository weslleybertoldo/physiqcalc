import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-14b (B21): a lista de receitas do painel vem do banco UMA página por vez — só as SUAS (também para o master), com a busca sem
// acento, o grupo e as favoritas no banco (receitas_da_nutricionista); as receitas da página (com os ingredientes) vêm pelos ids.
const h = vi.hoisted(() => ({ rpc: vi.fn(), consultas: [] as { tabela: string; chamadas: unknown[][] }[], respostas: [] as unknown[] }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principal: {
    rpc: h.rpc,
    from: (tabela: string) => {
      const registro = { tabela, chamadas: [] as unknown[][] };
      h.consultas.push(registro);
      const resposta = h.respostas.shift();
      const cadeia: unknown = new Proxy({}, {
        get: (_alvo, nome) =>
          nome === "then"
            ? (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resposta).then(ok, falha)
            : (...args: unknown[]) => {
                registro.chamadas.push([String(nome), ...args]);
                return cadeia;
              },
      });
      return cadeia;
    },
  },
}));

import { lerPaginaReceitas, listarGrupos, listarReceitasPagina, nomesParaCopia } from "./receitas";

const linha = (id: string, nome: string) => ({ id, nome, favorita: false, porcoes: 1, rendimento_g: null, grupo_id: null, ingredientes: [] });
const chamou = (i: number, metodo: string) => h.consultas[i].chamadas.filter((c) => c[0] === metodo).map((c) => c.slice(1));

beforeEach(() => {
  h.rpc.mockReset();
  h.consultas.length = 0;
  h.respostas.length = 0;
});

describe("Receitas › página do banco (hml-14b)", () => {
  it("lerPaginaReceitas: ids, números e o número de cada grupo; formato inesperado → null", () => {
    expect(lerPaginaReceitas({ ok: true, ids: ["r1", 2], total: 41, total_geral: 50, favoritas: 3, por_grupo: { g1: 7, g2: "x" } }))
      .toEqual({ ids: ["r1"], total: 41, totalGeral: 50, favoritas: 3, porGrupo: { g1: 7 } });
    expect(lerPaginaReceitas({ ok: true, ids: [], total: 0, total_geral: 0, favoritas: 0 })?.porGrupo).toEqual({});
    expect(lerPaginaReceitas(null)).toBeNull();
    expect(lerPaginaReceitas({ ok: true, ids: [], total: 1 })).toBeNull();
  });

  it("pede a página 2 com os filtros normalizados (palavras sem acento) e devolve as receitas NA ORDEM do banco", async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, ids: ["r2", "r1", "r3"], total: 41, total_geral: 41, favoritas: 1, por_grupo: { g1: 2 } }, error: null });
    // r3 saiu entre as 2 leituras (excluída agora): fica de fora
    h.respostas.push({ data: [linha("r1", "Bolo"), linha("r2", "Atum")], error: null });
    const p = await listarReceitasPagina({ q: "  Pão (de) QUEIJO ", grupo: "sem", favoritas: true }, 2);
    expect(h.rpc).toHaveBeenCalledWith("receitas_da_nutricionista", {
      p_filtros: { q: "pao de queijo", grupo: "sem", favoritas: "true" }, p_offset: 20, p_limite: 20,
    });
    expect(p.itens.map((r) => r.id)).toEqual(["r2", "r1"]);
    expect(p).toMatchObject({ total: 41, totalGeral: 41, favoritas: 1, porGrupo: { g1: 2 } });
    expect(h.consultas[0].tabela).toBe("receitas");
    expect(chamou(0, "in")).toEqual([["id", ["r2", "r1", "r3"]]]);
    expect(chamou(0, "is")).toEqual([["deleted_at", null]]);
  });

  it("página vazia: não lê as receitas; erro do banco lança (a tela mostra o erro)", async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, ids: [], total: 0, total_geral: 3, favoritas: 0, por_grupo: {} }, error: null });
    expect(await listarReceitasPagina({ q: "nada", grupo: "", favoritas: false }, 1)).toEqual({ itens: [], total: 0, totalGeral: 3, favoritas: 0, porGrupo: {} });
    expect(h.rpc).toHaveBeenLastCalledWith("receitas_da_nutricionista", { p_filtros: { q: "nada" }, p_offset: 0, p_limite: 20 });
    expect(h.consultas).toHaveLength(0);
    h.rpc.mockResolvedValue({ data: null, error: { message: "canceling statement due to statement timeout" } });
    await expect(listarReceitasPagina({ q: "", grupo: "", favoritas: false }, 1)).rejects.toThrow(/statement timeout/);
  });

  it("os grupos do painel: só os de quem chama, filtrados no banco", async () => {
    h.respostas.push({ data: [], error: null });
    await listarGrupos("u1");
    expect(chamou(0, "eq")).toEqual([["nutricionista_id", "u1"]]);
  });

  it("Duplicar: os nomes parecidos vêm do banco (sem o \"(cópia N)\" e com os curingas do LIKE como texto)", async () => {
    h.respostas.push({ data: [{ nome: "Bolo 50% (cópia)" }], error: null });
    expect(await nomesParaCopia("u1", "Bolo 50% (cópia 2)")).toEqual(["Bolo 50% (cópia)"]);
    expect(chamou(0, "ilike")).toEqual([["nome", "Bolo 50\\%%"]]);
    expect(chamou(0, "eq")).toEqual([["nutricionista_id", "u1"]]);
  });
});
