// supabase-principal/functions/mp-contas-renovar/rodada.ts
// Physiq W2 — a RODADA do mp-contas-renovar (a index.ts confere o segredo S10, o corpo e a configuração, e chama aqui). De hora em hora:
//   1. a renovação: até 50 integrações OAuth ativas que vencem em < 30 dias e estão na hora da tentativa, as que vencem antes primeiro, 5 por
//      vez, cada uma pela renovarConta (_shared/mp-conta.ts: a trava de 2 min, a gravação condicional — o refresh GIRA —, recusada com o
//      acesso valendo → ativa + renovacao_recusada + aviso, vencida e recusada → erro, MP fora → espera crescente). Sem refresh (mp_erro
//      sem_renovacao — decisão 8: o MP não mandou o refresh) → 1 aviso por dia "conecte de novo até dd/mm" e a próxima tentativa amanhã
//      (não ocupa a vaga de quem renova);
//   2. as que JÁ venceram ainda ativas → marcarErro("vencido") + aviso: as sem refresh e as vencidas há mais de 1 dia — quem ainda pode
//      renovar tem 1 dia de tolerância (o MP fora na hora da rodada não derruba a conexão: a renovação da hora seguinte tenta de novo);
//   3. o diário (MENOR 27 e I1): até 50 ativas com mp_conferido_em nulo ou de > 1 dia (os nulos primeiro), 5 por vez, pela conferirConta
//      (/users/me — o acesso tirado no MP é descoberto sem esperar um aluno pagar — e a busca das cobranças das automáticas da conta).
// Orçamento: o da rodada (ORCAMENTO_MS.loteEspelho, de quem chama); com menos de 30 s sobrando não começa outro grupo e o diário fica para a
// hora seguinte (as vencidas saem sempre: só banco). Cada conta tem o prazo dela (até ORCAMENTO_MS.servidor) e NUNCA para as outras: o que
// lança (banco, cifra de outra chave) vira log.excecao com a conta e conta em `erros`.
// forcar_conta (SÓ staging — o E2E da renovação de verdade): renova AGORA aquela conta, mesmo longe de vencer, e nada mais.
// O job só toca nas integrações mp_origem = 'oauth': a 'teste_local' (o E2E local) e a 'teste_sem_oauth' (a conexão simulada) ficam (MENOR 12).
// Só `import type` de URL e sem o global do Deno: o Vitest importa (src/financeiro/mpContasRenovar.test.ts). Log: só ids de conta e
// resultados; a contagem (a resposta) só números.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import type { Log } from "../_shared/log.ts";
import {
  avisarDonoDaConexao, conferirConta, marcarErro, renovarConta, type ContextoMpConta, type ResultadoRenovar,
} from "../_shared/mp-conta.ts";
import { RENOVAR_ANTES_MS, ehUuidMp, type Schema } from "../_shared/mp-conta-regras.ts";
import { ORCAMENTO_MS, prazo, type Prazo } from "../_shared/tempo.ts";

/** Por rodada: até 50 de cada lista, 5 por vez (sem rajada no MP; a rodada cabe no tempo do pg_net). */
export const POR_RODADA = 50;
export const POR_VEZ = 5;
/** Com menos que isto sobrando do orçamento não começa outro grupo (a sobra fica intacta para a próxima hora). */
export const MINIMO_POR_GRUPO_MS = 30_000;
/** Quem venceu e ainda pode renovar (tem refresh) tem este tempo antes de virar "vencido". */
export const TOLERANCIA_DA_VENCIDA_MS = 86_400_000;
const DIA_MS = 86_400_000;
const SCHEMAS: Schema[] = ["public", "staging"];

/** A resposta da função: só contagens. */
export interface Contagem {
  renovadas: number;
  /** outra renovação (a da hora do uso) girou o refresh antes: não é erro */
  outras: number;
  recusadas: number;
  fora: number;
  ocupadas: number;
  /** sem refresh (decisão 8): avisada para conectar de novo até o vencimento */
  sem_renovacao: number;
  vencidas: number;
  conferidas: number;
  /** o diário achou o acesso tirado no MP (ou de outro usuário): a conexão foi marcada "erro" */
  sem_acesso: number;
  conferir_fora: number;
  cobrancas_da_rede: number;
  /** contas em que algo lançou (banco, cifra): log.excecao; as outras seguiram */
  erros: number;
}
export const contagemVazia = (): Contagem => ({
  renovadas: 0, outras: 0, recusadas: 0, fora: 0, ocupadas: 0, sem_renovacao: 0, vencidas: 0, conferidas: 0, sem_acesso: 0, conferir_fora: 0,
  cobrancas_da_rede: 0, erros: 0,
});
const CONTA_DO_RESULTADO: Record<ResultadoRenovar | "erro", keyof Contagem> = {
  renovada: "renovadas", outra_renovou: "outras", recusada: "recusadas", fora: "fora", ocupada: "ocupadas", sem_refresh: "sem_renovacao",
  erro: "erros",
};

