// Physiq hml-20a (H-42 · jeito 2, etapa 2, 11/10/2026) — o módulo das LEITURAS da função nutricao: a ação `ler` (em lote). O motor
// (_shared/leitura-lote.ts) lê o pedido pelo catálogo (_shared/nutricao-leituras.ts) e roda os itens em paralelo (até 6), na ordem, com
// o erro de cada um isolado; aqui ficam os construtores, todos COMO A PESSOA (c.comoPessoa — o token de quem chama; nenhuma chave
// secreta): o RLS de hoje decide quem vê (outra conta → lista vazia, como hoje; decisão 6) e a função confere a forma.
//   RPC     .rpc(nome, args montados no servidor) → { ok: true, valor }
//   tabela  .from(t).select(<colunas fechadas>) + os filtros declarados + o dono (= quem chama) + as vivas + ordem + teto → { ok: true, linhas }
//   assinar só os caminhos que a PRÓPRIA consulta leu → createSignedUrls como a pessoa (a policy de leitura do bucket confere de novo),
//           no bucket do ambiente, com a validade de hoje → `url` RELATIVA (/storage/v1/object/sign/…) em cada linha/item; a tela monta
//           com o domínio dela. Não deu para assinar → url null (a tela mostra "Foto indisponível", como hoje) e um aviso no log.
// Log com campos fixos: 1 linha por pedido (acao "ler", n itens, ms, o desfecho) e 1 por item que falhou (o código e a q) — nunca os
// params, as linhas ou os caminhos.
// Este arquivo NÃO importa a porta (_shared/porta-pessoa.ts, que traz o supabase-js do esm.sh e o Deno): o contexto é o pedaço do
// ContextoPessoa que ele usa (ContextoLeitura, estrutural — o deno check confere no index.ts que o da porta encaixa). Assim o Vitest roda
// o módulo com um cliente falso (src/nutricao/leituraServidor.test.ts) e o tsc do app não puxa o Deno.
import {
  argsDaRpc, caminhosParaAssinar, comUrls, comUrlsNaLista, ehRpc, erroDaLeitura, itensDaLista, lerPedidoDeLeitura, planoDaTabela, rodarLote,
  urlsAssinadas, type AssinarLeitura, type ConsultaLeitura, type FonteRpc, type FonteTabela, type ItemValido, type RespostaDeItem,
} from "../_shared/leitura-lote.ts";
import type { Log } from "../_shared/log.ts";
import { CONSULTAS_NUTRICAO, bucketDaLeitura, consultaDaNutricao } from "../_shared/nutricao-leituras.ts";

type Resultado = { data: unknown; error: unknown };
/** O encadeamento do select que o módulo usa (o PostgrestFilterBuilder do supabase-js encaixa). */
interface BuscaLeitura extends PromiseLike<Resultado> {
  in(coluna: string, valores: readonly unknown[]): BuscaLeitura;
  eq(coluna: string, valor: unknown): BuscaLeitura;
  is(coluna: string, valor: null): BuscaLeitura;
  order(coluna: string, opcoes: { ascending: boolean }): BuscaLeitura;
  limit(n: number): BuscaLeitura;
}
/** O pedaço do cliente "como a pessoa" que o módulo usa (o SupabaseClient da porta encaixa). */
export interface ClienteLeitura {
  rpc(nome: string, args: Record<string, unknown>): PromiseLike<Resultado>;
  from(tabela: string): { select(colunas: string): BuscaLeitura };
  storage: { from(bucket: string): { createSignedUrls(caminhos: string[], validade: number): PromiseLike<Resultado> } };
}
/** O pedaço do ContextoPessoa (_shared/porta-pessoa.ts) que o módulo usa. */
export interface ContextoLeitura {
  schema: "public" | "staging";
  corpo: Record<string, unknown>;
  /** quem chama (o user do token, conferido no Auth pela porta) — o dono das consultas "minhas" */
  userId: string;
  comoPessoa: ClienteLeitura;
  log: Log;
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
  if (error) return falhou(c, item.q, error);
  const valor: unknown = data ?? null;
  const a = consulta.assinar;
  if (!a || !a.lista) return { ok: true, valor };
  const urls = await assinar(c, item.q, a, caminhosParaAssinar(itensDaLista(valor, a.lista), a.coluna));
  return { ok: true, valor: comUrlsNaLista(valor, a.lista, a.coluna, urls) };
}

/** O select da tabela montado no servidor (colunas fechadas, filtros declarados, dono = quem chama), como a pessoa. */
async function lerTabela(c: ContextoLeitura, item: ItemValido, consulta: ConsultaLeitura & { fonte: FonteTabela }): Promise<RespostaDeItem> {
  const plano = planoDaTabela(consulta, item.params, c.userId);
  let busca = c.comoPessoa.from(plano.tabela).select(plano.colunas);
  for (const f of plano.filtros) {
    if (f.op === "in") busca = busca.in(f.coluna, [...f.valor]);
    else if (f.op === "eq") busca = busca.eq(f.coluna, f.valor);
    else busca = busca.is(f.coluna, null);
  }
  for (const o of plano.ordem) busca = busca.order(o.coluna, { ascending: o.asc });
  const { data, error } = await busca.limit(plano.teto);
  if (error) return falhou(c, item.q, error);
  const linhas: unknown[] = Array.isArray(data) ? data : [];
  const a = consulta.assinar;
  if (!a || a.lista) return { ok: true, linhas };
  const urls = await assinar(c, item.q, a, caminhosParaAssinar(linhas, a.coluna));
  return { ok: true, linhas: comUrls(linhas, a.coluna, urls) };
}

/** Assina como a pessoa, em lote, SÓ os caminhos que a consulta leu; o que falhar fica sem URL (aviso no log, sem os caminhos). */
async function assinar(c: ContextoLeitura, q: string, a: AssinarLeitura, caminhos: string[]): Promise<Map<string, string>> {
  if (!caminhos.length) return new Map();
  const bucket = bucketDaLeitura(a.bucket, c.schema);
  const { data, error } = await c.comoPessoa.storage.from(bucket).createSignedUrls(caminhos, a.validade);
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

/** O erro do banco (ou o que lançou) vira o código do item; o inesperado avisa o Weslley (log.excecao: só nome, código e mensagem limpa). */
function falhou(c: ContextoLeitura, q: string, e: unknown): RespostaDeItem {
  const o = (e ?? {}) as { code?: unknown; message?: unknown; name?: unknown };
  const t = erroDaLeitura(o);
  if (t.inesperado) c.log.excecao(e, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao: q, schema: c.schema });
  else c.log.aviso({ codigo: t.erro, schema: c.schema, acao: q, pg: typeof o.code === "string" ? o.code : null });
  return { ok: false, erro: t.erro };
}
