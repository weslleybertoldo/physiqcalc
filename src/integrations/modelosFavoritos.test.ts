// Physiq hml-21c (H-112 · H-109) — a Ferramentas › Modelos pelas funções nutricao e financeiro (os ★ de quem chama) e o JWKS nas leituras
// das 2. As consultas novas, POR ACRÉSCIMO nos catálogos (as de antes não mudam — a diferencial src/integrations/leituraServidor.test.ts):
//   · nutricao: 9 consultas, 1 por tabela (o motor lê 1 tabela por consulta e não muda) — modelos_favoritos_<tipo>;
//   · financeiro: fin_modelos_recibo_favoritos — a consulta PRÓPRIA (o filtro no fin_modelos_recibo não dava as colunas nem o teto da lib).
// Positivo: cada uma = o favoritosDe da lib do c6e795b (src/ferramentas/modelos/dados.ts:30, as chamadas :73-111 — FIXO aqui, nunca o próprio
// catálogo): o select da tela (o medidas_caseiras(*) das receitas escrito coluna a coluna), favorito/favorita = true, o dono = quem chama,
// fora da lixeira, até 500 — o MESMO encadeamento, na MESMA ordem, pelo módulo PUBLICADO de cada função. Negativo: o dono do corpo cai;
// nenhum param (nada do corpo vira filtro); o fin_modelos_recibo do Financeiro segue byte a byte. O "tirar a ★" pelas ações que já existem.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { FonteTabela } from "../../supabase-principal/functions/_shared/leitura-lote";
import { CONSULTAS_NUTRICAO, MODELOS_FAVORITOS_MAX } from "../../supabase-principal/functions/_shared/nutricao-leituras";
import { CONSULTAS_FINANCEIRO, MODELOS_RECIBO_FAVORITOS_MAX } from "../../supabase-principal/functions/_shared/financeiro-leituras";
import { ACOES, ACOES_DIETA } from "../../supabase-principal/functions/_shared/nutricao-regras";
import { ACOES_FINANCEIRO } from "../../supabase-principal/functions/_shared/financeiro-gravar-regras";
import { atenderLeitura as lerNutricaoNoServidor } from "../../supabase-principal/functions/nutricao/leituras";
import { atenderLeitura as lerFinanceiroNoServidor } from "../../supabase-principal/functions/financeiro/leituras";
import { CONSULTAS_FINANCEIRO as FINANCEIRO_C6E795B } from "../test/oraculoH112/financeiroCatalogo.c6e795b";

const RAIZ = resolve(__dirname, "../..");
const EU = "33333333-3333-4333-8333-333333333333";
const OUTRA = "99999999-9999-4999-8999-999999999999";
const semEspacos = (s: string) => s.replace(/\s+/g, "");

/** O favoritosDe da lib do c6e795b (src/ferramentas/modelos/dados.ts): a tabela, o select da tela e a coluna do ★ — FIXO. */
const ALIMENTO_DA_LIB = "alimento:alimentos(id, nome, fonte, grupo, energia_kcal, proteina_g, carboidrato_g, lipidio_g, fibra_g, sodio_mg, medidas_caseiras(*))";
const DA_LIB: Record<string, { tabela: string; select: string; coluna: string }> = {
  modelos_favoritos_anamnese: { tabela: "modelos_anamnese", select: "id, updated_at, titulo, perguntas", coluna: "favorito" },
  modelos_favoritos_orientacao: { tabela: "modelos_orientacao", select: "id, updated_at, titulo, conteudo", coluna: "favorito" },
  modelos_favoritos_documento: { tabela: "modelos_documento", select: "id, updated_at, titulo, tipo", coluna: "favorito" },
  modelos_favoritos_meta: { tabela: "modelos_meta", select: "id, updated_at, titulo, dias_semana", coluna: "favorito" },
  modelos_favoritos_manipulado: { tabela: "modelos_formula", select: "id, updated_at, titulo, ativos", coluna: "favorito" },
  modelos_favoritos_exame: { tabela: "exames_catalogo", select: "id, updated_at, nome, unidade, ref_min, ref_max, referencia_texto", coluna: "favorito" },
  modelos_favoritos_questionario: { tabela: "questionarios", select: "id, updated_at, titulo, perguntas", coluna: "favorito" },
  modelos_favoritos_produto: { tabela: "produtos", select: "id, updated_at, nome, marca, categoria", coluna: "favorito" },
  modelos_favoritos_receita: {
    tabela: "receitas",
    select: `id, nome, updated_at, porcoes, rendimento_g, ingredientes:ingredientes_receita(quantidade_g, medida_caseira_id, quantidade_medida, ${ALIMENTO_DA_LIB})`,
    coluna: "favorita",
  },
};
const RECIBO_DA_LIB = { tabela: "modelos_recibo", select: "id, updated_at, titulo, conteudo", coluna: "favorito" };
/** As colunas de medidas_caseiras (a linha inteira do tipo gerado — o (*) de hoje escrito coluna a coluna). */
const MEDIDAS = "id, alimento_id, descricao, gramas, ordem, created_at";

