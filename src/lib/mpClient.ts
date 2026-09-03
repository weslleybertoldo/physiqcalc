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

// ───────────────────────────── status leve (abertura do app) ─────────────────────────────
// A abertura só precisa saber "tem mensalidade e está em dia?" pro badge "!" e pro aviso de
// pendência. Isso vem do action `status-lite` (só banco, sem Mercado Pago) e fica em cache
// local por 6 h — a aba Pagamentos continua usando o `status` completo e espelha aqui.

/** Resposta enxuta do `status-lite`. */
export interface MpStatusLeve {
  mensalidade: number | null;
  emDia: boolean;
  pagoAte: string | null;
  mesRef: string;
  mesLabel: string;
}

export const STATUS_CACHE_KEY = "physiq_mp_status_cache";
export const STATUS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h

interface StatusCache {
  userId: string;
  em: number;
  status: MpStatusLeve;
}

/** Cache válido (mesmo usuário, dentro do TTL) ou null. */
export function lerStatusCache(userId: string, agora = Date.now()): MpStatusLeve | null {
  try {
    const raw = localStorage.getItem(STATUS_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<StatusCache>;
    if (!c || c.userId !== userId || typeof c.em !== "number" || !c.status) return null;
    if (agora < c.em || agora - c.em > STATUS_CACHE_TTL_MS) return null;
    return c.status;
  } catch {
    return null;
  }
}

/** Grava o status (leve ou completo — só os campos leves ficam). */
export function gravarStatusCache(userId: string, s: MpStatusLeve | MpStatus, agora = Date.now()): void {
  const status: MpStatusLeve = {
    mensalidade: s.mensalidade ?? null,
    emDia: Boolean(s.emDia),
    pagoAte: s.pagoAte ?? null,
    mesRef: s.mesRef,
    mesLabel: s.mesLabel,
  };
  try {
    const c: StatusCache = { userId, em: agora, status };
    localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(c));
  } catch {
    /* storage cheio/indisponível: segue sem cache */
  }
}

export function invalidarStatusCache(): void {
  try {
    localStorage.removeItem(STATUS_CACHE_KEY);
  } catch {
    /* ignora */
  }
}

/** Tem mensalidade configurada e a cobertura não está vigente. */
export function mensalidadePendente(s: Pick<MpStatusLeve, "mensalidade" | "emDia"> | null | undefined): boolean {
  return !!s && Boolean(s.mensalidade) && !s.emDia;
}

// 1 chamada em voo por vez: header e aviso pedem ao mesmo tempo → 1 requisição só
let statusLeveEmVoo: Promise<MpStatusLeve> | null = null;

/** Status leve com cache (6 h). `forcar` ignora o cache. */
export async function statusLeve(userId: string, opts: { forcar?: boolean } = {}): Promise<MpStatusLeve> {
  if (!opts.forcar) {
    const emCache = lerStatusCache(userId);
    if (emCache) return emCache;
  }
  if (!statusLeveEmVoo) {
    statusLeveEmVoo = invokeMp<MpStatusLeve>("status-lite")
      .then((s) => {
        gravarStatusCache(userId, s);
        return s;
      })
      .finally(() => {
        statusLeveEmVoo = null;
      });
  }
  return statusLeveEmVoo;
}
