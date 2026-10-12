// supabase-principal/functions/pagamentos-aluno/mp-credencial.ts
// Physiq W2 (Task 9 — o token da conta em TODAS as chamadas do MP da pagamentos-aluno): as peças que a index.ts encadeia em cada ação. A
// index.ts escolhe a credencial de cada ação — a do MP do Physiq ("prod" | "test") ou a da conta do personal (CredencialConta: o token já
// decifrado, só em memória) — e passa adiante a MESMA em todas as idas daquela ação; aqui ficam as regras que o Vitest alcança
// (src/financeiro/servidor.test.ts):
//   · semDerrubar     — a conferência de LEITURA e o melhor esforço não derrubam a resposta (revisão I3): a conexão caída ou o MP fora viram
//                       a linha do banco; erro do banco lança;
//   · recebedorConfere — na conta do personal o GET 200 não basta: o pagamento tem de ter caído NELA (o collector — o C1 da W1b + o I8);
//   · notificacaoDe   — o aviso do MP volta pela URL da conta (…&conta=<id>, domínio próprio) ou pela de sempre (o MP do Physiq);
//   · collectorDaLinha — a regra da coluna nova (C2) na linha que vai ao MP: a da conta leva o collector dela; a do MP do Physiq, NULO (a linha
//                       reaproveitada não fica com o collector de outra conta: senão a credencialDaCobranca escolheria aquele token);
//   · desligarAntiga  — a automática antiga viva é cancelada com a credencial DELA e CONFERIDA no MP antes da nova (revisão I11): sem isso ela
//                       sumia do banco (a linha é reaproveitada) e seguia cobrando — o aluno pagaria 2 automáticas.
// Sem import de URL (só tipo) e sem o global Deno: o Vitest importa. Nada aqui vai ao log (quem chama loga — sem token, collector nem corpo do MP).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { MpIndisponivel, type CredencialMp, type RespostaMp, type Schema } from "../_shared/cobranca-mp.ts";
import type { AssinaturaMp } from "../_shared/cobranca-regras.ts";
import { MpContaSemAcesso, collectorDe, comCollector, schemaTemW2 } from "../_shared/mp-conta.ts";
import { notificacaoDaConta } from "../_shared/mp-conta-regras.ts";

/** Uma ida ao MP com a credencial JÁ escolhida (a index.ts: `<T>(caminho, init) => mp<T>(cred, caminho, init)`). */
export type ChamarMp = <T>(caminho: string, init?: RequestInit) => Promise<RespostaMp<T>>;

/**
 * I3 (revisão da W2): faz a ida ao MP que NÃO pode derrubar a resposta. A conexão do personal caída (MpContaSemAcesso — inclusive a
 * MP_TOKENS_CHAVE ausente: o getter do contexto lança assim) ou o MP sem resposta que decida (MpIndisponivel) → `aoFalhar(resultado)` (o
 * log.aviso de quem chama: o motivo da conta ou "mp_fora") e `seFalhar` (a linha do banco, como está). Qualquer outro erro — o do banco
 * inclusive — LANÇA: o 500 de sempre, nunca a linha velha calada.
 */
export async function semDerrubar<T>(fazer: () => Promise<T>, seFalhar: T, aoFalhar: (resultado: string) => void): Promise<T> {
  try {
    return await fazer();
  } catch (e) {
    if (e instanceof MpContaSemAcesso) aoFalhar(e.motivo);
    else if (e instanceof MpIndisponivel) aoFalhar("mp_fora");
    else throw e;
    return seFalhar;
  }
}

/** C1 (c1-verificacao §5.2, item 4) + I8: na conta do personal o recebedor (collector_id) tem de ser a conta da credencial — o token de OUTRO
 *  personal também lê o que é dele. No MP do Physiq, o GET 200 com o token do schema já prova a conta. */
export function recebedorConfere(cred: CredencialMp, pay: { collector_id?: number | string | null } | null | undefined): boolean {
  return typeof cred === "string" || Number(pay?.collector_id) === cred.collectorId;
}

/** A notification_url do pagamento/automática: no MP do personal, a da conta (domínio próprio, ?schema=<s>&conta=<id> — o caminho por conta
 *  da mp-webhook-aluno); no MP do Physiq, a de sempre (o projeto, ?schema=<s>). */
