// Physiq W7b — o que as funções do banco principal fazem igual com o aluno SEM profissional (a "conta do app", contas.origem =
// 'app'): achar a conta do app, dizer se a pessoa está nela (a prévia do vínculo avisa que a mensalidade do app para) e cancelar
// no Mercado Pago a assinatura do app de quem saiu dele (entrou na lista de um profissional — P7; o banco já encerrou a
// matrícula do app em matricular_na_conta). Usado pela vincular-aluno, pela pos-login, pela pagamentos-aluno (rede de segurança
// no Pagamentos) e pela mp-webhook-aluno (cobrança recorrente que chegou para uma matrícula do app já encerrada).
// Regras puras (sem Deno e sem rede) em _shared/app-sem-profissional-regras.ts — testadas no Vitest (src/app-aluno/sozinho/regras.test.ts).
// hml-10 (H-24): o cancelamento recebe o log de quem chama (o aviso de erro diz a função de verdade); o schema do log sai da
// credencial (teste = staging, produção = public — o inverso do credencialDoSchema).
// hml-14 (H-32): erro do banco (leitura ou gravação) LANÇA em todas as funções daqui — antes virava "não tem" (conta do app
// null, nenhuma matrícula, nenhuma assinatura) e o cancelamento saía {0, 0} sem log, com a assinatura do app cobrando; e o
// cancelamento também lança quando o MP não deixa decidir (MpIndisponivel). Quem chama decide (a exclusão para antes de apagar;
// login, vínculo e Pagamentos registram e tentam de novo na próxima vez). As idas ao MP usam o prazo do pedido (`opcoes`).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { assinaturaSoNoBanco, encerradaPeloVinculo } from "./app-sem-profissional-regras.ts";
import { codigosDoMp, mpTransitorio, type AssinaturaMp } from "./cobranca-regras.ts";
import { MpIndisponivel, mpFetch, type Credencial, type OpcoesMp } from "./cobranca-mp.ts";
import { schemaDaCredencial } from "./financeiro-mp.ts";
import type { Log } from "./log.ts";
import { emLotes, todasAsPaginas } from "./paginas.ts";

export { assinaturaSoNoBanco, assinaturaViva, encerradaPeloVinculo } from "./app-sem-profissional-regras.ts";

/** A conta do app deste schema (uma só — índice único contas_app_unica). Erro do banco lança (hml-14: antes virava null). */
export async function contaDoApp(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db.from("contas").select("id").eq("origem", "app").order("criado_em").limit(1);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
}

export interface AppDaPessoa {
  paciente_id: string;
  valor: number | null;
  plano: string | null;
  assinatura_ativa: boolean;
}

