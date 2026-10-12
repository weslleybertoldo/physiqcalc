// Physiq hml-20d (H-42 · jeito 2, etapa 2, parte 4) — o contrato entre as libs de LEITURA do Financeiro (src/painel/financeiro/dados.ts,
// src/financeiro/{lancamentos,recibos,api}.ts) e o servidor: cada função de leitura (as mesmas assinaturas de antes) chama
// lerFinanceiro("<q>", {…}) com os params certos — o corpo PASSA no leitor REAL do servidor (lerPedidoDeLeitura com o catálogo de verdade,
// nenhum param cai nem fica fora da forma) e roda no MÓDULO de verdade (functions/financeiro/leituras.ts) sobre um PostgREST falso — e
// devolve o MESMO tipo de antes. As leituras pedidas juntas saem numa chamada só (a tela numa ida). Os negativos: as frases de hoje dos 4
// códigos das RPCs, o "Não deu para carregar o financeiro." no resto, o nome null no erro, o ErroFinanceiro("erro_interno") dos totais do
// aluno, a frase das cobranças demais, e nenhuma leitura direta (tabela ou RPC) no navegador.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  chamadas: [] as Array<{ funcao: string; corpo: Record<string, unknown> }>,
  /** as linhas de cada tabela do banco falso (o RLS de quem chama já aplicado) */
  tabelas: {} as Record<string, unknown[]>,
  /** o count de cada tabela (as páginas) */
  totais: {} as Record<string, number>,
  /** o valor de cada RPC */
  rpcs: {} as Record<string, unknown>,
  /** o erro de cada tabela/RPC (o PostgREST respondeu erro) */
  erros: {} as Record<string, { code: string; message: string }>,
  /** a função inteira fora (a porta respondeu erro) */
  fora: null as null | { status: number; erro: string },
  consultas: [] as Array<{ tabela: string; colunas: string; passos: unknown[][] }>,
  args: [] as Array<{ nome: string; args: Record<string, unknown> }>,
  /** o laço das cobranças: quantas leituras cheias antes da última */
  cheias: 0,
}));

vi.mock("@/integrations/principal/client", async () => {
  const { lerFinanceiroPeloModulo } = await import("@/test/financeiroFalso");
  // o PostgREST falso: grava a cadeia de cada select e devolve as linhas da tabela (o count quando pedido)
  const banco = {
    from: (tabela: string) => ({
      select: (colunas: string, opcoes?: { count?: string }) => {
        const c = { tabela, colunas, passos: [] as unknown[][] };
        h.consultas.push(c);
        const b: Record<string, unknown> = {};
        for (const op of ["in", "eq", "is", "gte", "lte", "lt", "ilike", "or", "order", "limit", "range"]) b[op] = (...a: unknown[]) => (c.passos.push([op, ...a]), b);
        b.then = (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) => {
          const erro = h.erros[tabela];
          if (erro) return Promise.resolve({ data: null, error: erro, count: null }).then(ok, falha);
          if (tabela === "cobrancas" && h.cheias > 0) {
            h.cheias -= 1;
            return Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => ({ id: `k${i}` })), error: null }).then(ok, falha);
          }
          return Promise.resolve({ data: h.tabelas[tabela] ?? [], error: null, count: opcoes?.count ? (h.totais[tabela] ?? 0) : null }).then(ok, falha);
        };
        return b;
      },
    }),
    rpc: (nome: string, args: Record<string, unknown>) => {
      h.args.push({ nome, args });
      return h.erros[nome] ? { data: null, error: h.erros[nome] } : { data: h.rpcs[nome] ?? null, error: null };
    },
  };
  const ler = lerFinanceiroPeloModulo(banco, { userId: "33333333-3333-4333-8333-333333333333" });
  return {
    PRINCIPAL_SCHEMA: "staging",
    PRINCIPAL_URL: "https://api-principal.exemplo",
    principalConfigurado: true,
    principal: {
      functions: {
        invoke: async (funcao: string, o: { body: Record<string, unknown> }) => {
          h.chamadas.push({ funcao, corpo: o.body });
          if (h.fora) {
            return { data: null, error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: h.fora.erro }), { status: h.fora.status }) } };
          }
          return ler(o.body);
        },
      },
      from: (t: string) => {
        throw new Error(`leitura direta na tabela ${t}`);
      },
      rpc: (f: string) => {
        throw new Error(`RPC direta ${f}`);
      },
      storage: {
        from: () => {
          throw new Error("Storage direto");
        },
      },
    },
  };
});

