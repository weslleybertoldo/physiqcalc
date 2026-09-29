// Configurações › Plano (W4): as chamadas à função cobranca-conta do banco principal (Mercado Pago da conta — spec 6.6).
import { principal } from "@/integrations/principal/client";
import type { Faixa, LinhaPreco, PlanoConta, SituacaoConta } from "@/nucleo/cobranca/regras";

export interface FaturaConta {
  id: string;
  conta_id: string;
  tipo: string;
  valor: number;
  status: string;
  forma: "pix" | "cartao" | "manual" | null;
  mp_payment_id: string | null;
  pix_qr: string | null;
  pix_copia_cola: string | null;
  pix_expira_em: string | null;
  pago_em: string | null;
  plano: PlanoConta | null;
  faixa: Faixa | null;
  meses: number | null;
  cobre_de: string | null;
  cobre_ate: string | null;
  descricao: string | null;
  criado_em: string;
}

export interface AssinaturaContaApi {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled";
  valor: number | null;
  plano: PlanoConta | null;
  faixa: Faixa | null;
  proximo_vencimento: string | null;
  ultimo_pagamento_em: string | null;
  sandbox: boolean;
  simulada: boolean;
  init_point: string | null;
}

export interface ContaCobranca {
  id: string;
  nome: string;
  origem: string;
  plano: PlanoConta;
  faixa: Faixa;
  periodicidade: string;
  situacao: SituacaoConta;
  teste_ate: string | null;
  vence_em: string | null;
  tolerancia_dias: number;
  valor_travado: number | null;
  regra_pix: string;
  isenta_motivo: string | null;
  efetiva: SituacaoConta;
}

export interface StatusCobranca {
  ok: true;
  ambiente: "public" | "staging";
  simulacao: boolean;
  hoje: string;
  conta: ContaCobranca;
  alunos_ativos: number;
  limite_alunos: number | null;
  precos: LinhaPreco[];
  valor_mensal: number | null;
  valor_anual: number | null;
  faturas: FaturaConta[];
  pix_aberto: FaturaConta | null;
  assinatura: AssinaturaContaApi | null;
}

export class ErroCobranca extends Error {
  constructor(public codigo: string, public extra: Record<string, unknown> = {}) {
    super(codigo);
  }
}

async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** Chama uma ação da cobranca-conta; erro vira ErroCobranca com o código da função (a tela traduz). */
export async function acaoCobranca<T = Record<string, unknown>>(acao: string, corpo: Record<string, unknown> = {}): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ErroCobranca("sem_internet");
  const { data, error } = await principal.functions.invoke("cobranca-conta", { body: { acao, ...corpo } });
  if (error) {
    const c = await corpoDoErro(error);
    throw new ErroCobranca(String(c?.erro ?? "erro_interno"), c ?? {});
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok === false) throw new ErroCobranca(String(d.erro ?? "erro_interno"), d);
  return d as T;
}

export const buscarStatusCobranca = (contaId: string) => acaoCobranca<StatusCobranca>("status", { conta_id: contaId });
