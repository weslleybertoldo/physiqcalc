/**
 * Travas de plano LEGADAS (W3, spec 6.3 e 11.3: "plano do Calc pelo status de hoje; plano do Nutri pela regra do
 * assinaturaUtil.ts") e o card do plano no menu (tela 6). Regras puras, testadas em planoLegado.test.ts.
 *   · conta 'legado_calc': o `plano-status` do Calc de hoje (tolerância de 7 dias, painel trava fora dela);
 *   · conta 'legado_nutri': a regra central do site antigo do Nutri — isento > cartão ativo > PIX pago > teste > trava
 *     ("Assinatura pendente", os dados ficam guardados) — porte fiel de src/lib/assinaturaUtil.ts do physiqnutri;
 *   · contas novas: a W4 (cobrança das contas) traz a trava delas.
 */
import type { PlanoCasca } from "@/ui/casca/dadosCasca";
import type { ContaSituacao, LegadoNutri } from "./situacao";

export const SITE_NUTRI = "https://nutri.physiqcalc.com.br";
export const ASSINATURA_NUTRI = `${SITE_NUTRI}/configuracoes`;

export type SituacaoNutri = "isento" | "ativa" | "pix" | "teste" | "pendente" | "pausada" | "cancelada" | "vencida";

export interface EstadoNutri {
  situacao: SituacaoNutri;
  bloqueado: boolean;
  testeAte: Date | null;
  pagoAte: Date | null;
  proximoVencimento: Date | null;
}

const data = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** A regra central do Nutri (situacaoAssinatura): isento (master/conta marcada) > ativa > pix > teste > bloqueado. */
export function situacaoNutri(l: LegadoNutri | null | undefined, agora: Date = new Date()): EstadoNutri {
  const testeAte = data(l?.teste_ate);
  const pagoAte = data(l?.pago_ate);
  const proximoVencimento = data(l?.assinatura?.proximo_vencimento);
  const base = { testeAte, pagoAte, proximoVencimento };
  if (!l) return { ...base, situacao: "teste", bloqueado: false }; // sem dado: não trava a pessoa (como o site antigo)
  if (l.role === "master" || l.isento_assinatura) return { ...base, situacao: "isento", bloqueado: false };
  if (l.assinatura?.status === "authorized") return { ...base, situacao: "ativa", bloqueado: false };
  if (pagoAte && pagoAte.getTime() > agora.getTime()) return { ...base, situacao: "pix", bloqueado: false };
  if (testeAte && testeAte.getTime() > agora.getTime()) return { ...base, situacao: "teste", bloqueado: false };
  const s = l.assinatura?.status;
  const situacao: SituacaoNutri = s === "pending" ? "pendente" : s === "paused" ? "pausada" : s === "cancelled" ? "cancelada" : "vencida";
  return { ...base, situacao, bloqueado: true };
}

export function dataCurta(d: Date | string | null | undefined): string {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00` : d) : d;
  if (Number.isNaN(x.getTime())) return "";
  return x.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Texto da trava do Nutri (o "Assinatura pendente" do site antigo, com o caminho para pagar lá até a W28). */
export function textoTravaNutri(e: EstadoNutri): string {
  if (e.situacao === "pendente") return "O pagamento da sua assinatura no Mercado Pago ainda não foi confirmado.";
  if (e.situacao === "pausada") return "Sua assinatura está pausada no Mercado Pago.";
  if (e.situacao === "cancelada") return "Sua assinatura foi cancelada.";
  if (e.pagoAte) return `Seu acesso pago por PIX venceu em ${dataCurta(e.pagoAte)}.`;
  return `Seu período de teste terminou${e.testeAte ? ` em ${dataCurta(e.testeAte)}` : ""}.`;
}

const NOME_PLANO: Record<string, string> = {
  treino: "Plano Treino",
  nutricao: "Plano Nutrição",
  treino_nutricao: "Plano Treino + Nutrição",
};

/** Card do plano de uma conta do Nutri (legado): a situação da assinatura de hoje. */
export function planoCartaoNutri(l: LegadoNutri | null | undefined, agora: Date = new Date()): PlanoCasca {
  const e = situacaoNutri(l, agora);
  const base = { nome: "Plano PhysiqNutri", modulos: ["nutricao"] as PlanoCasca["modulos"] };
  switch (e.situacao) {
    case "isento":
      return { ...base, linha: "Sem cobrança", tom: "ok" };
    case "ativa":
      return { ...base, linha: e.proximoVencimento ? `Renova em ${dataCurta(e.proximoVencimento)} · cartão` : "Assinatura ativa · cartão", tom: "ok" };
    case "pix":
      return { ...base, linha: `Pago até ${dataCurta(e.pagoAte)} · Pix`, tom: "ok" };
    case "teste":
      return { ...base, linha: e.testeAte ? `Teste até ${dataCurta(e.testeAte)}` : "Em teste", tom: "neutro" };
    default:
      return { ...base, linha: "Assinatura pendente", tom: "erro" };
  }
}

/** Card do plano de uma conta nova (até a W4 trazer a cobrança) ou isenta. */
export function planoCartaoConta(c: ContaSituacao, master = false): PlanoCasca {
  const base = { nome: master && c.situacao === "isenta" ? "Conta master" : NOME_PLANO[c.plano] ?? "Plano", modulos: c.modulos };
  switch (c.situacao) {
    case "isenta":
      return { ...base, linha: "Sem cobrança", tom: "ok" };
    case "teste":
      return { ...base, linha: c.teste_ate ? `Teste até ${dataCurta(c.teste_ate)}` : "Em teste", tom: "neutro" };
    case "ativa":
      return { ...base, linha: c.vence_em ? `Vence em ${dataCurta(c.vence_em)}` : "Conta ativa", tom: "ok" };
    case "vencida":
      return { ...base, linha: c.vence_em ? `Venceu em ${dataCurta(c.vence_em)}` : "Plano vencido", tom: "erro" };
    case "suspensa":
      return { ...base, linha: "Conta suspensa", tom: "erro" };
    default:
      return { ...base, linha: "Conta cancelada", tom: "erro" };
  }
}
