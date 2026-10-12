// Physiq hml-20d (H-42 · jeito 2, etapa 2, parte 4, 12/10/2026) — o módulo das LEITURAS da função financeiro: a ação `ler` (em lote),
// no molde do functions/nutricao/leituras.ts. O motor (_shared/leitura-lote.ts — o MESMO da nutricao, sem mudança) lê o pedido pelo
// catálogo (_shared/financeiro-leituras.ts) e roda os itens em paralelo (até 6), na ordem, com o erro de cada um isolado; aqui ficam os
// construtores, todos COMO A PESSOA (c.comoPessoa — o token de quem chama; nenhuma chave secreta): o RLS e as RPCs de hoje decidem quem
// vê (outra conta → lista vazia / o código da RPC, como hoje; decisão 6) e a função confere a forma.
//   RPC     .rpc(nome, args montados no servidor) → { ok: true, valor } — o { ok: false, erro } de propósito das 3 RPCs da conta (e o
//           raise com o mesmo código) volta como o erro do item (FonteRpc.erros), sem o log.excecao
//   tabela  .from(t).select(<colunas fechadas>) + os filtros declarados + o dono (= quem chama) + as vivas + o recorte da conta ativa (o
//           .or() com o user do token) + o "em aberto OU no período" das cobranças + a ordem + o teto; a página com o total (.range +
//           count exato) e o laço (leituras de `tamanho` até a última, dentro do prazo do pedido; passou do teto → muitas_linhas)
// Sem Storage: nenhuma leitura do Financeiro assina URL.
// Log com campos fixos: 1 linha por pedido (acao "ler", n itens, ms, o desfecho) e 1 por item que falhou (o código e a q) — nunca os
// params, as linhas ou os nomes.
// Este arquivo NÃO importa a porta (_shared/porta-pessoa.ts, que traz o supabase-js do esm.sh e o Deno): o contexto é o pedaço do
// ContextoPessoa que ele usa (ContextoLeitura, estrutural — o deno check confere no index.ts que o da porta encaixa). Assim o Vitest roda o
// módulo com um cliente falso (src/financeiro/leituraServidor.test.ts) e o tsc do app não puxa o Deno.
// DUPLICAÇÃO (anotada no progresso da hml-20d): os tipos do cliente/contexto, o aplicarFiltro, o laço e o falhou são os do módulo da
// nutricao, repetidos aqui porque a nutricao publicada é a da main (mexer nela faria a main divergir da função no ar) — juntar num módulo
// comum do _shared/ na próxima publicação da nutricao.
import {
  ERRO_MUITAS_LINHAS, argsDaRpc, ehRpc, erroDaLeitura, extrasDaTabela, intervaloDaPagina, lerPedidoDeLeitura, limitesDosEmbutidos, planoDaTabela,
  rodarLote, type ConsultaLeitura, type FiltroLeitura, type FonteRpc, type FonteTabela, type ItemValido, type RespostaDeItem,
} from "../_shared/leitura-lote.ts";
import type { Log } from "../_shared/log.ts";
import { CONSULTAS_FINANCEIRO, consultaDoFinanceiro, filtroEmAbertoOuNoPeriodo, type ConsultaFinanceiro } from "../_shared/financeiro-leituras.ts";

type Resultado = { data: unknown; error: unknown; count?: number | null };
/** O encadeamento do select que o módulo usa (o PostgrestFilterBuilder do supabase-js encaixa). */
interface BuscaLeitura extends PromiseLike<Resultado> {
  in(coluna: string, valores: readonly unknown[]): BuscaLeitura;
  eq(coluna: string, valor: unknown): BuscaLeitura;
  is(coluna: string, valor: null): BuscaLeitura;
  order(coluna: string, opcoes: { ascending: boolean }): BuscaLeitura;
  limit(n: number, opcoes?: { referencedTable: string }): BuscaLeitura;
  range(de: number, ate: number): BuscaLeitura;
  gte(coluna: string, valor: unknown): BuscaLeitura;
  lte(coluna: string, valor: unknown): BuscaLeitura;
  lt(coluna: string, valor: unknown): BuscaLeitura;
  ilike(coluna: string, padrao: string): BuscaLeitura;
  or(filtros: string, opcoes?: { referencedTable: string }): BuscaLeitura;
}
/** O pedaço do cliente "como a pessoa" que o módulo usa (o SupabaseClient da porta encaixa) — sem Storage. */
export interface ClienteLeitura {
  rpc(nome: string, args: Record<string, unknown>): PromiseLike<Resultado>;
  from(tabela: string): { select(colunas: string, opcoes?: { count: "exact" }): BuscaLeitura };
}
/** O pedaço do ContextoPessoa (_shared/porta-pessoa.ts) que o módulo usa. */
export interface ContextoLeitura {
  schema: "public" | "staging";
  corpo: Record<string, unknown>;
  /** quem chama (o user do token, conferido no Auth pela porta) — o dono das consultas "minhas" e do recorte da conta ativa */
  userId: string;
  comoPessoa: ClienteLeitura;
  log: Log;
  /** o orçamento do pedido (o da porta) — o laço para antes de cada leitura quando esgota */
  prazo?: { esgotado(): boolean };
}
export type RespostaDaLeitura = { ok: true; itens: RespostaDeItem[] } | { ok: false; erro: string };

