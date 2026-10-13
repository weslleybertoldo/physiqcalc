// Physiq hml-21a (H-112 · jeito 2, etapa 3, 12/10/2026) — o MOTOR COMUM das leituras pelo servidor: a ação `ler` (em lote) de qualquer
// função do jeito 2, com o CATÁLOGO como parâmetro. É o que hoje está repetido em functions/nutricao/leituras.ts (hml-20a–20c) e em
// functions/financeiro/leituras.ts (hml-20d): os tipos do cliente e do contexto, o atenderLeitura, o aplicarFiltro, o laço, o HEAD, a
// assinatura das URLs e a tradução do erro — juntos aqui, sem mudar nada do que cada um faz. A função `conta` (hml-21a) usa; a nutricao e a
// financeiro migram na hml-21c (republicadas pelos Modelos) — até lá ficam 3 cópias (as 2 de hoje + esta: DUPLICAÇÃO anotada no progresso
// da hml-21a). O src/integrations/leituraServidor.test.ts roda ESTE motor com o catálogo da nutricao e o da financeiro, lado a lado com os
// 2 módulos de hoje, e confere que o pedido ao banco, a resposta e o log são os mesmos.
//   · o pedido { acao: "ler", itens: [{ q, ...params }] } é lido pelo motor puro (_shared/leitura-lote.ts) com o catálogo da função; os
//     itens rodam em paralelo (até 6), na ordem do pedido, com o erro de cada um isolado e os iguais 1 vez só;
//   · tudo COMO A PESSOA (c.comoPessoa — o token de quem chama; nenhuma chave secreta): o RLS e as RPCs de hoje decidem quem vê (outra conta
//     → lista vazia / nao_encontrado / o código da RPC, como hoje) e o motor confere a forma;
//   · RPC     .rpc(nome, args montados no servidor) → { ok: true, valor } (+ os ★ do dono, a série RPC → linhas e as URLs da lista);
//   · tabela  .from(t).select(<colunas fechadas>) + os filtros declarados + o dono (= quem chama) + as vivas + o recorte + ordem + teto
//             (+ página com o total, laço, 1 linha, HEAD, total por dia e as URLs das linhas que a PRÓPRIA consulta leu).
// O que muda de um catálogo para outro vem no CatalogoDoServidor: o bucket do ambiente (a nutricao tem os seus), os filtros a mais montados
// com os params já lidos (o "em aberto OU no período" das cobranças do Financeiro) e se o { ok: false, erro } de propósito de uma RPC vira
// o erro do item (o Financeiro). Sem eles, o caminho da nutricao.
// Log com campos fixos: 1 linha por pedido (acao "ler", n itens, ms, o desfecho) e 1 por item que falhou (o código e a q) — nunca os
// params, as linhas, os nomes ou os caminhos.
// Este arquivo NÃO importa a porta (_shared/porta-pessoa.ts traz o supabase-js do esm.sh e o Deno): o contexto é estrutural
// (ContextoLeitura — o deno check confere no index.ts de cada função que o ContextoPessoa encaixa). Assim o Vitest roda o motor com um
// cliente falso e o tsc do app não puxa o Deno.
import {
  ERRO_MUITAS_LINHAS, TETO_MAX, argsDaRpc, assinaturaRelativa, caminhosParaAssinar, comUrls, comUrlsNaLista, ehRpc, erroDaLeitura,
  extrasDaTabela, filtrarValorDaLista, idsDoValor, intervaloDaPagina, itensDaLista, janelasDosDiasCortados, lerPedidoDeLeitura,
  limitesDosEmbutidos, nomeDoDownload, planoDaTabela, rodarLote, selectDoEmbutido, urlsAssinadas, validadeDaAssinatura,
  type AssinarLeitura, type CatalogoLeitura, type ConsultaLeitura, type FiltroLeitura, type FonteRpc, type FonteTabela, type ItemValido,
  type RespostaDeItem,
} from "./leitura-lote.ts";
import type { Log } from "./log.ts";

