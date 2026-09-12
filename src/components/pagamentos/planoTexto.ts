import type { MpPagamento } from "@/lib/mpClient";
import { fmtBRL, fmtData, type PlanoProfessor, type PlanoStatus } from "@/lib/saasApi";

// Textos, classes e regras de exibição da aba Planos do PROFESSOR (cobrança pós-paga ao master).
// Tudo que é "linguagem simples" da situação do plano mora aqui, testável sem React.

// ───────────────────────────── classes (design existente) ─────────────────────────────
export const BTN_PRIMARIO = "bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const BTN_SECUNDARIO = "border border-primary/40 text-primary font-heading text-xs uppercase tracking-wider px-4 py-2 hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const BTN_PERIGO = "border border-destructive/40 text-destructive font-heading text-xs uppercase tracking-wider px-4 py-2 hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const BTN_LINK = "text-xs font-heading uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50";
const BADGE = "text-xs font-heading uppercase px-2 py-0.5 rounded-full whitespace-nowrap";
export const BADGE_OK = `${BADGE} bg-primary/15 text-primary`;
export const BADGE_RUIM = `${BADGE} bg-destructive/15 text-destructive`;
export const BADGE_NEUTRO = `${BADGE} bg-muted text-muted-foreground`;
export const BADGE_ALERTA = `${BADGE} bg-classify-yellow/20 text-classify-yellow`;
export const CARD = "result-card border-muted-foreground/20 p-4 sm:p-5 space-y-3";
export const TITULO_CARD = "font-heading text-sm text-foreground uppercase tracking-wider";
export const ROTULO = "text-[10px] uppercase tracking-wider text-muted-foreground font-heading";

// ───────────────────────────── rótulos ─────────────────────────────
export const PAGAMENTO_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente", in_process: "Em análise", approved: "Pago", rejected: "Recusado", cancelled: "Cancelado",
  expired: "Expirado", refunded: "Reembolsado", charged_back: "Estornado", aguardando_confirmacao: "Aguardando confirmação",
};
export const TIPO_COBRANCA_LABEL: Record<string, string> = { adesao: "Adesão", mensal: "Mensalidade", anual: "Plano anual" };
export const ASSINATURA_LABEL: Record<string, string> = { pending: "Pendente", authorized: "Ativa", paused: "Pausada", cancelled: "Cancelada" };

export const statusPagamentoCls = (s: string) =>
  s === "approved" ? "text-primary" : ["pending", "in_process", "aguardando_confirmacao"].includes(s) ? "text-muted-foreground" : "text-destructive";

/** "até 20 alunos" · "de 21 a 50 alunos" · "a partir de 51 alunos" · "alunos ilimitados" */
export function faixaAlunos(p: Pick<PlanoProfessor, "min_alunos" | "max_alunos"> | null | undefined): string {
  if (!p) return "";
  const min = Number(p.min_alunos ?? 0);
  if (p.max_alunos === null || p.max_alunos === undefined) return min > 1 ? `a partir de ${min} alunos` : "alunos ilimitados";
  const max = Number(p.max_alunos);
  if (min <= 1) return `até ${max} ${max === 1 ? "aluno" : "alunos"}`;
  return `de ${min} a ${max} alunos`;
}

