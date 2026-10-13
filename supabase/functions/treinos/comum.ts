// Physiq hml-21d (H-43 · jeito 2, etapa 3) — o que os módulos de gravação da função treinos (modelos.ts, biblioteca.ts, master.ts) dividem: o
// contexto, a resposta, a recusa, o 0 linha, a tradução do erro do banco/RPC e do Storage e as 4 gravações de sempre (criar com a volta,
// mudar pelo filtro, apagar pelo filtro, a RPC). ESTRUTURAL, como o conta/comum.ts do principal: não importa a porta
// (_shared/porta-treino.ts traz o supabase-js do esm.sh e o Deno) — o contexto é o pedaço do ContextoTreino que os módulos usam (o deno check
// confere no index.ts que o da porta encaixa). Assim o Vitest roda os módulos com um cliente falso (src/treino/treinosServidor.test.ts).
import { erroDoTreino } from "../_shared/treinos-regras.ts";
import type { Log } from "../_shared/log.ts";

export type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; erro: string };

type Resultado = { data: unknown; error: unknown };
/** O filtro de uma gravação (o PostgrestFilterBuilder do update/delete encaixa): os filtros e o select da volta. */
export interface FiltroDaGravacao {
  eq(coluna: string, valor: unknown): FiltroDaGravacao;
  select(colunas: string): PromiseLike<Resultado>;
}
/** A linha nova (insert) com a volta em lista fechada, 1 linha (o .select(colunas).single() de hoje). */
interface LinhaDaGravacao {
  select(colunas: string): { single(): PromiseLike<Resultado> };
}
/** O pedaço do cliente "como a pessoa" que as gravações da treinos usam (o SupabaseClient da porta encaixa). */
export interface ClienteTreino {
  rpc(nome: string, args?: Record<string, unknown>): PromiseLike<Resultado>;
  from(tabela: string): {
    select(colunas: string): { eq(coluna: string, valor: unknown): { maybeSingle(): PromiseLike<Resultado> } };
    update(valores: Record<string, unknown>): FiltroDaGravacao;
    insert(valores: Record<string, unknown>): LinhaDaGravacao;
    delete(): FiltroDaGravacao;
  };
  storage: {
    from(bucket: string): {
      createSignedUploadUrl(caminho: string, opcoes: { upsert: boolean }): PromiseLike<{ data: { token?: string } | null; error: unknown }>;
      list(pasta: string, opcoes: { search: string; limit: number }): PromiseLike<{ data: Array<{ name: string }> | null; error: unknown }>;
    };
  };
}
/** O pedaço do ContextoTreino (_shared/porta-treino.ts) que as gravações usam. */
export interface ContextoTreinos {
  schema: "public" | "staging";
  corpo: Record<string, unknown>;
  /** quem chama (o sub do token do Treino, conferido pela porta) — o dono de tudo o que a treinos grava */
  userId: string;
  /** quem chama é master no Treino (o papel do token conferido) */
  master: boolean;
  comoPessoa: ClienteTreino;
  log: Log;
}

/** Recusa esperada (dado fora da forma…): só o código ao log, como aviso (o nome do campo vai no `resultado`, nunca o valor). */
export function recusa(c: ContextoTreinos, acao: string, erro: string, campo?: string): Resposta {
  c.log.aviso({ codigo: erro, schema: c.schema, acao, resultado: campo ?? null });
  return { ok: false, erro };
}

/** 0 linha: não existe, já saiu ou o RLS não deixa (a mesma resposta nos 3 casos). */
export function naoEncontrado(c: ContextoTreinos, acao: string): Resposta {
  c.log.aviso({ codigo: "nao_encontrado", schema: c.schema, acao });
  return { ok: false, erro: "nao_encontrado" };
}

/**
 * O erro do banco ou de uma RPC vira o código (os `conhecidos` = o raise de propósito; `emUso` = o 23503 do painel como em_uso); o
 * inesperado avisa o Weslley (log.excecao: só nome, código e mensagem limpa).
 */