type Resultado = { data: unknown; error: unknown; count?: number | null };
/** O encadeamento do select que o motor usa (o PostgrestFilterBuilder do supabase-js encaixa). */
export interface BuscaLeitura extends PromiseLike<Resultado> {
  in(coluna: string, valores: readonly unknown[]): BuscaLeitura;
  eq(coluna: string, valor: unknown): BuscaLeitura;
  is(coluna: string, valor: null): BuscaLeitura;
  order(coluna: string, opcoes: { ascending: boolean }): BuscaLeitura;
  /** o limite da lista ou de um embutido (referencedTable) */
  limit(n: number, opcoes?: { referencedTable: string }): BuscaLeitura;
  /** a página (pagina, faixa e laco) */
  range(de: number, ate: number): BuscaLeitura;
  /** o período, a busca por palavras e o recorte (.or(), também no embutido) */
  gte(coluna: string, valor: unknown): BuscaLeitura;
  lte(coluna: string, valor: unknown): BuscaLeitura;
  lt(coluna: string, valor: unknown): BuscaLeitura;
  ilike(coluna: string, padrao: string): BuscaLeitura;
  or(filtros: string, opcoes?: { referencedTable: string }): BuscaLeitura;
}
/** O pedaço do cliente "como a pessoa" que o motor usa (o SupabaseClient da porta encaixa). */
export interface ClienteLeitura {
  rpc(nome: string, args: Record<string, unknown>): PromiseLike<Resultado>;
  /** o count exato (contar) e o HEAD (head: só o total) */
  from(tabela: string): { select(colunas: string, opcoes?: { count: "exact"; head?: boolean }): BuscaLeitura };
  storage: {
    from(bucket: string): {
      createSignedUrls(caminhos: string[], validade: number): PromiseLike<Resultado>;
      /** 1 arquivo, com o "baixar com o nome" (assinar.download) */
      createSignedUrl(caminho: string, validade: number, opcoes?: { download: string }): PromiseLike<Resultado>;
    };
  };
}
/** O pedaço do ContextoPessoa (_shared/porta-pessoa.ts) que o motor usa. */
export interface ContextoLeitura {
  schema: "public" | "staging";
  corpo: Record<string, unknown>;
  /** quem chama (o user do token, conferido pela porta) — o dono das consultas "minhas" e do recorte da conta ativa */
  userId: string;
  comoPessoa: ClienteLeitura;
  log: Log;
  /** o orçamento do pedido (o da porta) — o laço e o total por dia param antes de cada leitura quando esgota */
  prazo?: { esgotado(): boolean };
}
export type RespostaDaLeitura = { ok: true; itens: RespostaDeItem[] } | { ok: false; erro: string };

/** O que a função passa ao motor: o catálogo dela e o que muda de uma função para outra (tudo opcional, menos as consultas). */
export interface CatalogoDoServidor {
  /** a lista fechada de consultas (a `q` de fora dela → consulta_invalida) */
  consultas: CatalogoLeitura;
  /** o bucket do ambiente de uma consulta que assina URL (sem ele: o nome de produção, com "-staging" no staging) */
  bucketDaLeitura?: (bucket: string, schema: "public" | "staging") => string;
  /**
   * os filtros a mais de uma consulta de tabela, montados com os params JÁ LIDOS pelo motor (nunca o corpo cru) — vão no fim dos do plano
   * (o "em aberto OU vence no período" das cobranças do Financeiro); sem filtro a mais, a lista vazia
   */
  filtrosExtras?: (consulta: ConsultaLeitura, params: Record<string, unknown>, userId: string) => FiltroLeitura[];
  /**
   * o { ok: false, erro } que a RPC devolve DE PROPÓSITO (o erro em fonte.erros) vira o erro do item, com o aviso no log (as 3 RPCs da conta
   * no Financeiro); sem isto, o valor volta como veio (a tela confere, como hoje)
   */
  erroNoValorDaRpc?: boolean;
}

