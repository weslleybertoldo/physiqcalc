// supabase-principal/functions/_shared/planos-automatica.ts
// Physiq W-P (§7 I1) — o valor da cobrança automática no cartão (assinatura do MP) acompanha o "valor do próximo pagamento": o PUT
// /preapproval do aluno_app_plano (W7b), agora para toda troca de plano, modalidade ou valor. Sem Deno e sem rede: o PUT entra por
// parâmetro (a pagamentos-aluno passa o mpFetch; o Vitest, um falso). Quem chama grava o espelho e avisa o dono quando falha.

export type ResultadoValor = "sem_automatica" | "igual" | "atualizada" | "falhou";

export interface AssinaturaParaValor {
  mp_preapproval_id: string | null;
  status: string;
  valor: number | null;
  payload: Record<string, unknown> | null;
}

export type PutAssinatura = (id: string, corpo: { auto_recurring: { transaction_amount: number; currency_id: "BRL" } }) =>
  Promise<{ status: number; body: { id?: unknown } | null }>;

export async function novoValorDaAutomatica(a: AssinaturaParaValor | null, valor: number, put: PutAssinatura): Promise<ResultadoValor> {
  if (!a || a.status !== "authorized" || !a.mp_preapproval_id || a.mp_preapproval_id.startsWith("sim-") || a.payload?.simulada === true) return "sem_automatica";
  if (!(valor > 0)) return "sem_automatica";
  if (Number(a.valor) === valor) return "igual";
  try {
    const r = await put(a.mp_preapproval_id, { auto_recurring: { transaction_amount: valor, currency_id: "BRL" } });
    return r.status < 300 && r.body?.id ? "atualizada" : "falhou";
  } catch {
    return "falhou";
  }
}
