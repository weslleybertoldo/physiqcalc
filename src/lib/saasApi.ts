import type { User } from "@supabase/supabase-js";
import { supabase, DB_SCHEMA } from "@/integrations/supabase/client";

// Cliente das edge functions do SaaS (master → professores → alunos), 12/09/2026.
// Mesmo transporte do invokeMp (mpClient.ts): JWT da sessão + x-schema do ambiente.

const FN_BASE =
  (import.meta.env.VITE_MP_FUNCTIONS_URL as string | undefined) ||
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export type Papel = "master" | "professor" | "aluno";

/** Papel derivado do claim app_metadata.role do JWT (admin|master → master). */
export function papelDoUser(user: Pick<User, "app_metadata"> | null | undefined): Papel {
  const role = (user?.app_metadata as { role?: string } | undefined)?.role;
  if (role === "admin" || role === "master") return "master";
  if (role === "professor") return "professor";
  return "aluno";
}

export class EdgeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function invokeEdge<T = any>(fn: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) throw new EdgeError("not_authenticated", 401);
  const res = await fetch(`${FN_BASE}/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
      "x-schema": DB_SCHEMA,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new EdgeError(json?.error || `http_${res.status}`, res.status);
  return json as T;
}

// ─────────────────────────── tipos das respostas ───────────────────────────

export interface PlanoProfessor {
  id: string;
  nome: string;
  min_alunos: number;
  max_alunos: number | null;
  valor_mensal: number | string;
  valor_anual: number | string | null;
  ordem?: number;
  ativo: boolean;
  professores?: number;
  valor_anual_efetivo?: number;
}

export interface ProfessorRow {
  id: string;
  nome: string;
  email: string | null;
  foto_url?: string | null;
  status: "ativo" | "suspenso";
  codigo_convite: string;
  plano_id: string | null;
  plano: { id: string; nome: string; valor_mensal: number | string; valor_anual?: number | string | null; max_alunos: number | null } | null;
  trial_ate: string | null;
  adesao_paga_em: string | null;
  ciclo_inicio: string | null;
  ciclo_vence_em: string | null;
  ciclo_valor: number | string | null;
  anual_ate: string | null;
  cobranca_pausada: boolean;
  acesso_liberado_ate: string | null;
  alunos_bloqueados_em: string | null;
  alunos_bloqueados_msg: string | null;
  created_at: string;
  alunos: number;
  integracao: "mercadopago" | "pix_manual" | "none";
  acessoOk: boolean;
  ehMaster: boolean;
}

export interface FinanceiroLinha {
  id: string;
  nome: string;
  email: string | null;
  status: string;
  codigo: string;
  plano: { id: string; nome: string; valorMensal: number; valorAnual: number | string | null; maxAlunos: number | null } | null;
  cicloInicio: string | null;
  cicloVenceEm: string | null;
  cicloValor: number | string | null;
  anualAte: string | null;
  trialAte: string | null;
  adesaoPagaEm: string | null;
  cobrancaPausada: boolean;
  acessoLiberadoAte: string | null;
  alunosBloqueadosEm: string | null;
  alunosBloqueadosMsg: string | null;
  alunos: number;
  assinatura: string | null;
  acessoOk: boolean;
  diasAtraso: number | null;
  situacao: "suspenso" | "cobranca_pausada" | "liberado" | "anual" | "trial" | "sem_adesao" | "travado" | "em_tolerancia" | "em_dia";
  recorrente: boolean;
}

export interface AvisoPlano {
  id: number;
  ciclo_vence_em: string;
  dia: number;
  canal: string;
  mensagem: string | null;
  enviado_em: string;
}

export interface PlanoStatus {
  isento: boolean;
  professor: {
    id: string; nome: string; email: string | null; status: string; codigo_convite: string; plano_id: string | null;
    trial_ate: string | null; adesao_paga_em: string | null; ciclo_inicio: string | null; ciclo_vence_em: string | null;
    ciclo_valor: number | string | null; anual_ate: string | null; cobranca_pausada: boolean; acesso_liberado_ate: string | null;
    alunos_bloqueados_em: string | null; alunos: number; adesao: number; tolerancia: number; trial_dias: number;
  };
  plano: PlanoProfessor | null;
  planos: PlanoProfessor[];
  adesao: number;
  tolerancia: number;
  trialDias: number;
  acessoOk: boolean;
  travado: boolean;
  diasAtraso: number | null;
  pagamentos: any[];
  assinatura: { id: string; status: string; valor: number; created_at: string; proxima_cobranca?: string | null } | null;
  avisos: AvisoPlano[];
  hoje: string;
}

export interface AlunoRow {
  id: string;
  nome: string | null;
  email: string | null;
  user_code: number | null;
  status: string | null;
  plano_nome: string | null;
  created_at: string | null;
  professor_id?: string | null;
  mensalidade_valor?: number | null;
  foto_url?: string | null;
}

export interface ListaAlunos {
  users: AlunoRow[];
  total: number;
  limit: number;
  offset: number;
}

// ─────────────────────────── atalhos por edge ───────────────────────────

export const masterProfessores = <T = any>(action: string, payload: Record<string, unknown> = {}) =>
  invokeEdge<T>("master-professores", { action, ...payload });
export const masterFinanceiro = <T = any>(action: string, payload: Record<string, unknown> = {}) =>
  invokeEdge<T>("master-financeiro", { action, ...payload });
export const masterPlanos = <T = any>(action: string, payload: Record<string, unknown> = {}) =>
  invokeEdge<T>("master-planos", { action, ...payload });
export const professorConvites = <T = any>(action: string, payload: Record<string, unknown> = {}) =>
  invokeEdge<T>("professor-convites", { action, ...payload });
export const listarAlunos = (payload: { limit?: number; offset?: number; q?: string; professorId?: string | null; semProfessor?: boolean } = {}) =>
  invokeEdge<ListaAlunos>("admin-list-users", payload);

/** Vincula quem acabou de entrar (código do link / convite por e-mail). Idempotente. */
export const vincularProfessor = (codigo: string | null) =>
  invokeEdge<{ papel: Papel; vinculado?: boolean; motivo?: string; professor?: string | null; codigo?: string; refresh?: boolean }>(
    "vincular-professor", { codigo },
  );

// ─────────────────────────── formatação ───────────────────────────

export function fmtBRL(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "Studio - R$ 79,90" (valor ao lado do nome, decisão 15) */
export function planoComValor(p: { nome: string; valor_mensal?: number | string; valorMensal?: number } | null | undefined): string {
  if (!p) return "Sem plano";
  const v = p.valorMensal ?? p.valor_mensal;
  return v === undefined || v === null ? p.nome : `${p.nome} - ${fmtBRL(v)}`;
}

/** Link público de convite do professor — sempre o SITE do ambiente (no APK, window.location.origin é https://localhost). */
export function linkConviteProfessor(codigo: string): string {
  const base = DB_SCHEMA === "staging" ? "https://physiqcalc-staging.vercel.app" : "https://physiqcalc.vercel.app";
  return `${base}/?prof=${encodeURIComponent(codigo)}`;
}

/** yyyy-mm-dd → dd/mm/aaaa (sem fuso) */
export function fmtData(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${dd}/${m}/${y}`;
}

export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export const SITUACAO_LABEL: Record<FinanceiroLinha["situacao"], { label: string; cls: string }> = {
  em_dia: { label: "Em dia", cls: "bg-primary/15 text-primary" },
  anual: { label: "Anual", cls: "bg-primary/15 text-primary" },
  trial: { label: "Teste grátis", cls: "bg-muted text-muted-foreground" },
  sem_adesao: { label: "Sem adesão", cls: "bg-muted text-muted-foreground" },
  em_tolerancia: { label: "Vencido (tolerância)", cls: "bg-classify-yellow/20 text-classify-yellow" },
  travado: { label: "Travado", cls: "bg-destructive/15 text-destructive" },
  liberado: { label: "Liberado pelo master", cls: "bg-primary/10 text-primary" },
  cobranca_pausada: { label: "Cobrança pausada", cls: "bg-muted text-muted-foreground" },
  suspenso: { label: "Suspenso", cls: "bg-destructive/15 text-destructive" },
};
