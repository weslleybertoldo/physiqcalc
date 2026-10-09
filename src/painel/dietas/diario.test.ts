import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-14b (B21): a aba Diário lê UMA página do período no banco — o aluno e o "só não reagidas" filtram lá, o total vem junto, o dia
// partido pela página pede o total dele ao banco e as opções do filtro de aluno também vêm do banco.
const h = vi.hoisted(() => ({ consultas: [] as { tabela: string; chamadas: unknown[][] }[], respostas: [] as unknown[] }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principal: {
    // consulta falsa: guarda cada chamada (select, filtros, ordem, range…) e responde com a próxima resposta da fila
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

import { alunoDoFiltro, diasQuePodemContinuar, listarAlunosDoDiario, listarDiarioPaginaComDias } from "./diario";

const ZE = "0f8f6c1e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const DE = new Date(2026, 8, 25).toISOString();
const reg = (id: string, quando: Date) => ({ id, data_hora: quando.toISOString(), paciente_id: ZE });
const chamou = (i: number, metodo: string) => h.consultas[i].chamadas.filter((c) => c[0] === metodo).map((c) => c.slice(1));

beforeEach(() => {
  h.consultas.length = 0;
  h.respostas.length = 0;
});

describe("Diário › página do banco (hml-14b)", () => {
  it("o ?aluno= só vai ao banco se for um id (lixo = nenhum aluno, nunca um erro do banco)", () => {
    expect(alunoDoFiltro("")).toBe("");
    expect(alunoDoFiltro(ZE)).toBe(ZE);
    expect(alunoDoFiltro("nao-e-id")).toBe("00000000-0000-0000-0000-000000000000");
  });

  it("dias que podem continuar em outra página: o 1º (página > 1) e o último (há mais depois); os do meio estão inteiros", () => {
    const itens = [reg("a", new Date(2026, 9, 3, 9)), reg("b", new Date(2026, 9, 2, 12)), reg("c", new Date(2026, 9, 1, 20))];
    expect(diasQuePodemContinuar(itens, 1, 3)).toEqual([]);
    expect(diasQuePodemContinuar(itens, 1, 41, 3)).toEqual([new Date(2026, 9, 1)]);
    expect(diasQuePodemContinuar(itens, 2, 41, 3)).toEqual([new Date(2026, 9, 3), new Date(2026, 9, 1)]);
    expect(diasQuePodemContinuar(itens, 14, 41, 3)).toEqual([new Date(2026, 9, 3)]);
    expect(diasQuePodemContinuar([reg("a", new Date(2026, 9, 3, 9))], 2, 41, 1)).toEqual([new Date(2026, 9, 3)]);
    expect(diasQuePodemContinuar([], 2, 41)).toEqual([]);
  });

  it("a página: filtros, ordem estável e range no banco; o último dia (que continua na próxima) pede o total do dia", async () => {
    const vinte = Array.from({ length: 20 }, (_, i) => reg(`d${i}`, new Date(2026, 9, 1, 20, 59 - i)));
    h.respostas.push({ data: vinte, error: null, count: 41 }, { data: null, error: null, count: 25 });
    const p = await listarDiarioPaginaComDias("c1", "u1", { deIso: DE, alunoId: ZE, soNaoReagidas: true }, 1);
    expect(p.total).toBe(41);
    expect(p.itens).toHaveLength(20);
    expect(p.porDia).toEqual({ "01/10/2026": 25 });
    // a página
    expect(h.consultas[0].tabela).toBe("diario_alimentar");
    expect(chamou(0, "select")[0][1]).toEqual({ count: "exact" });
    expect(chamou(0, "gte")).toEqual([["data_hora", DE]]);
    expect(chamou(0, "or")).toEqual([["conta_id.eq.c1,and(conta_id.is.null,nutricionista_id.eq.u1)", { referencedTable: "paciente" }]]);
    expect(chamou(0, "eq")).toEqual([["paciente_id", ZE]]);
    expect(chamou(0, "is")).toEqual([["deleted_at", null], ["reacao_nutri", null]]);
    expect(chamou(0, "order").map((o) => o[0])).toEqual(["data_hora", "created_at", "id"]);
    expect(chamou(0, "range")).toEqual([[0, 19]]);
    // o total do dia 01/10 (HEAD), com os mesmos filtros
    expect(chamou(1, "select")[0][1]).toEqual({ count: "exact", head: true });
    expect(chamou(1, "gte")).toEqual([["data_hora", new Date(2026, 9, 1).toISOString()]]);
    expect(chamou(1, "lt")).toEqual([["data_hora", new Date(2026, 9, 2).toISOString()]]);
    expect(chamou(1, "eq")).toEqual([["paciente_id", ZE]]);
  });

  it("página que cabe inteira: nenhuma contagem a mais; erro do banco lança (a tela mostra o erro)", async () => {
    h.respostas.push({ data: [reg("d1", new Date(2026, 9, 1, 12))], error: null, count: 1 });
    const p = await listarDiarioPaginaComDias("c1", "u1", { deIso: DE, alunoId: "", soNaoReagidas: false }, 1);
    expect(p.porDia).toEqual({});
    expect(h.consultas).toHaveLength(1);
    expect(chamou(0, "eq")).toEqual([]);
    h.respostas.push({ data: null, error: { message: "canceling statement due to statement timeout" }, count: null });
    await expect(listarDiarioPaginaComDias("c1", "u1", { deIso: DE, alunoId: "", soNaoReagidas: false }, 1)).rejects.toMatchObject({ message: /statement timeout/ });
  });

  it("as opções do filtro de aluno: quem tem foto VIVA no período, da conta, por nome — do banco", async () => {
    h.respostas.push({ data: [{ id: ZE, nome: "Zé Último", apelido: null, link_codigo: "abc", foto_url: null, registros: [{ id: "d1" }] }], error: null });
    expect(await listarAlunosDoDiario("c1", "u1", DE)).toEqual([{ id: ZE, nome: "Zé Último", apelido: null, link_codigo: "abc", foto_url: null }]);
    expect(h.consultas[0].tabela).toBe("pacientes");
    expect(String(chamou(0, "select")[0][0])).toContain("registros:diario_alimentar!inner(id)");
    expect(chamou(0, "is")).toEqual([["registros.deleted_at", null]]);
    expect(chamou(0, "gte")).toEqual([["registros.data_hora", DE]]);
    expect(chamou(0, "limit")).toEqual([[1, { referencedTable: "registros" }]]);
    expect(chamou(0, "order").map((o) => o[0])).toEqual(["nome", "id"]);
  });
});