export function notificacaoDe(cred: CredencialMp, schema: Schema, supabaseUrl: string): string {
  return typeof cred === "string" ? `${supabaseUrl}/functions/v1/mp-webhook-aluno?schema=${schema}` : notificacaoDaConta(cred.schema, cred.contaId);
}

/** C2: QUAL conta do MP recebe a linha (cobrança ou automática) que vai ao MP. Sem a W2 no schema, nada (a coluna não existe: o select dá
 *  42703 e o insert, PGRST204 — DEPOIS do POST). Com a W2: a da conta, o collector dela; a do MP do Physiq, nulo de propósito. */
export async function collectorDaLinha(db: SupabaseClient, schema: Schema, cred: CredencialMp):
  Promise<{ mp_collector_id?: number | null }> { // W2: depois do schemaTemW2 (a coluna só vai à linha com a W2 no schema)
  if (typeof cred !== "string") return await comCollector(db, schema, collectorDe(cred));
  return (await schemaTemW2(db, schema)) ? { mp_collector_id: null } : {}; // W2: depois do schemaTemW2
}

export interface AntigaDesligada {
  /** seguir: o POST da nova pode ir · assinatura_ja_ativa: a antiga autorizada de verdade (400) · assinatura_antiga_viva: 409, nenhum POST */
  resultado: "seguir" | "assinatura_ja_ativa" | "assinatura_antiga_viva";
  /** para o log de quem chama: cancelada · ja_cancelada · nao_achada · ativa · nao_cancelou · sem_resposta · sem_credencial · mp_fora · o
   *  motivo da conta sem acesso */
  motivo: string;
  /** o HTTP da última ida ao MP (null = não foi ao MP) */
  status: number | null;
}

/**
 * I11: antes do POST /preapproval de uma automática nova, a antiga VIVA da matrícula. `chamarDela` devolve a ida ao MP com a credencial DELA
 * (credencialDaAssinatura, escrita — o MP do Physiq ou outra conta do personal); null = outra conta do MP ou a desconectada (o Physiq não
 * alcança). GET → já cancelada ou não achada (404) nesta conta: segue · autorizada de verdade (não a do sandbox): assinatura_ja_ativa · viva:
 * PUT cancelled e SÓ segue com o GET de conferência em cancelled. Sem credencial, sem resposta que decida (5xx, o 401 de recurso de outra conta
 * — I2), a conexão caída ou o MP fora → assinatura_antiga_viva: não cria outra por cima. Erro do banco lança (o 500 antes de qualquer POST).
 */
export async function desligarAntiga(chamarDela: () => Promise<ChamarMp | null>,
  antiga: { mp_preapproval_id: string; payload: Record<string, unknown> | null }): Promise<AntigaDesligada> {
  try {
    const chamar = await chamarDela();
    if (!chamar) return { resultado: "assinatura_antiga_viva", motivo: "sem_credencial", status: null };
    const caminho = `/preapproval/${encodeURIComponent(antiga.mp_preapproval_id)}`;
    const { status: sa, body: pre } = await chamar<AssinaturaMp>(caminho);
    if (sa === 404) return { resultado: "seguir", motivo: "nao_achada", status: sa };
    if (sa !== 200) return { resultado: "assinatura_antiga_viva", motivo: "sem_resposta", status: sa };
    if (pre?.status === "cancelled") return { resultado: "seguir", motivo: "ja_cancelada", status: sa };
    if (pre?.status === "authorized" && antiga.payload?.sandbox !== true) return { resultado: "assinatura_ja_ativa", motivo: "ativa", status: sa };
    await chamar(caminho, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });   // a resposta não decide: o GET abaixo decide
    const { status: s2, body: depois } = await chamar<AssinaturaMp>(caminho);
    return s2 === 200 && depois?.status === "cancelled"
      ? { resultado: "seguir", motivo: "cancelada", status: s2 }
      : { resultado: "assinatura_antiga_viva", motivo: "nao_cancelou", status: s2 };
  } catch (e) {
    if (e instanceof MpContaSemAcesso) return { resultado: "assinatura_antiga_viva", motivo: e.motivo, status: null };
    if (e instanceof MpIndisponivel) return { resultado: "assinatura_antiga_viva", motivo: "mp_fora", status: e.status };
    throw e;
  }
}