export async function atenderLeitura(c: ContextoLeitura): Promise<RespostaDaLeitura> {
  const inicio = Date.now();
  const pedido = lerPedidoDeLeitura(c.corpo, CONSULTAS_FINANCEIRO);
  if (pedido.ok === false) {
    c.log.aviso({ codigo: pedido.erro, schema: c.schema, acao: "ler" });
    return { ok: false, erro: pedido.erro };
  }
  for (const item of pedido.itens) {
    if (item.ok === false) c.log.aviso({ codigo: item.erro, schema: c.schema, acao: item.q ?? "ler", resultado: item.campo ?? null });
  }
  const itens = await rodarLote(pedido.itens, (item) => executar(c, item), { aoFalhar: (e, item) => falhou(c, item.q, e) });
  const falhas = itens.filter((i) => i.ok === false).length;
  c.log.info({
    codigo: "leitura", schema: c.schema, acao: "ler", n: itens.length, ms: Date.now() - inicio,
    resultado: falhas === 0 ? "ok" : falhas === itens.length ? "falhou" : "parcial",
  });
  return { ok: true, itens };
}

async function executar(c: ContextoLeitura, item: ItemValido): Promise<RespostaDeItem> {
  const consulta = consultaDoFinanceiro(item.q);
  if (!consulta) return { ok: false, erro: "consulta_invalida" };
  const fonte = consulta.fonte;
  return ehRpc(fonte) ? await lerRpc(c, item, fonte) : await lerTabela(c, item, { ...consulta, fonte });
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * A RPC de leitura de hoje, como a pessoa. Os códigos de propósito (fonte.erros) voltam como o erro do item — pelo raise (o erroDaLeitura
 * com os conhecidos) e pelo valor { ok: false, erro: <código> } que as 3 RPCs da conta devolvem; o resto do valor volta como veio.
 */
async function lerRpc(c: ContextoLeitura, item: ItemValido, fonte: FonteRpc): Promise<RespostaDeItem> {
  const { data, error } = await c.comoPessoa.rpc(fonte.rpc, argsDaRpc(fonte, item.params));
  if (error) return falhou(c, item.q, error, fonte.erros);
  const valor: unknown = data ?? null;
  if (fonte.erros && ehObjeto(valor) && valor.ok === false && typeof valor.erro === "string" && fonte.erros.includes(valor.erro)) {
    c.log.aviso({ codigo: valor.erro, schema: c.schema, acao: item.q });
    return { ok: false, erro: valor.erro };
  }
  return { ok: true, valor };
}

/** Um filtro do plano no encadeamento do supabase-js (o mesmo do módulo da nutricao). */
function aplicarFiltro(busca: BuscaLeitura, f: FiltroLeitura): BuscaLeitura {
  switch (f.op) {
    case "in":
      return busca.in(f.coluna, [...f.valor]);
    case "eq":
      return busca.eq(f.coluna, f.valor);
    case "is_null":
      return busca.is(f.coluna, null);
    case "gte":
      return busca.gte(f.coluna, f.valor);
    case "lte":
      return busca.lte(f.coluna, f.valor);
    case "lt":
      return busca.lt(f.coluna, f.valor);
    case "ilike":
      return busca.ilike(f.coluna, f.valor);
    case "ou":
      return f.tabela ? busca.or(f.filtro, { referencedTable: f.tabela }) : busca.or(f.filtro);
  }
}

/**
 * Os filtros da consulta: o plano do motor (as colunas fechadas, os filtros declarados, o dono = quem chama, as vivas, o recorte da conta
 * ativa com o user do token) + o "em aberto OU no período" das cobranças (montado com as 2 datas do corpo, já validadas pelo motor).
 */
export function filtrosDaConsulta(consulta: ConsultaFinanceiro & { fonte: FonteTabela }, params: Record<string, unknown>, userId: string) {
  const plano = planoDaTabela(consulta as ConsultaLeitura & { fonte: FonteTabela }, params, userId);
  const ou = consulta.emAbertoOuNoPeriodo ? filtroEmAbertoOuNoPeriodo(consulta.emAbertoOuNoPeriodo, params) : null;
  return ou === null ? plano : { ...plano, filtros: [...plano.filtros, { op: "ou", filtro: ou } as FiltroLeitura] };
}

/** O select da tabela montado no servidor (colunas fechadas, filtros declarados, dono = quem chama), como a pessoa. */
async function lerTabela(c: ContextoLeitura, item: ItemValido, consulta: ConsultaFinanceiro & { fonte: FonteTabela }): Promise<RespostaDeItem> {
  const plano = filtrosDaConsulta(consulta, item.params, c.userId);
  const extras = extrasDaTabela(consulta.fonte, item.params);
  const limites = limitesDosEmbutidos(consulta.fonte);
  /** a busca de 1 ida (o builder do supabase-js é de 1 uso só: o laço monta uma por leitura) */
  const montar = () => {
    let busca = extras.contar ? c.comoPessoa.from(plano.tabela).select(plano.colunas, { count: "exact" }) : c.comoPessoa.from(plano.tabela).select(plano.colunas);
    for (const f of plano.filtros) busca = aplicarFiltro(busca, f);
    for (const l of limites) busca = busca.limit(l.n, { referencedTable: l.tabela });
    for (const o of plano.ordem) busca = busca.order(o.coluna, { ascending: o.asc });
    return busca;
  };
  if (extras.laco) return await lerEmLaco(c, item.q, montar, extras.laco);
  const { data, error, count } = await (extras.intervalo ? montar().range(extras.intervalo[0], extras.intervalo[1]) : montar().limit(plano.teto));
  // na consulta COM página, a página além do fim (PGRST103) = dados_invalidos, sem log.excecao; nas outras, como sempre
  if (error) return falhou(c, item.q, error, [], { pagina: extras.intervalo !== null });
  const linhas: unknown[] = Array.isArray(data) ? data : [];
  if (extras.uma && linhas.length === 0) return { ok: false, erro: "nao_encontrado" };
  // o total da página (com os mesmos filtros) — sem a contagem, o pedido falhou (a lib de hoje também recusava: paginar)
  if (extras.contar && typeof count !== "number") return falhou(c, item.q, { code: "", message: "sem a contagem" });
  return extras.contar ? { ok: true, linhas, total: count as number } : { ok: true, linhas };
}

/**
 * O laço (FonteTabela.laco): TODAS as linhas, em leituras de `tamanho` com a ordem estável do catálogo, até a que vem com menos (a última);
 * passou de `leituras` → muitas_linhas (a lib diz a frase de hoje); o prazo do pedido esgotou antes de uma leitura → tempo_esgotado.
 */
async function lerEmLaco(
  c: ContextoLeitura,
  q: string,
  montar: () => BuscaLeitura,
  laco: { tamanho: number; leituras: number },
): Promise<RespostaDeItem> {
  const saida: unknown[] = [];
  for (let leitura = 1; leitura <= laco.leituras; leitura += 1) {
    if (c.prazo?.esgotado() === true) return falhou(c, q, { name: "TimeoutError", message: "TimeoutError: o prazo do pedido acabou no laço" });
    const [de, ate] = intervaloDaPagina(leitura, laco.tamanho);
    const { data, error } = await montar().range(de, ate);
    if (error) return falhou(c, q, error);
    const linhas: unknown[] = Array.isArray(data) ? data : [];
    saida.push(...linhas);
    if (linhas.length < laco.tamanho) return { ok: true, linhas: saida };
  }
  c.log.aviso({ codigo: ERRO_MUITAS_LINHAS, schema: c.schema, acao: q, n: laco.leituras });
  return { ok: false, erro: ERRO_MUITAS_LINHAS };
}

/**
 * O erro do banco (ou o que lançou) vira o código do item; o inesperado avisa o Weslley (log.excecao: só nome, código e mensagem limpa).
 * `conhecidos` = os códigos que a RPC levanta de propósito (aviso, não excecao); `opcoes.pagina` = a consulta com página.
 */
function falhou(c: ContextoLeitura, q: string, e: unknown, conhecidos: readonly string[] = [], opcoes: { pagina?: boolean } = {}): RespostaDeItem {
  const o = (e ?? {}) as { code?: unknown; message?: unknown; name?: unknown };
  const t = erroDaLeitura(o, conhecidos, opcoes);
  if (t.inesperado) c.log.excecao(e, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao: q, schema: c.schema });
  else c.log.aviso({ codigo: t.erro, schema: c.schema, acao: q, pg: typeof o.code === "string" ? o.code : null });
  return { ok: false, erro: t.erro };
}
