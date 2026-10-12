// Physiq hml-20d (H-42 · jeito 2, etapa 2, parte 4) — o CATÁLOGO das leituras do Financeiro (supabase-principal/functions/_shared/
// financeiro-leituras.ts) e o módulo que roda as consultas COMO A PESSOA (functions/financeiro/leituras.ts — o import da porta é só de
// tipo, então ele roda aqui com um cliente falso que faz o papel do PostgREST com o RLS de quem chama), no molde do
// src/nutricao/leituraServidor.test.ts. O motor (_shared/leitura-lote.ts) é o da nutricao, sem mudança (os testes dele moram lá).
// Positivo: cada `q` aceita os params certos; as colunas são as que a lib do ed0d72e lia (o select de hoje, escrito igual — nenhum "*");
// o teto; a ordem; o dono das "minhas" = quem chama; a página com o total; o laço das cobranças NO SERVIDOR; os args das RPCs montados aqui.
// Negativo: q desconhecida → consulta_invalida; 17 itens → lote_grande; uuid/data/texto/inteiro ruins → dados_invalidos (nada roda);
// nutricionista_id/user_id/id do corpo ignorados; o último nº conta os da Lixeira; o laço para no teto (muitas_linhas, a frase de hoje é da
// lib) e no prazo; os códigos das RPCs ({ ok: false, erro } e o raise) voltam como o erro do item; o log não leva params nem linhas.
// E as 14 gravações da financeiro seguem iguais: o `ler` não entra no acaoDoFinanceiro e é despachado antes dele.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LOTE_MAX, ehRpc, type FonteRpc, type FonteTabela, type RespostaDeItem } from "../../supabase-principal/functions/_shared/leitura-lote";
import {
  COBRANCAS_POR_LEITURA, COLUNAS_DO_FINANCEIRO, CONSULTAS_DO_FINANCEIRO, CONSULTAS_FINANCEIRO, DATA_TEXTO_MAX, ERROS_DAS_RPCS_DA_CONTA,
  INT4_MAX, LIMITE_RPC_MAX, MAX_LEITURAS_COBRANCAS, POR_PAGINA_LEITURA, STATUS_EM_ABERTO, TETO_LISTA, TEXTO_FILTRO_MAX, consultaDoFinanceiro,
  filtroEmAbertoOuNoPeriodo, type ConsultaFinanceiro,
} from "../../supabase-principal/functions/_shared/financeiro-leituras";
import { ACOES_DO_FINANCEIRO, acaoDoFinanceiro } from "../../supabase-principal/functions/_shared/financeiro-gravar-regras";
import { atenderLeitura } from "../../supabase-principal/functions/financeiro/leituras";

const RAIZ = resolve(__dirname, "../..");
const EU = "33333333-3333-4333-8333-333333333333";
const OUTRA = "99999999-9999-4999-8999-999999999999";
const CONTA = "66666666-6666-4666-8666-666666666666";
const ALUNO = "55555555-5555-4555-8555-555555555555";

// ───────────────────────── o cliente falso (grava a cadeia inteira de cada select; o RLS de quem chama) ─────────────────────────
type Passo = [string, ...unknown[]];
interface Consulta {
  tabela: string;
  colunas: string;
  opcoes: { count?: string } | null;
  passos: Passo[];
}
interface Banco {
  rpc?: (nome: string, args: Record<string, unknown>) => { data: unknown; error: unknown };
  tabela?: (c: Consulta) => { data: unknown; error: unknown; count?: number | null };
}
function clienteFalso(banco: Banco) {
  const rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const consultas: Consulta[] = [];
  const cliente = {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, args });
      return banco.rpc ? banco.rpc(nome, args) : { data: null, error: null };
    },
    from: (tabela: string) => ({
      select: (colunas: string, opcoes?: { count?: string }) => {
        const c: Consulta = { tabela, colunas, opcoes: opcoes ?? null, passos: [] };
        consultas.push(c);
        const resposta = () => (banco.tabela ? banco.tabela(c) : { data: [], error: null, count: c.opcoes?.count ? 0 : null });
        const b: Record<string, unknown> = {};
        for (const op of ["in", "eq", "is", "gte", "lte", "lt", "ilike", "or", "order", "limit", "range"]) {
          b[op] = (...args: unknown[]) => (c.passos.push([op, ...args]), b);
        }
        b.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, falhou);
        return b;
      },
    }),
    // o módulo do Financeiro não assina nada: o Storage aqui só existe para provar que ninguém chama
    storage: {
      from: () => {
        throw new Error("o Financeiro não lê o Storage");
      },
    },
  };
  return { cliente, rpcs, consultas };
}
function contexto(itens: unknown[], banco: Banco, prazo?: { esgotado(): boolean }, corpoExtra: Record<string, unknown> = {}) {
  const f = clienteFalso(banco);
  const log = { info: vi.fn(), aviso: vi.fn(), erro: vi.fn(), excecao: vi.fn() };
  const c = { schema: "staging" as const, origin: null, corpo: { ...corpoExtra, acao: "ler", itens }, userId: EU, comoPessoa: f.cliente, log, ...(prazo ? { prazo } : {}) };
  return { c: c as unknown as Parameters<typeof atenderLeitura>[0], ...f, log };
}
const itensDa = (r: Awaited<ReturnType<typeof atenderLeitura>>) => (r as unknown as { itens: RespostaDeItem[] }).itens;
async function ler(itens: unknown[], banco: Banco = {}, prazo?: { esgotado(): boolean }) {
  const k = contexto(itens, banco, prazo);
  const r = await atenderLeitura(k.c);
  return { r, itens: r.ok ? itensDa(r) : [], ...k };
}
const raise = (codigo: string) => ({ data: null, error: { code: "P0001", message: codigo, details: null, hint: null } });
const RECORTE = `conta_id.eq.${CONTA},and(conta_id.is.null,nutricionista_id.eq.${EU})`;