import { lerPedidoDeLeitura } from "../../supabase-principal/functions/_shared/leitura-lote";
import { CONSULTAS_FINANCEIRO } from "../../supabase-principal/functions/_shared/financeiro-leituras";
import * as dados from "@/painel/financeiro/dados";
import { ErroFinanceiro, buscarResumo, buscarTotaisDoAluno, lerResumoGuardado } from "./api";
import { ErroLeitura } from "./ler";
import * as lancamentos from "./lancamentos";
import * as recibos from "./recibos";

const EU = "33333333-3333-4333-8333-333333333333";
const CONTA = "c0000000-0000-4000-8000-00000000000a";
const ALUNO = "11111111-1111-4111-8111-111111111111";

/** Os itens de leitura de todas as chamadas (a q e os params, como foram), e cada corpo passando no leitor REAL do servidor. */
function itensLidos(): Array<Record<string, unknown>> {
  const saida: Array<Record<string, unknown>> = [];
  for (const c of h.chamadas) {
    expect(c.funcao).toBe("financeiro");
    expect(c.corpo.acao).toBe("ler");
    const lido = lerPedidoDeLeitura(c.corpo, CONSULTAS_FINANCEIRO);
    expect(lido.ok, JSON.stringify(c.corpo)).toBe(true);
    const itens = c.corpo.itens as Array<Record<string, unknown>>;
    if (lido.ok === true) {
      lido.itens.forEach((it, i) => {
        // nenhum param cai nem sai da forma: o servidor lê EXATAMENTE o que a lib mandou
        expect(it.ok, JSON.stringify(itens[i])).toBe(true);
        const { q, ...params } = itens[i];
        if (it.ok === true) expect(it.params, String(q)).toEqual(params);
      });
    }
    saida.push(...itens);
  }
  return saida;
}

beforeEach(() => {
  h.chamadas.length = 0;
  h.consultas.length = 0;
  h.args.length = 0;
  h.tabelas = {};
  h.totais = {};
  h.rpcs = {};
  h.erros = {};
  h.fora = null;
  h.cheias = 0;
  try {
    localStorage.clear();
  } catch {
    /* sem armazenamento */
  }
});
afterEach(() => vi.unstubAllGlobals());

