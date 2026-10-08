import type { User } from "@supabase/supabase-js";
import { supabase, DB_SCHEMA } from "@/integrations/supabase/client";

// Cliente das edge functions do SaaS do Banco do Treino (master → professores → alunos), 12/09/2026: JWT da sessão + x-schema do
// ambiente. W28: a cobrança antiga do Calc saiu (plano-*, receipt, master-financeiro, master-planos, professor-convites,
// vincular-professor e o mp-payments) — ficam o papel do JWT e a lista de alunos (admin-list-users). hml-08: a lista de professores
// da Biblioteca global (a função do master) mora na própria página (src/pages/master/BibliotecaPage.tsx), fora do bundle do app.

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

export async function invokeEdge<T = unknown>(fn: string, body: Record<string, unknown> = {}): Promise<T> {
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

export const listarAlunos = (payload: { limit?: number; offset?: number; q?: string; professorId?: string | null; semProfessor?: boolean } = {}) =>
  invokeEdge<ListaAlunos>("admin-list-users", payload);