/**
 * O SELECT FIXO das libs do ed0d72e (o que o navegador lia hoje), com a origem — o servidor tem de mandar o MESMO (as colunas, o embutido,
 * os filtros, a ordem). A regra do P do api.py: compara com o SQL/select fixo da lib do commit de base, nunca com o próprio catálogo.
 */
const DA_LIB = {
  fin_categorias: { origem: "src/painel/financeiro/dados.ts:176 listarCategorias", select: "id, nome, nutricionista_id" },
  fin_modelos_recibo: { origem: "src/painel/financeiro/dados.ts:269 listarModelosRecibo", select: "id, nutricionista_id, titulo, conteudo, favorito" },
  fin_ultimo_recibo: { origem: "src/painel/financeiro/dados.ts:263 ultimoNumeroRecibo", select: "numero" },
  fin_profissional: { origem: "src/painel/financeiro/dados.ts:352 nomeDoProfissional", select: "nome" },
  fin_cobrancas_resumo: {
    origem: "src/painel/financeiro/dados.ts:387-390 listarCobrancasDoResumo",
    select: "id, paciente_id, nutricionista_id, tipo, descricao, valor, vencimento, status, forma, pago_em, transacao_id, reembolsado_em, enviado_em, created_at, paciente:pacientes(nome)",
  },
  fin_transacoes_do_aluno: {
    origem: "src/financeiro/lancamentos.ts:72-75 paginaLancamentosDoAluno",
    select: "id, nutricionista_id, paciente_id, tipo, descricao, valor, data, metodo, observacao, estornada, recibo_id, categoria_id, created_at, categoria:categorias_financeiras(nome)",
  },
  fin_recibos_do_aluno: {
    origem: "src/financeiro/recibos.ts:176-178 paginaRecibosDoAluno",
    select: "id, nutricionista_id, paciente_id, transacao_id, modelo_id, numero, valor, data, descricao, texto, created_at",
  },
} as const;