describe("hml-20d — Painel › Financeiro: as leituras comuns e as das abas pela função (a tela numa ida, o mesmo tipo)", () => {
  it("as 4 comuns (nome, categorias, modelos, último nº) pedidas juntas = 1 chamada com 4 itens; os tipos de hoje (as listas na ordem da tela)", async () => {
    h.tabelas = {
      profiles: [{ nome: "Personal Teste" }],
      categorias_financeiras: [{ id: "a", nome: "Outros", nutricionista_id: EU }, { id: "b", nome: "Consulta", nutricionista_id: EU }],
      modelos_recibo: [{ id: "m1", nutricionista_id: EU, titulo: "B", conteudo: "x", favorito: false }, { id: "m2", nutricionista_id: EU, titulo: "A", conteudo: "y", favorito: true }],
      recibos: [{ numero: 41 }],
    };
    const [nome, categorias, modelos, ultimo] = await Promise.all([
      dados.nomeDoProfissional(EU), dados.listarCategorias(EU), dados.listarModelosRecibo(EU), dados.ultimoNumeroRecibo(EU),
    ]);
    expect(h.chamadas).toHaveLength(1);
    expect(itensLidos()).toEqual([{ q: "fin_profissional" }, { q: "fin_categorias" }, { q: "fin_modelos_recibo" }, { q: "fin_ultimo_recibo" }]);
    expect(nome).toBe("Personal Teste");
    // a ordem da tela: "Outros" no fim (ordenarCategorias); o favorito primeiro (ordenarModelosRecibo)
    expect(categorias.map((c) => c.nome)).toEqual(["Consulta", "Outros"]);
    expect(modelos.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(ultimo).toBe(41);
    // o servidor leu como a pessoa: o dono = quem chama (nunca um id do corpo); o último nº sem o filtro das vivas
    expect(h.consultas.find((c) => c.tabela === "recibos")?.passos).toEqual([["eq", "nutricionista_id", EU], ["order", "numero", { ascending: false }], ["limit", 1]]);
  });

  it("sem recibo → 0; sem nome → null; o nome que falha → null (como hoje); a lista de categorias que falha → o erro com a frase fixa do código", async () => {
    expect(await dados.ultimoNumeroRecibo(EU)).toBe(0);
    expect(await dados.nomeDoProfissional(EU)).toBeNull();
    h.erros.profiles = { code: "42501", message: "permission denied for table profiles" };
    expect(await dados.nomeDoProfissional(EU)).toBeNull();
    h.erros.categorias_financeiras = { code: "42501", message: "permission denied for table categorias_financeiras" };
    const e = await dados.listarCategorias(EU).catch((x) => x);
    expect(e).toBeInstanceOf(ErroLeitura);
    expect(e).toMatchObject({ codigo: "sem_acesso", message: "Você não tem permissão para ver isso." });
    expect(String(e.message)).not.toContain("permission denied");
  });

  it("o Resumo: os totais com o recebido por dia + as cobranças do mês + as 6 recentes = 1 chamada; os args de hoje; o mesmo tipo", async () => {
    h.rpcs = {
      financeiro_resumo_periodo: {
        ok: true, entradas: "150.50", saidas: 20, saldo: "130.50", n_entradas: 2, n_saidas: 1, n_estornadas: 0, total: 3, total_periodo: 3,
        categorias: [{ id: "cat1", nome: "Consulta" }], entradas_por_dia: [{ dia: "2026-10-01", categoria: "Consulta", valor: 150.5 }], cobrancas_por_dia: null,
      },
      financeiro_lancamentos: { ok: true, total: 3, itens: [{ id: "t1" }] },
    };
    h.tabelas.cobrancas = [{ id: "k1", status: "aberta", paciente: { nome: "Aluna" } }];
    const [resumo, cobrancas, recentes] = await Promise.all([
      dados.resumoDoPeriodo(CONTA, "2026-09-13", "2026-10-12"), dados.listarCobrancasDoResumo(CONTA, EU, "2026-10-01", "2026-10-31"),
      dados.listarLancamentos(CONTA, "2026-09-13", "2026-10-12", dados.SEM_FILTROS, 1, 6),
    ]);
    expect(h.chamadas).toHaveLength(1);
    expect(itensLidos()).toEqual([
      { q: "fin_resumo_periodo", conta: CONTA, de: "2026-09-13", ate: "2026-10-12", filtros: { resumo: true } },
      { q: "fin_cobrancas_resumo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31" },
      { q: "fin_lancamentos", conta: CONTA, de: "2026-09-13", ate: "2026-10-12", filtros: {}, offset: 0, limite: 6 },
    ]);
    expect(resumo).toEqual({
      entradas: 150.5, saidas: 20, saldo: 130.5, nEntradas: 2, nSaidas: 1, nEstornadas: 0, total: 3, totalPeriodo: 3, categorias: [{ id: "cat1", nome: "Consulta" }],
      entradasPorDia: [{ dia: "2026-10-01", categoria: "Consulta", valor: 150.5 }], cobrancasPorDia: [],
    });
    expect(cobrancas).toEqual([{ id: "k1", status: "aberta", paciente: { nome: "Aluna" } }]);
    expect(recentes).toEqual({ itens: [{ id: "t1" }], total: 3 });
    // as RPCs no servidor com os args de hoje (os p_* montados lá)
    expect(h.args).toEqual([
      { nome: "financeiro_resumo_periodo", args: { p_conta: CONTA, p_de: "2026-09-13", p_ate: "2026-10-12", p_filtros: { resumo: true } } },
      { nome: "financeiro_lancamentos", args: { p_conta: CONTA, p_de: "2026-09-13", p_ate: "2026-10-12", p_filtros: {}, p_offset: 0, p_limite: 6 } },
    ]);
    // as cobranças: o recorte da conta ativa com quem chama + o "em aberto OU no mês" (o .or() de hoje) — no servidor
    expect(h.consultas.find((c) => c.tabela === "cobrancas")?.passos).toEqual([
      ["is", "deleted_at", null], ["or", `conta_id.eq.${CONTA},and(conta_id.is.null,nutricionista_id.eq.${EU})`],
      ["or", "status.in.(aberta,aguardando_confirmacao),and(vencimento.gte.2026-10-01,vencimento.lte.2026-10-31)"], ["order", "id", { ascending: true }], ["range", 0, 999],
    ]);
  });

  it("Lançamentos: os filtros da tela (só os preenchidos, o texto aparado) na lista e nos totais; a página 2 → offset 20; o mesmo tipo", async () => {
    h.rpcs = {
      financeiro_lancamentos: { ok: true, total: 21, itens: null },
      financeiro_resumo_periodo: { ok: true, entradas: 1, saidas: 0, saldo: 1, n_entradas: 1, n_saidas: 0, n_estornadas: 0, total: 1, total_periodo: 4, categorias: null },
    };
    const filtros = { tipo: "entrada", categoria: "", metodo: "pix", q: "  maria  " };
    const [pagina, totais] = await Promise.all([
      dados.listarLancamentos(CONTA, "2026-10-01", "2026-10-31", filtros, 2), dados.totaisDoPeriodo(CONTA, "2026-10-01", "2026-10-31", filtros),
    ]);
    expect(h.chamadas).toHaveLength(1);
    expect(itensLidos()).toEqual([
      { q: "fin_lancamentos", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", filtros: { tipo: "entrada", metodo: "pix", q: "maria" }, offset: 20, limite: 20 },
      { q: "fin_resumo_periodo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", filtros: { tipo: "entrada", metodo: "pix", q: "maria" } },
    ]);
    expect(pagina).toEqual({ itens: [], total: 21 });
    expect(totais).toEqual({ entradas: 1, saidas: 0, saldo: 1, nEntradas: 1, nSaidas: 0, nEstornadas: 0, total: 1, totalPeriodo: 4, categorias: [] });
  });

  it("a busca longa corta no FRONT (o teto do servidor, 500) — nunca vira 'fora do formato'", async () => {
    h.rpcs = { financeiro_lancamentos: { ok: true, total: 0, itens: [] }, financeiro_recibos: { ok: true, total: 0, soma: 0, itens: [] } };
    const longa = "palavra ".repeat(120);
    await dados.listarLancamentos(CONTA, "2026-10-01", "2026-10-31", { ...dados.SEM_FILTROS, q: longa }, 1);
    await dados.listarRecibos(CONTA, longa, 1);
    const [a, b] = itensLidos();
    expect(String((a.filtros as { q: string }).q)).toHaveLength(500);
    expect(String((b.filtros as { q: string }).q)).toHaveLength(500);
  });

  it("Recibos: a busca aparada e a página (3 → offset 40); o 'Recibos no mês' do Dashboard (o período, limite 0: só o total); o mesmo tipo", async () => {
    h.rpcs = { financeiro_recibos: { ok: true, total: 45, soma: "1234.5", itens: [{ id: "r1" }] } };
    const [pagina, noMes] = await Promise.all([dados.listarRecibos(CONTA, "  0007 ", 3), dados.contarRecibos(CONTA, "2026-10-01", "2026-10-31")]);
    expect(h.chamadas).toHaveLength(1);
    expect(itensLidos()).toEqual([
      { q: "fin_recibos", conta: CONTA, filtros: { q: "0007" }, offset: 40, limite: 20 },
      { q: "fin_recibos", conta: CONTA, filtros: { de: "2026-10-01", ate: "2026-10-31" }, offset: 0, limite: 0 },
    ]);
    expect(pagina).toEqual({ itens: [{ id: "r1" }], total: 45, soma: 1234.5 });
    expect(noMes).toBe(45);
  });

  it("os erros das RPCs com as frases de HOJE: os 4 códigos de propósito → ERROS_RPC; outro código, a função fora ou sem internet → 'Não deu para carregar o financeiro.'", async () => {
    const casos: Array<[string, string]> = [
      ["sem_login", "Sua sessão expirou. Entre de novo."], ["sem_acesso", "Você não faz mais parte desta conta."],
      ["conta_inexistente", "Conta não encontrada."], ["periodo_invalido", "Período inválido."], ["outro", "Não deu para carregar o financeiro."],
    ];
    for (const [codigo, frase] of casos) {
      h.rpcs = { financeiro_recibos: { ok: false, erro: codigo } };
      await expect(dados.listarRecibos(CONTA, "", 1), codigo).rejects.toThrow(new RegExp(`^${frase.replace(/[.]/g, "\\.")}$`));
    }
    h.rpcs = {};
    await expect(dados.resumoDoPeriodo(CONTA, "2026-10-01", "2026-10-31")).rejects.toThrow(/^Não deu para carregar o financeiro\.$/);
    h.erros.financeiro_lancamentos = { code: "XX000", message: "erro cru do banco" };
    const e = await dados.listarLancamentos(CONTA, "2026-10-01", "2026-10-31", dados.SEM_FILTROS, 1).catch((x) => x);
    expect(e).toMatchObject({ codigo: "erro_interno", message: "Não deu para carregar o financeiro." });
    h.fora = { status: 500, erro: "erro_interno" };
    await expect(dados.totaisDoPeriodo(CONTA, "2026-10-01", "2026-10-31", dados.SEM_FILTROS)).rejects.toThrow(/^Não deu para carregar o financeiro\.$/);
    h.fora = null;
    vi.stubGlobal("navigator", { onLine: false });
    const antes = h.chamadas.length;
    await expect(dados.contarRecibos(CONTA, "2026-10-01", "2026-10-31")).rejects.toThrow(/^Não deu para carregar o financeiro\.$/);
    expect(h.chamadas.length).toBe(antes);
  });

  it("as cobranças: TODAS em leituras de 1000 no servidor (1 chamada); passou de 20 leituras → a frase de hoje", async () => {
    h.cheias = 2;
    h.tabelas.cobrancas = [{ id: "ultima" }];
    expect(await dados.listarCobrancasDoResumo(CONTA, EU, "2026-10-01", "2026-10-31")).toHaveLength(2001);
    expect(h.chamadas).toHaveLength(1);
    h.cheias = 20;
    await expect(dados.listarCobrancasDoResumo(CONTA, EU, "2026-10-01", "2026-10-31")).rejects.toMatchObject({
      codigo: "muitas_linhas", message: "Cobranças em aberto demais para o resumo.",
    });
  });
});

describe("hml-20d — o Financeiro do aluno (Painel › Aluno › Financeiro) pela função (a aba numa ida, o mesmo tipo)", () => {
  it("as páginas dos lançamentos e dos recibos, os totais e as categorias pedidos juntos = 1 chamada; os tipos de hoje", async () => {
    h.tabelas = {
      transacoes: [{ id: "t1", categoria: { nome: "Consulta" } }], recibos: [{ id: "r1", numero: 7 }],
      categorias_financeiras: [{ id: "c1", nome: "Consulta", nutricionista_id: EU }],
    };
    h.totais = { transacoes: 21, recibos: 1 };
    h.rpcs = { financeiro_totais_do_aluno: { ok: true, recebido: "150.5", gasto: 20, total: 2, primeira: "2026-09-01T00:00:00", ultima: null } };
    const [lanc, recs, totais, categorias] = await Promise.all([
      lancamentos.paginaLancamentosDoAluno(ALUNO, 2), recibos.paginaRecibosDoAluno(ALUNO, 1.7), buscarTotaisDoAluno(ALUNO), lancamentos.garantirCategorias(EU, CONTA),
    ]);
    expect(h.chamadas).toHaveLength(1);
    expect(itensLidos()).toEqual([
      { q: "fin_transacoes_do_aluno", aluno: ALUNO, pagina: 2 }, { q: "fin_recibos_do_aluno", aluno: ALUNO, pagina: 1 }, { q: "fin_totais_do_aluno", aluno: ALUNO },
      { q: "fin_categorias" },
    ]);
    expect(lanc).toEqual({ itens: [{ id: "t1", categoria: { nome: "Consulta" } }], total: 21 });
    expect(recs).toEqual({ itens: [{ id: "r1", numero: 7 }], total: 1 });
    expect(totais).toEqual({ recebido: 150.5, gasto: 20, total: 2, primeira: "2026-09-01", ultima: null });
    // o lerCategorias do aluno: só o id e o nome (o select de hoje) — e nenhuma semente (a lista não veio vazia)
    expect(categorias).toEqual([{ id: "c1", nome: "Consulta" }]);
    expect(h.chamadas.every((c) => c.corpo.acao === "ler")).toBe(true);
    // a página no servidor: a 2ª de 20 com o count exato, a ordem de hoje
    expect(h.consultas.find((c) => c.tabela === "transacoes")?.passos.at(-1)).toEqual(["range", 20, 39]);
  });

  it("os erros: a página que falha lança (a tela mostra o EstadoErro dela); os totais seguem ErroFinanceiro('erro_interno') — nunca a mensagem crua", async () => {
    h.erros.recibos = { code: "XX000", message: "erro cru" };
    await expect(recibos.paginaRecibosDoAluno(ALUNO, 1)).rejects.toBeInstanceOf(ErroLeitura);
    h.erros.financeiro_totais_do_aluno = { code: "XX000", message: "erro cru do banco" };
    const e = await buscarTotaisDoAluno(ALUNO).catch((x) => x);
    expect(e).toBeInstanceOf(ErroFinanceiro);
    expect(e).toMatchObject({ codigo: "erro_interno", message: "erro_interno" });
    expect(JSON.stringify(e.extra)).not.toContain("erro cru");
    delete h.erros.financeiro_totais_do_aluno;
    h.rpcs = { financeiro_totais_do_aluno: { ok: false } };
    await expect(buscarTotaisDoAluno(ALUNO)).rejects.toMatchObject({ codigo: "erro_interno" });
  });
});

describe("hml-20d — o gate do app do aluno (buscarResumo → fin_do_aluno): 1 em voo, guardado no aparelho, o mesmo desfecho", () => {
  it("a lista volta como hoje e fica guardada para a aluna; 2 pedidos juntos = 1 chamada", async () => {
    h.rpcs = { financeiro_do_aluno: [{ paciente_id: ALUNO, situacao: "em_dia" }] };
    const [a, b] = await Promise.all([buscarResumo("u-aluna"), buscarResumo("u-aluna")]);
    expect(a).toEqual([{ paciente_id: ALUNO, situacao: "em_dia" }]);
    expect(b).toBe(a);
    expect(h.chamadas).toHaveLength(1);
    expect(itensLidos()).toEqual([{ q: "fin_do_aluno" }]);
    expect(h.args).toEqual([{ nome: "financeiro_do_aluno", args: {} }]);
    expect(lerResumoGuardado("u-aluna")).toEqual(a);
  });

  it("valor que não é lista → [] (como hoje); o erro rejeita (quem mostra só marca 'erro') e nada é guardado; depois, a próxima chama de novo", async () => {
    h.rpcs = { financeiro_do_aluno: null };
    expect(await buscarResumo("u-aluna")).toEqual([]);
    localStorage.clear();
    h.erros.financeiro_do_aluno = { code: "XX000", message: "erro cru" };
    await expect(buscarResumo("u-aluna")).rejects.toBeInstanceOf(ErroLeitura);
    expect(lerResumoGuardado("u-aluna")).toBeNull();
    delete h.erros.financeiro_do_aluno;
    h.rpcs = { financeiro_do_aluno: [] };
    expect(await buscarResumo("u-aluna")).toEqual([]);
    expect(h.chamadas).toHaveLength(3);
  });
});
