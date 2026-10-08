// Physiq W4 — regras PURAS da cobrança das contas (spec §6.2 e §6.6). Sem Deno, sem rede e sem banco: usadas pela
// cobranca-conta e pela mp-webhook-conta e testadas no Vitest (src/nucleo/cobranca/servidor.test.ts), que também confere
// que casam com as regras da tela (src/nucleo/cobranca/regras.ts) e com o SQL da migração 20260929090000_w04_cobranca.sql.

export type PlanoConta = "treino" | "nutricao" | "treino_nutricao";
export type Faixa = "f10" | "f30" | "f100" | "livre";
export type SituacaoConta = "teste" | "ativa" | "vencida" | "isenta" | "suspensa" | "cancelada";
export type StatusFatura = "pending" | "approved" | "rejected" | "cancelled" | "expired" | "refunded" | "charged_back" | "in_process";
export type TipoCobranca = "mensal" | "anual" | "recorrente";

export const PLANOS: PlanoConta[] = ["treino", "nutricao", "treino_nutricao"];
export const FAIXAS: Faixa[] = ["f10", "f30", "f100", "livre"];

export const NOME_PLANO: Record<PlanoConta, string> = {
  treino: "Só Treino",
  nutricao: "Só Nutrição",
  treino_nutricao: "Treino + Nutrição",
};
export const NOME_FAIXA: Record<Faixa, string> = {
  f10: "até 10 alunos",
  f30: "até 30 alunos",
  f100: "até 100 alunos",
  livre: "alunos sem limite",
};

/** Pix vale 72 h (a régua do Nutri — spec 6.2). */
export const PIX_EXPIRA_HORAS = 72;

export function ehPlano(v: unknown): v is PlanoConta {
  return typeof v === "string" && (PLANOS as string[]).includes(v);
}
export function ehFaixa(v: unknown): v is Faixa {
  return typeof v === "string" && (FAIXAS as string[]).includes(v);
}

/** "Physiq — Treino + Nutrição (até 10 alunos) — 1 mês" */
export function descricaoCobranca(plano: PlanoConta, faixa: Faixa, meses: number): string {
  return `Physiq — ${NOME_PLANO[plano]} (${NOME_FAIXA[faixa]}) — ${meses === 12 ? "12 meses (anual)" : "1 mês"}`;
}

// ───────────────────────── referência externa (spec 6.6) ─────────────────────────

/**
 * `physiq:<schema>:conta:<conta_id>:<tipo>` (spec 6.6) + `:<fatura_id>` nas cobranças avulsas — o webhook acha a fatura
 * mesmo quando o aviso chega antes de a função gravar o id do pagamento (cartão aprovado na hora).
 */
export function referenciaConta(schema: string, contaId: string, tipo: TipoCobranca, faturaId?: string | null): string {
  return `physiq:${schema}:conta:${contaId}:${tipo}${faturaId ? `:${faturaId}` : ""}`;
}