// ───────────────────────── o catálogo ─────────────────────────
describe("hml-20d — o catálogo do Financeiro (forma, dono, colunas = o select da lib de hoje, códigos das RPCs)", () => {
  it("as 12 consultas do contrato (os nomes da decisão B)", () => {
    expect(CONSULTAS_DO_FINANCEIRO).toEqual([
      "fin_categorias", "fin_modelos_recibo", "fin_ultimo_recibo", "fin_profissional", "fin_resumo_periodo", "fin_lancamentos", "fin_recibos",
      "fin_cobrancas_resumo", "fin_transacoes_do_aluno", "fin_recibos_do_aluno", "fin_totais_do_aluno", "fin_do_aluno",
    ]);
    expect(consultaDoFinanceiro("fin_categorias")).toBe(CONSULTAS_FINANCEIRO.fin_categorias);
    for (const q of ["nao_existe", "__proto__", "constructor", "aluno_dieta", "profissional", 3, null]) expect(consultaDoFinanceiro(q), String(q)).toBeNull();
  });

  it("cada tabela: colunas explícitas (nenhum '*', nem nos embutidos) = o select FIXO da lib do ed0d72e; teto ≤ 1000", () => {
    for (const [q, lib] of Object.entries(DA_LIB)) {
      const f = (CONSULTAS_FINANCEIRO as Record<string, ConsultaFinanceiro>)[q].fonte as FonteTabela;
      const colunas = [...f.colunas, ...(f.embutidos ?? []).map((e) => `${e.nome}:${e.tabela}(${e.colunas.join(", ")})`)].join(", ");
      expect(colunas, `${q} × ${lib.origem}`).toBe(lib.select);
      expect(colunas, q).not.toContain("*");
      expect(f.teto, q).toBeLessThanOrEqual(TETO_LISTA);
    }
  });

  it("'minha' = SÓ as 4 que a lib filtrava pelo id de quem está logado (categorias, modelos, último nº, nome); o resto o RLS/a RPC decide", () => {
    const minhas = Object.entries(CONSULTAS_FINANCEIRO as Record<string, ConsultaFinanceiro>).filter(([, c]) => c.dono).map(([q, c]) => [q, c.dono]);
    expect(minhas).toEqual([
      ["fin_categorias", "nutricionista_id"], ["fin_modelos_recibo", "nutricionista_id"], ["fin_ultimo_recibo", "nutricionista_id"], ["fin_profissional", "id"],
    ]);
  });

  it("o catálogo só usa o que o módulo do Financeiro constrói (nada de Storage, HEAD, porDia, série RPC → ids, ★, donoSe, sozinha)", () => {
    for (const [q, c] of Object.entries(CONSULTAS_FINANCEIRO as Record<string, ConsultaFinanceiro>)) {
      expect(c.assinar, q).toBeUndefined();
      expect(c.donoSe, q).toBeUndefined();
      expect(c.sozinha, q).toBeUndefined();
      if (ehRpc(c.fonte)) {
        expect((c.fonte as FonteRpc).linhasDosIds, q).toBeUndefined();
        expect((c.fonte as FonteRpc).filtrarLista, q).toBeUndefined();
      } else {
        const f = c.fonte as FonteTabela;
        expect([f.soContar, f.porDia, f.faixa, f.uma], q).toEqual([undefined, undefined, undefined, undefined]);
      }
    }
  });

  it("as RPCs: os args montados aqui (o corpo nunca vira arg); os 4 códigos de propósito das 3 da conta; a fin_do_aluno sem params", () => {
    const rpcs = Object.entries(CONSULTAS_FINANCEIRO as Record<string, ConsultaFinanceiro>).filter(([, c]) => ehRpc(c.fonte))
      .map(([q, c]) => [q, (c.fonte as FonteRpc).rpc, (c.fonte as FonteRpc).args ?? {}, (c.fonte as FonteRpc).erros ?? []]);
    expect(rpcs).toEqual([
      ["fin_resumo_periodo", "financeiro_resumo_periodo", { p_conta: "conta", p_de: "de", p_ate: "ate", p_filtros: "filtros" }, ERROS_DAS_RPCS_DA_CONTA],
      ["fin_lancamentos", "financeiro_lancamentos", { p_conta: "conta", p_de: "de", p_ate: "ate", p_filtros: "filtros", p_offset: "offset", p_limite: "limite" }, ERROS_DAS_RPCS_DA_CONTA],
      ["fin_recibos", "financeiro_recibos", { p_conta: "conta", p_filtros: "filtros", p_offset: "offset", p_limite: "limite" }, ERROS_DAS_RPCS_DA_CONTA],
      ["fin_totais_do_aluno", "financeiro_totais_do_aluno", { p_aluno: "aluno" }, []],
      ["fin_do_aluno", "financeiro_do_aluno", {}, []],
    ]);
    expect(ERROS_DAS_RPCS_DA_CONTA).toEqual(["sem_login", "sem_acesso", "conta_inexistente", "periodo_invalido"]);
    expect(CONSULTAS_FINANCEIRO.fin_do_aluno.params).toEqual({});
  });

  it("os tetos: a página de 20 (o POR_PAGINA da tela), o limite das RPCs 0–100, o laço das cobranças 1000 × 20, o texto do filtro 500", () => {
    expect([POR_PAGINA_LEITURA, LIMITE_RPC_MAX, COBRANCAS_POR_LEITURA, MAX_LEITURAS_COBRANCAS, TEXTO_FILTRO_MAX, DATA_TEXTO_MAX]).toEqual([20, 100, 1000, 20, 500, 10]);
    expect(CONSULTAS_FINANCEIRO.fin_cobrancas_resumo.fonte.laco).toEqual({ tamanho: 1000, leituras: 20 });
    expect(CONSULTAS_FINANCEIRO.fin_transacoes_do_aluno.fonte.pagina).toEqual({ param: "pagina", tamanho: 20 });
    expect(CONSULTAS_FINANCEIRO.fin_recibos_do_aluno.fonte.pagina).toEqual({ param: "pagina", tamanho: 20 });
    expect(STATUS_EM_ABERTO).toEqual(["aberta", "aguardando_confirmacao"]);
  });

  it("o 'em aberto OU no período' das cobranças = o MESMO texto que a lib montava (dados.ts:389); sem uma das datas, nada", () => {
    const o = CONSULTAS_FINANCEIRO.fin_cobrancas_resumo.emAbertoOuNoPeriodo;
    expect(filtroEmAbertoOuNoPeriodo(o, { de: "2026-10-01", ate: "2026-10-31" })).toBe(
      "status.in.(aberta,aguardando_confirmacao),and(vencimento.gte.2026-10-01,vencimento.lte.2026-10-31)",
    );
    expect(filtroEmAbertoOuNoPeriodo(o, { de: "2026-10-01" })).toBeNull();
  });
});

// ───────────────────────── as 14 gravações seguem iguais ─────────────────────────
describe("hml-20d — as 14 gravações da financeiro NÃO mudam: o `ler` não entra no acaoDoFinanceiro e é despachado antes dele", () => {
  it("a lista fechada das gravações é a do ed0d72e (14) e não conhece o `ler`", () => {
    expect(ACOES_DO_FINANCEIRO).toEqual([
      "padroes_garantir", "transacao_criar", "transacao_editar", "transacao_estornar", "transacao_excluir", "categoria_criar", "categoria_renomear",
      "categoria_excluir", "modelo_recibo_criar", "modelo_recibo_editar", "modelo_recibo_excluir", "recibo_emitir", "recibo_excluir", "tags_salvar",
    ]);
    expect(acaoDoFinanceiro("ler")).toBeNull();
  });

  it("index.ts: o `ler` vai ao módulo das leituras ANTES do acaoDoFinanceiro; o resto do despacho é o de antes (as regras não importam as leituras)", () => {
    const fonte = readFileSync(resolve(RAIZ, "supabase-principal/functions/financeiro/index.ts"), "utf-8");
    const ler = fonte.indexOf('if (c.corpo.acao === "ler") {');
    const lista = fonte.indexOf("const acao = acaoDoFinanceiro(c.corpo.acao);");
    expect(ler).toBeGreaterThan(0);
    expect(lista).toBeGreaterThan(ler);
    // o bloco do `ler` só chama o módulo e responde (status pelo mesmo mapa)
    expect(fonte.slice(ler, lista)).toMatch(/const r = await atenderLeitura\(c\);\s*return json\(r, r\.ok \? 200 : statusDoErroFinanceiro\(r\.erro\), c\.origin\);\s*}\s*$/);
    expect(fonte).toContain('import { atenderLeitura } from "./leituras.ts";');
    // o despacho das gravações: o mesmo switch de antes (as 4 especiais + o CRUD)
    for (const caso of ['case "padroes_garantir":', 'case "recibo_emitir":', 'case "recibo_excluir":', 'case "tags_salvar":', "return gravar(c, acao);"]) {
      expect(fonte, caso).toContain(caso);
    }
    const regras = readFileSync(resolve(RAIZ, "supabase-principal/functions/_shared/financeiro-gravar-regras.ts"), "utf-8");
    expect(regras).not.toMatch(/financeiro-leituras|leitura-lote/);
  });
});

