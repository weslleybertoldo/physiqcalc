// Physiq hml-20a (H-42 · jeito 2, etapa 2, 11/10/2026) — o módulo das LEITURAS da função nutricao: a ação `ler` (em lote). O motor
// (_shared/leitura-lote.ts) lê o pedido pelo catálogo (_shared/nutricao-leituras.ts) e roda os itens em paralelo (até 6), na ordem, com
// o erro de cada um isolado; aqui ficam os construtores, todos COMO A PESSOA (c.comoPessoa — o token de quem chama; nenhuma chave
// secreta): o RLS de hoje decide quem vê (outra conta → lista vazia, como hoje; decisão 6) e a função confere a forma.
//   RPC     .rpc(nome, args montados no servidor) → { ok: true, valor }
//   tabela  .from(t).select(<colunas fechadas>) + os filtros declarados + o dono (= quem chama) + as vivas + ordem + teto → { ok: true, linhas }
//   assinar só os caminhos que a PRÓPRIA consulta leu → createSignedUrls como a pessoa (a policy de leitura do bucket confere de novo),
//           no bucket do ambiente, com a validade de hoje (no teto do motor: validadeDaAssinatura) → `url` RELATIVA
//           (/storage/v1/object/sign/…) em cada linha/item; a tela monta com o domínio dela. Não deu para assinar → url null (a tela
//           mostra "Foto indisponível", como hoje) e um aviso no log.
// Log com campos fixos: 1 linha por pedido (acao "ler", n itens, ms, o desfecho) e 1 por item que falhou (o código e a q) — nunca os
// params, as linhas ou os caminhos.
// Este arquivo NÃO importa a porta (_shared/porta-pessoa.ts, que traz o supabase-js do esm.sh e o Deno): o contexto é o pedaço do
// ContextoPessoa que ele usa (ContextoLeitura, estrutural — o deno check confere no index.ts que o da porta encaixa). Assim o Vitest roda
// o módulo com um cliente falso (src/nutricao/leituraServidor.test.ts) e o tsc do app não puxa o Deno.
// hml-20b (Painel › Aluno): os campos opcionais do motor — RPC com os códigos que ela levanta de propósito (erros), tabela em página
// com o total (pagina + contar: .range + count exato), em laço até a última (laco: leituras de 1000 com a ordem estável, dentro do
// prazo do pedido), de 1 linha (uma: 0 → nao_encontrado) e a URL de 1 arquivo com o "baixar com o nome" (assinar.download:
// createSignedUrl como a pessoa, o nome = a coluna que a consulta leu). Sem esses campos (as 3 consultas da 20a), o caminho de antes.
// hml-20c (Dieta, Dietas, Pré-consulta e Dashboard): os campos opcionais novos — o período (gte/lte/lt), a busca por palavras (ilike), o
// recorte (.or() da conta ativa ou "TACO ou meus", com o user do token), os embutidos (select + as vivas e o limite deles), a faixa
// (offset + limite), o HEAD (soContar: só o total), o total de cada dia cortado pela página na MESMA ida (porDia), os ★ só do dono e da
// conta (filtrarLista) e a série RPC → linhas pelos ids na MESMA ida (linhasDosIds). Sem eles (as 30 da 20a/20b), o caminho de antes.
import {
  ERRO_MUITAS_LINHAS, argsDaRpc, assinaturaRelativa, caminhosParaAssinar, comUrls, comUrlsNaLista, ehRpc, erroDaLeitura, extrasDaTabela,
  intervaloDaPagina, itensDaLista, lerPedidoDeLeitura, nomeDoDownload, planoDaTabela, rodarLote, urlsAssinadas, validadeDaAssinatura,
  type AssinarLeitura, type ConsultaLeitura, type FonteRpc, type FonteTabela, type ItemValido, type RespostaDeItem,
  // hml-20c
  TETO_MAX, filtrarValorDaLista, idsDoValor, janelasDosDiasCortados, limitesDosEmbutidos, selectDoEmbutido, type FiltroLeitura,
} from "../_shared/leitura-lote.ts";
import type { Log } from "../_shared/log.ts";
import { CONSULTAS_NUTRICAO, bucketDaLeitura, consultaDaNutricao } from "../_shared/nutricao-leituras.ts";