export interface Rodada {
  db: SupabaseClient;
  schema: Schema;
  log: Log;
  /** o orçamento da rodada inteira (a index.ts cria no começo do atendimento) */
  prazo: Prazo;
  /** MP_TOKENS_CHAVE importada */
  chave: CryptoKey;
  /** oauthDoAmbiente(schema) — no staging, o client de teste quando existe (plano B do I6) */
  oauth: { clientId: string; clientSecret: string };
}

export type PedidoDoJob =
  | { ok: true; schema: Schema; forcarConta: string | null }
  | { ok: false; erro: "schema_invalido" | "forcar_so_no_staging" | "conta_invalida" };

/** O corpo { schema, forcar_conta? }: o schema só como texto (um ["staging"] viraria "staging" no String()); forcar_conta só no staging e
 *  só um uuid (minúsculo, como o banco devolve). */
export function lerPedido(corpo: unknown): PedidoDoJob {
  const c = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {};
  const schema = (typeof c.schema === "string" ? c.schema.toLowerCase() : "") as Schema;
  if (!SCHEMAS.includes(schema)) return { ok: false, erro: "schema_invalido" };
  if (c.forcar_conta === undefined || c.forcar_conta === null) return { ok: true, schema, forcarConta: null };
  if (schema !== "staging") return { ok: false, erro: "forcar_so_no_staging" };
  if (!ehUuidMp(c.forcar_conta)) return { ok: false, erro: "conta_invalida" };
  return { ok: true, schema, forcarConta: c.forcar_conta };
}

/** O contexto de UMA conta: o prazo dela (até ORCAMENTO_MS.servidor, sem passar o que sobra da rodada). */
function contexto(r: Rodada): ContextoMpConta {
  return { schema: r.schema, log: r.log, prazo: prazo(Math.min(ORCAMENTO_MS.servidor, r.prazo.restante())), chave: r.chave, oauth: r.oauth };
}

const dataBR = (iso: number) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Decisão 8: a conexão sem refresh não renova sozinha. Até vencer: a próxima tentativa amanhã e o aviso ao dono (no máximo 1 por dia — o
 *  avisarDonoDaConexao). Vencida: é das vencidas (abaixo). */
async function semRenovacao(r: Rodada, ctx: ContextoMpConta, l: { conta_id: string; mp_expira_em: string | null }): Promise<void> {
  const vence = Date.parse(l.mp_expira_em ?? "");
  if (!Number.isFinite(vence) || vence <= Date.now()) return;
  const { error } = await r.db.from("recebimento_integracoes").update({ mp_renovar_proxima_em: new Date(Date.now() + DIA_MS).toISOString() })
    .eq("conta_id", l.conta_id).eq("provedor", "mercadopago").eq("status", "ativa");
  if (error) throw error;
  await avisarDonoDaConexao(r.db, ctx, l.conta_id, `A conexão do seu Mercado Pago com o Physiq vale até ${dataBR(vence)} e não renova sozinha. `
    + "Conecte de novo em Configurações › Recebimento antes disso.");
}

/** Uma renovação; nunca lança (o que lança vira log.excecao com a conta e "erro"). `daLista`: a da rodada (o forçado não avisa). */
async function renovarUma(r: Rodada, l: { conta_id: string; mp_expira_em: string | null }, daLista: boolean): Promise<ResultadoRenovar | "erro"> {
  try {
    const ctx = contexto(r);
    const resultado = await renovarConta(r.db, ctx, l.conta_id);
    if (resultado === "sem_refresh" && daLista) await semRenovacao(r, ctx, l);
    r.log.info({ codigo: "mp_renovar_conta", schema: r.schema, ref: l.conta_id, resultado });
    return resultado;
  } catch (e) {
    r.log.excecao(e, { codigo: "mp_renovar_conta_falhou", schema: r.schema, ref: l.conta_id });
    return "erro";
  }
}

/** As que venceram ainda ativas: sem refresh, ou vencidas há mais de 1 dia → "erro" + aviso (o marcarErro: só a ativa, 1 aviso por dia). */
async function marcarVencidas(r: Rodada, c: Contagem): Promise<void> {
  const agora = Date.now();
  const { data, error } = await r.db.from("recebimento_integracoes").select("conta_id")
    .eq("provedor", "mercadopago").eq("mp_origem", "oauth").eq("status", "ativa").lt("mp_expira_em", new Date(agora).toISOString())
    .or(`mp_refresh_token.is.null,mp_expira_em.lt.${new Date(agora - TOLERANCIA_DA_VENCIDA_MS).toISOString()}`)
    .order("mp_expira_em", { ascending: true }).limit(POR_RODADA);
  if (error) throw error;
  for (const { conta_id } of (data ?? []) as Array<{ conta_id: string }>) {
    try {
      if (await marcarErro(r.db, contexto(r), conta_id, "vencido")) c.vencidas++;
    } catch (e) {
      r.log.excecao(e, { codigo: "mp_vencida_falhou", schema: r.schema, ref: conta_id });
      c.erros++;
    }
  }
}

