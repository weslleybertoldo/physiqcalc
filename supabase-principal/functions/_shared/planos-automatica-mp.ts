// supabase-principal/functions/_shared/planos-automatica-mp.ts
// Physiq W-P (§7 I1 · Task 8b) — o valor da cobrança automática no Mercado Pago, com a rede: o MESMO PUT /preapproval na
// pagamentos-aluno (o prof_definir de 1 aluno, na hora) e na automaticas-fila (a fila de quem segue um plano — decisão do Weslley
// 10/10/2026, ponto 2). QUANDO trocar é a regra pura do planos-automatica.ts; aqui, a ida ao MP (a credencial do schema, a mesma das 2
// funções: cobranca-mp.ts › credencialDoSchema) e o espelho em aluno_assinaturas.
// Ponto 3 (decisão do Weslley, 10/10/2026): o MP aceitou o valor novo e a gravação do espelho falhou → NÃO é falha: o MP já cobra o
// valor novo e o dono não é avisado — log.excecao espelho_valor_assinatura_falhou (o aviso de erro ao Weslley: log.ts → avisar-erro.ts)
// e "atualizada". O espelho se corrige sozinho: o conferirAssinatura da pagamentos-aluno (prof_aluno, aluno_status) e a fila
// (assinaturaComoNoMp) regravam status e valor a partir do MP.
// Do MP, só o status e os códigos (codigosDoMp) saem daqui para o log de quem chama — nunca o corpo.
// W2 (MENOR 2 da revisão): a credencial é a de CADA assinatura (CredencialMp — a do MP do Physiq ou a da conta do personal, escolhida por
// quem chama: credencialDaAssinatura do _shared/mp-conta.ts). O ContextoMp daqui fica com o nome; o da W2 é o ContextoMpConta.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { codigosDoMp, type AssinaturaMp } from "./cobranca-regras.ts";
import { mpFetch, type CredencialMp } from "./cobranca-mp.ts";
import { espelhoAssinaturaAluno } from "./financeiro-mp.ts";
import type { Schema } from "./financeiro-regras.ts";
import type { ExternoLog, Log } from "./log.ts";
import { novoValorDaAutomatica, type AssinaturaParaValor, type ResultadoValor } from "./planos-automatica.ts";
import type { Prazo } from "./tempo.ts";

/** A assinatura do aluno (a linha mais recente de aluno_assinaturas) — o que a troca do valor lê e grava. */
export interface AssinaturaDoAluno extends AssinaturaParaValor {
  id: string;
}

export interface ContextoMp {
  /** o prazo do pedido (pagamentos-aluno) ou da pendência (automaticas-fila) — vai em toda ida ao MP */
  prazo: Prazo;
  log: Log;
  schema: Schema;
  /** a ação (pagamentos-aluno) ou o passo (automaticas-fila) — só para o log */
  acao: string;
}

export interface TrocaDoValor {
  resultado: ResultadoValor;
  /** o HTTP da ida ao MP (null = não foi ao MP) */
  status: number | null;
  /** os códigos do MP (codigosDoMp), para o log de quem chama */
  externo: ExternoLog;
}

/** A assinatura que não é do MP de verdade (a simulada do staging, ou sem id). */
const simulada = (a: AssinaturaParaValor) => !a.mp_preapproval_id || a.mp_preapproval_id.startsWith("sim-") || a.payload?.simulada === true;

/**
 * I1: o valor do próximo pagamento mudou e a automática está ligada → PUT /preapproval com o valor novo e o espelho gravado. O
 * MP recusou ou não respondeu → "falhou" (quem chama decide: a fila tenta de novo; sem a fila, o aviso ao dono). O MP aceitou e o
 * espelho não gravou → "atualizada" (ponto 3, acima).
 */
export async function trocarValorDaAutomatica(
  db: SupabaseClient,
  credencial: CredencialMp,
  a: AssinaturaDoAluno | null,
  valor: number,
  ctx: ContextoMp,
): Promise<TrocaDoValor> {
  let status: number | null = null;
  let externo: ExternoLog = {};
  const resultado = await novoValorDaAutomatica(a, valor, async (id, corpo) => {
    const r = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(corpo) },
      { prazo: ctx.prazo });
    status = r.status;
    externo = codigosDoMp(r.body);
    if (r.status < 300 && r.body?.id) {
      // ponto 3: daqui em diante o MP já cobra o valor novo — a falha do espelho não volta como falha (nem chega ao dono)
      try {
        const { error } = await db.from("aluno_assinaturas").update({
          ...espelhoAssinaturaAluno(r.body, { ...(a!.payload ?? {}), valor_trocado_em: new Date().toISOString() }),
          valor: corpo.auto_recurring.transaction_amount,
        }).eq("id", a!.id);
        if (error) throw error;
      } catch (e) {
        ctx.log.excecao(e, { codigo: "espelho_valor_assinatura_falhou", schema: ctx.schema, acao: ctx.acao, ref: a!.id });
      }
    }
    return { status: r.status, body: r.body };
  });
  return { resultado, status, externo };
}

/**
 * Task 8b (a fila): a assinatura como o MP a vê AGORA (status e valor), antes de comparar — o espelho pode estar velho (aviso do MP
 * perdido, o ponto 3, duas trocas seguidas): comparar com ele deixaria o MP com um valor errado ("igual") ou faria a fila insistir num
 * PUT que o MP recusa (a assinatura já cancelada lá). Grava o espelho (a falha só registra: a fila segue com o que o MP disse). Sem
 * automática de verdade (simulada, cancelada) ou com o MP fora do ar: a do banco, como está (o PUT decide).
 */
export async function assinaturaComoNoMp(
  db: SupabaseClient,
  credencial: CredencialMp,
  a: AssinaturaDoAluno | null,
  ctx: ContextoMp,
): Promise<AssinaturaDoAluno | null> {
  if (!a || simulada(a) || !["authorized", "pending", "paused"].includes(a.status)) return a;
  const { status, body: pre } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(a.mp_preapproval_id!)}`, {},
    { prazo: ctx.prazo });
  if (status !== 200 || !pre?.id) return a;
  const espelho = espelhoAssinaturaAluno(pre, { ...(a.payload ?? {}) });
  try {
    const { error } = await db.from("aluno_assinaturas").update(espelho).eq("id", a.id);
    if (error) throw error;
  } catch (e) {
    ctx.log.excecao(e, { codigo: "espelho_assinatura_falhou", schema: ctx.schema, acao: ctx.acao, ref: a.id });
  }
  return {
    ...a,
    status: String(espelho.status),
    valor: typeof espelho.valor === "number" ? espelho.valor : a.valor,
    payload: espelho.payload as Record<string, unknown>,
  };
}