type Resultado = { data: unknown; error: unknown; count?: number | null };
/** O encadeamento do select que o módulo usa (o PostgrestFilterBuilder do supabase-js encaixa). */
interface BuscaLeitura extends PromiseLike<Resultado> {
  in(coluna: string, valores: readonly unknown[]): BuscaLeitura;
  eq(coluna: string, valor: unknown): BuscaLeitura;
  is(coluna: string, valor: null): BuscaLeitura;
  order(coluna: string, opcoes: { ascending: boolean }): BuscaLeitura;
  /** hml-20c: o limite de um embutido (referencedTable) */
  limit(n: number, opcoes?: { referencedTable: string }): BuscaLeitura;
  /** hml-20b: a página (pagina e laco) */
  range(de: number, ate: number): BuscaLeitura;
  /** hml-20c: o período, a busca por palavras e o recorte (.or(), também no embutido) */
  gte(coluna: string, valor: unknown): BuscaLeitura;
  lte(coluna: string, valor: unknown): BuscaLeitura;
  lt(coluna: string, valor: unknown): BuscaLeitura;
  ilike(coluna: string, padrao: string): BuscaLeitura;
  or(filtros: string, opcoes?: { referencedTable: string }): BuscaLeitura;
}
/** O pedaço do cliente "como a pessoa" que o módulo usa (o SupabaseClient da porta encaixa). */
export interface ClienteLeitura {
  rpc(nome: string, args: Record<string, unknown>): PromiseLike<Resultado>;
  /** hml-20b: o count exato (contar); hml-20c: o HEAD (head: só o total) */
  from(tabela: string): { select(colunas: string, opcoes?: { count: "exact"; head?: boolean }): BuscaLeitura };
  storage: {
    from(bucket: string): {
      createSignedUrls(caminhos: string[], validade: number): PromiseLike<Resultado>;
      /** hml-20b: 1 arquivo, com o "baixar com o nome" (assinar.download) */
      createSignedUrl(caminho: string, validade: number, opcoes?: { download: string }): PromiseLike<Resultado>;
    };
  };
}
/** O pedaço do ContextoPessoa (_shared/porta-pessoa.ts) que o módulo usa. */
export interface ContextoLeitura {
  schema: "public" | "staging";
  corpo: Record<string, unknown>;
  /** quem chama (o user do token, conferido no Auth pela porta) — o dono das consultas "minhas" */
  userId: string;
  comoPessoa: ClienteLeitura;
  log: Log;
  /** hml-20b: o orçamento do pedido (o da porta) — o laço para antes de cada leitura quando esgota */
  prazo?: { esgotado(): boolean };
}
export type RespostaDaLeitura = { ok: true; itens: RespostaDeItem[] } | { ok: false; erro: string };

export async function atenderLeitura(c: ContextoLeitura): Promise<RespostaDaLeitura> {
  const inicio = Date.now();
  const pedido = lerPedidoDeLeitura(c.corpo, CONSULTAS_NUTRICAO);
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
  const consulta = consultaDaNutricao(item.q);
  if (!consulta) return { ok: false, erro: "consulta_invalida" };
  const fonte = consulta.fonte;
  return ehRpc(fonte) ? await lerRpc(c, item, consulta, fonte) : await lerTabela(c, item, { ...consulta, fonte });
}

/** A RPC de leitura de hoje, como a pessoa; com `assinar`, as URLs da lista do valor na MESMA ida. */
async function lerRpc(c: ContextoLeitura, item: ItemValido, consulta: ConsultaLeitura, fonte: FonteRpc): Promise<RespostaDeItem> {
  const { data, error } = await c.comoPessoa.rpc(fonte.rpc, argsDaRpc(fonte, item.params));
  // hml-20b: o código que a RPC levanta de propósito (fonte.erros) volta como ele (sem o log.excecao); sem a lista, a tabela de sempre
  if (error) return falhou(c, item.q, error, fonte.erros);
  // hml-20c (H-108): com o param do filtrarLista, só os itens do dono (quem chama) e da conta do param; sem ele, o valor de hoje
  const valor: unknown = fonte.filtrarLista ? filtrarValorDaLista(data ?? null, fonte.filtrarLista, item.params, c.userId) : data ?? null;
  // hml-20c: a série RPC → linhas pelos ids do valor, na MESMA ida
  if (fonte.linhasDosIds) return await lerLinhasDosIds(c, item.q, fonte.linhasDosIds, valor);
  const a = consulta.assinar;
  if (!a || !a.lista) return { ok: true, valor };
  const urls = await assinar(c, item.q, a, caminhosParaAssinar(itensDaLista(valor, a.lista), a.coluna));
  return { ok: true, valor: comUrlsNaLista(valor, a.lista, a.coluna, urls) };
}