// ───────────────────────── cada consulta no módulo (como a pessoa, com o RLS simulado) ─────────────────────────
describe("hml-20d — as consultas de tabela no módulo: o pedido = o da lib de hoje (positivo)", () => {
  it("fin_categorias: as minhas (dono = o user do token), vivas, pelo nome — o select de hoje; o id/nutricionista_id do corpo é ignorado", async () => {
    const linhas = [{ id: "c1", nome: "Consulta", nutricionista_id: EU }];
    const { itens, consultas } = await ler([{ q: "fin_categorias", nutricionista_id: OUTRA, user_id: OUTRA, id: OUTRA }], { tabela: () => ({ data: linhas, error: null }) });
    expect(itens).toEqual([{ ok: true, linhas }]);
    expect(consultas).toEqual([{
      tabela: "categorias_financeiras", colunas: DA_LIB.fin_categorias.select, opcoes: null,
      passos: [["eq", "nutricionista_id", EU], ["is", "deleted_at", null], ["order", "nome", { ascending: true }], ["limit", 1000]],
    }]);
  });

  it("fin_modelos_recibo: os meus vivos, sem ordem (a tela ordena), o select de hoje", async () => {
    const { itens, consultas } = await ler([{ q: "fin_modelos_recibo", nutricionista_id: OUTRA }]);
    expect(itens).toEqual([{ ok: true, linhas: [] }]);
    expect(consultas).toEqual([{
      tabela: "modelos_recibo", colunas: DA_LIB.fin_modelos_recibo.select, opcoes: null, passos: [["eq", "nutricionista_id", EU], ["is", "deleted_at", null], ["limit", 1000]],
    }]);
  });

  it("fin_ultimo_recibo: o maior nº do profissional SEM o filtro das vivas — os da Lixeira contam (o número não volta); 1 linha", async () => {
    // o banco falso: o recibo 9 está na Lixeira e é o maior — tem de voltar (a lib de hoje lia assim)
    const banco: Banco = {
      tabela: (c) => {
        const vivos = !c.passos.some((p) => p[0] === "is" && p[1] === "deleted_at");
        const todos = [{ numero: 9, deleted_at: "2026-10-01" }, { numero: 7, deleted_at: null }];
        return { data: (vivos ? todos : todos.filter((r) => !r.deleted_at)).slice(0, 1).map(({ numero }) => ({ numero })), error: null };
      },
    };
    const { itens, consultas } = await ler([{ q: "fin_ultimo_recibo", nutricionista_id: OUTRA }], banco);
    expect(itens).toEqual([{ ok: true, linhas: [{ numero: 9 }] }]);
    expect(consultas[0]).toEqual({
      tabela: "recibos", colunas: "numero", opcoes: null, passos: [["eq", "nutricionista_id", EU], ["order", "numero", { ascending: false }], ["limit", 1]],
    });
    // nenhum recibo → linhas vazias (a lib devolve 0), não nao_encontrado
    expect((await ler([{ q: "fin_ultimo_recibo" }])).itens).toEqual([{ ok: true, linhas: [] }]);
  });

  it("fin_profissional: o profiles de QUEM CHAMA (id = o user do token), só o nome, 1 linha; o id do corpo é ignorado", async () => {
    const { itens, consultas } = await ler([{ q: "fin_profissional", id: OUTRA }], { tabela: () => ({ data: [{ nome: "Personal Teste" }], error: null }) });
    expect(itens).toEqual([{ ok: true, linhas: [{ nome: "Personal Teste" }] }]);
    expect(consultas[0]).toEqual({ tabela: "profiles", colunas: "nome", opcoes: null, passos: [["eq", "id", EU], ["limit", 1]] });
  });

  it("fin_cobrancas_resumo: o recorte da conta ativa (o user do TOKEN) + o 'em aberto OU no mês', as vivas, com o nome do aluno, pelo id, em leituras de 1000", async () => {
    const { itens, consultas } = await ler([{ q: "fin_cobrancas_resumo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", nutricionista_id: OUTRA }], {
      tabela: () => ({ data: [{ id: "k1", paciente: { nome: "Aluna" } }], error: null }),
    });
    expect(itens).toEqual([{ ok: true, linhas: [{ id: "k1", paciente: { nome: "Aluna" } }] }]);
    expect(consultas).toEqual([{
      tabela: "cobrancas", colunas: DA_LIB.fin_cobrancas_resumo.select, opcoes: null,
      passos: [
        ["is", "deleted_at", null], ["or", RECORTE],
        ["or", "status.in.(aberta,aguardando_confirmacao),and(vencimento.gte.2026-10-01,vencimento.lte.2026-10-31)"],
        ["order", "id", { ascending: true }], ["range", 0, 999],
      ],
    }]);
  });

  it("fin_cobrancas_resumo: TODAS, até a leitura que vem com menos (2001 → 3 leituras; 1000 exato → 2) — o laço da lib, agora no servidor", async () => {
    const lote = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}` }));
    for (const [total, leituras] of [[2001, 3], [1000, 2], [0, 1]] as const) {
      let lidas = 0;
      const { itens, consultas } = await ler([{ q: "fin_cobrancas_resumo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31" }], {
        tabela: () => {
          const n = Math.max(0, Math.min(COBRANCAS_POR_LEITURA, total - lidas));
          lidas += n;
          return { data: lote(n), error: null };
        },
      });
      expect((itens[0] as { linhas: unknown[] }).linhas, String(total)).toHaveLength(total);
      expect(consultas.map((c) => c.passos.at(-1)), String(total)).toEqual(Array.from({ length: leituras }, (_, i) => ["range", i * 1000, i * 1000 + 999]));
    }
  });

  it("fin_transacoes_do_aluno: a PÁGINA (20) com o count exato, o aluno do corpo, as vivas, a ordem estável de hoje, com a categoria", async () => {
    const { itens, consultas } = await ler([{ q: "fin_transacoes_do_aluno", aluno: ALUNO, pagina: 2, nutricionista_id: OUTRA }], {
      tabela: () => ({ data: [{ id: "t1", categoria: { nome: "Consulta" } }], error: null, count: 21 }),
    });
    expect(itens).toEqual([{ ok: true, linhas: [{ id: "t1", categoria: { nome: "Consulta" } }], total: 21 }]);
    expect(consultas).toEqual([{
      tabela: "transacoes", colunas: DA_LIB.fin_transacoes_do_aluno.select, opcoes: { count: "exact" },
      passos: [
        ["eq", "paciente_id", ALUNO], ["is", "deleted_at", null], ["order", "data", { ascending: false }], ["order", "created_at", { ascending: false }],
        ["order", "id", { ascending: false }], ["range", 20, 39],
      ],
    }]);
  });

  it("fin_recibos_do_aluno: a PÁGINA (20) com o count exato, as vivas, o número mais alto primeiro (desempate pelo id)", async () => {
    const { itens, consultas } = await ler([{ q: "fin_recibos_do_aluno", aluno: ALUNO, pagina: 1 }], { tabela: () => ({ data: [], error: null, count: 0 }) });
    expect(itens).toEqual([{ ok: true, linhas: [], total: 0 }]);
    expect(consultas).toEqual([{
      tabela: "recibos", colunas: DA_LIB.fin_recibos_do_aluno.select, opcoes: { count: "exact" },
      passos: [["eq", "paciente_id", ALUNO], ["is", "deleted_at", null], ["order", "numero", { ascending: false }], ["order", "id", { ascending: true }], ["range", 0, 19]],
    }]);
  });

  it("a tela inteira numa ida: as 4 comuns + a aba (Resumo) = 1 lote; os iguais (as categorias 2× — o painel e o aluno) rodam 1 vez", async () => {
    const { itens, consultas, rpcs } = await ler([
      { q: "fin_profissional" }, { q: "fin_categorias" }, { q: "fin_modelos_recibo" }, { q: "fin_ultimo_recibo" }, { q: "fin_categorias" },
      { q: "fin_resumo_periodo", conta: CONTA, de: "2026-09-01", ate: "2026-10-12", filtros: { resumo: true } },
      { q: "fin_cobrancas_resumo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31" },
      { q: "fin_lancamentos", conta: CONTA, de: "2026-09-01", ate: "2026-10-12", filtros: {}, offset: 0, limite: 6 },
    ], { rpc: () => ({ data: { ok: true, total: 0 }, error: null }) });
    expect(itens).toHaveLength(8);
    expect(itens.every((i) => i.ok)).toBe(true);
    expect(itens[1]).toEqual(itens[4]);
    expect(consultas.map((c) => c.tabela).sort()).toEqual(["categorias_financeiras", "cobrancas", "modelos_recibo", "profiles", "recibos"]);
    expect(rpcs.map((r) => r.nome).sort()).toEqual(["financeiro_lancamentos", "financeiro_resumo_periodo"]);
  });
});

describe("hml-20d — as RPCs no módulo: os args de hoje (montados aqui) e os códigos de propósito", () => {
  it("fin_resumo_periodo: os filtros da lista (só as chaves declaradas) OU o { resumo: true }; o resto do corpo não vira arg", async () => {
    const { itens, rpcs } = await ler([
      { q: "fin_resumo_periodo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", filtros: { tipo: "entrada", categoria: "c1", metodo: "pix", q: "maria", x: 1 }, p_conta: OUTRA },
      { q: "fin_resumo_periodo", conta: CONTA, de: "2026-09-01", ate: "2026-10-12", filtros: { resumo: true } },
    ], { rpc: () => ({ data: { ok: true, entradas: 10 }, error: null }) });
    expect(itens).toEqual([{ ok: true, valor: { ok: true, entradas: 10 } }, { ok: true, valor: { ok: true, entradas: 10 } }]);
    expect(rpcs).toEqual([
      { nome: "financeiro_resumo_periodo", args: { p_conta: CONTA, p_de: "2026-10-01", p_ate: "2026-10-31", p_filtros: { tipo: "entrada", categoria: "c1", metodo: "pix", q: "maria" } } },
      { nome: "financeiro_resumo_periodo", args: { p_conta: CONTA, p_de: "2026-09-01", p_ate: "2026-10-12", p_filtros: { resumo: true } } },
    ]);
  });

  it("o valor estranho da URL (tipo/método desconhecido) segue para a RPC como hoje (ela trata como 'sem filtro') — não vira erro", async () => {
    const { itens, rpcs } = await ler([{ q: "fin_lancamentos", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", filtros: { tipo: "qualquer", metodo: "x" }, offset: 0, limite: 20 }], {
      rpc: () => ({ data: { ok: true, total: 0, itens: [] }, error: null }),
    });
    expect(itens[0].ok).toBe(true);
    expect(rpcs[0].args).toEqual({ p_conta: CONTA, p_de: "2026-10-01", p_ate: "2026-10-31", p_filtros: { tipo: "qualquer", metodo: "x" }, p_offset: 0, p_limite: 20 });
  });

  it("fin_recibos: a busca e a página; o 'Recibos no mês' do Dashboard (o período, limite 0: só o total)", async () => {
    const { rpcs } = await ler([
      { q: "fin_recibos", conta: CONTA, filtros: { q: "0007" }, offset: 20, limite: 20 },
      { q: "fin_recibos", conta: CONTA, filtros: { de: "2026-10-01", ate: "2026-10-31" }, offset: 0, limite: 0 },
    ], { rpc: () => ({ data: { ok: true, total: 3, soma: 0, itens: [] }, error: null }) });
    expect(rpcs).toEqual([
      { nome: "financeiro_recibos", args: { p_conta: CONTA, p_filtros: { q: "0007" }, p_offset: 20, p_limite: 20 } },
      { nome: "financeiro_recibos", args: { p_conta: CONTA, p_filtros: { de: "2026-10-01", ate: "2026-10-31" }, p_offset: 0, p_limite: 0 } },
    ]);
  });

  it("fin_totais_do_aluno e fin_do_aluno: os args de hoje (o aluno do corpo; a do app sem nenhum — o auth.uid() lá dentro); o valor volta como veio", async () => {
    const valores: Record<string, unknown> = {
      financeiro_totais_do_aluno: { ok: true, recebido: 150, gasto: 0, total: 1, primeira: "2026-10-01", ultima: "2026-10-01" },
      financeiro_do_aluno: [{ paciente_id: ALUNO, situacao: "em_dia" }],
    };
    const { itens, rpcs } = await ler([{ q: "fin_totais_do_aluno", aluno: ALUNO, p_aluno: OUTRA }, { q: "fin_do_aluno", aluno: OUTRA, user_id: OUTRA }], {
      rpc: (nome) => ({ data: valores[nome], error: null }),
    });
    expect(itens).toEqual([{ ok: true, valor: valores.financeiro_totais_do_aluno }, { ok: true, valor: valores.financeiro_do_aluno }]);
    expect(rpcs).toEqual([{ nome: "financeiro_totais_do_aluno", args: { p_aluno: ALUNO } }, { nome: "financeiro_do_aluno", args: {} }]);
  });

  it("N1 (como hoje): as 3 da conta devolvem { ok: false, erro } de propósito → o erro do ITEM (aviso, nunca o log.excecao); o raise com o código também", async () => {
    for (const codigo of ERROS_DAS_RPCS_DA_CONTA) {
      const k = await ler([{ q: "fin_recibos", conta: CONTA, filtros: {}, offset: 0, limite: 20 }], { rpc: () => ({ data: { ok: false, erro: codigo }, error: null }) });
      expect(k.itens, codigo).toEqual([{ ok: false, erro: codigo }]);
      expect(k.log.excecao, codigo).not.toHaveBeenCalled();
      expect(k.log.aviso, codigo).toHaveBeenCalledWith(expect.objectContaining({ codigo, acao: "fin_recibos" }));
      const r = await ler([{ q: "fin_lancamentos", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", filtros: {}, offset: 0, limite: 20 }], { rpc: () => raise(codigo) });
      expect(r.itens, codigo).toEqual([{ ok: false, erro: codigo }]);
      expect(r.log.excecao, codigo).not.toHaveBeenCalled();
    }
  });

  it("o { ok: false } com outro código segue como valor (a lib diz 'Não deu para carregar o financeiro.'); o raise inesperado → erro_interno + aviso ao Weslley", async () => {
    const a = await ler([{ q: "fin_resumo_periodo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", filtros: {} }], { rpc: () => ({ data: { ok: false, erro: "outro" }, error: null }) });
    expect(a.itens).toEqual([{ ok: true, valor: { ok: false, erro: "outro" } }]);
    const b = await ler([{ q: "fin_resumo_periodo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", filtros: {} }], { rpc: () => raise("boom") });
    expect(b.itens).toEqual([{ ok: false, erro: "erro_interno" }]);
    expect(b.log.excecao).toHaveBeenCalledTimes(1);
    // as RPCs sem códigos de propósito (totais, app): o { ok: false } não vira erro aqui (a lib confere, como hoje)
    const c = await ler([{ q: "fin_totais_do_aluno", aluno: ALUNO }], { rpc: () => ({ data: { ok: false, erro: "sem_acesso" }, error: null }) });
    expect(c.itens).toEqual([{ ok: true, valor: { ok: false, erro: "sem_acesso" } }]);
  });
});

describe("hml-20d — os negativos: params ruins, corpo ignorado, outra conta, erro do banco, o laço no teto e no prazo", () => {
  it("params ruins → dados_invalidos NAQUELE item (nada roda): conta/aluno não uuid, data fora, texto acima do teto, página/offset/limite fora", async () => {
    const ruins: Array<Record<string, unknown>> = [
      { q: "fin_resumo_periodo", conta: "nao-uuid", de: "2026-10-01", ate: "2026-10-31" },
      { q: "fin_resumo_periodo", conta: CONTA, de: "2026-02-31", ate: "2026-10-31" },
      { q: "fin_resumo_periodo", conta: CONTA, de: "12/10/2026", ate: "2026-10-31" },
      { q: "fin_resumo_periodo", conta: CONTA, ate: "2026-10-31" },
      { q: "fin_lancamentos", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", filtros: { q: "x".repeat(TEXTO_FILTRO_MAX + 1) }, offset: 0, limite: 20 },
      { q: "fin_lancamentos", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", filtros: { resumo: "sim" }, offset: 0, limite: 20 },
      { q: "fin_lancamentos", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", offset: -1, limite: 20 },
      { q: "fin_lancamentos", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", offset: 0, limite: LIMITE_RPC_MAX + 1 },
      { q: "fin_lancamentos", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", offset: INT4_MAX + 1, limite: 20 },
      { q: "fin_recibos", conta: CONTA, filtros: { de: "2026-10-01T00:00" }, offset: 0, limite: 0 },
      { q: "fin_recibos", conta: CONTA, offset: 0 },
      { q: "fin_cobrancas_resumo", conta: CONTA, de: "2026-10-01" },
      { q: "fin_cobrancas_resumo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31),or(status.eq.paga" },
      { q: "fin_transacoes_do_aluno", aluno: ALUNO, pagina: 0 },
      { q: "fin_transacoes_do_aluno", aluno: "1; drop", pagina: 1 },
      { q: "fin_recibos_do_aluno", aluno: ALUNO },
      { q: "fin_totais_do_aluno" },
      { q: "fin_totais_do_aluno", aluno: [ALUNO] },
    ];
    // em lotes de até 16 (o LOTE_MAX: o front divide assim)
    for (let i = 0; i < ruins.length; i += LOTE_MAX) {
      const parte = ruins.slice(i, i + LOTE_MAX);
      const { itens, rpcs, consultas, log } = await ler(parte);
      expect(itens).toEqual(parte.map(() => ({ ok: false, erro: "dados_invalidos" })));
      expect(rpcs).toEqual([]);
      expect(consultas).toEqual([]);
      expect(log.excecao).not.toHaveBeenCalled();
    }
  });

  it("q desconhecida → consulta_invalida só naquele item; 17 itens → lote_grande (nada roda); sem itens → dados_invalidos", async () => {
    const { itens } = await ler([{ q: "fin_categorias" }, { q: "aluno_dieta", dia: "2026-10-12" }, { q: "fin_nao_existe" }]);
    expect(itens.map((i) => (i.ok === false ? i.erro : "ok"))).toEqual(["ok", "consulta_invalida", "consulta_invalida"]);
    expect(LOTE_MAX).toBe(16);
    const g = await ler(Array.from({ length: 17 }, () => ({ q: "fin_categorias" })));
    expect(g.r).toEqual({ ok: false, erro: "lote_grande" });
    expect(g.consultas).toEqual([]);
    expect((await ler([])).r).toEqual({ ok: false, erro: "dados_invalidos" });
  });

  it("N4: nutricionista_id/user_id/id/conta_id do corpo (no item ou no topo) nunca viram o dono nem o recorte (o user do TOKEN)", async () => {
    const k = contexto([
      { q: "fin_categorias", nutricionista_id: OUTRA, user_id: OUTRA },
      { q: "fin_cobrancas_resumo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31", nutricionista_id: OUTRA, user_id: OUTRA },
    ], {}, undefined, { nutricionista_id: OUTRA, user_id: OUTRA, userId: OUTRA, id: OUTRA });
    await atenderLeitura(k.c);
    const tudo = JSON.stringify(k.consultas);
    expect(tudo).not.toContain(OUTRA);
    expect(tudo).toContain(`nutricionista_id.eq.${EU}`);
  });

  it("N1 (como hoje): outra conta — o RLS devolve vazio/0 → lista vazia, total 0 (nunca uma linha de outra pessoa)", async () => {
    const { itens } = await ler([
      { q: "fin_transacoes_do_aluno", aluno: ALUNO, pagina: 1 }, { q: "fin_recibos_do_aluno", aluno: ALUNO, pagina: 1 },
      { q: "fin_cobrancas_resumo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31" },
    ], { tabela: (c) => ({ data: [], error: null, count: c.opcoes?.count ? 0 : null }) });
    expect(itens).toEqual([{ ok: true, linhas: [], total: 0 }, { ok: true, linhas: [], total: 0 }, { ok: true, linhas: [] }]);
  });

  it("o erro do banco vira o código do item: 42501 → sem_acesso (aviso); PGRST103 na página → dados_invalidos (aviso); a página sem a contagem → erro_interno", async () => {
    const a = await ler([{ q: "fin_categorias" }], { tabela: () => ({ data: null, error: { code: "42501", message: "permission denied for table categorias_financeiras" } }) });
    expect(a.itens).toEqual([{ ok: false, erro: "sem_acesso" }]);
    expect(a.log.excecao).not.toHaveBeenCalled();
    const b = await ler([{ q: "fin_recibos_do_aluno", aluno: ALUNO, pagina: 99 }], { tabela: () => ({ data: null, error: { code: "PGRST103", message: "Requested range not satisfiable" } }) });
    expect(b.itens).toEqual([{ ok: false, erro: "dados_invalidos" }]);
    expect(b.log.excecao).not.toHaveBeenCalled();
    const c = await ler([{ q: "fin_transacoes_do_aluno", aluno: ALUNO, pagina: 1 }], { tabela: () => ({ data: [], error: null, count: null }) });
    expect(c.itens).toEqual([{ ok: false, erro: "erro_interno" }]);
    const d = await ler([{ q: "fin_profissional" }], { tabela: () => ({ data: null, error: { message: "TimeoutError: signal timed out" } }) });
    expect(d.itens).toEqual([{ ok: false, erro: "tempo_esgotado" }]);
  });

  it("o laço das cobranças: passou de 20 leituras → muitas_linhas (aviso; a lib diz 'Cobranças em aberto demais para o resumo.'); o prazo esgotado → tempo_esgotado sem ler mais; o erro de uma leitura → o código", async () => {
    const cheia = () => ({ data: Array.from({ length: COBRANCAS_POR_LEITURA }, (_, i) => ({ id: `k${i}` })), error: null });
    const a = await ler([{ q: "fin_cobrancas_resumo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31" }], { tabela: cheia });
    expect(a.itens).toEqual([{ ok: false, erro: "muitas_linhas" }]);
    expect(a.consultas).toHaveLength(MAX_LEITURAS_COBRANCAS);
    expect(a.log.aviso).toHaveBeenCalledWith(expect.objectContaining({ codigo: "muitas_linhas", acao: "fin_cobrancas_resumo", n: 20 }));
    let n = 0;
    const b = await ler([{ q: "fin_cobrancas_resumo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31" }], { tabela: cheia }, { esgotado: () => ++n > 2 });
    expect(b.itens).toEqual([{ ok: false, erro: "tempo_esgotado" }]);
    expect(b.consultas).toHaveLength(2);
    let k = 0;
    const c = await ler([{ q: "fin_cobrancas_resumo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31" }], {
      tabela: () => (++k === 2 ? { data: null, error: { code: "42501", message: "x" } } : cheia()),
    });
    expect(c.itens).toEqual([{ ok: false, erro: "sem_acesso" }]);
  });

  it("o log nunca leva params, linhas nem nomes (só código, schema, ação/q, n, ms, desfecho, pg)", async () => {
    const k = await ler([
      { q: "fin_cobrancas_resumo", conta: CONTA, de: "2026-10-01", ate: "2026-10-31" }, { q: "fin_transacoes_do_aluno", aluno: "ruim", pagina: 1 },
      { q: "fin_recibos", conta: CONTA, filtros: { q: "Maria da Silva" }, offset: 0, limite: 20 },
    ], {
      tabela: () => ({ data: [{ id: "k1", paciente: { nome: "Maria da Silva" } }], error: null }),
      rpc: () => ({ data: { ok: false, erro: "sem_acesso" }, error: null }),
    });
    const tudo = JSON.stringify([k.log.info.mock.calls, k.log.aviso.mock.calls, k.log.excecao.mock.calls]);
    for (const proibido of [CONTA, ALUNO, "Maria", "2026-10-01", "ruim", "k1"]) expect(tudo, proibido).not.toContain(proibido);
    expect(k.log.info).toHaveBeenCalledWith(expect.objectContaining({ codigo: "leitura", acao: "ler", n: 3, resultado: "parcial" }));
  });
});

describe("hml-20d — o módulo lê como a pessoa (fonte): sem chave secreta, sem Storage, o motor da nutricao sem mudança", () => {
  const modulo = readFileSync(resolve(RAIZ, "supabase-principal/functions/financeiro/leituras.ts"), "utf-8");
  it("tudo pelo c.comoPessoa; nenhuma chave secreta nem cliente de serviço; nenhum .storage; o select vem do planoDaTabela (o dono = c.userId)", () => {
    expect(modulo).not.toMatch(/service_?role|SERVICE_ROLE|sb_secret|createClient|Deno\.env|\.storage\b/);
    expect(modulo).toMatch(/c\.comoPessoa\.rpc\(/);
    expect(modulo).toMatch(/c\.comoPessoa\.from\(plano\.tabela\)/);
    expect(modulo).toMatch(/planoDaTabela\(consulta as ConsultaLeitura & \{ fonte: FonteTabela \}, params, userId\)/);
    expect(modulo).toMatch(/filtrosDaConsulta\(consulta, item\.params, c\.userId\)/);
    // não importa a porta (o Vitest roda o módulo; o deno check confere no index.ts que o ContextoPessoa encaixa)
    expect(modulo).not.toMatch(/from "[^"]*porta-pessoa/);
  });
});
