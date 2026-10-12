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
import {
  ERRO_MUITAS_LINHAS, argsDaRpc, assinaturaRelativa, caminhosParaAssinar, comUrls, comUrlsNaLista, ehRpc, erroDaLeitura, extrasDaTabela,
  intervaloDaPagina, itensDaLista, lerPedidoDeLeitura, nomeDoDownload, planoDaTabela, rodarLote, urlsAssinadas, validadeDaAssinatura,
  type AssinarLeitura, type ConsultaLeitura, type FonteRpc, type FonteTabela, type ItemValido, type RespostaDeItem,
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
  limit(n: number): BuscaLeitura;
  /** hml-20b: a página (pagina e laco) */
  range(de: number, ate: number): BuscaLeitura;
}
/** O pedaço do cliente "como a pessoa" que o módulo usa (o SupabaseClient da porta encaixa). */
export interface ClienteLeitura {
  rpc(nome: string, args: Record<string, unknown>): PromiseLike<Resultado>;
  /** hml-20b: o count exato (contar) */
  from(tabela: string): { select(colunas: string, opcoes?: { count: "exact" }): BuscaLeitura };
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
  const valor: unknown = data ?? null;
  const a = consulta.assinar;
  if (!a || !a.lista) return { ok: true, valor };
  const urls = await assinar(c, item.q, a, caminhosParaAssinar(itensDaLista(valor, a.lista), a.coluna));
  return { ok: true, valor: comUrlsNaLista(valor, a.lista, a.coluna, urls) };
}

/** O select da tabela montado no servidor (colunas fechadas, filtros declarados, dono = quem chama), como a pessoa. */
async function lerTabela(c: ContextoLeitura, item: ItemValido, consulta: ConsultaLeitura & { fonte: FonteTabela }): Promise<RespostaDeItem> {
  const plano = planoDaTabela(consulta, item.params, c.userId);
  const extras = extrasDaTabela(consulta.fonte, item.params);
  /** a busca de 1 ida (o builder do supabase-js é de 1 uso só: o laço monta uma por leitura) */
  const montar = () => {
    let busca = extras.contar ? c.comoPessoa.from(plano.tabela).select(plano.colunas, { count: "exact" }) : c.comoPessoa.from(plano.tabela).select(plano.colunas);
    for (const f of plano.filtros) {
      if (f.op === "in") busca = busca.in(f.coluna, [...f.valor]);
      else if (f.op === "eq") busca = busca.eq(f.coluna, f.valor);
      else busca = busca.is(f.coluna, null);
    }
    for (const o of plano.ordem) busca = busca.order(o.coluna, { ascending: o.asc });
    return busca;
  };
  if (extras.laco) return await lerEmLaco(c, item.q, montar, extras.laco);
  const { data, error, count } = await (extras.intervalo ? montar().range(extras.intervalo[0], extras.intervalo[1]) : montar().limit(plano.teto));
  if (error) return falhou(c, item.q, error);
  const linhas: unknown[] = Array.isArray(data) ? data : [];
  // hml-20b: a consulta de 1 linha que não achou (outra conta, ou já excluída) → nao_encontrado, como hoje (a tela tratava o vazio)
  if (extras.uma && linhas.length === 0) return { ok: false, erro: "nao_encontrado" };
  // hml-20b: o total da lista (com os mesmos filtros) — sem a contagem, o pedido falhou (a lib de hoje também recusava: paginar)
  if (extras.contar && typeof count !== "number") return falhou(c, item.q, { code: "", message: "sem a contagem" });
  const total = extras.contar ? { total: count as number } : {};
  const a = consulta.assinar;
  if (!a || a.lista) return { ok: true, linhas, ...total };
  if (a.download) return { ok: true, linhas: await assinarCadaUma(c, item, a, linhas), ...total };
  const urls = await assinar(c, item.q, a, caminhosParaAssinar(linhas, a.coluna));
  return { ok: true, linhas: comUrls(linhas, a.coluna, urls), ...total };
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
 * hml-20b: `conhecidos` = os códigos que a RPC levanta de propósito (FonteRpc.erros) — voltam como eles, com o log.aviso (não o excecao).
 */
function falhou(c: ContextoLeitura, q: string, e: unknown, conhecidos: readonly string[] = []): RespostaDeItem {
  const o = (e ?? {}) as { code?: unknown; message?: unknown; name?: unknown };
  const t = erroDaLeitura(o, conhecidos);
  if (t.inesperado) c.log.excecao(e, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao: q, schema: c.schema });
  else c.log.aviso({ codigo: t.erro, schema: c.schema, acao: q, pg: typeof o.code === "string" ? o.code : null });
  return { ok: false, erro: t.erro };
}