/**
 * hml-20c (FonteRpc.linhasDosIds): os ids que a RPC devolveu relidos na tabela COMO A PESSOA (as colunas e os embutidos fechados, as
 * vivas) — a página de receitas (a RPC → .in(ids)) numa ida só. Nenhum id → linhas vazias, sem ida ao banco; o erro → o código do item.
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

/** Um filtro do plano no encadeamento do supabase-js (hml-20c: + o período, o ilike e o .or() — também no recurso embutido). */
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

/** O select da tabela montado no servidor (colunas fechadas, filtros declarados, dono = quem chama), como a pessoa. */
async function lerTabela(c: ContextoLeitura, item: ItemValido, consulta: ConsultaLeitura & { fonte: FonteTabela }): Promise<RespostaDeItem> {
  const plano = planoDaTabela(consulta, item.params, c.userId);
  const extras = extrasDaTabela(consulta.fonte, item.params);
  // hml-20c: o limite de cada embutido (vazio nas consultas sem embutido com limite — as da 20a/20b)
  const limites = limitesDosEmbutidos(consulta.fonte);
  /** a busca de 1 ida (o builder do supabase-js é de 1 uso só: o laço monta uma por leitura) */
  const montar = () => {
    let busca = extras.contar ? c.comoPessoa.from(plano.tabela).select(plano.colunas, { count: "exact" }) : c.comoPessoa.from(plano.tabela).select(plano.colunas);
    for (const f of plano.filtros) busca = aplicarFiltro(busca, f);
    for (const l of limites) busca = busca.limit(l.n, { referencedTable: l.tabela });
    for (const o of plano.ordem) busca = busca.order(o.coluna, { ascending: o.asc });
    return busca;
  };
  // hml-20c (soContar): o HEAD — só o total, com os mesmos filtros (sem ordem nem limite, como o select head de hoje)
  if (consulta.fonte.soContar === true) return await contarLinhas(c, item.q, plano.tabela, plano.colunas, plano.filtros);
  if (extras.laco) return await lerEmLaco(c, item.q, montar, extras.laco);
  const { data, error, count } = await (extras.intervalo ? montar().range(extras.intervalo[0], extras.intervalo[1]) : montar().limit(plano.teto));
  // hml-20b (revisão): na consulta COM página, a página além do fim (PGRST103) = dados_invalidos, sem log.excecao; nas outras, como sempre
  if (error) return falhou(c, item.q, error, [], { pagina: extras.intervalo !== null });
  const linhas: unknown[] = Array.isArray(data) ? data : [];
  // hml-20b: a consulta de 1 linha que não achou (outra conta, ou já excluída) → nao_encontrado, como hoje (a tela tratava o vazio)
  if (extras.uma && linhas.length === 0) return { ok: false, erro: "nao_encontrado" };
  // hml-20b: o total da lista (com os mesmos filtros) — sem a contagem, o pedido falhou (a lib de hoje também recusava: paginar)
  if (extras.contar && typeof count !== "number") return falhou(c, item.q, { code: "", message: "sem a contagem" });
  const total = extras.contar ? { total: count as number } : {};
  // hml-20c (porDia): o total de cada dia que a página partiu ao meio, na MESMA ida (a série página → HEAD do dia de hoje)
  const pd = consulta.fonte.porDia;
  if (pd && consulta.fonte.pagina && extras.contar) {
    const dias = item.params[pd.dias];
    const janelas = janelasDosDiasCortados(
      linhas, pd.coluna, Number(item.params[consulta.fonte.pagina.param] ?? 1), consulta.fonte.pagina.tamanho, count as number,
      Array.isArray(dias) ? (dias as string[]) : [], String(item.params[pd.de] ?? ""),
    );
    const porDia: Array<{ dia: string; total: number }> = [];
    for (const j of janelas) {
      // o prazo do pedido esgotou antes de contar o dia → tempo_esgotado, sem contar mais (como o laço das páginas — o lerEmLaco)
      if (c.prazo?.esgotado() === true) return falhou(c, item.q, { name: "TimeoutError", message: "TimeoutError: o prazo do pedido acabou no total por dia" });
      // os mesmos filtros, com o início do período trocado pelo início do dia e o fim do dia (lt) — a contagem que a tela fazia
      const filtros: FiltroLeitura[] = [
        ...plano.filtros.map((f) => (f.op === "gte" && f.coluna === pd.coluna ? { ...f, valor: j.de } : f)),
        { op: "lt", coluna: pd.coluna, valor: j.ate },
      ];
      const r = await contarLinhas(c, item.q, plano.tabela, plano.colunas, filtros);
      if (r.ok === false) return r;
      porDia.push({ dia: j.dia, total: r.total as number });
    }
    // hml-20c (com_urls): a página com as miniaturas na MESMA ida, quando pedidas
    return { ok: true, linhas: await assinarSePedido(c, item, consulta.assinar, linhas), ...total, valor: { por_dia: porDia } };
  }
  const a = consulta.assinar;
  if (!a || a.lista) return { ok: true, linhas, ...total };
  if (a.download) return { ok: true, linhas: await assinarCadaUma(c, item, a, linhas), ...total };
  return { ok: true, linhas: await assinarSePedido(c, item, a, linhas), ...total };
}

