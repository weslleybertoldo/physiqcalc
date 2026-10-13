// Physiq hml-21a (H-43 · jeito 2, etapa 3) — o que os módulos de gravação da função conta (casca.ts, app.ts; na 21b, agenda.ts e alunos.ts)
// dividem: o contexto, a resposta,
// a recusa, o 0 linha e a tradução do erro do banco/RPC e do Storage. ESTRUTURAL, como o functions/nutricao/leituras.ts e o preconsulta.ts:
// não importa a porta (_shared/porta-pessoa.ts traz o supabase-js do esm.sh e o Deno) — o contexto é o pedaço do ContextoPessoa que os
// módulos usam (o deno check confere no index.ts que o da porta encaixa). Assim o Vitest roda os módulos com um cliente falso
// (src/conta/contaServidor.test.ts) e o tsc do app não puxa o Deno.
import { erroDaConta } from "../_shared/conta-regras.ts";
import type { Log } from "../_shared/log.ts";

export type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; erro: string };

type Resultado = { data: unknown; error: unknown };
/** O filtro de uma gravação (o PostgrestFilterBuilder do update encaixa): os filtros e o select da volta. */
interface FiltroDaGravacao {
  eq(coluna: string, valor: unknown): FiltroDaGravacao;
  in(coluna: string, valores: readonly unknown[]): FiltroDaGravacao;
  select(colunas: string): PromiseLike<Resultado>;
}
/** hml-21b: a linha nova (insert/upsert) com a volta em lista fechada, 1 linha (o .select(colunas).single() de hoje). */
interface LinhaDaGravacao {
  select(colunas: string): { single(): PromiseLike<Resultado> };
}
/** O pedaço do cliente "como a pessoa" que as gravações da conta usam (o SupabaseClient da porta encaixa). */
export interface ClienteConta {
  rpc(nome: string, args?: Record<string, unknown>): PromiseLike<Resultado>;
  from(tabela: string): {
    select(colunas: string): { eq(coluna: string, valor: unknown): { maybeSingle(): PromiseLike<Resultado> } };
    update(valores: Record<string, unknown>): FiltroDaGravacao;
    /** hml-21b: criar (calendário, tag, consulta, bloqueio, trava), o upsert das regras e o delete do bloqueio/da trava */
    insert(valores: Record<string, unknown>): LinhaDaGravacao;
    upsert(valores: Record<string, unknown>, opcoes: { onConflict: string }): LinhaDaGravacao;
    delete(): FiltroDaGravacao;
  };
  storage: {
    from(bucket: string): {
      createSignedUploadUrl(caminho: string): PromiseLike<{ data: { token?: string } | null; error: unknown }>;
      list(pasta: string, opcoes: { search: string; limit: number }): PromiseLike<{ data: Array<{ name: string }> | null; error: unknown }>;
      remove(caminhos: string[]): PromiseLike<{ data: unknown[] | null; error: unknown }>;
    };
  };
}
/** O pedaço do ContextoPessoa (_shared/porta-pessoa.ts) que as gravações usam. */
export interface ContextoConta {
  schema: "public" | "staging";
  corpo: Record<string, unknown>;
  /** quem chama (o user do token, conferido no Auth pela porta) — o dono de tudo o que a conta grava */
  userId: string;
  comoPessoa: ClienteConta;
  log: Log;
}

/** Recusa esperada (dado fora da forma…): só o código ao log, como aviso (o nome do campo vai no `resultado`, nunca o valor). */
export function recusa(c: ContextoConta, acao: string, erro: string, campo?: string): Resposta {
  c.log.aviso({ codigo: erro, schema: c.schema, acao, resultado: campo ?? null });
  return { ok: false, erro };
}

/** 0 linha: não existe, já saiu ou o RLS não deixa (a mesma resposta nos 3 casos). */
export function naoEncontrado(c: ContextoConta, acao: string): Resposta {
  c.log.aviso({ codigo: "nao_encontrado", schema: c.schema, acao });
  return { ok: false, erro: "nao_encontrado" };
}

/** O erro do banco ou de uma RPC vira o código; o inesperado avisa o Weslley (log.excecao: só nome, código e mensagem limpa). */
export function falha(c: ContextoConta, acao: string, e: unknown, conhecidos: readonly string[] = []): Resposta {
  const o = (e ?? {}) as { code?: unknown; message?: unknown; name?: unknown };
  const t = erroDaConta(o, conhecidos);
  if (t.inesperado) c.log.excecao(e, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao, schema: c.schema });
  else c.log.aviso({ codigo: t.erro, schema: c.schema, acao, pg: typeof o.code === "string" ? o.code : null });
  return { ok: false, erro: t.erro };
}

/** O Storage não respondeu como devia (o link assinado, a lista): 502, com o status dele no log. */
export function falhaStorage(c: ContextoConta, acao: string, e: unknown): Resposta {
  const o = (e ?? {}) as { status?: unknown; statusCode?: unknown };
  const status = typeof o.status === "number" ? o.status : Number(o.statusCode) || 0;
  c.log.erro({ codigo: "storage_falhou", schema: c.schema, acao, status });
  return { ok: false, erro: "storage_falhou" };
}
