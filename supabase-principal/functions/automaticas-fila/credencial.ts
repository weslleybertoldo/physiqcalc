// supabase-principal/functions/automaticas-fila/credencial.ts
// Physiq W2 — a credencial de CADA automática na fila (a do MP do Physiq ou a da conta do personal — o mp_collector_id da assinatura): o
// PUT do valor vai à conta certa (MENOR 2: assinaturaComoNoMp e trocarValorDaAutomatica recebem a CredencialMp). Só a automática que vai
// ao MP (viva e de verdade — o mesmo corte do assinaturaComoNoMp e do novoValorDaAutomatica) precisa da credencial: a cancelada, a
// simulada do staging ou a sem id fecham "sem_automatica" sem ir ao MP — sem este corte, a cancelada numa conta desconectada (ou em
// erro) falharia 24 vezes e avisaria o dono à toa. Sem acesso ao MP da conta (desconectada, em erro, vencida, outra conta do MP ou sem a
// MP_TOKENS_CHAVE — o getter lança MpContaSemAcesso) → semAcesso: a fila tenta de hora em hora e, na 24ª, desiste e avisa (o de hoje).
// Sem import de URL (só tipo) e sem o global Deno: o Vitest importa (src/financeiro/mpContaAviso.test.ts).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import type { Credencial, CredencialMp, Schema } from "../_shared/cobranca-mp.ts";
import { MpContaSemAcesso, colunasAssinatura, credencialDaAssinatura, type ContextoMpConta } from "../_shared/mp-conta.ts";
import type { AssinaturaDoAluno } from "../_shared/planos-automatica-mp.ts";

/** A assinatura do aluno como a fila lê: + o aluno, a conta e (com a W2 no schema) a conta do MP que recebe. */
export interface AssinaturaDaFila extends AssinaturaDoAluno {
  paciente_id: string;
  conta_id: string | null;
  mp_collector_id?: number | string | null;
}

/** A assinatura mais recente do aluno (a mesma leitura do assinaturaDe da pagamentos-aluno). C2: as colunas pelo colunasAssinatura — a
 *  mp_collector_id só com a W2 no schema (sem ela, o select com a coluna dava 42703 e a fila inteira falhava no public). Erro lança. */
export async function assinaturaDoAluno(db: SupabaseClient, schema: Schema, pacienteId: string): Promise<AssinaturaDaFila | null> {
  const { data, error } = await db.from("aluno_assinaturas").select(await colunasAssinatura(db, schema))
    .eq("paciente_id", pacienteId).order("criado_em", { ascending: false }).limit(1);
  if (error) throw error;
  return ((data ?? []) as unknown as AssinaturaDaFila[])[0] ?? null;
}

const VIVAS = ["authorized", "pending", "paused"];
/** A automática vai ao MP nesta pendência? Viva e de verdade (com o id do MP, sem o "sim-" nem a simulada do staging). */
export function vaiAoMp(a: AssinaturaDaFila | null): a is AssinaturaDaFila {
  return !!a && VIVAS.includes(a.status) && !!a.mp_preapproval_id && !a.mp_preapproval_id.startsWith("sim-") && a.payload?.simulada !== true;
}

export type CredencialDaPendencia = { cred: CredencialMp; semAcesso?: undefined } | { cred?: undefined; semAcesso: string };

/** A credencial desta automática (credencialDaAssinatura com escrita: o PUT muda o valor). `ctxMp` é GETTER: o MP do Physiq nunca o chama
 *  (a fila do Physiq segue sem a MP_TOKENS_CHAVE). Erro do banco lança. */
export async function credencialDaPendencia(db: SupabaseClient, ctxMp: () => ContextoMpConta, a: AssinaturaDaFila | null,
  physiq: Credencial): Promise<CredencialDaPendencia> {
  if (!vaiAoMp(a)) return { cred: physiq };                                              // nada vai ao MP: a credencial nem importa
  try {
    const cred = await credencialDaAssinatura(db, ctxMp, a, physiq, { escrita: true });
    return cred ? { cred } : { semAcesso: "outra_conta_ou_desconectada" };
  } catch (e) {
    if (e instanceof MpContaSemAcesso) return { semAcesso: e.motivo };
    throw e;
  }
}
