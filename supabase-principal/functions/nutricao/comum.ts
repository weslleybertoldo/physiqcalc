// Physiq hml-19b (H-41 · jeito 2, 11/10/2026) — o que os módulos novos da função nutricao (dieta.ts, aluno.ts) dividem: a resposta, a
// recusa, a tradução do erro do banco/RPC e o Storage. O prontuario.ts (hml-19a) tem as cópias dele e NÃO muda nesta W (a mesma
// função já atende o Prontuário da produção).
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import { erroDaRpc } from "../_shared/nutricao-regras.ts";

export type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; erro: string };

/** Recusa esperada (dado fora da forma, sem acesso pela regra, seção inválida…): só o código ao log, como aviso. */
export function recusa(c: ContextoPessoa, acao: string, erro: string, campo?: string): Resposta {
  c.log.aviso({ codigo: erro, schema: c.schema, acao, resultado: campo ?? null });
  return { ok: false, erro };
}

/** 0 linha: não existe, está na Lixeira ou o RLS não deixa (a mesma resposta nos 3 casos). */
export function naoEncontrado(c: ContextoPessoa, acao: string, ref: string | null): Resposta {
  c.log.aviso({ codigo: "nao_encontrado", schema: c.schema, acao, ref });
  return { ok: false, erro: "nao_encontrado" };
}

/**
 * O erro do banco (ou de uma RPC) vira o código da resposta: `conhecidos` = os códigos que a RPC devolve de propósito (raise exception
 * '<código>') e vão à tela como estão; o inesperado avisa o Weslley (log.excecao: só nome, código e mensagem limpa).
 */
export function falha(c: ContextoPessoa, acao: string, e: { code?: unknown; message?: unknown }, conhecidos: readonly string[] = []): Resposta {
  const t = erroDaRpc(e, conhecidos);
  if (t.inesperado) c.log.excecao(e, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao, schema: c.schema });
  else c.log.aviso({ codigo: t.erro, schema: c.schema, acao, pg: typeof e.code === "string" ? e.code : null });
  return { ok: false, erro: t.erro };
}

/** O Storage não respondeu como devia (link assinado, lista): 502, com o status dele no log. */
export function falhaStorage(c: ContextoPessoa, acao: string, e: unknown): Resposta {
  const o = (e ?? {}) as { status?: unknown; statusCode?: unknown };
  const status = typeof o.status === "number" ? o.status : Number(o.statusCode) || 0;
  c.log.erro({ codigo: "storage_falhou", schema: c.schema, acao, status });
  return { ok: false, erro: "storage_falhou" };
}

/** Tira o arquivo do bucket como a pessoa; não saiu (erro ou 0 objeto — o aluno não pode apagar) → log arquivo_orfao, sem o caminho. */
export async function removerArquivo(c: ContextoPessoa, acao: string, bucket: string, caminho: string, ref: string | null): Promise<boolean> {
  const { data, error } = await c.comoPessoa.storage.from(bucket).remove([caminho]);
  if (error || !data?.length) {
    c.log.aviso({ codigo: "arquivo_orfao", schema: c.schema, acao, ref });
    return false;
  }
  return true;
}
