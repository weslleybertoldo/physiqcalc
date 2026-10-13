// Physiq W-A P2 — o que os 3 módulos da aluno-dia dividem: chamar a RPC COMO A PESSOA e traduzir a volta (o jsonb { ok, … } da RPC ou o erro do
// PostgREST) em resposta, com o log certo — só código, ação (a gravação, ou ler_<q>), schema, o campo recusado e o código do Postgres; nunca o
// nome de uma rotina ou de um alimento (dado de saúde).
import type { ContextoPessoa } from "../_shared/porta-pessoa.ts";
import { voltaDoAlunoDia, type PedidoDoAlunoDia } from "../_shared/aluno-dia-regras.ts";
import { erroDoBanco } from "../_shared/nutricao-regras.ts";

export type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; erro: string };

/** O nome da ação no log: a gravação, ou ler_<q> na leitura. */
export const acaoDoLog = (p: Pick<PedidoDoAlunoDia, "acao" | "q">): string => (p.q ? `ler_${p.q}` : p.acao);

/** Recusa esperada (fora da forma): só o código e o nome do campo ao log, como aviso. */
export function recusa(c: ContextoPessoa, acao: string | null, erro: string, campo?: string): Resposta {
  c.log.aviso({ codigo: erro, schema: c.schema, acao, resultado: campo ?? null });
  return { ok: false, erro };
}

/** A RPC do pedido, como a pessoa: { ok: true, … } como veio · { ok: false, erro } (conhecido → aviso; inesperado → avisa o Weslley). */
export async function chamar(c: ContextoPessoa, p: PedidoDoAlunoDia): Promise<Resposta> {
  const acao = acaoDoLog(p);
  const { data, error } = await c.comoPessoa.rpc(p.rpc, p.args);
  if (error) {
    const t = erroDoBanco(error);
    if (t.inesperado) c.log.excecao(error, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao, schema: c.schema });
    else c.log.aviso({ codigo: t.erro, schema: c.schema, acao, pg: typeof error.code === "string" ? error.code : null });
    return { ok: false, erro: t.erro };
  }
  const v = voltaDoAlunoDia(data);
  if (v.ok === false) {
    if (v.inesperado) c.log.erro({ codigo: "rpc_inesperada", schema: c.schema, acao });
    else c.log.aviso({ codigo: v.erro, schema: c.schema, acao });
    return { ok: false, erro: v.erro };
  }
  return v;
}