/** O cliente falso (grava o encadeamento de cada select; o RLS é o "banco" do teste). */
function banco(linhas: unknown[] = [{ id: "m1" }]) {
  const pedidos: Array<{ tabela: string; colunas: string; passos: unknown[][] }> = [];
  const cliente = {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: (tabela: string) => ({
      select: (colunas: string) => {
        const p = { tabela, colunas, passos: [] as unknown[][] };
        pedidos.push(p);
        const b: Record<string, unknown> = {};
        for (const op of ["in", "eq", "is", "gte", "lte", "lt", "ilike", "or", "order", "limit", "range"]) b[op] = (...a: unknown[]) => (p.passos.push([op, ...a]), b);
        b.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve({ data: linhas, error: null }).then(ok, falhou);
        return b;
      },
    }),
    storage: { from: () => ({}) },
  };
  return { cliente, pedidos };
}
const LOG = { info: () => undefined, aviso: () => undefined, erro: () => undefined, excecao: () => undefined };
async function ler(funcao: "nutricao" | "financeiro", itens: unknown[]) {
  const b = banco();
  const c = { schema: "staging", corpo: { acao: "ler", itens }, userId: EU, comoPessoa: b.cliente, log: LOG } as never;
  const r = funcao === "nutricao" ? await lerNutricaoNoServidor(c) : await lerFinanceiroNoServidor(c);
  return { r, pedidos: b.pedidos };
}