// ───────────────────────────── datas (yyyy-mm-dd, sem fuso) ─────────────────────────────
export function addDias(d: string, n: number): string {
  const x = new Date(`${d.slice(0, 10)}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export function fmtRestante(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

// ───────────────────────────── valores ─────────────────────────────
const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** mensalidade vigente: valor travado no ciclo (ciclo_valor) ou o do plano */
export function valorMensalDe(s: PlanoStatus): number | null {
  return num(s.professor.ciclo_valor) ?? num(s.plano?.valor_mensal);
}

/** anual = valor_anual do plano ou 10 mensalidades (mesma regra da edge) */
export function valorAnualDe(s: PlanoStatus): number | null {
  if (!s.plano) return null;
  const va = num(s.plano.valor_anual);
  if (va !== null) return va;
  const vm = num(s.plano.valor_mensal);
  return vm === null ? null : vm * 10;
}

/** o ciclo só pode ser pago a partir de 3 dias antes do vencimento (edge: `ainda_no_ciclo`) */
export function liberaPagarCicloEm(s: PlanoStatus): string | null {
  return s.professor.ciclo_vence_em ? addDias(s.professor.ciclo_vence_em, -3) : null;
}
export function podePagarCiclo(s: PlanoStatus): boolean {
  const libera = liberaPagarCicloEm(s);
  return !!libera && s.hoje >= libera;
}

// ───────────────────────────── Pix pendente ─────────────────────────────
/** SÓ staging: sandbox do MP caiu → a edge grava um Pix sem QR real (a resposta não traz `simulado`, então olhamos a linha) */
export function ehPixSimulado(p: Pick<MpPagamento, "pix_qr_code" | "metodo" | "mp_payment_id"> | null | undefined): boolean {
  return !!p && (p.pix_qr_code === "SIMULADO-SANDBOX-MP-INDISPONIVEL" || p.metodo === "simulado" || String(p.mp_payment_id || "").startsWith("sim-"));
}

/** Pix pendente e ainda válido de um tipo de cobrança (pra reabrir o QR depois de um reload) */
export function pixAberto(pagamentos: MpPagamento[] | null | undefined, tipoCobranca: "adesao" | "mensal" | "anual", agora = Date.now()): MpPagamento | null {
  return (pagamentos || []).find((p) =>
    p.tipo === "pix" && p.status === "pending" && (p.tipo_cobranca ?? "mensal") === tipoCobranca && !!p.pix_qr_code
    && (ehPixSimulado(p) || !p.pix_expira_em || new Date(p.pix_expira_em).getTime() > agora),
  ) ?? null;
}

// ───────────────────────────── situação em linguagem simples ─────────────────────────────
export interface SituacaoPlano {
  badge: string;
  cls: string;
  titulo: string;
  detalhe?: string;
}

export function situacaoPlano(s: PlanoStatus): SituacaoPlano {
  const p = s.professor;
  const hoje = s.hoje;
  const valor = valorMensalDe(s);
  const vStr = valor !== null ? ` de ${fmtBRL(valor)}` : "";

  if (s.isento) return { badge: "Master", cls: BADGE_OK, titulo: "Conta master — sem cobrança." };
  if (p.status === "suspenso") {
    return { badge: "Suspenso", cls: BADGE_RUIM, titulo: "Conta suspensa pelo administrador.", detalhe: "Fale com ele para reativar." };
  }
  if (p.cobranca_pausada) {
    return {
      badge: "Cobrança pausada", cls: BADGE_NEUTRO, titulo: "Cobrança pausada pelo administrador — nada a pagar por enquanto.",
      detalhe: p.ciclo_inicio && p.ciclo_vence_em ? `Último ciclo: ${fmtData(p.ciclo_inicio)} → ${fmtData(p.ciclo_vence_em)}.` : undefined,
    };
  }
  if (p.acesso_liberado_ate && p.acesso_liberado_ate >= hoje) {
    return {
      badge: "Liberado", cls: BADGE_OK, titulo: `Acesso liberado pelo administrador até ${fmtData(p.acesso_liberado_ate)}.`,
      detalhe: p.ciclo_vence_em && p.ciclo_vence_em < hoje ? `Sua mensalidade${vStr} venceu em ${fmtData(p.ciclo_vence_em)} — regularize quando puder.` : undefined,
    };
  }
  if (p.anual_ate && p.anual_ate >= hoje) {
    return { badge: "Anual", cls: BADGE_OK, titulo: `Plano anual ativo até ${fmtData(p.anual_ate)}.`, detalhe: "Nada a pagar até lá." };
  }
  if (s.travado) {
    if (!p.adesao_paga_em) {
      return {
        badge: "Travado", cls: BADGE_RUIM,
        titulo: p.trial_ate ? `Seu teste grátis terminou em ${fmtData(p.trial_ate)}.` : "Sua conta ainda não foi ativada.",
        detalhe: `Pague a adesão de ${fmtBRL(s.adesao)} para voltar ao painel.`,
      };
    }
    return {
      badge: "Travado", cls: BADGE_RUIM,
      titulo: `TRAVADO — sua mensalidade${vStr} venceu em ${fmtData(p.ciclo_vence_em)} e passou dos ${s.tolerancia} dias de tolerância.`,
      detalhe: "Pague o ciclo para voltar ao painel. Seus alunos continuam treinando.",
    };
  }
  if (p.adesao_paga_em && p.ciclo_vence_em && s.diasAtraso !== null && s.diasAtraso >= 0) {
    const limite = addDias(p.ciclo_vence_em, s.tolerancia);
    const quando = s.diasAtraso === 0 ? `vence hoje (${fmtData(p.ciclo_vence_em)})` : `venceu há ${s.diasAtraso} ${s.diasAtraso === 1 ? "dia" : "dias"} (${fmtData(p.ciclo_vence_em)})`;
    return { badge: "Vencido", cls: BADGE_ALERTA, titulo: `Sua mensalidade${vStr} ${quando} — pague até ${fmtData(limite)} para não perder o acesso.` };
  }
  if (!p.adesao_paga_em) {
    if (p.trial_ate && p.trial_ate >= hoje) {
      return {
        badge: "Teste grátis", cls: BADGE_NEUTRO, titulo: `Teste grátis até ${fmtData(p.trial_ate)}.`,
        detalhe: `Ative sua conta (adesão de ${fmtBRL(s.adesao)}) para continuar depois dessa data.`,
      };
    }
    return { badge: "Sem adesão", cls: BADGE_NEUTRO, titulo: "Sua conta ainda não foi ativada.", detalhe: `Pague a adesão de ${fmtBRL(s.adesao)} para começar.` };
  }
  if (p.ciclo_vence_em) {
    const proximo = valor !== null ? `Próximo pagamento em ${fmtData(p.ciclo_vence_em)} de ${fmtBRL(valor)}.` : `Próximo pagamento em ${fmtData(p.ciclo_vence_em)}.`;
    return { badge: "Em dia", cls: BADGE_OK, titulo: `Conta ativa · ciclo ${fmtData(p.ciclo_inicio)} → ${fmtData(p.ciclo_vence_em)}.`, detalhe: proximo };
  }
  return { badge: "Ativa", cls: BADGE_OK, titulo: "Conta ativa." };
}

// ───────────────────────────── erros da edge → mensagem ─────────────────────────────
/** código do erro lançado pelo invokeMp/EdgeError (message = código), sem `any` nos catch */
export const codigoErro = (e: unknown): string | undefined =>
  e instanceof Error ? e.message : typeof e === "string" ? e : undefined;

export function mensagemErroPlano(
  code: string | undefined,
  ctx: { venceEm?: string | null } = {},
  fallback = "Não foi possível concluir. Tente de novo.",
): string {
  switch (code) {
    case "ja_ativado": return "Sua conta já está ativada.";
    case "sem_plano": return "Você ainda não tem um plano definido. Fale com o administrador.";
    case "master_isento": return "Conta master não paga plano.";
    case "nao_professor": return "Sua conta não está cadastrada como professor.";
    case "ative_primeiro": return "Pague a adesão primeiro para ativar sua conta.";
    case "ainda_no_ciclo": return `O pagamento do ciclo libera 3 dias antes do vencimento${ctx.venceEm ? ` (${fmtData(ctx.venceEm)})` : ""}.`;
    case "assinatura_ja_ativa": return "Você já tem uma assinatura ativa.";
    case "assinatura_sem_sandbox": return "Assinatura não funciona em ambiente de teste — use Pix ou cartão avulso. Em produção funciona normalmente.";
    case "sem_assinatura": return "Nenhuma assinatura ativa para cancelar.";
    case "missing_card_token": return "Dados do cartão incompletos. Tente de novo.";
    case "missing_planoId":
    case "plano_invalido": return "Esse plano não está disponível.";
    case "mesmo_plano": return "Você já está nesse plano.";
    case "alunos_acima_do_limite": return "Seu número de alunos não cabe nesse plano.";
    case "so_staging": return "A simulação só funciona no ambiente de teste.";
    case "not_found": return "Pagamento não encontrado.";
    case "mp_error": return "O Mercado Pago não respondeu. Tente de novo em instantes.";
    case "mp_not_configured": return "Pagamentos indisponíveis no momento (Mercado Pago não configurado).";
    case "rate_limited": return "Muitas tentativas — aguarde um minuto.";
    case "not_authenticated": return "Sua sessão expirou. Entre de novo.";
    default: return fallback;
  }
}