/** Uma conferência do diário; nunca lança (MP fora já volta "fora" da conferirConta; o resto vira log.excecao e "erro"). */
async function conferirUma(r: Rodada, l: { conta_id: string; mp_user_id: number | string }, c: Contagem): Promise<void> {
  try {
    const { resultado, cobrancas } = await conferirConta(r.db, contexto(r), l);
    c[resultado === "ok" ? "conferidas" : resultado === "sem_acesso" ? "sem_acesso" : "conferir_fora"]++;
    c.cobrancas_da_rede += cobrancas;
    r.log.info({ codigo: "mp_conferir_conta", schema: r.schema, ref: l.conta_id, resultado, n: cobrancas });
  } catch (e) {
    r.log.excecao(e, { codigo: "mp_conferir_conta_falhou", schema: r.schema, ref: l.conta_id });
    c.erros++;
  }
}

/** Em grupos de POR_VEZ; o 1º grupo sempre, os outros só com MINIMO_POR_GRUPO_MS sobrando. → se parou por falta de tempo. */
async function emGrupos<T>(r: Rodada, lista: T[], acao: string, fazer: (item: T) => Promise<void>): Promise<boolean> {
  for (let i = 0; i < lista.length; i += POR_VEZ) {
    if (i > 0 && r.prazo.restante() < MINIMO_POR_GRUPO_MS) {
      r.log.aviso({ codigo: "rodada_no_limite", schema: r.schema, acao, n: lista.length - i });
      return true;
    }
    await Promise.all(lista.slice(i, i + POR_VEZ).map(fazer));
  }
  return false;
}

/** A rodada de hora em hora: renovação → vencidas → diário. Erro do banco nas LISTAS lança (o catch final da index.ts: 500 + aviso). */
export async function rodada(r: Rodada): Promise<Contagem> {
  const inicio = Date.now();
  const c = contagemVazia();
  const { data: aRenovar, error: erroRenovar } = await r.db.from("recebimento_integracoes").select("conta_id, mp_expira_em")
    .eq("provedor", "mercadopago").eq("mp_origem", "oauth").eq("status", "ativa")
    .lt("mp_expira_em", new Date(inicio + RENOVAR_ANTES_MS).toISOString())
    .or(`mp_renovar_proxima_em.is.null,mp_renovar_proxima_em.lte.${new Date(inicio).toISOString()}`)
    .order("mp_expira_em", { ascending: true }).limit(POR_RODADA);
  if (erroRenovar) throw erroRenovar;
  const semTempo = await emGrupos(r, (aRenovar ?? []) as Array<{ conta_id: string; mp_expira_em: string | null }>, "mp_renovar",
    async (l) => {
      const resultado = await renovarUma(r, l, true);
      c[CONTA_DO_RESULTADO[resultado]]++;
    });
  await marcarVencidas(r, c);
  // o diário vem DEPOIS da renovação: sem tempo, fica para a hora seguinte
  if (semTempo || r.prazo.restante() < MINIMO_POR_GRUPO_MS) {
    r.log.aviso({ codigo: "diario_fica_para_depois", schema: r.schema, acao: "mp_conferir" });
  } else {
    const { data: aConferir, error: erroConferir } = await r.db.from("recebimento_integracoes").select("conta_id, mp_user_id")
      .eq("provedor", "mercadopago").eq("mp_origem", "oauth").eq("status", "ativa")
      .or(`mp_conferido_em.is.null,mp_conferido_em.lt.${new Date(Date.now() - DIA_MS).toISOString()}`)
      .order("mp_conferido_em", { ascending: true, nullsFirst: true }).limit(POR_RODADA);
    if (erroConferir) throw erroConferir;
    await emGrupos(r, (aConferir ?? []) as Array<{ conta_id: string; mp_user_id: number | string }>, "mp_conferir", (l) => conferirUma(r, l, c));
  }
  const n = Object.entries(c).reduce((soma, [k, v]) => soma + (k === "cobrancas_da_rede" ? 0 : v), 0);
  r.log.info({ codigo: "rodada_feita", schema: r.schema, acao: "mp_renovar", n, ms: Date.now() - inicio });
  return c;
}

/** forcar_conta (só staging — a index.ts e o lerPedido seguram): renova AGORA aquela conta, mesmo longe de vencer, e nada mais.
 *  Sem integração do MP na conta → null (a index.ts responde 404 conta_sem_mp). */
export async function forcarRenovacao(r: Rodada, contaId: string): Promise<Contagem | null> {
  const { data, error } = await r.db.from("recebimento_integracoes").select("conta_id, mp_expira_em").eq("conta_id", contaId)
    .eq("provedor", "mercadopago").maybeSingle();
  if (error) throw error;
  const l = data as { conta_id: string; mp_expira_em: string | null } | null;
  if (!l) return null;
  const c = contagemVazia();
  c[CONTA_DO_RESULTADO[await renovarUma(r, l, false)]]++;
  r.log.info({ codigo: "rodada_feita", schema: r.schema, acao: "mp_renovar_forcado", ref: contaId, n: 1 });
  return c;
}