/** O bucket do ambiente quando o catálogo não diz: o "-staging" no staging (o padrão dos buckets do principal desde a hml-02b). */
export const bucketPadrao = (bucket: string, schema: "public" | "staging"): string => (schema === "staging" ? `${bucket}-staging` : bucket);

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A consulta do catálogo (só as chaves próprias: __proto__, constructor… não são consultas). */
function consultaDoCatalogo(catalogo: CatalogoDoServidor, q: string): ConsultaLeitura | null {
  return Object.prototype.hasOwnProperty.call(catalogo.consultas, q) ? catalogo.consultas[q] : null;
}

/** A ação `ler`: o pedido lido pelo catálogo, os itens rodados como a pessoa, 1 linha de log por pedido. */
export async function atenderLeitura(c: ContextoLeitura, catalogo: CatalogoDoServidor): Promise<RespostaDaLeitura> {
  const inicio = Date.now();
  const pedido = lerPedidoDeLeitura(c.corpo, catalogo.consultas);
  if (pedido.ok === false) {
    c.log.aviso({ codigo: pedido.erro, schema: c.schema, acao: "ler" });
    return { ok: false, erro: pedido.erro };
  }
  for (const item of pedido.itens) {
    if (item.ok === false) c.log.aviso({ codigo: item.erro, schema: c.schema, acao: item.q ?? "ler", resultado: item.campo ?? null });
  }
  const itens = await rodarLote(pedido.itens, (item) => executar(c, catalogo, item), { aoFalhar: (e, item) => falhou(c, item.q, e) });
  const falhas = itens.filter((i) => i.ok === false).length;
  c.log.info({
    codigo: "leitura", schema: c.schema, acao: "ler", n: itens.length, ms: Date.now() - inicio,
    resultado: falhas === 0 ? "ok" : falhas === itens.length ? "falhou" : "parcial",
  });
  return { ok: true, itens };
}

async function executar(c: ContextoLeitura, catalogo: CatalogoDoServidor, item: ItemValido): Promise<RespostaDeItem> {
  const consulta = consultaDoCatalogo(catalogo, item.q);
  if (!consulta) return { ok: false, erro: "consulta_invalida" };
  const fonte = consulta.fonte;
  return ehRpc(fonte) ? await lerRpc(c, catalogo, item, consulta, fonte) : await lerTabela(c, catalogo, item, { ...consulta, fonte });
}

/**
 * A RPC de leitura de hoje, como a pessoa: o código que ela levanta de propósito (fonte.erros) volta como ele (sem o log.excecao); os ★
 * do dono (filtrarLista); com `erroNoValorDaRpc`, o { ok: false, erro } de propósito vira o erro do item; a série RPC → linhas na MESMA
 * ida (linhasDosIds); e as URLs da lista do valor (assinar.lista).
 */
async function lerRpc(c: ContextoLeitura, catalogo: CatalogoDoServidor, item: ItemValido, consulta: ConsultaLeitura, fonte: FonteRpc): Promise<RespostaDeItem> {
  const { data, error } = await c.comoPessoa.rpc(fonte.rpc, argsDaRpc(fonte, item.params));
  if (error) return falhou(c, item.q, error, fonte.erros);
  const valor: unknown = fonte.filtrarLista ? filtrarValorDaLista(data ?? null, fonte.filtrarLista, item.params, c.userId) : data ?? null;
  if (
    catalogo.erroNoValorDaRpc === true && fonte.erros && ehObjeto(valor) && valor.ok === false && typeof valor.erro === "string" &&
    fonte.erros.includes(valor.erro)
  ) {
    c.log.aviso({ codigo: valor.erro, schema: c.schema, acao: item.q });
    return { ok: false, erro: valor.erro };
  }
  if (fonte.linhasDosIds) return await lerLinhasDosIds(c, item.q, fonte.linhasDosIds, valor);
  const a = consulta.assinar;
  if (!a || !a.lista) return { ok: true, valor };
  const urls = await assinar(c, catalogo, item.q, a, caminhosParaAssinar(itensDaLista(valor, a.lista), a.coluna));
  return { ok: true, valor: comUrlsNaLista(valor, a.lista, a.coluna, urls) };
}

/**
 * FonteRpc.linhasDosIds: os ids que a RPC devolveu relidos na tabela COMO A PESSOA (as colunas e os embutidos fechados, as vivas) — numa ida
 * só. Nenhum id → linhas vazias, sem ida ao banco; o erro → o código do item.
 */