/**
 * hml-20c: as URLs das linhas que a PRÓPRIA consulta leu (createSignedUrls como a pessoa, no bucket do ambiente) — a assinatura de sempre
 * (sem `se`) e a opcional (com `se`: só com o param booleano dele = true no item — o com_urls da lista do Diário e do "Diário de hoje";
 * sem ele, as linhas voltam como vieram, sem URL e sem ir ao Storage).
 */
async function assinarSePedido(c: ContextoLeitura, item: ItemValido, a: AssinarLeitura | undefined, linhas: unknown[]): Promise<unknown[]> {
  if (!a || a.lista || a.download || (a.se !== undefined && item.params[a.se] !== true)) return linhas;
  const urls = await assinar(c, item.q, a, caminhosParaAssinar(linhas, a.coluna));
  return comUrls(linhas, a.coluna, urls);
}

/**
 * hml-20c (soContar e porDia): o HEAD — select(colunas, { count: "exact", head: true }) com os filtros do plano, como a pessoa: só o
 * total (o "Só não reagidas (N)", o contador do menu, o registro do dia, o total de um dia cortado). Sem a contagem → erro_interno.
 */
async function contarLinhas(c: ContextoLeitura, q: string, tabela: string, colunas: string, filtros: readonly FiltroLeitura[]): Promise<RespostaDeItem> {
  let busca = c.comoPessoa.from(tabela).select(colunas, { count: "exact", head: true });
  for (const f of filtros) busca = aplicarFiltro(busca, f);
  const { error, count } = await busca;
  if (error) return falhou(c, q, error);
  if (typeof count !== "number") return falhou(c, q, { code: "", message: "sem a contagem" });
  return { ok: true, total: count };
}

/**
 * hml-20b (FonteTabela.laco): TODAS as linhas, em leituras de `tamanho` com a ordem estável do catálogo, até a que vem com menos (a
 * última); passou de `leituras` → muitas_linhas (a lib de hoje lançava "… demais para ler de uma vez"); o prazo do pedido esgotou antes
 * de uma leitura → tempo_esgotado (com o aviso, como o TimeoutError de uma ida).
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
 * hml-20b (assinar.download): 1 URL por linha (createSignedUrl como a pessoa), só do caminho que a consulta leu, no bucket do ambiente —
 * com o param do baixar = true, o "baixar com o nome" (a coluna do nome da linha) e o prazo do baixar; sem ele, o prazo do ver. Não deu
 * para assinar → url null (a tela mostra o erro dela) e um aviso no log (sem o caminho).
 */
async function assinarCadaUma(c: ContextoLeitura, item: ItemValido, a: AssinarLeitura, linhas: unknown[]): Promise<unknown[]> {
  const bucket = bucketDaLeitura(a.bucket, c.schema);
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
async function assinar(c: ContextoLeitura, q: string, a: AssinarLeitura, caminhos: string[]): Promise<Map<string, string>> {
  if (!caminhos.length) return new Map();
  const bucket = bucketDaLeitura(a.bucket, c.schema);
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
 * O erro do banco (ou o que lançou) vira o código do item; o inesperado avisa o Weslley (log.excecao: só nome, código e mensagem limpa).
 * hml-20b: `conhecidos` = os códigos que a RPC levanta de propósito (FonteRpc.erros) — voltam como eles, com o log.aviso (não o excecao);
 * `opcoes.pagina` = a consulta com página (a página além do fim → dados_invalidos, com o log.aviso).
 */
function falhou(c: ContextoLeitura, q: string, e: unknown, conhecidos: readonly string[] = [], opcoes: { pagina?: boolean } = {}): RespostaDeItem {
  const o = (e ?? {}) as { code?: unknown; message?: unknown; name?: unknown };
  const t = erroDaLeitura(o, conhecidos, opcoes);
  if (t.inesperado) c.log.excecao(e, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao: q, schema: c.schema });
  else c.log.aviso({ codigo: t.erro, schema: c.schema, acao: q, pg: typeof o.code === "string" ? o.code : null });
  return { ok: false, erro: t.erro };
}
