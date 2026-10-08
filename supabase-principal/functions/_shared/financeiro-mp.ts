// Physiq W6 — o que a pagamentos-aluno e a mp-webhook-aluno fazem igual (Mercado Pago + banco) na cobrança aluno →
// profissional: gravar o que o MP disse de um pagamento na cobrança (uma vez só — mp_payment_id único; a cobertura da
// mensalidade é refeita pelo gatilho do banco), registrar a cobrança mensal de uma assinatura e avisar no sino (NF9).
// O aviso do MP nunca é a verdade: quem chama sempre busca o recurso de novo na API.
// hml-10 (H-24): quem grava o aviso do sino recebe o log de quem chama + o schema do pedido (o aviso de erro diz a função de
// verdade e o [staging] certo) — o db não diz o schema.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import type { AssinaturaMp, PagamentoMp } from "./cobranca-regras.ts";
import { cobrancaDoStatusMp, descricaoMensalidade, diaSP, mesRefDe, mpEmAberto, type Schema } from "./financeiro-regras.ts";
import type { Log } from "./log.ts";

export const COLUNAS_COBRANCA =
  "id, paciente_id, conta_id, nutricionista_id, criado_por, tipo, descricao, valor, vencimento, status, forma, metodo, mes_ref, " +
  "pago_em, enviado_em, cobre_de, cobre_ate, comprovante_path, confirmado_por, confirmado_em, recusado_motivo, recusado_em, " +
  "reembolsado_em, mp_payment_id, mp_status, mp_preapproval_id, pix_qr, pix_copia_cola, pix_expira_em, plano_aluno_id, origem, " +
  "transacao_id, created_at, updated_at, deleted_at";