describe("hml-21c — os ★ da Ferramentas › Modelos pela nutricao (9 consultas, 1 por tabela) e pela financeiro (a consulta própria)", () => {
  it("as consultas novas: por ACRÉSCIMO, no fim de cada catálogo; os nomes modelos_favoritos_<tipo> (PADRÃO) e fin_modelos_recibo_favoritos", () => {
    const nutricao = Object.keys(CONSULTAS_NUTRICAO);
    expect(nutricao.slice(-9)).toEqual(Object.keys(DA_LIB));
    expect(Object.keys(CONSULTAS_FINANCEIRO).at(-1)).toBe("fin_modelos_recibo_favoritos");
    expect([MODELOS_FAVORITOS_MAX, MODELOS_RECIBO_FAVORITOS_MAX]).toEqual([500, 500]);
  });

  it("cada uma = o favoritosDe da lib: o select da tela (o (*) das medidas escrito coluna a coluna), o ★ fixo, o dono, as vivas, o teto 500; nenhum param", () => {
    const todas: Array<[string, { params: object; dono?: string; fonte: FonteTabela }, { tabela: string; select: string; coluna: string }]> = [
      ...Object.entries(DA_LIB).map(([q, lib]) => [q, (CONSULTAS_NUTRICAO as unknown as Record<string, { params: object; dono?: string; fonte: FonteTabela }>)[q], lib] as const),
      ["fin_modelos_recibo_favoritos", CONSULTAS_FINANCEIRO.fin_modelos_recibo_favoritos as unknown as { params: object; dono?: string; fonte: FonteTabela }, RECIBO_DA_LIB],
    ] as never;
    for (const [q, c, lib] of todas) {
      expect(c.params, q).toEqual({});
      expect(c.dono, q).toBe("nutricionista_id");
      expect([c.fonte.tabela, c.fonte.teto, c.fonte.vivas, c.fonte.fixos], q).toEqual([lib.tabela, 500, true, [{ coluna: lib.coluna, valor: true }]]);
      expect([c.fonte.filtros, c.fonte.ordem, c.fonte.recorte, c.fonte.pagina, c.fonte.laco], q).toEqual([undefined, undefined, undefined, undefined, undefined]);
    }
  });

  it("pelo módulo PUBLICADO de cada função: o MESMO encadeamento da lib (select → eq ★ → eq dono = quem chama → is deleted_at → limit 500); o dono do corpo cai", async () => {
    const corpoComDono = { nutricionista_id: OUTRA, user_id: OUTRA, favorito: false, conta: OUTRA };
    const n = await ler("nutricao", Object.keys(DA_LIB).map((q) => ({ q, ...corpoComDono })));
    expect((n.r as { ok: boolean }).ok).toBe(true);
    expect(n.pedidos).toHaveLength(9);
    for (const [i, [q, lib]] of Object.entries(DA_LIB).entries()) {
      const p = n.pedidos[i];
      const esperado = q === "modelos_favoritos_receita" ? lib.select.replace("medidas_caseiras(*)", `medidas_caseiras(${MEDIDAS})`) : lib.select;
      expect(p.tabela, q).toBe(lib.tabela);
      expect(semEspacos(p.colunas), q).toBe(semEspacos(esperado));
      expect(p.colunas, q).not.toContain("*");
      expect(p.passos, q).toEqual([["eq", lib.coluna, true], ["eq", "nutricionista_id", EU], ["is", "deleted_at", null], ["limit", 500]]);
    }
    const f = await ler("financeiro", [{ q: "fin_modelos_recibo_favoritos", ...corpoComDono }]);
    expect(f.pedidos).toEqual([
      { tabela: "modelos_recibo", colunas: "id, updated_at, titulo, conteudo", passos: [["eq", "favorito", true], ["eq", "nutricionista_id", EU], ["is", "deleted_at", null], ["limit", 500]] },
    ]);
    expect(JSON.stringify([n.pedidos, f.pedidos])).not.toContain(OUTRA);
  });

  it("os ★ dos Modelos num `ler` só de cada função (os 9 + os planos ★ na nutricao ∥ os de recibo na financeiro): o lote do motor aceita", async () => {
    const itens = [...Object.keys(DA_LIB).map((q) => ({ q })), { q: "planos_favoritos", conta: OUTRA }];
    const n = await ler("nutricao", itens);
    expect((n.r as { ok: boolean; itens: Array<{ ok: boolean }> }).itens.map((i) => i.ok)).toEqual(itens.map(() => true));
  });

  it("o fin_modelos_recibo do Financeiro segue byte a byte (o do c6e795b): a consulta própria não mexeu nela", () => {
    expect(CONSULTAS_FINANCEIRO.fin_modelos_recibo).toEqual(FINANCEIRO_C6E795B.fin_modelos_recibo);
  });

  it("o \"tirar a ★\" pelas ações que JÁ existem (nenhuma ação nova nas 2): cada *_editar aceita o favorito (a receita, o favorita) na tabela do tipo", () => {
    const editar: Array<[Record<string, { tabela: string; operacao: string; campos: Record<string, unknown> }>, string, string, string]> = [
      [ACOES as never, "modelo_anamnese_editar", "modelos_anamnese", "favorito"],
      [ACOES as never, "questionario_editar", "questionarios", "favorito"],
      [ACOES as never, "exame_catalogo_editar", "exames_catalogo", "favorito"],
      [ACOES as never, "modelo_documento_editar", "modelos_documento", "favorito"],
      [ACOES_DIETA as never, "plano_editar", "planos_alimentares", "favorito"],
      [ACOES_DIETA as never, "produto_editar", "produtos", "favorito"],
      [ACOES_DIETA as never, "modelo_formula_editar", "modelos_formula", "favorito"],
      [ACOES_DIETA as never, "modelo_meta_editar", "modelos_meta", "favorito"],
      [ACOES_DIETA as never, "modelo_orientacao_editar", "modelos_orientacao", "favorito"],
      [ACOES_DIETA as never, "receita_editar", "receitas", "favorita"],
      [ACOES_FINANCEIRO as never, "modelo_recibo_editar", "modelos_recibo", "favorito"],
    ];
    for (const [mapa, acao, tabela, coluna] of editar) {
      expect([mapa[acao]?.tabela, mapa[acao]?.operacao], acao).toEqual([tabela, "editar"]);
      expect(Object.keys(mapa[acao].campos), acao).toContain(coluna);
    }
  });
});

describe("hml-21c (H-109) — o JWKS nas leituras da nutricao e da financeiro: só no `ler`; as gravações seguem no getUser", () => {
  const fonte = (rel: string) => readFileSync(resolve(RAIZ, "supabase-principal/functions", rel), "utf-8");
  it("as 2 funções ligam a opção da porta (como a conta); a porta só a usa no acao \"ler\" (o padrão dela não muda)", () => {
    expect(fonte("nutricao/index.ts")).toContain('servirComoPessoa("nutricao", { freio: 240, jwtLeitura: "jwks" }, async (c) => {');
    expect(fonte("financeiro/index.ts")).toContain('servirComoPessoa("financeiro", { freio: 240, jwtLeitura: "jwks" }, async (c) => {');
    expect(fonte("_shared/porta-pessoa.ts")).toContain('if (opcoes.jwtLeitura === "jwks" && corpo.acao === "ler") {');
    // as outras funções do principal seguem sem a opção (o padrão da porta: getUser) — a W-A inclusive
    for (const f of ["alunos/index.ts", "acessos/index.ts", "aluno-dia/index.ts", "convites/index.ts"]) expect(fonte(f), f).not.toContain("jwtLeitura");
  });
});