async function lerLinhasDosIds(
  c: ContextoLeitura,
  q: string,
  l: NonNullable<FonteRpc["linhasDosIds"]>,
  valor: unknown,
): Promise<RespostaDeItem> {
  const ids = idsDoValor(valor, l.lista, l.max);
  if (!ids.length) return { ok: true, valor, linhas: [] };
  const colunas = [...l.colunas, ...(l.embutidos ?? []).map(selectDoEmbutido)].join(", ");
  let busca = c.comoPessoa.from(l.tabela).select(colunas).in("id", ids);
  if (l.vivas) busca = busca.is("deleted_at", null);
  const { data, error } = await busca.limit(Math.min(ids.length, TETO_MAX));
  if (error) return falhou(c, q, error);
  return { ok: true, valor, linhas: Array.isArray(data) ? data : [] };
}

/** Um filtro do plano no encadeamento do supabase-js (o período, o ilike e o .or() — também no recurso embutido). */
export function aplicarFiltro(busca: BuscaLeitura, f: FiltroLeitura): BuscaLeitura {
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

/** O plano da tabela (planoDaTabela do motor puro: o dono = quem chama) + os filtros a mais do catálogo, no fim. */
function planoComExtras(catalogo: CatalogoDoServidor, consulta: ConsultaLeitura & { fonte: FonteTabela }, params: Record<string, unknown>, userId: string) {
  const plano = planoDaTabela(consulta, params, userId);
  const mais = catalogo.filtrosExtras ? catalogo.filtrosExtras(consulta, params, userId) : [];
  return mais.length ? { ...plano, filtros: [...plano.filtros, ...mais] } : plano;
}

/** O select da tabela montado no servidor (colunas fechadas, filtros declarados, dono = quem chama), como a pessoa. */
async function lerTabela(
  c: ContextoLeitura,
  catalogo: CatalogoDoServidor,
  item: ItemValido,
  consulta: ConsultaLeitura & { fonte: FonteTabela },
): Promise<RespostaDeItem> {
  const plano = planoComExtras(catalogo, consulta, item.params, c.userId);
  const extras = extrasDaTabela(consulta.fonte, item.params);
  // o limite de cada embutido (vazio nas consultas sem embutido com limite)
  const limites = limitesDosEmbutidos(consulta.fonte);
  /** a busca de 1 ida (o builder do supabase-js é de 1 uso só: o laço monta uma por leitura) */
  const montar = () => {
    let busca = extras.contar ? c.comoPessoa.from(plano.tabela).select(plano.colunas, { count: "exact" }) : c.comoPessoa.from(plano.tabela).select(plano.colunas);
    for (const f of plano.filtros) busca = aplicarFiltro(busca, f);
    for (const l of limites) busca = busca.limit(l.n, { referencedTable: l.tabela });
    for (const o of plano.ordem) busca = busca.order(o.coluna, { ascending: o.asc });
    return busca;
  };
  // soContar: o HEAD — só o total, com os mesmos filtros (sem ordem nem limite)
  if (consulta.fonte.soContar === true) return await contarLinhas(c, item.q, plano.tabela, plano.colunas, plano.filtros);
  if (extras.laco) return await lerEmLaco(c, item.q, montar, extras.laco);
  const { data, error, count } = await (extras.intervalo ? montar().range(extras.intervalo[0], extras.intervalo[1]) : montar().limit(plano.teto));
  // na consulta COM página, a página além do fim (PGRST103) = dados_invalidos, sem log.excecao; nas outras, como sempre
  if (error) return falhou(c, item.q, error, [], { pagina: extras.intervalo !== null });
  const linhas: unknown[] = Array.isArray(data) ? data : [];
  // a consulta de 1 linha que não achou (outra conta, ou já excluída) → nao_encontrado
  if (extras.uma && linhas.length === 0) return { ok: false, erro: "nao_encontrado" };
  // o total da lista (com os mesmos filtros) — sem a contagem, o pedido falhou
  if (extras.contar && typeof count !== "number") return falhou(c, item.q, { code: "", message: "sem a contagem" });
  const total = extras.contar ? { total: count as number } : {};
  // porDia: o total de cada dia que a página partiu ao meio, na MESMA ida
  const pd = consulta.fonte.porDia;
  if (pd && consulta.fonte.pagina && extras.contar) {
    const dias = item.params[pd.dias];
    const janelas = janelasDosDiasCortados(
      linhas, pd.coluna, Number(item.params[consulta.fonte.pagina.param] ?? 1), consulta.fonte.pagina.tamanho, count as number,
      Array.isArray(dias) ? (dias as string[]) : [], String(item.params[pd.de] ?? ""),
    );
    const porDia: Array<{ dia: string; total: number }> = [];
    for (const j of janelas) {
      // o prazo do pedido esgotou antes de contar o dia → tempo_esgotado, sem contar mais (como o laço das páginas)
      if (c.prazo?.esgotado() === true) return falhou(c, item.q, { name: "TimeoutError", message: "TimeoutError: o prazo do pedido acabou no total por dia" });
      // os mesmos filtros, com o início do período trocado pelo início do dia e o fim do dia (lt)
      const filtros: FiltroLeitura[] = [
        ...plano.filtros.map((f) => (f.op === "gte" && f.coluna === pd.coluna ? { ...f, valor: j.de } : f)),
        { op: "lt", coluna: pd.coluna, valor: j.ate },
      ];
      const r = await contarLinhas(c, item.q, plano.tabela, plano.colunas, filtros);
      if (r.ok === false) return r;
      porDia.push({ dia: j.dia, total: r.total as number });
    }
    // com_urls: a página com as miniaturas na MESMA ida, quando pedidas
    return { ok: true, linhas: await assinarSePedido(c, catalogo, item, consulta.assinar, linhas), ...total, valor: { por_dia: porDia } };
  }
  const a = consulta.assinar;
  if (!a || a.lista) return { ok: true, linhas, ...total };
  if (a.download) return { ok: true, linhas: await assinarCadaUma(c, catalogo, item, a, linhas), ...total };
  return { ok: true, linhas: await assinarSePedido(c, catalogo, item, a, linhas), ...total };
}

/**
 * As URLs das linhas que a PRÓPRIA consulta leu (createSignedUrls como a pessoa, no bucket do ambiente) — a assinatura de sempre (sem `se`)
 * e a opcional (com `se`: só com o param booleano dele = true no item; sem ele, as linhas voltam como vieram, sem ir ao Storage).
 */
async function assinarSePedido(
  c: ContextoLeitura,
  catalogo: CatalogoDoServidor,
  item: ItemValido,
  a: AssinarLeitura | undefined,
  linhas: unknown[],
): Promise<unknown[]> {
  if (!a || a.lista || a.download || (a.se !== undefined && item.params[a.se] !== true)) return linhas;
  const urls = await assinar(c, catalogo, item.q, a, caminhosParaAssinar(linhas, a.coluna));
  return comUrls(linhas, a.coluna, urls);
}

/** O HEAD — select(colunas, { count: "exact", head: true }) com os filtros do plano, como a pessoa: só o total. Sem a contagem → erro_interno. */
async function contarLinhas(c: ContextoLeitura, q: string, tabela: string, colunas: string, filtros: readonly FiltroLeitura[]): Promise<RespostaDeItem> {
  let busca = c.comoPessoa.from(tabela).select(colunas, { count: "exact", head: true });
  for (const f of filtros) busca = aplicarFiltro(busca, f);
  const { error, count } = await busca;
  if (error) return falhou(c, q, error);
  if (typeof count !== "number") return falhou(c, q, { code: "", message: "sem a contagem" });
  return { ok: true, total: count };
}

/**
 * O laço (FonteTabela.laco): TODAS as linhas, em leituras de `tamanho` com a ordem estável do catálogo, até a que vem com menos (a última);
 * passou de `leituras` → muitas_linhas; o prazo do pedido esgotou antes de uma leitura → tempo_esgotado (com o aviso).
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
 * assinar.download: 1 URL por linha (createSignedUrl como a pessoa), só do caminho que a consulta leu, no bucket do ambiente — com o param
 * do baixar = true, o "baixar com o nome" (a coluna do nome da linha) e o prazo do baixar; sem ele, o prazo do ver. Não deu → url null.
 */
async function assinarCadaUma(c: ContextoLeitura, catalogo: CatalogoDoServidor, item: ItemValido, a: AssinarLeitura, linhas: unknown[]): Promise<unknown[]> {
  const bucket = (catalogo.bucketDaLeitura ?? bucketPadrao)(a.bucket, c.schema);
  const saida: unknown[] = [];
  for (const linha of linhas) {
    const [caminho] = caminhosParaAssinar([linha], a.coluna);
    if (!caminho) {
      saida.push(comUrls([linha], a.coluna, new Map())[0]);
      continue;
    }
    const nome = nomeDoDownload(a, item.params, linha);
    const validade = validadeDaAssinatura(nome !== null && a.download ? { validade: a.download.validade } : a);
    const { data, error } = await c.comoPessoa.storage.from(bucket).createSignedUrl(caminho, validade, nome !== null ? { download: nome } : undefined);
    const rel = error ? null : assinaturaRelativa((data as { signedUrl?: unknown } | null)?.signedUrl, bucket);
    if (!rel) {
      const o = (error ?? {}) as { status?: unknown; statusCode?: unknown };
      const status = typeof o.status === "number" ? o.status : Number(o.statusCode) || 0;
      c.log.aviso({ codigo: "assinar_falhou", schema: c.schema, acao: item.q, status, n: 1 });
    }
    saida.push(comUrls([linha], a.coluna, rel ? new Map([[caminho, rel]]) : new Map())[0]);
  }
  return saida;
}

/** Assina como a pessoa, em lote, SÓ os caminhos que a consulta leu; o que falhar fica sem URL (aviso no log, sem os caminhos). */
async function assinar(c: ContextoLeitura, catalogo: CatalogoDoServidor, q: string, a: AssinarLeitura, caminhos: string[]): Promise<Map<string, string>> {
  if (!caminhos.length) return new Map();
  const bucket = (catalogo.bucketDaLeitura ?? bucketPadrao)(a.bucket, c.schema);
  // a validade do catálogo no teto do motor (1 h): nenhum catálogo passa do prazo de hoje
  const { data, error } = await c.comoPessoa.storage.from(bucket).createSignedUrls(caminhos, validadeDaAssinatura(a));
  if (error || !data) {
    const o = (error ?? {}) as { status?: unknown; statusCode?: unknown };
    const status = typeof o.status === "number" ? o.status : Number(o.statusCode) || 0;
    c.log.aviso({ codigo: "assinar_falhou", schema: c.schema, acao: q, status, n: caminhos.length });
    return new Map();
  }
  const urls = urlsAssinadas(caminhos, data, bucket);
  if (urls.size < caminhos.length) c.log.aviso({ codigo: "assinar_parcial", schema: c.schema, acao: q, n: caminhos.length - urls.size });
  return urls;
}

/**
 * O erro do banco (ou o que lançou) vira o código do item; o inesperado avisa o Weslley (log.excecao: só nome, código e mensagem limpa — a
 * mensagem do banco NUNCA vai na resposta). `conhecidos` = os códigos que a RPC levanta de propósito (aviso, não excecao); `opcoes.pagina` =
 * a consulta com página (a página além do fim → dados_invalidos, com o aviso).
 */
function falhou(c: ContextoLeitura, q: string, e: unknown, conhecidos: readonly string[] = [], opcoes: { pagina?: boolean } = {}): RespostaDeItem {
  const o = (e ?? {}) as { code?: unknown; message?: unknown; name?: unknown };
  const t = erroDaLeitura(o, conhecidos, opcoes);
  if (t.inesperado) c.log.excecao(e, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao: q, schema: c.schema });
  else c.log.aviso({ codigo: t.erro, schema: c.schema, acao: q, pg: typeof o.code === "string" ? o.code : null });
  return { ok: false, erro: t.erro };
}
