// Physiq W7b — o que as funções do banco principal fazem igual com o aluno SEM profissional (a "conta do app", contas.origem =
// 'app'): achar a conta do app, dizer se a pessoa está nela (a prévia do vínculo avisa que a mensalidade do app para) e cancelar
// no Mercado Pago a assinatura do app de quem saiu dele (entrou na lista de um profissional — P7; o banco já encerrou a
// matrícula do app em matricular_na_conta). Usado pela vincular-aluno, pela pos-login, pela pagamentos-aluno (rede de segurança
// no Pagamentos) e pela mp-webhook-aluno (cobrança recorrente que chegou para uma matrícula do app já encerrada).
// Regras puras (sem Deno e sem rede) em _shared/app-sem-profissional-regras.ts — testadas no Vitest (src/app-aluno/sozinho/regras.test.ts).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { assinaturaSoNoBanco, encerradaPeloVinculo } from "./app-sem-profissional-regras.ts";
import type { AssinaturaMp } from "./cobranca-regras.ts";
import { mpFetch, type Credencial } from "./cobranca-mp.ts";

export { assinaturaSoNoBanco, assinaturaViva, encerradaPeloVinculo } from "./app-sem-profissional-regras.ts";

/** A conta do app deste schema (uma só — índice único contas_app_unica). */
export async function contaDoApp(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from("contas").select("id").eq("origem", "app").order("criado_em").limit(1);
  return ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
}

export interface AppDaPessoa {
  paciente_id: string;
  valor: number | null;
  plano: string | null;
  assinatura_ativa: boolean;
}

/** A matrícula ATIVA da pessoa no app (null = não é aluno do app agora). */
export async function appDaPessoa(db: SupabaseClient, userId: string): Promise<AppDaPessoa | null> {
  const app = await contaDoApp(db);
  if (!app) return null;
  const { data } = await db.from("pacientes").select("id, mensalidade_valor, plano:planos_aluno(nome)")
    .eq("user_id", userId).eq("conta_id", app).eq("ativo", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(1);
  const m = ((data ?? []) as unknown as Array<{ id: string; mensalidade_valor: number | null; plano: { nome: string } | null }>)[0];
  if (!m) return null;
  const { data: ass } = await db.from("aluno_assinaturas").select("id").eq("paciente_id", m.id).in("status", ["authorized", "pending"]).limit(1);
  return {
    paciente_id: m.id,
    valor: m.mensalidade_valor === null ? null : Number(m.mensalidade_valor),
    plano: m.plano?.nome ?? null,
    assinatura_ativa: ((ass ?? []) as unknown[]).length > 0,
  };
}

interface LinhaAssinatura {
  id: string;
  paciente_id: string;
  mp_preapproval_id: string | null;
  status: string;
  payload: Record<string, unknown> | null;
}

/**
 * Cancela no Mercado Pago as assinaturas ainda vivas das matrículas do app JÁ ENCERRADAS PELO VÍNCULO da pessoa (entrou na
 * lista de um profissional — `app_encerrada_em` preenchido). A matrícula do app desativada à mão (sem o marcador) NÃO entra:
 * desativar não é ir para um profissional (W19 — o "Desativar" do site antigo cancelaria a assinatura de quem continua no
 * app). Idempotente: cancelada não volta; falha no MP fica registrada no log e é tentada de novo no próximo
 * Pagamentos/login/aviso do MP. Sem reembolso automático do mês já pago (decisão da W7b — o Weslley revisa).
 */
export async function cancelarAssinaturasDoAppEncerrado(
  db: SupabaseClient,
  credencial: Credencial,
  userId: string,
  motivo: string,
): Promise<{ canceladas: number; falhas: number }> {
  const app = await contaDoApp(db);
  if (!app) return { canceladas: 0, falhas: 0 };
  const { data: mats } = await db.from("pacientes").select("id, ativo, app_encerrada_em").eq("user_id", userId).eq("conta_id", app)
    .eq("ativo", false).not("app_encerrada_em", "is", null).is("deleted_at", null);
  const ids = ((mats ?? []) as Array<{ id: string; ativo: boolean | null; app_encerrada_em: string | null }>)
    .filter(encerradaPeloVinculo).map((m) => m.id);
  if (!ids.length) return { canceladas: 0, falhas: 0 };
  return await cancelarAssinaturasDasMatriculas(db, credencial, ids, motivo);
}

/** A matrícula (do app) foi encerrada pelo vínculo? Lê o marcador no banco (o webhook só cancela nesse caso — W19). */
export async function matriculaEncerradaPeloVinculo(db: SupabaseClient, pacienteId: string): Promise<boolean> {
  const { data } = await db.from("pacientes").select("ativo, app_encerrada_em").eq("id", pacienteId).maybeSingle();
  return !!data && encerradaPeloVinculo(data as { ativo: boolean | null; app_encerrada_em: string | null });
}

/** Cancela as assinaturas vivas destas matrículas (no MP e no banco). */
export async function cancelarAssinaturasDasMatriculas(
  db: SupabaseClient,
  credencial: Credencial,
  pacienteIds: string[],
  motivo: string,
): Promise<{ canceladas: number; falhas: number }> {
  const { data } = await db.from("aluno_assinaturas").select("id, paciente_id, mp_preapproval_id, status, payload")
    .in("paciente_id", pacienteIds).in("status", ["authorized", "pending", "paused"]);
  let canceladas = 0;
  let falhas = 0;
  for (const a of (data ?? []) as LinhaAssinatura[]) {
    const payload = { ...(a.payload ?? {}), cancelada_por: "w07b", motivo_cancelamento: motivo, cancelada_em: new Date().toISOString() };
    if (assinaturaSoNoBanco(a)) {
      await db.from("aluno_assinaturas").update({ status: "cancelled", payload }).eq("id", a.id);
      canceladas++;
      continue;
    }
    const { status, body } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(a.mp_preapproval_id!)}`, {
      method: "PUT", body: JSON.stringify({ status: "cancelled" }),
    });
    if (status >= 300 || !body?.id) {
      // já cancelada no MP devolve 400 em alguns casos: confere o estado real antes de contar como falha
      const { status: s2, body: atual } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(a.mp_preapproval_id!)}`);
      if (s2 === 200 && atual?.status === "cancelled") {
        await db.from("aluno_assinaturas").update({ status: "cancelled", payload }).eq("id", a.id);
        canceladas++;
      } else {
        console.error("app: cancelar assinatura falhou", a.id, status, JSON.stringify(body).slice(0, 300));
        falhas++;
      }
      continue;
    }
    await db.from("aluno_assinaturas").update({ status: "cancelled", payload }).eq("id", a.id);
    canceladas++;
  }
  return { canceladas, falhas };
}