export function falha(c: ContextoTreinos, acao: string, e: unknown, conhecidos: readonly string[] = [], opcoes: { emUso?: boolean } = {}): Resposta {
  const o = (e ?? {}) as { code?: unknown; message?: unknown; name?: unknown };
  const t = erroDoTreino(o, conhecidos, opcoes);
  if (t.inesperado) c.log.excecao(e, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao, schema: c.schema });
  else c.log.aviso({ codigo: t.erro, schema: c.schema, acao, pg: typeof o.code === "string" ? o.code : null });
  return { ok: false, erro: t.erro };
}

/**
 * O Storage recusou ou não respondeu: a policy do bucket (o arquivo de um exercício que não é de quem chama — o 403 do RLS do Storage) →
 * 403 sem_acesso, como aviso; o resto → 502 storage_falhou, com o status dele no log.
 */
export function falhaStorage(c: ContextoTreinos, acao: string, e: unknown): Resposta {
  const o = (e ?? {}) as { status?: unknown; statusCode?: unknown; message?: unknown };
  const status = typeof o.status === "number" ? o.status : Number(o.statusCode) || 0;
  const rls = status === 403 || Number(o.statusCode) === 403 || (typeof o.message === "string" && /row-level security/i.test(o.message));
  if (rls) {
    c.log.aviso({ codigo: "sem_acesso", schema: c.schema, acao, status });
    return { ok: false, erro: "sem_acesso" };
  }
  c.log.erro({ codigo: "storage_falhou", schema: c.schema, acao, status });
  return { ok: false, erro: "storage_falhou" };
}

/** O filtro de uma linha (o id, ou o par grupo + exercício, pasta + grupo): aplicado em ordem, como a lib de hoje. */
export type Filtro = ReadonlyArray<readonly [string, unknown]>;
const filtrar = (b: FiltroDaGravacao, f: Filtro) => f.reduce((x, [coluna, valor]) => x.eq(coluna, valor), b);

/** insert + a volta em lista fechada (1 linha): o .insert(...).select(colunas).single() de hoje. */
export async function inserir(
  c: ContextoTreinos, acao: string, tabela: string, linha: Record<string, unknown>, colunas: string, opcoes: { emUso?: boolean } = {},
): Promise<{ ok: true; linha: Record<string, unknown> } | { ok: false; erro: string }> {
  const { data, error } = await c.comoPessoa.from(tabela).insert(linha).select(colunas).single();
  if (error) return falha(c, acao, error, [], opcoes) as { ok: false; erro: string };
  return { ok: true, linha: (data ?? {}) as Record<string, unknown> };
}

/** update das colunas que vieram, pelo filtro (o RLS decide); nenhuma coluna → dados_invalidos (nada roda); 0 linha → nao_encontrado. */
export async function mudar(c: ContextoTreinos, acao: string, tabela: string, filtro: Filtro, patch: Record<string, unknown>, opcoes: { emUso?: boolean } = {}): Promise<Resposta> {
  if (Object.keys(patch).length === 0) return recusa(c, acao, "dados_invalidos", "campos");
  const { data, error } = await filtrar(c.comoPessoa.from(tabela).update(patch), filtro).select("id");
  if (error) return falha(c, acao, error, [], opcoes);
  if (!Array.isArray(data) || data.length === 0) return naoEncontrado(c, acao);
  return { ok: true };
}

/** delete pelo filtro (o RLS decide); 0 linha → nao_encontrado; o 23503 (a linha está em uso) → em_uso, a frase de hoje. */
export async function apagar(c: ContextoTreinos, acao: string, tabela: string, filtro: Filtro): Promise<Resposta> {
  const { data, error } = await filtrar(c.comoPessoa.from(tabela).delete(), filtro).select("id");
  if (error) return falha(c, acao, error, [], { emUso: true });
  if (!Array.isArray(data) || data.length === 0) return naoEncontrado(c, acao);
  return { ok: true };
}
