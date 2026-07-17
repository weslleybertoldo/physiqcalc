import { supabase, DB_SCHEMA } from "@/integrations/supabase/client";

// Em dev local as functions rodam fora do Supabase (deno run) — VITE_MP_FUNCTIONS_URL aponta pra elas.
const FN_BASE =
  (import.meta.env.VITE_MP_FUNCTIONS_URL as string | undefined) ||
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface MpPagamento {
  id: string;
  tipo: "pix" | "cartao" | "manual";
  /** método do pagamento manual registrado pelo admin (dinheiro, pix por fora, etc.) */
  metodo?: string | null;
  valor: number;
  mes_ref: string;
  status: string;
  pix_qr_code?: string | null;
  pix_qr_code_base64?: string | null;
  pix_expira_em?: string | null;
  mp_payment_id?: string | null;
  updated_at?: string;
  created_at: string;
}

export interface MpAssinatura {
  id: string;
  status: string;
  valor: number;
  created_at: string;
  proxima_cobranca?: string | null;
}

export interface MpStatus {
  mensalidade: number | null;
  /** nome do plano do aluno (physiq_profiles.plano_nome) */
  plano?: string | null;
  mesRef: string;
  mesLabel: string;
  /** cobertura rolling vigente (pagamento cobre 1 mês da data do pagamento) ou assinatura ativa */
  emDia: boolean;
  /** fim da cobertura do último pagamento aprovado (null = nunca pagou) */
  pagoAte: string | null;
  mesPago: boolean;
  assinatura: MpAssinatura | null;
  pagamentos: MpPagamento[];
}

// métodos aceitos no registro manual do admin (value gravado em physiq_pagamentos.metodo)
export const METODOS_MANUAIS: { value: string; label: string }[] = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "Pix (por fora)" },
  { value: "cartao", label: "Cartão (por fora)" },
  { value: "transferencia", label: "Transferência" },
  { value: "outro", label: "Outro" },
];

export function tipoPagamentoLabel(p: Pick<MpPagamento, "tipo" | "metodo">): string {
  if (p.tipo === "pix") return "Pix";
  if (p.tipo === "cartao") return "Cartão";
  const m = p.metodo ? (METODOS_MANUAIS.find((x) => x.value === p.metodo)?.label || p.metodo) : null;
  return m ? `Manual · ${m}` : "Manual";
}

export async function invokeMp<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) throw new Error("not_authenticated");
  const res = await fetch(`${FN_BASE}/mp-payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
      "x-schema": DB_SCHEMA,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `http_${res.status}`);
  return body as T;
}