export interface Cobranca {
  id: string;
  paciente_id: string;
  conta_id: string | null;
  nutricionista_id: string | null;
  criado_por: string | null;
  tipo: "mensalidade" | "avulsa";
  descricao: string;
  valor: number;
  vencimento: string;
  status: string;
  forma: string | null;
  metodo: string | null;
  mes_ref: string | null;
  pago_em: string | null;
  enviado_em: string | null;
  cobre_de: string | null;
  cobre_ate: string | null;
  comprovante_path: string | null;
  confirmado_por: string | null;
  confirmado_em: string | null;
  recusado_motivo: string | null;
  recusado_em: string | null;
  reembolsado_em: string | null;
  mp_payment_id: string | null;
  mp_status: string | null;
  mp_preapproval_id: string | null;
  pix_qr: string | null;
  pix_copia_cola: string | null;
  pix_expira_em: string | null;
  plano_aluno_id: string | null;
  origem: string | null;
  transacao_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Matricula {
  id: string;
  conta_id: string | null;
  user_id: string | null;
  treino_user_id: string | null;
  nome: string;
  email: string | null;
  cpf: string | null;
  foto_url: string | null;
  ativo: boolean;
  tags: string[] | null;
  personal_id: string | null;
  nutricionista_id: string | null;
  plano_aluno_id: string | null;
  mensalidade_valor: number | null;
  cobranca_pausada: boolean;
  mensalidade_desde: string | null;
  mensalidade_pago_ate: string | null;
  deleted_at: string | null;
  /** W7b — aluno sem profissional (conta do app): o teste grátis e o objetivo */
  app_teste_de?: string | null;
  app_teste_ate?: string | null;
  objetivo_app?: string | null;
  conta: { id: string; nome: string; dono_id: string | null; recebimento_modo: string; bloquear_app_inadimplente: boolean; origem: string } | null;
  plano: { id: string; nome: string; codigo?: string | null } | null;
}

export const COLUNAS_MATRICULA =
  "id, conta_id, user_id, treino_user_id, nome, email, cpf, foto_url, ativo, tags, personal_id, nutricionista_id, plano_aluno_id, " +
  "mensalidade_valor, cobranca_pausada, mensalidade_desde, mensalidade_pago_ate, deleted_at, app_teste_de, app_teste_ate, objetivo_app, " +
  "conta:contas(id, nome, dono_id, recebimento_modo, bloquear_app_inadimplente, origem), plano:planos_aluno(id, nome, codigo)";

/** As colunas de antes da W7b — o schema que ainda não recebeu a migração (as funções valem para os 2 schemas ao mesmo tempo). */
const COLUNAS_MATRICULA_W6 =
  "id, conta_id, user_id, treino_user_id, nome, email, cpf, foto_url, ativo, tags, personal_id, nutricionista_id, plano_aluno_id, " +
  "mensalidade_valor, cobranca_pausada, mensalidade_desde, mensalidade_pago_ate, deleted_at, " +
  "conta:contas(id, nome, dono_id, recebimento_modo, bloquear_app_inadimplente, origem), plano:planos_aluno(id, nome)";

/** A matrícula é da conta do app (aluno sem profissional — W7b)? */
export function ehDoApp(m: Pick<Matricula, "conta"> | null | undefined): boolean {
  return m?.conta?.origem === "app";
}

export async function carregarMatricula(db: SupabaseClient, id: string): Promise<Matricula | null> {
  const { data, error } = await db.from("pacientes").select(COLUNAS_MATRICULA).eq("id", id).maybeSingle();
  if (error && /column|coluna|does not exist|42703|PGRST20/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
    // schema ainda sem a migração da W7b: as colunas de antes (a função é publicada uma vez para public e staging)
    const r = await db.from("pacientes").select(COLUNAS_MATRICULA_W6).eq("id", id).maybeSingle();
    if (r.error) throw r.error;
    return (r.data as unknown as Matricula | null) ?? null;
  }
  if (error) throw error;
  return (data as unknown as Matricula | null) ?? null;
}

/** Quem recebe a cobrança da mensalidade (o dono da conta; sem conta, o responsável). */
export function recebedor(m: Matricula): string | null {
  return m.conta?.dono_id ?? m.personal_id ?? m.nutricionista_id ?? null;
}

export async function avisar(
  db: SupabaseClient,
  destino: string | null | undefined,
  tipo: string,
  titulo: string,
  link: string | null,
  log: Log,
  schema: Schema,
): Promise<void> {
  if (!destino) return;
  const { error } = await db.from("avisos").insert({ destino_user_id: destino, tipo, titulo: titulo.slice(0, 160), link });
  // o título (nome, valor, motivo) fica só no sino: no log, o tipo e o erro do banco
  if (error) log.excecao(error, { codigo: "aviso_do_sino_falhou", schema, acao: tipo });
}

const reais = (v: number) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`;

/** Link do painel para o aluno (a lista antiga do Calc usa o id do Treino; o resto, o da matrícula). */
export function linkDoAlunoNoPainel(m: Pick<Matricula, "id" | "treino_user_id">): string {
  return `/painel/alunos/${m.treino_user_id ?? m.id}/financeiro`;
}

export interface ResultadoMp {
  status: string;
  mudou: boolean;
  pagou: boolean;
}

/**
 * Grava na cobrança o que o MP disse do pagamento (status, id, datas). Aprovado → paga (pago_em = aprovação) e o aluno é
 * avisado 1 vez (só na virada para paga). Estorno depois de paga → cancelada com reembolsado_em. Pix de 72 h que venceu com o
 * MP ainda dizendo "pending" → cancelada (a cobrança avulsa volta a ficar em aberto).
 */
export async function aplicarPagamentoMp(
  db: SupabaseClient,
  c: Cobranca,
  pay: PagamentoMp,
  m: Matricula | null | undefined,
  log: Log,
  schema: Schema,
): Promise<ResultadoMp> {
  let mpStatus = String(pay.status || "pending");
  if (mpEmAberto(mpStatus) && c.pix_expira_em && new Date(c.pix_expira_em).getTime() < Date.now() - 60_000) mpStatus = "expired";
  const alvo = cobrancaDoStatusMp(mpStatus);
  // paga é final: só estorno/chargeback mudam (aviso atrasado de "cancelled" do sandbox não desfaz o que foi pago)
  if (c.status === "paga" && !alvo.reembolso) {
    if (c.mp_status !== mpStatus && mpStatus === "approved") await db.from("cobrancas").update({ mp_status: mpStatus }).eq("id", c.id);
    return { status: c.status, mudou: false, pagou: false };
  }
  const patch: Record<string, unknown> = { mp_status: mpStatus };
  if (!c.mp_payment_id && pay.id !== undefined && pay.id !== null) patch.mp_payment_id = String(pay.id);
  let status = alvo.status;
  if (alvo.final && !alvo.reembolso && c.tipo === "avulsa") {
    // a avulsa não morre com o Pix vencido/recusado: volta a ficar em aberto para pagar de outro jeito
    status = "aberta";
    Object.assign(patch, { forma: null, mp_payment_id: null, pix_qr: null, pix_copia_cola: null, pix_expira_em: null });
  }
  patch.status = status;
  if (status === "paga") patch.pago_em = pay.date_approved ?? new Date().toISOString();
  if (alvo.reembolso && c.status === "paga") patch.reembolsado_em = new Date().toISOString();
  if (status === c.status && c.mp_status === mpStatus) return { status, mudou: false, pagou: false };
  const { error } = await db.from("cobrancas").update(patch).eq("id", c.id);
  if (error) throw error;
  const pagou = status === "paga" && c.status !== "paga";
  if (pagou) {
    const mat = m ?? (await carregarMatricula(db, c.paciente_id));
    await avisar(db, mat?.user_id, "pagamento_confirmado", `Pagamento confirmado · ${reais(c.valor)}`, "/perfil/pagamentos", log, schema);
  }
  return { status, mudou: true, pagou };
}

/**
 * Pagamento que o MP fez fora de uma cobrança nossa (a mensal de uma assinatura, ou um Pix/cartão avulso criado pelo Calc
 * antigo): vira uma cobrança de mensalidade da matrícula (mp_payment_id único — o aviso e a conferência podem chegar juntos)
 * e aplica o status como as demais.
 */
export async function registrarPagamentoAvulsoDoMp(
  db: SupabaseClient,
  m: Matricula,
  pay: PagamentoMp,
  extra: { preapprovalId?: string | null; origem: string; mesRef?: string | null },
  log: Log,
  schema: Schema,
): Promise<ResultadoMp | null> {
  if (pay?.id === undefined || pay?.id === null) return null;
  const mpId = String(pay.id);
  const colunas = COLUNAS_COBRANCA;
  let { data: linha } = await db.from("cobrancas").select(colunas).eq("mp_payment_id", mpId).maybeSingle();
  if (!linha) {
    const dia = diaSP(pay.date_approved ?? pay.date_created ?? new Date().toISOString()) ?? new Date().toISOString().slice(0, 10);
    const mes = extra.mesRef ?? mesRefDe(dia);
    const valor = Number(pay.transaction_amount) > 0 ? Number(pay.transaction_amount) : Number(m.mensalidade_valor ?? 0);
    if (!(valor > 0)) return null;
    const dono = recebedor(m);
    if (!dono) return null;
    const { data: nova, error } = await db.from("cobrancas").insert({
      paciente_id: m.id, conta_id: m.conta_id, nutricionista_id: dono, criado_por: null, tipo: "mensalidade",
      descricao: descricaoMensalidade(m.plano?.nome ?? null, mes), valor, vencimento: dia, mes_ref: mes,
      status: "aguardando_confirmacao", forma: "mp", metodo: pay.payment_method_id === "pix" ? "pix" : "cartao",
      mp_payment_id: mpId, mp_status: "pending", mp_preapproval_id: extra.preapprovalId ?? null,
      plano_aluno_id: m.plano_aluno_id, origem: extra.origem,
    }).select(colunas).maybeSingle();
    if (error && !String(error.message || "").includes("duplicate")) throw error;
    linha = nova ?? (await db.from("cobrancas").select(colunas).eq("mp_payment_id", mpId).maybeSingle()).data;
  }
  if (!linha) return null;
  return await aplicarPagamentoMp(db, linha as unknown as Cobranca, pay, m, log, schema);
}

/** O que vai pra aluno_assinaturas a partir da assinatura do MP (fonte da verdade). */
export function espelhoAssinaturaAluno(pre: AssinaturaMp, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const valor = Number(pre.auto_recurring?.transaction_amount);
  return {
    mp_preapproval_id: String(pre.id),
    status: ["pending", "authorized", "paused", "cancelled"].includes(String(pre.status)) ? String(pre.status) : "pending",
    ...(valor > 0 ? { valor } : {}),
    proximo_vencimento: pre.next_payment_date || pre.auto_recurring?.next_payment_date || pre.summarized?.next_payment_date || null,
    payload: { ...extra, init_point: pre.init_point ?? null, external_reference: pre.external_reference ?? null, status: pre.status ?? null },
  };
}

/** Schema da credencial que achou o recurso: produção só vale no public; teste só no staging. */
export function schemaDaCredencial(c: "prod" | "test"): Schema {
  return c === "prod" ? "public" : "staging";
}