export interface Referencia {
  schema: "public" | "staging";
  contaId: string;
  tipo: TipoCobranca;
  faturaId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** Só as referências das contas do Physiq (o Calc usa `<schema>:<user>…` e o Nutri `physiqnutri…`: não são daqui). */
export function lerReferencia(ref: string | null | undefined): Referencia | null {
  const partes = String(ref ?? "").split(":");
  if (partes.length < 5 || partes.length > 6 || partes[0] !== "physiq" || partes[2] !== "conta") return null;
  const [, schema, , contaId, tipo, faturaId] = partes;
  if (schema !== "public" && schema !== "staging") return null;
  if (!ehUuid(contaId)) return null;
  if (tipo !== "mensal" && tipo !== "anual" && tipo !== "recorrente") return null;
  if (faturaId !== undefined && !ehUuid(faturaId)) return null;
  return { schema, contaId, tipo, faturaId: faturaId ?? null };
}

/**
 * W28 — referências das cobranças que os APPS ANTIGOS criaram (as assinaturas e os pagamentos de antes da virada continuam
 * avisando; o repasse traz para cá):
 *   Calc (professor): "<schema>:<user_id do Treino>:<mes_ref>:plano_professor[:adesao|mensal|anual]"
 *   Nutri (assinatura): "physiqnutri:<schema>:<user_id>"   ·   Nutri (Pix de 30 dias): "physiqnutri-pix:<schema>:<user_id>"
 * Aluno do Calc ("…:aluno") não é daqui (vai para a mp-webhook-aluno).
 */
export interface ReferenciaLegada {
  app: "calc" | "nutri";
  schema: "public" | "staging";
  userId: string;
  tipo: "adesao" | "mensal" | "anual" | "recorrente" | "pix";
}

export function lerReferenciaLegada(ref: string | null | undefined): ReferenciaLegada | null {
  const partes = String(ref ?? "").split(":");
  if ((partes[0] === "physiqnutri" || partes[0] === "physiqnutri-pix") && partes.length === 3) {
    const [prefixo, schema, uid] = partes;
    if ((schema !== "public" && schema !== "staging") || !ehUuid(uid)) return null;
    return { app: "nutri", schema, userId: uid, tipo: prefixo === "physiqnutri-pix" ? "pix" : "recorrente" };
  }
  if (partes.length >= 4 && (partes[0] === "public" || partes[0] === "staging") && ehUuid(partes[1]) && partes[3] === "plano_professor") {
    const t = partes[4] || "mensal";
    const tipo = t === "adesao" || t === "anual" ? t : "mensal";
    return { app: "calc", schema: partes[0], userId: partes[1], tipo };
  }
  return null;
}

/** A fatura que um pagamento antigo vira no núcleo: anual = 12 meses; o resto (adesão do Calc, mensal, Pix de 30 dias) = 1. */
export function faturaDaReferenciaLegada(r: ReferenciaLegada): { tipo: "mensal" | "anual" | "pix_avulso" | "recorrente"; meses: number } {
  if (r.tipo === "anual") return { tipo: "anual", meses: 12 };
  if (r.tipo === "pix") return { tipo: "pix_avulso", meses: 1 };
  if (r.tipo === "recorrente") return { tipo: "recorrente", meses: 1 };
  return { tipo: "mensal", meses: 1 };
}

// ───────────────────────── Mercado Pago → fatura ─────────────────────────

export interface PagamentoMp {
  id?: number | string;
  status?: string | null;
  status_detail?: string | null;
  transaction_amount?: number | string | null;
  external_reference?: string | null;
  date_approved?: string | null;
  date_created?: string | null;
  date_of_expiration?: string | null;
  payment_method_id?: string | null;
  metadata?: { preapproval_id?: string | null } | null;
  point_of_interaction?: { transaction_data?: { qr_code?: string | null; qr_code_base64?: string | null; subscription_id?: string | null } | null } | null;
}

/** Status do pagamento no MP → o da fatura. Pix vencido chega como cancelled/expired (status_detail). */
export function statusDaFatura(pay: Pick<PagamentoMp, "status" | "status_detail">): StatusFatura {
  const st = String(pay?.status || "pending");
  const detalhe = String(pay?.status_detail || "").toLowerCase();
  switch (st) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "refunded":
      return "refunded";
    case "charged_back":
      return "charged_back";
    case "in_process":
    case "in_mediation":
      return "in_process";
    case "cancelled":
      return detalhe.includes("expir") ? "expired" : "cancelled";
    default:
      return "pending"; // pending, authorized
  }
}

/** Status que ainda podem mudar sozinhos (a tela e o webhook conferem de novo no MP). */
export function statusAberto(status: string | null | undefined): boolean {
  return status === "pending" || status === "in_process";
}

/** De qual assinatura é a cobrança (o PhysiqCalc e o Nativo OS olham os 2 lugares); avulso = null. */
export function preapprovalDoPagamento(pay: Pick<PagamentoMp, "metadata" | "point_of_interaction">): string | null {
  const id = pay?.metadata?.preapproval_id || pay?.point_of_interaction?.transaction_data?.subscription_id || null;
  return id ? String(id) : null;
}

export interface AssinaturaMp {
  id?: string;
  status?: string | null;
  next_payment_date?: string | null;
  auto_recurring?: { transaction_amount?: number | null; next_payment_date?: string | null } | null;
  summarized?: { next_payment_date?: string | null; last_charged_date?: string | null } | null;
  init_point?: string | null;
  external_reference?: string | null;
}

export const STATUS_ASSINATURA = ["pending", "authorized", "paused", "cancelled"] as const;
export type StatusAssinatura = (typeof STATUS_ASSINATURA)[number];

export function statusDaAssinatura(pre: Pick<AssinaturaMp, "status">): StatusAssinatura {
  const st = String(pre?.status || "pending");
  return (STATUS_ASSINATURA as readonly string[]).includes(st) ? (st as StatusAssinatura) : "pending";
}