/** A matrícula ATIVA da pessoa no app (null = não é aluno do app agora). Erro do banco lança (a prévia responde 500). */
export async function appDaPessoa(db: SupabaseClient, userId: string): Promise<AppDaPessoa | null> {
  const app = await contaDoApp(db);
  if (!app) return null;
  const { data, error } = await db.from("pacientes").select("id, mensalidade_valor, plano:planos_aluno(nome)")
    .eq("user_id", userId).eq("conta_id", app).eq("ativo", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(1);
  if (error) throw error;
  const m = ((data ?? []) as unknown as Array<{ id: string; mensalidade_valor: number | null; plano: { nome: string } | null }>)[0];
  if (!m) return null;
  const { data: ass, error: erroAss } = await db.from("aluno_assinaturas").select("id").eq("paciente_id", m.id).in("status", ["authorized", "pending"]).limit(1);
  if (erroAss) throw erroAss;
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
  log: Log,
  opcoes: OpcoesMp = {},
): Promise<{ canceladas: number; falhas: number }> {
  const app = await contaDoApp(db);
  if (!app) return { canceladas: 0, falhas: 0 };
  const { data: mats, error } = await db.from("pacientes").select("id, ativo, app_encerrada_em").eq("user_id", userId).eq("conta_id", app)
    .eq("ativo", false).not("app_encerrada_em", "is", null).is("deleted_at", null);
  if (error) throw error;
  const ids = ((mats ?? []) as Array<{ id: string; ativo: boolean | null; app_encerrada_em: string | null }>)
    .filter(encerradaPeloVinculo).map((m) => m.id);
  if (!ids.length) return { canceladas: 0, falhas: 0 };
  return await cancelarAssinaturasDasMatriculas(db, credencial, ids, motivo, log, opcoes);
}

/** A matrícula (do app) foi encerrada pelo vínculo? Lê o marcador no banco (o webhook só cancela nesse caso — W19). Erro lança. */
export async function matriculaEncerradaPeloVinculo(db: SupabaseClient, pacienteId: string): Promise<boolean> {
  const { data, error } = await db.from("pacientes").select("ativo, app_encerrada_em").eq("id", pacienteId).maybeSingle();
  if (error) throw error; // hml-14: antes o erro virava "desativada à mão" e a assinatura do app seguia viva
  return !!data && encerradaPeloVinculo(data as { ativo: boolean | null; app_encerrada_em: string | null });
}

/** Grava a assinatura como cancelada; o erro lança (hml-14: antes contava como cancelada e o banco podia ficar "authorized"). */
async function marcarCancelada(db: SupabaseClient, id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("aluno_assinaturas").update({ status: "cancelled", payload }).eq("id", id);
  if (error) throw error;
}

/**
 * Cancela as assinaturas vivas destas matrículas (no MP e no banco). Lança no erro do banco e quando o MP não deixa decidir
 * (o PUT não cancelou e a conferência também não respondeu: fora do ar, limite ou tempo esgotado → MpIndisponivel); o MP que
 * responde e recusa conta como falha (log mp_cancelar_falhou), como sempre.
 */
export async function cancelarAssinaturasDasMatriculas(
  db: SupabaseClient,
  credencial: Credencial,
  pacienteIds: string[],
  motivo: string,
  log: Log,
  opcoes: OpcoesMp = {},
): Promise<{ canceladas: number; falhas: number }> {
  // hml-14 (H-32): em lotes de 150 (a exclusão do profissional passa todos os alunos dele: o .in() com centenas de uuid estoura
  // a URL) e com todas as páginas (sem o corte calado de 1000 linhas)
  const linhas = await emLotes(pacienteIds, 150, (lote) =>
    todasAsPaginas<LinhaAssinatura>((de, ate) =>
      db.from("aluno_assinaturas").select("id, paciente_id, mp_preapproval_id, status, payload")
        .in("paciente_id", lote).in("status", ["authorized", "pending", "paused"]).order("id").range(de, ate)));
  let canceladas = 0;
  let falhas = 0;
  for (const a of linhas) {
    const payload = { ...(a.payload ?? {}), cancelada_por: "w07b", motivo_cancelamento: motivo, cancelada_em: new Date().toISOString() };
    if (assinaturaSoNoBanco(a)) {
      await marcarCancelada(db, a.id, payload);
      canceladas++;
      continue;
    }
    const caminho = `/preapproval/${encodeURIComponent(a.mp_preapproval_id!)}`;
    const { status, body } = await mpFetch<AssinaturaMp>(credencial, caminho, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) }, opcoes);
    if (status >= 300 || !body?.id) {
      // já cancelada no MP devolve 400 em alguns casos: confere o estado real antes de contar como falha
      const { status: s2, body: atual } = await mpFetch<AssinaturaMp>(credencial, caminho, {}, opcoes);
      if (s2 === 200 && atual?.status === "cancelled") {
        await marcarCancelada(db, a.id, payload);
        canceladas++;
      } else if (mpTransitorio(s2)) {
        throw new MpIndisponivel(s2); // hml-14: sem resposta que decida (599 = rede ou prazo do pedido esgotado)
      } else {
        // hml-10 (H-24): só os códigos do MP (o corpo da resposta pode trazer dado de quem paga)
        log.erro({
          codigo: "mp_cancelar_falhou", schema: schemaDaCredencial(credencial), acao: "assinatura_do_app", ref: a.id, status,
          externo: codigosDoMp(body),
        });
        falhas++;
      }
      continue;
    }
    await marcarCancelada(db, a.id, payload);
    canceladas++;
  }
  return { canceladas, falhas };
}