/** Próxima cobrança da assinatura lida no MP (3 lugares possíveis). */
export function proximaCobrancaDe(pre: AssinaturaMp | null | undefined): string | null {
  return pre?.next_payment_date || pre?.auto_recurring?.next_payment_date || pre?.summarized?.next_payment_date || null;
}

/**
 * O `/preapproval` com cartão NÃO tem ambiente de teste no MP: com a credencial TEST- ele recusa (404 "Card token service
 * not found" no PhysiqCalc; 400 "Resource not found" no Nativo OS e aqui, em 29/09/2026).
 */
export function recusaDoSandbox(status: number, body: unknown): boolean {
  if (status !== 400 && status !== 404) return false;
  const msg = String((body as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return msg.includes("resource not found") || msg.includes("card token service not found");
}

/** Cartão ruim nem sempre vem como 400: com token inválido o MP responde 500 "Preapproval creation failed" (Nutri W49). */
export function erroDeCartao(status: number, body: unknown): boolean {
  const msg = String((body as { message?: unknown; error?: unknown } | null)?.message ?? (body as { error?: unknown } | null)?.error ?? "").toLowerCase();
  return status === 400 || msg.includes("preapproval creation failed") || msg.includes("card_token") || msg.includes("card token");
}

/** Os códigos de uma resposta do Mercado Pago que podem ir para o log (o campo `externo` do _shared/log.ts). */
export interface CodigosDoMp {
  mp_erro?: unknown;
  mp_causas?: unknown;
  mp_status_detail?: unknown;
}

/**
 * hml-10 (H-24) — o MP recusou: para o log vão SÓ os códigos da resposta (`error`, os `cause[].code` e o `status_detail`),
 * nunca o corpo (a resposta do MP pode trazer e-mail, nome e documento de quem paga). O log confere o formato de cada um.
 */
export function codigosDoMp(corpo: unknown): CodigosDoMp {
  const c = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {};
  const causas = (Array.isArray(c.cause) ? c.cause : [])
    .map((x) => (x && typeof x === "object" ? (x as { code?: unknown }).code : null))
    .filter((x) => x !== null && x !== undefined);
  return {
    ...(c.error !== undefined && c.error !== null ? { mp_erro: c.error } : {}),
    ...(causas.length ? { mp_causas: causas } : {}),
    ...(c.status_detail !== undefined && c.status_detail !== null ? { mp_status_detail: c.status_detail } : {}),
  };
}

// ───────────────────────── avisos do Mercado Pago (hml-06, H-19) ─────────────────────────
// Cópia igual em supabase/functions/mp-webhook/regras.ts (o Treino não enxerga este _shared); o Vitest
// (src/nucleo/cobranca/avisosMp.test.ts) confere que as 2 dão o mesmo resultado.

/** MP sem resposta que permita decidir (fora do ar, limite, credencial recusada); 599 = rede (mpFetch). O aviso volta 500. */
export const mpTransitorio = (st: number) => st >= 500 || st === 429 || st === 401;

/**
 * O recurso só vale na credencial que o leu se o MODO dele bate: produção ↔ live_mode true, teste ↔ false. A credencial de
 * TESTE também LÊ pagamentos de produção (o MP devolve 200 com live_mode=true — medido em 08/10/2026 no E2E da hml-06), e sem
 * isto um pagamento real valia no staging. Sem o campo (nem todo recurso do MP traz), vale a credencial.
 */
export function modoConfere(credencial: "prod" | "test", recurso: unknown): boolean {
  const modo = (recurso as { live_mode?: unknown } | null)?.live_mode;
  return typeof modo !== "boolean" || modo === (credencial === "prod");
}

/**
 * O id do aviso vai no CAMINHO da API do MP: só o formato que o MP manda (pagamento = só dígitos; assinatura = letras e
 * dígitos). Sem isto, "../../users/me" fazia a função pública (sem JWT) ler qualquer rota do MP com o token de produção.
 */
export function idDoAvisoValido(topico: string, id: string): boolean {
  if (topico === "payment" || topico === "subscription_authorized_payment" || topico === "authorized_payment") return /^\d{1,20}$/.test(id);
  if (topico === "preapproval" || topico === "subscription_preapproval") return /^[A-Za-z0-9]{1,64}$/.test(id);
  return false;
}

// ───────────────────────── datas (AAAA-MM-DD, relógio de São Paulo) ─────────────────────────

export function hojeSP(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** +N meses com o dia travado no fim do mês (31/01 + 1 mês = 28/02) — igual ao `date + interval 'N months'` do Postgres. */
export function somarMeses(data: string, meses: number): string {
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

function maior(...datas: Array<string | null | undefined>): string {
  return datas.filter((x): x is string => !!x).map((x) => x.slice(0, 10)).sort().pop() as string;
}

export interface ContaDatas {
  situacao: SituacaoConta;
  teste_ate: string | null;
  vence_em: string | null;
  tolerancia_dias: number | null;
  regra_pix?: "mes" | "30dias" | string | null;
}

/** A mesma régua do `situacao_da_conta_em` (SQL): pago e no prazo = ativa; no teste = teste; senão vencida. */
export function situacaoEm(c: ContaDatas, dia: string): SituacaoConta {
  if (c.situacao === "isenta" || c.situacao === "suspensa" || c.situacao === "cancelada") return c.situacao;
  if (c.vence_em && somarDias(c.vence_em, Math.max(0, c.tolerancia_dias ?? 0)) >= dia) return "ativa";
  if (c.teste_ate && c.teste_ate.slice(0, 10) >= dia) return "teste";
  return "vencida";
}

/** O que o pagamento aprovado faz (o `aplicar_pagamento_conta` do SQL): +N meses a partir do maior entre vencimento, fim do teste e hoje. */
export function vencimentoDepoisDoPagamento(c: ContaDatas, meses: number, hoje: string): { base: string; vence: string } {
  const base = maior(c.vence_em, c.teste_ate, hoje);
  const vence = c.regra_pix === "30dias" && meses === 1 ? somarDias(base, 30) : somarMeses(base, meses);
  return { base, vence };
}

/**
 * 1ª cobrança da assinatura no cartão: com cobertura (teste ou mês pago) que passa de hoje, fica pro último dia coberto
 * (regra do Nutri: "assinando no teste, a 1ª cobrança fica para o fim do teste"); senão cobra na hora (sem start_date).
 * Meio-dia de São Paulo, pra não cair no dia anterior em nenhum fuso (Nativo OS W30c).
 */
export function inicioDaAssinatura(c: Pick<ContaDatas, "teste_ate" | "vence_em">, hoje: string): string | null {
  const fim = maior(c.vence_em, c.teste_ate, hoje);
  return fim > hoje ? `${fim}T12:00:00.000-03:00` : null;
}

// ───────────────────────── mudar de plano (regra do Calc, mp-payments:972-996 — spec 6.2) ─────────────────────────

export type ErroMudanca = "mesmo_plano" | "alunos_acima_do_limite" | "plano_invalido";

/** Subir vale na hora; descer só se os alunos ativos couberem. O preço novo vale a partir do próximo pagamento. */
export function avaliarMudanca(p: {
  atual: { plano: string; faixa: string };
  novo: { plano: string; faixa: string };
  alunosAtivos: number;
  maxNovo: number | null;
  temPreco: boolean;
}): { ok: true } | { ok: false; erro: ErroMudanca } {
  if (!ehPlano(p.novo.plano) || !ehFaixa(p.novo.faixa) || !p.temPreco) return { ok: false, erro: "plano_invalido" };
  if (p.atual.plano === p.novo.plano && p.atual.faixa === p.novo.faixa) return { ok: false, erro: "mesmo_plano" };
  if (p.maxNovo !== null && p.alunosAtivos > p.maxNovo) return { ok: false, erro: "alunos_acima_do_limite" };
  return { ok: true };
}

/** Preço de um plano: o valor travado (preço especial do master) ou a tabela; anual = 10 mensalidades (o `conta_preco` do SQL). */
export function precoDoPlano(p: {
  valorTravado: number | null;
  tabela: { valor_mensal: number; valor_anual: number | null } | null;
  meses: number;
}): number | null {
  if (p.valorTravado !== null && p.valorTravado !== undefined) return Math.round(p.valorTravado * (p.meses === 12 ? 10 : 1) * 100) / 100;
  if (!p.tabela) return null;
  if (p.meses === 12) return p.tabela.valor_anual ?? Math.round(p.tabela.valor_mensal * 10 * 100) / 100;
  return p.tabela.valor_mensal;
}
